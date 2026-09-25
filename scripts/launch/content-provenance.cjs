// Inventory is evidence, never an ownership assertion. Unknown and changed bytes fail closed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { minimatch } = require('minimatch');
const root = path.resolve(__dirname, '../..');
const rosterPath = 'docs/launch-readiness/evidence/L08-content-inventory.json';
const roots = ['public', 'data', 'app', 'components', 'lib', 'engine', 'store', 'hooks', 'types', 'build', 'licenses', 'NOTICE.md'];
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function walk(base, rel) {
  const target = path.join(base, rel);
  if (!fs.existsSync(target)) return [];
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) throw new Error(`Content link needs review: ${rel}`);
  return stat.isDirectory() ? fs.readdirSync(target).sort().flatMap(n => walk(base, `${rel}/${n}`)) : [rel];
}
function category(p) {
  if (p.includes('/drafts/')) return ['user-draft-mixed', 'Owner annotations mixed with imported radar outlines and CS2Nades lineups; retain original backup', 'docs/MAP-STUDIO-TACTICAL.md'];
  if (p.includes('/spatial/')) return ['map-geometry', 'https://github.com/pnxenopoulos/awpy-data/releases/tag/2000908', 'docs/audit-2026-09-13/spatial-import.json'];
  if (/map-studio-library|map-utility-templates/.test(p)) return ['lineup-reference', 'https://cs2nades.gg ; https://getreplay.gg/en/articles/cs2-mirage-lineups', 'docs/MAP-STUDIO-TACTICAL.md'];
  if (/map-layouts|radar-nav|public\/maps/.test(p)) return ['map-reference', 'Imported or derived map reference; exact upstream permission unresolved', 'docs/SPATIAL-LAB.md'];
  if (/fonts\//.test(p)) return ['font', 'Archivo Black / Google Fonts; binary origin still needs matching', 'https://github.com/google/fonts/tree/main/ofl/archivoblack'];
  if (/branding\/portraits\//.test(p)) return ['portrait', 'Retained portrait bytes relocated from legacy player folders; migration is not creation or permission evidence', 'docs/launch-readiness/evidence/L31-PORTRAIT-MIGRATION.json'];
  if (/Steamworks Bilder|capture-steam|trailer|branding|logo\.(ico|png)/i.test(p)) return ['marketing-branding', 'Local store/build artwork; creator and source evidence required', 'docs/STEAM_REVIEW_REMEDIATION_PLAN.md'];
  if (/\/players\/|portraits|legends|staff|placeholder/.test(p)) return ['portrait', 'Existing generated/edited artwork claims; original inputs, model terms and likeness review required', 'public/data/snapshot/sources.json'];
  if (/\/teams\/|tournaments/.test(p) && /\.(png|webp|svg|jpg)$/i.test(p)) return ['logo', 'Fictionalized existing identities; original reference and creator rights unresolved', 'docs/audit-2026-09-12/logo-reference-audit.json'];
  if (/\.(mp3|wav|ogg|flac)$/i.test(p)) return ['sound', 'Source permission unresolved', null];
  if (/^data\/|public\/data\/|hltvrankiing/.test(p)) return ['database', 'Existing source/sanitization records are not permission evidence', 'public/data/snapshot/sources.json'];
  if (/\.(tsx?|js|cjs)$/.test(p)) return ['code-and-player-text', 'Project implementation; embedded text, remote URLs and generated content require review', null];
  return ['artwork-other', 'No item-specific permission located', null];
}
function inventory(base = root) {
  return roots.flatMap(r => walk(base, r)).map(p => {
    const bytes = fs.readFileSync(path.join(base, p));
    const [kind, source, evidence] = category(p);
    return {path:p, sha256:digest(bytes), bytes:bytes.length, kind, source, evidence,
      license:'UNVERIFIED', permission:null, attribution:null, allowedUse:'Development review only; no release clearance established', releaseDisposition:'hold'};
  });
}
function verify(current, recorded, ownerDecisions = []) {
  const rows = new Map(recorded.map(r => [r.path, r]));
  const decisions = new Map(ownerDecisions.map(r => [r.path, r]));
  return current.flatMap(file => {
    const row = rows.get(file.path);
    if (!row || row.sha256 !== file.sha256) return [`${file.path}: missing or changed content review`];
    // Exclusion requires artifact evidence; marking an entry excluded does not remove bundled imports.
    const decision = decisions.get(file.path);
    const ownerDirected = decision?.sha256 === file.sha256 && decision?.decision === 'ship-with-unverified-source-permission' && decision?.authorization === 'Ship everything' && decision?.evidence;
    if (row.releaseDisposition !== 'include' || (!ownerDirected && (!row.permission || !row.license || row.license === 'UNVERIFIED'))) return [`${file.path}: distribution evidence unresolved`];
    return [];
  });
}
function ownerReleaseDecisions() {
  const file = path.join(root, 'docs/launch-readiness/evidence/L31-OWNER-LINEUP-RELEASE-DECISION.json');
  if (!fs.existsSync(file)) return [];
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  return record.files.map(row => ({...row, authorization:record.statement, decision:record.decision,
    evidence:'docs/launch-readiness/evidence/L31-OWNER-LINEUP-RELEASE-DECISION.json'}));
}
// Keep the full source inventory for audit, but gate distribution assets using
// the same positive/negative file patterns as electron-builder. Source data and
// imported fonts can be compiled into Next output, so they remain in scope.
function releaseInventory(current, patterns) {
  if (!Array.isArray(patterns) || patterns.some(p => typeof p !== 'string')) throw new Error('Unsupported packaging file rules; inspect content selection.');
  const matches = (file, pattern) => minimatch(file, pattern, { dot: true });
  return current.filter(file => {
    if (/^(data\/|app\/.*\.(woff2?|ttf|otf)$|build\/icon\.(png|ico)$)/i.test(file.path)) return true;
    return patterns.some(p => !p.startsWith('!') && matches(file.path, p)) &&
      !patterns.some(p => p.startsWith('!') && matches(file.path, p.slice(1)));
  });
}
function check() {
  const rows = JSON.parse(fs.readFileSync(path.join(root, rosterPath), 'utf8')).files;
  const patterns = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).build.files;
  const issues = verify(releaseInventory(inventory(), patterns), rows, ownerReleaseDecisions());
  if (issues.length) throw new Error(`Content release blocked: ${issues.length} unresolved/changed items. See ${rosterPath}. No files were removed.`);
}
function verifyPackaged(current, recorded, ownerDecisions = []) {
  const fonts = recorded.filter(row => /\.(woff2?|ttf|otf)$/i.test(row.path));
  return current.flatMap(file => {
    if (file.path.startsWith('.next/static/media/')) {
      const source = fonts.find(row => row.sha256 === file.sha256);
      return source ? verify([{ ...file, path: source.path }], [source]) : [`${file.path}: packaged media has no reviewed source hash`];
    }
    return verify([file], recorded, ownerDecisions);
  });
}
function checkPackaged(directory) {
  const asar = require('@electron/asar');
  const archive = path.join(directory, 'resources/app.asar');
  const rows = JSON.parse(fs.readFileSync(path.join(root, rosterPath), 'utf8')).files;
  const files = [];
  for (const entry of asar.listPackage(archive)) {
    const relative = entry.replace(/\\/g, '/').replace(/^\//, '');
    if (!/^(public\/|licenses\/|NOTICE\.md$|\.next\/static\/media\/)/.test(relative)) continue;
    const nativePath = path.normalize(relative);
    const stat = asar.statFile(archive, nativePath);
    if (stat.files) continue;
    if (stat.link) throw new Error(`Packaged content link needs review: ${relative}`);
    const bytes = stat.unpacked ? fs.readFileSync(path.join(archive + '.unpacked', relative)) : asar.extractFile(archive, nativePath);
    files.push({ path: relative, sha256: digest(bytes) });
  }
  if (!files.length) throw new Error('Packaged content inventory is empty.');
  const issues = verifyPackaged(files, rows, ownerReleaseDecisions());
  if (issues.length) throw new Error(`Packaged content release blocked: ${issues.length} unresolved/changed items; first: ${issues[0]}`);
  return { reviewedPackagedFiles: files.length };
}
if (require.main === module) {
  if (process.argv.includes('--inventory')) {
    const previous = fs.existsSync(path.join(root, rosterPath)) ? JSON.parse(fs.readFileSync(path.join(root, rosterPath), 'utf8')) : {files:[]};
    const oldRows = new Map(previous.files.map(row => [row.path, row]));
    const files = inventory().map(row => {
      const old = oldRows.get(row.path);
      if (old?.sha256 === row.sha256) return old;
      return old ? {...row, previousReview:old} : row;
    });
    fs.writeFileSync(path.join(root, rosterPath), JSON.stringify({version:1, reviewedAt:new Date().toISOString(), scope:roots, limitations:['Complete file roster for these roots; includes source with bundled player text. Remote assets and account-only store media need separate review. Not a packaged artifact inventory.'], files}, null, 2)+'\n');
    console.log(`Inventoried ${files.length} files; all pending item-specific rights review.`);
  } else { try { check(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
}
module.exports = {inventory, releaseInventory, verify, verifyPackaged, ownerReleaseDecisions, check, checkPackaged};
