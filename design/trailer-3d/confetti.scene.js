// Gold confetti and a few coins tumbling down through the frame; loops seamlessly. Transparent, 1920×1080.
import * as THREE from 'three';
import * as O from 'w3d/objects.js';
import * as M from 'w3d/materials.js';

export const settings = {
  name: 'confetti', mode: 'sequence', size: [1920, 1080], margin: 0,
  sequence: {frames: 90, fps: 30, loop: true},
  studio: {preset: 'soft', envMap: 'softbox', exposure: 1.5},
  camera: {elevation: 0, distance: 6},
  floor: false,
  backdrop: 'transparent',
  background: '#0b1220',
  post: {bloom: {strength: 0.3, radius: 0.4}},
};

const W = 8, H = 4.5, N = 70;
const rand = M.rng(11);
const flakes = Array.from({length: N}, () => ({
  x: (rand() - 0.5) * W, z: (rand() - 0.5) * 2, phase: rand(), spin: [rand() * 6, rand() * 6, rand() * 6],
  sway: 0.1 + rand() * 0.2, turns: 1 + Math.floor(rand() * 3), coin: rand() < 0.14,
}));

export default function build() {
  const gold = M.gold({color: 0xffb640}, {roughness: 0.12, side: THREE.DoubleSide});
  const flakeGeo = new THREE.BoxGeometry(0.12, 0.004, 0.07);
  // Two invisible corner markers pin the framing to the full W×H window whatever the flakes do.
  const pins = new THREE.Group();
  for (const [x, y] of [[-W / 2, 0], [W / 2, H]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.001, 0.001), new THREE.MeshBasicMaterial({transparent: true, opacity: 0}));
    m.position.set(x, y, 0); pins.add(m);
  }
  const layers = [{name: 'pins', object: pins}];
  flakes.forEach((f, i) => {
    const obj = f.coin ? O.coin({diameter: 0.22, thickness: 0.02, material: gold}) : new THREE.Mesh(flakeGeo, gold);
    layers.push({name: `f${i}`, object: obj});
  });
  return layers;
}

export function animate({t, layers}) {
  const TAU = Math.PI * 2;
  flakes.forEach((f, i) => {
    const o = layers[`f${i}`];
    const u = (t + f.phase) % 1;                       // falls top → bottom once per loop
    o.position.set(f.x + Math.sin(TAU * (u * f.turns + f.phase)) * f.sway, H * (1 - u), f.z);
    o.rotation.set(f.spin[0] + TAU * u * f.turns, f.spin[1] + TAU * u, f.spin[2] + TAU * u * f.turns);
  });
}
