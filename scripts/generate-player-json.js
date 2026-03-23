/**
 * Generate player.json and team.json files from enriched xlsx data.
 *
 * For players WITHOUT stats (Rating 3.0, Firepower etc.), generates realistic
 * stats based on teammates' averages with ±15% random variation.
 *
 * Usage:
 *   node scripts/generate-player-json.js
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const PROJECT_ROOT = path.join(__dirname, '..');
const ASSETS_DIR = path.join(PROJECT_ROOT, 'public', 'assets', 'teams');
const ENRICHED_XLSX = path.join(PROJECT_ROOT, '.claude', 'Playerdata', 'Player_Team_list_enriched.xlsx');

function sanitizeName(name) {
    return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '').replace(/_+/g, '_');
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Clamp a value within a range
function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

// Seeded RNG for reproducible results (based on player name)
function seededRandom(seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
        h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
    }
    return function() {
        h = (h * 1103515245 + 12345) & 0x7fffffff;
        return h / 0x7fffffff;
    };
}

// Generate matches played based on team rank (higher rank = more matches)
function estimateMatchesPlayed(teamRank) {
    if (teamRank <= 10) return 200 + Math.floor(Math.random() * 100);
    if (teamRank <= 30) return 150 + Math.floor(Math.random() * 80);
    if (teamRank <= 50) return 100 + Math.floor(Math.random() * 60);
    if (teamRank <= 100) return 60 + Math.floor(Math.random() * 50);
    return 30 + Math.floor(Math.random() * 40);
}

// Country code from flag URL like /img/static/flags/30x20/SE.gif
function extractCountryCodeFromFlag(flagUrl) {
    if (!flagUrl) return '';
    const match = flagUrl.match(/\/([A-Z]{2})\.gif/i);
    return match ? match[1].toLowerCase() : '';
}

const STAT_FIELDS = ['Firepower', 'Entrying', 'Trading', 'Opening', 'Clutching', 'Sniping', 'Utility'];

function main() {
    console.log('='.repeat(60));
    console.log('  Player & Team JSON Generator');
    console.log('='.repeat(60));
    console.log();

    // Load enriched xlsx
    console.log(`Loading: ${ENRICHED_XLSX}`);
    const workbook = XLSX.readFile(ENRICHED_XLSX);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    console.log(`Loaded ${data.length} team rows.\n`);

    let playerJsonsCreated = 0;
    let playerJsonsSkipped = 0;
    let teamJsonsCreated = 0;
    let statsGenerated = 0;

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const teamName = row['Team Name'] || `Team #${i}`;
        const teamSlug = sanitizeName(teamName);
        const teamRank = String(row['Team Rank'] || '').replace(/[^0-9]/g, '') || '999';
        const teamDir = path.join(ASSETS_DIR, teamSlug);
        const playersDir = path.join(teamDir, 'players');

        // Collect all player data for this team
        const players = [];
        for (let p = 1; p <= 5; p++) {
            const name = row[`Player ${p} Name`] || '';
            if (!name) continue;

            const country = row[`Player ${p} Country`] || '';
            const countryCode = (row[`Player ${p} Country Code`] || extractCountryCodeFromFlag(row[`Player ${p} Country Flag`] || '')).toLowerCase();
            const age = parseInt(row[`Player ${p} Age`]) || 0;
            const rating = parseFloat(row[`Player ${p} Rating 3.0`]) || 0;

            const stats = {};
            for (const field of STAT_FIELDS) {
                const val = parseFloat(row[`Player ${p} ${field}`]);
                stats[field.toLowerCase()] = isNaN(val) ? 0 : val;
            }

            const hasStats = rating > 0;

            players.push({
                idx: p,
                name,
                country,
                countryCode,
                age,
                rating,
                stats,
                hasStats,
            });
        }

        // Calculate team averages for filling missing stats
        const playersWithStats = players.filter(p => p.hasStats);
        let teamAvgRating = 0.90; // default for completely missing teams
        const teamAvgStats = {};

        if (playersWithStats.length > 0) {
            teamAvgRating = playersWithStats.reduce((sum, p) => sum + p.rating, 0) / playersWithStats.length;
            for (const field of STAT_FIELDS) {
                const key = field.toLowerCase();
                const vals = playersWithStats.map(p => p.stats[key]).filter(v => v > 0);
                teamAvgStats[key] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 40;
            }
        } else {
            // No teammates have stats, generate based on team rank
            const rankFactor = clamp(1 - (parseInt(teamRank) - 1) / 300, 0.3, 1.0);
            teamAvgRating = 0.80 + rankFactor * 0.30; // 0.80 to 1.10
            for (const field of STAT_FIELDS) {
                teamAvgStats[field.toLowerCase()] = 20 + rankFactor * 50; // 20 to 70
            }
        }

        // Generate player JSONs
        for (const player of players) {
            const playerSlug = sanitizeName(player.name);
            ensureDir(playersDir);
            const jsonPath = path.join(playersDir, `${playerSlug}.json`);

            let rating = player.rating;
            let stats = { ...player.stats };
            let wasGenerated = false;

            // Fill missing stats
            if (!player.hasStats) {
                const rng = seededRandom(player.name + teamName);
                wasGenerated = true;
                statsGenerated++;

                // Generate rating based on team average with variation
                rating = clamp(
                    teamAvgRating + (rng() - 0.5) * 0.30,
                    0.50, 2.00
                );
                rating = Math.round(rating * 100) / 100;

                // Generate each stat based on team average
                for (const field of STAT_FIELDS) {
                    const key = field.toLowerCase();
                    const avg = teamAvgStats[key] || 40;
                    const variation = avg * 0.30 * (rng() - 0.5); // ±15%
                    stats[key] = clamp(Math.round(avg + variation), 0, 100);
                }
            } else {
                // Even for players with stats, fill any zero-valued stats
                for (const field of STAT_FIELDS) {
                    const key = field.toLowerCase();
                    if (stats[key] === 0 || stats[key] === undefined) {
                        const rng = seededRandom(player.name + key);
                        const avg = teamAvgStats[key] || 30;
                        stats[key] = clamp(Math.round(avg * (0.5 + rng() * 0.5)), 0, 100);
                    }
                }
            }

            const playerJson = {
                name: player.name,
                country: player.country,
                countryCode: player.countryCode,
                team: teamName,
                teamRank: teamRank,
                age: player.age || (18 + Math.floor(seededRandom(player.name)() * 15)),
                rating: rating,
                stats: {
                    firepower: stats.firepower || 0,
                    entrying: stats.entrying || 0,
                    trading: stats.trading || 0,
                    opening: stats.opening || 0,
                    clutching: stats.clutching || 0,
                    sniping: stats.sniping || 0,
                    utility: stats.utility || 0,
                },
                matchesPlayed: estimateMatchesPlayed(parseInt(teamRank)),
                hltvHistory: [],
            };

            fs.writeFileSync(jsonPath, JSON.stringify(playerJson, null, 2) + '\n');
            playerJsonsCreated++;
        }

        // Generate team.json
        ensureDir(teamDir);
        const teamJsonPath = path.join(teamDir, 'team.json');
        const teamJson = {
            name: teamName,
            hltvRank: teamRank,
            nationality: row['Team Nationality'] || '',
            players: players.map(p => ({
                name: p.name,
                country: p.country,
                countryCode: p.countryCode,
            })),
            matchesPlayed: estimateMatchesPlayed(parseInt(teamRank)),
            hltvHistory: [],
        };

        fs.writeFileSync(teamJsonPath, JSON.stringify(teamJson, null, 2) + '\n');
        teamJsonsCreated++;

        if ((i + 1) % 50 === 0) {
            console.log(`  Processed ${i + 1}/${data.length} teams...`);
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('  JSON GENERATION COMPLETE');
    console.log('='.repeat(60));
    console.log(`  Player JSONs created:  ${playerJsonsCreated}`);
    console.log(`  Team JSONs created:    ${teamJsonsCreated}`);
    console.log(`  Stats generated (no HLTV data): ${statsGenerated}`);
    console.log('='.repeat(60));
}

main();
