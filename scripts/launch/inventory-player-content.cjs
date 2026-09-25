// Evidence inventory, not a detector of AI authorship or a rights decision.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const evidence = path.join(root, 'docs/launch-readiness/evidence');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const record = file => {
    const bytes = fs.readFileSync(path.join(root, file));
    return {path: file, bytes: bytes.length, sha256: hash(bytes)};
};
function walk(dir) {
    return fs.readdirSync(path.join(root, dir), {withFileTypes: true}).flatMap(entry => {
        const file = `${dir}/${entry.name}`;
        return entry.isDirectory() ? walk(file) : [file];
    });
}
const players = JSON.parse(fs.readFileSync(path.join(root, 'public/data/snapshot/players.json'), 'utf8'));
const portraits = new Map();
for (const player of players) {
    if (typeof player.portraitPath !== 'string' || !player.portraitPath.startsWith('/')) continue;
    const file = `public${player.portraitPath}`;
    portraits.set(file, [...(portraits.get(file) || []), player.id]);
}
const portraitEntries = [...portraits].map(([file, ids]) => ({...record(file), playerIds: ids,
    classification: 'portrait-art-origin-review', evidence: 'Session history describes generated portraits and local edge cleanup; snapshot sources claim procedural generation, not item-specific proof', approval: 'PENDING_ORIGIN_AND_LIKENESS_REVIEW'}));
const sourcePaths = ['app', 'components', 'lib', 'engine', 'data', 'store'].flatMap(walk).filter(file => /\.(tsx?|json)$/.test(file));
const candidates = [];
for (const file of sourcePaths) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const signals = [];
    source.split(/\r?\n/).forEach((line, i) => {
        if (/toLocaleString\(\)|\bTODO\b|coming soon|placeholder|war-chest|guaranteed|double XP/i.test(line)) signals.push({line: i + 1, text: line.trim().slice(0, 240)});
    });
    if (signals.length) candidates.push({...record(file), signals});
}
const authoredVisible = ['lib/team-emblem-design.ts', 'components/ui/TeamEmblem.tsx', 'components/ui/help-system.tsx', 'components/ui/stat-tooltip.tsx', 'types/activities.ts', 'lib/first-session.ts', 'engine/processors/narrative-news.ts'];
const soundFiles = walk('public').filter(file => /\.(mp3|wav|ogg|flac)$/i.test(file));
const modelServiceSignals = sourcePaths.filter(file => /\.(tsx?|json)$/.test(file)).flatMap(file => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    return /api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|ollama|@anthropic-ai\/sdk|@google\/generative-ai/i.test(source) ? [file] : [];
});
const result = {
    version: 1, reviewedAt: new Date().toISOString(), purpose: 'Prepare Steam player-content disclosure and editorial review; not submitted',
    policySource: 'https://partner.steamgames.com/doc/gettingstarted/contentsurvey',
    limitations: ['Authorship cannot be established from filenames or static scans.', 'Source inventory is not a packaged artifact or full media inventory.', 'Portrait mapping does not verify face identity.', 'No live service signals is not proof of no runtime AI or outbound network use.', 'Store account media and originals require separate L08 evidence.'],
    portraits: {players: players.length, distinctFiles: portraitEntries.length, entries: portraitEntries},
    visibleAuthoredContent: authoredVisible.map(file => ({...record(file), classification: /team-emblem|TeamEmblem/.test(file) ? 'AI-assisted-crest-art-rendered-from-code' : 'player-facing-writing-review', origin: /help-system|stat-tooltip|activities/.test(file) ? 'AI-assisted editorial changes in L26 session; review against mechanics' : 'Session history/code evidence; exact item provenance remains open', approval: 'PENDING_EDITORIAL_OR_VISUAL_REVIEW'})),
    crestManifest: record('docs/launch-readiness/evidence/L25-assets/manifest.json'),
    audio: {synthesizer: record('lib/sound-manager.ts'), classification: 'runtime procedural synthesis; motif authorship/terms still require review', recordedAudioFiles: soundFiles.map(record)},
    runtime: {modelServiceSignals, classification: 'No live generative service established in inspected paths; simulation AI uses algorithms and templates', note: 'Do not classify rule-based tactical AI, seeded news templates or Web Audio oscillators as a live model service solely because they generate output.'},
    codingAssistance: {classification: 'Not automatically player-facing content; separately inspect embedded art, audio and text'},
    editorialCandidates: {files: candidates.length, signals: candidates.reduce((n, c) => n + c.signals.length, 0), entries: candidates},
    releaseDisposition: 'HOLD_L08_AND_REAL_UI_REVIEW',
};
fs.writeFileSync(path.join(evidence, 'L26-content-inventory.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({portraitFiles: portraitEntries.length, players: players.length, sourceFiles: sourcePaths.length, editorialFiles: candidates.length, editorialSignals: result.editorialCandidates.signals, recordedAudioFiles: soundFiles.length, modelServiceSignals}));
