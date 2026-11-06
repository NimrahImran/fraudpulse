// Point-cloud generators. Every shape returns a Float32Array of N*3 positions
// in local units, so the GPU can morph any shape into any other.

const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const gauss = () => {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

export const CARD_W = 3.4, CARD_H = 2.14;

function inRoundRect(x, y, w, h, r) {
  const ax = Math.abs(x) - (w / 2 - r), ay = Math.abs(y) - (h / 2 - r);
  if (ax <= 0 || ay <= 0) return Math.abs(x) <= w / 2 && Math.abs(y) <= h / 2;
  return ax * ax + ay * ay <= r * r;
}

function roundRectPerimeter(w, h, r) {
  // pick a random point on the outline of a rounded rectangle
  const straightX = w - 2 * r, straightY = h - 2 * r, arc = (Math.PI / 2) * r;
  const total = 2 * straightX + 2 * straightY + 4 * arc;
  let d = Math.random() * total;
  const seg = [straightX, arc, straightY, arc, straightX, arc, straightY, arc];
  let i = 0;
  while (d > seg[i]) { d -= seg[i]; i++; }
  const hw = w / 2, hh = h / 2;
  switch (i) {
    case 0: return [-hw + r + d, hh];
    case 1: { const a = Math.PI / 2 - d / r; return [hw - r + Math.cos(a) * r, hh - r + Math.sin(a) * r]; }
    case 2: return [hw, hh - r - d];
    case 3: { const a = -d / r; return [hw - r + Math.cos(a) * r, -hh + r + Math.sin(a) * r]; }
    case 4: return [hw - r - d, -hh];
    case 5: { const a = -Math.PI / 2 - d / r; return [-hw + r + Math.cos(a) * r, -hh + r + Math.sin(a) * r]; }
    case 6: return [-hw, -hh + r + d];
    default: { const a = Math.PI - d / r; return [-hw + r + Math.cos(a) * r, hh - r + Math.sin(a) * r]; }
  }
}

export function card(N) {
  const out = new Float32Array(N * 3);
  const W = CARD_W, H = CARD_H, R = 0.22;
  for (let i = 0; i < N; i++) {
    const t = Math.random();
    let x, y, z = 0;
    if (t < 0.5) { // face fill
      do { x = rnd(-W / 2, W / 2); y = rnd(-H / 2, H / 2); } while (!inRoundRect(x, y, W, H, R));
      z = Math.random() < 0.5 ? 0.035 : -0.035;
    } else if (t < 0.72) { // crisp outline
      [x, y] = roundRectPerimeter(W, H, R);
      z = rnd(-0.04, 0.04);
    } else if (t < 0.83) { // chip
      const cx = -1.05, cy = 0.28, cw = 0.52, ch = 0.4;
      if (Math.random() < 0.55) { [x, y] = roundRectPerimeter(cw, ch, 0.07); x += cx; y += cy; }
      else {
        const line = Math.floor(rnd(0, 4));
        if (line < 2) { x = cx + rnd(-cw / 2, cw / 2); y = cy + (line ? 0.07 : -0.07); }
        else { x = cx + (line === 2 ? -0.09 : 0.09); y = cy + rnd(-ch / 2, ch / 2); }
      }
      z = 0.05;
    } else if (t < 0.93) { // card number: 4 groups x 4 digits
      const g = Math.floor(rnd(0, 4)), d = Math.floor(rnd(0, 4));
      x = -1.32 + g * 0.72 + d * 0.15 + gauss() * 0.018;
      y = -0.32 + gauss() * 0.035;
      z = 0.05;
    } else if (t < 0.97) { // contactless waves
      const k = Math.floor(rnd(0, 3)), a = rnd(-0.7, 0.7), r = 0.12 + k * 0.09;
      x = -0.52 + Math.cos(a) * r; y = 0.28 + Math.sin(a) * r; z = 0.05;
    } else { // name line
      x = rnd(-1.32, -0.2); y = -0.72 + gauss() * 0.02; z = 0.05;
    }
    out.set([x, y, z], i * 3);
  }
  return out;
}

export function storm(N) {
  const out = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = Math.random(), v = Math.random();
    const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
    const r = 3.3 * Math.cbrt(rnd(0.5, 1)); // hollow centre keeps the headline readable
    out.set([r * Math.sin(ph) * Math.cos(th) * 1.25, r * Math.cos(ph) * 0.8, r * Math.sin(ph) * Math.sin(th)], i * 3);
  }
  return out;
}

