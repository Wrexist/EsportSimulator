const fs = require('node:fs');
const profile = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const nodes = new Map(profile.nodes.map(n => [n.id, n]));
const parents = new Map();
for (const n of profile.nodes) for (const child of n.children || []) parents.set(child, n.id);
const self = new Map(), total = new Map();
for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i], time = profile.timeDeltas[i];
    self.set(id, (self.get(id) || 0) + time);
    for (let node = id; node !== undefined; node = parents.get(node)) total.set(node, (total.get(node) || 0) + time);
}
const groups = new Map();
for (const [id, node] of nodes) {
    const f = node.callFrame, key = `${f.url}:${f.lineNumber + 1}:${f.functionName}`;
    const row = groups.get(key) || { location: key, selfMs: 0, inclusiveMs: 0 };
    row.selfMs += (self.get(id) || 0) / 1000;
    row.inclusiveMs += (total.get(id) || 0) / 1000;
    groups.set(key, row);
}
console.log(JSON.stringify({ durationMs: (profile.endTime - profile.startTime) / 1000,
    self: [...groups.values()].sort((a, b) => b.selfMs - a.selfMs).slice(0, 20),
    inclusive: [...groups.values()].filter(r => r.location.includes('/engine/spatial/')).sort((a, b) => b.inclusiveMs - a.inclusiveMs).slice(0, 20),
    note: 'Inclusive time overlaps between ancestors and recursive calls; do not sum it.' }, null, 2));
