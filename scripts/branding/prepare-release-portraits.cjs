// Copy the existing retained portrait pool; never edit faces or delete source artwork.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const aliasesPath = path.join(root, 'data/portrait-asset-aliases.json');
const poolPath = path.join(root, 'lib/safe-branding/portrait-pool.ts');
const snapshotPath = path.join(root, 'public/data/snapshot/players.json');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function main() {
  const source = fs.readFileSync(poolPath, 'utf8');
  const aliases = fs.existsSync(aliasesPath) ? JSON.parse(fs.readFileSync(aliasesPath, 'utf8')) : Object.fromEntries(
    [...source.matchAll(/"(\/assets\/teams\/[^"\n]+\.png)"/g)].map(([_, legacy]) => [legacy, `/branding/portraits/portrait-${digest(legacy).slice(0, 16)}.png`]));
  if (Object.keys(aliases).length < 50) throw new Error('Retained portrait pool unexpectedly small.');
  const backup = path.join(root, 'tmp/artwork-cleanup-backup');
  fs.mkdirSync(backup, { recursive: true });
  for (const file of [poolPath, snapshotPath]) {
    const target = path.join(backup, path.basename(file) + '.bak');
    if (!fs.existsSync(target)) fs.copyFileSync(file, target);
  }
  const entries = Object.entries(aliases).map(([legacy, destination]) => {
    const bytes = fs.readFileSync(path.join(root, 'public', legacy));
    const output = path.join(root, 'public', destination);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, bytes);
    return { source: legacy, destination, sha256: digest(bytes), bytes: bytes.length };
  });
  fs.writeFileSync(aliasesPath, JSON.stringify(aliases, null, 2) + '\n');
  fs.writeFileSync(poolPath, `// Retained plain-kit portraits; originals remain outside the shipping selection.\nimport { fnv1aHash } from "./portrait-features"\nimport aliases from "@/data/portrait-asset-aliases.json"\n\nexport const PORTRAIT_POOL: string[] = Object.values(aliases)\n\nexport function pickPooledPortrait(seed: string): string {\n  return PORTRAIT_POOL[fnv1aHash(seed) % PORTRAIT_POOL.length]\n}\n`);
  const players = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  for (const player of players) if (aliases[player.portraitPath]) player.portraitPath = aliases[player.portraitPath];
  fs.writeFileSync(snapshotPath, JSON.stringify(players, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'docs/launch-readiness/evidence/L31-PORTRAIT-MIGRATION.json'), JSON.stringify({
    purpose: 'Packaging cleanup, not a rights clearance assertion', entries
  }, null, 2) + '\n');
  console.log(`Copied ${entries.length} retained portraits. Original files preserved.`);
}
if (require.main === module) main();
