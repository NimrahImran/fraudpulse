import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { $, countUp, int, pct, usd } from '../util.js';

const FEATURE_LABEL = {
  amount: 'Amount', hour: 'Hour of day', merchant_category: 'Shop type', channel: 'Paid by',
  distance_from_home_km: 'Distance from home', country_mismatch: 'Abroad', new_device: 'New phone',
  txn_count_24h: 'Payments today', amount_to_avg_ratio: 'Amount vs usual', account_age_days: 'Account age',
  failed_attempts_1h: 'Wrong PIN tries',
};

export function initResults(m) {
  const at = m.at_threshold;
  const fraudTotal = at.tp + at.fn;
  const caught = Math.round(at.recall * 100);
  const dots = $('#r-dots');
  dots.innerHTML = '<i></i>'.repeat(100);

  ScrollTrigger.create({
    trigger: '#results .trio', start: 'top 85%', once: true,
    onEnter: () => {
      countUp($('#r-money'), at.net, (v) => usd(v), 2);
      countUp($('#r-caught'), caught, int, 1.6);
      [...dots.children].forEach((d, i) => setTimeout(() => d.classList.toggle('on', i < caught), 300 + i * 14));
    },
  });
  $('#r-money-sub').textContent = `${int(at.tp)} of ${int(fraudTotal)} frauds stopped, after paying for every false alarm.`;
  const fpRate = at.fp / (at.fp + at.tn);
  $('#r-fp').textContent = `1 in ${int(1 / fpRate)}`;
  if ($('#r-fp-sub')) $('#r-fp-sub').textContent = '';
  const b = m.baseline;
  const row = (name, v, col) => `<div class="vs-row"><span>${name}</span><div class="vs-bar"><i style="width:${v * 100}%;background:${col}"></i></div><b>${pct(v)}</b></div>`;
  $('#r-vs').innerHTML = row('FraudLens', at.recall, 'var(--red)') + row('Bank rules', b.recall, '#6b5b5c');
  if ($('#r-vs-sub')) $('#r-vs-sub').textContent = `Simple rules catch ${pct(b.recall)} of fraud with ${int(b.fp)} false alarms. FraudLens catches ${pct(at.recall)} with ${int(at.fp)}.`;

  // data scientist panel
  const toggle = $('#ds-toggle');
  toggle.addEventListener('click', () => {
    const panel = $('#ds-panel');
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    toggle.firstChild.textContent = panel.hidden ? 'Show technical details ' : 'Hide technical details ';
    ScrollTrigger.refresh();
  });
  $('#ds-roc-sub').textContent = `AUC ${m.roc_auc}`;
  $('#ds-pr-sub').textContent = `Average precision ${m.pr_auc} (random guessing: ${m.fraud_rate})`;
  $('#ds-roc').innerHTML = curve(m.roc, 'False positive rate', 'True positive rate', true);
  $('#ds-pr').innerHTML = curve(m.pr, 'Recall', 'Precision', false, [at.recall, at.precision]);
  const maxG = m.importance[0].gain;
  $('#ds-imp').innerHTML = m.importance.map((f) => `<div class="imp-row"><span>${FEATURE_LABEL[f.feature] || f.feature}</span><div class="vs-bar"><i style="width:${f.gain / maxG * 100}%"></i></div><span class="mono">${pct(f.gain, 1)}</span></div>`).join('');
  const p = m.params;
  const rows = [
    ['Algorithm', `LightGBM gradient-boosted trees: ${m.n_trees} trees, ${p.num_leaves} leaves, learning rate ${p.learning_rate}, early stopping`],
    ['Data', `${int(m.train_rows + m.test_rows * 1.25)} synthetic card payments, ${pct(m.fraud_rate, 1)} fraud, five fraud patterns. 60 / 20 / 20 stratified split`],
    ['Features', '11: amount, amount vs usual spend, hour, shop type, payment channel, distance, abroad, new device, payments in 24h, account age, wrong PIN tries'],
    ['Imbalance', `Calibrated probabilities with the decision threshold (${m.threshold}) tuned on validation to maximise net money saved ($${m.fp_cost} per false alarm, $${m.chargeback_fee} chargeback fee)`],
    ['Test results', `ROC-AUC ${m.roc_auc} · PR-AUC ${m.pr_auc} · recall ${pct(at.recall, 1)} · precision ${pct(at.precision, 1)}`],
    ['Explanations', 'Per-prediction tree-path attribution; contributions add up exactly to the model log-odds'],
    ['Serving', 'FastAPI on Vercel with a dependency-free tree engine, verified identical to LightGBM'],
    ['Limitations', 'Trained on realistic synthetic data, not a real bank. Fraud that perfectly copies normal behaviour is caught less often. Retrain on real data before production'],
  ];
  $('#ds-card').innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');

  const slider = $('#strict');
  slider.value = Math.round(m.threshold * 100);
  const drawCM = () => {
    const t = +slider.value / 100;
    const r = m.table.find((x) => Math.abs(x.t - t) < 1e-9) || at;
    $('#th-val').textContent = `${slider.value}%${Math.abs(t - m.threshold) < 1e-9 ? ' (recommended)' : ''}`;
    $('#ds-cm-sub').textContent = `At this threshold, on ${int(m.test_rows)} test payments`;
    $('#ds-cm').innerHTML = `
      <div class="h"></div><div class="h">Flagged</div><div class="h">Approved</div>
      <div class="h" style="text-align:right">Fraud</div><div class="tp"><b>${int(r.tp)}</b>caught</div><div class="fn"><b>${int(r.fn)}</b>missed</div>
      <div class="h" style="text-align:right">Honest</div><div class="fp"><b>${int(r.fp)}</b>false alarms</div><div class="tn"><b>${int(r.tn)}</b>approved</div>`;
  };
  slider.addEventListener('input', drawCM);
  drawCM();
}

