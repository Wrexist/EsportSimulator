const fs = require('node:fs');
const path = require('node:path');
const batch = process.argv[2];
if (!/^\d{2}$/.test(batch || '')) throw Error('Pass a two-digit approved batch number');
const base = 'docs/ui-review/portraits';
const approved = JSON.parse(fs.readFileSync(`${base}/batch-${batch}-approved-inputs.json`, 'utf8'));
const file = 'data/player-portrait-batch-inputs.json';
const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
const seen = new Set(existing.map(r=>`${r[4]}_${r[0]}`));
const reviewed = new Set(require('../../data/player-portrait-reviewed.json').map(r=>r.id));
let added=0, pending=0;
for(const row of approved) {
  if(seen.has(row.id)||reviewed.has(row.id)) continue;
  const result = `${base}/generated-results/${row.id}.json`;
  if(!fs.existsSync(result)) {pending++;continue;}
  const r=JSON.parse(fs.readFileSync(result,'utf8'));
  if(r.id!==row.id||r.source!==row.source||!/^exec-[\w-]+\.png$/.test(r.generated)) throw Error(`Invalid result: ${row.id}`);
  const match=row.source.match(/teams\/([^/]+)\/players\/(.+)\.(png|webp)$/);
  if(!match||!fs.existsSync(row.source)) throw Error(`Invalid source: ${row.id}`);
  const stem=row.id.split('_').pop(), prefix=row.id.slice(0,-stem.length-1);
  existing.push([stem,match[3],r.generated,match[1],prefix,match[2],...(row.source.startsWith('raw-data/')?[row.source]:[])]);
  seen.add(row.id);added++;
}
fs.writeFileSync(file,JSON.stringify(existing,null,2)+'\n');
console.log(JSON.stringify({batch,approved:approved.length,added,pending}));
