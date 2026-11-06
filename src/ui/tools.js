import { feed, predictBatch } from '../api.js';
import { icon } from '../icons.js';
import { $, CATEGORIES, CHANNELS, DECISION_LABEL, emit, esc, fieldError, int, on, pct, store, usd } from '../util.js';

/* ---------------- savings calculator ---------------- */
export function initCalculator(m) {
  const at = m.at_threshold;
  const recall = at.recall;
  const fpr = at.fp / (at.fp + at.tn);
  const ids = ['#k-tx', '#k-avg', '#k-rate', '#k-mult'];
  const limits = { '#k-tx': [100, 1e9], '#k-avg': [1, 1e6], '#k-rate': [0.01, 20], '#k-mult': [1, 50] };
  const calc = () => {
    const vals = {}; let ok = true;
    for (const id of ids) {
      const el = $(id); const v = Number(el.value); const [lo, hi] = limits[id];
      const msg = el.value.trim() === '' ? 'Enter a value' : !isFinite(v) ? 'Enter a number' : v < lo || v > hi ? `Use ${lo.toLocaleString()}–${hi.toLocaleString()}` : '';
      fieldError(el, msg); if (msg) ok = false; vals[id] = v;
    }
    if (!ok) return;
    const n = vals['#k-tx'], avg = vals['#k-avg'], rate = vals['#k-rate'] / 100, mult = vals['#k-mult'];
    const frauds = n * rate, legit = n - frauds;
    const caught = frauds * recall;
    const saved = caught * (avg * mult + m.chargeback_fee);
    const fa = legit * fpr;
    const cost = fa * m.fp_cost;
    const month = saved - cost;
    $('#k-month').textContent = usd(month, true);
    $('#k-year').textContent = usd(month * 12);
    $('#k-caught').textContent = int(caught);
    $('#k-fa').textContent = int(fa);
    $('#k-cost').textContent = usd(cost, true);
    $('#k-note').textContent = `Uses the measured catch rate (${pct(recall)}) and false-alarm rate (${(fpr * 100).toFixed(2)}%), $${m.fp_cost} per false alarm and a $${m.chargeback_fee} chargeback fee per fraud. An estimate, not a guarantee.`;
  };
  ids.forEach((id) => $(id).addEventListener('input', calc));
  calc();
}

/* ---------------- CSV batch + PDF ---------------- */
const COLS = ['amount', 'customer_avg_amount', 'hour', 'merchant_category', 'channel', 'distance_km', 'country_mismatch', 'new_device', 'txn_count_24h', 'account_age_days', 'failed_attempts_1h'];
const BOOL = (v) => ['1', 'true', 'yes', 'y'].includes(String(v).trim().toLowerCase());

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

function sampleRows(n = 400) {
  const cats = Object.keys(CATEGORIES), chans = Object.keys(CHANNELS);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const fraud = Math.random() < 0.05;
    const avg = +(20 + Math.random() * 120).toFixed(2);
    const cat = fraud ? (Math.random() < 0.5 ? 'electronics' : 'jewelry') : cats[Math.floor(Math.random() * 7)];
    rows.push({
      id: `TX-${String(100000 + i)}`,
      amount: +(fraud ? avg * (6 + Math.random() * 18) : avg * (0.4 + Math.random() * 1.4)).toFixed(2),
      customer_avg_amount: avg,
      hour: fraud ? Math.floor(Math.random() * 5) : 8 + Math.floor(Math.random() * 14),
      merchant_category: cat,
      channel: fraud ? 'online' : chans[Math.floor(Math.random() * 3)],
      distance_km: fraud ? Math.round(200 + Math.random() * 6000) : Math.round(Math.random() * 20),
      country_mismatch: fraud && Math.random() < 0.5,
      new_device: fraud && Math.random() < 0.8,
      txn_count_24h: fraud ? 4 + Math.floor(Math.random() * 10) : 1 + Math.floor(Math.random() * 4),
      account_age_days: fraud && Math.random() < 0.3 ? Math.floor(Math.random() * 20) : 200 + Math.floor(Math.random() * 3000),
      failed_attempts_1h: fraud ? Math.floor(Math.random() * 5) : 0,
    });
  }
  return rows;
}

