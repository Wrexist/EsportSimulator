const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

async function main() {
  const root = path.resolve(__dirname, '../..');
  const directory = path.join(root, 'marketing/gameplay-gallery-2026-09-16');
  const files = fs.readdirSync(directory).filter(name => /^\d\d-.*\.png$/.test(name)).sort();
  const screenshots = [];
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(directory, file));
    const metadata = await sharp(bytes).metadata();
    if (metadata.width !== 1920 || metadata.height !== 1080) throw new Error(`Unexpected dimensions: ${file}`);
    screenshots.push({file, width: metadata.width, height: metadata.height, sha256: crypto.createHash('sha256').update(bytes).digest('hex')});
  }
  const manifest = {capturedOn:'2026-09-16', buildId:'NrlanxAzdVSo-ZEQXPmex', capture:'Unedited browser viewport captures of the production Next build; isolated fresh career at port 3358. Not Steam installation screenshots.', steamUploaded:false, screenshots};
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2)+'\n');
  fs.writeFileSync(path.join(directory, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Esports Manager gameplay gallery</title><style>body{margin:40px auto;max-width:1200px;background:#0d1520;color:#edf2f7;font:16px system-ui}h1{font-size:28px}p{color:#aebcca}article{margin:32px 0}img{width:100%;border-radius:10px}a{color:#72ded0}</style><h1>Esports Manager — gameplay gallery</h1><p>Eight real gameplay captures · 1920 × 1080 · September 16, 2026</p><p>Local production build. No promotional overlays or image retouching. Not uploaded to Steam.</p>${screenshots.map(s=>`<article><h2>${s.file.replace(/^\d+-/,'').replace('.png','').replaceAll('-',' ')}</h2><a href="${s.file}"><img src="${s.file}" alt="${s.file}"></a></article>`).join('')}</html>`);
  fs.writeFileSync(path.join(directory, 'README.md'), '# Gameplay gallery — 16 September 2026\n\nEight unedited 1920×1080 PNGs from a fresh career in the local production build. Open index.html for previews. manifest.json records dimensions and SHA-256 hashes. Suggested lead: 02-squad.png.\n\nThese are gameplay screenshots, not promotional capsules. They have not been uploaded to Steam. The live-match radar includes imported map artwork whose content review remains open. Retain screenshots locally until the included assets pass review.\n\nKnown follow-up: shared amateur club emblems; squad/profile energy discrepancy; training terminology review. No screenshots were altered to hide these issues.\n');
  console.log(JSON.stringify({screenshots:screenshots.length, dimensions:'1920x1080', directory}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
