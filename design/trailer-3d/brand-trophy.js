// The game-icon trophy (marketing/approved-brand/exports/game-icon-512.png) in 3D:
// stepped round gold foot, collared stem, fluted urn cup with a banded rim, domed lid with a spire,
// and two blade-like horn handles that curl out from the cup and sweep up into sharp points.
// 1 unit = 10 cm; about 3.6 units (36 cm) tall, standing on y = 0.
import * as THREE from 'three';
import {lathe, roundCorners, spline} from 'w3d/geometry.js';
import * as M from 'w3d/materials.js';

export function brandGold() {
  // Deep, saturated mirror gold like the icon: near-zero roughness so the environment's contrast reads.
  return M.withGrain(M.gold({color: 0xffb640}, {roughness: 0.04, clearcoat: 0.8, clearcoatRoughness: 0.05}), {scale: 320, bump: 0.02, roughVar: 0.01, tintVar: 0.004});
}

/** Sweep an elliptical section along a curve; radius follows radiusAt(u), flatten squashes the section. */
function taperedSweep(points, radiusAt, {flatten = 0.55, tubular = 180, radial = 28} = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'catmullrom', 0.5);
  const frames = curve.computeFrenetFrames(tubular, false);
  const pos = [], idx = [];
  for (let i = 0; i <= tubular; i++) {
    const u = i / tubular, c = curve.getPointAt(u), r = radiusAt(u);
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const v = c.clone().addScaledVector(N, Math.cos(a) * r).addScaledVector(B, Math.sin(a) * r * flatten);
      pos.push(v.x, v.y, v.z);
    }
  }
  for (let i = 0; i < tubular; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildBrandTrophy(gold = brandGold()) {
  // One turned solid from the floor to the spire tip.
  const foot = [[0, 0], [1.1, 0], [1.1, 0.1], [1.04, 0.14], [1.0, 0.24], [0.9, 0.28], [0.88, 0.36], [0.7, 0.42]];
  const bell = spline([[0.7, 0.42], [0.5, 0.5], [0.32, 0.62], [0.22, 0.74], [0.18, 0.82]], 16);
  const collar = [[0.32, 0.86], [0.32, 0.96], [0.2, 1.0]];
  const cup = spline([[0.24, 1.08], [0.48, 1.22], [0.7, 1.48], [0.84, 1.8], [0.9, 2.1], [0.95, 2.3]], 90);
  const rim = [[1.0, 2.34], [1.0, 2.46], [0.92, 2.5]];
  const lid = spline([[0.86, 2.54], [0.72, 2.64], [0.5, 2.72], [0.3, 2.78], [0.16, 2.82]], 30);
  const spire = [[0.13, 2.88], [0.16, 2.94], [0.07, 3.0], [0.04, 3.25], [0, 3.42]];
  const profile = [...foot, ...bell.slice(1), ...collar, ...cup, ...rim, ...lid, ...spire];
  const radii = profile.map((_, i) => (i === 0 || i === profile.length - 1 ? 0 : 0.015));
  const body = lathe(roundCorners(profile, radii, 4), {segments: 256});

  // Vertical flutes on the lower cup, fading out toward the rim and the stem.
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < 1.1 || y > 2.12) continue;
    const w = Math.sin(Math.PI * (y - 1.1) / (2.12 - 1.1));
    const k = 1 + 0.035 * w * Math.cos(16 * Math.atan2(z, x));
    p.setXYZ(i, x * k, y, z * k);
  }
  body.computeVertexNormals();

  const trophy = new THREE.Group();
  trophy.add(new THREE.Mesh(body, gold));

  // Horn handles: out and down from the cup, a small curl, then up past the lid into a point.
  // Blade section: thin where it leaves the cup, widest two-thirds up, then a sharp point.
  const bladeRadius = u => (u < 0.62 ? 0.05 + 0.12 * Math.sin((Math.PI / 2) * (u / 0.62)) : 0.17 * ((1 - u) / 0.38) ** 0.8 + 0.002)
  const horn = s => new THREE.Mesh(taperedSweep([
    [s * 0.88, 2.12, 0], [s * 1.06, 1.96, 0], [s * 1.22, 2.02, 0], [s * 1.26, 2.26, 0],
    [s * 1.22, 2.5, 0], [s * 1.26, 2.76, 0], [s * 1.36, 3.0, 0], [s * 1.48, 3.22, 0],
  ], bladeRadius, {flatten: 0.5}), gold);
  trophy.add(horn(1), horn(-1));
  return trophy;
}
