const fs = require('fs');
const path = require('path');
// const csv = require('csv-parser'); // Using manual parsing

const CSV_FILE = path.join(process.cwd(), 'public', 'players_rating3_output.csv');
const ASSETS_DIR = path.join(process.cwd(), 'public', 'assets', 'teams');

// Manual CSV Parser
function parseCSV(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        // Handle quotes? Simple split for now since we control the output
        // Our scraper uses quotes for name: url,"name",age...
        // Let's use a regex to split by comma ignoring quotes
        const row = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
        if (!row) continue;

        const obj = {};
        headers.forEach((h, idx) => {
            let val = row[idx] ? row[idx].replace(/^"|"$/g, '').trim() : '';
            obj[h] = val;
        });
        data.push(obj);
    }
    return data;
}

function sanitizeName(name) {
    if (!name) return '';
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function injectStats() {
    console.log('Loading CSV...');
    const records = parseCSV(CSV_FILE);
    console.log(`Loaded ${records.length} records.`);

    if (records.length === 0) {
        console.log('No records found. Exiting.');
        return;
    }

    // Map by normalized name for easy lookup
    const statsMap = new Map();
    records.forEach(r => {
        if (r.player_name) {
            statsMap.set(sanitizeName(r.player_name), r);
        }
    });

    // Traverse assets
    let updated = 0;
    const teams = fs.readdirSync(ASSETS_DIR);

    for (const team of teams) {
        const teamDir = path.join(ASSETS_DIR, team);
        const playersDir = path.join(teamDir, 'players');
        if (!fs.existsSync(playersDir)) continue;

        const playerFiles = fs.readdirSync(playersDir).filter(f => f.endsWith('.json'));

        for (const pFile of playerFiles) {
            const pPath = path.join(playersDir, pFile);
            const pData = JSON.parse(fs.readFileSync(pPath, 'utf8'));

            // Try to match
            // 1. Exact name match (normalized)
            const pNameNorm = sanitizeName(pData.name);
            let stat = statsMap.get(pNameNorm);

            if (stat) {
                // Update Fields
                if (stat.age) pData.age = parseInt(stat.age);
                if (stat.rating_3) pData.rating = parseFloat(stat.rating_3);

                // Spider Chart
                pData.stats = {
                    firepower: parseInt(stat.firepower) || 0,
                    entrying: parseInt(stat.entrying) || 0,
                    trading: parseInt(stat.trading) || 0,
                    opening: parseInt(stat.opening) || 0,
                    clutching: parseInt(stat.clutching) || 0,
                    sniping: parseInt(stat.sniping) || 0,
                    utility: parseInt(stat.utility) || 0
                };

                fs.writeFileSync(pPath, JSON.stringify(pData, null, 2));
                console.log(`Updated ${pData.name}`);
                updated++;
            }
        }
    }

    console.log(`\nTotal players updated: ${updated}`);
}

injectStats();
