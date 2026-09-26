// Gold coins dropping one by one onto a stack (the finances beat). Transparent, plays once.
import * as THREE from 'three';
import * as O from 'w3d/objects.js';
import * as M from 'w3d/materials.js';

export const settings = {
  name: 'coins', mode: 'sequence', width: 700,
  sequence: {frames: 45, fps: 30, loop: false},
  studio: {preset: 'soft', envMap: 'softbox', exposure: 1.35},
  camera: {elevation: 22, distance: 6},
  floor: false,
  backdrop: 'transparent',
  background: '#0b1220',
};

const N = 8, T = 0.022; // coin thickness in scene units (2.2 mm × 10)
const clamp01 = x => Math.min(1, Math.max(0, x));
const rng = M.rng(7);
const jitter = Array.from({length: N}, () => [(rng() - 0.5) * 0.04, (rng() - 0.5) * 0.04, rng() * Math.PI]);

export default function build() {
  const gold = M.gold({color: 0xf0c56a}, {roughness: 0.18});
  return Array.from({length: N}, (_, i) => {
    const c = O.coin({diameter: 0.9, thickness: T * 4, material: gold});
    return {name: `c${i}`, object: c};
  });
}

export function animate({t, layers}) {
  for (let i = 0; i < N; i++) {
    const c = layers[`c${i}`];
    const start = i * 0.075, land = start + 0.16;
    const u = clamp01((t - start) / (land - start));
    const rest = i * T * 4;
    const fall = (1 - u * u) * 2.4;                      // accelerating drop
    const bounce = u >= 1 ? Math.max(0, Math.sin(clamp01((t - land) / 0.08) * Math.PI)) * 0.05 : 0;
    c.position.set(jitter[i][0], rest + fall + bounce, jitter[i][1]);
    c.rotation.set((1 - u) * 0.9, jitter[i][2] + (1 - u) * 2.5, (1 - u) * 0.4);
    c.visible = t >= start;
  }
}
