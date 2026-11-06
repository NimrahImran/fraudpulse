import { getMode, predict } from '../api.js';
import { $, $$, esc } from '../util.js';
import { PRESETS } from './scanner.js';

const SAMPLE = PRESETS[1].tx;

function snippet(lang) {
  const origin = location.origin;
  const body = JSON.stringify(SAMPLE, null, 2);
  if (lang === 'python') return `<span class="k">import</span> requests

tx = ${body.replace(/true/g, 'True').replace(/false/g, 'False')}

r = requests.post(<span class="s">"${origin}/api/predict"</span>, json=tx)
result = r.json()
<span class="k">print</span>(result[<span class="s">"decision"</span>], result[<span class="s">"risk_score"</span>])
<span class="k">for</span> reason <span class="k">in</span> result[<span class="s">"reasons"</span>]:
    <span class="k">print</span>(<span class="s">"-"</span>, reason[<span class="s">"title"</span>], reason[<span class="s">"detail"</span>])`;
  if (lang === 'js') return `<span class="k">const</span> res = <span class="k">await</span> fetch(<span class="s">"${origin}/api/predict"</span>, {
  method: <span class="s">"POST"</span>,
  headers: { <span class="s">"Content-Type"</span>: <span class="s">"application/json"</span> },
  body: JSON.stringify(${body.replace(/\n/g, '\n  ')}),
});
<span class="k">const</span> { decision, risk_score, reasons } = <span class="k">await</span> res.json();`;
  return `curl -X POST <span class="s">${origin}/api/predict</span> \\
  -H <span class="s">"Content-Type: application/json"</span> \\
  -d <span class="s">'${JSON.stringify(SAMPLE)}'</span>`;
}

function highlightJSON(obj) {
  return esc(JSON.stringify(obj, null, 2))
    .replace(/(&quot;[^&]*?&quot;)(\s*:)/g, '<span class="k">$1</span>$2')
    .replace(/:\s(&quot;.*?&quot;)/g, ': <span class="s">$1</span>')
    .replace(/:\s(-?\d+\.?\d*)/g, ': <span class="n">$1</span>');
}

export function initApiDocs() {
  const pre = $('#code-pre');
  let lang = 'curl';
  const show = () => { pre.innerHTML = snippet(lang); };
  $$('.code-tabs [data-lang]').forEach((b) => b.addEventListener('click', () => {
    lang = b.dataset.lang;
    $$('.code-tabs [data-lang]').forEach((x) => x.classList.toggle('on', x === b));
    show();
  }));
  $('#api-run').addEventListener('click', async () => {
    pre.innerHTML = '<span class="k">// sending request…</span>';
    try {
      const r = await predict(SAMPLE);
      const head = getMode() === 'cloud' ? '// 200 OK · POST /api/predict' : '// edge mode: computed in your browser';
      pre.innerHTML = `<span class="k">${head}</span>\n${highlightJSON(r)}`;
    } catch {
      pre.innerHTML = '<span class="n">// request failed, try again</span>';
    }
  });
  show();
}
