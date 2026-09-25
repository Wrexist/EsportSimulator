// Exact portrait-only derivatives of owner-attested project artwork.
const fs = require('node:fs'), crypto = require('node:crypto');
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const ledgerPath = 'docs/launch-readiness/evidence/L08-content-inventory.json';
const ledger = read(ledgerPath);
const before = read('tmp/portrait-sync-backup/players.json');
const after = read('public/data/snapshot/players.json');
if (before.length !== after.length) throw Error('Roster changed');
for (let i = 0; i < before.length; i++) {
  const {portraitPath: old, ...a} = before[i], {portraitPath: next, ...b} = after[i];
  if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`Non-portrait change: ${a.id}`);
}
const crops = read('data/player-portrait-face-crops.json');
const reviewed = read('data/player-portrait-reviewed.json');
for (const portrait of reviewed) {
  if (sha(fs.readFileSync(portrait.sourceFile || `public${portrait.source}`)) !== portrait.sourceSha256 ||
      sha(fs.readFileSync(`public${portrait.destination}`)) !== portrait.sha256) throw Error(`Reviewed artwork changed: ${portrait.id}`);
}
for (const crop of crops) {
  if (sha(fs.readFileSync(`public${crop.source}`)) !== crop.sourceSha256 ||
      sha(fs.readFileSync(`public${crop.destination}`)) !== crop.sha256) throw Error(`Artwork changed: ${crop.id}`);
}
const artwork = ledger.files.find(r => r.path === 'public/branding/portraits/portrait-64dd8cddc1f19c21.png');
const database = ledger.files.find(r => r.path === 'data/portrait-asset-aliases.json');
if (artwork.reviewBasis !== 'owner-attested' || database.releaseDisposition !== 'include') throw Error('Missing prior review');
const records = [
  ...reviewed.map(c => ({...artwork, path: `public${c.destination}`, source: `Built-in imagegen avatar, reference kind ${c.sourceKind || 'existing-stylized-project-avatar'}: ${c.source}; source/output hashes and master in data/player-portrait-reviewed.json. Generation record does not independently establish likeness/reference clearance. Original reference is not included by this record.`,
    derivativeEvidence: 'data/player-portrait-reviewed.json'})),
  ...crops.map(c => ({...artwork, path: `public${c.destination}`, source: `Original stylized face crop from ${c.source}; exact source hash/crop in data/player-portrait-face-crops.json. Owner-attested project-created portrait family.`,
    derivativeEvidence: 'docs/launch-readiness/evidence/2026-09-25-portrait-sync.json'})),
  ...['data/player-portrait-identities.json', 'data/player-portrait-face-crops.json', 'data/player-portrait-reviewed.json', 'data/player-portrait-batch-inputs.json', 'data/player-portrait-replacements.json', 'public/data/snapshot/players.json'].map(path => ({...database, path,
    derivativeEvidence: 'docs/launch-readiness/evidence/2026-09-25-portrait-sync.json'})),
].map(row => { const b = fs.readFileSync(row.path); return {...row, sha256: sha(b), bytes: b.length}; });
if (process.argv.includes('--write')) {
  const backup = 'tmp/portrait-sync-backup/content-ledger.json';
  if (!fs.existsSync(backup)) fs.copyFileSync(ledgerPath, backup);
  for (const row of records) {
    const index = ledger.files.findIndex(r => r.path === row.path);
    if (index < 0) ledger.files.push(row); else ledger.files[index] = row;
  }
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
}
console.log(JSON.stringify({reviewed: records.length, nonPortraitGameplayChanges: 0, write: process.argv.includes('--write')}));
