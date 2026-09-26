// "#165": the starting world rank as a brushed-steel plate that flips face-on (the underdog beat). Transparent.
import * as THREE from 'three';
import {text3d} from 'w3d/text.js';
import * as M from 'w3d/materials.js';

const FONT = new URL('./BarlowCondensed-ExtraBold.ttf', import.meta.url).href;

export const settings = {
  name: 'rank', mode: 'sequence', width: 900,
  sequence: {frames: 36, fps: 30, loop: false},
  studio: {preset: 'soft', envMap: 'softbox', exposure: 1.3},
  camera: {elevation: 4, distance: 6.5},
  floor: false,
  backdrop: 'transparent',
  background: '#0b1220',
};

const clamp01 = x => Math.min(1, Math.max(0, x));
const back = x => 1 + 2.6 * (x - 1) ** 3 + 1.6 * (x - 1) ** 2;

export default async function build() {
  const steel = M.brushedSteel({color: 0xd9dde4});
  const num = new THREE.Mesh(await text3d('#165', {font: FONT, size: 1.4, depth: 0.32, bevel: 0.04, letterSpacing: 0.03}), steel);
  num.geometry.computeBoundingBox();
  const b = num.geometry.boundingBox;
  num.geometry.translate(-(b.max.x + b.min.x) / 2, -(b.max.y + b.min.y) / 2, -(b.max.z + b.min.z) / 2);
  const g = new THREE.Group(); g.add(num);
  return [{name: 'rank', object: g}];
}

export function animate({t, layers}) {
  const a = back(clamp01(t / 0.7));
  layers.rank.rotation.x = (1 - a) * -1.5;
  layers.rank.rotation.y = -0.18 + (1 - a) * 0.4;
  layers.rank.scale.setScalar(0.6 + 0.4 * clamp01(t / 0.5));
}
