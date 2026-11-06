import gsap from 'gsap';
import { feed } from '../api.js';
import { icon } from '../icons.js';
import { $, CATEGORIES, DECISION_LABEL, emit, esc, inView, int, usd } from '../util.js';

const CAT_ICON = { grocery: 'building-store', fuel: 'building-store', restaurants: 'building-store', fashion: 'building-store', electronics: 'device-mobile', travel: 'world-www', online_services: 'world-www', jewelry: 'sparkles', gaming_crypto: 'cash' };
const MAX_ROWS = 7;

export function initFeed() {
  const list = $('#feed-list');
  const stats = { scanned: 0, blocked: 0, money: 0, lat: [] };
  let visible = false, paused = false, timer = null, busy = false;

  async function tick() {
    if (busy || paused || !visible) return;
    busy = true;
    try {
      const { items } = await feed(3);
      for (const it of items) add(it);
    } catch { /* network hiccup: try again next tick */ }
    busy = false;
  }

  function add(it) {
    stats.scanned++;
    stats.lat.push(it.latency_ms); if (stats.lat.length > 50) stats.lat.shift();
    if (it.decision === 'block') { stats.blocked++; stats.money += it.amount; }
    if (it.decision !== 'approve') emit('suspicious', it);
    $('#c-scanned').textContent = int(stats.scanned);
    $('#c-blocked').textContent = int(stats.blocked);
    $('#c-money').textContent = usd(stats.money);
    const avg = stats.lat.reduce((a, b) => a + b, 0) / stats.lat.length;
    $('#c-latency').textContent = `${avg.toFixed(2)} ms`;

    const li = document.createElement('li');
    li.className = 'tx ' + it.decision;
    const why = it.decision !== 'approve' && it.reasons?.[0] ? it.reasons[0].title : `${CATEGORIES[it.merchant_category]} · ${it.city}`;
    li.innerHTML = `
      <span class="av">${icon(it.decision === 'block' ? 'alert-triangle' : CAT_ICON[it.merchant_category])}</span>
      <span style="min-width:0"><div class="m">${esc(it.merchant)}</div><div class="s">${esc(why)} · •••• ${esc(it.card_last4)}</div></span>
      <span class="bar-col"><div class="bar"><i style="width:${Math.max(4, it.risk_score)}%"></i></div><div class="s" style="margin-top:4px">risk ${it.risk_score}</div></span>
      <span class="amt mono">${usd(it.amount)}</span>
      <span class="decision ${it.decision}">${DECISION_LABEL[it.decision]}</span>`;
    list.prepend(li);
    gsap.from(li, { y: -24, opacity: 0, duration: 0.6, ease: 'power3.out' });
    while (list.children.length > MAX_ROWS) list.lastElementChild.remove();
  }

  inView($('#feed'), (v) => {
    visible = v;
    if (v && !timer) { tick(); timer = setInterval(tick, 2400); }
    if (!v && timer) { clearInterval(timer); timer = null; }
  }, { threshold: 0.1 });

  const btn = $('#feed-toggle');
  btn.addEventListener('click', () => {
    paused = !paused;
    $('#live').classList.toggle('paused', paused);
    $('#live').lastChild.textContent = paused ? ' Paused' : ' Live';
    btn.innerHTML = `${icon(paused ? 'player-play' : 'player-pause')}<span>${paused ? 'Resume' : 'Pause'}</span>`;
    if (!paused) tick();
  });
}
