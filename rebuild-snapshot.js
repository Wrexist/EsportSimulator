/**
 * Rebuild players.json from individual team player files
 * This script updates the main snapshot with HLTV data
 */

const fs = require('fs');
const path = require('path');

const teamsDir = path.join(__dirname, 'public', 'assets', 'teams');
const snapshotPath = path.join(__dirname, 'public', 'data', 'snapshot', 'players.json');

// Load existing snapshot to preserve structure
let existingPlayers = [];
try {
    existingPlayers = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    console.log(`Loaded ${existingPlayers.length} existing players from snapshot`);
} catch (err) {
    console.error('Could not load existing snapshot:', err.message);
}

// Create a map of existing players by nickname (lowercase)
const existingByNickname = new Map();
for (const p of existingPlayers) {
    existingByNickname.set(p.nickname?.toLowerCase(), p);
}

// Walk through team directories and update with HLTV data
function walkDir(dir, callback) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
        const filepath = path.join(dir, f);
        const stat = fs.statSync(filepath);
        if (stat.isDirectory()) {
            walkDir(filepath, callback);
        } else if (f.endsWith('.json') && filepath.includes('players')) {
            callback(filepath);
        }
    }
}

let updatedCount = 0;

walkDir(teamsDir, (filepath) => {
    try {
        const content = fs.readFileSync(filepath, 'utf8');
        const playerData = JSON.parse(content);

        const nickname = playerData.name?.toLowerCase();
        if (!nickname) return;

        // Find matching player in snapshot
        const existingPlayer = existingByNickname.get(nickname);

        if (existingPlayer && playerData.hltvHistory) {
            // Update with HLTV data
            existingPlayer.hltvHistory = playerData.hltvHistory;
            existingPlayer.matchesPlayed = playerData.matchesPlayed || 0;
            existingPlayer.majorWins = playerData.majorWins || 0;
            existingPlayer.totalMVPs = playerData.totalMVPs || 0;
            updatedCount++;
            console.log(`✓ Updated ${existingPlayer.nickname}`);
        } else if (existingPlayer && playerData.matchesPlayed) {
            // Just matches, no HLTV history
            existingPlayer.matchesPlayed = playerData.matchesPlayed;
            existingPlayer.hltvHistory = [];
        }
    } catch (err) {
        // Skip invalid files
    }
});

// Write updated snapshot
fs.writeFileSync(snapshotPath, JSON.stringify(existingPlayers, null, 2));
console.log(`\nDone! Updated ${updatedCount} players with HLTV data.`);
console.log(`Snapshot saved to ${snapshotPath}`);