export function beam(N, fraud) {
  const out = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    let x, y, z;
    if (fraud[i]) { // fraud collects in a hot pool at the base
      const a = rnd(0, Math.PI * 2), r = Math.abs(gauss()) * 0.22;
      x = Math.cos(a) * r; z = Math.sin(a) * r; y = -3 + Math.abs(gauss()) * 0.08;
    } else {
      const t = Math.random();
      if (t < 0.55) { x = gauss() * 0.07; z = gauss() * 0.07; y = rnd(-3, 3.4); }
      else if (t < 0.85) { const s = 0.18 + Math.random() * 0.25; x = gauss() * s; z = gauss() * s; y = rnd(-3, 3.4); }
      else { const a = rnd(0, Math.PI * 2), r = Math.pow(Math.random(), 0.6) * 1.6; x = Math.cos(a) * r; z = Math.sin(a) * r * 0.5; y = -3 + gauss() * 0.04; }
    }
    out.set([x, y, z], i * 3);
  }
  return out;
}

export function ring(N) {
  const out = new Float32Array(N * 3);
  const R = 2.7;
  for (let i = 0; i < N; i++) {
    const a = rnd(0, Math.PI * 2), b = rnd(0, Math.PI * 2);
    const tube = Math.random() < 0.7 ? 0.08 + Math.abs(gauss()) * 0.12 : 0.35 + Math.random() * 0.6;
    const r = R + Math.cos(b) * tube;
    out.set([Math.cos(a) * r, Math.sin(b) * tube * 0.6, Math.sin(a) * r], i * 3);
  }
  return out;
}

const SHIELD = (() => {
  // right half of a shield outline, top centre to bottom tip
  const pts = [];
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let x, y;
    if (t < 0.18) { const k = t / 0.18; x = k * 1.35; y = 1.62 - Math.sin(k * Math.PI / 2) * 0.32 - k * 0.05; }
    else { const k = (t - 0.18) / 0.82; x = 1.35 * Math.cos(k * Math.PI / 2) * (1 - 0.15 * k); y = 1.25 - k * 2.95 + Math.sin(k * Math.PI) * -0.05; }
    pts.push([x, y]);
  }
  return pts;
})();

function onPolyline(pts) {
  const i = Math.floor(Math.random() * (pts.length - 1));
  const t = Math.random();
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
}

function insideShield(x, y) {
  const ax = Math.abs(x);
  for (let i = 0; i < SHIELD.length - 1; i++) {
    const [x0, y0] = SHIELD[i], [x1, y1] = SHIELD[i + 1];
    if ((y <= y0 && y >= y1) || (y >= y0 && y <= y1)) {
      const t = (y - y0) / (y1 - y0 || 1e-6);
      return ax <= x0 + (x1 - x0) * t;
    }
  }
  return false;
}

export function shield(N) {
  const out = new Float32Array(N * 3);
  const check = [[-0.55, 0.0], [-0.12, -0.45], [0.65, 0.42]];
  for (let i = 0; i < N; i++) {
    const t = Math.random();
    let x, y, z;
    if (t < 0.38) { [x, y] = onPolyline(SHIELD); if (Math.random() < 0.5) x = -x; z = rnd(-0.12, 0.12); }
    else if (t < 0.5) { [x, y] = onPolyline(SHIELD); x *= 0.86; y = y * 0.86 + 0.02; if (Math.random() < 0.5) x = -x; z = 0.1; }
    else if (t < 0.72) { const [cx, cy] = onPolyline(check); x = cx + gauss() * 0.035; y = cy + gauss() * 0.035; z = 0.18 + gauss() * 0.03; }
    else { do { x = rnd(-1.4, 1.4); y = rnd(-1.75, 1.65); } while (!insideShield(x, y)); z = rnd(-0.1, 0.1) * 0.5; }
    out.set([x, y, z], i * 3);
  }
  return out;
}