const toCSV = (rows, cols) => [cols.join(','), ...rows.map((r) => cols.map((c) => { const v = r[c] ?? ''; return /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v; }).join(','))].join('\n');

function download(name, content, type) {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function initBatch() {
  const drop = $('#drop'), input = $('#csv-in');
  let last = null;
  const err = (m) => { $('#batch-err').textContent = m || ''; };

  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) readFile(f); });
  input.addEventListener('change', () => { if (input.files[0]) readFile(input.files[0]); input.value = ''; });
  $('#csv-sample').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); download('fraudlens_sample.csv', toCSV(sampleRows(), ['id', ...COLS]), 'text/csv'); });
  $('#csv-demo').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); run(sampleRows(), 'sample_data.csv'); });

  function readFile(f) {
    err('');
    if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') return err('Choose a .csv file.');
    if (f.size > 5 * 1024 * 1024) return err('File is larger than 5 MB.');
    const r = new FileReader();
    r.onload = () => {
      try { run(rowsFromCSV(String(r.result)), f.name); } catch (e) { err(e.message); }
    };
    r.readAsText(f);
  }

  function rowsFromCSV(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) throw new Error('The file has no data rows.');
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const missing = COLS.filter((c) => !head.includes(c));
    if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`);
    const body = rows.slice(1);
    if (body.length > 5000) throw new Error('Up to 5,000 rows at a time.');
    return body.map((r, i) => {
      const o = {}; head.forEach((h, j) => { o[h] = r[j]; });
      const tx = {
        id: (o.id || `row-${i + 1}`).slice(0, 64),
        amount: +o.amount, customer_avg_amount: +o.customer_avg_amount, hour: Math.round(+o.hour),
        merchant_category: String(o.merchant_category).trim(), channel: String(o.channel).trim(),
        distance_km: +o.distance_km, country_mismatch: BOOL(o.country_mismatch), new_device: BOOL(o.new_device),
        txn_count_24h: Math.max(1, Math.round(+o.txn_count_24h)), account_age_days: Math.round(+o.account_age_days),
        failed_attempts_1h: Math.round(+o.failed_attempts_1h),
      };
      const bad = !(tx.amount > 0) || !(tx.customer_avg_amount > 0) || !(tx.hour >= 0 && tx.hour <= 23) || !CATEGORIES[tx.merchant_category] || !CHANNELS[tx.channel] || !(tx.distance_km >= 0) || !(tx.account_age_days >= 0) || !(tx.failed_attempts_1h >= 0);
      if (bad) throw new Error(`Row ${i + 2} has an invalid value. Check the sample CSV for the format.`);
      return tx;
    });
  }

  async function run(txs, name) {
    err('');
    const prog = $('#batch-prog'); prog.classList.add('show');
    const bar = prog.firstElementChild; bar.style.width = '5%';
    const results = [];
    try {
      for (let i = 0; i < txs.length; i += 1000) {
        const chunk = txs.slice(i, i + 1000);
        const r = await predictBatch(chunk);
        results.push(...r.results);
        bar.style.width = `${Math.round((i + chunk.length) / txs.length * 100)}%`;
      }
    } catch (e) { prog.classList.remove('show'); return err(e.detail ? 'Some rows have values out of range.' : 'Could not score the file. Try again.'); }
    setTimeout(() => prog.classList.remove('show'), 500);
    last = { name, txs, results, at: new Date() };
    render();
  }

  function render() {
    const { txs, results } = last;
    const blocked = results.filter((r) => r.decision === 'block').length;
    const review = results.filter((r) => r.decision === 'review').length;
    const amt = txs.reduce((s, t, i) => s + (results[i].decision === 'block' ? t.amount : 0), 0);
    $('#batch-empty').hidden = true;
    $('#batch-res').hidden = false;
    $('#batch-sum').innerHTML = [
      [int(txs.length), 'payments scanned'], [int(blocked), 'blocked'], [int(review), 'to review'], [usd(amt, true), 'value blocked'],
    ].map(([v, k]) => `<div class="mini"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');
    const order = results.map((r, i) => i).sort((a, b) => results[b].risk_score - results[a].risk_score).slice(0, 60);
    $('#batch-tbl').innerHTML = `<thead><tr><th>ID</th><th>Amount</th><th>Merchant</th><th>Risk</th><th>Decision</th><th>Top reason</th></tr></thead><tbody>${order.map((i) => {
      const t = txs[i], r = results[i];
      return `<tr><td class="mono">${esc(t.id)}</td><td>${usd(t.amount)}</td><td>${CATEGORIES[t.merchant_category]}</td><td><b>${r.risk_score}</b></td><td><span class="decision ${r.decision}" style="font-size:12px;padding:3px 8px">${DECISION_LABEL[r.decision]}</span></td><td>${esc(r.reasons.find((x) => x.direction === 'raises')?.title || '—')}</td></tr>`;
    }).join('')}</tbody>`;
  }

  $('#csv-out').addEventListener('click', () => {
    if (!last) return;
    const rows = last.txs.map((t, i) => ({ ...t, risk_score: last.results[i].risk_score, probability: last.results[i].probability, decision: last.results[i].decision, top_reason: last.results[i].reasons.find((x) => x.direction === 'raises')?.title || '' }));
    download('fraudlens_results.csv', toCSV(rows, ['id', ...COLS, 'risk_score', 'probability', 'decision', 'top_reason']), 'text/csv');
  });

  $('#pdf-btn').addEventListener('click', async () => {
    if (!last) return;
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const { txs, results, name, at } = last;
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(136, 177, 164); doc.rect(0, 0, W, 110, 'F');
    doc.setTextColor(13, 44, 34); doc.setFont('helvetica', 'bold'); doc.setFontSize(24); doc.text('FraudLens report', 40, 55);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(`${name} · ${at.toLocaleString()}`, 40, 78);
    doc.text('AI fraud detection · Built by Nimra Imran', 40, 94);
    const blocked = results.filter((r) => r.decision === 'block');
    const review = results.filter((r) => r.decision === 'review');
    const amt = txs.reduce((s, t, i) => s + (results[i].decision === 'block' ? t.amount : 0), 0);
    const stats = [['Payments scanned', int(txs.length)], ['Blocked', int(blocked.length)], ['Sent to review', int(review.length)], ['Value blocked', usd(amt)]];
    stats.forEach(([k, v], i) => {
      const x = 40 + i * ((W - 80) / 4);
      doc.setFillColor(246, 240, 230); doc.roundedRect(x, 130, (W - 80) / 4 - 10, 64, 8, 8, 'F');
      doc.setFontSize(9); doc.setTextColor(79, 108, 97); doc.text(k, x + 12, 152);
      doc.setFontSize(18); doc.setTextColor(13, 44, 34); doc.setFont('helvetica', 'bold'); doc.text(v, x + 12, 180); doc.setFont('helvetica', 'normal');
    });
    doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Highest-risk payments', 40, 228); doc.setFont('helvetica', 'normal');
    const order = results.map((r, i) => i).sort((a, b) => results[b].risk_score - results[a].risk_score).slice(0, 25);
    let y = 250;
    const head = ['ID', 'Amount', 'Merchant', 'Risk', 'Decision', 'Main reason'];
    const xs = [40, 120, 185, 280, 315, 380];
    doc.setFontSize(9); doc.setTextColor(79, 108, 97); head.forEach((h, i) => doc.text(h, xs[i], y)); y += 8;
    doc.setDrawColor(200, 200, 190); doc.line(40, y, W - 40, y); y += 14;
    doc.setTextColor(13, 44, 34);
    for (const i of order) {
      const t = txs[i], r = results[i];
      const reason = r.reasons.find((x) => x.direction === 'raises')?.title || '-';
      const cells = [String(t.id).slice(0, 12), usd(t.amount), CATEGORIES[t.merchant_category], String(r.risk_score), DECISION_LABEL[r.decision], reason.replace('×', 'x').slice(0, 34)];
      if (r.decision === 'block') doc.setTextColor(194, 54, 43); else doc.setTextColor(13, 44, 34);
      cells.forEach((c, j) => doc.text(c, xs[j], y));
      y += 18;
      if (y > 790) { doc.addPage(); y = 60; }
    }
    doc.setTextColor(79, 108, 97); doc.setFontSize(8);
    doc.text('Risk score 0-100: 50 and above is blocked, 35-49 goes to analyst review. Demo model trained on synthetic data.', 40, 815);
    doc.save('fraudlens_report.pdf');
  });
}

