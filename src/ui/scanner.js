import gsap from 'gsap';
import { predict } from '../api.js';
import { icon } from '../icons.js';
import { $, $$, CATEGORIES, CHANNELS, DECISION_ICON, DECISION_LABEL, emit, esc, fieldError, usd } from '../util.js';

export const PRESETS = [
  { name: 'Normal grocery', tx: { amount: 48.5, customer_avg_amount: 55, hour: 13, merchant_category: 'grocery', channel: 'chip_in_store', distance_km: 3, country_mismatch: false, new_device: false, txn_count_24h: 2, account_age_days: 1460, failed_attempts_1h: 0 } },
  { name: 'Night-time takeover', tx: { amount: 1840, customer_avg_amount: 62, hour: 3, merchant_category: 'electronics', channel: 'online', distance_km: 12, country_mismatch: false, new_device: true, txn_count_24h: 4, account_age_days: 900, failed_attempts_1h: 3 } },
  { name: 'Bot card testing', tx: { amount: 1.99, customer_avg_amount: 48, hour: 15, merchant_category: 'online_services', channel: 'online', distance_km: 0, country_mismatch: false, new_device: true, txn_count_24h: 38, account_age_days: 640, failed_attempts_1h: 6 } },
  { name: 'Cloned card abroad', tx: { amount: 920, customer_avg_amount: 70, hour: 2, merchant_category: 'jewelry', channel: 'chip_in_store', distance_km: 5400, country_mismatch: true, new_device: false, txn_count_24h: 3, account_age_days: 2200, failed_attempts_1h: 0 } },
  { name: 'Holiday shopping', tx: { amount: 210, customer_avg_amount: 95, hour: 18, merchant_category: 'fashion', channel: 'contactless', distance_km: 3100, country_mismatch: true, new_device: false, txn_count_24h: 3, account_age_days: 3100, failed_attempts_1h: 0 } },
];

const RULES = {
  amount: [0.5, 100000], customer_avg_amount: [0.5, 100000], hour: [0, 23], distance_km: [0, 20000],
  txn_count_24h: [1, 1000], account_age_days: [0, 30000], failed_attempts_1h: [0, 100],
};
const INTS = new Set(['hour', 'txn_count_24h', 'account_age_days', 'failed_attempts_1h']);

export function initScanner(scene) {
  const form = $('#scan-form');
  const sel = (id, obj) => { $(id).innerHTML = Object.entries(obj).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''); };
  sel('#f-cat', CATEGORIES); sel('#f-ch', CHANNELS);

  const presetBox = $('#presets');
  presetBox.innerHTML = PRESETS.map((p, i) => `<button type="button" class="preset" data-i="${i}">${p.name}</button>`).join('');
  presetBox.addEventListener('click', (e) => {
    const b = e.target.closest('.preset'); if (!b) return;
    fill(PRESETS[+b.dataset.i].tx);
    $$('.preset', presetBox).forEach((x) => x.classList.toggle('on', x === b));
    run();
  });

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
      const el = form.elements[k];
      const raw = el.value.trim();
      const v = Number(raw);
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

  form.addEventListener('input', (e) => { if (e.target.matches('input:not([type=checkbox])')) fieldError(e.target, ''); $$('.preset', presetBox).forEach((x) => x.classList.remove('on')); });
  form.addEventListener('submit', (e) => { e.preventDefault(); run(); });

  let busy = false;
  async function run({ quiet = false } = {}) {
    if (busy) return;
    const tx = read();
    $('#scan-err').textContent = '';
    if (!tx) { $('#scan-err').textContent = 'Fix the highlighted fields first.'; return; }
    busy = true;
    const frame = $('#scanner-frame');
    const btn = $('#scan-btn');
    btn.disabled = true;
    $('#scan-tag').textContent = 'Scanning…';
    $('#scan-card').textContent = '•••• ' + String(Math.floor(Math.random() * 9000) + 1000);
    scene.state.alert = 0; scene.state.safe = 0;
    if (!quiet) {
      frame.classList.remove('scanning'); void frame.offsetWidth; frame.classList.add('scanning');
      scene.state.scanOn = 1;
      gsap.fromTo(scene.state, { scanY: 0.9 }, { scanY: -0.9, duration: 1.1, ease: 'sine.inOut', yoyo: true, repeat: 1 });
    }
    const t0 = performance.now();
    let res;
    try {
      [res] = await Promise.all([predict(tx), new Promise((r) => setTimeout(r, quiet ? 0 : 2200))]);
    } catch (err) {
      busy = false; btn.disabled = false; scene.state.scanOn = 0;
      $('#scan-tag').textContent = 'Ready to scan';
      $('#scan-err').textContent = err.detail ? 'Some values are out of range.' : 'Could not reach the model. Try again.';
      return;
    }
    const total = performance.now() - t0 - (quiet ? 0 : 2200);
    scene.state.scanOn = 0;
    frame.classList.remove('scanning');
    show(res, tx, Math.max(total, 0));
    busy = false; btn.disabled = false;
  }

  function show(r, tx, roundTrip) {
    const box = $('#result');
    box.classList.add('show');
    const col = r.decision === 'block' ? '#c2362b' : r.decision === 'review' ? '#a86d12' : '#2f7a5b';
    const arc = $('#gauge-arc');
    arc.setAttribute('stroke', col);
    const num = $('#gauge-num');
    const o = { v: 0 };
    gsap.to(o, { v: r.risk_score, duration: 1.1, ease: 'power3.out', onUpdate: () => { num.textContent = Math.round(o.v); arc.setAttribute('stroke-dashoffset', 326.7 * (1 - o.v / 100)); } });
    const d = $('#decision');
    d.className = 'decision ' + r.decision;
    d.innerHTML = icon(DECISION_ICON[r.decision]) + DECISION_LABEL[r.decision];
    const top = r.reasons.filter((x) => x.direction === 'raises').slice(0, 2).map((x) => x.title.toLowerCase());
    const text = {
      block: `High fraud risk${top.length ? ': ' + top.join(' and ') : ''}. The payment is stopped before money leaves the account.`,
      review: `Unusual${top.length ? ' (' + top.join(', ') + ')' : ''}. Sent to an analyst for a quick check.`,
      approve: 'Looks like the real cardholder. The payment goes through instantly.',
    }[r.decision];
    $('#verdict-text').textContent = text;
    $('#tech-line').textContent = `p(fraud)=${r.probability.toFixed(4)} · threshold ${r.threshold} · model ${r.latency_ms} ms`;
    $('#scan-tag').textContent = r.decision === 'block' ? 'Fraud detected' : r.decision === 'review' ? 'Needs review' : 'Looks genuine';
    $('#scan-time').textContent = `${Math.max(r.latency_ms, 0.1).toFixed(1)} ms`;
    scene.state.alert = r.decision === 'block' ? 1 : r.decision === 'review' ? 0.45 : 0;
    scene.state.safe = r.decision === 'approve' ? 1 : 0;
    emit('scanned', { result: r, tx });
  }

  // first, silent scan so the reasons section is filled on load
  fill(PRESETS[1].tx);
  $$('.preset', presetBox)[1].classList.add('on');
  return { runQuiet: () => run({ quiet: true }) };
}

export function txSummary(tx) {
  return `${usd(tx.amount)} · ${CATEGORIES[tx.merchant_category]} · ${CHANNELS[tx.channel]}`;
}

export const escHtml = esc;
