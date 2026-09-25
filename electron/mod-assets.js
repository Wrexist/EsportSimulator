// Immutable local art bundles keep saved careers independent of the active mod.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { containedPath, readBounded, writeAtomic } = require('./local-files');
const { readDatabase } = require('./mod-storage');
const { validateModContent, MAX_MOD_BYTES } = require('./mod-content');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const inFlight = new Map();
function bundleDirectory(userData, id) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid bundle id');
    const dir = containedPath(userData, `mods/asset-bundles/${id}`);
    if (!fs.existsSync(containedPath(dir, 'database.json'))) throw new Error('Incomplete bundle');
    return dir;
}
async function pinDatabase(source, userData) {
    const database = readDatabase(source);
    if (!Object.keys(database).length) return database;
    const valid = validateModContent(database);
    if (!valid.ok) throw new Error(valid.error);
    const signature = userData + '\0' + source + '\0' + digest(JSON.stringify(database));
    if (inFlight.has(signature)) return inFlight.get(signature);
    const pending = pin(database, source, userData);
    inFlight.set(signature, pending);
    try { return await pending; } finally { inFlight.delete(signature); }
}
async function pin(database, source, userData) {
    if (/^[a-f0-9]{64}$/.test(database.assetBundleId || '')) {
        const cached = bundleDirectory(userData, database.assetBundleId);
        if (readBounded(cached, 'database.json', MAX_MOD_BYTES) === JSON.stringify(database)) return database;
    }
    const assets = new Map();
    let bytes = 0;
    const entries = [...(database.players || []), ...(database.teams || [])];
    for (const entry of entries) {
        const file = entry.portraitPath ?? entry.logoPath;
        if (!file || assets.has(file)) continue;
        if (file.startsWith('/')) {
            const pinned = /^\/mod-assets\/pinned\/([a-f0-9]{64})\/(.+)$/.exec(file);
            if (pinned) containedPath(bundleDirectory(userData, pinned[1]), pinned[2]);
            continue;
        }
        if (!/\.(png|webp|jpe?g)$/i.test(file)) throw new Error('Mod image folders support PNG, WebP and JPEG only');
        const target = containedPath(source, file);
        const stat = fs.statSync(target);
        if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw new Error(`Invalid or oversized image: ${file}`);
        bytes += stat.size;
        if (bytes > 512 * 1024 * 1024 || assets.size >= 12000) throw new Error('Mod media limit exceeded');
        const buffer = fs.readFileSync(target);
        const meta = await sharp(buffer, { limitInputPixels: 16777216 }).metadata();
        if (!['png', 'jpeg', 'webp'].includes(meta.format) || !meta.width || !meta.height || meta.width > 4096 || meta.height > 4096 || (meta.pages || 1) !== 1) throw new Error(`Unsupported image content: ${file}`);
        const extension = path.extname(file).slice(1).toLowerCase().replace('jpg', 'jpeg');
        if (meta.format !== extension) throw new Error(`Image extension does not match bytes: ${file}`);
        assets.set(file, { file, hash: digest(buffer), bytes: buffer.length });
    }
    // Already pinned database imports retain their existing immutable URLs.
    const id = digest(JSON.stringify(database) + JSON.stringify([...assets.values()]));
    const parent = containedPath(userData, 'mods/asset-bundles', true);
    fs.mkdirSync(parent, { recursive: true });
    const folder = containedPath(parent, id, true);
    const copy = JSON.parse(JSON.stringify(database));
    for (const entry of [...(copy.players || []), ...(copy.teams || [])]) {
        const key = 'portraitPath' in entry ? 'portraitPath' : 'logoPath';
        if (assets.has(entry[key])) entry[key] = `/mod-assets/pinned/${id}/${entry[key]}`;
    }
    copy.assetBundleId = id;
    if (fs.existsSync(folder)) {
        // Validate an existing cache before trusting it; partial previous writes can be repaired below.
        let matches = fs.existsSync(containedPath(folder, 'database.json', true));
        for (const asset of assets.values()) {
            try { matches = matches && digest(fs.readFileSync(containedPath(folder, asset.file))) === asset.hash; }
            catch { matches = false; }
        }
        if (matches && readBounded(folder, 'database.json', MAX_MOD_BYTES) === JSON.stringify(copy)) return copy;
    }
    fs.mkdirSync(folder, { recursive: true });
    for (const asset of assets.values()) {
        const buffer = fs.readFileSync(containedPath(source, asset.file));
        if (digest(buffer) !== asset.hash) throw new Error('Mod image changed during import');
        const dest = containedPath(folder, asset.file, true);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        writeAtomic(folder, asset.file, buffer);
    }
    // This final commit marks the bundle usable; incomplete folders are never served.
    writeAtomic(folder, 'database.json', JSON.stringify(copy));
    return copy;
}
module.exports = { pinDatabase, bundleDirectory };
