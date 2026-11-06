import '@fontsource-variable/inter-tight';
import '@fontsource-variable/jetbrains-mono';
import './style.css';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { health, modelInfo, onMode } from './api.js';
import { Scene } from './scene.js';
import { initResults } from './ui/results.js';
import { initScanner } from './ui/scanner.js';
import { $, $$, fieldError } from './util.js';

gsap.registerPlugin(ScrollTrigger);

const CONTACT_EMAIL = 'nimrahimran28@gmail.com';
const mobile = window.matchMedia('(max-width: 760px)').matches || /Mobi|Android/i.test(navigator.userAgent);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// particle brightness and top light per section
const LOOK = {
  hero: [1, 1], flow: [1, 0.8], problem: [1, 0.55], scanner: [1, 1], speed: [1, 0.9], results: [0.45, 0.7], contact: [1, 0.9], about: [0.3, 0.7],
};

const loader = {
  p: 0,
  step(p, text) { this.p = Math.max(this.p, p); $('#loader-bar').style.width = `${this.p}%`; if (text) $('#loader-sub').textContent = text; },
  done() { this.step(100); setTimeout(() => $('#loader').classList.add('done'), 250); },
};

async function boot() {
  $('#year').textContent = new Date().getFullYear();
  loader.step(15);

  let scene;
  try {
    scene = new Scene($('#gl'), { mobile });
    setupAnchors(scene);
    scene.start();
  } catch (e) {
    console.warn('WebGL unavailable, static background', e);
    document.body.style.background = 'radial-gradient(80% 70% at 50% 15%, #0f3f2e, #04140e)';
    scene = { state: {}, uniforms: null };
  }
  loader.step(45, 'Loading the model…');

  onMode((m) => $('#mode-badge').classList.toggle('show', m === 'edge'));
  const timeout = new Promise((r) => setTimeout(r, 9000));
  const [, metrics] = await Promise.all([
    Promise.race([health(), timeout]),
    Promise.race([modelInfo(), timeout.then(() => fetch('/model/metrics.json').then((r) => r.json()))]),
    document.fonts?.ready,
  ]);
  loader.step(85, 'Almost ready…');

  initScanner(scene);
  initResults(metrics);
  initContact();

  const lenis = reduced ? null : new Lenis({ lerp: 0.09, smoothWheel: true });
  if (lenis) {
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const target = $(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.8 }); else target.scrollIntoView({ behavior: 'smooth' });
  }));

  // scroll position -> which 3D shape is showing
  const stops = $$('main > [data-shape]');
  const updateScroll = () => {
    if (!scene.uniforms) return;
    const y = window.scrollY, h = window.innerHeight;
    const first = stops[0];
    let shape = +first.dataset.shape, [alpha, light] = LOOK[first.id];
    for (let i = 1; i < stops.length; i++) {
      const s = stops[i];
      const t = Math.min(1, Math.max(0, (y - (s.offsetTop - h)) / (h * 0.65)));
      const e = t * t * (3 - 2 * t);
      const [a2, l2] = LOOK[s.id] || [1, 1];
      shape += (+s.dataset.shape - shape) * e;
      alpha += (a2 - alpha) * e;
      light += (l2 - light) * e;
    }
    scene.state.shape = shape;
    scene.state.alpha = alpha;
    scene.state.light = light;
    $('.scroll-down').classList.toggle('hide', y > h * 0.3);
  };
  window.addEventListener('scroll', updateScroll, { passive: true });
  window.addEventListener('resize', updateScroll);
  updateScroll();

  const navOf = { hero: 'hero', flow: 'hero', problem: 'hero', scanner: 'scanner', speed: 'results', results: 'results', contact: 'contact', about: 'about' };
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    $$('.dock a').forEach((a) => a.classList.toggle('active', a.dataset.sec === navOf[e.target.id]));
  }), { rootMargin: '-45% 0px -50% 0px' });
  stops.forEach((s) => io.observe(s));

  loader.done();
  intro();
}

