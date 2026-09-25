const path = require('node:path');
const fs = require('node:fs');
const retired = /(?:^|\/)public\/(?:assets\/teams\/[^/]+\/players\/|assets\/teams\/[^/]+\/logo\.original\.|assets\/Steamworks Bilder\/|assets\/portraits\/mockup|Live match\.jpg$|assets\/(?:Assets\.txt|Thecore)$)/i;
function retiredArtwork(entries) {
  return entries.map(entry => entry.replace(/\\/g, '/')).filter(entry => retired.test(entry) || /(?:^|\/)public\/assets\/teams\/[^/]+\/(?:logo[^/]*\.(?:png|webp|jpe?g|gif|avif)$|\.logo_)/i.test(entry));
}
function check(directory) {
  const asar = require('@electron/asar');
  const archive = path.join(directory, 'resources/app.asar');
  const entries = asar.listPackage(archive);
  if (entries.some(entry => /(?:^|[\\/])steam_appid\.txt$/i.test(entry))) throw new Error('Development steam_appid.txt must not ship inside the archive.');
  function rejectDevelopmentId(folder) {
    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
      if (item.name.toLowerCase() === 'steam_appid.txt') throw new Error('Development steam_appid.txt must not ship in the depot.');
      if (item.isDirectory()) rejectDevelopmentId(path.join(folder, item.name));
    }
  }
  rejectDevelopmentId(directory);
  const rejected = retiredArtwork(entries);
  const aliases = require('../../data/portrait-asset-aliases.json');
  const missing = Object.values(aliases).filter(asset => !fs.existsSync(path.join(directory, 'resources/app.asar.unpacked/public', asset)));
  if (rejected.length || missing.length) throw new Error(`Packaged artwork failed: ${rejected.length} retired paths, ${missing.length} missing retained portraits.`);
  return { retiredPaths: rejected.length, retainedPortraits: Object.keys(aliases).length };
}
if (require.main === module) {
  try { console.log(JSON.stringify(check(path.resolve(process.argv[2] || 'dist/win-unpacked')))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { retiredArtwork, check };
