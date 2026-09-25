const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const evidence = 'docs/launch-readiness/evidence/L31-VECTOR-CREATION-AUDIT.json';
const report = JSON.parse(fs.readFileSync(path.join(root, evidence), 'utf8'));
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
for (const row of [...report.generators, ...report.matched]) {
  if (digest(row.path) !== row.sha256) throw new Error(`Creation evidence is stale: ${row.path}`);
}
const ledgerPath = path.join(root, 'docs/launch-readiness/evidence/L08-content-inventory.json');
const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const backup = path.join(root, 'tmp/artwork-source-check/L08-before-vector-creation.json');
fs.mkdirSync(path.dirname(backup), {recursive:true});
if (!fs.existsSync(backup)) fs.copyFileSync(ledgerPath, backup);
for (const asset of report.matched) {
  const row = ledger.files.find(file => file.path === asset.path);
  if (!row || row.sha256 !== asset.sha256) throw new Error(`Inventory differs: ${asset.path}`);
  Object.assign(row, { evidence, source: `${asset.generator} :: ${asset.function}`,
    license: 'Project-authored procedural SVG',
    permission: 'Existing SVG reproduced exactly from local project drawing functions; project owner authorized fictional team art in the Steam release.',
    allowedUse: 'Include this authored vector asset in the game.', releaseDisposition:'include',
    reviewBasis:'reproduced-from-project-source', limitations:'Creation evidence does not assert trademark clearance or rights to original reference images.' });
}
fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
console.log(`Recorded reproducible creation evidence for ${report.matched.length} SVGs.`);