function setupAnchors(scene) {
  const rect = (sel) => $(sel).getBoundingClientRect();
  scene.setAnchor(0, (w, h) => {
    const r = rect('#hero');
    return mobile
      ? (() => { const sl = rect('#hero-slot'); const cy = sl.top - r.top + sl.height / 2 - 12; return { x: w * 0.5, y: cy + Math.min(0, r.top) * 0.35, size: Math.min(w * 0.74, h * 0.46) }; })()
      : { x: w * 0.53, y: h * 0.45 + Math.min(0, r.top) * 0.35, size: Math.min(w * 0.34, 600) };
  });
  scene.setAnchor(1, (w, h) => ({ x: w * 0.5, y: h * 0.5, scale: mobile ? 0.6 : 1, z: -0.5 }));
  scene.setAnchor(2, (w, h) => {
    const r = rect('#beam-anchor');
    return { x: mobile ? w * 0.5 : Math.min(r.left + r.width * 0.42, w * 0.66), y: r.top + r.height / 2, scale: mobile ? 0.55 : 0.9 };
  });
  scene.setAnchor(3, () => {
    const a = rect('#scan-anchor'), f = rect('#scanner-frame');
    return { x: a.left, y: a.top, size: f.width * (mobile ? 0.6 : 0.33), z: 0.4 };
  });
  scene.setAnchor(4, () => {
    const c = rect('#stream-card');
    return { x: c.left + c.width / 2, y: c.top + 6, scale: scene.pxToWorld(c.width * 0.9) / 3.4, z: 0.2 };
  });
  scene.setAnchor(5, (w, h) => ({ x: w * 0.5, y: h * 0.5, scale: mobile ? 1.1 : 1.7, z: -4 }));
  scene.setAnchor(6, (w, h) => {
    const r = rect('#contact');
    const cy = Math.min(Math.max(r.top + r.height * 0.42, -h), h * 2);
    const px = mobile ? w * 0.64 : Math.min(w, h) * 0.4;
    return { x: w * 0.5, y: cy, scale: scene.pxToWorld(px) / 2.5, z: -1 };
  });
}

function intro() {
  if (reduced) { gsap.set('.reveal', { opacity: 1, y: 0 }); gsap.set('.split', { y: 0 }); return; }
  gsap.to('#hero .split', { y: 0, duration: 1.3, stagger: 0.09, ease: 'power4.out', delay: 0.3 });
  gsap.to('#hero .reveal', { opacity: 1, y: 0, duration: 1.1, stagger: 0.1, ease: 'power3.out', delay: 0.8 });
  ScrollTrigger.batch($$('.reveal').filter((el) => !el.closest('#hero')), {
    start: 'top 90%',
    onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1, stagger: 0.08, ease: 'power3.out', overwrite: true }),
  });
  // like the reference: the headline flies apart to both sides as you scroll away
  const st = { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true };
  gsap.to('#hero .hero-left', { xPercent: -60, opacity: 0, ease: 'none', scrollTrigger: st });
  gsap.to('#hero .hero-right', { xPercent: 60, opacity: 0, ease: 'none', scrollTrigger: st });
  gsap.to('#hero .hero-note', { opacity: 0, ease: 'none', scrollTrigger: st });
  gsap.fromTo('.side-card.left', { rotateY: 60, opacity: 0 }, { rotateY: 32, opacity: 1, ease: 'none', scrollTrigger: { trigger: '#speed', start: 'top 80%', end: 'top 20%', scrub: true } });
  gsap.fromTo('.side-card.right', { rotateY: -60, opacity: 0 }, { rotateY: -34, opacity: 1, ease: 'none', scrollTrigger: { trigger: '#speed', start: 'top 70%', end: 'top 10%', scrub: true } });
  // floating glass cards tilt as they enter
  gsap.utils.toArray('.cell').forEach((c, i) => {
    gsap.fromTo(c, { rotateX: 14, rotateY: i % 2 ? -6 : 6, transformPerspective: 1200 }, {
      rotateX: 0, rotateY: 0, ease: 'none', scrollTrigger: { trigger: c, start: 'top bottom', end: 'top 55%', scrub: true },
    });
  });
  ScrollTrigger.refresh();
}

function initContact() {
  const form = $('#contact-form');
  const rules = [
    ['#c-name', (v) => (v.trim().length < 2 ? 'Enter your name' : '')],
    ['#c-email', (v) => (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? 'Enter a valid email' : '')],
    ['#c-msg', (v) => (v.trim().length < 10 ? 'Write a short message (10+ characters)' : '')],
  ];
  form.addEventListener('input', (e) => fieldError(e.target, ''));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let ok = true;
    for (const [sel, fn] of rules) { const el = $(sel); const m = fn(el.value); fieldError(el, m); if (m) ok = false; }
    if (!ok) return;
    const subject = `FraudPulse enquiry from ${$('#c-name').value.trim()}`;
    const body = `${$('#c-msg').value.trim()}\n\n${$('#c-name').value.trim()}\n${$('#c-email').value.trim()}`;
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    $('#form-ok').textContent = 'Your email app is opening with the message ready. Press send there.';
  });
}

boot();
