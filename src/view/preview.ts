import * as THREE from 'three';
import { movesetFor } from '../data/moves';
import type { OfficerDef } from '../sim/types';
import { clipFor, idlePose } from './anims';
import { Rig } from './rig';

/** A slowly turning warrior on a little stage, for the warrior editor. Owns its own small renderer. */
export class WarriorPreview {
  canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
  private rig: Rig | null = null;
  private def: OfficerDef | null = null;
  private raf = 0;
  private t = 0;
  private last = 0;

  constructor(w = 300, h = 380) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.className = 'preview3d';
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    } catch {
      return;
    }
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x40302a, 1.3));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.6);
    key.position.set(2, 3, 4);
    const rim = new THREE.DirectionalLight(0x9fc0ff, 1.4);
    rim.position.set(-3, 2, -3);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(key, rim, floor);
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
      this.last = now;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Show this warrior; rebuilt from scratch so every option shows. */
  set(def: OfficerDef) {
    if (!this.renderer) return;
    if (this.rig) this.scene.remove(this.rig.root);
    this.def = def;
    this.rig = new Rig(def);
    this.scene.add(this.rig.root);
    const s = def.scale ?? 1;
    this.cam.position.set(0, 1.35 * s, 5.2 * s);
    this.cam.lookAt(0, 1.0 * s, 0);
  }

  private frame(dt: number) {
    if (!this.renderer || !this.rig || !this.def) return;
    this.t += dt;
    const rig = this.rig;
    rig.root.rotation.y = 0.6 + this.t * 0.6;
    // every few seconds, a practice cut with the chosen weapon
    const ms = movesetFor(this.def.weapon);
    const cycle = this.t % 4.5;
    const mv = ms.charges[Math.min(3, ms.charges.length - 1)];
    if (cycle > 3 && cycle - 3 < mv.dur) clipFor(mv, this.def.weapon).sample(cycle - 3, rig.pose);
    else idlePose(this.def.weapon, this.t, rig.pose);
    rig.apply(rig.pose);
    this.renderer.render(this.scene, this.cam);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
  }
}
