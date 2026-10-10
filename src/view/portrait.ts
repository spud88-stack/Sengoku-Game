import * as THREE from 'three';
import type { OfficerDef } from '../sim/types';
import { idlePose } from './anims';
import { Rig } from './rig';

/** Render each officer once to a small image for menus. Uses a throwaway renderer so the game canvas is untouched. */
export function renderPortraits(defs: OfficerDef[], w = 240, h = 300): Record<string, string> {
  const out: Record<string, string> = {};
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return out;
  }
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x40302a, 1.3));
  const key = new THREE.DirectionalLight(0xfff0d8, 2.6);
  key.position.set(2, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc0ff, 1.4);
  rim.position.set(-3, 2, -3);
  scene.add(rim);
  const cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 30);
  for (const def of defs) {
    const rig = new Rig(def);
    idlePose(def.weapon, 0.4, rig.pose);
    rig.apply(rig.pose);
    rig.root.rotation.y = 0.5;
    scene.add(rig.root);
    const s = def.scale ?? 1;
    cam.position.set(1.0 * s, 1.5 * s, 4.6 * s);
    cam.lookAt(0, 1.12 * s, 0);
    renderer.render(scene, cam);
    out[def.id] = renderer.domElement.toDataURL('image/png');
    scene.remove(rig.root);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
