// API client. Talks to the FastAPI backend; if it is unreachable the same
// tree model runs in the browser ("edge mode"), so the demo never breaks.

const BASE = import.meta.env.VITE_API_BASE || '';
let edge = null;      // lazily loaded browser engine
let mode = 'cloud';   // 'cloud' | 'edge'
const listeners = new Set();

export const onMode = (fn) => { listeners.add(fn); fn(mode); };
const setMode = (m) => { if (m !== mode) { mode = m; listeners.forEach((f) => f(m)); } };

async function req(path, opts = {}, timeout = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(BASE + path, { ...opts, signal: ctl.signal, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    if (r.status === 422) {
      const body = await r.json();
      const err = new Error('validation'); err.detail = body.detail; throw err;
    }
    if (!r.ok) throw new Error('http ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}

async function withFallback(path, opts, local) {
  if (mode === 'cloud') {
    try { return await req(path, opts); }
    catch (e) { if (e.message === 'validation') throw e; setMode('edge'); }
  }
  const eng = await loadEdge();
  return local(eng);
}

export async function health() {
  try { const h = await req('/api/health', {}, 6000); setMode('cloud'); return h; }
  catch { setMode('edge'); await loadEdge(); return { status: 'edge' }; }
}

export const predict = (tx) => withFallback('/api/predict', { method: 'POST', body: JSON.stringify(tx) }, (e) => e.score(tx));

export const predictBatch = (txs) => withFallback('/api/predict/batch?explain=true', { method: 'POST', body: JSON.stringify({ transactions: txs }) },
  (e) => {
    const results = txs.map((t) => e.score(t));
    return {
      count: results.length,
      blocked: results.filter((r) => r.decision === 'block').length,
      review: results.filter((r) => r.decision === 'review').length,
      amount_blocked: txs.reduce((s, t, i) => s + (results[i].decision === 'block' ? +t.amount : 0), 0),
      results,
    };
  });

export const feed = (n) => withFallback(`/api/feed?n=${n}`, {}, (e) => ({ items: e.feed(n) }));

let metricsCache = null;
export async function modelInfo() {
  if (metricsCache) return metricsCache;
  try { metricsCache = (await req('/api/model', {}, 8000)).metrics; }
  catch { metricsCache = await (await fetch('/model/metrics.json')).json(); }
  return metricsCache;
}

export const getMode = () => mode;

async function loadEdge() {
  if (!edge) edge = (async () => {
    const [model, metrics] = await Promise.all([
      fetch('/model/model.json').then((r) => r.json()),
      fetch('/model/metrics.json').then((r) => r.json()),
    ]);
    return makeEngine(model, metrics);
  })();
  return edge;
}

// ---------- browser engine (mirror of api/engine.py + reasons.py) ----------
const CAT_LABEL = { grocery: 'Grocery store', fuel: 'Fuel station', restaurants: 'Restaurant', fashion: 'Fashion store', electronics: 'Electronics store', travel: 'Travel booking', online_services: 'Online service', jewelry: 'Jewellery store', gaming_crypto: 'Gaming / crypto site' };
const CH_LABEL = { chip_in_store: 'Chip card in store', contactless: 'Contactless tap', online: 'Online (card not present)', atm: 'ATM withdrawal' };
const ICONS = { amount: 'cash', amount_to_avg_ratio: 'trending-up', hour: 'moon', merchant_category: 'building-store', channel: 'world-www', distance_from_home_km: 'map-pin', country_mismatch: 'flag', new_device: 'device-mobile', txn_count_24h: 'repeat', account_age_days: 'user', failed_attempts_1h: 'lock-x' };
const money = (v) => (v >= 10 ? '$' + Math.round(v).toLocaleString('en-US') : '$' + v.toFixed(2));
const hr = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

function describe(f, v, up, ctx) {
  switch (f) {
    case 'amount': return [`${money(v)} payment`, up ? 'A large amount for this kind of purchase.' : 'The amount is normal for this kind of purchase.'];
    case 'amount_to_avg_ratio': return [`${v < 10 ? v.toFixed(1) : Math.round(v)}× the usual spend`, up ? `This customer normally spends about ${money(ctx.customer_avg_amount)}.` : 'Close to what this customer usually spends.'];
    case 'hour': return [`At ${hr(v)}`, up && v < 6 ? 'Late-night payments are a common fraud window.' : up ? 'Payments at this hour are less typical for genuine buyers.' : 'A normal time of day for shopping.'];
    case 'merchant_category': return [CAT_LABEL[ctx.merchant_category], up ? 'Fraudsters prefer goods that are easy to resell or cash out.' : 'Low-risk type of merchant.'];
    case 'channel': return [CH_LABEL[ctx.channel], up ? 'This payment method is easier to abuse with stolen card details.' : 'A payment method that is harder to fake.'];
    case 'distance_from_home_km': return [`${Math.round(v).toLocaleString('en-US')} km from home`, up ? 'Far away from where this card is normally used.' : 'Close to where this card is normally used.'];
    case 'country_mismatch': return [v ? 'Different country' : 'Home country', up && v ? 'The card is being used outside its home country.' : !v ? 'Card used in its home country.' : 'Foreign use, but in a pattern that looks genuine.'];
    case 'new_device': return [v ? 'New device' : 'Known device', v ? 'First time this account is used from this phone or computer.' : 'The customer has used this device before.'];
    case 'txn_count_24h': return [`${v} payments in 24h`, up ? 'Rapid repeated payments, a sign of a bot testing stolen cards.' : 'Normal number of payments today.'];
    case 'account_age_days': { const age = v < 365 ? `${v} days` : `${Math.floor(v / 365)} year${v >= 730 ? 's' : ''}`; return [`Account age ${age}`, up ? 'Brand-new accounts are often opened just to commit fraud.' : 'A long-standing, trusted account.']; }
    case 'failed_attempts_1h': return [v ? `${v} failed attempts` : 'No failed attempts', v ? 'Wrong PIN or CVV entered just before, as if someone is guessing.' : 'No wrong PIN or CVV attempts before this payment.'];
    default: return [f, ''];
  }
}

function makeEngine(model, metrics) {
  const { features, categories, channels, trees } = model;
  const th = metrics.threshold;
  const logit = (p) => Math.log(p / (1 - p));
  const riskScore = (p) => { p = Math.min(Math.max(p, 1e-6), 1 - 1e-6); return Math.round(100 / (1 + Math.exp(-(logit(p) - logit(th)) * 1.15))); };

  function score(t) {
    const t0 = performance.now();
    const x = [+t.amount, +t.hour, categories.indexOf(t.merchant_category), channels.indexOf(t.channel), +t.distance_km, t.country_mismatch ? 1 : 0, t.new_device ? 1 : 0, +t.txn_count_24h, t.amount / t.customer_avg_amount, +t.account_age_days, +t.failed_attempts_1h];
    const contrib = new Array(features.length).fill(0);
    let raw = 0;
    for (const nodes of trees) {
      let node = nodes[0];
      while (node[0] !== -1) {
        const child = nodes[x[node[0]] <= node[1] ? node[2] : node[3]];
        contrib[node[0]] += child[4] - node[4];
        node = child;
      }
      raw += node[4];
    }
    const p = 1 / (1 + Math.exp(-raw));
    const s = riskScore(p);
    const items = features.map((f, i) => [f, x[i], contrib[i]]).sort((a, b) => Math.abs(b[2]) - Math.abs(a[2]));
    const total = contrib.reduce((a, c) => a + Math.abs(c), 0) || 1;
    const pick = [...items.filter((i) => i[2] > 0.05).slice(0, 4), ...items.filter((i) => i[2] < -0.05).slice(0, 2)];
    const reasons = pick.map(([f, v, c]) => {
      const [title, detail] = describe(f, f === 'amount_to_avg_ratio' || f === 'amount' || f === 'distance_from_home_km' ? v : Math.round(v), c > 0, t);
      return { feature: f, title, detail, icon: ICONS[f], direction: c > 0 ? 'raises' : 'lowers', impact: c, share: Math.abs(c) / total };
    });
    return { id: t.id ?? null, risk_score: s, probability: p, decision: s >= 50 ? 'block' : s >= 35 ? 'review' : 'approve', threshold: th, reasons, latency_ms: +(performance.now() - t0).toFixed(3) };
  }

  const M = { grocery: ['FreshMart', 'GreenBasket', 'DailyNeeds'], fuel: ['PetroLine', 'FuelUp', 'RoadStar'], restaurants: ['Spice Route', 'Cafe Lumen', 'Urban Grill'], fashion: ['Threadline', 'Mira Boutique', 'Northwear'], electronics: ['VoltHub', 'PixelPoint', 'Circuit City'], travel: ['SkyFare', 'StayNest', 'TripLane'], online_services: ['StreamBox', 'CloudKit', 'AppVault'], jewelry: ['Golden Arc', 'Lumière Gems', 'Karat & Co'], gaming_crypto: ['CoinDock', 'PlayForge', 'TokenBay'] };
  const CITIES = ['Karachi', 'Lahore', 'Dubai', 'London', 'New York', 'Toronto', 'Riyadh', 'Istanbul', 'Singapore', 'Berlin', 'Lagos', 'Manila'];
  const pickW = (arr, w) => { let r = Math.random() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; } return arr[0]; };
  const U = (a, b) => a + Math.random() * (b - a);
  const I = (a, b) => Math.floor(U(a, b + 1));
  const ln = (m, s) => Math.exp(m + s * Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random()));

  function legit() {
    const avg = +ln(4, 0.6).toFixed(2);
    const cat = pickW(Object.keys(M), [26, 12, 17, 10, 6, 4, 17, 2, 6]);
    const ch = ['online_services', 'gaming_crypto'].includes(cat) ? 'online' : pickW(['chip_in_store', 'contactless', 'online', 'atm'], [42, 40, 10, 8]);
    const ratio = ln(0, 0.5) * (['electronics', 'travel', 'jewelry'].includes(cat) ? U(1.5, 4) : 1);
    return { amount: +Math.max(0.5, avg * ratio).toFixed(2), customer_avg_amount: avg, hour: I(8, 21), merchant_category: cat, channel: ch, distance_km: +(-Math.log(Math.random() || 1e-9) * 6).toFixed(1), country_mismatch: false, new_device: Math.random() < 0.03, txn_count_24h: I(1, 5), account_age_days: I(90, 3800), failed_attempts_1h: 0 };
  }
  function fraud() {
    const t = legit();
    const k = I(0, 3);
    if (k === 0) Object.assign(t, { channel: Math.random() < 0.5 ? 'chip_in_store' : 'atm', distance_km: I(300, 8000), country_mismatch: true, amount: +(t.customer_avg_amount * U(5, 15)).toFixed(2), merchant_category: Math.random() < 0.5 ? 'electronics' : 'jewelry', hour: I(0, 5) });
    else if (k === 1) Object.assign(t, { channel: 'online', new_device: true, failed_attempts_1h: I(1, 5), amount: +(t.customer_avg_amount * U(6, 25)).toFixed(2), merchant_category: ['electronics', 'gaming_crypto', 'travel'][I(0, 2)], hour: I(0, 4) });
    else if (k === 2) Object.assign(t, { channel: 'online', amount: +U(0.5, 5).toFixed(2), txn_count_24h: I(20, 60), merchant_category: Math.random() < 0.5 ? 'online_services' : 'gaming_crypto', failed_attempts_1h: I(2, 8) });
    else Object.assign(t, { account_age_days: I(2, 20), amount: +U(900, 4000).toFixed(2), merchant_category: Math.random() < 0.5 ? 'electronics' : 'jewelry', txn_count_24h: I(4, 12) });
    return t;
  }
  function feedItems(n) {
    return Array.from({ length: n }, () => {
      const t = Math.random() < 0.12 ? fraud() : legit();
      const r = score(t);
      return { ...t, merchant: M[t.merchant_category][I(0, 2)], city: t.country_mismatch ? CITIES[I(2, 11)] : CITIES[I(0, 1)], card_last4: String(I(0, 9999)).padStart(4, '0'), ...r, reasons: r.reasons.slice(0, 2) };
    });
  }
  return { score, feed: feedItems };
}
