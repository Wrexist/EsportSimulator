// Static asset references, excluding comments. This is not a rights or runtime audit.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const ts = require('typescript');
const sharp = require('sharp');
const root = path.resolve(__dirname, '../..');
async function main() {
  const files = cp.execFileSync('rg', ['--files', 'app', 'components', 'lib', 'engine', 'data'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/);
  const references = new Map();
  for (const file of files.filter(f => /\.tsx?$/.test(f))) {
    const tree = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = node => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        for (const match of node.text.matchAll(/\/[a-zA-Z0-9_./ -]+\.(?:png|webp|jpg|jpeg|svg|avif)\b/g)) {
          const asset = match[0];
          if (!references.has(asset)) references.set(asset, new Set());
          references.get(asset).add(file.replaceAll('\\', '/'));
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  const rows = [];
  for (const [asset, owners] of [...references].sort(([a], [b]) => a.localeCompare(b))) {
    const absolute = path.join(root, 'public', asset);
    const exists = fs.existsSync(absolute);
    let metadata = {};
    if (exists) {
      const info = await sharp(absolute).metadata();
      metadata = { width: info.width, height: info.height, alpha: info.hasAlpha, bytes: fs.statSync(absolute).size };
    }
    rows.push({ asset, exists, ...metadata, usedBy: [...owners].sort() });
  }
  const report = { scope: 'Static literal image references. Comments excluded. Dynamic/mod/save paths need runtime checks. No legal clearance inferred.', references: rows.length, missing: rows.filter(r => !r.exists).length, files: rows };
  fs.writeFileSync(path.join(root, 'docs/ui-review/asset-reference-audit.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ references: report.references, missing: rows.filter(r => !r.exists) }));
  if (report.missing) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
