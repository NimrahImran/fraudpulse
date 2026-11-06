import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { beam, card, CARD_W, ring, storm, stream } from './shapes.js';

const FOV = 35, CAM_Z = 10;
const VIEW_H = 2 * CAM_Z * Math.tan((FOV / 2) * Math.PI / 180);

// shapes: 0 hero card · 1 dust sphere · 2 light beam · 3 scanner card · 4 dust waterfall · 5 results cloud · 6 contact ring
export const SHAPES = 7;

const bgVert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

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
    vec3 deep = vec3(0.004, 0.03, 0.018);
    vec3 mid = vec3(0.03, 0.2, 0.12);
    float room = smoothstep(1.25, 0.0, length(p * vec2(0.75, 1.05) - vec2(uMouse.x * 0.03, 0.12)));
    vec3 col = mix(deep, mid, room);
    // soft cone of light from a lamp at the top centre
    float spread = 0.16 + (1.0 - uv.y) * 0.5;
    float cone = exp(-pow(p.x / spread, 2.0)) * smoothstep(-0.1, 1.0, uv.y);
    col += vec3(0.12, 0.55, 0.36) * cone * 0.26 * uLight;
    float lamp = exp(-pow((uv.y - 1.02) / 0.06, 2.0)) * exp(-pow(p.x / 0.22, 2.0));
    col += vec3(0.5, 0.95, 0.72) * lamp * 0.5 * uLight;
    float f = fbm(p * 2.0 + vec2(uTime * 0.015, -uTime * 0.012));
    col += vec3(0.02, 0.10, 0.07) * f * 0.6;
    col *= mix(0.45, 1.0, smoothstep(1.2, 0.15, length(p * vec2(0.85, 1.0))));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const pVert = /* glsl */`
  attribute vec3 aCard, aStorm, aBeam, aRing, aStream;
  attribute vec4 aRand;
  attribute float aPulse;
  uniform float uShape, uTime, uPix, uSize, uAlert, uScanY, uScanOn;
  uniform vec3 uOff[7];
  uniform float uScl[7];
  uniform vec2 uRot0, uRot3;
  varying float vFraud, vBand, vGlow, vCard, vEdge;

  mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
  mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }

  vec3 shapePos(float i) {
    if (i < 0.5) return rotY(uRot0.x) * rotX(uRot0.y) * aCard * uScl[0] + uOff[0];
    if (i < 1.5) return rotY(uTime * 0.07 + aRand.x * 0.15) * aStorm * uScl[1] + uOff[1];
    if (i < 2.5) {
      vec3 p = aBeam;
      if (aBeam.y > -2.9) p.y = mod(p.y + 3.0 + uTime * (0.25 + aRand.z * 0.45), 6.6) - 3.0;
      return rotY(uTime * 0.2) * p * uScl[2] + uOff[2];
    }
    if (i < 3.5) {
      vec3 p = rotY(uRot3.x) * rotX(uRot3.y) * aCard;
      p += (aRand.yzw - 0.5) * 0.08 * uAlert * sin(uTime * 26.0 + aRand.x * 50.0);
      return p * uScl[3] + uOff[3];
    }
    if (i < 4.5) {
      vec3 p = aStream;
      if (aStream.y > 0.0) p.y = mod(p.y - uTime * (0.35 + aRand.z * 0.4), 5.0);
      return p * uScl[4] + uOff[4];
    }
    if (i < 5.5) return rotY(uTime * 0.03) * aStorm * uScl[5] + uOff[5];
    return rotX(1.15 + sin(uTime * 0.3) * 0.12) * rotY(uTime * 0.12) * aRing * uScl[6] + uOff[6];
  }

  void main() {
    float s0 = floor(uShape);
    float s1 = min(s0 + 1.0, 6.0);
    float f = uShape - s0;
    float d = aRand.x * 0.4;
    float k = smoothstep(d, d + 0.6, f);
    vec3 pos = mix(shapePos(s0), shapePos(s1), k);
    float burst = sin(k * 3.14159);
    pos += (aRand.yzw - 0.5) * burst * 2.0;
    pos.y -= burst * burst * 1.3 * aRand.z;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    vFraud = aRand.w;
    float onCard = max(1.0 - smoothstep(0.0, 0.45, abs(uShape)), 1.0 - smoothstep(0.0, 0.45, abs(uShape - 3.0)));
    vCard = 1.0 - smoothstep(0.0, 0.45, abs(uShape - 3.0));
    float sweep = mod(uTime * 1.0, 4.4) - 2.2;
    vGlow = aPulse * onCard * (0.6 + 1.4 * exp(-pow((aCard.x - sweep) / 0.4, 2.0)));
    vBand = uScanOn * vCard * exp(-pow((aCard.y / 1.07 - uScanY) / 0.08, 2.0));
    vEdge = onCard;
    // uniform, small, soft points: no sparkle
    float size = uSize * (0.9 + aRand.y * 0.2) * (1.0 + vBand * 0.8);
    gl_PointSize = size * uPix * (CAM_Z_F / -mv.z);
  }
`.replace('CAM_Z_F', CAM_Z.toFixed(1));

