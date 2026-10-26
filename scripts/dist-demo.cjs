#!/usr/bin/env node
/**
 * Build the free Steam demo: `npm run dist:demo -- --app-id <demo App ID>`
 * (or set ESM_DEMO_APP_ID). The demo App ID is the one Steamworks gives the
 * demo app (docs/steam/DEMO.md), never the full game's 4326170.
 *
 * Same code as the full game, two differences:
 *   - the web build runs with ESM_EDITION=demo, which turns on the career
 *     week cap and the demo screens (lib/edition.ts);
 *   - electron-builder stamps esmEdition/esmDemoAppId into the packaged
 *     package.json, so the main process initializes Steam as the demo app
 *     and turns achievements, stats, cloud and Workshop off (electron/edition.cjs).
 *
 * Output: dist-demo/win-unpacked (the demo depot's content root). The product
 * name stays the same as the full game, so both read the same save folder
 * and a demo career continues in the full game.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseDemoAppId } = require('../electron/edition.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = 'dist-demo';

function demoAppIdFrom(argv, env) {
    const flag = argv.indexOf('--app-id');
    const raw = flag >= 0 ? argv[flag + 1] : env.ESM_DEMO_APP_ID;
    return parseDemoAppId(raw === undefined ? undefined : String(raw).trim());
}

function run(label, command, args, env) {
    console.log(`\n[dist:demo] ${label}`);
    const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', env, shell: false });
    if (result.error || result.status !== 0) {
        console.error(`[dist:demo] ${label} failed (${result.status ?? result.error?.message}).`);
        process.exit(1);
    }
}

function main() {
    const appId = demoAppIdFrom(process.argv.slice(2), process.env);
    if (!appId) {
        console.error('[dist:demo] Pass the demo App ID from Steamworks: npm run dist:demo -- --app-id <id> (not 4326170).');
        process.exit(1);
    }
    const env = {
        ...process.env,
        ESM_EDITION: 'demo',
        ESM_STABILITY_MODE: process.env.ESM_STABILITY_MODE || '1',
        NODE_OPTIONS: '--max-old-space-size=4096',
    };
    const node = process.execPath;
    const npmCli = process.env.npm_execpath;
    const npm = (script) => npmCli ? [node, [npmCli, 'run', script]] : [process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', script]];

    run('Release App ID check', node, [path.join(__dirname, 'check-steam-appid.js')], env);
    fs.rmSync(path.join(ROOT, OUTPUT), { recursive: true, force: true });
    run('Clean web build', ...npm('clean'), env);
    run('Optimize images', ...npm('optimize:images'), env);
    run('Web build (demo edition)', node, [require.resolve('next/dist/bin/next'), 'build'], env);
    run('Worker build check', ...npm('verify:worker-build'), env);
    run('Package demo', node, [
        require.resolve('electron-builder/out/cli/cli.js'),
        '--win', 'dir',
        '-c.directories.output=' + OUTPUT,
        '-c.extraMetadata.esmEdition=demo',
        '-c.extraMetadata.esmDemoAppId=' + appId,
    ], env);
    run('Ship guard', node, [path.join(__dirname, 'verify-ship-build.js'), path.join(OUTPUT, 'win-unpacked')], env);
    console.log(`\n[dist:demo] Demo for App ${appId} is ready in ${OUTPUT}/win-unpacked. Upload: npm run upload:demo -- --app-id ${appId} --depot-id <demo depot ID>`);
}

if (require.main === module) main();
module.exports = { demoAppIdFrom };
