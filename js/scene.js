// The 3D pool: a model of a Graphite Pools build (grey large-format paving, charcoal coping,
// a blue interior and a stacked-stone water feature) that builds itself stage by stage.
//   stage 0  excavated pit        stage 1  concrete shell and block wall
//   stage 2  coping and finish    stage 3  paving and stone cladding
//   stage 4  filled, water feature running
// Sky, ground and light come from a real Gauteng panorama/HDRI (Poly Haven "Pretoria Gardens", CC0).
import * as THREE from 'three';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { COMMON } from './glsl.js?v=1';

const ASSETS = 'assets/3d/';
const POOL = { hx: 3, hz: 1.5, depth: 1.45 };
const TOP = -0.04;          // top of the shell walls, under the coping
const WATER_FULL = -0.1;    // finished water level
const CW = 0.3;             // coping width
const GROUND_Y = -0.05;     // where the panorama's ground sits
const SLAB = { x0: -6.9, x1: 6.9, z0: -3.6, z1: 6.6 };
const WALL = { x0: 3.36, x1: 3.78, z: 1.25, h: 0.8 };   // stone feature wall at the deep end
const SPOUTS = [-0.55, 0.55];
const LIP = { x: WALL.x0 - 0.13, y: 0.52 };

// The sun's position in the panorama, so shadows agree with the photo.
const SUN_DIR = (() => {
  const el = THREE.MathUtils.degToRad(52), az = (0.6005 - 0.5) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
})();

// Camera shots. offset: how far (fraction of width) to push the subject right, clear of the text.
export const SHOTS = {
  hero:   { pos: [-5.7, 1.45, 4.0], target: [2.0, -0.2, -0.9], stage: 4, offset: 0.2 },
  dig:    { pos: [5.6, 6.4, 7.4], target: [0.2, -0.9, 0.3], stage: 0, offset: 0.16 },
  shell:  { pos: [-5.2, 3.5, 4.6], target: [0.6, -1.0, -0.3], stage: 1, offset: 0.16 },
  finish: { pos: [-1.6, 3.4, 5.4], target: [1.0, -0.8, -0.7], stage: 2, offset: 0.16 },
  pave:   { pos: [8.4, 5.0, 8.4], target: [0.4, -0.2, 0.6], stage: 3, offset: 0.16 },
  fill:   { pos: [5.9, 1.35, 2.6], target: [2.6, 0.05, -0.15], stage: 4, offset: 0.16 },
};

const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

// ---------------------------------------------------------------- shaders

