// Records the owner's specific 16 September 2026 statement, not an independent legal review.
// The snapshot is immutable: later map-byte changes need a new review.
const fs = require('node:fs');
const path = require('node:path');
const { inventory } = require('./content-provenance.cjs');
const root = path.resolve(__dirname, '../..');
const evidence = 'docs/launch-readiness/evidence/L31-OWNER-MAP-CONFIRMATION.json';
if (fs.existsSync(path.join(root, evidence))) throw new Error('Confirmation already recorded. Do not apply it to changed map bytes.');
const files = inventory().filter(file => /^(public\/maps\/|public\/map-studio\/spatial\/|data\/map-layouts\/.*\.json$|data\/radar-nav-data\.json$)/.test(file.path));
const record = {
  recordedOn: '2026-09-16', confirmedBy: 'Project owner, in this conversation',
  statement: 'For the maps they are verified as fine to use',
  reviewBasis: 'Owner confirmation of permitted use in the Steam build; not independently verified by the assistant.',
  limitations: ['No agreement text or named license was supplied.', 'This does not assert Valve endorsement or change ownership of the assets.', 'Applies only to the listed map-image, geometry and navigation bytes.', 'Does not cover photography, logos, external lineup collections or mixed drafts.'],
  files: files.map(({path,sha256,bytes,source})=>({path,sha256,bytes,source})),
};
const ledgerPath = path.join(root, 'docs/launch-readiness/evidence/L08-content-inventory.json');
const ledger = JSON.parse(fs.readFileSync(ledgerPath,'utf8'));
const backup = path.join(root, 'tmp/artwork-source-check/L08-before-owner-map-confirmation.json');
fs.mkdirSync(path.dirname(backup),{recursive:true});
if (!fs.existsSync(backup)) fs.copyFileSync(ledgerPath,backup);
for (const file of files) {
  const previous = ledger.files.find(row=>row.path===file.path);
  const next = {...previous,...file, evidence,
    license:'Owner-confirmed authorization; license name/agreement not supplied',
    permission:'Project owner confirmed on 16 September 2026 that the maps are verified as fine to use in this Steam-release conversation.',
    attribution:previous?.attribution || null,
    allowedUse:'Use in this game and its Steam build, relying on the owner confirmation recorded in the evidence file.',
    releaseDisposition:'include', reviewBasis:'owner-attested'};
  if (previous) Object.assign(previous,next); else ledger.files.push(next);
}
fs.writeFileSync(path.join(root,evidence),JSON.stringify(record,null,2)+'\n');
fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');
console.log(`Recorded owner confirmation for ${files.length} map assets. Source files and package filters unchanged.`);