/* ---------------- analyst review queue ---------------- */
export function initReview() {
  const KEY = 'fraudlens-queue-v1';
  let q = store.get(KEY, []);
  const save = () => { q = q.slice(0, 24); store.set(KEY, q); };
  const box = $('#queue');

  on('suspicious', (it) => {
    if (q.filter((x) => !x.status).length >= 12) return;
    q.unshift({ id: Math.random().toString(36).slice(2, 9), merchant: it.merchant, city: it.city, amount: it.amount, risk: it.risk_score, decision: it.decision, reason: it.reasons?.[0]?.title || '', detail: it.reasons?.[0]?.detail || '', category: it.merchant_category, card: it.card_last4, status: null, at: Date.now() });
    save(); render();
  });

  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const item = q.find((x) => x.id === b.dataset.id); if (!item) return;
    item.status = b.dataset.act; save(); render();
  });
  $('#q-clear').addEventListener('click', () => { q = []; save(); render(); });

  // first visit: seed the queue with a few real model decisions so it is never empty
  if (!q.length) {
    feed(40).then(({ items }) => {
      items.filter((it) => it.decision !== 'approve').slice(0, 4).reverse().forEach((it) => emit('suspicious', it));
    }).catch(() => {});
  }

  function render() {
    $('#q-wait').textContent = q.filter((x) => !x.status).length;
    $('#q-blocked').textContent = q.filter((x) => x.status === 'block').length;
    $('#q-approved').textContent = q.filter((x) => x.status === 'approve').length;
    if (!q.length) {
      box.innerHTML = `<div class="q-empty glass" style="grid-column:1/-1">Suspicious payments from the live feed will appear here. <a href="#feed">Watch the feed</a> for a few seconds.</div>`;
      return;
    }
    box.innerHTML = q.slice(0, 9).map((x) => `
      <div class="qcard glass ${x.status ? 'done' : ''}">
        <div class="row"><span class="decision ${x.decision}" style="font-size:12px;padding:4px 9px">${x.decision === 'block' ? 'Auto-blocked' : 'Needs review'} · risk ${x.risk}</span><span class="mono" style="font-size:12px;color:var(--ink-3)">•••• ${esc(x.card)}</span></div>
        <div class="amt">${usd(x.amount)}</div>
        <div><b>${esc(x.merchant)}</b> <span style="color:var(--ink-3)">· ${esc(CATEGORIES[x.category] || '')} · ${esc(x.city)}</span></div>
        <div class="why">${icon('alert-triangle').replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;color:var(--fraud)"')}${esc(x.reason)}${x.detail ? ' · ' + esc(x.detail) : ''}</div>
        ${x.status ? `<div class="decision ${x.status === 'block' ? 'block' : 'approve'}" style="align-self:flex-start">${x.status === 'block' ? 'Confirmed fraud' : 'Released to customer'}</div>`
        : `<div class="acts"><button class="small-btn btn-approve" data-act="approve" data-id="${x.id}">${icon('check')}Release</button><button class="small-btn btn-block" data-act="block" data-id="${x.id}">${icon('x')}Confirm fraud</button></div>`}
      </div>`).join('');
  }
  render();
}
