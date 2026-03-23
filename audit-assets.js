/**
 * Audit script to find teams without logos and players without portraits
 */

const fs = require('fs');
const path = require('path');

const snapshotDir = path.join(__dirname, 'public', 'data', 'snapshot');
const assetsDir = path.join(__dirname, 'public', 'assets');

// Load snapshot data
const teams = JSON.parse(fs.readFileSync(path.join(snapshotDir, 'teams.json'), 'utf8'));
const players = JSON.parse(fs.readFileSync(path.join(snapshotDir, 'players.json'), 'utf8'));

console.log('=== AUDIT: Missing Assets ===\n');

// Check teams for missing logos
console.log('--- TEAMS WITHOUT LOGOS ---\n');
const teamsWithoutLogos = [];

for (const team of teams) {
    const logoPath = team.logoPath;

    if (!logoPath) {
        teamsWithoutLogos.push(team.name);
        continue;
    }

    // Check if file exists
    const fullPath = path.join(__dirname, 'public', logoPath);
    if (!fs.existsSync(fullPath)) {
        teamsWithoutLogos.push(`${team.name} (path exists but file missing: ${logoPath})`);
    }
}

console.log(`Total teams: ${teams.length}`);
console.log(`Teams without logos: ${teamsWithoutLogos.length}\n`);

if (teamsWithoutLogos.length > 0) {
    teamsWithoutLogos.forEach(t => console.log(`  - ${t}`));
} else {
    console.log('  All teams have logos!');
}

// Check players for missing portraits
console.log('\n--- PLAYERS WITHOUT PORTRAITS ---\n');
const playersWithoutPortraits = [];

for (const player of players) {
    const portraitPath = player.portraitPath;

    if (!portraitPath) {
        playersWithoutPortraits.push(player.nickname);
        continue;
    }

    // Check if file exists
    const fullPath = path.join(__dirname, 'public', portraitPath);
    if (!fs.existsSync(fullPath)) {
        playersWithoutPortraits.push(`${player.nickname} (path exists but file missing)`);
    }
}

console.log(`Total players: ${players.length}`);
console.log(`Players without portraits: ${playersWithoutPortraits.length}\n`);

if (playersWithoutPortraits.length > 0 && playersWithoutPortraits.length <= 50) {
    playersWithoutPortraits.forEach(p => console.log(`  - ${p}`));
} else if (playersWithoutPortraits.length > 50) {
    console.log('  First 50 players without portraits:');
    playersWithoutPortraits.slice(0, 50).forEach(p => console.log(`  - ${p}`));
    console.log(`\n  ... and ${playersWithoutPortraits.length - 50} more`);
} else {
    console.log('  All players have portraits!');
}

// Summary
console.log('\n=== SUMMARY ===');
console.log(`Teams without logos: ${teamsWithoutLogos.length} / ${teams.length}`);
console.log(`Players without portraits: ${playersWithoutPortraits.length} / ${players.length}`);
