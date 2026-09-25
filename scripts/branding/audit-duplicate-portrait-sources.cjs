const fs = require('node:fs');
const crypto = require('node:crypto');
const queue = require('../../docs/ui-review/portraits/production-progress.json').queue;
const groups = new Map();
for (const row of queue) {
  if (!row.source) continue;
  const source = row.source.startsWith('/') ? `public${row.source}` : row.source;
  if (!fs.existsSync(source)) continue;
  const hash = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  if (!groups.has(hash)) groups.set(hash, []);
  groups.get(hash).push({ id: row.id, source });
}
const duplicates = [...groups.values()].filter(group => group.length > 1);
fs.writeFileSync('docs/ui-review/portraits/duplicate-source-audit.json', JSON.stringify({
  note: 'Exact duplicate files require visual review before identity generation. This audit does not change player mappings.',
  groups: duplicates,
}, null, 2) + '\n');
console.log(JSON.stringify({ groups: duplicates.length, players: duplicates.reduce((sum, group) => sum + group.length, 0) }));
