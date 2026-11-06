import * as THREE from 'three';
import { beam, card, ring, shield, storm, CARD_W } from './shapes.js';

const FOV = 35, CAM_Z = 10;
const VIEW_H = 2 * CAM_Z * Math.tan((FOV / 2) * Math.PI / 180); // world height visible at z=0

const silkVert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Animated silk in the exact mint palette taken from the reference fabric.
const silkFrag = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uScroll, uAspect;
  uniform vec2 uMouse;

  vec3 palette(float t) {
    vec3 c0 = vec3(0.243, 0.459, 0.380); // #3E7561
    vec3 c1 = vec3(0.427, 0.604, 0.541); // #6D9A8A
    vec3 c2 = vec3(0.533, 0.694, 0.643); // #88B1A4
    vec3 c3 = vec3(0.643, 0.776, 0.741); // #A4C6BD
    vec3 c4 = vec3(0.800, 0.882, 0.855);
    vec3 c5 = vec3(0.925, 0.960, 0.945);
    if (t < 0.2) return mix(c0, c1, t / 0.2);
    if (t < 0.42) return mix(c1, c2, (t - 0.2) / 0.22);
    if (t < 0.64) return mix(c2, c3, (t - 0.42) / 0.22);
    if (t < 0.84) return mix(c3, c4, (t - 0.64) / 0.2);
    return mix(c4, c5, clamp((t - 0.84) / 0.16, 0.0, 1.0));
  }

  float folds(vec2 p, float t) {
    float h = sin(p.x * 1.15 + 1.9 * sin(p.y * 0.9 + t * 0.11) + t * 0.07);
    h += 0.65 * sin(p.x * 0.55 - p.y * 1.6 + 1.2 * sin(p.x * 0.8 - t * 0.09) + 2.0);
    h += 0.35 * sin((p.x + p.y) * 2.1 + t * 0.15 + sin(p.y * 2.4) * 0.8);
    return h;
  }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * 3.2;
    p += vec2(uMouse.x * 0.12, uMouse.y * 0.08);
    p.y += uScroll * 0.9;
    float t = uTime;
    float e = 0.015;
    float h = folds(p, t);
    float hx = folds(p + vec2(e, 0.0), t);
    float hy = folds(p + vec2(0.0, e), t);
    vec3 n = normalize(vec3(-(hx - h) / e, -(hy - h) / e, 2.4));
    vec3 L = normalize(vec3(-0.45, 0.6, 0.65));
    float diff = clamp(dot(n, L), 0.0, 1.0);
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float spec = pow(clamp(dot(n, H), 0.0, 1.0), 26.0);
    float shade = 0.12 + diff * 0.78 + spec * 0.5;
    vec3 col = palette(clamp(shade, 0.0, 1.0));
    float vig = smoothstep(1.25, 0.25, length((vUv - 0.5) * vec2(1.0, 1.25)));
    col *= mix(0.86, 1.0, vig);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const pVert = /* glsl */`
  attribute vec3 aCard, aStorm, aBeam, aRing, aShield;
  attribute vec4 aRand;
  uniform float uShape, uTime, uPix, uSize, uAlert, uSafe, uScanY, uScanOn;
  uniform vec3 uOff[6];
  uniform float uScl[6];
  uniform vec2 uRot0, uRot3;
  varying float vDepth, vFraud, vBand, vAlpha, vCardness;

  mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
  mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }

  vec3 shapePos(float i) {
    if (i < 0.5) return rotY(uRot0.x) * rotX(uRot0.y) * aCard * uScl[0] + uOff[0];
    if (i < 1.5) {
      float a = uTime * 0.06 + aRand.x * 0.3;
      vec3 p = rotY(a) * aStorm;
      p.y += sin(uTime * 0.5 + aRand.y * 6.28) * 0.12;
      return p * uScl[1] + uOff[1];
    }
    if (i < 2.5) {
      vec3 p = aBeam;
      p.y = mod(p.y + 3.0 + uTime * (0.25 + aRand.z * 0.5) * step(-2.9, aBeam.y), 6.4) - 3.0;
      return rotY(uTime * 0.2) * p * uScl[2] + uOff[2];
    }
    if (i < 3.5) {
      vec3 p = rotY(uRot3.x) * rotX(uRot3.y) * aCard;
      p += (aRand.yzw - 0.5) * 0.12 * uAlert * sin(uTime * 30.0 + aRand.x * 50.0);
      return p * uScl[3] + uOff[3];
    }
    if (i < 4.5) return rotX(0.42) * rotY(uTime * 0.05) * aRing * uScl[4] + uOff[4];
    return rotY(sin(uTime * 0.4) * 0.35) * aShield * uScl[5] + uOff[5];
  }

  void main() {
    float s0 = floor(uShape);
    float s1 = min(s0 + 1.0, 5.0);
    float f = uShape - s0;
    float d = aRand.x * 0.45;
    float k = smoothstep(d, d + 0.55, f);
    vec3 pos = mix(shapePos(s0), shapePos(s1), k);
    float burst = sin(k * 3.14159);
    pos += (aRand.yzw - 0.5) * burst * 2.4;
    pos.y -= burst * burst * 0.8 * aRand.z; // dust falls a little while it travels
    pos += 0.012 * vec3(sin(uTime * 1.3 + aRand.x * 40.0), cos(uTime * 1.1 + aRand.y * 40.0), 0.0);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    vDepth = clamp((mv.z + 13.0) / 6.0, 0.0, 1.0);
    vFraud = aRand.w;
    float cardness = (1.0 - smoothstep(0.0, 0.5, abs(uShape - 3.0))) ;
    vCardness = cardness;
    vBand = uScanOn * cardness * exp(-pow((aCard.y / 1.07 - uScanY) / 0.08, 2.0));
    vAlpha = 1.0;
    float size = uSize * (0.75 + aRand.y * 0.7) * (1.0 + vBand * 1.6);
    gl_PointSize = size * uPix * (CAM_Z_F / -mv.z);
  }
`.replace('CAM_Z_F', CAM_Z.toFixed(1));

