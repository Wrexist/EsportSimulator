const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const generation = require('../../esport-ui-assets/equipment/tier-art-generation.json');
const sourceDir = path.join(root, 'esport-ui-assets/equipment/tiers');
const destination = path.join(root, 'public/esport-ui-assets/equipment/tiers');

async function main() {
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(destination, { recursive: true });
  const files = [];
  for (const entry of generation.entries) {
    const source = path.join(sourceDir, `${entry.id}.png`);
    if (!fs.existsSync(source)) fs.copyFileSync(entry.source, source);
    const metadata = await sharp(source).metadata();
    const stats = await sharp(source).stats();
    if (!metadata.hasAlpha || stats.isOpaque) throw new Error(`Missing transparency: ${entry.id}`);
    // Keep untouched masters. Normalize only delivery framing, with real alpha.
    const png = path.join(destination, `${entry.id}.png`);
    await sharp(source).trim().resize(576, 416, { fit: 'contain', background: '#00000000' })
      .extend({ top: 32, bottom: 32, left: 32, right: 32, background: '#00000000' }).png().toFile(png);
    const webp = path.join(destination, `${entry.id}.webp`);
    await sharp(png).webp({ quality: 88, alphaQuality: 100, effort: 5 }).toFile(webp);
    const bytes = fs.readFileSync(webp);
    files.push({ id: entry.id, path: path.relative(root, webp).replaceAll('\\', '/'),
      width: 640, height: 480, bytes: bytes.length, alpha: true,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  }
  fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({
    generator: generation.generator, created: generation.created,
    purpose: generation.purpose, files,
  }, null, 2));
  console.log(JSON.stringify({ assets: files.length, transparent: true, webpBytes: files.reduce((n, f) => n + f.bytes, 0) }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
