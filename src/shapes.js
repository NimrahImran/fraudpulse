// Point-cloud generators. Every shape is N*3 positions in local units so the
// GPU can morph any shape into any other.

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
  const sx = w - 2 * r, sy = h - 2 * r, arc = (Math.PI / 2) * r;
  const seg = [sx, arc, sy, arc, sx, arc, sy, arc];
  let d = Math.random() * seg.reduce((a, b) => a + b, 0), i = 0;
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

// heartbeat polyline across the card (matches the FraudPulse logo)
const PULSE = [[-1.5, -0.05], [-0.55, -0.05], [-0.35, 0.32], [-0.12, -0.55], [0.12, 0.52], [0.32, -0.05], [1.5, -0.05]];
function onPolyline(pts) {
  const lens = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); lens.push(l); total += l; }
  let d = Math.random() * total, i = 0;
  while (d > lens[i]) { d -= lens[i]; i++; }
  const t = d / lens[i];
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
}

/** Dense, slightly thick glowing card. Returns positions and a pulse flag per point. */
export function card(N) {
  const out = new Float32Array(N * 3);
  const pulse = new Float32Array(N);
  const W = CARD_W, H = CARD_H, R = 0.24;
  for (let i = 0; i < N; i++) {
    const t = Math.random();
    let x, y, z;
    if (t < 0.46) { // body volume
      do { x = rnd(-W / 2, W / 2); y = rnd(-H / 2, H / 2); } while (!inRoundRect(x, y, W, H, R));
      z = gauss() * 0.05;
    } else if (t < 0.66) { // bright rim
      [x, y] = roundRectPerimeter(W, H, R);
      x += gauss() * 0.012; y += gauss() * 0.012; z = gauss() * 0.06;
    } else if (t < 0.76) { // chip
      const cx = -1.08, cy = 0.55, cw = 0.5, ch = 0.38;
      if (Math.random() < 0.5) { [x, y] = roundRectPerimeter(cw, ch, 0.07); x += cx; y += cy; }
      else { x = cx + rnd(-cw / 2, cw / 2); y = cy + rnd(-ch / 2, ch / 2); }
      z = 0.07;
    } else if (t < 0.9) { // heartbeat line
      [x, y] = onPolyline(PULSE);
      x += gauss() * 0.014; y += gauss() * 0.014; z = 0.08 + gauss() * 0.01;
      pulse[i] = 1;
    } else { // card number dots
      const g = Math.floor(rnd(0, 4)), d = Math.floor(rnd(0, 4));
      x = -1.3 + g * 0.72 + d * 0.15 + gauss() * 0.016;
      y = -0.68 + gauss() * 0.03; z = 0.07;
    }
    out.set([x, y, z], i * 3);
  }
  return { pos: out, pulse };
}

export function storm(N) {
  const out = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = Math.random(), v = Math.random();
    const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
    const r = 2.6 * Math.cbrt(rnd(0.08, 1));
    out.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3);
  }
  return out;
}

export function beam(N, fraud) {
  const out = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    let x, y, z;
    if (fraud[i]) {
      const a = rnd(0, Math.PI * 2), r = Math.abs(gauss()) * 0.25;
      x = Math.cos(a) * r; z = Math.sin(a) * r; y = -3 + Math.abs(gauss()) * 0.12;
    } else {
      const t = Math.random();
      if (t < 0.5) { const w = 0.05 + (1 - (Math.random())) * 0.05; x = gauss() * w; z = gauss() * w; y = rnd(-3, 3.6); }
      else if (t < 0.85) { const yy = rnd(-3, 3.6); const s = 0.12 + Math.pow((3.6 - yy) / 6.6, 3) * 0.55; x = gauss() * s; z = gauss() * s; y = yy; }
      else { const a = rnd(0, Math.PI * 2), r = Math.pow(Math.random(), 0.7) * 1.9; x = Math.cos(a) * r; z = Math.sin(a) * r * 0.45; y = -3 + gauss() * 0.05; }
    }
    out.set([x, y, z], i * 3);
  }
  return out;
}

export function ring(N) {
  const out = new Float32Array(N * 3);
  const R = 2.5;
  for (let i = 0; i < N; i++) {
    const a = rnd(0, Math.PI * 2), b = rnd(0, Math.PI * 2);
    const tube = Math.random() < 0.75 ? 0.06 + Math.abs(gauss()) * 0.1 : 0.3 + Math.random() * 0.5;
    const r = R + Math.cos(b) * tube;
    out.set([Math.cos(a) * r, Math.sin(b) * tube * 0.7, Math.sin(a) * r], i * 3);
  }
  return out;
}
