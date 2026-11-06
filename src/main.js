import '@fontsource-variable/inter-tight';
import '@fontsource-variable/jetbrains-mono';
import './style.css';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { health, modelInfo, onMode } from './api.js';
import { hydrateIcons } from './icons.js';
import { Scene } from './scene.js';
import { initApiDocs } from './ui/apidocs.js';
import { initFeed } from './ui/feed.js';
import { initReasons } from './ui/reasons.js';
import { initResults } from './ui/results.js';
import { initScanner } from './ui/scanner.js';
import { initBatch, initCalculator, initReview } from './ui/tools.js';
import { $, $$, fieldError } from './util.js';

gsap.registerPlugin(ScrollTrigger);

const CONTACT_EMAIL = 'nimrahimran28@gmail.com';
const mobile = window.matchMedia('(max-width: 760px)').matches || /Mobi|Android/i.test(navigator.userAgent);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// how visible the particles are per section (content-heavy sections dim them)
const ALPHA = { hero: 1, storm: 1, beam: 1, scanner: 1, reasons: 0.55, feed: 0.4, results: 0.32, tools: 0.32, batch: 0.3, review: 0.3, api: 0.3, contact: 1, about: 0.45 };

const loader = {
  bar: $('#loader-bar'), sub: $('#loader-sub'), p: 0,
  step(p, text) { this.p = Math.max(this.p, p); this.bar.style.width = `${this.p}%`; if (text) this.sub.textContent = text; },
  done() { this.step(100); setTimeout(() => $('#loader').classList.add('done'), 250); },
};

async function boot() {
  hydrateIcons();
  $('#year').textContent = new Date().getFullYear();
  loader.step(15);

  // ---------- 3D scene ----------
  let scene = null;
  try {
    scene = new Scene($('#gl'), { mobile });
    setupAnchors(scene);
    scene.start();
  } catch (e) {
    console.warn('WebGL unavailable, using static background', e);
    document.body.style.background = 'radial-gradient(120% 90% at 30% 20%, #c4ddd5, #6d9a8a)';
    scene = { state: {}, uniforms: null };
  }
  loader.step(40, 'Loading the model…');

  onMode((m) => $('#mode-badge').classList.toggle('show', m === 'edge'));
  const timeout = new Promise((r) => setTimeout(r, 9000));
  const [, metrics] = await Promise.all([
    Promise.race([health(), timeout]),
    Promise.race([modelInfo(), timeout.then(() => fetch('/model/metrics.json').then((r) => r.json()))]),
    document.fonts?.ready,
  ]);
  loader.step(80, 'Almost ready…');

  // ---------- features ----------
  const scanner = initScanner(scene);
  initReasons(metrics);
  initResults(metrics);
  initCalculator(metrics);
  initBatch();
  initReview();
  initFeed();
  initApiDocs();
  initContact();
  hydrateIcons();
  scanner.runQuiet();

  // ---------- smooth scroll + scroll-driven 3D ----------
  const lenis = reduced ? null : new Lenis({ lerp: 0.1, smoothWheel: true });
  if (lenis) {
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const target = $(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.6 }); else target.scrollIntoView({ behavior: 'smooth' });
  }));

  const sections = $$('main > section');
  const updateScroll = () => {
    if (!scene.uniforms) return;
    const y = window.scrollY, h = window.innerHeight;
    let shape = +sections[0].dataset.shape, alpha = ALPHA[sections[0].id] ?? 1;
    for (let i = 1; i < sections.length; i++) {
      const s = sections[i];
      const top = s.offsetTop;
      const t = Math.min(1, Math.max(0, (y - (top - h * 1.0)) / (h * 0.6)));
      const e = t * t * (3 - 2 * t);
      shape += (+s.dataset.shape - shape) * e;
      alpha += ((ALPHA[s.id] ?? 1) - alpha) * e;
    }
    scene.state.shape = shape;
    scene.state.alpha = alpha;
  };
  window.addEventListener('scroll', updateScroll, { passive: true });
  window.addEventListener('resize', updateScroll);
  updateScroll();

  // active link in the dock
  const navMap = { hero: 'hero', storm: 'hero', beam: 'hero', scanner: 'scanner', reasons: 'scanner', feed: 'feed', results: 'results', tools: 'tools', batch: 'tools', review: 'tools', api: 'api', contact: 'about', about: 'about' };
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    const key = navMap[e.target.id];
    $$('.dock a').forEach((a) => a.classList.toggle('active', a.dataset.sec === key));
  }), { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach((s) => io.observe(s));

  loader.done();
  intro();
}

