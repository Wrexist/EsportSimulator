/**
 * Asset Import Script v2
 * Uses node-fetch for better CDN compatibility
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

// Configuration
const EXCEL_PATH = path.join(process.cwd(), 'public', 'assets', 'Players_teams.xlsx');
const OUTPUT_BASE = path.join(process.cwd(), 'public', 'assets', 'teams');
const FLAGS_DIR = path.join(process.cwd(), 'public', 'assets', 'flags');
const MAX_TEAMS = 150;

// Country code mapping
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

function sanitizeName(name) {
    if (!name) return 'unknown';
    return name.toLowerCase().replace(/[^a-z0-9\-_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

async function downloadImage(url, filepath) {
    if (!url || url.trim() === '') return false;

    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(filepath)) return true;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.hltv.org/',
            },
            timeout: 20000
        });

        if (!response.ok) return false;

        const buffer = await response.buffer();
        fs.writeFileSync(filepath, buffer);
        return true;
    } catch (err) {
        return false;
    }
}

function getExtension(url) {
    if (!url) return '.png';
    if (url.includes('.svg')) return '.svg';
    if (url.includes('.png')) return '.png';
    if (url.includes('.jpg') || url.includes('.jpeg')) return '.jpg';
    if (url.includes('.webp')) return '.webp';
    return '.png';
}

async function downloadFlag(country) {
    if (!country) return false;
    const code = COUNTRY_CODES[country.toLowerCase()];
    if (!code) return false;

    const flagPath = path.join(FLAGS_DIR, `${code}.svg`);
    if (fs.existsSync(flagPath)) return true;

    return await downloadImage(`https://flagcdn.com/${code}.svg`, flagPath);
}

async function importAssets() {
    console.log('='.repeat(60));
    console.log('ASSET IMPORT v2 - TOP 150 TEAMS');
    console.log('='.repeat(60));

    const workbook = XLSX.readFile(EXCEL_PATH);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    const sortedData = data
        .filter(row => row['Team Rank'] && row['Team Name'])
        .sort((a, b) => (a['Team Rank'] || 999) - (b['Team Rank'] || 999))
        .slice(0, MAX_TEAMS);

    console.log(`\nProcessing ${sortedData.length} teams...\n`);

    if (!fs.existsSync(OUTPUT_BASE)) fs.mkdirSync(OUTPUT_BASE, { recursive: true });
    if (!fs.existsSync(FLAGS_DIR)) fs.mkdirSync(FLAGS_DIR, { recursive: true });

    let teamLogos = 0, playerImages = 0, flags = 0, failures = 0;
    const countriesProcessed = new Set();

    for (let i = 0; i < sortedData.length; i++) {
        const row = sortedData[i];
        const teamName = row['Team Name'];
        const teamRank = row['Team Rank'];
        const teamLogo = row['Team Logo'];
        const teamSlug = sanitizeName(teamName);
        const teamDir = path.join(OUTPUT_BASE, teamSlug);
        const playersDir = path.join(teamDir, 'players');

        process.stdout.write(`[${i + 1}/${sortedData.length}] ${teamName} (#${teamRank})... `);

        // Download team logo
        let logosOk = 0;
        if (teamLogo) {
            const logoPath = path.join(teamDir, `logo${getExtension(teamLogo)}`);
            if (await downloadImage(teamLogo, logoPath)) {
                teamLogos++;
                logosOk++;
            } else failures++;
        }

        // Download player images
        let playersOk = 0;
        for (let p = 1; p <= 5; p++) {
            const playerName = row[`Player ${p} Name`];
            const playerCountry = row[`Player ${p} Country`];
            const playerImage = row[`Player ${p} Image`];
            if (!playerName) continue;

            const playerSlug = sanitizeName(playerName);
            const playerPath = path.join(playersDir, `${playerSlug}${getExtension(playerImage)}`);

            if (playerImage) {
                if (await downloadImage(playerImage, playerPath)) {
                    playerImages++;
                    playersOk++;
                } else failures++;
            }

            // Download flag
            if (playerCountry && !countriesProcessed.has(playerCountry.toLowerCase())) {
                if (await downloadFlag(playerCountry)) flags++;
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
                    teamRank
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
            fs.writeFileSync(teamMetaPath, JSON.stringify({ name: teamName, hltvRank: teamRank, players }, null, 2));
        }

        console.log(`Logo: ${logosOk ? '✓' : '✗'} | Players: ${playersOk}/5`);

        // Delay between teams
        await new Promise(r => setTimeout(r, 200));
    }

    console.log('\n' + '='.repeat(60));
    console.log('COMPLETE');
    console.log('='.repeat(60));
    console.log(`Team logos: ${teamLogos}`);
    console.log(`Player images: ${playerImages}`);
    console.log(`Country flags: ${flags}`);
    console.log(`Failures: ${failures}`);
}

importAssets().catch(console.error);
