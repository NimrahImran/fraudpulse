import gsap from 'gsap';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const usd = (v, compact = false) => {
  if (!isFinite(v)) return '$0';
  if (compact && Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M';
  if (compact && Math.abs(v) >= 1e4) return '$' + Math.round(v / 1e3) + 'K';
  return '$' + Math.round(v).toLocaleString('en-US');
};
export const int = (v) => Math.round(v).toLocaleString('en-US');
export const pct = (v, d = 0) => (v * 100).toFixed(d) + '%';
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function countUp(el, to, fmt = int, dur = 1.6) {
  const o = { v: Number(el.dataset.v || 0) };
  el.dataset.v = to;
  gsap.to(o, { v: to, duration: dur, ease: 'power3.out', onUpdate: () => { el.textContent = fmt(o.v); } });
}

export function inView(el, cb, opts = { threshold: 0.25 }) {
  const io = new IntersectionObserver((es) => es.forEach((e) => cb(e.isIntersecting)), opts);
  io.observe(el);
  return io;
}

// tiny event bus
const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));
export const on = (name, fn) => bus.addEventListener(name, (e) => fn(e.detail));

export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

export const CATEGORIES = { grocery: 'Grocery', fuel: 'Fuel', restaurants: 'Restaurant', fashion: 'Fashion', electronics: 'Electronics', travel: 'Travel', online_services: 'Online service', jewelry: 'Jewellery', gaming_crypto: 'Gaming / crypto' };
export const CHANNELS = { chip_in_store: 'Chip in store', contactless: 'Contactless', online: 'Online', atm: 'ATM' };
export const DECISION_LABEL = { block: 'Blocked', review: 'Review', approve: 'Approved' };
export const DECISION_ICON = { block: 'x', review: 'alert-triangle', approve: 'check' };

export function fieldError(input, msg) {
  const box = input.closest('.field')?.querySelector('.field-err');
  if (box) box.textContent = msg || '';
  input.setAttribute('aria-invalid', msg ? 'true' : 'false');
}
