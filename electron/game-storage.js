// Disk layout for renderer game storage (the storage-* IPC channels).
//
// Every career is its own directory, and every copy of it its own file, so a
// damaged file can only ever cost that one copy:
//
//   <userData>/saves/<careerId>/primary.json          esports_save_<id>
//   <userData>/saves/<careerId>/staging.json          esports_save_<id>.tmp
//   <userData>/saves/<careerId>/backup-1.json .. -3   esports_backup_<id>_1 .. _3
//   <userData>/saves/<careerId>/backup-corrupt.json   esports_backup_<id>_corrupt (quarantine)
//   <userData>/saves/<careerId>/backup-local.json     esports_backup_<id>_local
//   <userData>/saves/<careerId>/backup-cloud.json     esports_backup_<id>_cloud
//   <userData>/saves/<careerId>/backup.json           esports_backup_<id>
//   <userData>/saves/<careerId>/week-tick-state.json  esports_week_tick_state_<id>
//   <userData>/game-storage/<key>.json                every other allowed key
//   <userData>/storage-migration.json                 legacy import marker
//
// Values are opaque strings (integrity/tamper checks stay in SaveManager).
// Writes go to a temp file in the same directory, are fsynced, then renamed
// over the target, so a file is always either the old or the new complete copy.
//
// Older builds kept everything in electron-store's <userData>/config.json. On
// first use that file is read (never written, never deleted) and its keys are
// copied into this layout. Each copy is read back and compared before the
// marker is written; until then reads fall back to the legacy value so no
// career is ever hidden. An unreadable config.json is skipped (and retried on
// the next launch) without blocking per-file saves.
const nodeFs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { containedPath } = require('./local-files');

const SAVES_DIR = 'saves';
const GLOBAL_DIR = 'game-storage';
const LEGACY_FILE = 'config.json';
const MARKER_FILE = 'storage-migration.json';
const MIGRATION_VERSION = 1;
const MAX_LEGACY_BYTES = 1024 * 1024 * 1024;

// Career IDs become directory names: whitelist only, plus Windows device names.
const CAREER_ID = /^[A-Za-z0-9_-]{1,225}$/;
const RESERVED_NAME = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
const isCareerId = id => typeof id === 'string' && CAREER_ID.test(id) && !RESERVED_NAME.test(id);

const CAREER_FILES = [
    [/^esports_save_(.+)\.tmp$/, () => 'staging.json'],
    [/^esports_save_(.+)$/, () => 'primary.json'],
    [/^esports_backup_(.+)_(1|2|3|local|cloud|corrupt)$/, m => `backup-${m[2]}.json`],
    [/^esports_backup_(.+)$/, () => 'backup.json'],
    [/^esports_week_tick_state_(.+)$/, () => 'week-tick-state.json'],
];
const CAREER_FILE_KEYS = {
    'primary.json': id => `esports_save_${id}`,
    'staging.json': id => `esports_save_${id}.tmp`,
    'backup.json': id => `esports_backup_${id}`,
    'week-tick-state.json': id => `esports_week_tick_state_${id}`,
};
for (const suffix of ['1', '2', '3', 'local', 'cloud', 'corrupt']) CAREER_FILE_KEYS[`backup-${suffix}.json`] = id => `esports_backup_${id}_${suffix}`;

/**
 * Map an allowed storage key to its file. Returns null for keys outside the
 * game namespace and throws for a career key whose ID is not path-safe.
 */
function keyLocation(key, isStorageKey) {
    if (!isStorageKey(key)) return null;
    for (const [pattern, fileFor] of CAREER_FILES) {
        const match = pattern.exec(key);
        if (!match) continue;
        if (!isCareerId(match[1])) throw new Error('Career ID is not a safe file name');
        return { dir: `${SAVES_DIR}/${match[1]}`, file: fileFor(match) };
    }
    return { dir: GLOBAL_DIR, file: `${key}.json` };
}

