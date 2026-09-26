// The brand trophy, one slow turn, transparent: composited over gameplay ("CHASE TROPHIES").
// node <3d-asset-studio>/scripts/render.mjs design/trailer-3d/trophy.scene.js --gpu --out tmp/trailer/3d/trophy
import {buildBrandTrophy} from './brand-trophy.js';

export const settings = {
  name: 'trophy', mode: 'sequence', width: 1100,
  sequence: {frames: 90, fps: 30, turntable: true, turns: 1},
  // Dark-field strips give the icon's mirror contrast; bloom adds its glow. The cut grades
  // the frames warmer (curves) to match the icon's orange gold.
  studio: {preset: 'glass', envMap: 'strips'},
  post: {bloom: {strength: 0.35, radius: 0.5}},
  camera: {elevation: 8, distance: 5.4},
  floor: false,
  backdrop: 'transparent',
  background: '#0b1220',
};

export default function build() {
  const trophy = buildBrandTrophy();
  trophy.rotation.y = 0.3;
  return [{name: 'trophy', object: trophy}];
}
