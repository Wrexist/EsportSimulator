// Game edition for the main process: the full game or the free Steam demo.
// scripts/dist-demo.cjs stamps `esmEdition: "demo"` and the demo's own Steam
// App ID (`esmDemoAppId`) into the packaged package.json; a source checkout
// and every full-game package carry neither, so they stay the full game.
// The renderer reads the same edition from NEXT_PUBLIC_ESM_EDITION (lib/edition.ts).
const FULL_GAME_APP_ID = 4326170;

function parseDemoAppId(value) {
    const id = typeof value === 'string' && /^[1-9][0-9]{0,9}$/.test(value) ? Number(value) : value;
    return Number.isSafeInteger(id) && id > 0 && id !== 480 && id !== FULL_GAME_APP_ID ? id : null;
}

function editionOf(meta) {
    const demo = !!meta && meta.esmEdition === 'demo';
    return { edition: demo ? 'demo' : 'full', demoAppId: demo ? parseDemoAppId(meta.esmDemoAppId) : null };
}

let packaged = {};
try { packaged = require('../package.json'); } catch (_) { packaged = {}; }
const { edition: EDITION, demoAppId: DEMO_APP_ID } = editionOf(packaged);

module.exports = { EDITION, IS_DEMO: EDITION === 'demo', DEMO_APP_ID, editionOf, parseDemoAppId };
