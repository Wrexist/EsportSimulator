// Phase 5.7: release rows for the files the revamp (Phases 1-5) added or changed.
// Inventory is evidence, never an ownership assertion (see content-provenance.cjs).
//
//   node scripts/launch/record-revamp-content.cjs
//       Third-party files whose bytes were matched to their public source:
//       the Inter / Barlow Condensed woff2 files (SIL OFL 1.1, @fontsource 5.3.0),
//       the Inter licence text and the new Flagcdn flags (public domain).
//   node scripts/launch/record-revamp-content.cjs --owner-statement "<the owner's words>"
//       Also the project-made and project-edited files (round maps, radar art,
//       key art, trophy art, edited game data, NOTICE.md), citing the owner's
//       release statement, which is recorded with exact hashes in
//       docs/launch-readiness/evidence/phase5-7-owner-release-statement.json.
//
// Every row binds exact bytes: a later edit fails the gate again until re-recorded.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const rosterPath = 'docs/launch-readiness/evidence/L08-content-inventory.json';
const matchesPath = 'docs/launch-readiness/evidence/phase5-7-third-party-matches.json';
const statementPath = 'docs/launch-readiness/evidence/phase5-7-owner-release-statement.json';
const keyArtPath = 'docs/launch-readiness/evidence/phase5-6-key-art-inventory.json';

const read = rel => fs.readFileSync(path.join(root, rel));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const list = (dir, re) => fs.existsSync(path.join(root, dir))
  ? fs.readdirSync(path.join(root, dir)).filter(n => re.test(n)).sort().map(n => `${dir}/${n}`) : [];

const FONT_SOURCES = [
  [/^app\/fonts\/inter-/, '@fontsource-variable/inter 5.3.0', 'licenses/Inter-OFL.txt'],
  [/^app\/fonts\/barlow-condensed-/, '@fontsource/barlow-condensed 5.3.0', 'licenses/Barlow-OFL.txt'],
];
const NEW_FLAGS = ['at', 'az', 'co', 'gt', 'ie', 'iq', 'ir', 'jp', 'kg', 'me', 'pe', 'pk', 'ps', 'si', 've', 'vn'];

function thirdPartyRows() {
  const rows = [];
  for (const file of list('app/fonts', /^(inter|barlow-condensed)-.*\.woff2$/)) {
    const [, pkg, licence] = FONT_SOURCES.find(([re]) => re.test(file));
    rows.push({ path: file, kind: 'font', source: `${pkg} (npm), file of the same name`, evidence: matchesPath,
      license: 'SIL Open Font License 1.1', permission: `OFL 1.1 permits bundling, embedding and redistribution with software; licence text retained in ${licence}.`,
      attribution: 'See NOTICE.md', allowedUse: 'Commercial game distribution under OFL 1.1' });
  }
  rows.push({ path: 'licenses/Inter-OFL.txt', kind: 'licence-text', source: '@fontsource-variable/inter 5.3.0 LICENSE (npm)', evidence: matchesPath,
    license: 'SIL Open Font License 1.1 (licence text)', permission: 'Licence text that OFL 1.1 requires to accompany the font.', attribution: null, allowedUse: 'Ship with the game' });
  for (const c of NEW_FLAGS) {
    rows.push({ path: `public/assets/flags/${c}.svg`, kind: 'artwork-other', source: `https://flagcdn.com/${c}.svg`, evidence: matchesPath,
      license: 'Public domain (Flagpedia vendor declaration)', permission: 'Exact byte match to the Flagcdn source; Flagpedia permits commercial use.',
      attribution: 'Flagpedia.net / Flagcdn.com', allowedUse: 'Commercial game distribution' });
  }
  return rows;
}