function setupAnchors(scene) {
  const rect = (sel) => $(sel)?.getBoundingClientRect();
  scene.setAnchor(0, (w, h) => {
    const r = rect('#hero');
    return { x: w * 0.5, y: r.top + r.height * (mobile ? 0.5 : 0.5), size: mobile ? w * 0.66 : Math.min(w * 0.34, 560) };
  });
  scene.setAnchor(1, (w, h) => {
    const r = rect('#storm');
    return { x: w * 0.5, y: Math.min(Math.max(r.top + r.height / 2, h * 0.2), h * 0.8), scale: mobile ? 0.62 : 1, z: -1 };
  });
  scene.setAnchor(2, (w, h) => {
    const r = rect('#beam-anchor');
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, scale: mobile ? 0.55 : 0.82 };
  });
  scene.setAnchor(3, () => {
    const a = rect('#scan-anchor'), f = rect('#scanner-frame');
    return { x: a.left, y: a.top, size: f.width * 0.66, z: 0.5 };
  });
  scene.setAnchor(4, (w, h) => ({ x: w * 0.5, y: h * 0.52, scale: mobile ? 0.9 : 1.45, z: -4 }));
  scene.setAnchor(5, () => {
    const r = rect('#shield-anchor');
    const s = Math.min(r.width * 0.8, r.height * 0.9);
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, scale: scene.pxToWorld(s) / 3.4, z: 0 };
  });
}

function intro() {
  if (reduced) { gsap.set('.reveal', { opacity: 1, y: 0 }); return; }
  const heroReveal = $$('#hero .reveal');
  gsap.to(heroReveal, { opacity: 1, y: 0, duration: 1.2, stagger: 0.08, ease: 'power4.out', delay: 0.35 });
  ScrollTrigger.batch($$('.reveal').filter((el) => !heroReveal.includes(el)), {
    start: 'top 88%',
    onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1, stagger: 0.08, ease: 'power3.out', overwrite: true }),
  });
  // hero words drift apart as you leave, like the dust taking over
  gsap.to('#hero .hero-left .hero-title', { xPercent: -18, opacity: 0, ease: 'none', scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('#hero .hero-right .hero-title', { xPercent: 18, opacity: 0, ease: 'none', scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('#storm h2', { scale: 1.08, ease: 'none', scrollTrigger: { trigger: '#storm', start: 'top bottom', end: 'bottom top', scrub: true } });
  ScrollTrigger.refresh();
}

function initContact() {
  const form = $('#contact-form');
  const rules = [['#c-name', (v) => (v.trim().length < 2 ? 'Enter your name' : '')],
    ['#c-email', (v) => (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? 'Enter a valid email' : '')],
    ['#c-msg', (v) => (v.trim().length < 10 ? 'Write a short message (10+ characters)' : '')]];
  form.addEventListener('input', (e) => fieldError(e.target, ''));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let ok = true;
    for (const [sel, fn] of rules) { const el = $(sel); const m = fn(el.value); fieldError(el, m); if (m) ok = false; }
    if (!ok) return;
    const subject = `FraudLens enquiry from ${$('#c-name').value.trim()}${$('#c-company').value.trim() ? ` (${$('#c-company').value.trim()})` : ''}`;
    const body = `${$('#c-msg').value.trim()}\n\n${$('#c-name').value.trim()}\n${$('#c-email').value.trim()}`;
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    $('#form-ok').classList.add('show');
  });
}

boot();
