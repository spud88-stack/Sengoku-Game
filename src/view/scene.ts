import * as THREE from 'three';
import { Rng } from '../core/math';
import type { BattleDef } from '../sim/world';
import type { Terrain } from '../sim/terrain';

export interface Stage {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  /** unit vector toward the sun (or moon); the light follows the player along it */
  sunDir: THREE.Vector3;
  /** how this sky tints the ground, for things laid on it */
  groundTint: number;
  /** per-base banner meshes so captures can recolour them */
  baseFlags: THREE.Mesh[][];
  /** advance rain or snow around the camera */
  weather(dt: number, cam: THREE.Vector3): void;
  dispose(): void;
}

type SkyDef = { top: number; hor: number; sun: number; sunI: number; hemiSky: number; hemiGround: number; hemiI: number; fog: [number, number]; ground: number; exposure: number; dir: [number, number, number]; clouds: number; disc: number; stars: number };
const SKIES: Record<string, SkyDef> = {
  day: { top: 0x6f8fb0, hor: 0xd9c9a8, sun: 0xfff0d2, sunI: 2.1, hemiSky: 0xcfe0ff, hemiGround: 0x6b5a3a, hemiI: 0.95, fog: [70, 300], ground: 0xffffff, exposure: 1.05, dir: [0.45, 0.72, 0.53], clouds: 0.55, disc: 1, stars: 0 },
  // the sun going down behind the enemy lines
  dusk: { top: 0x4a4a80, hor: 0xf0a060, sun: 0xffa860, sunI: 2.2, hemiSky: 0xffc8a0, hemiGround: 0x5a4030, hemiI: 0.8, fog: [60, 280], ground: 0xffd8b8, exposure: 1.05, dir: [0.3, 0.3, 0.9], clouds: 0.5, disc: 1.2, stars: 0.15 },
  night: { top: 0x070b1c, hor: 0x27324f, sun: 0x9db8ff, sunI: 1.15, hemiSky: 0x6f86c8, hemiGround: 0x20202c, hemiI: 0.85, fog: [40, 190], ground: 0x8f9cc0, exposure: 1.15, dir: [-0.35, 0.6, 0.72], clouds: 0.3, disc: 0.35, stars: 1 },
  rain: { top: 0x47525c, hor: 0x8e989c, sun: 0xd4dde6, sunI: 1.2, hemiSky: 0xc0ccd8, hemiGround: 0x4a4a40, hemiI: 1.0, fog: [35, 200], ground: 0xb8c0b8, exposure: 1.0, dir: [0.4, 0.75, 0.5], clouds: 1, disc: 0, stars: 0 },
  snow: { top: 0x8a98a8, hor: 0xdfe6ea, sun: 0xffffff, sunI: 1.5, hemiSky: 0xe8f0ff, hemiGround: 0x8a8a90, hemiI: 1.1, fog: [40, 220], ground: 0xf4f6ff, exposure: 1.0, dir: [0.4, 0.7, 0.55], clouds: 0.9, disc: 0.15, stars: 0 },
};

