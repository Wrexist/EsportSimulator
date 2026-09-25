#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { RELEASE_APP_ID } = require('../electron/steam-app-id.cjs');
if (RELEASE_APP_ID !== 4326170) throw new Error('Unexpected release Steam App ID');
const file = path.join(__dirname, '..', 'steam_appid.txt');
if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').trim() !== String(RELEASE_APP_ID)) {
    throw new Error('Development steam_appid.txt does not match the release configuration');
}
console.log(`[steam-appid] Release App ID ${RELEASE_APP_ID}; development ID file must not ship.`);
