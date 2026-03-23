/**
 * HLTV Data Injection Script
 * Adds hltvHistory and matchesPlayed to known pro players
 */

const fs = require('fs');
const path = require('path');

// HLTV Top 20 historical data for known pros
const HLTV_DATA = {
    // Format: { hltvHistory: [{year, rank}], matchesPlayed, careerTeams }

    // GOAT tier
    "s1mple": {
        hltvHistory: [
            { year: 2024, rank: 6 },
            { year: 2022, rank: 1 },
            { year: 2021, rank: 1 },
            { year: 2020, rank: 2 },
            { year: 2019, rank: 3 },
            { year: 2018, rank: 1 },
            { year: 2017, rank: 8 },
            { year: 2016, rank: 4 }
        ],
        matchesPlayed: 1450,
        majorWins: 1,
        totalMVPs: 21
    },
    "zywoo": {
        hltvHistory: [
            { year: 2024, rank: 2 },
            { year: 2023, rank: 1 },
            { year: 2022, rank: 3 },
            { year: 2021, rank: 3 },
            { year: 2020, rank: 1 },
            { year: 2019, rank: 1 }
        ],
        matchesPlayed: 890,
        majorWins: 1,
        totalMVPs: 12
    },
    "donk": {
        hltvHistory: [
            { year: 2024, rank: 1 }
        ],
        matchesPlayed: 180,
        majorWins: 0,
        totalMVPs: 6
    },
    "niko": {
        hltvHistory: [
            { year: 2024, rank: 5 },
            { year: 2023, rank: 2 },
            { year: 2022, rank: 5 },
            { year: 2021, rank: 9 },
            { year: 2020, rank: 5 },
            { year: 2018, rank: 4 },
            { year: 2017, rank: 2 }
        ],
        matchesPlayed: 1320,
        majorWins: 0,
        totalMVPs: 16
    },
    "m0nesy": {
        hltvHistory: [
            { year: 2024, rank: 3 },
            { year: 2023, rank: 5 },
            { year: 2022, rank: 11 }
        ],
        matchesPlayed: 420,
        majorWins: 0,
        totalMVPs: 7
    },
    "ropz": {
        hltvHistory: [
            { year: 2024, rank: 12 },
            { year: 2023, rank: 8 },
            { year: 2022, rank: 6 },
            { year: 2021, rank: 14 },
            { year: 2020, rank: 11 },
            { year: 2019, rank: 12 },
            { year: 2018, rank: 12 }
        ],
        matchesPlayed: 980,
        majorWins: 1,
        totalMVPs: 4
    },
    "device": {
        hltvHistory: [
            { year: 2021, rank: 16 },
            { year: 2020, rank: 3 },
            { year: 2019, rank: 2 },
            { year: 2018, rank: 3 },
            { year: 2017, rank: 3 },
            { year: 2016, rank: 5 },
            { year: 2015, rank: 6 }
        ],
        matchesPlayed: 1250,
        majorWins: 4,
        totalMVPs: 13
    },
    "electronic": {
        hltvHistory: [
            { year: 2024, rank: 9 },
            { year: 2023, rank: 15 },
            { year: 2022, rank: 10 },
            { year: 2021, rank: 5 },
            { year: 2020, rank: 11 },
            { year: 2019, rank: 6 },
            { year: 2018, rank: 6 }
        ],
        matchesPlayed: 1100,
        majorWins: 1,
        totalMVPs: 8
    },
    "b1t": {
        hltvHistory: [
            { year: 2024, rank: 15 },
            { year: 2023, rank: 12 },
            { year: 2022, rank: 8 },
            { year: 2021, rank: 11 }
        ],
        matchesPlayed: 520,
        majorWins: 1,
        totalMVPs: 3
    },
    "ax1le": {
        hltvHistory: [
            { year: 2024, rank: 8 },
            { year: 2023, rank: 7 },
            { year: 2022, rank: 12 },
            { year: 2021, rank: 6 }
        ],
        matchesPlayed: 650,
        majorWins: 0,
        totalMVPs: 4
    },
    "twistzz": {
        hltvHistory: [
            { year: 2024, rank: 7 },
            { year: 2023, rank: 4 },
            { year: 2022, rank: 4 },
            { year: 2021, rank: 13 },
            { year: 2020, rank: 15 },
            { year: 2019, rank: 10 },
            { year: 2018, rank: 10 }
        ],
        matchesPlayed: 920,
        majorWins: 1,
        totalMVPs: 5
    },
    "rain": {
        hltvHistory: [
            { year: 2024, rank: 18 },
            { year: 2023, rank: 19 },
            { year: 2022, rank: 9 },
            { year: 2021, rank: 20 },
            { year: 2017, rank: 11 }
        ],
        matchesPlayed: 1150,
        majorWins: 1,
        totalMVPs: 3
    },
    "karrigan": {
        hltvHistory: [],
        matchesPlayed: 1380,
        majorWins: 1,
        totalMVPs: 0
    },
    "apeks": {
        hltvHistory: [
            { year: 2024, rank: 16 },
            { year: 2023, rank: 18 },
            { year: 2021, rank: 19 },
            { year: 2017, rank: 9 }
        ],
        matchesPlayed: 1100,
        majorWins: 2,
        totalMVPs: 2
    },
    "broky": {
        hltvHistory: [
            { year: 2024, rank: 10 },
            { year: 2023, rank: 9 },
            { year: 2022, rank: 14 },
            { year: 2021, rank: 18 }
        ],
        matchesPlayed: 680,
        majorWins: 1,
        totalMVPs: 2
    },
    "jl": {
        hltvHistory: [
            { year: 2024, rank: 14 }
        ],
        matchesPlayed: 280,
        majorWins: 0,
        totalMVPs: 2
    },
    "hunter": {
        hltvHistory: [
            { year: 2022, rank: 16 },
            { year: 2021, rank: 12 },
            { year: 2020, rank: 14 }
        ],
        matchesPlayed: 720,
        majorWins: 0,
        totalMVPs: 2
    },
    "stavn": {
        hltvHistory: [
            { year: 2024, rank: 11 },
            { year: 2023, rank: 11 },
            { year: 2022, rank: 7 },
            { year: 2021, rank: 17 }
        ],
        matchesPlayed: 750,
        majorWins: 0,
        totalMVPs: 3
    },
    "w0nderful": {
        hltvHistory: [
            { year: 2024, rank: 4 }
        ],
        matchesPlayed: 320,
        majorWins: 0,
        totalMVPs: 2
    },
    "frozen": {
        hltvHistory: [
            { year: 2024, rank: 17 },
            { year: 2023, rank: 13 },
            { year: 2022, rank: 17 }
        ],
        matchesPlayed: 680,
        majorWins: 0,
        totalMVPs: 1
    },
    "chopper": {
        hltvHistory: [
            { year: 2024, rank: 20 }
        ],
        matchesPlayed: 580,
        majorWins: 0,
        totalMVPs: 1
    },
    "flamez": {
        hltvHistory: [
            { year: 2024, rank: 13 }
        ],
        matchesPlayed: 450,
        majorWins: 0,
        totalMVPs: 3
    },
    "brollan": {
        hltvHistory: [
            { year: 2023, rank: 17 },
            { year: 2022, rank: 19 },
            { year: 2021, rank: 8 }
        ],
        matchesPlayed: 620,
        majorWins: 0,
        totalMVPs: 2
    },
    "magisk": {
        hltvHistory: [
            { year: 2023, rank: 10 },
            { year: 2020, rank: 8 },
            { year: 2019, rank: 8 },
            { year: 2018, rank: 9 }
        ],
        matchesPlayed: 980,
        majorWins: 4,
        totalMVPs: 4
    },
    "spinx": {
        hltvHistory: [
            { year: 2023, rank: 14 },
            { year: 2022, rank: 15 }
        ],
        matchesPlayed: 380,
        majorWins: 1,
        totalMVPs: 2
    },
    "xantares": {
        hltvHistory: [
            { year: 2019, rank: 18 }
        ],
        matchesPlayed: 850,
        majorWins: 0,
        totalMVPs: 1
    },
    "sh1ro": {
        hltvHistory: [
            { year: 2023, rank: 3 },
            { year: 2022, rank: 2 },
            { year: 2021, rank: 4 }
        ],
        matchesPlayed: 580,
        majorWins: 0,
        totalMVPs: 6
    },
    "hobbit": {
        hltvHistory: [
            { year: 2023, rank: 16 },
            { year: 2021, rank: 10 },
            { year: 2017, rank: 15 }
        ],
        matchesPlayed: 920,
        majorWins: 1,
        totalMVPs: 2
    },
    "jame": {
        hltvHistory: [
            { year: 2021, rank: 15 },
            { year: 2020, rank: 17 }
        ],
        matchesPlayed: 780,
        majorWins: 0,
        totalMVPs: 1
    },
    "nafany": {
        hltvHistory: [],
        matchesPlayed: 650,
        majorWins: 0,
        totalMVPs: 0
    },
    "blameF": {
        hltvHistory: [
            { year: 2023, rank: 6 },
            { year: 2022, rank: 20 },
            { year: 2020, rank: 7 }
        ],
        matchesPlayed: 780,
        majorWins: 0,
        totalMVPs: 3
    },
    "yekindar": {
        hltvHistory: [
            { year: 2022, rank: 13 },
            { year: 2021, rank: 7 }
        ],
        matchesPlayed: 520,
        majorWins: 0,
        totalMVPs: 3
    },
    "elige": {
        hltvHistory: [
            { year: 2020, rank: 9 },
            { year: 2019, rank: 4 },
            { year: 2018, rank: 14 },
            { year: 2017, rank: 12 }
        ],
        matchesPlayed: 1050,
        majorWins: 0,
        totalMVPs: 6
    },
    "teses": {
        hltvHistory: [
            { year: 2024, rank: 19 }
        ],
        matchesPlayed: 520,
        majorWins: 0,
        totalMVPs: 1
    },
    "jabbi": {
        hltvHistory: [
            { year: 2022, rank: 18 }
        ],
        matchesPlayed: 450,
        majorWins: 0,
        totalMVPs: 1
    },
    "magixx": {
        hltvHistory: [
            { year: 2024, rank: 10 }
        ],
        matchesPlayed: 420,
        majorWins: 0,
        totalMVPs: 2
    },
    "dupreeh": {
        hltvHistory: [
            { year: 2019, rank: 5 },
            { year: 2018, rank: 5 },
            { year: 2017, rank: 6 },
            { year: 2016, rank: 9 }
        ],
        matchesPlayed: 1280,
        majorWins: 4,
        totalMVPs: 4
    },
    "gla1ve": {
        hltvHistory: [],
        matchesPlayed: 1150,
        majorWins: 4,
        totalMVPs: 0
    }
};