const sameLocation = (a, b) => !!a && !!b && a.dir === b.dir && a.file === b.file;
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function createGameStorage({ root, fsImpl = nodeFs, isStorageKey, maxValueBytes, log = () => {} }) {
    const F = fsImpl;
    const resolvedRoot = path.resolve(root);
    let migrated = false;
    let attempted = false;
    let legacy = null; // { status: 'missing' | 'unreadable' | 'readable', values }

    const relative = (dir, file) => (dir ? `${dir}/${file}` : file);
    const location = key => {
        const where = keyLocation(key, isStorageKey);
        if (!where) throw new Error('Key outside game storage');
        return where;
    };

    function readText(dir, file) {
        let target;
        try { target = containedPath(resolvedRoot, relative(dir, file)); }
        catch (error) { if (error.code === 'ENOENT') return null; throw error; }
        const fd = F.openSync(target, 'r');
        try {
            const stat = F.fstatSync(fd);
            if (!stat.isFile() || stat.size > maxValueBytes) throw new Error('Oversized or non-file save');
            const buffer = Buffer.alloc(stat.size + 1);
            const bytes = F.readSync(fd, buffer, 0, buffer.length, 0);
            if (bytes > stat.size) throw new Error('Save changed during read');
            return buffer.subarray(0, bytes).toString('utf8');
        } finally { F.closeSync(fd); }
    }

    function retrying(operation) {
        // Windows reports EPERM/EBUSY while an indexer or antivirus holds the file.
        for (let attempt = 0; ; attempt++) {
            try { return operation(); }
            catch (error) {
                if (attempt >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
                sleep(25 * (attempt + 1));
            }
        }
    }

    function syncDirectory(directory) {
        // Persist the rename itself. Directories cannot be opened for fsync on Windows.
        if (process.platform === 'win32') return;
        let fd;
        try { fd = F.openSync(directory, 'r'); F.fsyncSync(fd); }
        catch (_) { /* best effort: not supported on every filesystem */ }
        finally { if (fd !== undefined) try { F.closeSync(fd); } catch (_) { /* ignore */ } }
    }

    function writeText(dir, file, contents) {
        const directory = dir ? containedPath(resolvedRoot, dir, true) : resolvedRoot;
        if (dir) {
            F.mkdirSync(directory, { recursive: true });
            containedPath(resolvedRoot, dir);
        }
        const target = path.join(directory, file);
        const temporary = `${target}.${crypto.randomBytes(12).toString('hex')}.tmp`;
        let fd;
        try {
            fd = F.openSync(temporary, 'wx');
            F.writeFileSync(fd, contents, 'utf8');
            try { F.fsyncSync(fd); }
            catch (error) { if (!['EINVAL', 'ENOTSUP', 'EPERM'].includes(error.code)) throw error; }
            F.closeSync(fd);
            fd = undefined;
            // Replacing the directory entry never follows an existing target link.
            containedPath(resolvedRoot, relative(dir, file), true);
            retrying(() => F.renameSync(temporary, target));
            syncDirectory(directory);
        } finally {
            if (fd !== undefined) try { F.closeSync(fd); } catch (_) { /* ignore */ }
            try { if (F.existsSync(temporary)) F.unlinkSync(temporary); } catch (_) { /* stale temp is ignored and swept later */ }
        }
    }

    function removeFile(dir, file) {
        let target;
        try { target = containedPath(resolvedRoot, `${dir}/${file}`); }
        catch (error) { if (error.code === 'ENOENT') return; throw error; }
        retrying(() => F.unlinkSync(target));
        if (dir.startsWith(`${SAVES_DIR}/`)) {
            // Drop an emptied career directory; leftovers (temps, unknown files) keep it.
            try { if (F.readdirSync(path.dirname(target)).length === 0) F.rmdirSync(path.dirname(target)); }
            catch (_) { /* best effort */ }
        }
    }

    function listDirectory(relative) {
        let directory;
        try { directory = containedPath(resolvedRoot, relative); }
        catch (error) { if (error.code === 'ENOENT') return []; throw error; }
        return F.readdirSync(directory, { withFileTypes: true });
    }

    function fileKeys() {
        const keys = [];
        const consider = (key, dir, file) => {
            // Only canonical names count; temps and foreign files are never keys.
            try { if (sameLocation(keyLocation(key, isStorageKey), { dir, file })) keys.push(key); }
            catch (_) { /* unsafe name */ }
        };
        for (const entry of listDirectory(SAVES_DIR)) {
            if (!entry.isDirectory() || !isCareerId(entry.name)) continue;
            const dir = `${SAVES_DIR}/${entry.name}`;
            for (const file of listDirectory(dir)) {
                const keyFor = file.isFile() && CAREER_FILE_KEYS[file.name];
                if (keyFor) consider(keyFor(entry.name), dir, file.name);
            }
        }
        for (const file of listDirectory(GLOBAL_DIR)) {
            if (file.isFile() && file.name.endsWith('.json')) consider(file.name.slice(0, -5), GLOBAL_DIR, file.name);
        }
        return keys;
    }

    function sweepTemporaries() {
        const temp = /\.json\.[0-9a-f]{24}\.tmp$/;
        const sweep = dir => {
            for (const file of listDirectory(dir)) {
                if (file.isFile() && temp.test(file.name)) {
                    try { F.unlinkSync(path.join(containedPath(resolvedRoot, dir), file.name)); } catch (_) { /* retry next launch */ }
                }
            }
        };
        try {
            for (const entry of listDirectory(SAVES_DIR)) if (entry.isDirectory() && isCareerId(entry.name)) sweep(`${SAVES_DIR}/${entry.name}`);
            sweep(GLOBAL_DIR);
        } catch (error) { log(`[Storage] Temp sweep skipped: ${error.message}`); }
    }

    /** Read-only parse of the legacy electron-store file. Never writes it. */
    function readLegacy() {
        if (legacy) return legacy;
        try {
            const target = containedPath(resolvedRoot, LEGACY_FILE);
            const stat = F.statSync(target);
            if (stat.size > MAX_LEGACY_BYTES) throw new Error('Legacy config.json is too large');
            const parsed = JSON.parse(F.readFileSync(target, 'utf8'));
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Legacy config.json is not an object');
            const values = new Map();
            for (const [key, value] of Object.entries(parsed)) {
                if (isStorageKey(key) && typeof value === 'string') values.set(key, value);
            }
            legacy = { status: 'readable', values };
        } catch (error) {
            legacy = error.code === 'ENOENT'
                ? { status: 'missing', values: new Map() }
                : { status: 'unreadable', values: new Map() };
            if (legacy.status === 'unreadable') log(`[Storage] Legacy config.json unreadable; per-file saves still load: ${error.message}`);
        }
        return legacy;
    }

    function markerDone() {
        try {
            const marker = JSON.parse(readText('', MARKER_FILE) ?? 'null');
            return marker?.version === MIGRATION_VERSION && marker.complete === true;
        } catch (_) { return false; }
    }

    /**
     * One-time legacy import. Idempotent and crash-safe: files are only added
     * when absent (a newer per-file copy always wins), each copy is verified by
     * reading it back, and the marker is the last write. Returns true once done.
     */
    function ensureMigrated() {
        if (migrated) return true;
        if (attempted) return false;
        attempted = true;
        try {
            if (markerDone()) { migrated = true; sweepTemporaries(); return true; }
            const source = readLegacy();
            if (source.status === 'unreadable') return false;
            const copied = [];
            const skipped = [];
            for (const [key, value] of source.values) {
                let where;
                try { where = location(key); }
                catch (_) { skipped.push(key); continue; }
                if (readText(where.dir, where.file) === null) {
                    writeText(where.dir, where.file, value);
                    if (readText(where.dir, where.file) !== value) throw new Error(`Migrated copy of ${key} did not verify`);
                    copied.push(key);
                }
            }
            if (skipped.length) log(`[Storage] Legacy keys left in config.json (unsafe career ID): ${skipped.length}`);
            writeText('', MARKER_FILE, JSON.stringify({
                version: MIGRATION_VERSION, complete: true, source: LEGACY_FILE, sourceStatus: source.status,
                migratedAt: new Date().toISOString(), copied, skipped,
            }));
            migrated = true;
            legacy = null;
            sweepTemporaries();
            return true;
        } catch (error) {
            log(`[Storage] Legacy save import incomplete; will retry next launch: ${error.message}`);
            return false;
        }
    }

    // Until the import completes, the legacy copy stays visible (read-only).
    const pendingLegacy = () => (migrated ? new Map() : readLegacy().values);

    return {
        root: resolvedRoot,
        ensureMigrated,
        isMigrated: () => migrated,
        getItem(key) {
            ensureMigrated();
            const where = location(key);
            const value = readText(where.dir, where.file);
            if (value !== null) return value;
            return pendingLegacy().get(key) ?? null;
        },
        setItem(key, value) {
            ensureMigrated();
            const where = location(key);
            writeText(where.dir, where.file, value);
            return true;
        },
        removeItem(key) {
            ensureMigrated();
            const where = location(key);
            // A legacy copy would come back on the next import; refuse instead of lying.
            if (pendingLegacy().has(key)) throw new Error('Legacy save import pending');
            removeFile(where.dir, where.file);
            return true;
        },
        clear() {
            ensureMigrated();
            if (pendingLegacy().size) throw new Error('Legacy save import pending');
            for (const key of fileKeys()) {
                const where = location(key);
                removeFile(where.dir, where.file);
            }
            return true;
        },
        getAllKeys() {
            ensureMigrated();
            return [...new Set([...fileKeys(), ...pendingLegacy().keys()])];
        },
    };
}

module.exports = { createGameStorage, keyLocation, isCareerId, SAVES_DIR, GLOBAL_DIR, LEGACY_FILE, MARKER_FILE };
