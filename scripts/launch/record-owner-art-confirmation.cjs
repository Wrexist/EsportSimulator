// Snapshot the owner's specific confirmation; never extend it to changed files.
const fs = require('node:fs');
const path = require('node:path');
const { inventory } = require('./content-provenance.cjs');
const root = path.resolve(__dirname, '../..');
const evidence = 'docs/launch-readiness/evidence/L31-OWNER-ART-CONFIRMATION.json';
if (fs.existsSync(path.join(root, evidence))) throw new Error('Confirmation already recorded; changed bytes require review.');
const files = inventory().filter(file => /^(public\/branding\/portraits\/|public\/assets\/(staff|equipment|facilities|trophies|events)\/|public\/facilities\/)/.test(file.path) && /\.(png|webp|jpe?g|svg|avif)$/i.test(file.path));
const ledgerPath = path.join(root, 'docs/launch-readiness/evidence/L08-content-inventory.json');
const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const backup = path.join(root, 'tmp/artwork-source-check/L08-before-owner-art-confirmation.json');
fs.mkdirSync(path.dirname(backup), { recursive: true });
if (!fs.existsSync(backup)) fs.copyFileSync(ledgerPath, backup);
const statement = 'Created for my project';
const scope = 'Fictional player/staff portraits and equipment, facility, trophy and event illustrations, including AI-generated artwork.';
for (const file of files) {
  const previous = ledger.files.find(row => row.path === file.path);
  const next = { ...previous, ...file, evidence, source: scope,
    license: 'Project-created artwork; owner-attested origin',
    permission: `Project owner confirmed on 16 September 2026: "${statement}" in response to the shipping-art source question.`,
    allowedUse: 'Include these exact project-created illustration bytes in the game and Steam release.',
    releaseDisposition: 'include', reviewBasis: 'owner-attested' };
  if (previous) Object.assign(previous, next); else ledger.files.push(next);
}
fs.writeFileSync(path.join(root, evidence), JSON.stringify({ recordedOn: '2026-09-16', statement, scope,
  limitations: ['Owner-attested origin, not independent license verification.', 'Does not cover original real-player photographs, original team logos, or unrelated assets.', 'Applies only to the listed exact file hashes.'],
  files: files.map(({ path, sha256, bytes }) => ({ path, sha256, bytes })) }, null, 2) + '\n');
fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
console.log(`Recorded owner confirmation for ${files.length} project-created illustrations.`);
