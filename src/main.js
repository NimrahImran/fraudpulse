import '@fontsource/anton/400.css';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/jetbrains-mono';
import './style.css';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { health, modelInfo, onMode } from './api.js';
import { initResults } from './ui/results.js';
import { initScanner } from './ui/scanner.js';
import { $, $$, fieldError } from './util.js';

gsap.registerPlugin(ScrollTrigger);

// Web3Forms access key (free). Set VITE_WEB3FORMS_KEY in Vercel; messages then arrive in your inbox.
const FORM_KEY = import.meta.env.VITE_WEB3FORMS_KEY || '';
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = window.matchMedia('(pointer: fine)').matches;

async function boot() {
  $('#year').textContent = new Date().getFullYear();
  intro();
  onMode((m) => { $('#mode-badge').hidden = m !== 'edge'; });
  initScanner();
  initContact();
  health();

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
    if (lenis) lenis.scrollTo(target, { duration: 1.4, offset: a.getAttribute('href') === '#top' ? 0 : -70 });
    else target.scrollIntoView({ behavior: 'smooth' });
  }));

  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 30);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    $$('.links a').forEach((a) => a.classList.toggle('active', a.dataset.sec === e.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  $$('main > section').forEach((s) => io.observe(s));

  let metrics;
  try { metrics = await Promise.race([modelInfo(), new Promise((_, rej) => setTimeout(rej, 8000))]); }
  catch { metrics = await fetch('/model/metrics.json').then((r) => r.json()); }
  initResults(metrics);
  ScrollTrigger.refresh();
}

function intro() {
  if (reduced) { gsap.set('.reveal', { opacity: 1, y: 0 }); return; }
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  tl.from('.secure', { opacity: 0, scale: 1.06, duration: 1.6 }, 0)
    .from('.robot', { opacity: 0, y: 60, duration: 1.5 }, 0.2)
    .from('.map', { opacity: 0, duration: 1.4 }, 0.5)
    .from('.hero h1 .ln', { opacity: 0, y: 40, duration: 1, stagger: 0.12 }, 0.35)
    .from('.hero .sub, .hero .desc, .hero .btn-red', { opacity: 0, y: 24, duration: 0.9, stagger: 0.1 }, 0.7)
    .from('.float', { opacity: 0, x: 30, duration: 0.9, stagger: 0.15 }, 1)
    .from('.nav > *', { opacity: 0, y: -16, duration: 0.8, stagger: 0.08 }, 0.2);

  // gentle depth as you scroll away from the hero
  const st = { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true };
  gsap.to('.secure', { yPercent: 18, ease: 'none', scrollTrigger: st });
  gsap.to('.robot', { yPercent: -8, ease: 'none', scrollTrigger: st });

  // subtle mouse parallax on desktop
  if (fine) {
    const qx = [gsap.quickTo('.robot img', 'x', { duration: 1.2 }), gsap.quickTo('.secure', 'x', { duration: 1.6 })];
    window.addEventListener('pointermove', (e) => {
      const dx = e.clientX / window.innerWidth - 0.5;
      qx[0](dx * 14); qx[1](dx * -10);
    }, { passive: true });
  }

  ScrollTrigger.batch('.reveal', {
    start: 'top 88%',
    onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1, stagger: 0.09, ease: 'power3.out', overwrite: true }),
  });
}

function initContact() {
  const form = $('#contact-form');
  const rules = [
    ['#c-name', (v) => (v.trim().length < 2 ? 'Enter your name' : '')],
    ['#c-email', (v) => (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? 'Enter a valid email' : '')],
    ['#c-msg', (v) => (v.trim().length < 10 ? 'Write a short message (10+ characters)' : '')],
  ];
  form.addEventListener('input', (e) => fieldError(e.target, ''));
  const btn = $('#c-send');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#form-ok').textContent = ''; $('#form-err').textContent = '';
    let ok = true;
    for (const [sel, fn] of rules) { const el = $(sel); const m = fn(el.value); fieldError(el, m); if (m) ok = false; }
    if (!ok) return;
    if (!FORM_KEY) { $('#form-err').textContent = 'The contact form is not connected yet. Please try again later.'; return; }
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: FORM_KEY,
          subject: `FraudLens enquiry from ${$('#c-name').value.trim()}`,
          from_name: 'FraudLens website',
          name: $('#c-name').value.trim(),
          email: $('#c-email').value.trim(),
          message: $('#c-msg').value.trim(),
          botcheck: form.elements.botcheck.checked,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.message || 'failed');
      form.reset();
      $('#form-ok').textContent = 'Thank you! Your message has been sent. You will get a reply by email soon.';
    } catch {
      $('#form-err').textContent = 'Could not send your message. Please try again in a minute.';
    } finally {
      btn.disabled = false; btn.textContent = 'Send message';
    }
  });
}

boot();