function curve(pts, xl, yl, diag, mark) {
  const W = 320, H = 240, P = { l: 40, r: 10, t: 10, b: 34 };
  const x = (v) => P.l + v * (W - P.l - P.r);
  const y = (v) => H - P.b - v * (H - P.t - P.b);
  const d = pts.map(([a, b], i) => `${i ? 'L' : 'M'}${x(a).toFixed(1)},${y(b).toFixed(1)}`).join('');
  const area = `${d}L${x(pts[pts.length - 1][0])},${y(0)}L${x(pts[0][0])},${y(0)}Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${yl} against ${xl}">
    ${ticks.map((t) => `<line x1="${x(0)}" x2="${x(1)}" y1="${y(t)}" y2="${y(t)}" stroke="rgba(255,255,255,.08)"/><text x="${P.l - 6}" y="${y(t) + 4}" font-size="10" text-anchor="end" fill="#8d7b7c">${t}</text><text x="${x(t)}" y="${H - P.b + 14}" font-size="10" text-anchor="middle" fill="#8d7b7c">${t}</text>`).join('')}
    ${diag ? `<line x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}" stroke="#8d7b7c" stroke-dasharray="4 4" opacity=".6"/>` : ''}
    <path d="${area}" fill="rgba(255,31,45,.14)"/>
    <path d="${d}" fill="none" stroke="#ff1f2d" stroke-width="2.2"/>
    ${mark ? `<circle cx="${x(mark[0])}" cy="${y(mark[1])}" r="5" fill="#ffffff"/><text x="${x(mark[0]) - 8}" y="${y(mark[1]) - 9}" font-size="10" text-anchor="end" fill="#ffffff">chosen threshold</text>` : ''}
    <text x="${(x(0) + x(1)) / 2}" y="${H - 4}" font-size="11" text-anchor="middle" fill="#b9a7a8">${xl}</text>
    <text x="12" y="${(y(0) + y(1)) / 2}" font-size="11" text-anchor="middle" fill="#b9a7a8" transform="rotate(-90 12 ${(y(0) + y(1)) / 2})">${yl}</text>
  </svg>`;
}