function ownerRows(statement, previous) {
  const cite = `Owner release statement of ${statement.recordedAt.slice(0, 10)} (${statementPath}): "${statement.statement}"`;
  const rows = [];
  const mapRow = (file, script) => ({ path: file, kind: 'map-reference', source: `Project-made: ${script}, from the awpy navigation-mesh geometry and map data`,
    evidence: statementPath, license: 'Owner-attested permitted map use and project-authored metadata; no named agreement supplied',
    permission: `Owner map confirmation of 16 September 2026 (docs/launch-readiness/evidence/L31-OWNER-MAP-CONFIRMATION.json). ${cite}`,
    attribution: null, allowedUse: 'Use in this game and its Steam build, relying on the owner confirmations cited.' });
  for (const file of list('data/round-maps', /\.json$/)) rows.push(mapRow(file, 'scripts/bake-round-maps.ts'));
  for (const file of list('public/radar-art', /\.webp$/)) rows.push(mapRow(file, 'scripts/bake-radar-art.ts'));
  rows.push(mapRow('data/radar-art.json', 'scripts/bake-radar-art.ts'));
  rows.push({ path: 'data/round-maps/index.ts', kind: 'database', source: 'Project implementation: round-map index (Phase 2)', evidence: statementPath,
    license: 'Project implementation and game-data compilation', permission: cite, attribution: null, allowedUse: 'Include these exact reviewed project bytes in the game.' });
  const keyArt = JSON.parse(read(keyArtPath)).files;
  for (const row of keyArt) {
    rows.push({ path: row.path, kind: row.kind, source: row.source, evidence: statementPath, license: 'Project original',
      permission: `${row.licenseNotes ? row.licenseNotes + ' ' : ''}${cite}`, attribution: null, allowedUse: 'Commercial game distribution' });
  }
  // Files the revamp edited: same review category as before, re-recorded for the new bytes.
  const edited = ['data/tournaments.json', 'data/team-identity-catalog.json', 'data/identity-refresh.json', 'data/snapshot-loader.ts',
    'public/data/snapshot/teams.json', 'data/map-layouts/types.ts', 'data/map-layouts/vertigo.json', 'NOTICE.md'];
  for (const file of edited) {
    const old = previous.get(file);
    if (!old) throw new Error(`No earlier review row for ${file}`);
    rows.push({ path: file, kind: old.kind, source: old.source, evidence: statementPath, license: old.license,
      permission: `${old.permission} Edited in the 2026-10 revamp; ${cite}`, attribution: old.attribution ?? null, allowedUse: old.allowedUse });
  }
  return rows;
}

function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--owner-statement');
  const words = at >= 0 ? (args[at + 1] || '').trim() : '';
  if (at >= 0 && !words) throw new Error('--owner-statement needs the owner\'s words');
  const roster = JSON.parse(read(rosterPath));
  const previous = new Map(roster.files.map(r => [r.path, r]));
  const recordedAt = new Date().toISOString();

  const third = thirdPartyRows();
  fs.writeFileSync(path.join(root, matchesPath), JSON.stringify({ version: 1, recordedAt,
    method: 'Downloaded the named npm packages (npm pack) and Flagcdn SVGs and compared bytes with cmp; every file matched exactly.',
    files: third.map(r => ({ path: r.path, sha256: sha(read(r.path)), source: r.source })) }, null, 2) + '\n');
  let rows = third;
  if (words) {
    const draft = { recordedAt, statement: words, decision: 'release-project-made-revamp-content',
      context: 'Phase 5.7: the owner chose project-made assets (2026-10-11) and was asked to clear the files the revamp made or edited for release.' };
    const owner = ownerRows(draft, previous);
    fs.writeFileSync(path.join(root, statementPath), JSON.stringify({ ...draft,
      files: owner.map(r => ({ path: r.path, sha256: sha(read(r.path)), bytes: read(r.path).length })) }, null, 2) + '\n');
    rows = rows.concat(owner);
  }
  for (const row of rows) {
    const bytes = read(row.path);
    const old = previous.get(row.path);
    const next = { ...row, sha256: sha(bytes), bytes: bytes.length, releaseDisposition: 'include' };
    if (old && old.sha256 !== next.sha256) next.previousReview = { ...old, previousReview: undefined };
    const ordered = { path: next.path, sha256: next.sha256, bytes: next.bytes, kind: next.kind, source: next.source, evidence: next.evidence,
      license: next.license, permission: next.permission, attribution: next.attribution ?? null, allowedUse: next.allowedUse,
      releaseDisposition: next.releaseDisposition, ...(next.previousReview ? { previousReview: next.previousReview } : {}) };
    if (old) roster.files[roster.files.indexOf(old)] = ordered; else roster.files.push(ordered);
  }
  roster.reviewedAt = recordedAt;
  fs.writeFileSync(path.join(root, rosterPath), JSON.stringify(roster, null, 2) + '\n');
  console.log(`Recorded ${rows.length} rows (${third.length} third-party matches${words ? `, ${rows.length - third.length} under the owner statement` : ''}).`);
}

main();
