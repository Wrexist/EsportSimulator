/**
 * Boost Base Stats for Known HLTV Top Players
 * Players with strong HLTV history deserve higher raw stats
 */

const fs = require('fs');
const path = require('path');

const snapshotPath = path.join(__dirname, 'public', 'data', 'snapshot', 'players.json');

// Load existing snapshot
let players = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
console.log(`Loaded ${players.length} players\n`);

// Stat boost based on HLTV history
// Formula: More recent + higher rank = bigger boost
function calculateBoost(player) {
    const history = player.hltvHistory || [];
    if (history.length === 0) return 0;

    const currentYear = 2025;
    let totalBoost = 0;
    let weightSum = 0;

    for (const entry of history) {
        const yearDiff = currentYear - entry.year;
        if (yearDiff < 0 || yearDiff > 6) continue;

        // Recency weight: 1.0 -> 0.6 -> 0.35 -> 0.15 -> 0.05
        const recencyWeight = Math.max(0.05, 1 - yearDiff * 0.15);

        // Rank value: #1 = 30, #3 = 25, #5 = 22, #10 = 18, #20 = 10
        let rankBoost = 0;
        if (entry.rank <= 1) rankBoost = 30;
        else if (entry.rank <= 3) rankBoost = 25;
        else if (entry.rank <= 5) rankBoost = 22;
        else if (entry.rank <= 10) rankBoost = 18;
        else if (entry.rank <= 15) rankBoost = 14;
        else if (entry.rank <= 20) rankBoost = 10;

        totalBoost += rankBoost * recencyWeight;
        weightSum += recencyWeight;
    }

    if (weightSum === 0) return 0;
    return Math.round(totalBoost / weightSum);
}

// Apply boosts
let boostedCount = 0;

for (const player of players) {
    const boost = calculateBoost(player);

    if (boost > 0) {
        const oldSkill = player.skill;

        // Boost core stats (capped at 99)
        player.skill = Math.min(99, (player.skill || 50) + boost);
        player.rifle = Math.min(99, (player.rifle || 50) + Math.round(boost * 0.8));
        player.awp = Math.min(99, (player.awp || 50) + Math.round(boost * 0.6));
        player.clutch = Math.min(99, (player.clutch || 50) + Math.round(boost * 0.7));
        player.reaction = Math.min(99, (player.reaction || 50) + Math.round(boost * 0.6));
        player.stressResistance = Math.min(99, (player.stressResistance || 50) + Math.round(boost * 0.5));

        // Boost potential too
        player.potential = Math.min(99, (player.potential || 50) + Math.round(boost * 0.5));

        boostedCount++;
        console.log(`✓ ${player.nickname}: skill ${oldSkill} → ${player.skill} (+${boost})`);
    }
}

// Save
fs.writeFileSync(snapshotPath, JSON.stringify(players, null, 2));
console.log(`\nDone! Boosted ${boostedCount} players based on HLTV history.`);
