const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const readline = require('node:readline/promises');
const root = path.resolve(__dirname, '..');
async function main() {
  const vdf = path.join(root, 'deployment/config/app_build_4326170.vdf');
  const config = fs.readFileSync(vdf, 'utf8');
  const contentRoot = config.match(/"contentroot"\s+"([^"]+)"/i)?.[1];
  const appId = config.match(/"appid"\s+"(\d+)"/i)?.[1];
  if (appId !== '4326170' || !contentRoot || path.resolve(path.dirname(vdf), contentRoot).toLowerCase() !== path.join(root, 'dist/win-unpacked').toLowerCase()) {
    throw new Error('Upload stopped: VDF must target App 4326170 and the verified dist/win-unpacked folder.');
  }
  const guard = spawnSync(process.execPath, [path.join(__dirname, 'verify-ship-build.js')], { cwd: root, stdio: 'inherit' });
  if (guard.error || guard.status !== 0) throw new Error('Upload stopped: package verification failed.');
  const steamcmd = ['C:/steamcmd/steamcmd.exe', path.join(root, 'steamcmd/steamcmd.exe'), path.join(root, 'steamcmd.exe')].find(p => fs.existsSync(p));
  if (!steamcmd) throw new Error('steamcmd.exe not found.');
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  let username;
  try { username = (await prompt.question('Steam account name: ')).trim(); }
  finally { prompt.close(); }
  if (!/^[a-zA-Z0-9_]{2,64}$/.test(username)) throw new Error('Invalid Steam account name.');
  const result = spawnSync(steamcmd, ['+login', username, '+run_app_build', vdf, '+quit'], { cwd: root, stdio: 'inherit', shell: false });
  if (result.error || result.status !== 0) throw new Error(`SteamCMD failed (${result.status ?? result.error?.message}).`);
  console.log('SteamCMD finished. Verify the new Build ID and depot in Steamworks before review submission.');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
