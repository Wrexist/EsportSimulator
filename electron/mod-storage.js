const fs = require('fs');
const { containedPath, readBounded, writeAtomic } = require('./local-files');
const { MAX_MOD_BYTES, parseModContent } = require('./mod-content');
const SECTIONS = ['players', 'teams', 'tournaments'];

function readDatabase(dir) {
    const current = containedPath(dir, 'database.json', true);
    if (fs.existsSync(current)) {
        const text = readBounded(dir, 'database.json', MAX_MOD_BYTES);
        const value = JSON.parse(text);
        if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return value;
        const checked = parseModContent(text);
        if (!checked.ok) throw new Error(checked.error);
        return checked.value;
    }
    const database = {};
    for (const name of [...SECTIONS, 'manifest']) {
        const file = `${name}.json`;
        if (fs.existsSync(containedPath(dir, file, true))) database[name] = JSON.parse(readBounded(dir, file, MAX_MOD_BYTES));
    }
    if (SECTIONS.some(key => database[key] !== undefined)) {
        const checked = parseModContent(JSON.stringify(database));
        if (!checked.ok) throw new Error(checked.error);
    }
    return database;
}
function installDatabase(dir, text) {
    const result = parseModContent(text);
    if (!result.ok) return false;
    fs.mkdirSync(dir, { recursive: true });
    // Preserve the entire previous database before the single commit point.
    const previous = readDatabase(dir);
    const backup = JSON.stringify(previous);
    if (Buffer.byteLength(backup) > MAX_MOD_BYTES) throw new Error('Previous database exceeds backup limit');
    writeAtomic(dir, 'database.previous.json', backup);
    const { players, teams, tournaments, manifest } = result.value;
    writeAtomic(dir, 'database.json', JSON.stringify({ schema: 1, players, teams, tournaments, manifest }));
    return true;
}
function restoreDatabase(dir) {
    const text = readBounded(dir, 'database.previous.json', MAX_MOD_BYTES);
    const old = JSON.parse(text);
    if (Object.keys(old).length && !parseModContent(text).ok) return false;
    // Keep the backup intact, including if the commit fails. Repeated restore is idempotent.
    writeAtomic(dir, 'database.json', text);
    return true;
}
function clearDatabase(dir) {
    fs.mkdirSync(dir, { recursive: true });
    const previous = readDatabase(dir);
    if (SECTIONS.some(key => previous[key] !== undefined)) writeAtomic(dir, 'database.previous.json', JSON.stringify(previous));
    // A tombstone masks legacy files without deleting the user's originals or assets.
    writeAtomic(dir, 'database.json', '{}');
    return true;
}
module.exports = { readDatabase, installDatabase, restoreDatabase, clearDatabase };