// Walk through all player JSON files
function walkDir(dir, callback) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
        const filepath = path.join(dir, f);
        const stat = fs.statSync(filepath);
        if (stat.isDirectory()) {
            walkDir(filepath, callback);
        } else if (f.endsWith('.json')) {
            callback(filepath);
        }
    }
}

// Process a player file
function processPlayerFile(filepath) {
    try {
        const content = fs.readFileSync(filepath, 'utf8');
        const player = JSON.parse(content);

        const playerName = player.name?.toLowerCase();
        if (!playerName) return;

        const hltvData = HLTV_DATA[playerName];

        if (hltvData) {
            // Add HLTV data
            player.hltvHistory = hltvData.hltvHistory;
            player.matchesPlayed = hltvData.matchesPlayed;
            if (hltvData.majorWins) player.majorWins = hltvData.majorWins;
            if (hltvData.totalMVPs) player.totalMVPs = hltvData.totalMVPs;

            console.log(`✓ Updated ${player.name} with HLTV data`);
        } else {
            // Add default data for unknown players
            // Estimate matches based on rating (higher rating = more proven)
            const rating = player.rating || 1.0;
            const estimatedMatches = Math.round(50 + (rating - 0.9) * 500);

            player.matchesPlayed = player.matchesPlayed || Math.max(20, estimatedMatches);
            player.hltvHistory = player.hltvHistory || [];

            console.log(`  Added defaults for ${player.name} (${player.matchesPlayed} matches)`);
        }

        // Write back
        fs.writeFileSync(filepath, JSON.stringify(player, null, 2) + '\n');
    } catch (err) {
        console.error(`Error processing ${filepath}:`, err.message);
    }
}

// Main
const teamsDir = path.join(__dirname, 'public', 'assets', 'teams');
console.log('Starting HLTV data injection...\n');
walkDir(teamsDir, processPlayerFile);
console.log('\nDone!');
