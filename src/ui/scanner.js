import gsap from 'gsap';
import { predict } from '../api.js';
import { $, $$, CATEGORIES, CHANNELS, esc, fieldError } from '../util.js';

export const PRESETS = [
  { name: 'Grocery shopping', hint: '$48 · normal day', desc: 'A regular customer buys groceries near home in the afternoon, with their usual card.',
    tx: { amount: 48.5, customer_avg_amount: 55, hour: 13, merchant_category: 'grocery', channel: 'chip_in_store', distance_km: 3, country_mismatch: false, new_device: false, txn_count_24h: 2, account_age_days: 1460, failed_attempts_1h: 0 } },
  { name: 'Late-night phone', hint: '$1,840 · 3 AM', desc: 'At 3 AM someone on a new phone enters the wrong PIN 3 times, then buys a $1,840 laptop online.',
    tx: { amount: 1840, customer_avg_amount: 62, hour: 3, merchant_category: 'electronics', channel: 'online', distance_km: 12, country_mismatch: false, new_device: true, txn_count_24h: 4, account_age_days: 900, failed_attempts_1h: 3 } },
  { name: 'Card used abroad', hint: '$920 · 5,400 km', desc: 'The card is suddenly used at a jewellery shop in another country at 2 AM.',
    tx: { amount: 920, customer_avg_amount: 70, hour: 2, merchant_category: 'jewelry', channel: 'chip_in_store', distance_km: 5400, country_mismatch: true, new_device: false, txn_count_24h: 3, account_age_days: 2200, failed_attempts_1h: 0 } },
  { name: 'Holiday trip', hint: '$210 · abroad', desc: 'A long-time customer on holiday buys clothes abroad in the evening. Unusual place, but normal behaviour.',
    tx: { amount: 210, customer_avg_amount: 95, hour: 18, merchant_category: 'fashion', channel: 'contactless', distance_km: 3100, country_mismatch: true, new_device: false, txn_count_24h: 3, account_age_days: 3100, failed_attempts_1h: 0 } },
];

const RULES = { amount: [0.5, 100000], customer_avg_amount: [0.5, 100000], hour: [0, 23], distance_km: [0, 20000], txn_count_24h: [1, 1000], account_age_days: [0, 30000], failed_attempts_1h: [0, 100] };
const INTS = new Set(['hour', 'txn_count_24h', 'account_age_days', 'failed_attempts_1h']);
const LABEL = { block: 'Fraud · payment blocked', review: 'Unusual · sent for review', approve: 'Safe · payment approved' };
const TAG = { block: 'FRAUD DETECTED', review: 'NEEDS A CHECK', approve: 'LOOKS SAFE' };
const COLOR = { block: 'var(--fraud)', review: 'var(--review)', approve: 'var(--safe)' };
const CIRC = 2 * Math.PI * 84;