const pFrag = /* glsl */`
  precision highp float;
  uniform float uShape, uAlert, uSafe, uAlpha;
  varying float vFraud, vBand, vGlow, vCard, vEdge;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r2 = dot(c, c);
    if (r2 > 0.25) discard;
    float soft = exp(-r2 * 14.0);
    vec3 mint = vec3(0.36, 0.95, 0.66);
    vec3 pale = vec3(0.78, 1.0, 0.9);
    vec3 col = mix(mint, pale, vGlow * 0.6);
    float redVis = smoothstep(1.2, 1.8, uShape) * (1.0 - smoothstep(2.4, 2.9, uShape));
    vec3 warm = vec3(1.0, 0.45, 0.18);
    float isFraud = step(0.5, vFraud);
    col = mix(col, warm, isFraud * redVis);
    col = mix(col, vec3(1.0, 0.3, 0.2), uAlert * vCard);
    col = mix(col, pale, vBand);
    float a = soft * (0.2 + vGlow * 0.35 + vBand * 0.6 + uSafe * vCard * 0.12) * uAlpha;
    a += soft * isFraud * redVis * 0.5 * uAlpha;
    gl_FragColor = vec4(col * a, a);
  }
`;

// soft volumetric column for the beam scene, with a warm pool at the base
const beamFrag = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform float uOpacity, uTime;
  void main() {
    vec2 p = vUv - vec2(0.5, 0.0);
    float y = vUv.y;
    float width = 0.035 + pow(1.0 - y, 3.0) * 0.16;
    float core = exp(-pow(p.x / width, 2.0)) * smoothstep(1.0, 0.55, y) * (0.75 + 0.25 * sin(y * 18.0 - uTime * 2.0));
    float halo = exp(-pow(p.x / (width * 3.5), 2.0)) * smoothstep(1.0, 0.2, y) * 0.35;
    vec3 green = vec3(0.25, 0.85, 0.52);
    vec3 col = green * (core * 0.55 + halo * 0.6);
    float pool = exp(-pow(p.x / 0.2, 2.0) - pow((y - 0.035) / 0.03, 2.0));
    col += vec3(1.0, 0.42, 0.14) * pool * 0.75;
    // fade to nothing at the quad edges so no box is ever visible
    float edge = smoothstep(0.5, 0.3, abs(p.x)) * smoothstep(0.0, 0.04, y) * smoothstep(1.0, 0.85, y);
    gl_FragColor = vec4(col * uOpacity * edge, 1.0);
  }
`;

export class Scene {
  constructor(canvas, { mobile }) {
    this.mobile = mobile;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.6);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // shaders already output display colours
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
    this.bg.renderOrder = -2;
    this.scene.add(this.bg);

    this.beamGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: beamFrag, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
    }));
    this.beamGlow.renderOrder = -1;
    this.beamGlow.frustumCulled = false;
    this.scene.add(this.beamGlow);

    const N = mobile ? 22000 : 46000;
    const fraud = new Uint8Array(N);
    for (let i = 0; i < N; i++) fraud[i] = Math.random() < 0.016 ? 1 : 0;
    const rand = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) rand.set([Math.random(), Math.random(), Math.random(), fraud[i]], i * 4);
    const c = card(N);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(c.pos, 3));
    g.setAttribute('aCard', new THREE.BufferAttribute(c.pos, 3));
    g.setAttribute('aPulse', new THREE.BufferAttribute(c.pulse, 1));
    g.setAttribute('aStorm', new THREE.BufferAttribute(storm(N), 3));
    g.setAttribute('aBeam', new THREE.BufferAttribute(beam(N, fraud), 3));
    g.setAttribute('aStream', new THREE.BufferAttribute(stream(N), 3));
    g.setAttribute('aRing', new THREE.BufferAttribute(ring(N), 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
    this.uniforms = {
      uShape: { value: 0 }, uTime: { value: 0 }, uPix: { value: this.dpr }, uSize: { value: mobile ? 2.6 : 2.3 },
      uAlert: { value: 0 }, uSafe: { value: 0 }, uScanY: { value: -1 }, uScanOn: { value: 0 }, uAlpha: { value: 1 },
      uOff: { value: Array.from({ length: SHAPES }, () => new THREE.Vector3()) },
      uScl: { value: new Array(SHAPES).fill(1) },
      uRot0: { value: new THREE.Vector2() }, uRot3: { value: new THREE.Vector2() },
    };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: pVert, fragmentShader: pFrag, uniforms: this.uniforms,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true,
    }));
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    // soft bloom: light spreads around the particles like a lamp in fog
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), mobile ? 0.55 : 0.62, 0.32, 0.6);
    this.composer.addPass(this.bloom);

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
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.dpr);
    this.bloom.resolution.set(w / 2, h / 2);
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
    // glow column follows the beam
    const o = u.uOff.value[2], s = u.uScl.value[2];
    this.beamGlow.position.set(o.x, o.y + 0.3 * s, -0.2);
    this.beamGlow.scale.set(4.5 * s, 6.8 * s, 1);
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
    u.uRot3.value.set(Math.sin(t * 0.5) * 0.14 + this.mouseEase.x * 0.1, Math.sin(t * 0.4) * 0.05);
    this.updateAnchors();
    const beamVis = Math.max(0, 1 - Math.abs(u.uShape.value - 2) * 1.6);
    this.beamGlow.material.uniforms.uOpacity.value = beamVis * u.uAlpha.value;
    this.beamGlow.material.uniforms.uTime.value = t;
    const bu = this.bg.material.uniforms;
    bu.uTime.value = t;
    bu.uMouse.value.copy(this.mouseEase);
    bu.uLight.value += (s.light - bu.uLight.value) * ease;
    this.composer.render();
  }
}
