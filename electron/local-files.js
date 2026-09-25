const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Reject links/junctions at every component, including the selected mod root.
// This defends imported/static mod trees; it is not isolation from a hostile OS user.
function containedPath(root, relative, allowMissing = false) {
    if (typeof relative !== 'string' || !relative || /[:\0\\]/.test(relative) || path.isAbsolute(relative)) throw new Error('Invalid relative path');
    const parts = relative.split('/');
    if (parts.some(p=>!p || p==='.' || p==='..')) throw new Error('Invalid path component');
    let current = path.resolve(root);
    const rootStat = fs.lstatSync(current);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('Invalid root');
    for (let i=0;i<parts.length;i++) {
        current = path.join(current, parts[i]);
        let stat;
        try { stat = fs.lstatSync(current); }
        catch (error) { if (allowMissing && error.code==='ENOENT') continue; throw error; }
        if (stat.isSymbolicLink() || (i<parts.length-1 && !stat.isDirectory())) throw new Error('Linked or invalid path');
    }
    return current;
}
function readBounded(root, relative, maxBytes) {
    const target = containedPath(root, relative);
    const fd = fs.openSync(target, 'r');
    try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.size > maxBytes) throw new Error('Oversized or non-file input');
        // A fixed-size buffer also bounds growth between stat and read.
        const buffer = Buffer.alloc(stat.size + 1);
        const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
        if (bytes > stat.size) throw new Error('File changed during read');
        return buffer.subarray(0, bytes).toString('utf8');
    } finally { fs.closeSync(fd); }
}
function writeAtomic(root, relative, contents) {
    const target = containedPath(root, relative, true);
    const parent = path.dirname(target);
    fs.mkdirSync(parent, {recursive:true});
    containedPath(root, relative, true);
    const temporary = `${target}.${crypto.randomBytes(12).toString('hex')}.tmp`;
    try {
        fs.writeFileSync(temporary, contents, {encoding:'utf8',flag:'wx'});
        // Replacing the directory entry never follows an existing target symlink.
        containedPath(root, relative, true);
        fs.renameSync(temporary, target);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
module.exports = { containedPath, readBounded, writeAtomic };
