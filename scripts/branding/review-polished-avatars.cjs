const fs = require('node:fs');
const sharp = require('sharp');
const records = require('../../data/player-portrait-reviewed.json');
const players = require('../../public/data/snapshot/players.json');
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function main() {
  const tiles = [];
  const html = [];
  for (const [i,r] of records.entries()) {
    const png = await sharp(`public${r.destination}`).resize(160,160).png().toBuffer();
    tiles.push({input:png,left:(i%5)*176+8,top:Math.floor(i/5)*180+12});
    const p = players.find(p=>p.id===r.id);
    html.push(`<article><img src="data:image/png;base64,${png.toString('base64')}" alt="${escape(p.nickname || p.name)}"><strong>${escape(p.nickname || p.name)}</strong><small>${escape(r.id)}</small></article>`);
  }
  await sharp({create:{width:880,height:Math.ceil(records.length/5)*180,channels:4,background:'#15243a'}}).composite(tiles).png().toFile('docs/ui-review/portraits/polished-progress.png');
  fs.writeFileSync('docs/ui-review/portraits/polished-progress.html',`<!doctype html><meta charset="utf-8"><title>Reviewed avatar progress</title><style>body{background:#15243a;color:#eef3ff;font:14px system-ui;margin:28px}main{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}article{background:#20334b;padding:12px;text-align:center;border-radius:12px}img{width:160px;height:160px;object-fit:contain}strong,small{display:block}small{font-size:10px;overflow-wrap:anywhere;color:#b5c6dc}</style><h1>${records.length} reviewed avatars</h1><p>Asset preview, not an in-game screenshot. Production status and any missing or unverified photo sources are listed in production-progress.json.</p><main>${html.join('')}</main>`);
  const audit = JSON.parse(fs.readFileSync('docs/ui-review/portraits/all-player-source-audit.json','utf8'));
  const ids = new Set(records.map(r=>r.id));
  const remaining = audit.rows.filter(r=>!ids.has(r.id));
  const exceptionsPath = 'docs/ui-review/portraits/source-review-exceptions.json';
  const exceptions = fs.existsSync(exceptionsPath) ? JSON.parse(fs.readFileSync(exceptionsPath,'utf8')) : {};
  const sourceStatusCounts = {};
  const approved = new Map();
  for (const file of fs.readdirSync('docs/ui-review/portraits').filter(f => /^batch-\d+-approved-inputs\.json$/.test(f))) {
    for (const row of JSON.parse(fs.readFileSync(`docs/ui-review/portraits/${file}`, 'utf8'))) approved.set(row.id, row);
  }
  const queue = remaining.map(row => {
    const source = approved.get(row.id)?.source;
    const generated = fs.existsSync(`docs/ui-review/portraits/generated-results/${row.id}.json`);
    const status = source ? (generated ? 'generated-awaiting-export-review' : 'approved-personal-photo-awaiting-generation') : exceptions[row.id]?.status || row.status;
    return {id:row.id,nickname:row.nickname,source:source || (exceptions[row.id] ? null : row.originalPhoto ? `public${row.originalPhoto}` : row.archivedPhotos?.[0] || row.authoredCandidates[0] || row.otherSourceCandidates[0] || null),status};
  });
  for (const row of queue) {
    const status = row.status;
    sourceStatusCounts[status] = (sourceStatusCounts[status] || 0) + 1;
  }
  fs.writeFileSync('docs/ui-review/portraits/production-progress.json',JSON.stringify({
    mode:'built-in imagegen; user explicitly declined API on 2026-09-25',
    total:players.length,delivered:records.length,remaining:remaining.length,sourceStatusCounts,
    note:'Approved personal-photo sources are distinguished from unverified candidates and placeholders. Generated images are not delivered until exported, visually reviewed and synced. Built-in tool orchestration runs only in the active agent session; no API background service.',
    queue,
  },null,2)+'\n');
  console.log(JSON.stringify({delivered:records.length,remaining:remaining.length}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
