const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
function tree(root) {
  if (!fs.existsSync(root)) throw new Error(`Missing required directory: ${root}`);
  return fs.readdirSync(root, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const file = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Cannot attest symbolic link: ${file}`);
    return entry.isDirectory() ? tree(file) : [file];
  });
}
function sourceIdentity(root) {
  const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {cwd: root}).toString().split('\0');
  const files = [...new Set(paths)].filter(p => p && fs.existsSync(path.join(root,p)) &&
    !/^(docs\/.*\/evidence\/|tmp\/|dist\/|\.next\/)/.test(p)).sort().map(file => ({file, sha256: sha256(fs.readFileSync(path.join(root,file)))}));
  return { digest: sha256(JSON.stringify(files)), files,
    head: execFileSync('git', ['rev-parse', 'HEAD'], {cwd:root}).toString().trim(),
    lockSha256: sha256(fs.readFileSync(path.join(root,'package-lock.json'))),
    scope: 'Git tracked and nonignored untracked files, excluding generated evidence, tmp, dist and .next. Includes local uncommitted changes; ignored files are not attested.' };
}
function artifactIdentity(root, source) {
  if (!fs.existsSync(path.join(root, 'EsportsManager.exe'))) throw new Error('Windows executable missing');
  const files = tree(root).map(file => ({file: path.relative(root,file).replaceAll('\\','/'), bytes: fs.statSync(file).size, sha256: sha256(fs.readFileSync(file))}));
  return {sourceDigest: source.digest, lockSha256: source.lockSha256, digest: sha256(JSON.stringify(files)), files};
}
function summarize(gates, required) {
  const missing = required.filter(id => !gates.some(g => g.id === id));
  const passed = missing.length === 0 && required.every(id => gates.filter(g => g.id === id).length === 1 && gates.find(g => g.id === id).status === 'passed');
  return {passed, missing};
}
module.exports = {sha256, tree, sourceIdentity, artifactIdentity, summarize};
