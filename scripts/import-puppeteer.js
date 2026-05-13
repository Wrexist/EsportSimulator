/**
 * Asset Import with Puppeteer
 * Uses real browser to download images (bypasses CDN restrictions)
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

// Configuration
const EXCEL_PATH = path.join(process.cwd(), 'public', 'assets', 'Players_teams.xlsx');
const OUTPUT_BASE = path.join(process.cwd(), 'public', 'assets', 'teams');
const MAX_TEAMS = 150;

// Country codes (already have flags downloaded)
const COUNTRY_CODES = {
    'france': 'fr', 'germany': 'de', 'united kingdom': 'gb', 'brazil': 'br',
    'russia': 'ru', 'ukraine': 'ua', 'sweden': 'se', 'denmark': 'dk',
    'poland': 'pl', 'united states': 'us', 'usa': 'us', 'canada': 'ca',
    'norway': 'no', 'finland': 'fi', 'netherlands': 'nl', 'belgium': 'be',
    'spain': 'es', 'portugal': 'pt', 'italy': 'it', 'australia': 'au',
    'israel': 'il', 'turkey': 'tr', 'argentina': 'ar', 'estonia': 'ee',
    'latvia': 'lv', 'lithuania': 'lt', 'czech republic': 'cz', 'czechia': 'cz',
    'slovakia': 'sk', 'hungary': 'hu', 'romania': 'ro', 'bulgaria': 'bg',
    'serbia': 'rs', 'croatia': 'hr', 'bosnia and herzegovina': 'ba',
    'north macedonia': 'mk', 'kazakhstan': 'kz', 'china': 'cn', 'mongolia': 'mn'
};

function sanitizeName(name) {
    if (!name) return 'unknown';
    return name.toLowerCase().replace(/[^a-z0-9\-_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function getExtension(url) {
    if (!url) return '.png';
    if (url.includes('.svg')) return '.svg';
    if (url.includes('.png')) return '.png';
    if (url.includes('.jpg') || url.includes('.jpeg')) return '.jpg';
    if (url.includes('.webp')) return '.webp';
    return '.png';
}

async function downloadWithBrowser(page, url, filepath) {
    if (!url || url.trim() === '') return false;
    if (fs.existsSync(filepath)) return true;

    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    try {
        // Navigate to the image URL
        const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });

        if (!response || !response.ok()) return false;

        // Get the image buffer
        const buffer = await response.buffer();
        fs.writeFileSync(filepath, buffer);
        return true;
    } catch (err) {
        return false;
    }
}

async function importAssets() {
    console.log('='.repeat(60));
    console.log('ASSET IMPORT WITH PUPPETEER');
    console.log('='.repeat(60));

    // Read Excel
    const workbook = XLSX.readFile(EXCEL_PATH);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    const sortedData = data
        .filter(row => row['Team Rank'] && row['Team Name'])
        .sort((a, b) => Number(a['Team Rank']) - Number(b['Team Rank']))
        .slice(0, MAX_TEAMS);

    console.log(`\nProcessing ${sortedData.length} teams...\n`);

    // Launch browser
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    let teamLogos = 0, playerImages = 0, failures = 0;

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
        let logoOk = false;
        if (teamLogo) {
            const logoPath = path.join(teamDir, `logo${getExtension(teamLogo)}`);
            logoOk = await downloadWithBrowser(page, teamLogo, logoPath);
            if (logoOk) teamLogos++;
            else failures++;
        }

        // Download player images
        let playersOk = 0;
        for (let p = 1; p <= 5; p++) {
            const playerName = row[`Player ${p} Name`];
            const playerImage = row[`Player ${p} Image`];
            if (!playerName) continue;

            const playerSlug = sanitizeName(playerName);
            const playerPath = path.join(playersDir, `${playerSlug}${getExtension(playerImage)}`);

            if (playerImage) {
                const ok = await downloadWithBrowser(page, playerImage, playerPath);
                if (ok) {
                    playerImages++;
                    playersOk++;
                } else failures++;
            }
        }

        console.log(`Logo: ${logoOk ? '✓' : '✗'} | Players: ${playersOk}/5`);
    }

    await browser.close();

    console.log('\n' + '='.repeat(60));
    console.log('COMPLETE');
    console.log('='.repeat(60));
    console.log(`Team logos: ${teamLogos}`);
    console.log(`Player images: ${playerImages}`);
    console.log(`Failures: ${failures}`);
}

importAssets().catch(console.error);
