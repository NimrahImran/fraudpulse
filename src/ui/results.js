import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $, countUp, int, pct, usd } from '../util.js';

const FEATURE_LABEL = {
  amount: 'Amount', hour: 'Hour of day', merchant_category: 'Merchant type', channel: 'Payment method',
  distance_from_home_km: 'Distance from home', country_mismatch: 'Foreign country', new_device: 'New device',
  txn_count_24h: 'Payments in 24h', amount_to_avg_ratio: 'Amount vs usual', account_age_days: 'Account age',
  failed_attempts_1h: 'Failed PIN/CVV',
};

export function initResults(m) {
  const at = m.at_threshold;
  const fraudTotal = at.tp + at.fn;
  const rowAt = (t) => m.table.find((r) => Math.abs(r.t - t) < 1e-9) || at;

  // headline numbers in the hero
  document.querySelectorAll('[data-metric="recall"]').forEach((el) => { el.textContent = pct(at.recall); });
  document.querySelectorAll('[data-metric="auc"]').forEach((el) => { el.textContent = m.roc_auc.toFixed(2); });

  const dots = $('#r-dots');
  dots.innerHTML = '<i></i>'.repeat(100);
  const caught = Math.round(at.recall * 100);

  ScrollTrigger.create({
    trigger: '#results', start: 'top 70%', once: true,
    onEnter: () => {
      countUp($('#r-money'), at.net, (v) => usd(v), 2);
      countUp($('#r-caught'), caught, int, 1.6);
      [...dots.children].forEach((d, i) => setTimeout(() => d.classList.toggle('on', i < caught), i * 14));
    },
  });
  $('#r-money-sub').textContent = `Fraud worth ${usd(at.saved + at.lost - 25 * fraudTotal)} was attempted across ${int(m.test_rows)} test payments. FraudLens stopped ${int(at.tp)} of ${int(fraudTotal)} frauds, after paying for every false alarm.`;

  const fpRate = at.fp / (at.fp + at.tn);
  $('#r-fp').textContent = `1 in ${int(1 / fpRate)}`;
  $('#r-fp-sub').textContent = `Only ${int(at.fp)} of ${int(at.fp + at.tn)} honest payments were flagged, and those go to quick analyst review instead of a hard decline.`;

  const b = m.baseline;
  const vsRow = (name, v, col) => `<div class="vs-row"><span>${name}</span><div class="vs-bar"><i style="width:${v * 100}%;background:${col}"></i></div><b>${pct(v)}</b></div>`;
  $('#r-vs').innerHTML = vsRow('FraudLens', at.recall, 'var(--mint-800)') + vsRow('Bank rules', b.recall, 'var(--gold)');
  $('#r-vs-sub').textContent = `Rule "amount over $1,000 or foreign country" catches ${pct(b.recall)} of fraud with ${int(b.fp)} false alarms. FraudLens catches ${pct(at.recall)} with ${int(at.fp)}.`;

  // strictness slider: low threshold = strict
  const slider = $('#strict');
  const rec = $('#rec-mark');
  const placeRec = () => { rec.style.left = `calc(${(m.threshold * 100 - 1) / 98 * 100}% + ${14 - (m.threshold * 100 - 1) / 98 * 28}px)`; };
  placeRec();
  rec.addEventListener('click', () => { slider.value = Math.round(m.threshold * 100); update(); });
  slider.value = Math.round(m.threshold * 100);
  const update = () => {
    const r = rowAt(+slider.value / 100);
    $('#s-caught').textContent = pct(r.recall);
    $('#s-fp').textContent = int(r.fp);
    $('#s-net').textContent = usd(r.net, true);
    drawCM(r);
  };
  slider.addEventListener('input', update);

  // data scientist panel
  const toggle = $('#ds-toggle');
  toggle.addEventListener('click', () => {
    const open = $('#ds-panel').classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.firstChild.textContent = open ? 'Hide technical details ' : 'For data scientists ';
    ScrollTrigger.refresh();
  });
  $('#ds-roc-sub').textContent = `AUC ${m.roc_auc} · false positive rate vs recall`;
  $('#ds-pr-sub').textContent = `Average precision ${m.pr_auc} · baseline (random) ${m.fraud_rate}`;
  $('#ds-roc').innerHTML = curve(m.roc, 'False positive rate', 'True positive rate', true);
  $('#ds-pr').innerHTML = curve(m.pr, 'Recall', 'Precision', false, [at.recall, at.precision]);
  const maxG = m.importance[0].gain;
  $('#ds-imp').innerHTML = m.importance.map((f) => `<div class="imp-row"><span>${FEATURE_LABEL[f.feature] || f.feature}</span><div class="vs-bar"><i style="width:${f.gain / maxG * 100}%"></i></div><span class="mono">${pct(f.gain, 1)}</span></div>`).join('');
  const p = m.params;
  const rows = [
    ['Algorithm', `LightGBM gradient-boosted trees · ${m.n_trees} trees, ${p.num_leaves} leaves, learning rate ${p.learning_rate}, early stopping`],
    ['Data', `${int(m.train_rows + m.test_rows * 1.25)} synthetic card payments, ${pct(m.fraud_rate, 1)} fraud, 5 fraud patterns plus stealth cases. 60 / 20 / 20 stratified split`],
    ['Features', '11: amount, amount vs customer average, hour, merchant type, channel, distance, foreign country, new device, 24h velocity, account age, failed PIN/CVV'],
    ['Imbalance handling', `No naive resampling. Probabilities stay calibrated and the decision threshold (${m.threshold}) is tuned on validation to maximise net money saved (false alarm cost $${m.fp_cost}, chargeback fee $${m.chargeback_fee})`],
    ['Test results', `ROC-AUC ${m.roc_auc} · PR-AUC ${m.pr_auc} · recall ${pct(at.recall, 1)} · precision ${pct(at.precision, 1)} at the chosen threshold`],
    ['Explanations', 'Tree-path attribution (Saabas) computed per prediction; contributions sum exactly to the model log-odds'],
    ['Serving', 'Trees exported to JSON and evaluated by a dependency-free Python engine (FastAPI on Vercel), verified identical to LightGBM to 1e-7'],
    ['Limitations', 'Trained on realistic synthetic data, not a real bank. Stealth fraud that mimics normal behaviour is caught far less often. Retrain on real data before production use'],
  ];
  $('#ds-card').innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');

  function drawCM(r) {
    $('#ds-cm-sub').textContent = `At threshold ${r.t} on ${int(m.test_rows)} test payments`;
    $('#ds-cm').innerHTML = `
      <div class="h"></div><div class="h">Predicted fraud</div><div class="h">Predicted honest</div>
      <div class="h" style="text-align:right">Actual fraud</div><div class="tp"><b>${int(r.tp)}</b>caught</div><div class="fn"><b>${int(r.fn)}</b>missed</div>
      <div class="h" style="text-align:right">Actual honest</div><div class="fp"><b>${int(r.fp)}</b>false alarms</div><div class="tn"><b>${int(r.tn)}</b>approved</div>`;
  }
  update();
}

