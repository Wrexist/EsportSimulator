// "ESPORTS MANAGER" in the brand face, gold, swinging in from edge-on and settling with a slight overshoot.
// Transparent frames to composite over the end card.
import * as THREE from 'three';
import {text3d} from 'w3d/text.js';
import * as M from 'w3d/materials.js';

const FONT = new URL('./BarlowCondensed-ExtraBold.ttf', import.meta.url).href;

export const settings = {
  name: 'title', mode: 'sequence', width: 1600,
  sequence: {frames: 54, fps: 30, loop: false},
  studio: {preset: 'soft', envMap: 'softbox', exposure: 1.4},
  camera: {elevation: 2, distance: 7},
  floor: false,
  backdrop: 'transparent',
  background: '#0b1220',
};

const clamp01 = x => Math.min(1, Math.max(0, x));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const back = x => 1 + 2.4 * (x - 1) ** 3 + 1.4 * (x - 1) ** 2; // overshoot, then settle
const out = x => 1 - (1 - x) ** 3;

export default async function build() {
  const gold = M.withGrain(M.gold({color: 0xf0c56a}, {roughness: 0.14}), {scale: 300, bump: 0.04, roughVar: 0.02, tintVar: 0.005});
  const amber = M.gold({color: 0xffc940}, {roughness: 0.2});
  const word = new THREE.Mesh(await text3d('ESPORTS MANAGER', {font: FONT, size: 1, depth: 0.28, bevel: 0.035, letterSpacing: 0.04}), gold);
  const fps = new THREE.Mesh(await text3d('FPS', {font: FONT, size: 0.55, depth: 0.2, bevel: 0.025, letterSpacing: 0.08}), amber);
  // Centre each word on its own pivot so the swing turns about the middle.
  for (const m of [word, fps]) { m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox; m.geometry.translate(-(b.max.x + b.min.x) / 2, -(b.max.y + b.min.y) / 2, -(b.max.z + b.min.z) / 2); }
  const top = new THREE.Group(); top.add(word); top.position.y = 0.55;
  const sub = new THREE.Group(); sub.add(fps); sub.position.y = -0.55;
  return [{name: 'top', object: top}, {name: 'sub', object: sub}];
}

export function animate({t, layers}) {
  const a = back(seg(t, 0, 0.55));
  layers.top.rotation.y = (1 - a) * -1.45;
  layers.top.position.z = (1 - out(seg(t, 0, 0.55))) * -3;
  const b = back(seg(t, 0.3, 0.8));
  layers.sub.rotation.x = (1 - b) * 1.5;
  layers.sub.scale.setScalar(Math.max(0.001, out(seg(t, 0.3, 0.7))));
}
