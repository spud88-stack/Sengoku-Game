import * as THREE from 'three';
import { Rng } from '../core/math';
import type { Terrain } from '../sim/terrain';
import type { BattleDef } from '../sim/world';

const TILE = 20;
/** tiles each side of the one the camera is over */
const REACH = 2;

/**
 * Tufts of grass around the player, in tiles that are refilled as the player crosses the field.
 * One instanced draw; the wind is done in the vertex shader.
 */
export class Grass {
  mesh: THREE.InstancedMesh;
  private time = { value: 0 };
  private cx = NaN;
  private cz = NaN;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private n = { x: 0, y: 0, z: 0 };
  private static UP = new THREE.Vector3(0, 1, 0);

  constructor(
    private def: BattleDef,
    private terrain: Terrain,
    private perTile: number,
    tint: number,
  ) {
    const geo = tuftGeometry();
    // a little light of their own so backlit slopes don't turn to stubble
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, color: tint, emissive: new THREE.Color(0x2a3214).multiply(new THREE.Color(tint)) });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.time;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // tips bend with gusts that roll across the field
        vec2 wp = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
        float gust = sin(uTime * 1.6 + wp.x * 0.21 + wp.y * 0.13) * 0.6 + sin(uTime * 2.7 + wp.x * 0.07 - wp.y * 0.19) * 0.4;
        transformed.x += gust * 0.16 * position.y * position.y;
        transformed.z += gust * 0.07 * position.y * position.y;`,
      );
    };
    const cap = perTile * (REACH * 2 + 1) ** 2;
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = false;
  }

  /** Call each frame with the point the camera looks at. */
  update(dt: number, x: number, z: number) {
    this.time.value += dt;
    const cx = Math.floor(x / TILE),
      cz = Math.floor(z / TILE);
    if (cx === this.cx && cz === this.cz) return;
    this.cx = cx;
    this.cz = cz;
    this.fill();
  }

  private fill() {
    const T = this.terrain,
      half = this.def.half;
    let k = 0;
    for (let tz = this.cz - REACH; tz <= this.cz + REACH; tz++)
      for (let tx = this.cx - REACH; tx <= this.cx + REACH; tx++) {
        // the same tile always grows the same grass
        const rng = new Rng(((tx * 73856093) ^ (tz * 19349663)) >>> 0);
        for (let i = 0; i < this.perTile; i++) {
          const x = (tx + rng.next()) * TILE,
            z = (tz + rng.next()) * TILE;
          const s = 0.55 + rng.next() * 0.75,
            yaw = rng.next() * 6.28,
            shade = rng.next();
          if (Math.abs(x) > half + 20 || Math.abs(z) > half + 20) continue;
          // not on trampled camp ground, in the river, or on bare slopes
          if (this.def.bases.some((b) => (b.x - x) ** 2 + (b.z - z) ** 2 < (b.main ? 19 : 16) ** 2)) continue;
          const y = T.height(x, z);
          if (T.water !== null && y < T.water + 0.25) continue;
          if (T.normal(x, z, this.n).y < 0.86) continue;
          this.p.set(x, y - 0.03, z);
          this.q.setFromAxisAngle(Grass.UP, yaw);
          this.s.set(s, s * (0.8 + shade * 0.5), s);
          this.mesh.setMatrixAt(k, this.m.compose(this.p, this.q, this.s));
          this.mesh.setColorAt(k, this.c.setHSL(0.2 + shade * 0.06, 0.35, 0.78 + shade * 0.17));
          k++;
        }
      }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Five thin blades fanned from one root, dark at the base and pale at the tips. */
function tuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [],
    col: number[] = [];
  const base = new THREE.Color(0x4f6230),
    tip = new THREE.Color(0xdde6a0);
  for (let b = 0; b < 5; b++) {
    const a = (b / 5) * Math.PI + 0.3,
      lean = 0.18 + (b % 2) * 0.12,
      h = 0.5 + ((b * 37) % 5) * 0.06,
      w = 0.045;
    const dx = Math.cos(a),
      dz = Math.sin(a);
    const ox = (b - 2) * 0.05;
    const tx = ox + Math.sin(a) * lean,
      tz = -Math.cos(a) * lean;
    // one triangle per blade
    pos.push(ox - dx * w, 0, -dz * w, ox + dx * w, 0, dz * w, tx, h, tz);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // light the blades as if they faced up, so both sides read the same
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  return g;
}
