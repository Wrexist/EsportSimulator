const { spawnSync } = require('child_process');

const env = {
  ...process.env,
  ESM_STABILITY_MODE: process.env.ESM_STABILITY_MODE || '1',
};

const builderCli = require.resolve('electron-builder/out/cli/cli.js');
const result = spawnSync(process.execPath, [builderCli], {
  stdio: 'inherit',
  env,
});

if (result.error) {
  console.error('[dist] Failed to launch electron-builder:', result.error);
  process.exit(1);
}

process.exit(typeof result.status === 'number' ? result.status : 1);
