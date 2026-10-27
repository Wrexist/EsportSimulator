#!/usr/bin/env node
/**
 * Upload the free demo build to its own Steam app:
 *   npm run upload:demo -- --app-id <demo App ID> --depot-id <demo depot ID>
 *
 * Writes the demo app/depot VDFs (same file rules as the full game's
 * deployment/config VDFs) into deployment/demo/, checks dist-demo/win-unpacked
 * with the ship guard, then runs SteamCMD. Setting the build live stays a
 * manual step in Steamworks.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const readline = require('node:readline/promises');
const { parseDemoAppId } = require('../electron/edition.cjs');

const root = path.resolve(__dirname, '..');
const configDir = path.join(root, 'deployment/demo');

function argValue(argv, flag) {
    const at = argv.indexOf(flag);
    return at >= 0 ? argv[at + 1] : undefined;
}

function demoVdfs(appId, depotId) {
    const fullDepot = fs.readFileSync(path.join(root, 'deployment/config/depot_build_4326171.vdf'), 'utf8');
    const depot = fullDepot.replace(/"DepotID"\s+"4326171"/, `"DepotID" "${depotId}"`);
    if (depot === fullDepot) throw new Error('Could not adapt the full game depot VDF.');
    const app = [
        '"appbuild"',
        '{',
        `\t"appid" "${appId}"`,
        `\t"desc" "Esports Manager: FPS free demo"`,
        '\t"buildoutput" "..\\build_output"',
        '\t// The demo package from npm run dist:demo; never the source tree.',
        '\t"contentroot" "..\\..\\dist-demo\\win-unpacked"',
        '\t"preview" "0"',
        '\t"depots"',
        '\t{',
        `\t\t"${depotId}" "depot_build_${depotId}.vdf"`,
        '\t}',
        '}',
        '',
    ].join('\n');
    return { app, depot };
}

async function main() {
    const argv = process.argv.slice(2);
    const appId = parseDemoAppId(argValue(argv, '--app-id') ?? process.env.ESM_DEMO_APP_ID);
    const depotRaw = argValue(argv, '--depot-id') ?? process.env.ESM_DEMO_DEPOT_ID;
    const depotId = /^[1-9][0-9]{0,9}$/.test(String(depotRaw ?? '')) && depotRaw !== '4326171' ? String(depotRaw) : null;
    if (!appId || !depotId) throw new Error('Upload stopped: pass --app-id <demo App ID> and --depot-id <demo depot ID> from Steamworks.');

    const packaged = path.join(root, 'dist-demo/win-unpacked/resources/app.asar');
    if (!fs.existsSync(packaged)) throw new Error('Upload stopped: build the demo first (npm run dist:demo -- --app-id ' + appId + ').');

    const { app, depot } = demoVdfs(appId, depotId);
    fs.mkdirSync(configDir, { recursive: true });
    const appVdf = path.join(configDir, `app_build_${appId}.vdf`);
    fs.writeFileSync(appVdf, app);
    fs.writeFileSync(path.join(configDir, `depot_build_${depotId}.vdf`), depot);

    const guard = spawnSync(process.execPath, [path.join(__dirname, 'verify-ship-build.js'), 'dist-demo/win-unpacked'], { cwd: root, stdio: 'inherit' });
    if (guard.error || guard.status !== 0) throw new Error('Upload stopped: package verification failed.');
    const steamcmd = ['C:/steamcmd/steamcmd.exe', path.join(root, 'steamcmd/steamcmd.exe'), path.join(root, 'steamcmd.exe')].find(p => fs.existsSync(p));
    if (!steamcmd) throw new Error('steamcmd.exe not found.');
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    let username;
    try { username = (await prompt.question('Steam account name: ')).trim(); }
    finally { prompt.close(); }
    if (!/^[a-zA-Z0-9_]{2,64}$/.test(username)) throw new Error('Invalid Steam account name.');
    const result = spawnSync(steamcmd, ['+login', username, '+run_app_build', appVdf, '+quit'], { cwd: root, stdio: 'inherit', shell: false });
    if (result.error || result.status !== 0) throw new Error(`SteamCMD failed (${result.status ?? result.error?.message}).`);
    console.log('SteamCMD finished. Set the new demo build live on its default branch in Steamworks.');
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { demoVdfs };
