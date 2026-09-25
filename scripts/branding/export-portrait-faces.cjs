// Non-destructive face crops of existing stylized portraits. No face generation,
// recolouring, team logo copying or changes to source artwork.
const fs = require('node:fs');
const crypto = require('node:crypto');
const sharp = require('sharp');
const crops = require('./portrait-face-crops.json');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
(async () => {
  const evidence = [];
  for (const entry of crops) {
    const source = fs.readFileSync(`public${entry.source}`);
    const meta = await sharp(source).metadata();
    const crop = Object.fromEntries(Object.entries(entry.crop).map(([key, value]) =>
      [key, Math.round(value * (key === 'left' || key === 'width' ? meta.width : meta.height))]));
    const bytes = await sharp(source).extract(crop).resize(512, 512, {
      fit: 'contain', background: {r: 0, g: 0, b: 0, alpha: 0},
    }).png().toBuffer();
    const destination = `/branding/portraits/face-${hash(bytes).slice(0, 16)}.png`;
    fs.writeFileSync(`public${destination}`, bytes);
    evidence.push({...entry, crop, destination, sourceSha256: hash(source), sha256: hash(bytes)});
  }
  fs.writeFileSync('data/player-portrait-face-crops.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(`Exported ${evidence.length} original-face crops; original files unchanged.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
