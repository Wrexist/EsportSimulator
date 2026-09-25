// Artifact evidence only. This report never grants distribution permission.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const asar = require('@electron/asar');
const { inventory, verify, ownerReleaseDecisions } = require('./content-provenance.cjs');
const root = path.resolve(__dirname, '../..');
function reconcile(directory) {
  const archive = path.join(directory, 'resources/app.asar');
  const source = inventory();
  const byPath = new Map(source.map(row => [row.path, row]));
  const records = JSON.parse(fs.readFileSync(path.join(root, 'docs/launch-readiness/evidence/L08-content-inventory.json'), 'utf8')).files;
  const reviews = new Map(records.map(row => [row.path, row]));
  const ownerDecisions = ownerReleaseDecisions();
  const files = [];
  for (const entry of asar.listPackage(archive)) {
    const relative = entry.replace(/\\/g, '/').replace(/^\//, '');
    if (!/^(public\/|licenses\/|NOTICE\.md$)/.test(relative)) continue;
    const archivePath = path.normalize(relative);
    const stat = asar.statFile(archive, archivePath);
    if (stat.files) continue;
    const bytes = stat.unpacked ? fs.readFileSync(path.join(archive + '.unpacked', relative)) : asar.extractFile(archive, archivePath);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const current = byPath.get(relative);
    const review = reviews.get(relative);
    const documented = review?.sha256 === sha256 && review.releaseDisposition === 'include' && review.permission && review.license && review.license !== 'UNVERIFIED';
    const accepted = verify([{path:relative,sha256}], records, ownerDecisions).length === 0;
    files.push({path:relative, sha256, bytes:bytes.length, kind:current?.kind || 'unclassified', sourceMatches:current?.sha256 === sha256, evidence:review?.evidence || current?.evidence || null, source:review?.source || current?.source || null, disposition:documented ? 'documented' : accepted ? 'owner-directed-source-permission-unverified' : 'hold'});
  }
  const present = new Set(files.map(row => row.path));
  const sourceOnlyAssets = source.filter(row => /^(public\/|licenses\/|NOTICE\.md$)/.test(row.path) && !present.has(row.path)).map(row => ({path:row.path,kind:row.kind,bytes:row.bytes}));
  const groups = {};
  for (const file of files) {
    const group = groups[file.kind] ||= {files:0, bytes:0, holds:0};
    group.files++; group.bytes += file.bytes; group.holds += Number(file.disposition === 'hold');
  }
  return {version:1, createdAt:new Date().toISOString(), artifact:directory, qaOnly:fs.existsSync(path.join(directory, 'resources/LOCAL-QA-ONLY')), limitations:['Exact public assets, licenses and NOTICE in this archive only.', 'Bundled code/embedded databases, runtime dependency licenses, remote assets and store media require separate review.', 'Absent source assets are not certified absent from compiled bundles.', 'Missing documentation is not proof of third-party ownership. No permissions are inferred.'], summary:{packagedFiles:files.length, sourceOnlyAssetFiles:sourceOnlyAssets.length, changedSincePackage:files.filter(row=>!row.sourceMatches).length, groups}, files, sourceOnlyAssets};
}
if (require.main === module) {
  const report = reconcile(path.resolve(process.argv[2] || 'dist-qa/win-unpacked'));
  const destination = path.join(root, 'docs/launch-readiness/evidence/L31-PACKAGED-CONTENT-RECONCILIATION.json');
  fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report.summary, null, 2));
}
module.exports = {reconcile};
