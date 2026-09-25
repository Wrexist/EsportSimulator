// Local diagnostic packaging does not assert distribution clearance.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
async function main() {
  if (!fs.existsSync(path.join(root, '.next/BUILD_ID'))) throw new Error('Run npm run build first.');
  const { build, Platform, Arch } = require('electron-builder');
  const original = require('../../package.json').build;
  const marker = path.join(root, 'tmp/qa-package/LOCAL-QA-ONLY');
  fs.mkdirSync(path.dirname(marker), { recursive: true });
  fs.writeFileSync(marker, 'LOCAL QA ONLY. Content review unresolved. Not for Steam upload.\n');
  await build({ projectDir: root, targets: Platform.WINDOWS.createTarget(['dir'], Arch.x64), config: {
    ...original,
    appId: 'com.esportssim.localqa', productName: 'Esports Manager Local QA', executableName: 'EsportsManager-QA',
    directories: { ...original.directories, output: 'dist-qa' },
    extraMetadata: { main: 'electron/qa-electron-main.cjs' },
    extraResources: [{ from: marker, to: 'LOCAL-QA-ONLY' }],
    files: [...original.files, { from: 'scripts/launch', to: 'electron', filter: ['qa-electron-main.cjs'] }],
    beforePack: async () => { console.log('LOCAL QA ONLY: release content gate remains unresolved.'); },
  }});
}
main().catch(error => { console.error(error); process.exitCode = 1; });
