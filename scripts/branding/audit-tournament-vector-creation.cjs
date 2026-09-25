const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const commit = execFileSync('git', ['rev-parse', '8d9344e8'], {cwd:root, encoding:'utf8'}).trim();
const sourcePath = 'lib/safe-branding/logo-generator.ts';
const source = execFileSync('git', ['show', `${commit}:${sourcePath}`], {cwd:root, encoding:'utf8'});
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const exportsObject = {};
require('node:vm').runInNewContext(compiled, {exports:exportsObject});
const matched = [], unmatched = [];
for (const name of fs.readdirSync(path.join(root, 'public/assets/tournaments')).filter(n=>n.endsWith('.svg'))) {
  const relative = `public/assets/tournaments/${name}`;
  const bytes = fs.readFileSync(path.join(root, relative));
  const content = bytes.toString('utf8');
  const title = content.match(/aria-label="([^"]*) logo"/)?.[1];
  const seed = 'tournament_' + name.replace(/^logo_/, '').replace(/\.svg$/, '');
  const row = {path:relative,sha256:hash(bytes),seed,title};
  if (title && exportsObject.renderLogoSVG(seed,title).trim() === content.replace(/\r\n/g, '\n').trim()) matched.push(row);
  else unmatched.push(row);
}
const evidence = 'docs/launch-readiness/evidence/L31-TOURNAMENT-VECTOR-CREATION.json';
fs.writeFileSync(path.join(root,evidence),JSON.stringify({commit,sourcePath,sourceSha256:hash(source),method:'Reproduced using inspected project generator from repository history, normalizing CRLF and outer whitespace only; exact original hashes retained.',matched,unmatched},null,2)+'\n');
const ledgerPath=path.join(root,'docs/launch-readiness/evidence/L08-content-inventory.json');
const ledger=JSON.parse(fs.readFileSync(ledgerPath,'utf8'));
const backup=path.join(root,'tmp/artwork-source-check/L08-before-tournament-vector-creation.json');
if (!fs.existsSync(backup)) fs.copyFileSync(ledgerPath,backup);
for (const asset of matched) {
  const row=ledger.files.find(r=>r.path===asset.path);
  if (!row || row.sha256!==asset.sha256) throw new Error(`Inventory differs: ${asset.path}`);
  Object.assign(row,{evidence,source:`${commit}:${sourcePath}`,license:'Project-authored procedural SVG',permission:'Exact reproduction from project drawing functions; owner authorized game and event artwork for Steam.',allowedUse:'Game distribution',releaseDisposition:'include',reviewBasis:'reproduced-from-project-source'});
}
fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');
console.log(JSON.stringify({matched:matched.length,unmatched:unmatched.length}));