const SHELL_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vN;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const SHELL_FRAG = /* glsl */ `
varying vec3 vWorld;
varying vec3 vN;
uniform float uTime, uSun, uLed, uWaterY, uFill, uShell, uFinish, uTop;
uniform vec3 uSunDir, uLed1, uLed2;
uniform vec2 uHalf;
uniform sampler2D uSoil;
${COMMON}

// smooth marbelite-style pool finish
vec3 marbelite(vec2 p){
  float n = vnoise(p * 2.6) * 0.5 + vnoise(p * 9.0) * 0.3 + vnoise(p * 31.0) * 0.2;
  vec3 c = mix(vec3(0.12, 0.40, 0.74), vec3(0.22, 0.55, 0.86), n);
  return c * (0.95 + 0.07 * hash12(floor(p * 260.0)));
}

// 25 mm glass mosaic band along the waterline
vec3 bandTiles(vec2 p){
  vec2 q = p / 0.025;
  vec2 id = floor(q), f = fract(q), fw = fwidth(q);
  float gw = 0.08;
  vec2 m = smoothstep(vec2(gw) - fw, vec2(gw) + fw, f) * (1.0 - smoothstep(vec2(1.0 - gw) - fw, vec2(1.0 - gw) + fw, f));
  float r = hash12(id);
  vec3 c = r < 0.5 ? vec3(0.035, 0.07, 0.17) : (r < 0.82 ? vec3(0.06, 0.12, 0.27) : vec3(0.02, 0.04, 0.1));
  return mix(vec3(0.45, 0.48, 0.5), c, m.x * m.y);
}

void main(){
  vec3 N = normalize(vN);
  bool floorFace = N.y > 0.5;
  vec2 tc = floorFace ? vWorld.xz : (abs(N.x) > 0.5 ? vWorld.zy : vWorld.xy);
  bool wet = uFill > 0.001 && vWorld.y < uWaterY;
  float below = wet ? uWaterY - vWorld.y : 0.0;

  // seen through moving water the walls wobble a little
  vec2 wob = vec2(vnoise(vWorld.xz * 2.3 + vec2(uTime * 0.35, uTime * 0.2)),
                  vnoise(vWorld.zx * 2.1 - vec2(uTime * 0.28, -uTime * 0.31))) - 0.5;
  tc += wob * 0.04 * smoothstep(0.0, 0.4, below);

  // ----- material for this build stage -----
  vec3 soil = texture2D(uSoil, tc * 0.42).rgb;
  vec3 concrete = vec3(0.27, 0.265, 0.255) * (0.78 + 0.4 * vnoise(tc * 5.0)) * (0.9 + 0.2 * vnoise(tc * 47.0));
  vec3 finish = marbelite(tc);
  if (!floorFace && vWorld.y > uTop - 0.17) finish = bandTiles(tc);

  float h = clamp(-vWorld.y / 1.45, 0.0, 1.0);
  float n = vnoise(tc * 3.1);
  float mShell = smoothstep(-0.04, 0.04, uShell * 1.3 - 0.15 - n * 0.3 - h * 0.5);
  float mFin   = smoothstep(-0.04, 0.04, uFinish * 1.3 - 0.15 - n * 0.3 - h * 0.5);
  vec3 alb = mix(mix(soil, concrete, mShell), finish, mFin);

  // ----- sunlight through the opening (refracted once there is water) -----
  vec3 Ld = wet ? refract(-uSunDir, vec3(0.0, 1.0, 0.0), 1.0 / 1.333) : -uSunDir;
  float topY = wet ? uWaterY : uTop;
  float t = (topY - vWorld.y) / -Ld.y;
  vec2 hit = vWorld.xz - Ld.xz * t;
  vec2 outside = abs(hit) - uHalf;
  float lit = 1.0 - smoothstep(-0.04, 0.04, max(outside.x, outside.y));
  lit *= max(dot(N, -Ld), 0.0);

  vec3 caus = caustics(hit * 1.5 + wob * 0.3, uTime * 0.55) * smoothstep(0.0, 0.2, below);
  // walls and floor see less sky the deeper they are
  float sky = (floorFace ? 0.36 : 0.44) * mix(1.0, 0.65, h);
  vec3 col = alb * (sky * uSun * vec3(0.82, 0.9, 1.0) + vec3(1.0, 0.94, 0.86) * 1.85 * uSun * lit * (0.75 + caus * 1.25));

  // water absorbs red first, then scatters a blue-green haze
  col *= exp(-below * vec3(0.52, 0.11, 0.075));
  col = mix(col, vec3(0.012, 0.16, 0.25) * (0.08 + uSun * 0.92), 1.0 - exp(-below * 0.32));

  // underwater LED lights
  float d1 = distance(vWorld, uLed1), d2 = distance(vWorld, uLed2);
  vec3 led = vec3(0.12, 0.5, 1.0) * (1.0 / (1.0 + d1 * d1 * 2.4) + 1.0 / (1.0 + d2 * d2 * 2.4));
  col += uLed * led * (alb * 3.2 + 0.04);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const WATER_SHADER = {
  name: 'PoolWater',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uNormal: { value: null },
    uTime: { value: 0 },
    uSun: { value: 1 },
    uFlow: { value: 0 },
    uLed: { value: 0 },
    uSunDir: { value: new THREE.Vector3() },
    uImp1: { value: new THREE.Vector2() },
    uImp2: { value: new THREE.Vector2() },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main(){
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse, uNormal;
    uniform float uTime, uSun, uFlow, uLed;
    uniform vec3 uSunDir;
    uniform vec2 uImp1, uImp2;
    varying vec4 vUv;
    varying vec3 vWorld;

    vec2 ripple(vec2 p, vec2 c){
      vec2 d = p - c;
      float r = length(d) + 1e-3;
      return (d / r) * sin(r * 32.0 - uTime * 11.0) * exp(-r * 2.4) * 0.07;
    }

    void main(){
      vec2 uv = vWorld.xz;
      vec3 a = texture2D(uNormal, uv * 0.5 + vec2(uTime * 0.021, uTime * 0.013)).xyz * 2.0 - 1.0;
      vec3 b = texture2D(uNormal, uv * 1.15 - vec2(uTime * 0.017, -uTime * 0.025)).xyz * 2.0 - 1.0;
      vec2 slope = (a.xy + b.xy * 0.6) * 0.085;
      slope += (ripple(uv, uImp1) + ripple(uv, uImp2)) * uFlow;
      vec3 n = normalize(vec3(slope.x, 1.0, slope.y));

      vec3 V = normalize(cameraPosition - vWorld);
      float F = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
      vec4 ruv = vUv;
      ruv.xy += slope * 0.16 * ruv.w;
      vec3 refl = texture2DProj(tDiffuse, ruv).rgb;

      vec3 R = reflect(-V, n);
      float s = max(dot(R, uSunDir), 0.0);
      vec3 spec = vec3(1.0, 0.95, 0.87) * uSun * (pow(s, 1100.0) * 45.0 + pow(s, 90.0) * 0.22);
      vec3 col = refl * F + spec + vec3(0.003, 0.025, 0.035) * uSun + vec3(0.0, 0.03, 0.08) * uLed;
      gl_FragColor = vec4(col, clamp(F + 0.035, 0.0, 1.0));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

const SHEET_FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uTime, uFlow, uSun, uLed;
${COMMON}
void main(){
  float y = vUv.y;
  float s1 = vnoise(vec2(vUv.x * 34.0, y * 2.5 - uTime * 4.8));
  float s2 = vnoise(vec2(vUv.x * 95.0, y * 7.0 - uTime * 8.5));
  float streak = s1 * 0.6 + s2 * 0.4;
  float edge = smoothstep(0.0, 0.07, vUv.x) * smoothstep(1.0, 0.93, vUv.x);
  float head = smoothstep(0.0, 0.06, uFlow * 1.15 - y);
  // a clear glassy sheet at the lip that breaks into white water as it falls
  float a = (0.22 + streak * 0.45 + y * 0.25) * edge * head;
  a *= mix(1.0, 0.4 + streak * 1.2, smoothstep(0.55, 1.0, y));
  vec3 col = mix(vec3(0.5, 0.68, 0.78), vec3(1.0), smoothstep(0.35, 0.85, streak) * (0.4 + y * 0.6));
  col = col * (0.22 + uSun * 1.05) + uLed * vec3(0.1, 0.42, 1.0) * 0.8;
  gl_FragColor = vec4(col * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const FOAM_FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uTime, uFlow, uSun, uLed;
${COMMON}
void main(){
  vec2 p = (vUv - 0.5) * vec2(1.6, 1.0);
  float r = length(p);
  float n = vnoise(p * 14.0 + vec2(0.0, uTime * 2.0)) * 0.6 + vnoise(p * 33.0 - uTime * 3.0) * 0.4;
  float a = smoothstep(0.5, 0.05, r + (n - 0.5) * 0.3) * (0.35 + n * 0.65) * uFlow;
  vec3 col = vec3(0.92, 0.97, 1.0) * (0.25 + uSun * 0.9) + uLed * vec3(0.1, 0.45, 1.0) * 0.6;
  gl_FragColor = vec4(col * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const UV_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

// ---------------------------------------------------------------- helpers

// Tileable water normal map from a sum of integer-frequency waves.
function waterNormalTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  let seed = 21;
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const waves = [];
  for (let i = 0; i < 26; i++) {
    const kx = Math.round((r() - 0.5) * 22), ky = Math.round((r() - 0.5) * 22);
    if (!kx && !ky) continue;
    waves.push([kx, ky, 1 / Math.pow(Math.hypot(kx, ky), 1.25), r() * 6.283]);
  }
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let s = 0;
    for (const [kx, ky, a, p] of waves) s += a * Math.sin(((kx * x + ky * y) / size) * 6.2832 + p);
    h[y * size + x] = s;
  }
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const hl = h[y * size + ((x - 1 + size) % size)], hr = h[y * size + ((x + 1) % size)];
    const hd = h[((y - 1 + size) % size) * size + x], hu = h[((y + 1) % size) * size + x];
    let nx = (hl - hr) * 5, ny = (hd - hu) * 5, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    const i = (y * size + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Box-project UVs in metres so photo textures keep real-world scale on any box.
function worldUV(geo, size) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    if (ny > 0.5) uv.setXY(i, x / size, z / size);
    else if (nx > 0.5) uv.setXY(i, z / size, y / size);
    else uv.setXY(i, x / size, y / size);
  }
  uv.needsUpdate = true;
  return geo;
}

// Instanced tiles: map the textures in world space, offset per tile, so no two tiles match.
function worldMappedTiles(mat, metresPerRepeat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      vec4 gwp = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vec3 gip = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      vec2 guv = gwp.xz / ${metresPerRepeat.toFixed(3)} + fract(gip.xz * vec2(0.731, 0.417)) * 7.0;
      #ifdef USE_MAP
        vMapUv = guv;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv = guv;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv = guv;
      #endif`);
  };
  mat.customProgramCacheKey = () => `world-tiles-${metresPerRepeat}`;
  return mat;
}

