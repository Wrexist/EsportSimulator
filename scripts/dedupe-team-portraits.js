// Ensures no team shows the same portrait on two of its own players.
// The snapshot draws every player's avatar from a shared pool of ~214 renders,
// so collisions are unavoidable globally — but two identical faces in ONE roster
// read as a bug. This reassigns each in-roster duplicate to a portrait the team
// is not already using, chosen deterministically from the player id.
const fs = require('fs');
const P = 'public/data/snapshot/players.json';
const T = 'public/data/snapshot/teams.json';
const players = JSON.parse(fs.readFileSync(P, 'utf8'));
const teams = JSON.parse(fs.readFileSync(T, 'utf8'));
const byId = {}; for (const p of players) byId[p.id] = p;

const pool = [...new Set(players.map(p => p.portraitPath))].filter(Boolean).sort();
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

let fixed = 0;
for (const t of teams) {
  const used = new Set();
  for (const id of (t.rosterIds || [])) {
    const pl = byId[id]; if (!pl) continue;
    if (!used.has(pl.portraitPath)) { used.add(pl.portraitPath); continue; }
    // collision: pick a pool portrait this team isn't using yet, deterministically
    const start = hash(id) % pool.length;
    let pick = null;
    for (let k = 0; k < pool.length; k++) { const cand = pool[(start + k) % pool.length]; if (!used.has(cand)) { pick = cand; break; } }
    if (pick) { pl.portraitPath = pick; used.add(pick); fixed++; }
  }
}

// verify
let remaining = 0;
for (const t of teams) {
  const s = new Set(); let n = 0;
  for (const id of (t.rosterIds || [])) { const pl = byId[id]; if (!pl) continue; if (s.has(pl.portraitPath)) n++; s.add(pl.portraitPath); }
  if (n) remaining++;
}
fs.writeFileSync(P, JSON.stringify(players, null, 2) + '\n');
console.log('reassigned', fixed, 'duplicate in-roster portrait(s); teams with remaining internal dups:', remaining);
