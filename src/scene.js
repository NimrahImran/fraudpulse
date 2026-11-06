import * as THREE from 'three';
import { beam, card, CARD_W, ring, storm } from './shapes.js';

const FOV = 35, CAM_Z = 10;
const VIEW_H = 2 * CAM_Z * Math.tan((FOV / 2) * Math.PI / 180);

// shapes: 0 hero card · 1 dust sphere · 2 light beam · 3 scanner card · 4 results cloud · 5 contact ring
export const SHAPES = 6;

const bgVert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// deep green room with a mint light falling from the top, slow fog
const bgFrag = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uAspect, uLight;
  uniform vec2 uMouse;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; } return v; }

  void main() {
    vec2 uv = vUv;
    vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
    vec3 deep = vec3(0.008, 0.035, 0.024);
    vec3 mid = vec3(0.035, 0.16, 0.11);
    // room glow, brighter towards the top centre
    float room = smoothstep(1.2, 0.0, length(p * vec2(0.8, 1.1) - vec2(uMouse.x * 0.04, 0.18)));
    vec3 col = mix(deep, mid, room * 0.9);
    // light cone from the top
    float cone = smoothstep(0.42, 0.0, abs(p.x) - (1.0 - uv.y) * 0.18) * smoothstep(0.0, 1.0, uv.y);
    col += vec3(0.25, 0.75, 0.55) * cone * 0.22 * uLight;
    float top = exp(-pow((uv.y - 1.0) / 0.05, 2.0)) * smoothstep(0.35, 0.0, abs(p.x));
    col += vec3(0.55, 1.0, 0.8) * top * 0.35 * uLight;
    // drifting fog
    float f = fbm(p * 2.2 + vec2(uTime * 0.02, -uTime * 0.015));
    col += vec3(0.05, 0.18, 0.13) * f * 0.35;
    // vignette
    col *= mix(0.55, 1.0, smoothstep(1.15, 0.2, length(p * vec2(0.9, 1.0))));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const pVert = /* glsl */`
  attribute vec3 aCard, aStorm, aBeam, aRing;
  attribute vec4 aRand;
  attribute float aPulse;
  uniform float uShape, uTime, uPix, uSize, uAlert, uScanY, uScanOn;
  uniform vec3 uOff[6];
  uniform float uScl[6];
  uniform vec2 uRot0, uRot3;
  varying float vFraud, vBand, vGlow, vCard, vDepth;

  mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
  mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }

  vec3 shapePos(float i) {
    if (i < 0.5) return rotY(uRot0.x) * rotX(uRot0.y) * aCard * uScl[0] + uOff[0];
    if (i < 1.5) {
      vec3 p = rotY(uTime * 0.08 + aRand.x * 0.2) * aStorm;
      p += 0.06 * vec3(sin(uTime * 0.7 + aRand.y * 9.0), cos(uTime * 0.6 + aRand.z * 9.0), 0.0);
      return p * uScl[1] + uOff[1];
    }
    if (i < 2.5) {
      vec3 p = aBeam;
      if (aBeam.y > -2.9) p.y = mod(p.y + 3.0 + uTime * (0.35 + aRand.z * 0.6), 6.6) - 3.0;
      return rotY(uTime * 0.25) * p * uScl[2] + uOff[2];
    }
    if (i < 3.5) {
      vec3 p = rotY(uRot3.x) * rotX(uRot3.y) * aCard;
      p += (aRand.yzw - 0.5) * 0.1 * uAlert * sin(uTime * 28.0 + aRand.x * 50.0);
      return p * uScl[3] + uOff[3];
    }
    if (i < 4.5) return rotY(uTime * 0.03) * aStorm * uScl[4] + uOff[4];
    return rotX(1.1 + sin(uTime * 0.3) * 0.15) * rotY(uTime * 0.12) * aRing * uScl[5] + uOff[5];
  }

  void main() {
    float s0 = floor(uShape);
    float s1 = min(s0 + 1.0, 5.0);
    float f = uShape - s0;
    float d = aRand.x * 0.4;
    float k = smoothstep(d, d + 0.6, f);
    vec3 pos = mix(shapePos(s0), shapePos(s1), k);
    float burst = sin(k * 3.14159);
    pos += (aRand.yzw - 0.5) * burst * 2.2;
    pos.y -= burst * burst * 1.4 * aRand.z;   // dust falls while it travels

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    vDepth = clamp((mv.z + 14.0) / 7.0, 0.0, 1.0);
    vFraud = aRand.w;
    float onCard = max(1.0 - smoothstep(0.0, 0.45, abs(uShape)), 1.0 - smoothstep(0.0, 0.45, abs(uShape - 3.0)));
    vCard = 1.0 - smoothstep(0.0, 0.45, abs(uShape - 3.0));
    float sweep = mod(uTime * 1.1, 4.4) - 2.2;
    vGlow = aPulse * onCard * (0.35 + 1.6 * exp(-pow((aCard.x - sweep) / 0.35, 2.0)));
    vBand = uScanOn * vCard * exp(-pow((aCard.y / 1.07 - uScanY) / 0.07, 2.0));
    float size = uSize * (0.6 + aRand.y * 0.8) * (1.0 + vBand * 1.5 + vGlow * 0.6);
    gl_PointSize = size * uPix * (CAM_Z_F / -mv.z);
  }
`.replace('CAM_Z_F', CAM_Z.toFixed(1));

const pFrag = /* glsl */`
  precision highp float;
  uniform float uShape, uAlert, uSafe, uAlpha;
  varying float vFraud, vBand, vGlow, vCard, vDepth;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5) discard;
    float core = exp(-r * r * 22.0);
    vec3 mint = vec3(0.50, 0.95, 0.76);
    vec3 pale = vec3(0.86, 1.0, 0.94);
    vec3 col = mix(mint, pale, 0.3 + vGlow * 0.5);
    float redVis = smoothstep(1.2, 1.8, uShape) * (1.0 - smoothstep(2.4, 2.9, uShape));
    vec3 hot = vec3(1.0, 0.42, 0.22);
    float isFraud = step(0.5, vFraud);
    col = mix(col, hot, isFraud * redVis);
    col = mix(col, vec3(1.0, 0.28, 0.2), uAlert * vCard);
    col = mix(col, pale, vBand);
    float a = core * (0.4 + vDepth * 0.25 + vGlow * 0.5 + vBand * 0.8 + uSafe * vCard * 0.25) * uAlpha;
    a += core * isFraud * redVis * 0.9 * uAlpha;
    gl_FragColor = vec4(col * a, a);
  }
`;

export class Scene {
  constructor(canvas, { mobile }) {
    this.mobile = mobile;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.6 : 1.75);
    this.renderer.setPixelRatio(this.dpr);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    this.camera.position.z = CAM_Z;
    this.mouse = new THREE.Vector2();
    this.mouseEase = new THREE.Vector2();
    this.clock = new THREE.Clock();
    this.state = { shape: 0, alpha: 1, light: 1, alert: 0, safe: 0, scanY: -1, scanOn: 0 };
    this.anchors = {};

    this.bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: bgVert, fragmentShader: bgFrag, depthTest: false, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uAspect: { value: 1 }, uLight: { value: 1 }, uMouse: { value: new THREE.Vector2() } },
    }));
    this.bg.frustumCulled = false;
    this.bg.renderOrder = -1;
    this.scene.add(this.bg);

    const N = mobile ? 15000 : 32000;
    const fraud = new Uint8Array(N);
    for (let i = 0; i < N; i++) fraud[i] = Math.random() < 0.018 ? 1 : 0;
    const rand = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) rand.set([Math.random(), Math.random(), Math.random(), fraud[i]], i * 4);
    const c = card(N);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(c.pos, 3));
    g.setAttribute('aCard', new THREE.BufferAttribute(c.pos, 3));
    g.setAttribute('aPulse', new THREE.BufferAttribute(c.pulse, 1));
    g.setAttribute('aStorm', new THREE.BufferAttribute(storm(N), 3));
    g.setAttribute('aBeam', new THREE.BufferAttribute(beam(N, fraud), 3));
    g.setAttribute('aRing', new THREE.BufferAttribute(ring(N), 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
    this.uniforms = {
      uShape: { value: 0 }, uTime: { value: 0 }, uPix: { value: this.dpr }, uSize: { value: mobile ? 3.4 : 3.2 },
      uAlert: { value: 0 }, uSafe: { value: 0 }, uScanY: { value: -1 }, uScanOn: { value: 0 }, uAlpha: { value: 1 },
      uOff: { value: Array.from({ length: SHAPES }, () => new THREE.Vector3()) },
      uScl: { value: new Array(SHAPES).fill(1) },
      uRot0: { value: new THREE.Vector2() }, uRot3: { value: new THREE.Vector2() },
    };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: pVert, fragmentShader: pFrag, uniforms: this.uniforms,
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    }));
    this.points.material.blending = THREE.AdditiveBlending;
    this.points.material.premultipliedAlpha = true;
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (!mobile) {
      window.addEventListener('pointermove', (e) => {
        this.mouse.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight * 2 - 1));
      }, { passive: true });
    }
    this.running = true;
    document.addEventListener('visibilitychange', () => {
      this.running = !document.hidden;
      if (this.running) { this.clock.getDelta(); this.loop(); }
    });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.bg.material.uniforms.uAspect.value = w / h;
  }

  toWorld(px, py, out) {
    out.set((px / this.w - 0.5) * VIEW_H * (this.w / this.h), -(py / this.h - 0.5) * VIEW_H, 0);
    return out;
  }

  pxToWorld(px) { return px / this.h * VIEW_H; }

  setAnchor(i, fn) { this.anchors[i] = fn; }

  updateAnchors() {
    const u = this.uniforms;
    for (const [k, fn] of Object.entries(this.anchors)) {
      const a = fn(this.w, this.h);
      if (!a) continue;
      this.toWorld(a.x, a.y, u.uOff.value[k]);
      u.uOff.value[k].z = a.z || 0;
      u.uScl.value[k] = a.scale != null ? a.scale : this.pxToWorld(a.size) / CARD_W;
    }
  }

  start() { this.loop(); }

  loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    this.mouseEase.lerp(this.mouse, 1 - Math.pow(0.001, dt));
    const u = this.uniforms, s = this.state;
    const ease = 1 - Math.pow(0.0005, dt);
    u.uShape.value += (s.shape - u.uShape.value) * Math.min(1, ease * 1.8);
    u.uAlpha.value += (s.alpha - u.uAlpha.value) * ease;
    u.uAlert.value += (s.alert - u.uAlert.value) * ease;
    u.uSafe.value += (s.safe - u.uSafe.value) * ease;
    u.uScanOn.value += (s.scanOn - u.uScanOn.value) * ease * 2;
    u.uScanY.value = s.scanY;
    u.uTime.value = t;
    u.uRot0.value.set(-0.42 + Math.sin(t * 0.35) * 0.3 + this.mouseEase.x * 0.35, -0.28 + Math.sin(t * 0.27) * 0.08 - this.mouseEase.y * 0.2);
    u.uRot3.value.set(Math.sin(t * 0.5) * 0.16 + this.mouseEase.x * 0.12, Math.sin(t * 0.4) * 0.05);
    this.updateAnchors();
    const bu = this.bg.material.uniforms;
    bu.uTime.value = t;
    bu.uMouse.value.copy(this.mouseEase);
    bu.uLight.value += (s.light - bu.uLight.value) * ease;
    this.renderer.render(this.scene, this.camera);
  }
}