// ---------------------------------------------------------------- scene

export function initPoolScene(container, { reducedMotion = false, onReady, onProgress } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const maxDpr = Math.min(window.devicePixelRatio, 1.6);
  let dpr = maxDpr;
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', () => container.classList.remove('is-ready'));
  renderer.domElement.addEventListener('webglcontextrestored', () => container.classList.add('is-ready'));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 400);

  const manager = new THREE.LoadingManager(
    () => { container.classList.add('is-ready'); onReady?.(); },
    (url, loaded, total) => onProgress?.(loaded / total),
  );
  const texLoader = new THREE.TextureLoader(manager);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tex = (file, { srgb = false, repeat = 1 } = {}) => {
    const t = texLoader.load(ASSETS + file);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    t.repeat.set(repeat, repeat);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  // ----- real Gauteng garden: panorama for sky and ground, HDR for light -----
  const pano = texLoader.load(ASSETS + 'garden-panorama.jpg');
  pano.mapping = THREE.EquirectangularReflectionMapping;
  pano.colorSpace = THREE.SRGBColorSpace;
  const skybox = new GroundedSkybox(pano, 1.8, 80, 96);
  skybox.position.y = 1.8 + GROUND_Y;
  skybox.material.toneMapped = false;
  scene.add(skybox);

  new RGBELoader(manager).load(ASSETS + 'garden-light-1k.hdr', (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = hdr;
  });
  scene.environmentIntensity = 0.7;

  const sunDir = SUN_DIR.clone();
  const sun = new THREE.DirectionalLight(0xfff1e0, 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 60 });
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.025;
  sun.position.copy(sunDir).multiplyScalar(28);
  scene.add(sun, sun.target);

  const add = (geo, mat, pos = [0, 0, 0], { cast = true, receive = true, rot, parent = scene } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    m.castShadow = cast; m.receiveShadow = receive;
    parent.add(m);
    return m;
  };

  // ----- materials -----
  const soilColor = tex('soil-color.jpg', { srgb: true });
  const soilMat = new THREE.MeshStandardMaterial({ map: soilColor, normalMap: tex('soil-normal.jpg'), roughness: 1, normalScale: new THREE.Vector2(1.2, 1.2) });
  soilMat.map.repeat.set(0.42, 0.42); soilMat.normalMap.repeat.set(0.42, 0.42);

  const paverMat = worldMappedTiles(new THREE.MeshStandardMaterial({
    map: tex('paver-color.jpg', { srgb: true }), normalMap: tex('coping-normal.jpg'), roughnessMap: tex('coping-rough.jpg'),
    roughness: 0.95, normalScale: new THREE.Vector2(0.55, 0.55),
  }), 1.6);
  const charcoalMat = worldMappedTiles(new THREE.MeshPhysicalMaterial({
    map: tex('charcoal-color.jpg', { srgb: true }), normalMap: tex('charcoal-normal.jpg'),
    roughness: 0.48, clearcoat: 0.25, clearcoatRoughness: 0.35, normalScale: new THREE.Vector2(0.4, 0.4),
  }), 1.2);
  const capMat = new THREE.MeshPhysicalMaterial({
    map: tex('charcoal-color.jpg', { srgb: true }), normalMap: tex('charcoal-normal.jpg'), roughness: 0.48, clearcoat: 0.25,
  });
  const stoneMat = new THREE.MeshStandardMaterial({
    map: tex('stone-color.jpg', { srgb: true }), normalMap: tex('stone-normal.jpg'), roughness: 0.92, normalScale: new THREE.Vector2(1.4, 1.4),
  });
  const blockMat = new THREE.MeshStandardMaterial({
    map: tex('paver-color.jpg', { srgb: true }), normalMap: tex('coping-normal.jpg'), color: 0xd8d6d0, roughness: 1,
  });
  const plaster = (tint) => new THREE.MeshStandardMaterial({
    map: tex('stucco-color.jpg', { srgb: true }), normalMap: tex('stucco-normal.jpg'), roughnessMap: tex('stucco-rough.jpg'), color: tint,
  });
  const houseMat = plaster(0x8a7f78);       // warm taupe-grey render, like the house in the job photos
  const boundaryMat = plaster(0xc9c3ba);
  const screedMat = new THREE.MeshStandardMaterial({ color: 0x8d8a84, roughness: 1 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc4c9cd, metalness: 1, roughness: 0.16 });
  const whiteFrame = new THREE.MeshStandardMaterial({ color: 0xf0f0ec, roughness: 0.35 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x8fa5b0, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.42, envMapIntensity: 2.4 });
  const interior = new THREE.MeshStandardMaterial({ color: 0x15171a, emissive: 0xffc98a, emissiveIntensity: 0, roughness: 1 });

  // ----- ground: red soil (the excavation) with the pool hole cut out -----
  const holeShape = (x, z) => new THREE.Path([[-x, -z], [-x, z], [x, z], [x, -z]].map(([a, b]) => new THREE.Vector2(a, b)));
  const slabShape = () => {
    const s = new THREE.Shape([[SLAB.x0, -SLAB.z1], [SLAB.x1, -SLAB.z1], [SLAB.x1, -SLAB.z0], [SLAB.x0, -SLAB.z0]].map(([a, b]) => new THREE.Vector2(a, b)));
    s.holes.push(holeShape(POOL.hx, POOL.hz));
    return s;
  };
  const soilGeo = new THREE.ShapeGeometry(slabShape());
  soilGeo.rotateX(-Math.PI / 2);
  add(soilGeo, soilMat, [0, TOP, 0], { cast: false });
  // a skirt so the soil edge doesn't float above the lawn
  for (const [w, x, z, ry] of [[SLAB.x1 - SLAB.x0, 0, SLAB.z1, 0], [SLAB.z1 - SLAB.z0, SLAB.x1, (SLAB.z0 + SLAB.z1) / 2, Math.PI / 2], [SLAB.z1 - SLAB.z0, SLAB.x0, (SLAB.z0 + SLAB.z1) / 2, -Math.PI / 2]]) {
    add(new THREE.PlaneGeometry(w, 0.12), soilMat, [x, TOP - 0.06, z], { rot: [0, ry, 0], cast: false });
  }
  const screedGeo = new THREE.ShapeGeometry(slabShape());
  screedGeo.rotateX(-Math.PI / 2);
  const screed = add(screedGeo, screedMat, [0, TOP + 0.003, 0], { cast: false });

  // spoil heaps from the dig
  const heapGeo = (() => {
    const g = new THREE.IcosahedronGeometry(1, 5);
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = Math.sin(v.x * 5.1 + v.z * 3.3) * 0.06 + Math.sin(v.x * 11.7 - v.z * 9.1 + v.y * 4.0) * 0.03;
      v.multiplyScalar(1 + n);
      v.y = Math.max(v.y, -0.05);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return worldUV(g, 2.4);
  })();
  const heaps = [[-5.0, 3.4, 1.5, 0.75, 1.1], [4.9, 3.6, 1.2, 0.6, 1.4], [-1.6, 3.9, 0.9, 0.45, 0.8]].map(([x, z, sx, sy, sz]) => {
    const m = add(heapGeo, soilMat, [x, TOP, z]);
    m.userData.base = new THREE.Vector3(sx, sy, sz);
    m.scale.copy(m.userData.base);
    return m;
  });

  // ----- pool shell -----
  const ledPos = [new THREE.Vector3(-1.4, -0.68, -POOL.hz + 0.01), new THREE.Vector3(1.4, -0.68, -POOL.hz + 0.01)];
  const shellUniforms = {
    uTime: { value: 0 }, uSun: { value: 1 }, uLed: { value: 0 }, uWaterY: { value: -POOL.depth }, uFill: { value: 0 },
    uShell: { value: 0 }, uFinish: { value: 0 }, uTop: { value: TOP },
    uSunDir: { value: sunDir }, uLed1: { value: ledPos[0] }, uLed2: { value: ledPos[1] },
    uHalf: { value: new THREE.Vector2(POOL.hx, POOL.hz) }, uSoil: { value: soilColor },
  };
  const shellMat = new THREE.ShaderMaterial({ vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG, uniforms: shellUniforms });
  const { hx, hz, depth } = POOL;
  const wallH = depth + TOP;
  const midY = (-depth + TOP) / 2;
  add(new THREE.PlaneGeometry(hx * 2, hz * 2), shellMat, [0, -depth, 0], { rot: [-Math.PI / 2, 0, 0], cast: false });
  add(new THREE.PlaneGeometry(hx * 2, wallH), shellMat, [0, midY, -hz], { cast: false });
  add(new THREE.PlaneGeometry(hx * 2, wallH), shellMat, [0, midY, hz], { rot: [0, Math.PI, 0], cast: false });
  add(new THREE.PlaneGeometry(hz * 2, wallH), shellMat, [-hx, midY, 0], { rot: [0, Math.PI / 2, 0], cast: false });
  add(new THREE.PlaneGeometry(hz * 2, wallH), shellMat, [hx, midY, 0], { rot: [0, -Math.PI / 2, 0], cast: false });

  // LED light fittings
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x0b1a26, emissive: 0x58b8ff, emissiveIntensity: 0, roughness: 0.2 });
  const ledFittings = ledPos.map((p) => {
    const g = new THREE.Group();
    add(new THREE.CircleGeometry(0.1, 40), ledMat, [p.x, p.y, -hz + 0.012], { cast: false, parent: g });
    add(new THREE.TorusGeometry(0.11, 0.016, 10, 40), steel, [p.x, p.y, -hz + 0.01], { cast: false, parent: g });
    scene.add(g);
    return g;
  });
  const ledLight = new THREE.PointLight(0x3aa6ff, 0, 7, 1.5);
  ledLight.position.set(0, -0.2, -0.4);
  scene.add(ledLight);

  // ----- coping: charcoal tiles laid around the edge, one by one -----
  const copeGeo = new RoundedBoxGeometry(0.596, 0.05, CW - 0.004, 2, 0.012);
  copeGeo.translate(0, -0.025, 0);
  const copeTiles = [];
  for (let i = 0; i < 11; i++) { const x = -3.0 + i * 0.6; copeTiles.push([x, hz + CW / 2, 0], [x, -hz - CW / 2, 0]); }
  for (let i = 0; i < 5; i++) { const z = -1.2 + i * 0.6; copeTiles.push([hx + CW / 2, z, Math.PI / 2], [-hx - CW / 2, z, Math.PI / 2]); }
  // lay order: walk around the pool
  copeTiles.forEach((t) => { t[3] = (Math.atan2(t[1], t[0]) + Math.PI) / (Math.PI * 2); });
  const coping = new THREE.InstancedMesh(copeGeo, charcoalMat, copeTiles.length);
  coping.castShadow = coping.receiveShadow = true;
  scene.add(coping);

  // ----- pavers: 600 x 600 large-format, laid outwards from the pool -----
  const paveGeo = new RoundedBoxGeometry(0.594, 0.045, 0.594, 2, 0.005);
  paveGeo.translate(0, -0.0225, 0);
  const paveTiles = [];
  for (let x = SLAB.x0 + 0.3; x < SLAB.x1; x += 0.6) {
    for (let z = SLAB.z0 + 0.3; z < SLAB.z1; z += 0.6) {
      if (Math.abs(x) < hx + CW && Math.abs(z) < hz + CW) continue;
      const d = Math.max(Math.abs(x) - hx - CW, Math.abs(z) - hz - CW, 0);
      paveTiles.push([x, z, d]);
    }
  }
  const maxD = Math.max(...paveTiles.map((t) => t[2]));
  const pavers = new THREE.InstancedMesh(paveGeo, paverMat, paveTiles.length);
  pavers.castShadow = false; pavers.receiveShadow = true;
  const tint = new THREE.Color();
  paveTiles.forEach((t, i) => { const k = 0.93 + Math.random() * 0.1; pavers.setColorAt(i, tint.setRGB(k, k, k * 1.01)); });
  scene.add(pavers);

  // ----- water feature wall: block core, stone cladding, charcoal cap, steel spillways -----
  const wallW = WALL.x1 - WALL.x0, wallX = (WALL.x0 + WALL.x1) / 2;
  const blockGeo = worldUV(new THREE.BoxGeometry(wallW, WALL.h, WALL.z * 2), 0.8);
  blockGeo.translate(0, WALL.h / 2, 0);
  const blockWall = add(blockGeo, blockMat, [wallX, TOP, 0]);
  const cladGeo = worldUV(new THREE.BoxGeometry(wallW + 0.03, WALL.h, WALL.z * 2 + 0.03), 1.15);
  cladGeo.translate(0, WALL.h / 2, 0);
  const cladding = add(cladGeo, stoneMat, [wallX, TOP, 0]);
  const cap = add(new RoundedBoxGeometry(wallW + 0.12, 0.05, WALL.z * 2 + 0.12, 2, 0.01), capMat, [wallX, TOP + WALL.h + 0.025, 0]);
  const spouts = SPOUTS.map((z) => add(new THREE.BoxGeometry(0.16, 0.012, 0.42), steel, [WALL.x0 - 0.05, LIP.y, z]));

  // ----- house wall with sliding doors, a window, a lantern and an aircon unit -----
  const houseZ = SLAB.z0;
  add(worldUV(new THREE.BoxGeometry(12.5, 3.1, 5), 2.2), houseMat, [-1.6, 1.5, houseZ - 2.5]);
  add(worldUV(new THREE.BoxGeometry(12.6, 0.06, 0.32), 1), capMat, [-1.6, 3.06, houseZ - 0.08]);
  const doorX = -3.6, doorW = 3.0, doorH = 2.3;
  add(new THREE.BoxGeometry(doorW, doorH, 0.02), interior, [doorX, doorH / 2, houseZ + 0.006], { cast: false });
  add(new THREE.BoxGeometry(doorW, doorH, 0.01), glass, [doorX, doorH / 2, houseZ + 0.03], { cast: false, receive: false });
  for (let i = 0; i <= 3; i++) add(new THREE.BoxGeometry(0.06, doorH, 0.09), whiteFrame, [doorX - doorW / 2 + i * (doorW / 3), doorH / 2, houseZ + 0.045]);
  add(new THREE.BoxGeometry(doorW + 0.06, 0.07, 0.1), whiteFrame, [doorX, doorH, houseZ + 0.05]);
  add(new THREE.BoxGeometry(doorW + 0.06, 0.04, 0.12), whiteFrame, [doorX, 0.02, houseZ + 0.06]);
  const winX = 0.9, winY = 1.65, winW = 1.3, winH = 1.1;
  add(new THREE.BoxGeometry(winW, winH, 0.02), interior, [winX, winY, houseZ + 0.006], { cast: false });
  add(new THREE.BoxGeometry(winW, winH, 0.01), glass, [winX, winY, houseZ + 0.03], { cast: false, receive: false });
  for (const dx of [-winW / 2, 0, winW / 2]) add(new THREE.BoxGeometry(0.05, winH, 0.08), whiteFrame, [winX + dx, winY, houseZ + 0.045]);
  for (const dy of [-winH / 2, 0.1, winH / 2]) add(new THREE.BoxGeometry(winW + 0.05, 0.05, 0.08), whiteFrame, [winX, winY + dy, houseZ + 0.045]);
  add(new THREE.BoxGeometry(winW + 0.2, 0.05, 0.16), boundaryMat, [winX, winY - winH / 2 - 0.04, houseZ + 0.08]);
  // aircon unit
  const acMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f1, roughness: 0.4 });
  add(new RoundedBoxGeometry(0.85, 0.55, 0.3, 3, 0.03), acMat, [2.6, 2.35, houseZ + 0.15]);
  add(new THREE.CircleGeometry(0.19, 32), new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.8 }), [2.48, 2.35, houseZ + 0.301], { cast: false });
  // wall lantern
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, emissive: 0xffb866, emissiveIntensity: 0, roughness: 0.5 });
  add(new THREE.BoxGeometry(0.16, 0.26, 0.14), lampMat, [doorX + doorW / 2 + 0.45, 2.15, houseZ + 0.08]);
  const lampLight = new THREE.PointLight(0xffb866, 0, 6, 1.6);
  lampLight.position.set(doorX + doorW / 2 + 0.45, 2.05, houseZ + 0.35);
  scene.add(lampLight);
  // downpipe
  add(new THREE.CylinderGeometry(0.04, 0.04, 3.0, 16), whiteFrame, [4.55, 1.5, houseZ + 0.06]);
  // boundary wall continuing past the house
  add(worldUV(new THREE.BoxGeometry(2.6, 1.9, 0.22), 2.2), boundaryMat, [6.0, 0.9, houseZ - 0.11]);

  // ----- loungers, the finishing touch -----
  const cushion = new THREE.MeshPhysicalMaterial({ color: 0xe4e0d8, roughness: 0.9, sheen: 1, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.7 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a2d30, metalness: 0.6, roughness: 0.4 });
  const loungers = [[0.5, -2.7, Math.PI / 2], [2.75, -2.7, Math.PI / 2]].map(([x, z, ry]) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = ry;
    scene.add(g);
    add(new RoundedBoxGeometry(0.66, 0.09, 1.3, 4, 0.04), cushion, [0, 0.34, 0.3], { parent: g });
    add(new RoundedBoxGeometry(0.66, 0.09, 0.7, 4, 0.04), cushion, [0, 0.53, -0.6], { rot: [-0.55, 0, 0], parent: g });
    add(new THREE.BoxGeometry(0.7, 0.045, 1.9), frameMat, [0, 0.275, 0.05], { parent: g });
    for (const [lx, lz] of [[-0.31, 0.88], [0.31, 0.88], [-0.31, -0.78], [0.31, -0.78]]) add(new THREE.CylinderGeometry(0.018, 0.018, 0.27, 10), frameMat, [lx, 0.135, lz], { parent: g });
    return g;
  });

  // ----- water: planar reflection of the real scene, with a fresnel mix -----
  const normalTex = waterNormalTexture();
  const water = new Reflector(new THREE.PlaneGeometry(hx * 2, hz * 2), {
    textureWidth: 1024, textureHeight: 1024, clipBias: 0.003, shader: WATER_SHADER, multisample: 0,
  });
  water.rotation.x = -Math.PI / 2;
  const wu = water.material.uniforms;
  wu.uNormal.value = normalTex;
  wu.uSunDir.value = sunDir;
  water.material.transparent = true;
  water.material.depthWrite = false;
  Object.assign(water.material, { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
  scene.add(water);

  // ----- spillway sheets and their foam -----
  const fallT = Math.sqrt((2 * (LIP.y - WATER_FULL)) / 9.81);
  const fallV = (LIP.x - (hx - 0.42)) / fallT;
  const impacts = SPOUTS.map((z) => new THREE.Vector2(LIP.x - fallV * fallT, z));
  wu.uImp1.value.copy(impacts[0]); wu.uImp2.value.copy(impacts[1]);
  const sheetUniforms = { uTime: { value: 0 }, uFlow: { value: 0 }, uSun: { value: 1 }, uLed: { value: 0 } };
  const fx = (frag) => new THREE.ShaderMaterial({
    vertexShader: UV_VERT, fragmentShader: frag, uniforms: sheetUniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const sheetMat = fx(SHEET_FRAG), foamMat = fx(FOAM_FRAG);
  const sheetGeo = (z) => {
    const N = 28, w = 0.38, pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N, t = s * fallT;
      const x = LIP.x - fallV * t, y = LIP.y - 0.5 * 9.81 * t * t;
      pos.push(x, y, z - w / 2, x, y, z + w / 2);
      uv.push(0, s, 1, s);
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  };
  const sheets = SPOUTS.map((z) => { const m = new THREE.Mesh(sheetGeo(z), sheetMat); m.renderOrder = 3; scene.add(m); return m; });
  const foams = impacts.map((p) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.5), foamMat);
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, WATER_FULL + 0.004, p.y); m.renderOrder = 4;
    scene.add(m);
    return m;
  });

  // ---------------------------------------------------------------- build state
  const dummy = new THREE.Object3D();
  let lastStage = -1;
  function applyStage(st) {
    const shellP = clamp01(st);                 // 0..1
    const copeP = clamp01((st - 1) / 0.55);     // 1.00..1.55
    const finP = clamp01((st - 1.45) / 0.55);   // 1.45..2.00
    const paveP = clamp01(st - 2);              // 2..3
    const cladP = clamp01((st - 2.35) / 0.6);
    const fillP = clamp01((st - 3) / 0.75);
    const flowP = clamp01((st - 3.7) / 0.3);

    shellUniforms.uShell.value = shellP;
    shellUniforms.uFinish.value = finP;
    shellUniforms.uFill.value = fillP;
    const waterY = THREE.MathUtils.lerp(-depth + 0.02, WATER_FULL, ease(fillP));
    shellUniforms.uWaterY.value = waterY;
    water.visible = fillP > 0.002;
    water.position.y = waterY;
    ledFittings.forEach((g) => { g.visible = finP > 0.6; });

    heaps.forEach((h) => { const k = 1 - ease(clamp01((st - 1.3) / 0.8)); h.scale.copy(h.userData.base).multiplyScalar(Math.max(k, 0.0001)); h.visible = k > 0.001; });

    blockWall.scale.y = Math.max(ease(clamp01((st - 0.35) / 0.6)), 0.0001);
    blockWall.visible = st > 0.35;
    cladding.scale.y = Math.max(ease(cladP), 0.0001);
    cladding.visible = cladP > 0.001;
    const capOn = ease(clamp01((cladP - 0.85) / 0.15));
    cap.visible = capOn > 0.001; cap.scale.setScalar(Math.max(capOn, 0.0001));
    spouts.forEach((s) => { s.visible = capOn > 0.5; });

    copeTiles.forEach(([x, z, ry, order], i) => {
      const k = ease(clamp01((copeP * 1.3 - order) / 0.3));
      dummy.position.set(x, (1 - k) * 0.45, z);
      dummy.rotation.set(0, ry, (1 - k) * 0.25);
      dummy.scale.setScalar(k < 0.001 ? 0.0001 : 1);
      dummy.updateMatrix();
      coping.setMatrixAt(i, dummy.matrix);
    });
    coping.instanceMatrix.needsUpdate = true;

    screed.visible = paveP > 0.001;
    paveTiles.forEach(([x, z, d], i) => {
      const k = ease(clamp01((paveP * 1.35 - (d / maxD)) / 0.35));
      dummy.position.set(x, (1 - k) * 0.35, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(k < 0.001 ? 0.0001 : 1);
      dummy.updateMatrix();
      pavers.setMatrixAt(i, dummy.matrix);
    });
    pavers.instanceMatrix.needsUpdate = true;

    const lg = ease(clamp01((st - 3.55) / 0.45));
    loungers.forEach((g) => { g.visible = lg > 0.001; g.scale.setScalar(Math.max(lg, 0.0001)); });

    sheetUniforms.uFlow.value = flowP;
    wu.uFlow.value = flowP;
    sheets.forEach((s) => { s.visible = flowP > 0.001; });
    foams.forEach((f) => { f.visible = flowP > 0.001; f.position.y = waterY + 0.004; });
  }

  // ---------------------------------------------------------------- sizing
  let offsetFrac = 0, curOffset = 0, curOffsetY = 0;
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 56 : w / h < 1.2 ? 46 : 38;
    camera.updateProjectionMatrix();
    water.getRenderTarget().setSize(Math.round(w * dpr * 0.5), Math.round(h * dpr * 0.5));
  }
  new ResizeObserver(resize).observe(container);
  resize();

  // ---------------------------------------------------------------- camera, stage, day/night
  const wide = () => container.clientWidth / container.clientHeight > 1.1;
  const cur = { pos: new THREE.Vector3(...SHOTS.hero.pos), target: new THREE.Vector3(...SHOTS.hero.target) };
  const goal = { pos: cur.pos.clone(), target: cur.target.clone(), stage: 4 };
  let stage = 4, night = 0, nightGoal = 0;
  function setShot(name) {
    const s = typeof name === 'object' ? name : (SHOTS[name] || SHOTS.hero);
    goal.pos.set(...s.pos); goal.target.set(...s.target); goal.stage = s.stage;
    offsetFrac = s.offset;
    if (reducedMotion) { cur.pos.copy(goal.pos); cur.target.copy(goal.target); stage = goal.stage; }
  }
  function setNight(on) { nightGoal = on ? 1 : 0; if (reducedMotion) night = nightGoal; }

  const pointer = new THREE.Vector2();
  window.addEventListener('pointermove', (e) => {
    pointer.set(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5);
  }, { passive: true });

  const skyDay = new THREE.Color(1, 1, 1), skyNight = new THREE.Color(0.055, 0.07, 0.13);
  let visible = false, time = 0, prev = performance.now(), slowAvg = 1 / 60, frames = 0;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { rootMargin: '100px' }).observe(container);
  const sway = new THREE.Vector3(), par = new THREE.Vector2();
  applyStage(stage);

  function frame(now) {
    requestAnimationFrame(frame);
    tick(now);
  }
  function tick(now) {
    const dt = Math.min((now - prev) / 1000, 0.05); prev = now;
    if (!visible) return;
    if (!reducedMotion) time += dt;

    const k = 1 - Math.exp(-dt * 1.9);
    cur.pos.lerp(goal.pos, k);
    cur.target.lerp(goal.target, k);
    // the build runs at a steady pace, so every stage is seen going in
    const ds = goal.stage - stage;
    if (Math.abs(ds) > 1e-4) stage += Math.sign(ds) * Math.min(Math.abs(ds), dt * Math.max(0.85, Math.abs(ds) * 0.9));
    if (stage !== lastStage) { applyStage(stage); lastStage = stage; }
    night += (nightGoal - night) * (1 - Math.exp(-dt * 2.2));

    const s = reducedMotion ? 0 : 1;
    par.lerp(pointer, 1 - Math.exp(-dt * 3));
    camera.position.copy(cur.pos).add(sway.set(Math.sin(time * 0.19) * 0.1 * s + par.x * 0.5 * s, Math.sin(time * 0.15) * 0.05 * s - par.y * 0.25 * s, 0));
    camera.lookAt(cur.target);

    // shift the framing right on wide screens, so the text sits on open sky/lawn
    // on phones the text sits at the bottom instead, so lift the subject into the top half
    const isWide = wide();
    const want = isWide ? offsetFrac : 0, wantY = isWide ? 0 : 0.17;
    curOffset += (want - curOffset) * k;
    curOffsetY += (wantY - curOffsetY) * k;
    const w = container.clientWidth, h = container.clientHeight;
    if (Math.abs(curOffset) + Math.abs(curOffsetY) > 0.002) camera.setViewOffset(w, h, -w * curOffset, h * curOffsetY, w, h); else camera.clearViewOffset();

    // day ↔ night
    const fill = shellUniforms.uFill.value;
    const sunK = THREE.MathUtils.lerp(1, 0.035, night);
    sun.intensity = 2.7 * sunK;
    scene.environmentIntensity = THREE.MathUtils.lerp(0.7, 0.045, night);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(0.92, 1.18, night);
    skybox.material.color.lerpColors(skyDay, skyNight, night);
    shellUniforms.uSun.value = sunK;
    const led = night * fill * 1.35;
    shellUniforms.uLed.value = led;
    ledMat.emissiveIntensity = night * 7;
    ledLight.intensity = led * 4;
    interior.emissiveIntensity = night * 1.25;
    lampMat.emissiveIntensity = night * 9;
    lampLight.intensity = night * 6;
    wu.uSun.value = sunK; wu.uLed.value = led;
    sheetUniforms.uSun.value = sunK; sheetUniforms.uLed.value = led;

    shellUniforms.uTime.value = time;
    wu.uTime.value = time;
    sheetUniforms.uTime.value = time;

    renderer.render(scene, camera);

    // keep integrated GPUs and phones smooth: drop resolution if frames run long
    slowAvg = slowAvg * 0.95 + dt * 0.05;
    if (++frames % 90 === 0) {
      if (slowAvg > 1 / 36 && dpr > 0.65) { dpr = Math.max(0.65, dpr - 0.15); renderer.setPixelRatio(dpr); resize(); }
      else if (slowAvg < 1 / 57 && dpr < maxDpr) { dpr = Math.min(maxDpr, dpr + 0.1); renderer.setPixelRatio(dpr); resize(); }
    }
  }
  requestAnimationFrame(frame);

  return { setShot, setNight, _debug: { scene, blockWall, cladding, renderer, camera, step: (n = 60) => { for (let i = 0; i < n; i++) tick(prev + 16.7); } } };
}
