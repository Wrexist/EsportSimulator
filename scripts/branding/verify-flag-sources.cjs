// Compare with the importer-declared vendor; do not replace local flag bytes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function main() {
  const directory = path.join(root, 'public/assets/flags');
  const files = fs.readdirSync(directory).filter(name => /^[a-z]{2}\.svg$/.test(name));
  const rows = [];
  // Modest batches avoid putting needless load on the source service.
  for (let start = 0; start < files.length; start += 4) {
    rows.push(...await Promise.all(files.slice(start, start + 4).map(async name => {
      const relative = `public/assets/flags/${name}`;
      const source = `https://flagcdn.com/${name}`;
      const local = fs.readFileSync(path.join(root, relative));
      const result = await fetch(source, {signal:AbortSignal.timeout(20000)});
      if (!result.ok) return {path:relative, source, sha256:hash(local), matched:false, status:result.status};
      const remote = Buffer.from(await result.arrayBuffer());
      return {path:relative, source, sha256:hash(local), remoteSha256:hash(remote), matched:local.equals(remote)};
    })));
  }
  const evidence = 'docs/launch-readiness/evidence/L31-FLAG-SOURCE-MATCHES.json';
  fs.writeFileSync(path.join(root, evidence), JSON.stringify({checkedAt:new Date().toISOString(),
    permissionSource:'https://flagpedia.net/download', permissionStatement:'Vendor states flags are public domain and free for commercial and non-commercial use.',
    importer:'scripts/import-assets-v2.js', files:rows}, null, 2) + '\n');
  const ledgerPath = path.join(root, 'docs/launch-readiness/evidence/L08-content-inventory.json');
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  const backup = path.join(root, 'tmp/artwork-source-check/L08-before-flag-source-matches.json');
  if (!fs.existsSync(backup)) fs.copyFileSync(ledgerPath, backup);
  for (const file of rows.filter(row => row.matched)) {
    const previous = ledger.files.find(row => row.path === file.path);
    if (!previous || previous.sha256 !== file.sha256) throw new Error(`Inventory differs: ${file.path}`);
    Object.assign(previous, {source:file.source, evidence, license:'Public domain (Flagpedia vendor declaration)',
      permission:'Exact byte match to importer-declared Flagcdn source; Flagpedia permits commercial use.',
      attribution:'Flagpedia.net / Flagcdn.com', allowedUse:'Commercial game distribution', releaseDisposition:'include', reviewBasis:'exact-vendor-byte-match'});
  }
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
  console.log(JSON.stringify({verified:rows.filter(row=>row.matched).length, unmatched:rows.filter(row=>!row.matched)}));
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