const pFrag = /* glsl */`
  precision highp float;
  uniform float uShape, uAlert, uSafe, uAlpha, uRedOn;
  varying float vDepth, vFraud, vBand, vAlpha, vCardness;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5) discard;
    float soft = smoothstep(0.5, 0.15, r);
    vec3 deep = vec3(0.05, 0.17, 0.13);
    vec3 pearl = vec3(1.0, 0.99, 0.965);
    vec3 col = mix(deep, pearl, smoothstep(0.25, 0.75, vDepth));
    float redVis = smoothstep(0.6, 1.0, uShape) * (1.0 - smoothstep(2.4, 2.9, uShape)) * uRedOn;
    vec3 red = vec3(0.86, 0.2, 0.15);
    col = mix(col, red, step(0.5, vFraud) * redVis);
    col = mix(col, red, uAlert * vCardness * (0.55 + 0.45 * step(0.5, fract(vFraud * 7.0 + 0.3))));
    col = mix(col, vec3(0.80, 1.0, 0.90), uSafe * vCardness * 0.6);
    col = mix(col, pearl, vBand);
    float a = soft * (0.8 + vDepth * 0.2) * uAlpha;
    a = max(a, step(0.5, vFraud) * redVis * soft * uAlpha);
    gl_FragColor = vec4(col, a);
  }
`;

export class Scene {
  constructor(canvas, { mobile }) {
    this.mobile = mobile;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.6 : 1.75);
    this.renderer.setPixelRatio(this.dpr);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    this.camera.position.z = CAM_Z;
    this.mouse = new THREE.Vector2();
    this.mouseEase = new THREE.Vector2();
    this.clock = new THREE.Clock();
    this.state = { shape: 0, alpha: 1, alert: 0, safe: 0, scanY: -1, scanOn: 0 };
    this.anchors = {}; // shape index -> () => {x, y, sizePx}

    // silk background
    this.silk = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: silkVert, fragmentShader: silkFrag, depthTest: false, depthWrite: false,
        uniforms: { uTime: { value: 0 }, uScroll: { value: 0 }, uAspect: { value: 1 }, uMouse: { value: new THREE.Vector2() } },
      }),
    );
    this.silk.frustumCulled = false;
    this.silk.renderOrder = -1;
    this.scene.add(this.silk);

    // particles
    const N = mobile ? 9000 : 17000;
    const fraud = new Uint8Array(N);
    for (let i = 0; i < N; i++) fraud[i] = Math.random() < 0.012 ? 1 : 0;
    const rand = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) rand.set([Math.random(), Math.random(), Math.random(), fraud[i]], i * 4);
    const g = new THREE.BufferGeometry();
    const cardPts = card(N);
    g.setAttribute('position', new THREE.BufferAttribute(cardPts, 3));
    g.setAttribute('aCard', new THREE.BufferAttribute(cardPts, 3));
    g.setAttribute('aStorm', new THREE.BufferAttribute(storm(N), 3));
    g.setAttribute('aBeam', new THREE.BufferAttribute(beam(N, fraud), 3));
    g.setAttribute('aRing', new THREE.BufferAttribute(ring(N), 3));
    g.setAttribute('aShield', new THREE.BufferAttribute(shield(N), 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
    this.uniforms = {
      uShape: { value: 0 }, uTime: { value: 0 }, uPix: { value: this.dpr }, uSize: { value: mobile ? 3.1 : 3.0 },
      uAlert: { value: 0 }, uSafe: { value: 0 }, uScanY: { value: -1 }, uScanOn: { value: 0 }, uAlpha: { value: 1 },
      uRedOn: { value: 1 },
      uOff: { value: Array.from({ length: 6 }, () => new THREE.Vector3()) },
      uScl: { value: [1, 1, 1, 1, 1, 1] },
      uRot0: { value: new THREE.Vector2() }, uRot3: { value: new THREE.Vector2() },
    };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: pVert, fragmentShader: pFrag, uniforms: this.uniforms,
      transparent: true, depthWrite: false, depthTest: false,
    }));
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
    this.silk.material.uniforms.uAspect.value = w / h;
  }

  // screen pixel -> world point on z=0 plane
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
    u.uRot0.value.set(Math.sin(t * 0.35) * 0.45 + this.mouseEase.x * 0.45, -0.18 + Math.sin(t * 0.27) * 0.08 - this.mouseEase.y * 0.25);
    u.uRot3.value.set(Math.sin(t * 0.5) * 0.18 + this.mouseEase.x * 0.15, Math.sin(t * 0.4) * 0.05);
    this.updateAnchors();
    const su = this.silk.material.uniforms;
    su.uTime.value = t;
    su.uMouse.value.copy(this.mouseEase);
    su.uScroll.value = (window.scrollY || 0) / Math.max(1, document.body.scrollHeight) ;
    this.renderer.render(this.scene, this.camera);
  }
}
