// Explicit review decisions for project-authored content, not a blanket inventory approval.
const fs = require('node:fs');
const path = require('node:path');
const { inventory } = require('./content-provenance.cjs');
const root = path.resolve(__dirname, '../..');
const evidence = 'docs/launch-readiness/evidence/L31-PROJECT-CONTENT-REVIEW.json';
if (fs.existsSync(path.join(root, evidence))) throw new Error('Review already recorded; changed files need a new review.');
const ledgerPath = path.join(root, 'docs/launch-readiness/evidence/L08-content-inventory.json');
const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const byPath = new Map(ledger.files.map(row => [row.path, row]));
const json = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const approved = file => {
  const row = byPath.get(file);
  return row?.releaseDisposition === 'include' && row.permission && row.license !== 'UNVERIFIED';
};
// Database references must point to the retained, already reviewed asset families.
const portraits = new Set(Object.values(json('data/portrait-asset-aliases.json')));
for (const player of json('public/data/snapshot/players.json')) {
  if (player.portraitPath && (!portraits.has(player.portraitPath) || !approved('public' + player.portraitPath))) throw new Error(`Unreviewed player portrait: ${player.id}`);
}
for (const team of json('public/data/snapshot/teams.json')) {
  if (team.logoPath && !approved('public' + team.logoPath)) throw new Error(`Unreviewed stock team logo: ${team.id}`);
}
for (const tournament of json('public/data/snapshot/tournaments.json')) {
  if (tournament.logoPath && !approved('public' + tournament.logoPath)) throw new Error(`Unreviewed tournament logo: ${tournament.id}`);
}
const projectData = new Set([
  'data/drills.json', 'data/identity-refresh.json', 'data/index.ts',
  'data/map-layouts/index.ts', 'data/map-layouts/types.ts', 'data/map-pool.ts',
  'data/portrait-asset-aliases.json', 'data/snapshot-loader.ts', 'data/snapshot-types.ts',
  'data/team-identity-catalog.json', 'data/tournament-calendar.ts', 'data/tournaments.json',
  'public/data/snapshot/players.json', 'public/data/snapshot/sources.json',
  'public/data/snapshot/teams.json', 'public/data/snapshot/tournaments.json',
]);
const reviewed = [];
for (const file of inventory()) {
  let decision;
  if (/^public\/assets\/legends\/[^/]+\.svg$/.test(file.path) || /^public\/(player|staff)_placeholder\.webp$/.test(file.path)) {
    decision = {basis:'owner-attested portrait family', source:'L31-OWNER-ART-CONFIRMATION.json', license:'Project-created portraits; owner-attested origin',
      permission:'Owner confirmed fictional player/staff portraits were created for this project. These legend portraits and generic portrait placeholders are members of that same family.'};
  } else if (file.path === 'public/team_placeholder.webp') {
    decision = {basis:'owner-attested badge family',source:'L31-OWNER-ADDITIONAL-ART-CONFIRMATION.json',license:'Project-created badge; owner-attested origin',
      permission:'Generic TEAM placeholder badge reviewed as part of the owner-confirmed project-created badge illustrations; it contains no original team identity.'};
  } else if (file.path === 'public/assets/grid.svg' || /^public\/assets\/teams\/(eurora|falconry|perivesion)\/logo\.redesign\.svg$/.test(file.path)) {
    const svg = fs.readFileSync(path.join(root,file.path),'utf8');
    if (/<image\b|<script\b|\bhref\s*=|data:image/i.test(svg)) throw new Error(`Embedded source requires review: ${file.path}`);
    decision = {basis:'inspected project SVG drawing',source:'Project SVG source and L25 retained SVG study manifest',license:'Project-authored SVG drawing',
      permission:'Owner authorized the fictional logo redesigns and their inclusion in the game. Reviewed files contain locally authored vector paths/patterns, with no embedded original raster assets.'};
  } else if (projectData.has(file.path)) {
    decision = {basis:'project implementation and game-data review',source:'Project implementation, sanitize-snapshot.ts, refresh-identities.py, portrait migration and identity catalog',license:'Project implementation and game-data compilation',
      permission:'Owner authorized distribution of this game and its fictionalized game database. Reviewed schema/loader/configuration, aliases, ratings and game text; media references checked separately against reviewed assets. This is not a license for original imported photography or logos.'};
  } else if (/^public\/map-studio\/(encounters|reviews|teams)\//.test(file.path) || file.path === 'public/map-studio/registration.json') {
    JSON.parse(fs.readFileSync(path.join(root,file.path),'utf8'));
    decision = {basis:'project-authored spatial fixtures over owner-authorized maps',source:'scripts/launch/build-l11-fixtures.ts, build-l12-fixtures.ts, build-l13-fixtures.ts, review-mirage-v12.ts; L31-OWNER-MAP-CONFIRMATION.json',license:'Project simulation fixtures; underlying map use owner-attested',
      permission:'Project-authored encounter settings, routes and review results derived from the map data the owner confirmed was permitted. No independent third-party lineup collection is approved here.'};
  } else if (file.path === 'NOTICE.md') {
    decision = {basis:'project-authored notice review',source:'Verified font, flag, dependency and owner-confirmation records',license:'Project-authored attribution notice',permission:'Project release attribution document; owner authorized preparation and distribution with the game.'};
  }
  if (!decision) continue;
  reviewed.push({...file,...decision});
}
const backup = path.join(root,'tmp/artwork-source-check/L08-before-project-content-review.json');
fs.mkdirSync(path.dirname(backup),{recursive:true});
if (!fs.existsSync(backup)) fs.copyFileSync(ledgerPath,backup);
fs.writeFileSync(path.join(root,evidence),JSON.stringify({recordedAt:new Date().toISOString(),
  limitations:['Source/creation review and owner authorization, not independent legal certification.', 'Excluded originals remain local. Imported lineup collection and mixed drafts remain outside this review.', 'Earlier owner confirmations apply to portrait/badge families regardless of their storage folder.'],
  files:reviewed.map(({path,sha256,bytes,basis,source,license,permission})=>({path,sha256,bytes,basis,source,license,permission}))},null,2)+'\n');
for (const file of reviewed) {
  const previous=byPath.get(file.path);
  const next={...previous,...file,evidence,reviewBasis:file.basis,allowedUse:'Include these exact reviewed project bytes in the game.',releaseDisposition:'include'};
  if(previous) Object.assign(previous,next);else ledger.files.push(next);
}
fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');
console.log(`Reconciled ${reviewed.length} explicit project-content records; lineup collection and mixed drafts not approved.`);
