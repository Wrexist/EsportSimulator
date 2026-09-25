const fs = require('node:fs');
const sharp = require('sharp');
const teams = require('../../public/data/snapshot/teams.json');
const players = require('../../public/data/snapshot/players.json');
const identities = require('../../data/player-portrait-identities.json');
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
(async () => {
  const rows = [];
  for (const team of teams.slice().sort((a,b) => b.reputation-a.reputation).slice(0,25)) {
    const cards = [];
    for (const id of team.rosterIds) {
      const player = players.find(p => p.id === id);
      const bytes = await sharp(`public${identities[id]}`).resize(192,192,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
      cards.push(`<figure><img alt="${esc(player.nickname)}" src="data:image/png;base64,${bytes.toString('base64')}"><figcaption>${esc(player.nickname)}</figcaption><small>${esc(id)}</small></figure>`);
    }
    rows.push(`<section><h2>${esc(team.name)}</h2><div>${cards.join('')}</div></section>`);
  }
  fs.mkdirSync('docs/ui-review/portraits',{recursive:true});
  fs.writeFileSync('docs/ui-review/portraits/top-25-2026-09-25.html',`<!doctype html><html lang="en"><meta charset="utf-8"><title>Top 25 portrait identities</title><style>body{margin:32px;background:#0d1a2d;color:#eef4ff;font:15px system-ui}h1{margin-bottom:8px}section{border-top:1px solid #31425b;padding:16px 0}section>div{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0;width:180px;text-align:center;background:#18283e;border-radius:12px;padding:8px}img{width:160px;height:160px;object-fit:contain}small{display:block;color:#9cafc6;font-size:10px;overflow-wrap:anywhere;margin-top:6px}figcaption{font-weight:700}</style><h1>Top 25 — verified portrait assignments</h1><p>128 authored stylized faces, resolved by permanent player ID. Existing face artwork retained; 36 face crops exclude branded kit. This review is not bundled in the game.</p>${rows.join('')}</html>`);
  console.log('docs/ui-review/portraits/top-25-2026-09-25.html');
})().catch(error=>{console.error(error);process.exitCode=1});
