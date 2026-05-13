/**
 * Asset Import Script
 * Downloads team logos and player images from HLTV and organizes them into folders
 * 
 * Folder Structure:
 * /public/assets/teams/{team-name}/logo.png
 * /public/assets/teams/{team-name}/players/{player-name}.png
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

// Configuration
const EXCEL_PATH = path.join(process.cwd(), 'public', 'assets', 'Players_teams.xlsx');
const OUTPUT_BASE = path.join(process.cwd(), 'public', 'assets', 'teams');
const FLAGS_DIR = path.join(process.cwd(), 'public', 'assets', 'flags');
const MAX_TEAMS = 150; // Only import top 150 teams by HLTV ranking

// Country code mapping for flag downloads
const COUNTRY_CODES = {
    'france': 'fr', 'germany': 'de', 'united kingdom': 'gb', 'brazil': 'br',
    'russia': 'ru', 'ukraine': 'ua', 'sweden': 'se', 'denmark': 'dk',
    'poland': 'pl', 'united states': 'us', 'usa': 'us', 'canada': 'ca',
    'norway': 'no', 'finland': 'fi', 'netherlands': 'nl', 'belgium': 'be',
    'spain': 'es', 'portugal': 'pt', 'italy': 'it', 'australia': 'au',
    'new zealand': 'nz', 'china': 'cn', 'japan': 'jp', 'south korea': 'kr',
    'korea': 'kr', 'taiwan': 'tw', 'israel': 'il', 'turkey': 'tr',
    'argentina': 'ar', 'chile': 'cl', 'mexico': 'mx', 'peru': 'pe',
    'colombia': 'co', 'estonia': 'ee', 'latvia': 'lv', 'lithuania': 'lt',
    'czech republic': 'cz', 'czechia': 'cz', 'slovakia': 'sk', 'hungary': 'hu',
    'romania': 'ro', 'bulgaria': 'bg', 'serbia': 'rs', 'croatia': 'hr',
    'slovenia': 'si', 'bosnia and herzegovina': 'ba', 'north macedonia': 'mk',
    'montenegro': 'me', 'albania': 'al', 'greece': 'gr', 'austria': 'at',
    'switzerland': 'ch', 'ireland': 'ie', 'kazakhstan': 'kz', 'uzbekistan': 'uz',
    'mongolia': 'mn', 'indonesia': 'id', 'malaysia': 'my', 'singapore': 'sg',
    'thailand': 'th', 'vietnam': 'vn', 'philippines': 'ph', 'india': 'in',
    'pakistan': 'pk', 'south africa': 'za', 'morocco': 'ma', 'egypt': 'eg',
    'jordan': 'jo', 'lebanon': 'lb', 'saudi arabia': 'sa', 'uae': 'ae',
    'united arab emirates': 'ae', 'iceland': 'is', 'kosovo': 'xk',
    'hong kong': 'hk', 'malta': 'mt', 'cyprus': 'cy', 'luxembourg': 'lu',
    'belarus': 'by', 'georgia': 'ge', 'armenia': 'am', 'azerbaijan': 'az',
    'moldova': 'md', 'uruguay': 'uy', 'paraguay': 'py', 'bolivia': 'bo',
    'ecuador': 'ec', 'venezuela': 've', 'puerto rico': 'pr', 'cuba': 'cu'
};

// Utility to sanitize folder/file names
function sanitizeName(name) {
    if (!name) return 'unknown';
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\-_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

// Download image from URL
function downloadImage(url, filepath) {
    return new Promise((resolve, reject) => {
        if (!url || url.trim() === '') {
            resolve(false);
            return;
        }

        // Ensure directory exists
        const dir = path.dirname(filepath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Skip if already exists
        if (fs.existsSync(filepath)) {
            resolve(true);
            return;
        }

        const protocol = url.startsWith('https') ? https : http;

        const file = fs.createWriteStream(filepath);

        const request = protocol.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.hltv.org/',
                'Origin': 'https://www.hltv.org'
            }
        }, (response) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                file.close();
                if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
                downloadImage(response.headers.location, filepath).then(resolve).catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                file.close();
                if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
                resolve(false);
                return;
            }

            response.pipe(file);

            file.on('finish', () => {
                file.close();
                resolve(true);
            });
        });

        request.on('error', (err) => {
            file.close();
            if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
            resolve(false);
        });

        request.on('timeout', () => {
            request.destroy();
            file.close();
            if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
            resolve(false);
        });
    });
}

// Get file extension from URL
function getExtension(url) {
    if (!url) return '.png';
    if (url.includes('.svg')) return '.svg';
    if (url.includes('.png')) return '.png';
    if (url.includes('.jpg') || url.includes('.jpeg')) return '.jpg';
    if (url.includes('.webp')) return '.webp';
    return '.png';
}

// Download country flag
async function downloadFlag(country) {
    if (!country) return false;
    const code = COUNTRY_CODES[country.toLowerCase()];
    if (!code) return false;

    const flagPath = path.join(FLAGS_DIR, `${code}.svg`);
    if (fs.existsSync(flagPath)) return true;

    // Use flagcdn.com for flags
    const url = `https://flagcdn.com/${code}.svg`;
    return await downloadImage(url, flagPath);
}

// Main import function
async function importAssets() {
    console.log('='.repeat(60));
    console.log('ASSET IMPORT PIPELINE - TOP 150 TEAMS');
    console.log('='.repeat(60));
    console.log(`\nReading Excel: ${EXCEL_PATH}`);

    // Read Excel
    const workbook = XLSX.readFile(EXCEL_PATH);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    // Sort by rank and limit to MAX_TEAMS
    const sortedData = data
        .filter(row => row['Team Rank'] && row['Team Name'])
        .sort((a, b) => (a['Team Rank'] || 999) - (b['Team Rank'] || 999))
        .slice(0, MAX_TEAMS);

    console.log(`Processing top ${sortedData.length} teams...\n`);

    // Create directories
    if (!fs.existsSync(OUTPUT_BASE)) {
        fs.mkdirSync(OUTPUT_BASE, { recursive: true });
    }
    if (!fs.existsSync(FLAGS_DIR)) {
        fs.mkdirSync(FLAGS_DIR, { recursive: true });
    }

    // Track stats
    let teamLogosDownloaded = 0;
    let playerImagesDownloaded = 0;
    let flagsDownloaded = 0;
    let failures = 0;
    const countriesProcessed = new Set();

    // Process each team
    for (let i = 0; i < sortedData.length; i++) {
        const row = sortedData[i];
        const teamName = row['Team Name'];
        const teamRank = row['Team Rank'];
        const teamLogo = row['Team Logo'];

        const teamSlug = sanitizeName(teamName);
        const teamDir = path.join(OUTPUT_BASE, teamSlug);
        const playersDir = path.join(teamDir, 'players');

        console.log(`[${i + 1}/${sortedData.length}] ${teamName} (#${teamRank})`);

        // Download team logo
        if (teamLogo) {
            const logoExt = getExtension(teamLogo);
            const logoPath = path.join(teamDir, `logo${logoExt}`);
            const success = await downloadImage(teamLogo, logoPath);
            if (success) teamLogosDownloaded++;
            else failures++;
        }

        // Download player images and flags
        for (let p = 1; p <= 5; p++) {
            const playerName = row[`Player ${p} Name`];
            const playerCountry = row[`Player ${p} Country`];
            const playerImage = row[`Player ${p} Image`];

            if (!playerName) continue;

            const playerSlug = sanitizeName(playerName);
            const imgExt = getExtension(playerImage);
            const playerPath = path.join(playersDir, `${playerSlug}${imgExt}`);

            if (playerImage) {
                const success = await downloadImage(playerImage, playerPath);
                if (success) playerImagesDownloaded++;
                else failures++;
            }

            // Download country flag (once per country)
            if (playerCountry && !countriesProcessed.has(playerCountry.toLowerCase())) {
                const flagSuccess = await downloadFlag(playerCountry);
                if (flagSuccess) flagsDownloaded++;
                countriesProcessed.add(playerCountry.toLowerCase());
            }

            // Save player metadata
            const metaPath = path.join(playersDir, `${playerSlug}.json`);
            if (!fs.existsSync(metaPath)) {
                fs.mkdirSync(playersDir, { recursive: true });
                fs.writeFileSync(metaPath, JSON.stringify({
                    name: playerName,
                    country: playerCountry,
                    countryCode: COUNTRY_CODES[playerCountry?.toLowerCase()] || null,
                    team: teamName,
                    teamRank: teamRank
                }, null, 2));
            }
        }

        // Save team metadata
        const teamMetaPath = path.join(teamDir, 'team.json');
        if (!fs.existsSync(teamMetaPath)) {
            fs.mkdirSync(teamDir, { recursive: true });
            const players = [];
            for (let p = 1; p <= 5; p++) {
                if (row[`Player ${p} Name`]) {
                    players.push({
                        name: row[`Player ${p} Name`],
                        country: row[`Player ${p} Country`],
                        countryCode: COUNTRY_CODES[row[`Player ${p} Country`]?.toLowerCase()] || null
                    });
                }
            }
            fs.writeFileSync(teamMetaPath, JSON.stringify({
                name: teamName,
                hltvRank: teamRank,
                players
            }, null, 2));
        }

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 50));
    }

    console.log('\n' + '='.repeat(60));
    console.log('IMPORT COMPLETE');
    console.log('='.repeat(60));
    console.log(`Team logos downloaded: ${teamLogosDownloaded}`);
    console.log(`Player images downloaded: ${playerImagesDownloaded}`);
    console.log(`Country flags downloaded: ${flagsDownloaded}`);
    console.log(`Failures: ${failures}`);
    console.log(`\nOutput directories:`);
    console.log(`  Teams: ${OUTPUT_BASE}`);
    console.log(`  Flags: ${FLAGS_DIR}`);
}

// Run
importAssets().catch(console.error);
