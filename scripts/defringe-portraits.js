// Removes the white "halo" fringe from cut-out player portrait PNGs.
// The matte sits in the outermost opaque ring of the silhouette, so we erode the
// alpha past it (min filter). Erosion only ever LOWERS alpha and only along the
// true silhouette edge, so interior pixels (the face) are untouched.
//
//   node scripts/defringe-portraits.js --test  fileA fileB ...   (writes to /tmp/df)
//   node scripts/defringe-portraits.js --apply [threshold]       (in place, scans all)
const sharp = require('sharp');
const fs = require('fs');
const { execSync } = require('child_process');

const SOLID = 200;     // alpha considered "interior"
const ERODE = 4;       // px of opaque edge to trim (kills the bright ring)

async function lightRatio(file) {
  const m = await sharp(file).metadata();
  if (!m.hasAlpha) return { noAlpha: true };
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const A = i => data[i * c + 3];
  const lum = i => 0.299 * data[i * c] + 0.587 * data[i * c + 1] + 0.114 * data[i * c + 2];
  let edge = 0, light = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (A(i) > SOLID) { const n = [i - 1, i + 1, i - w, i + w]; if (n.some(k => A(k) < 40)) { edge++; if (lum(i) > 170) light++; } }
  }
  return { r: edge ? light / edge : 0 };
}

async function defringe(inFile, outFile) {
  const { data, info } = await sharp(inFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const N = w * h;
  const r = new Uint8ClampedArray(N), g = new Uint8ClampedArray(N), b = new Uint8ClampedArray(N), a = new Uint8Array(N);
  for (let i = 0; i < N; i++) { r[i] = data[i * c]; g[i] = data[i * c + 1]; b[i] = data[i * c + 2]; a[i] = data[i * c + 3]; }

  // Erode the alpha by ERODE px (min filter). The white halo lives in the
  // outermost opaque ring of the silhouette, so shrinking the mask past it
  // drops the matte entirely. Erosion only ever LOWERS alpha, so we never
  // reveal the (non-white) RGB stored in originally-transparent pixels.
  let na = a;
  for (let pass = 0; pass < ERODE; pass++) {
    const next = new Uint8Array(N);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; let mn = na[i];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy, xx = x + dx; if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
        const v = na[yy * w + xx]; if (v < mn) mn = v;
      }
      next[i] = mn;
    }
    na = next;
  }

  // Write the eroded alpha directly. The 1024px render is downscaled in-app,
  // which anti-aliases the trimmed edge cleanly — no feather needed.
  // Zero the colour of fully-transparent pixels so no stray matte can show.
  const final = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    const vis = na[i] > 0;
    final[i * 4] = vis ? r[i] : 0;
    final[i * 4 + 1] = vis ? g[i] : 0;
    final[i * 4 + 2] = vis ? b[i] : 0;
    final[i * 4 + 3] = na[i];
  }
  await sharp(final, { raw: { width: w, height: h, channels: 4 } }).png().toFile(outFile);
}

(async () => {
  const args = process.argv.slice(2);
  if (args[0] === '--test') {
    fs.mkdirSync('/tmp/df', { recursive: true });
    for (const f of args.slice(1)) {
      const before = await lightRatio(f);
      const out = '/tmp/df/' + f.split('/').slice(-2).join('_');
      await defringe(f, out);
      const after = await lightRatio(out);
      console.log(f.split('/').slice(-2).join('/').padEnd(34), 'before', (before.r*100).toFixed(0)+'%', '-> after', (after.r*100).toFixed(0)+'%', '  ->', out);
    }
  } else if (args[0] === '--apply') {
    const thr = parseFloat(args[1] || '0.18');
    if (!Number.isFinite(thr) || thr < 0 || thr > 1) {
      // A NaN threshold makes `lr.r <= thr` always false → every portrait gets
      // rewritten. Refuse rather than silently mangle the whole asset set.
      console.error('Invalid threshold. Use a number between 0 and 1.');
      process.exit(1);
    }
    const files = execSync("find public/assets/teams -path '*/players/*.png'").toString().trim().split('\n');
    let done = 0;
    for (const f of files) {
      const lr = await lightRatio(f);
      if (lr.noAlpha || lr.r <= thr) continue;
      await defringe(f, f + '.tmp');
      fs.renameSync(f + '.tmp', f);
      done++;
      console.log('defringed', (lr.r*100).toFixed(0)+'%', f);
    }
    console.log('\nDONE. defringed', done, 'portraits (threshold lightRatio >', thr + ')');
  } else {
    console.log('usage: --test <files...>  |  --apply [threshold]');
  }
})();