export function initScanner() {
  const form = $('#scan-form');
  const opts = (sel, obj) => { $(sel).innerHTML = Object.entries(obj).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''); };
  opts('#f-cat', CATEGORIES); opts('#f-ch', CHANNELS);

  const box = $('#presets');
  box.innerHTML = PRESETS.map((p, i) => `<button type="button" class="preset" data-i="${i}" aria-pressed="false">${p.name}<small>${p.hint}</small></button>`).join('');
  const select = (i) => {
    $$('.preset', box).forEach((b, j) => { b.classList.toggle('on', j === i); b.setAttribute('aria-pressed', String(j === i)); });
    $('#preset-desc').textContent = PRESETS[i].desc;
    fill(PRESETS[i].tx);
  };
  box.addEventListener('click', (e) => { const b = e.target.closest('.preset'); if (b) { select(+b.dataset.i); run(); } });

  form.addEventListener('input', (e) => {
    if (e.target.matches('input:not([type=checkbox])')) fieldError(e.target, '');
    $$('.preset', box).forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); });
    $('#preset-desc').textContent = 'Your own payment details. Press Scan payment when ready.';
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); run(); });

  function fill(tx) {
    for (const [k, v] of Object.entries(tx)) {
      const el = form.elements[k]; if (!el) continue;
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
      if (el.tagName === 'INPUT' && el.type !== 'checkbox') fieldError(el, '');
    }
  }

  function read() {
    const tx = {}; let ok = true;
    for (const [k, [lo, hi]] of Object.entries(RULES)) {
      const el = form.elements[k]; const raw = String(el.value).trim(); const v = Number(raw);
      let msg = '';
      if (raw === '') msg = 'Enter a value';
      else if (!isFinite(v)) msg = 'Enter a number';
      else if (v < lo || v > hi) msg = `Use ${lo.toLocaleString()}–${hi.toLocaleString()}`;
      else if (INTS.has(k) && !Number.isInteger(v)) msg = 'Use a whole number';
      fieldError(el, msg);
      if (msg) ok = false; else tx[k] = v;
    }
    tx.merchant_category = form.elements.merchant_category.value;
    tx.channel = form.elements.channel.value;
    tx.country_mismatch = form.elements.country_mismatch.checked;
    tx.new_device = form.elements.new_device.checked;
    return ok ? tx : null;
  }

  let busy = false;
  const btn = $('#scan-btn');
  const card = $('#result');
  const tag = $('#scan-tag');
  const bar = $('#g-bar');

  async function run() {
    if (busy) return;
    $('#scan-err').textContent = '';
    const tx = read();
    if (!tx) { $('#scan-err').textContent = 'Fix the highlighted details first.'; return; }
    busy = true; btn.disabled = true; btn.textContent = 'Scanning…';
    card.className = 'panel result scanning';
    tag.className = 'mono res-tag'; tag.textContent = 'SCANNING…';
    $('#score-num').textContent = '–';
    bar.style.strokeDashoffset = CIRC;
    let res;
    try {
      [res] = await Promise.all([predict(tx), new Promise((r) => setTimeout(r, 1300))]);
    } catch (err) {
      $('#scan-err').textContent = err.detail ? 'Some details are out of range.' : 'Could not reach the AI. Try again.';
      tag.textContent = 'READY TO SCAN'; card.className = 'panel result';
      busy = false; btn.disabled = false; btn.textContent = 'Scan payment';
      return;
    }
    show(res);
    busy = false; btn.disabled = false; btn.textContent = 'Scan payment';
  }

  function show(r) {
    card.className = 'panel result ' + r.decision;
    tag.className = 'mono res-tag ' + r.decision;
    tag.textContent = TAG[r.decision];
    const num = $('#score-num');
    num.style.color = COLOR[r.decision];
    bar.style.stroke = COLOR[r.decision]; bar.style.color = COLOR[r.decision];
    const o = { v: 0 };
    gsap.to(o, { v: r.risk_score, duration: 1.1, ease: 'power3.out', onUpdate: () => {
      num.textContent = Math.round(o.v);
      bar.style.strokeDashoffset = CIRC * (1 - o.v / 100);
    } });
    const dEl = $('#decision');
    dEl.className = 'decision ' + r.decision;
    dEl.textContent = LABEL[r.decision];
    $('#verdict-text').textContent = {
      block: 'This looks like fraud. The payment is stopped before any money leaves the account.',
      review: 'Something is unusual. A person from the fraud team takes a quick look before it goes through.',
      approve: 'This looks like the real card owner. The payment goes through instantly.',
    }[r.decision];
    const ups = r.reasons.filter((x) => x.direction === 'raises');
    const downs = r.reasons.filter((x) => x.direction === 'lowers');
    const pick = r.decision === 'approve' ? [...downs.slice(0, 2), ...ups.slice(0, 1)] : ups.slice(0, 3);
    $('#why').innerHTML = pick.map((x) => `<li class="${x.direction === 'raises' ? 'up' : 'down'}"><b>${esc(x.title)}.</b> ${esc(x.detail)}</li>`).join('');
    $('#tech-line').textContent = `fraud probability ${(r.probability * 100).toFixed(2)}% · threshold ${(r.threshold * 100).toFixed(0)}% · ${r.latency_ms} ms`;
    gsap.fromTo('#why li', { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.08, ease: 'power3.out' });
  }

  select(1);
}
