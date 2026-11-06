import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { icon } from '../icons.js';
import { $, esc, on, usd } from '../util.js';
import { txSummary } from './scanner.js';

const PATTERNS = [
  { key: 'card_cloning', icon: 'credit-card', title: 'Card cloning', front: 'A copied card used far from home', back: 'Skimmed card data is written onto a fake card and used abroad, often at night, for jewellery or electronics.' },
  { key: 'account_takeover', icon: 'user-x', title: 'Account takeover', front: 'Someone else logs in as the customer', back: 'A new device, wrong PIN or CVV attempts and a huge online purchase compared with the usual spend.' },
  { key: 'card_testing_bot', icon: 'robot', title: 'Card-testing bots', front: 'Tiny payments to test stolen cards', back: 'Dozens of $1 to $5 payments in a day on online services, before the big purchase.' },
  { key: 'new_account_bust_out', icon: 'user', title: 'Bust-out accounts', front: 'Fresh accounts that max out fast', back: 'Accounts only days old making large electronics and jewellery purchases.' },
  { key: 'stealth', icon: 'eye', title: 'Stealth fraud', front: 'Fraud that copies normal behaviour', back: 'The hardest case: almost nothing looks unusual. This is why borderline payments go to a human analyst.' },
];

export function initReasons(metrics) {
  const box = $('#reason-cards');
  on('scanned', ({ result, tx }) => render(result, tx));

  function render(r, tx) {
    $('#reasons-for').textContent = `Showing reasons for: ${txSummary(tx)} (risk ${r.risk_score}).`;
    const max = Math.max(...r.reasons.map((x) => Math.abs(x.impact)), 0.01);
    box.innerHTML = r.reasons.map((x, i) => `
      <div class="flip ${x.direction === 'raises' ? 'up' : 'down'}" tabindex="0" role="button" aria-label="${esc(x.title)}: ${esc(x.detail)}">
        <div class="flip-inner">
          <div class="flip-face glass">
            <div class="ico">${icon(x.icon)}</div>
            <div><div class="tag">${x.direction === 'raises' ? 'Raises risk' : 'Lowers risk'} · #${i + 1}</div><h3>${esc(x.title)}</h3></div>
          </div>
          <div class="flip-face flip-back glass">
            <p>${esc(x.detail)}</p>
            <div><div class="tag">Influence on the decision</div><div class="impact"><i style="width:${Math.round(Math.abs(x.impact) / max * 100)}%"></i></div></div>
          </div>
        </div>
      </div>`).join('') || '<p class="lead">No strong signals either way.</p>';
    bindFlip(box);
    gsap.fromTo(box.children, { rotateY: -80, opacity: 0, y: 30 }, { rotateY: 0, opacity: 1, y: 0, duration: 1, stagger: 0.08, ease: 'power3.out' });
  }

  const pr = metrics.pattern_recall || {};
  $('#pattern-cards').innerHTML = PATTERNS.map((p) => `
    <div class="flip pattern" tabindex="0" role="button" aria-label="${p.title}: ${p.back}">
      <div class="flip-inner">
        <div class="flip-face glass">
          <div class="ico">${icon(p.icon)}</div>
          <div><div class="rate">${Math.round((pr[p.key] ?? 0) * 100)}%<small>caught</small></div><h3>${p.title}</h3><div class="tag" style="margin-top:6px">${p.front}</div></div>
        </div>
        <div class="flip-face flip-back glass"><div class="ico">${icon(p.icon)}</div><p>${p.back}</p></div>
      </div>
    </div>`).join('');
  bindFlip($('#pattern-cards'));
  gsap.fromTo('#pattern-cards .flip', { rotateY: 70, opacity: 0 }, {
    rotateY: 0, opacity: 1, duration: 1.1, stagger: 0.1, ease: 'power3.out',
    scrollTrigger: { trigger: '#pattern-cards', start: 'top 85%' },
  });
}

function bindFlip(root) {
  root.querySelectorAll('.flip').forEach((f) => {
    const t = () => f.classList.toggle('flipped');
    f.addEventListener('click', t);
    f.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t(); } });
  });
}

export { usd, ScrollTrigger };
