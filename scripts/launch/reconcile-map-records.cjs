// Reconcile reviewed derivatives, not new upstream permissions. Dry run unless --write.
const fs = require('node:fs'), crypto = require('node:crypto');
const ledgerPath = 'docs/launch-readiness/evidence/L08-content-inventory.json';
const decisionPath = 'docs/launch-readiness/evidence/L31-OWNER-LINEUP-RELEASE-DECISION.json';
const evidencePath = 'docs/launch-readiness/evidence/2026-09-25-map-reconciliation.json';
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const check = (path, hash) => { if (sha(fs.readFileSync(path)) !== hash) throw Error(`Source changed: ${path}`); };
const canon = x => JSON.stringify(x, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
function sourceMarks(o, result = []) {
    if (!o || typeof o !== 'object') return result;
    if (o.source?.provider) result.push(o);
    for (const v of Object.values(o)) if (v && typeof v === 'object') sourceMarks(v, result);
    return result;
}
const ledger = read(ledgerPath), decision = read(decisionPath), priorMarks = new Set();
for (const f of decision.files) {
    check(f.path, f.sha256);
    if (f.path.endsWith('.json')) for (const mark of sourceMarks(read(f.path))) priorMarks.add(canon(mark));
}
const mapConfirmation = read('docs/launch-readiness/evidence/L31-OWNER-MAP-CONFIRMATION.json');
for (const f of mapConfirmation.files) check(f.path, f.sha256);
const outlineSource = 'data/map-interior-boundaries.json';
const outlines = new Set(read(outlineSource).maps.Anubis.upper.map(canon));
const interior = read('public/map-studio/reviews/native/Anubis/interior-audit.json');
if (!mapConfirmation.files.some(f => f.sha256 === interior.sourceRadarSha256)) throw Error('Interior radar lacks the retained map confirmation');
const nativeEvidence = [];
for (const map of ['Ancient', 'Anubis', 'Inferno', 'Nuke', 'Overpass', 'Sandstone', 'Vertigo']) {
    const path = `public/map-studio/reviews/native/${map}/audit.json`, audit = read(path);
    const root = `tmp/native-maps/${map}/maps/${audit.sourceMap}`;
    check(`${root}.nav`, audit.sourceHashes.nav);
    check(`${root}/world_physics.vmdl_c`, audit.sourceHashes.physics);
    for (const [file, hash] of Object.entries(audit.sourceHashes.entities)) check(`${root}/entities/${file}`, hash);
    nativeEvidence.push({ path, sha256: sha(fs.readFileSync(path)), extraction: audit.extraction, sourceHashes: audit.sourceHashes });
}
const mirageAudit = read('public/map-studio/reviews/mirage-native/audit.json');
for (const [file, hash] of [
    ['tmp/mirage-local/maps/de_mirage.nav', mirageAudit.sourceHashes.nav],
    ['tmp/mirage-local/maps/de_mirage/world_physics.vmdl_c', mirageAudit.sourceHashes.physics],
    ['tmp/mirage-local/maps/de_mirage/entities/default_ents.vents_c', mirageAudit.sourceHashes.entities],
    ['public/map-studio/drafts/mirage-user-v13-2026-09-22.json', '68d5ce44e95636de7e0a8972044b840ae0a0ecfe4265f4cb9c8969fd2c7671e8'],
]) check(file, hash);
const files = [];
for (const issue of read('docs/launch-readiness/evidence/2026-09-25-content-recheck.json').issues) {
    const path = issue.split(': ')[0];
    if (!/^public\/map-studio\/(drafts|reviews|teams)\/[^.].*\.(json|html)$/.test(path) &&
        !['data/map-interior-boundaries.json', 'data/map-pool.ts', 'data/native-map-drafts.json', 'data/physical-map-scenarios.json'].includes(path)) throw Error(`Unreviewed family: ${path}`);
    const bytes = fs.readFileSync(path), marks = path.endsWith('.json') ? sourceMarks(JSON.parse(bytes)) : [];
    const lineups = marks.filter(m => m.source.provider === 'CS2Nades');
    for (const mark of marks) {
        if (priorMarks.has(canon(mark))) continue;
        if (mark.source.provider === 'radar-outline' && outlines.has(canon(mark))) continue;
        throw Error(`New or edited third-party marking: ${path}: ${mark.id}`);
    }
    const embedded = [];
    if (path.endsWith('.html')) {
        for (const match of bytes.toString().matchAll(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/g)) {
            const hash = sha(Buffer.from(match[1], 'base64'));
            const source = mapConfirmation.files.find(f => f.sha256 === hash);
            if (!source) throw Error('Unreviewed embedded image');
            embedded.push({ source: source.path, sha256: hash });
        }
        if (/<script\b|https?:\/\/(?!www\.w3\.org\/)/i.test(bytes.toString())) throw Error('Review HTML has additional external/active content');
    }
    files.push({ path, sha256: sha(bytes), bytes: bytes.length, unchangedLineupMarks: lineups.length, embedded,
        basis: lineups.length ? 'Identical retained lineup marks inside owner/project map derivatives; original owner-directed inclusion remains unverified upstream.'
            : 'Project-authored map configuration, generated review/scenario data or map derivative under retained owner map-use confirmation and explicit native-map integration request.' });
}
const evidence = { date: '2026-09-25', files, nativeEvidence,
    basis: 'Existing owner map-use confirmation, supplied v13 drawing, explicit installed-map extraction/integration requests and prior Ship everything decision for the unchanged lineup collection.',
    limitations: ['No new agreement, upstream permission or Valve endorsement is asserted.', 'Lineup source permission remains unverified; owner-directed inclusion is recorded separately.', 'This is exact-byte source reconciliation, not geometry acceptance or final packaged inventory.', 'Original real-player photos and team logos remain excluded.'] };
if (process.argv.includes('--write')) {
    for (const [path, name] of [[ledgerPath, 'ledger'], [decisionPath, 'lineup-decision']]) fs.copyFileSync(path, `tmp/before-map-reconciliation-${name}.json`);
    for (const f of files) {
        const row = { path: f.path, sha256: f.sha256, bytes: f.bytes, kind: f.unchangedLineupMarks ? 'user-draft-mixed' : 'project-map-derivative',
            source: f.basis, evidence: evidencePath,
            license: f.unchangedLineupMarks ? 'UNVERIFIED' : 'Owner-attested permitted map use and project-authored metadata; no named agreement supplied',
            permission: f.unchangedLineupMarks ? null : 'Owner confirmed map use and explicitly requested integration of these native map derivatives into this game.',
            attribution: 'Underlying map references retain their source metadata; lineup marks retain their source links.',
            allowedUse: f.basis, releaseDisposition: 'include', reviewBasis: f.unchangedLineupMarks ? 'owner-directed, source permission unverified' : 'owner-attested with retained source lineage' };
        const i = ledger.files.findIndex(r => r.path === f.path);
        if (i < 0) ledger.files.push(row); else ledger.files[i] = row;
        if (f.unchangedLineupMarks) {
            const entry = { path: f.path, sha256: f.sha256, bytes: f.bytes, derivationEvidence: evidencePath };
            const n = decision.files.findIndex(r => r.path === f.path);
            if (n < 0) decision.files.push(entry); else decision.files[n] = entry;
        }
    }
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
    fs.writeFileSync(decisionPath, JSON.stringify(decision, null, 2) + '\n');
}
console.log(JSON.stringify({ write: process.argv.includes('--write'), files: files.length, mixed: files.filter(f => f.unchangedLineupMarks).length, nativeAudits: nativeEvidence.length }));