function curve(pts, xl, yl, diag, mark) {
  const W = 320, H = 240, P = { l: 40, r: 10, t: 10, b: 34 };
  const x = (v) => P.l + v * (W - P.l - P.r);
  const y = (v) => H - P.b - v * (H - P.t - P.b);
  const d = pts.map(([a, b], i) => `${i ? 'L' : 'M'}${x(a).toFixed(1)},${y(b).toFixed(1)}`).join('');
  const area = `${d}L${x(pts[pts.length - 1][0])},${y(0)}L${x(pts[0][0])},${y(0)}Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${yl} against ${xl}">
    ${ticks.map((t) => `<line x1="${x(0)}" x2="${x(1)}" y1="${y(t)}" y2="${y(t)}" stroke="rgba(13,44,34,.1)"/><text x="${P.l - 6}" y="${y(t) + 4}" font-size="10" text-anchor="end" fill="#4f6c61">${t}</text><text x="${x(t)}" y="${H - P.b + 14}" font-size="10" text-anchor="middle" fill="#4f6c61">${t}</text>`).join('')}
    ${diag ? `<line x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}" stroke="#b69f7f" stroke-dasharray="4 4"/>` : ''}
    <path d="${area}" fill="rgba(62,117,97,.18)"/>
    <path d="${d}" fill="none" stroke="#225945" stroke-width="2.2"/>
    ${mark ? `<circle cx="${x(mark[0])}" cy="${y(mark[1])}" r="5" fill="#c2362b"/><text x="${x(mark[0]) - 8}" y="${y(mark[1]) - 9}" font-size="10" text-anchor="end" fill="#c2362b">chosen threshold</text>` : ''}
    <text x="${(x(0) + x(1)) / 2}" y="${H - 4}" font-size="11" text-anchor="middle" fill="#2b4a3f">${xl}</text>
    <text x="12" y="${(y(0) + y(1)) / 2}" font-size="11" text-anchor="middle" fill="#2b4a3f" transform="rotate(-90 12 ${(y(0) + y(1)) / 2})">${yl}</text>
  </svg>`;
}
