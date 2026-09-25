// Item-specific source checks. Never approves unrelated artwork or maps.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const root = path.resolve(__dirname, '../..');
const brand = 'marketing/esports-manager-steam-assets-4326170/brand-v2';
const output = 'marketing/esports-manager-steam-assets-4326170/UPLOAD-READY-v2/04-APP-ICONS';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = p => fs.readFileSync(path.join(root, p));
const expectedFont = '724c9c25952d5f4a2d87185d9767aa006144c5f0d944dc05bf7d5d603551c260';
const expectedLicense = '186d750eb496a4c17a76385f82be6aea2ac1cf2de074a811d63786cf374ea73f';
async function main() {
  if (hash(read(`${brand}/BarlowCondensed-ExtraBold.ttf`)) !== expectedFont || hash(read(`${brand}/OFL.txt`)) !== expectedLicense) throw new Error('Verified font or license bytes changed.');
  const svg = read(`${brand}/monogram.svg`);
  const mappings = [
    ['public/logo.png', 'shortcut_icon_512.png', 512],
    ['build/icon.png', 'shortcut_icon_512.png', 512],
    ['public/branding/icon.png', 'shortcut_icon_256.png', 256],
    ['public/logo.ico', 'shortcut_icon.ico', 0],
    ['build/icon.ico', 'shortcut_icon.ico', 0],
  ];
  const sizes = [16,24,32,48,64,128,256];
  const frames = await Promise.all(sizes.map(size => sharp(svg).resize(size).png().toBuffer()));
  const directory = Buffer.alloc(6 + 16 * sizes.length);
  directory.writeUInt16LE(1, 2); directory.writeUInt16LE(sizes.length, 4);
  let offset = directory.length;
  frames.forEach((frame, index) => {
    const p = 6 + 16 * index;
    directory[p] = sizes[index] % 256; directory[p+1] = sizes[index] % 256;
    directory.writeUInt16LE(1,p+4); directory.writeUInt16LE(32,p+6);
    directory.writeUInt32LE(frame.length,p+8); directory.writeUInt32LE(offset,p+12);
    offset += frame.length;
  });
  const ico = Buffer.concat([directory, ...frames]);
  const verified = [];
  for (const [file, source, size] of mappings) {
    const bytes = read(file);
    const reproduced = size ? await sharp(svg).resize(size).png().toBuffer() : ico;
    if (!bytes.equals(read(`${output}/${source}`)) || !bytes.equals(reproduced)) throw new Error(`Icon cannot be reproduced: ${file}`);
    verified.push({path:file, sha256:hash(bytes), bytes:bytes.length, source:`${brand}/monogram.svg`, sourceSha256:hash(svg)});
  }
  const licensePath = 'licenses/Barlow-OFL.txt';
  fs.copyFileSync(path.join(root, brand, 'OFL.txt'), path.join(root, licensePath));
  verified.push({path:licensePath, sha256:expectedLicense, bytes:read(licensePath).length, source:'https://github.com/google/fonts/blob/main/ofl/barlowcondensed/OFL.txt'});
  const archivo = 'app/fonts/archivo-black-latin-400-normal.woff2';
  const archivoLicense = 'licenses/Archivo-Black-OFL.txt';
  const normalize = bytes => bytes.toString('utf8').replace(/\s+/g,' ').trim();
  if (hash(read(archivo)) !== '25f33e61cf995abd6be62931cf03bf427286259177b43618cc410ee0157cfd30' ||
      !read(archivo).equals(read('tmp/artwork-source-check/archivo-archivo-black-latin-400-normal.woff2')) ||
      normalize(read(archivoLicense)) !== normalize(read('tmp/artwork-source-check/archivo-LICENSE'))) throw new Error('Archivo binary or license does not match verified Fontsource 5.3.0.');
  for (const file of [archivo, archivoLicense]) verified.push({path:file,sha256:hash(read(file)),bytes:read(file).length,source:'https://www.npmjs.com/package/@fontsource/archivo-black/v/5.3.0'});
  const evidencePath = 'docs/launch-readiness/evidence/L31-VERIFIED-ICONS.json';
  fs.writeFileSync(path.join(root,evidencePath), JSON.stringify({checkedOn:'2026-09-16', fontSource:'https://github.com/google/fonts/blob/main/ofl/barlowcondensed/BarlowCondensed-ExtraBold.ttf', fontSha256:expectedFont, license:'OFL-1.1', basis:'Local user-directed EM composition from outlined Barlow glyphs. Barlow font and license matched upstream exactly; all five icon copies reproduced byte-for-byte from retained SVG. Archivo WOFF2 matched @fontsource/archivo-black 5.3.0 exactly; its license text matches after whitespace normalization. This evidence does not cover other artwork.', files:verified},null,2)+'\n');
  const ledgerPath = path.join(root,'docs/launch-readiness/evidence/L08-content-inventory.json');
  const ledger = JSON.parse(fs.readFileSync(ledgerPath,'utf8'));
  const backup = path.join(root,'tmp/artwork-source-check/L08-before-icon-records.json');
  if (!fs.existsSync(backup)) fs.copyFileSync(ledgerPath,backup);
  for (const file of verified) {
    const old = ledger.files.find(row=>row.path===file.path);
    const isArchivo = [archivo,archivoLicense].includes(file.path);
    const record = {...old,...file,kind:file.path.startsWith('licenses/')?'license-notice':isArchivo?'font':'marketing-branding',evidence:evidencePath,license:isArchivo?'OFL-1.1':'OFL-1.1 font; user-directed original composition',permission:isArchivo?'OFL permits bundling and embedding with the included matching copyright/license notice.':'OFL permits use and embedding; included notice and exact verified source. Owner authorized this EM composition and exports in this conversation.',attribution:isArchivo?'Archivo Black Project Authors':'Barlow Project Authors (font); local Esports Manager composition',allowedUse:'Game and promotional use with applicable font notice retained; do not sell the font by itself',releaseDisposition:'include'};
    if (old) Object.assign(old,record); else ledger.files.push(record);
  }
  fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');
  console.log(`Resolved ${verified.length} exact icon/license records. Other records unchanged.`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
