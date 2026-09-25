// Explicitly read-only: no achievements, stats, Cloud files or Workshop content are written.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const report = { appId: 4326170, mode: 'read-only native SDK probe', sdkVersion: require('steamworks.js/package.json').version, connected: false, mutations: 0 };
try {
    const steam = require('steamworks.js').init(report.appId);
    report.connected = true;
    const read = fn => { try { return fn(); } catch (error) { return { error: error.message }; } };
    report.accountFingerprint = read(() => crypto.createHash('sha256').update(String(steam.localplayer.getSteamId().steamId64)).digest('hex'));
    report.subscribed = read(() => steam.apps.isSubscribedApp(report.appId));
    report.runningAppId = read(() => steam.utils.getAppId());
    report.installedBuildId = read(() => steam.apps.appBuildId());
    report.cloudAccountEnabled = read(() => steam.cloud.isEnabledForAccount());
    report.cloudAppEnabled = read(() => steam.cloud.isEnabledForApp());
    report.capabilities = { achievement: typeof steam.achievement?.activate === 'function', integerStats: typeof steam.stats?.setInt === 'function', leaderboards: typeof steam.leaderboards?.find === 'function', workshop: typeof steam.workshop?.getSubscribedItems === 'function' };
    report.sampleStats = read(() => ({ wins: steam.stats.getInt('stat_total_wins'), peakRanking: steam.stats.getInt('stat_peak_ranking') }));
    report.sampleAchievement = read(() => steam.achievement.isActivated('FIRST_WIN'));
} catch (error) { report.error = error.message; }
report.limitations = ['Not launched as the packaged game', 'No partner definition export verified', 'No two-device Cloud or mutation/lifecycle tests performed'];
fs.writeFileSync(path.join(root, 'docs/launch-readiness/evidence/L30-steam-readonly.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.connected ? 0 : 2);
