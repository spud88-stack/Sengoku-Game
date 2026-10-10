import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export type Quality = 'low' | 'medium' | 'high';

export interface QualityProfile {
  name: string;
  /** cap on the device pixel ratio */
  pixelRatio: number;
  shadowSize: number;
  softShadows: boolean;
  /** glow around fire, sparks and Ougi */
  bloom: boolean;
  /** grass tufts per 20 m tile around the player; 0 for none */
  grass: number;
}

export const QUALITY: Record<Quality, QualityProfile> = {
  low: { name: 'Low', pixelRatio: 1, shadowSize: 1024, softShadows: false, bloom: false, grass: 0 },
  medium: { name: 'Medium', pixelRatio: 1.25, shadowSize: 2048, softShadows: true, bloom: false, grass: 110 },
  high: { name: 'High', pixelRatio: 2, shadowSize: 2048, softShadows: true, bloom: true, grass: 240 },
};

/** Phones and tablets start on Medium; everything else on High. Either steps down by itself if it can't keep up. */
export function defaultQuality(): Quality {
  const touch = typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 1 && /Mobi|Android|iPad|iPhone/i.test(navigator.userAgent);
  return touch ? 'medium' : 'high';
}

/** Puts a frame on screen, straight or through the bloom chain, at the chosen quality. */
export class Presenter {
  quality: Quality = 'high';
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private bloom: UnrealBloomPass | null = null;

  constructor(private renderer: THREE.WebGLRenderer) {}

  get profile() {
    return QUALITY[this.quality];
  }

  setQuality(q: Quality) {
    this.quality = QUALITY[q] ? q : 'high';
    const p = this.profile;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.pixelRatio));
    this.renderer.shadowMap.type = p.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.shadowMap.needsUpdate = true;
    if (p.bloom && !this.composer) this.buildComposer();
    else if (!p.bloom && this.composer) this.dropComposer();
    this.resize();
  }

  private buildComposer() {
    const size = this.renderer.getSize(new THREE.Vector2());
    // render into a multisampled half-float target so the bloom has real highlights and edges stay smooth
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const c = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.Camera());
    c.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.5, 0.35, 0.92);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
    this.composer = c;
  }

  private dropComposer() {
    this.composer?.renderTarget1.dispose();
    this.composer?.renderTarget2.dispose();
    this.bloom?.dispose();
    this.composer?.dispose();
    this.composer = null;
    this.renderPass = null;
    this.bloom = null;
  }

  resize() {
    const w = window.innerWidth,
      h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    if (!this.composer || !this.renderPass) {
      this.renderer.render(scene, camera);
      return;
    }
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.composer.render();
  }
}
