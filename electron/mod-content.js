// Pure validation shared by the renderer, desktop import boundary and mod tools.
const MAX_MOD_BYTES = 16 * 1024 * 1024;
const LIMITS = { players: 10000, teams: 2000, tournaments: 2000 };
const STATS = 'skill awp rifle pistol grenades creativity clutch tactic leader teamwork amicability productivity stressResistance loyalty reaction eyesight health strength endurance potential'.split(' ');
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const label = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 200;
const number = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
function safeAssetPath(v) {
    if (v === '') return true;
    if (typeof v !== 'string' || v.length > 512 || /[\\:%?#\x00-\x1f]/.test(v) || v.startsWith('//')) return false;
    const parts = v.replace(/^\//, '').split('/');
    return parts.every(p => p && p !== '.' && p !== '..') && /\.(png|webp|jpe?g|gif|svg|avif)$/i.test(v);
}
function inspectTree(root) {
    const stack = [[root, 0]];
    let nodes = 0;
    while (stack.length) {
        const [value, depth] = stack.pop();
        if (++nodes > 1000000 || depth > 20) return 'Payload is too complex';
        if (typeof value === 'number' && !Number.isFinite(value)) return 'Non-finite number';
        if (typeof value === 'string' && value.length > 16000) return 'Text exceeds 16000 characters';
        if (value && typeof value === 'object') {
            for (const [key, child] of Object.entries(value)) {
                if (['__proto__', 'prototype', 'constructor'].includes(key)) return 'Unsafe JSON key';
                stack.push([child, depth + 1]);
            }
        }
    }
    return null;
}
function validateModContent(raw) {
    const fail = error => ({ ok: false, error });
    if (!record(raw)) return fail('Expected a JSON object');
    const treeError = inspectTree(raw);
    if (treeError) return fail(treeError);
    if (raw.schema !== undefined && raw.schema !== 1) return fail('Unsupported database schema; expected 1');
    if (raw.manifest !== undefined && (!record(raw.manifest) || (raw.manifest.schema !== undefined && raw.manifest.schema !== 1))) return fail('Unsupported manifest schema');
    if (raw.manifest) {
        if (raw.manifest.game !== undefined && raw.manifest.game !== 'Esports Manager') return fail('Manifest targets a different game');
        if (raw.manifest.appId !== undefined && raw.manifest.appId !== 4326170) return fail('Manifest targets a different Steam app');
        for (const key of ['name', 'title', 'author', 'version']) if (raw.manifest[key] !== undefined && (typeof raw.manifest[key] !== 'string' || raw.manifest[key].length > 200)) return fail(`Invalid manifest ${key}`);
    }
    let sections = 0;
    for (const [section, limit] of Object.entries(LIMITS)) {
        const entries = raw[section];
        if (entries === undefined) continue;
        sections++;
        if (!Array.isArray(entries) || entries.length > limit) return fail(`${section} must be an array of at most ${limit} entries`);
        const ids = new Set();
        const owners = new Set();
        for (const [i, e] of entries.entries()) {
            const at = `${section}[${i}]`;
            if (!record(e) || !label(e.id) || !label(e.name)) return fail(`${at} needs an id and name`);
            if (ids.has(e.id)) return fail(`Duplicate ${section} id "${e.id}"`);
            ids.add(e.id);
            if (section === 'players') {
                if (!label(e.nickname) || !label(e.nationality) || !label(e.role) || !label(e.tier) || !number(e.age, 14, 100)) return fail(`${at} has invalid player details`);
                if (!safeAssetPath(e.portraitPath)) return fail(`${at}.portraitPath must be a safe relative asset path`);
                for (const field of STATS) if (!number(e[field], 0, 100)) return fail(`${at}.${field} must be between 0 and 100`);
            } else if (section === 'teams') {
                if (!label(e.tier) || !label(e.region) || !safeAssetPath(e.logoPath)) return fail(`${at} has invalid team details or logoPath`);
                for (const field of ['reputation', 'fanbase', 'facilitiesLevel', 'startingBudget']) if (!number(e[field], 0, 1e12)) return fail(`${at}.${field} must be a bounded non-negative number`);
                if (!Array.isArray(e.rosterIds) || e.rosterIds.length > 30) return fail(`${at}.rosterIds must contain at most 30 players`);
                for (const id of e.rosterIds) {
                    if (!label(id) || owners.has(id)) return fail(`${at} has a duplicate or invalid roster player`);
                    owners.add(id);
                }
            } else {
                for (const field of ['shortName', 'tier', 'region', 'format']) if (!label(e[field])) return fail(`${at}.${field} is required`);
                for (const field of ['prizePool', 'startWeek', 'duration']) if (!number(e[field], field === 'prizePool' ? 0 : 1, 1e9)) return fail(`${at}.${field} is invalid`);
                if (e.invitedTeamIds !== undefined && (!Array.isArray(e.invitedTeamIds) || !e.invitedTeamIds.every(label))) return fail(`${at}.invitedTeamIds is invalid`);
            }
        }
    }
    if (!sections) return fail('No players, teams, or tournaments found in payload');
    return { ok: true, value: raw };
}
function parseModContent(text) {
    if (typeof text !== 'string' || text.length > MAX_MOD_BYTES || new TextEncoder().encode(text).length > MAX_MOD_BYTES) return { ok: false, error: 'Database exceeds 16 MiB' };
    try { return validateModContent(JSON.parse(text)); } catch (_) { return { ok: false, error: 'Invalid JSON' }; }
}
// Call after merging the overlay with the bundled database; partial imports may reference base IDs.
function validateModReferences(players, teams, tournaments) {
    const playersById = new Set(players.map(p => p.id));
    const teamsById = new Set(teams.map(t => t.id));
    const tournamentsById = new Set(tournaments.map(t => t.id));
    const owners = new Set();
    for (const t of teams) for (const id of t.rosterIds || []) {
        if (!playersById.has(id)) return `Team "${t.id}" references unknown player "${id}"`;
        if (owners.has(id)) return `Player "${id}" belongs to multiple rosters`;
        owners.add(id);
    }
    for (const t of tournaments) {
        for (const id of t.invitedTeamIds || []) if (!teamsById.has(id)) return `Tournament "${t.id}" references unknown team "${id}"`;
        if (t.qualifierFor && !tournamentsById.has(t.qualifierFor)) return `Unknown qualifier destination "${t.qualifierFor}"`;
    }
    return null;
}
module.exports = { MAX_MOD_BYTES, LIMITS, STATS, safeAssetPath, validateModContent, parseModContent, validateModReferences };