const SKY_VERT = `varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
// a painted gradient with a sun (or moon), drifting clouds and, at night, stars
const SKY_FRAG = `uniform vec3 top; uniform vec3 hor; uniform vec3 sunCol; uniform vec3 sunDir;
uniform float time; uniform float clouds; uniform float disc; uniform float stars;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += noise(p) * a; p = p * 2.03 + 17.0; a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y * 2.2, 0.0, 1.0);
  vec3 col = mix(hor, top, pow(h, 0.7));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  // a wide glow, a tighter halo and the disc itself
  col += sunCol * (pow(s, 6.0) * 0.18 + pow(s, 48.0) * 0.35) * disc;
  col = mix(col, sunCol * 1.6, smoothstep(0.9993, 0.9997, s) * min(disc, 1.0));
  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y + 0.12) * 0.9 + vec2(time * 0.006, time * 0.002);
    float c = smoothstep(0.62 - clouds * 0.32, 0.92 - clouds * 0.12, fbm(uv * 1.7));
    // clouds are lit from the sun's side and fade into the haze at the horizon
    vec3 cc = mix(hor * 0.85, mix(vec3(1.0), sunCol, 0.35), 0.35 + 0.65 * pow(s, 3.0));
    cc = mix(cc, top * 0.6 + hor * 0.3, clouds * 0.45);
    col = mix(col, cc, c * smoothstep(0.0, 0.22, d.y) * (0.55 + clouds * 0.4));
    if (stars > 0.0) {
      vec2 g = floor(d.xz / (d.y + 0.35) * 260.0);
      float st = step(0.9965, hash(g)) * (0.6 + 0.4 * sin(time * 2.0 + hash(g + 3.0) * 40.0));
      col += vec3(st) * stars * smoothstep(0.08, 0.4, d.y) * (1.0 - c);
    }
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function groundTexture(def: BattleDef, rng: Rng): THREE.CanvasTexture {
  const N = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const toPx = (v: number) => ((v + def.half) / (def.half * 2)) * N;
  g.fillStyle = '#5d6b3a';
  g.fillRect(0, 0, N, N);
  // mottled grass, laid down like washes of ink
  for (let i = 0; i < 2600; i++) {
    const x = rng.next() * N,
      y = rng.next() * N,
      r = 20 + rng.next() * 90;
    const shade = rng.next();
    g.fillStyle = shade < 0.4 ? 'rgba(74,92,44,0.16)' : shade < 0.75 ? 'rgba(120,128,70,0.13)' : 'rgba(140,124,80,0.12)';
    g.beginPath();
    g.ellipse(x, y, r, r * (0.4 + rng.next() * 0.6), rng.next() * 3.14, 0, 6.28);
    g.fill();
  }
  // dirt roads between neighbouring bases
  g.lineCap = 'round';
  const bs = def.bases;
  for (let i = 0; i < bs.length; i++)
    for (let j = i + 1; j < bs.length; j++) {
      const d = Math.hypot(bs[i].x - bs[j].x, bs[i].z - bs[j].z);
      if (d > def.half * 0.95) continue;
      for (const [wid, col] of [
        [34, 'rgba(120,100,70,0.35)'],
        [20, 'rgba(146,122,86,0.55)'],
        [9, 'rgba(165,142,104,0.5)'],
      ] as const) {
        g.strokeStyle = col;
        g.lineWidth = wid;
        g.beginPath();
        g.moveTo(toPx(bs[i].x), toPx(bs[i].z));
        const mx = (bs[i].x + bs[j].x) / 2 + rng.range(-8, 8),
          mz = (bs[i].z + bs[j].z) / 2 + rng.range(-8, 8);
        g.quadraticCurveTo(toPx(mx), toPx(mz), toPx(bs[j].x), toPx(bs[j].z));
        g.stroke();
      }
    }
  // trampled clearings at each camp
  for (const b of bs) {
    const gr = g.createRadialGradient(toPx(b.x), toPx(b.z), 0, toPx(b.x), toPx(b.z), toPx(-def.half + 15));
    gr.addColorStop(0, 'rgba(160,136,98,0.85)');
    gr.addColorStop(0.7, 'rgba(150,128,90,0.5)');
    gr.addColorStop(1, 'rgba(150,128,90,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(toPx(b.x), toPx(b.z), toPx(-def.half + 15), 0, 6.28);
    g.fill();
  }
  // grain
  for (let i = 0; i < 26000; i++) {
    g.fillStyle = rng.next() < 0.5 ? 'rgba(30,40,20,0.10)' : 'rgba(220,210,160,0.07)';
    g.fillRect(rng.next() * N, rng.next() * N, 2 + rng.next() * 3, 2 + rng.next() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function monTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = fg;
  g.fillRect(0, 22, 128, 10);
  g.fillRect(0, 224, 128, 10);
  g.font = '700 92px "Hiragino Mincho ProN","Yu Mincho","Songti SC",serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The ground as a mesh: displaced by the terrain, painted with the field texture, shaded by slope and height. */
function groundMesh(def: BattleDef, terrain: Terrain, tex: THREE.Texture, tint: number): THREE.Mesh {
  const E = terrain.extent,
    half = def.half;
  const segs = Math.round((E * 2) / 2.2);
  const geo = new THREE.PlaneGeometry(E * 2, E * 2, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const n = { x: 0, y: 0, z: 0 };
  const grass = new THREE.Color(0xffffff),
    rock = new THREE.Color(0x9a8f80),
    mud = new THREE.Color(0x7a6a52),
    high = new THREE.Color(0xe4e8c8),
    c = new THREE.Color();
  const water = terrain.water;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      z = pos.getZ(i);
    const y = terrain.height(x, z);
    pos.setY(i, y);
    // the field texture covers the playable area; beyond it the edge colour carries on
    uv.setXY(i, (x + half) / (2 * half), 1 - (z + half) / (2 * half));
    terrain.normal(x, z, n);
    c.copy(grass);
    // high ground is drier and paler, slopes show bare earth, the river banks are mud
    c.lerp(high, Math.min(1, Math.max(0, (y - 3) / 12)) * 0.5);
    c.lerp(rock, Math.min(1, Math.max(0, (0.97 - n.y) / 0.17)));
    if (water !== null) c.lerp(mud, Math.min(1, Math.max(0, (water + 1.1 - y) / 0.9)));
    // a little ambient occlusion in the hollows
    const shade = 0.88 + 0.12 * Math.min(1, Math.max(0, (y + 2) / 6));
    colors[i * 3] = c.r * shade;
    colors[i * 3 + 1] = c.g * shade;
    colors[i * 3 + 2] = c.b * shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, color: tint, vertexColors: true }));
  m.receiveShadow = true;
  return m;
}

export function buildStage(def: BattleDef, teamColors: number[], teamMons: string[], terrain: Terrain, shadowSize = 2048): Stage {
  const gy = (x: number, z: number) => terrain.height(x, z);
  const rng = new Rng(77);
  const scene = new THREE.Scene();
  const sk = SKIES[def.sky ?? 'day'] ?? SKIES.day;
  const skyTop = new THREE.Color(sk.top),
    horizon = new THREE.Color(sk.hor);
  scene.background = horizon;
  scene.fog = new THREE.Fog(horizon, sk.fog[0], sk.fog[1]);
  scene.userData.exposure = sk.exposure;

  // sky dome, drawn at infinity behind everything
  const sunDir = new THREE.Vector3(...sk.dir).normalize();
  const skyUniforms = {
    top: { value: skyTop },
    hor: { value: horizon },
    sunCol: { value: new THREE.Color(sk.sun) },
    sunDir: { value: sunDir },
    time: { value: 0 },
    clouds: { value: sk.clouds },
    disc: { value: sk.disc },
    stars: { value: sk.stars },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG }));
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(sk.hemiSky, sk.hemiGround, sk.hemiI));
  const sun = new THREE.DirectionalLight(sk.sun, sk.sunI);
  sun.position.set(40, 70, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -42;
  sc.right = sc.top = 42;
  sc.near = 10;
  sc.far = 200;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  scene.add(groundMesh(def, terrain, groundTexture(def, rng), sk.ground));
  // beyond the modelled ground, a plain sheet at about the height the edges climb to
  const rimY = terrain.spec.rim * 0.8;
  // a frame of four strips around the terrain, out to the horizon (a full sheet would cover the field)
  const apronMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(0x5d6b3a).multiply(new THREE.Color(sk.ground)) });
  const E0 = terrain.extent - 2,
    FAR = 1200;
  for (const [w, d, x, z] of [
    [FAR * 2, FAR - E0, 0, (FAR + E0) / 2],
    [FAR * 2, FAR - E0, 0, -(FAR + E0) / 2],
    [FAR - E0, E0 * 2, (FAR + E0) / 2, 0],
    [FAR - E0, E0 * 2, -(FAR + E0) / 2, 0],
  ]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, d), apronMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(x, rimY - 0.5, z);
    scene.add(strip);
  }
  if (terrain.water !== null) {
    const E = terrain.extent;
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(E * 2, E * 2),
      new THREE.MeshPhongMaterial({ color: new THREE.Color(0x24414f).lerp(new THREE.Color(sk.top), 0.2), specular: 0x55606a, shininess: 60, transparent: true, opacity: 0.86, depthWrite: false }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = terrain.water;
    water.renderOrder = 1;
    scene.add(water);
  }

  // distant mountains ring the field
  const mGeo = new THREE.ConeGeometry(1, 1, 5, 1);
  const mMat = new THREE.MeshLambertMaterial({ color: 0x566070, flatShading: true });
  const mountains = new THREE.InstancedMesh(mGeo, mMat, 46);
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    sv = new THREE.Vector3(),
    pv = new THREE.Vector3();
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * 6.28 + rng.range(-0.05, 0.05),
      r = def.half + rng.range(110, 260);
    const h = rng.range(50, 130);
    pv.set(Math.sin(a) * r, h / 2 - 4 + rimY, Math.cos(a) * r);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, 6.28));
    sv.set(rng.range(60, 120), h, rng.range(60, 120));
    mountains.setMatrixAt(i, m4.compose(pv, q, sv));
  }
  scene.add(mountains);

  // trees and rocks: dense at the edges, sparse in the field, never on a camp
  const clear = (x: number, z: number) => def.bases.every((b) => Math.hypot(b.x - x, b.z - z) > 20);
  const trunkG = new THREE.CylinderGeometry(0.18, 0.28, 2.2, 5);
  trunkG.translate(0, 1.1, 0);
  const leafG = new THREE.ConeGeometry(1.7, 4.4, 6);
  leafG.translate(0, 4.2, 0);
  const NT = 420;
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: 0x3c2a1c, flatShading: true }), NT);
  const leaves = new THREE.InstancedMesh(leafG, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), NT);
  leaves.castShadow = true;
  const col = new THREE.Color();
  let tn = 0;
  for (let i = 0; i < NT * 3 && tn < NT; i++) {
    const edge = rng.chance(0.8);
    let x: number, z: number;
    if (edge) {
      const a = rng.range(0, 6.28),
        r = def.half + rng.range(2, 70);
      x = Math.sin(a) * r * 1.1;
      z = Math.cos(a) * r * 1.1;
      if (Math.abs(x) < def.half && Math.abs(z) < def.half) continue;
    } else {
      x = rng.range(-def.half, def.half);
      z = rng.range(-def.half, def.half);
      if (!clear(x, z) || (def.obstacles ?? []).every((o) => Math.hypot(o.x - x, o.z - z) > 0.1)) continue;
    }
    const s = rng.range(0.8, 1.7);
    // no trees in the river
    if (terrain.water !== null && gy(x, z) < terrain.water + 0.3) continue;
    pv.set(x, gy(x, z) - 0.15, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, 6.28));
    sv.set(s, s * rng.range(0.9, 1.3), s);
    m4.compose(pv, q, sv);
    trunks.setMatrixAt(tn, m4);
    leaves.setMatrixAt(tn, m4);
    leaves.setColorAt(tn, col.setHSL(0.24 + rng.range(-0.05, 0.04), 0.4, 0.2 + rng.range(0, 0.1)));
    tn++;
  }
  // obstacle trees inside the field
  for (const o of def.obstacles ?? []) {
    if (tn >= NT) break;
    const s = o.r * 1.1;
    pv.set(o.x, gy(o.x, o.z) - 0.15, o.z);
    q.identity();
    sv.set(s, s * 1.2, s);
    m4.compose(pv, q, sv);
    trunks.setMatrixAt(tn, m4);
    leaves.setMatrixAt(tn, m4);
    leaves.setColorAt(tn, col.setHSL(0.26, 0.42, 0.24));
    tn++;
  }
  trunks.count = leaves.count = tn;
  scene.add(trunks, leaves);

  // camps: curtain walls, banners and a watch platform
  const baseFlags: THREE.Mesh[][] = [];
  const texCache = new Map<number, THREE.Texture>();
  const flagTex = (team: number) => {
    let t = texCache.get(team);
    if (!t) {
      const c = team < 0 ? '#8a8578' : '#' + new THREE.Color(teamColors[team]).getHexString();
      t = monTexture(team < 0 ? '' : teamMons[team], c, '#f4ead2');
      texCache.set(team, t);
    }
    return t;
  };
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x5a4028, flatShading: true });
  const clothMat = new THREE.MeshLambertMaterial({ color: 0xece4cf, side: THREE.DoubleSide });
  def.bases.forEach((b) => {
    const flags: THREE.Mesh[] = [];
    // camps stand on levelled ground
    const by = gy(b.x, b.z);
    const R = b.main ? 14 : 11;
    const segs = 14;
    for (let i = 0; i < segs; i++) {
      // leave four gates
      if (i % (segs / 2) === 0 || i % (segs / 2) === 3) continue;
      const a0 = (i / segs) * 6.28,
        a1 = ((i + 1) / segs) * 6.28;
      const x0 = b.x + Math.sin(a0) * R,
        z0 = b.z + Math.cos(a0) * R,
        x1 = b.x + Math.sin(a1) * R,
        z1 = b.z + Math.cos(a1) * R;
      const len = Math.hypot(x1 - x0, z1 - z0);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.7), clothMat);
      cloth.position.set((x0 + x1) / 2, by + 1.05, (z0 + z1) / 2);
      cloth.rotation.y = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
      cloth.castShadow = true;
      scene.add(cloth);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 5), woodMat);
      post.position.set(x0, by + 1.1, z0);
      scene.add(post);
      const post2 = post.clone();
      post2.position.set(x1, by + 1.1, z1);
      scene.add(post2);
    }
    const nFlags = b.main ? 10 : 6;
    for (let i = 0; i < nFlags; i++) {
      const a = (i / nFlags) * 6.28 + 0.3,
        r = R + 1.2;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6, 5), woodMat);
      pole.position.set(b.x + Math.sin(a) * r, by + 3, b.z + Math.cos(a) * r);
      scene.add(pole);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 3.2), new THREE.MeshLambertMaterial({ map: flagTex(b.team), side: THREE.DoubleSide }));
      f.position.set(pole.position.x + Math.cos(a) * 0.6, by + 4.3, pole.position.z - Math.sin(a) * 0.6);
      f.rotation.y = a;
      f.castShadow = true;
      f.userData.phase = rng.range(0, 6);
      scene.add(f);
      flags.push(f);
    }
    // watch platform
    const tower = new THREE.Group();
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 6, 5), woodMat);
      leg.position.set(dx * 1.1, 3, dz * 1.1);
      leg.castShadow = true;
      tower.add(leg);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.2, 2.8), woodMat);
    deck.position.y = 5;
    deck.castShadow = true;
    tower.add(deck);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.3, 4), new THREE.MeshLambertMaterial({ color: 0x2b2b33, flatShading: true }));
    roof.position.y = 7.4;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    tower.add(roof);
    tower.position.set(b.x + R * 0.55, by, b.z - R * 0.55);
    scene.add(tower);
    baseFlags.push(flags);
  });

  // rain and snow are a box of streaks that follows the camera
  let weatherMesh: THREE.LineSegments | null = null;
  const wet = def.sky === 'rain' || def.sky === 'snow';
  const WN = 900;
  const wp = new Float32Array(WN * 6);
  const wo = new Float32Array(WN * 3);
  if (wet) {
    for (let i = 0; i < WN; i++) {
      wo[i * 3] = rng.range(-28, 28);
      wo[i * 3 + 1] = rng.range(0, 22);
      wo[i * 3 + 2] = rng.range(-28, 28);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(wp, 3).setUsage(THREE.DynamicDrawUsage));
    weatherMesh = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: def.sky === 'snow' ? 0xffffff : 0xc8d4e0, transparent: true, opacity: def.sky === 'snow' ? 0.8 : 0.35, fog: false }));
    weatherMesh.frustumCulled = false;
    scene.add(weatherMesh);
  }
  // torches give night battles something warm to fight around
  if (def.sky === 'night' || def.sky === 'dusk')
    for (const b of def.bases) {
      const l = new THREE.PointLight(0xff8a3a, def.sky === 'night' ? 60 : 30, 40, 1.6);
      l.position.set(b.x, gy(b.x, b.z) + 4, b.z);
      scene.add(l);
    }

  const stage: Stage = {
    scene,
    sun,
    sunDir,
    groundTint: sk.ground,
    baseFlags,
    weather(dt, cam) {
      skyUniforms.time.value += dt;
      // the dome travels with the camera so the sun and clouds stay put on the horizon
      sky.position.copy(cam);
      if (!weatherMesh) return;
      const snow = def.sky === 'snow';
      const fall = snow ? 2.2 : 26,
        len = snow ? 0.06 : 0.7,
        drift = snow ? 0.8 : 3;
      for (let i = 0; i < WN; i++) {
        wo[i * 3 + 1] -= fall * dt;
        wo[i * 3] += drift * dt;
        if (wo[i * 3 + 1] < 0) wo[i * 3 + 1] += 22;
        if (wo[i * 3] > 28) wo[i * 3] -= 56;
        const x = cam.x + wo[i * 3],
          y = cam.y - 8 + wo[i * 3 + 1],
          z = cam.z + wo[i * 3 + 2];
        wp[i * 6] = x;
        wp[i * 6 + 1] = y;
        wp[i * 6 + 2] = z;
        wp[i * 6 + 3] = x + drift * 0.03;
        wp[i * 6 + 4] = y + len;
        wp[i * 6 + 5] = z;
      }
      weatherMesh.geometry.attributes.position.needsUpdate = true;
    },
    dispose() {
      // Free everything on the GPU, textures and shadow maps included: a new stage is built for every battle and every
      // trip back to the menus, and leaking one each time eventually costs the WebGL context.
      const freeMaterial = (mat: THREE.Material) => {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      };
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mm = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mm)) mm.forEach(freeMaterial);
        else if (mm) freeMaterial(mm);
        if ((o as THREE.Light).isLight) (o as THREE.Light).dispose();
        if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      });
      for (const t of texCache.values()) t.dispose();
    },
  };
  (stage as any).flagTex = flagTex;
  return stage;
}

export function recolorBase(stage: Stage, base: number, team: number) {
  const tex = (stage as any).flagTex(team) as THREE.Texture;
  for (const f of stage.baseFlags[base]) {
    const m = f.material as THREE.MeshLambertMaterial;
    m.map = tex;
    m.needsUpdate = true;
  }
}
