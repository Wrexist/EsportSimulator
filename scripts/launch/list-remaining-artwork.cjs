const fs = require('node:fs');
const path = require('node:path');
const { verify, ownerReleaseDecisions } = require('./content-provenance.cjs');
const root = path.resolve(__dirname, '../..');
const directory = path.join(root, 'docs/launch-readiness/evidence');
const report = JSON.parse(fs.readFileSync(path.join(directory, 'L31-PACKAGED-CONTENT-RECONCILIATION.json')));
const ledger = new Map(JSON.parse(fs.readFileSync(path.join(directory, 'L08-content-inventory.json'))).files.map(row => [row.path, row]));
const pending = report.files.filter(file => {
  const record = ledger.get(file.path);
  return verify([file], record ? [record] : [], ownerReleaseDecisions()).length > 0;
});
const quote = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
const rows = pending.map(file => [file.path, file.kind, file.sha256, file.source, file.evidence, 'Locate original creator/license or replace with documented original content'].map(quote).join(','));
fs.writeFileSync(path.join(directory, 'L31-REMAINING-ASSET-RECORDS.csv'), ['path,kind,sha256,source,evidence,next_action', ...rows].join('\n') + '\n');
console.log(`${pending.length} pending packaged asset records listed; documented matching records excluded.`);
