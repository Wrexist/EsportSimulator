// Validates delivered bytes; this is not visual approval or content clearance.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const directory = path.resolve(__dirname, '../../docs/launch-readiness/evidence/L25-assets');
async function main() {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
    const failures = [];
    let count = 0;
    for (const entry of manifest.entries) {
        for (const file of entry.files) {
            count++;
            const target = path.resolve(directory, file.path);
            if (!target.startsWith(directory + path.sep)) throw new Error('Export path escaped review directory');
            const bytes = fs.readFileSync(target);
            if (bytes.length !== file.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== file.sha256) failures.push(`${file.path}: file changed`);
            if (!file.path.endsWith('.svg')) {
                const metadata = await sharp(bytes).metadata();
                if (metadata.width !== 256 || metadata.height !== 256 || !metadata.hasAlpha) failures.push(`${file.path}: dimensions/alpha`);
                const pixels = await sharp(bytes).ensureAlpha().raw().toBuffer();
                let transparent = 0, border = 0;
                for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
                    const alpha = pixels[(y * 256 + x) * 4 + 3];
                    if (alpha === 0) transparent++;
                    if (x === 0 || y === 0 || x === 255 || y === 255) border = Math.max(border, alpha);
                }
                if (!transparent || border > 0) failures.push(`${file.path}: transparent margin missing`);
            }
        }
    }
    if (manifest.entries.length !== manifest.teamCount || count !== manifest.teamCount * 3) failures.push('Manifest file count mismatch');
    const result = {version: manifest.version, teams: manifest.teamCount, files: count, failures, meaning: 'File hash, decode, dimensions and transparent border checks only; not visual or rights acceptance'};
    fs.writeFileSync(path.resolve(directory, '../L25-asset-validation.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
    if (failures.length) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
