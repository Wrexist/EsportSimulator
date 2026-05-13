/**
 * HLTV Excel Data Enrichment Script
 *
 * Reads Player_Team_list.xlsx, scrapes HLTV for each player & team,
 * downloads images, and writes an enriched xlsx with all stats.
 *
 * Usage:
 *   node scripts/enrich-player-data-from-excel.js
 *   node scripts/enrich-player-data-from-excel.js --start 42   (resume from team #42)
 *   node scripts/enrich-player-data-from-excel.js --no-images   (skip image downloads)
 *   node scripts/enrich-player-data-from-excel.js --images-only  (download images from enriched xlsx URLs, no scraping)
 *   node scripts/enrich-player-data-from-excel.js --teams-only   (re-scrape team pages only for nationality)
 *   node scripts/enrich-player-data-from-excel.js --fix-missing  (re-scrape HLTV for players/teams with missing images)
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const XLSX = require('xlsx');
const https = require('https');
const http = require('http');

// ============================================================
// CONFIGURATION
// ============================================================
const PROJECT_ROOT = path.join(__dirname, '..');
const INPUT_EXCEL = path.join(PROJECT_ROOT, '.claude', 'Playerdata', 'Player_Team_list.xlsx');
const OUTPUT_EXCEL = path.join(PROJECT_ROOT, '.claude', 'Playerdata', 'Player_Team_list_enriched.xlsx');
const CHECKPOINT_FILE = path.join(PROJECT_ROOT, '.claude', 'Playerdata', 'scrape_checkpoint.json');
const ERROR_LOG = path.join(PROJECT_ROOT, '.claude', 'Playerdata', 'scrape_errors.log');
const ASSETS_DIR = path.join(PROJECT_ROOT, 'public', 'assets', 'teams');

const DELAY_MIN_MS = 3000;
const DELAY_MAX_MS = 7000;
const CLOUDFLARE_WAIT_MS = 5000;
const MAX_RETRIES = 3;
const BROWSER_TIMEOUT_MS = 45000;

// Placeholder images for when HLTV returns invalid/generic images
const PLAYER_PLACEHOLDER = path.join(PROJECT_ROOT, 'public', 'player_placeholder.png');
const TEAM_PLACEHOLDER = path.join(PROJECT_ROOT, 'public', 'team_placeholder.png');

// Invalid image URL patterns - never download these
const INVALID_IMAGE_PATTERNS = [
    'blankplayer.svg',
    'player_silhouette',
    'placeholder',
    'missing',
    'generic',
    'unknown',
    'default_player',
];

// ============================================================
// COUNTRY CODE MAPPING
// ============================================================
const COUNTRY_CODES = {
    'denmark': 'dk', 'sweden': 'se', 'norway': 'no', 'finland': 'fi',
    'france': 'fr', 'germany': 'de', 'poland': 'pl', 'russia': 'ru',
    'ukraine': 'ua', 'brazil': 'br', 'united states': 'us', 'usa': 'us',
    'canada': 'ca', 'australia': 'au', 'united kingdom': 'gb', 'england': 'gb',
    'estonia': 'ee', 'latvia': 'lv', 'lithuania': 'lt', 'netherlands': 'nl',
    'belgium': 'be', 'spain': 'es', 'portugal': 'pt', 'italy': 'it',
    'czech republic': 'cz', 'czechia': 'cz', 'slovakia': 'sk', 'hungary': 'hu',
    'romania': 'ro', 'bulgaria': 'bg', 'serbia': 'rs', 'croatia': 'hr',
    'bosnia and herzegovina': 'ba', 'north macedonia': 'mk', 'slovenia': 'si',
    'turkey': 'tr', 'israel': 'il', 'kazakhstan': 'kz', 'mongolia': 'mn',
    'china': 'cn', 'japan': 'jp', 'south korea': 'kr', 'korea': 'kr',
    'argentina': 'ar', 'chile': 'cl', 'mexico': 'mx', 'peru': 'pe',
    'colombia': 'co', 'new zealand': 'nz', 'taiwan': 'tw', 'indonesia': 'id',
    'south africa': 'za', 'malaysia': 'my', 'singapore': 'sg', 'thailand': 'th',
    'morocco': 'ma', 'jordan': 'jo', 'lebanon': 'lb', 'pakistan': 'pk',
    'ireland': 'ie', 'switzerland': 'ch', 'austria': 'at', 'greece': 'gr',
    'georgia': 'ge', 'azerbaijan': 'az', 'armenia': 'am', 'uzbekistan': 'uz',
    'india': 'in', 'philippines': 'ph', 'vietnam': 'vn', 'saudi arabia': 'sa',
    'uruguay': 'uy', 'iceland': 'is', 'malta': 'mt', 'kosovo': 'xk',
    'cyprus': 'cy', 'albania': 'al', 'montenegro': 'me', 'luxembourg': 'lu',
    'hong kong': 'hk', 'europe': 'eu', 'cis': 'ru', 'north america': 'us',
    'oceania': 'au', 'asia': 'cn', 'south america': 'br', 'africa': 'za',
    'middle east': 'sa', 'myanmar': 'mm', 'cambodia': 'kh', 'nepal': 'np',
    'sri lanka': 'lk', 'bangladesh': 'bd', 'iran': 'ir', 'iraq': 'iq',
    'egypt': 'eg', 'tunisia': 'tn', 'algeria': 'dz', 'nigeria': 'ng',
    'bolivia': 'bo', 'venezuela': 've', 'ecuador': 'ec', 'paraguay': 'py',
    'costa rica': 'cr', 'panama': 'pa', 'dominican republic': 'do',
    'belarus': 'by', 'moldova': 'md', 'liechtenstein': 'li',
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function getCountryCode(country) {
    if (!country) return '';
    return COUNTRY_CODES[country.toLowerCase()] || country.toLowerCase().substring(0, 2);
}

function sanitizeName(name) {
    return name.toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_-]/g, '')
        .replace(/_+/g, '_');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay() {
    const delay = Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS)) + DELAY_MIN_MS;
    return sleep(delay);
}

function logError(type, url, error) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${type} | ${url} | ${error}\n`;
    fs.appendFileSync(ERROR_LOG, line);
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function isValidImageUrl(url) {
    if (!url || !url.startsWith('http')) return false;
    const lower = url.toLowerCase();
    // Must be from HLTV CDN
    if (!lower.includes('img-cdn.hltv.org')) return false;
    // Reject known placeholder/invalid patterns
    for (const pattern of INVALID_IMAGE_PATTERNS) {
        if (lower.includes(pattern)) return false;
    }
    return true;
}

function copyPlaceholder(placeholderPath, destPath) {
    if (fs.existsSync(placeholderPath)) {
        fs.copyFileSync(placeholderPath, destPath);
        return true;
    }
    return false;
}

async function downloadImage(url, filepath) {
    return new Promise((resolve, reject) => {
        if (!url || !url.startsWith('http')) {
            reject(new Error('Invalid URL'));
            return;
        }
        const parsedUrl = new URL(url);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.hltv.org/',
                'Origin': 'https://www.hltv.org',
            }
        };
        const request = protocol.get(options, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                downloadImage(response.headers.location, filepath)
                    .then(resolve).catch(reject);
                return;
            }
            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }
            const fileStream = fs.createWriteStream(filepath);
            response.pipe(fileStream);
            fileStream.on('finish', () => { fileStream.close(); resolve(filepath); });
            fileStream.on('error', reject);
        });
        request.on('error', reject);
        request.on('timeout', () => { request.destroy(); reject(new Error('Timeout')); });
    });
}

// ============================================================
// CHECKPOINT / RESUME
// ============================================================
function loadCheckpoint() {
    if (fs.existsSync(CHECKPOINT_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
        } catch (e) {
            return null;
        }
    }
    return null;
}

function saveCheckpoint(state) {
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(state, null, 2));
}

// ============================================================
// BROWSER SETUP (restart per request for maximum stealth)
// ============================================================
async function createStealthPage() {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1920,1080'
        ]
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/'
    });

    return { browser, page };
}

async function navigateWithRetry(page, url, retries = MAX_RETRIES) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: BROWSER_TIMEOUT_MS });
            // Check for Cloudflare
            const title = await page.title();
            if (title.includes('Just a moment') || title.includes('Access denied')) {
                console.log('  [Cloudflare detected, waiting...]');
                await sleep(CLOUDFLARE_WAIT_MS);
                try {
                    // Wait for real content to appear
                    await page.waitForSelector('h1', { timeout: 15000 });
                } catch (_) {}
                const newTitle = await page.title();
                if (newTitle.includes('Just a moment') || newTitle.includes('Access denied')) {
                    if (attempt < retries - 1) continue;
                    return false;
                }
            }
            return true;
        } catch (e) {
            if (attempt < retries - 1) {
                await sleep(2000 * (attempt + 1));
                continue;
            }
            return false;
        }
    }
    return false;
}

// ============================================================
// PLAYER SCRAPING
// ============================================================
async function scrapePlayerPage(playerUrl) {
    let browser = null;
    try {
        const ctx = await createStealthPage();
        browser = ctx.browser;
        const page = ctx.page;

        const ok = await navigateWithRetry(page, playerUrl);
        if (!ok) {
            logError('PLAYER_NAV_FAIL', playerUrl, 'Could not load page');
            return null;
        }

        const data = await page.evaluate(() => {
            const res = {
                nickname: '', age: null, country: '', countryCode: '',
                rating3: null, firepower: null, entrying: null, trading: null,
                opening: null, clutching: null, sniping: null, utility: null,
                portraitUrl: '', countryFlagUrl: '', team: ''
            };

            // Nickname
            const nameEl = document.querySelector('h1.playerNickname');
            if (nameEl) res.nickname = nameEl.innerText.trim();

            // Age
            const ageEl = document.querySelector('.playerAge .listRight');
            if (ageEl) {
                const m = ageEl.innerText.match(/(\d+)/);
                if (m) res.age = parseInt(m[1]);
            }
            if (!res.age) {
                const text = document.body.innerText;
                const m = text.match(/(\d+)\s*years/);
                if (m) res.age = parseInt(m[1]);
            }

            // Country
            const flagEl = document.querySelector('.playerRealname .flag') ||
                document.querySelector('.player-real-name .flag') ||
                document.querySelector('.playerInfo .flag');
            if (flagEl) {
                res.country = flagEl.getAttribute('title') || '';
                res.countryFlagUrl = flagEl.getAttribute('src') || '';
            }

            // Portrait
            const portraitEl = document.querySelector('.bodyshot-img') ||
                document.querySelector('.playerPicture img');
            if (portraitEl) {
                res.portraitUrl = portraitEl.getAttribute('src') || '';
            }

            // Current team
            const teamEl = document.querySelector('.playerTeam a') ||
                document.querySelector('.team-name a');
            if (teamEl) res.team = teamEl.innerText.trim();

            // Rating 3.0 + stats
            const statEls = document.querySelectorAll('.playerpage-container-attributes .player-stat');
            statEls.forEach(stat => {
                const label = stat.querySelector('b')?.innerText?.trim();
                const valEl = stat.querySelector('.statsVal p') || stat.querySelector('.statsVal');
                let val = valEl?.innerText?.trim() || '';
                // Remove "/100" suffix
                val = val.replace(/\/100$/, '').trim();
                // Extract just the number (first bold text or the paragraph content)
                const boldVal = stat.querySelector('.statsVal p b');
                if (boldVal) val = boldVal.innerText.trim();

                if (label === 'Rating 3.0') res.rating3 = parseFloat(val) || null;
                else if (label === 'Firepower') res.firepower = parseInt(val) || null;
                else if (label === 'Entrying') res.entrying = parseInt(val) || null;
                else if (label === 'Trading') res.trading = parseInt(val) || null;
                else if (label === 'Opening') res.opening = parseInt(val) || null;
                else if (label === 'Clutching') res.clutching = parseInt(val) || null;
                else if (label === 'Sniping') res.sniping = parseInt(val) || null;
                else if (label === 'Utility') res.utility = parseInt(val) || null;
            });

            return res;
        });

        return data;
    } catch (e) {
        logError('PLAYER_ERROR', playerUrl, e.message);
        return null;
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}

// ============================================================
// TEAM SCRAPING
// ============================================================
async function scrapeTeamPage(teamUrl) {
    // Some team URLs are ranking detail pages, not team profile pages
    // e.g., https://www.hltv.org/ranking/teams/2026/february/9/details/13117
    // For those, we need to extract the team profile URL first
    let actualTeamUrl = teamUrl;
    if (teamUrl.includes('/ranking/teams/') && teamUrl.includes('/details/')) {
        // This is a ranking details page - we'll scrape what we can from it
        // The team logo/nationality is still available
    }

    let browser = null;
    try {
        const ctx = await createStealthPage();
        browser = ctx.browser;
        const page = ctx.page;

        const ok = await navigateWithRetry(page, actualTeamUrl);
        if (!ok) {
            logError('TEAM_NAV_FAIL', teamUrl, 'Could not load page');
            return null;
        }

        const data = await page.evaluate(() => {
            const res = { logoUrl: '', nationality: '', nationalityFlagUrl: '' };

            // Team logo - try multiple selectors
            const logoEl = document.querySelector('.teamlogo') ||
                document.querySelector('.team-logo-container img') ||
                document.querySelector('.profile-team-logo-container img') ||
                document.querySelector('.ranking-team-logo img');
            if (logoEl) {
                res.logoUrl = logoEl.getAttribute('src') || '';
            }

            // Nationality
            const countryEl = document.querySelector('.team-country .flag') ||
                document.querySelector('.profile-team-info .flag');
            if (countryEl) {
                res.nationality = countryEl.getAttribute('title') || '';
                res.nationalityFlagUrl = countryEl.getAttribute('src') || '';
            }

            return res;
        });

        return data;
    } catch (e) {
        logError('TEAM_ERROR', teamUrl, e.message);
        return null;
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}

// ============================================================
// EXCEL I/O
// ============================================================
function loadExcel() {
    if (!fs.existsSync(INPUT_EXCEL)) {
        console.error(`Input file not found: ${INPUT_EXCEL}`);
        process.exit(1);
    }
    const workbook = XLSX.readFile(INPUT_EXCEL);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

function saveExcel(data) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);

    // Auto-size columns (basic)
    const colWidths = {};
    data.forEach(row => {
        Object.keys(row).forEach(key => {
            const len = String(row[key] || '').length;
            colWidths[key] = Math.max(colWidths[key] || key.length, Math.min(len, 50));
        });
    });
    ws['!cols'] = Object.keys(colWidths).map(k => ({ wch: colWidths[k] + 2 }));

    XLSX.utils.book_append_sheet(wb, ws, 'Teams');
    XLSX.writeFile(wb, OUTPUT_EXCEL);
    console.log(`\nSaved enriched data to: ${OUTPUT_EXCEL}`);
}

// ============================================================
// COLUMN HELPERS
// ============================================================
// The xlsx has columns like "Player 1 Name", "Player 1 Link player profile /player"
// We read the header to find exact names
function getPlayerColumns(headers) {
    const cols = [];
    for (let i = 1; i <= 5; i++) {
        const nameCol = headers.find(h => h.match(new RegExp(`Player\\s*${i}\\s*Name`, 'i')));
        const flagCol = headers.find(h => h.match(new RegExp(`Player\\s*${i}\\s*Country\\s*Flag`, 'i')));
        const picCol = headers.find(h => h.match(new RegExp(`Player\\s*${i}\\s*playerPicture`, 'i')));
        const linkCol = headers.find(h => h.match(new RegExp(`Player\\s*${i}\\s*Link`, 'i')));
        cols.push({ idx: i, nameCol, flagCol, picCol, linkCol });
    }
    return cols;
}

// ============================================================
// PUPPETEER IMAGE DOWNLOAD (CDN requires Cloudflare session)
// ============================================================
async function downloadImageViaPuppeteer(page, url, filepath) {
    const result = await page.evaluate(async (imgUrl) => {
        try {
            const resp = await fetch(imgUrl);
            if (!resp.ok) return { error: resp.status };
            const blob = await resp.blob();
            const buf = await blob.arrayBuffer();
            return { data: Array.from(new Uint8Array(buf)) };
        } catch (e) {
            return { error: e.message };
        }
    }, url);

    if (result.error) {
        throw new Error(`Fetch failed: ${result.error}`);
    }

    const buf = Buffer.from(result.data);
    if (buf.length < 100) {
        throw new Error(`Suspiciously small image: ${buf.length} bytes`);
    }
    fs.writeFileSync(filepath, buf);
    return filepath;
}

// ============================================================
// IMAGES-ONLY MODE: Download all missing images from enriched xlsx
// ============================================================
async function runImagesOnly() {
    console.log('='.repeat(60));
    console.log('  IMAGES-ONLY MODE');
    console.log('  Downloads missing images using URLs from enriched xlsx');
    console.log('  Uses Puppeteer to bypass CDN Cloudflare protection');
    console.log('='.repeat(60));
    console.log();

    // Load the enriched xlsx (which has URLs already populated)
    const inputFile = fs.existsSync(OUTPUT_EXCEL) ? OUTPUT_EXCEL : INPUT_EXCEL;
    console.log(`Loading: ${inputFile}`);
    const workbook = XLSX.readFile(inputFile);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    console.log(`Loaded ${data.length} team rows.\n`);

    const headers = Object.keys(data[0]);
    const playerCols = getPlayerColumns(headers);

    // Launch Puppeteer and establish Cloudflare session
    console.log('Launching browser and establishing HLTV session...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        await page.goto('https://www.hltv.org', { waitUntil: 'networkidle2', timeout: 30000 });
        const title = await page.title();
        if (title.includes('Just a moment')) {
            console.log('Cloudflare challenge detected, waiting...');
            await sleep(CLOUDFLARE_WAIT_MS);
        }
        console.log(`Session established (title: "${title.substring(0, 50)}")\n`);
    } catch (e) {
        console.error('Failed to establish HLTV session:', e.message);
        await browser.close();
        return;
    }

    let downloaded = 0, failed = 0, skipped = 0, placeholders = 0;
    let sessionRefreshCounter = 0;
    const SESSION_REFRESH_INTERVAL = 100; // Re-visit HLTV every 100 downloads

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const teamName = row['Team Name'] || `Team #${i}`;
        const teamSlug = sanitizeName(teamName);
        const teamDir = path.join(ASSETS_DIR, teamSlug);
        const playersDir = path.join(teamDir, 'players');

        console.log(`[${i + 1}/${data.length}] ${teamName}`);

        // --- Team Logo ---
        // Team Logo column may have comma-separated URLs, take the first valid one
        let logoUrl = row['Team Logo'] || '';
        if (logoUrl.includes(',')) {
            const parts = logoUrl.split(',');
            logoUrl = parts.find(u => u.trim().includes('img-cdn.hltv.org')) || parts[0];
            logoUrl = logoUrl.trim();
        }
        const logoPath = path.join(teamDir, 'logo.png');
        if (!fs.existsSync(logoPath)) {
            ensureDir(teamDir);
            if (isValidImageUrl(logoUrl)) {
                try {
                    await downloadImageViaPuppeteer(page, logoUrl, logoPath);
                    downloaded++;
                    sessionRefreshCounter++;
                    console.log('  Logo: OK');
                } catch (e) {
                    logError('LOGO_DL_FAIL', logoUrl, e.message);
                    failed++;
                    console.log(`  Logo: FAIL (${e.message})`);
                }
            } else {
                // No valid URL - skip, will be handled by --fix-missing
                placeholders++;
            }
        } else {
            skipped++;
        }

        // --- Player Portraits ---
        for (const pc of playerCols) {
            const playerName = row[pc.nameCol] || '';
            if (!playerName) continue;

            const playerSlug = sanitizeName(playerName);
            ensureDir(playersDir);
            const imgPath = path.join(playersDir, `${playerSlug}.png`);

            if (fs.existsSync(imgPath)) {
                skipped++;
                continue;
            }

            const portraitUrl = row[pc.picCol] || '';
            if (isValidImageUrl(portraitUrl)) {
                try {
                    await downloadImageViaPuppeteer(page, portraitUrl, imgPath);
                    downloaded++;
                    sessionRefreshCounter++;
                    console.log(`  [P${pc.idx}] ${playerName}: OK (${fs.statSync(imgPath).size} bytes)`);
                } catch (e) {
                    logError('PORTRAIT_DL_FAIL', portraitUrl, e.message);
                    failed++;
                    console.log(`  [P${pc.idx}] ${playerName}: FAIL (${e.message})`);
                }
            } else {
                // No valid URL - skip, will be handled by --fix-missing
                placeholders++;
            }

            // Small delay to avoid rate limiting
            await sleep(300);
        }

        // Periodically refresh session to prevent expiry
        if (sessionRefreshCounter >= SESSION_REFRESH_INTERVAL) {
            console.log('  [Refreshing HLTV session...]');
            try {
                await page.goto('https://www.hltv.org', { waitUntil: 'networkidle2', timeout: 30000 });
                sessionRefreshCounter = 0;
            } catch (e) {
                console.log(`  Session refresh failed: ${e.message}`);
            }
        }
    }

    await browser.close();

    console.log('\n' + '='.repeat(60));
    console.log('  IMAGE DOWNLOAD COMPLETE');
    console.log('='.repeat(60));
    console.log(`  Downloaded:      ${downloaded}`);
    console.log(`  Failed:          ${failed}`);
    console.log(`  Skipped (exist): ${skipped}`);
    console.log(`  Placeholders:    ${placeholders}`);
    console.log('='.repeat(60));
}

// ============================================================
// FIX-MISSING MODE: Re-scrape HLTV pages for players/teams
// with missing images (no URL in xlsx or download failed)
// ============================================================
async function runFixMissing() {
    console.log('='.repeat(60));
    console.log('  FIX-MISSING MODE');
    console.log('  Scrapes HLTV for players/teams with missing images');
    console.log('='.repeat(60));
    console.log();

    const inputFile = fs.existsSync(OUTPUT_EXCEL) ? OUTPUT_EXCEL : INPUT_EXCEL;
    console.log(`Loading: ${inputFile}`);
    const workbook = XLSX.readFile(inputFile);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    console.log(`Loaded ${data.length} team rows.\n`);

    const headers = Object.keys(data[0]);
    const playerCols = getPlayerColumns(headers);

    // Build list of missing images
    const missingPlayers = []; // { row, pc, playerUrl, teamName, playerName, imgPath }
    const missingLogos = [];   // { row, teamName, teamDir }

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const teamName = row['Team Name'] || `Team #${i}`;
        const teamSlug = sanitizeName(teamName);
        const teamDir = path.join(ASSETS_DIR, teamSlug);
        const logoPath = path.join(teamDir, 'logo.png');

        if (!fs.existsSync(logoPath)) {
            missingLogos.push({ row, teamName, teamSlug, teamDir, logoPath, idx: i });
        }

        for (const pc of playerCols) {
            const playerName = row[pc.nameCol] || '';
            if (!playerName) continue;
            const playerSlug = sanitizeName(playerName);
            const playersDir = path.join(teamDir, 'players');
            const imgPath = path.join(playersDir, `${playerSlug}.png`);

            if (!fs.existsSync(imgPath)) {
                const playerUrl = row[pc.linkCol] || '';
                missingPlayers.push({ row, pc, playerUrl, teamName, playerName, playerSlug, imgPath, playersDir });
            }
        }
    }

    console.log(`Missing: ${missingPlayers.length} player portraits, ${missingLogos.length} team logos\n`);

    if (missingPlayers.length === 0 && missingLogos.length === 0) {
        console.log('Nothing to fix!');
        return;
    }

    // Launch browser
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        await page.goto('https://www.hltv.org', { waitUntil: 'networkidle2', timeout: 30000 });
        const title = await page.title();
        console.log(`Session established (title: "${title.substring(0, 50)}")\n`);
    } catch (e) {
        console.error('Failed to establish HLTV session:', e.message);
        await browser.close();
        return;
    }

    let downloaded = 0, failed = 0;
    let refreshCounter = 0;

    // Fix player portraits by visiting their HLTV page
    console.log('--- Fixing player portraits ---');
    for (let i = 0; i < missingPlayers.length; i++) {
        const mp = missingPlayers[i];
        process.stdout.write(`[${i + 1}/${missingPlayers.length}] ${mp.teamName}/${mp.playerName} ... `);

        if (!mp.playerUrl) {
            console.log('no HLTV URL, skipping');
            continue;
        }

        try {
            // Navigate to player page
            const ok = await page.goto(mp.playerUrl, { waitUntil: 'networkidle2', timeout: 30000 }).then(() => true).catch(() => false);
            if (!ok) {
                console.log('page load failed');
                failed++;
                await sleep(2000);
                continue;
            }

            // Check for Cloudflare
            const title = await page.title();
            if (title.includes('Just a moment') || title.includes('Access denied')) {
                await sleep(CLOUDFLARE_WAIT_MS);
            }

            // Extract portrait URL from the page
            const portraitUrl = await page.evaluate(() => {
                const el = document.querySelector('.bodyshot-img') ||
                    document.querySelector('.playerPicture img');
                return el ? (el.getAttribute('src') || '') : '';
            });

            if (portraitUrl && isValidImageUrl(portraitUrl)) {
                ensureDir(mp.playersDir);
                try {
                    await downloadImageViaPuppeteer(page, portraitUrl, mp.imgPath);
                    downloaded++;
                    refreshCounter++;
                    console.log(`OK (${fs.statSync(mp.imgPath).size} bytes)`);

                    // Also update xlsx row with the portrait URL
                    if (mp.pc.picCol) {
                        mp.row[mp.pc.picCol] = portraitUrl;
                    }
                } catch (e) {
                    console.log(`download fail: ${e.message}`);
                    failed++;
                }
            } else {
                // Use placeholder as last resort
                ensureDir(mp.playersDir);
                copyPlaceholder(PLAYER_PLACEHOLDER, mp.imgPath);
                console.log('no portrait on HLTV, using placeholder');
            }
        } catch (e) {
            console.log(`error: ${e.message}`);
            failed++;
        }

        await sleep(1500);

        // Refresh session periodically
        if (refreshCounter >= 50) {
            try {
                await page.goto('https://www.hltv.org', { waitUntil: 'networkidle2', timeout: 30000 });
                refreshCounter = 0;
            } catch (_) {}
        }
    }

    // Fix team logos - try to get from a player page's team section
    console.log('\n--- Fixing team logos ---');
    for (let i = 0; i < missingLogos.length; i++) {
        const ml = missingLogos[i];
        process.stdout.write(`[${i + 1}/${missingLogos.length}] ${ml.teamName} ... `);

        // Find any player URL from this team to extract logo from their page
        let anyPlayerUrl = '';
        for (const pc of playerCols) {
            const url = ml.row[pc.linkCol] || '';
            if (url && url.includes('hltv.org')) { anyPlayerUrl = url; break; }
        }

        if (!anyPlayerUrl) {
            ensureDir(ml.teamDir);
            copyPlaceholder(TEAM_PLACEHOLDER, ml.logoPath);
            console.log('no player URL available, using placeholder');
            continue;
        }

        try {
            await page.goto(anyPlayerUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            const title = await page.title();
            if (title.includes('Just a moment')) await sleep(CLOUDFLARE_WAIT_MS);

            // Extract team logo from player page sidebar
            const logoUrl = await page.evaluate(() => {
                const el = document.querySelector('.playerTeam img') ||
                    document.querySelector('.team-logo img') ||
                    document.querySelector('.playerInfoTeamLogo') ||
                    document.querySelector('img[src*="teamlogo"]');
                return el ? (el.getAttribute('src') || '') : '';
            });

            if (logoUrl && isValidImageUrl(logoUrl)) {
                ensureDir(ml.teamDir);
                await downloadImageViaPuppeteer(page, logoUrl, ml.logoPath);
                downloaded++;
                console.log(`OK (${fs.statSync(ml.logoPath).size} bytes)`);
            } else {
                ensureDir(ml.teamDir);
                copyPlaceholder(TEAM_PLACEHOLDER, ml.logoPath);
                console.log('no logo found, using placeholder');
            }
        } catch (e) {
            ensureDir(ml.teamDir);
            copyPlaceholder(TEAM_PLACEHOLDER, ml.logoPath);
            console.log(`error: ${e.message}, using placeholder`);
            failed++;
        }

        await sleep(1500);
    }

    await browser.close();

    // Save updated xlsx with any new portrait URLs
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Teams');
    XLSX.writeFile(wb, OUTPUT_EXCEL);

    console.log('\n' + '='.repeat(60));
    console.log('  FIX-MISSING COMPLETE');
    console.log('='.repeat(60));
    console.log(`  Downloaded:  ${downloaded}`);
    console.log(`  Failed:      ${failed}`);
    console.log('='.repeat(60));
}

// ============================================================
// TEAMS-ONLY MODE: Re-scrape team pages for nationality
// ============================================================
async function runTeamsOnly() {
    console.log('='.repeat(60));
    console.log('  TEAMS-ONLY MODE');
    console.log('  Re-scrapes team pages for nationality data');
    console.log('='.repeat(60));
    console.log();

    // Load the enriched xlsx
    const inputFile = fs.existsSync(OUTPUT_EXCEL) ? OUTPUT_EXCEL : INPUT_EXCEL;
    console.log(`Loading: ${inputFile}`);
    const workbook = XLSX.readFile(inputFile);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    console.log(`Loaded ${data.length} team rows.\n`);

    // Add nationality column if missing
    for (const row of data) {
        if (row['Team Nationality'] === undefined) row['Team Nationality'] = '';
    }

    let processed = 0, failed = 0, skipped = 0;

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const teamName = row['Team Name'] || `Team #${i}`;
        const teamUrl = row['Team Profile URL'] || '';

        // Skip if nationality already filled
        if (row['Team Nationality'] && row['Team Nationality'] !== '') {
            skipped++;
            continue;
        }

        if (!teamUrl) {
            console.log(`[${i + 1}/${data.length}] ${teamName} - no URL, skipping`);
            continue;
        }

        process.stdout.write(`[${i + 1}/${data.length}] ${teamName} ... `);

        const teamData = await scrapeTeamPage(teamUrl);
        if (teamData) {
            row['Team Nationality'] = teamData.nationality || '';
            if (!row['Team Logo'] && teamData.logoUrl) {
                row['Team Logo'] = teamData.logoUrl;
            }
            console.log(`OK (${teamData.nationality || 'no nationality'})`);
            processed++;
        } else {
            console.log('FAILED');
            failed++;
        }

        await randomDelay();

        // Save every 10 teams
        if ((processed + failed) % 10 === 0 && processed + failed > 0) {
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, 'Teams');
            XLSX.writeFile(wb, OUTPUT_EXCEL);
            console.log(`  [Saved intermediate at ${processed + failed} teams]`);
        }
    }

    // Final save
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Teams');
    XLSX.writeFile(wb, OUTPUT_EXCEL);

    console.log('\n' + '='.repeat(60));
    console.log('  TEAM SCRAPING COMPLETE');
    console.log('='.repeat(60));
    console.log(`  Processed:     ${processed}`);
    console.log(`  Failed:        ${failed}`);
    console.log(`  Skipped (have data): ${skipped}`);
    console.log(`\n  Output: ${OUTPUT_EXCEL}`);
    console.log('='.repeat(60));
}

// ============================================================
// MAIN PROCESSING
// ============================================================
async function main() {
    console.log('='.repeat(60));
    console.log('  HLTV Excel Data Enrichment Script');
    console.log('='.repeat(60));
    console.log();

    // Parse CLI args
    const args = process.argv.slice(2);
    let startIndex = 0;
    let skipImages = false;
    let imagesOnly = false;
    let teamsOnly = false;
    let fixMissing = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--start' && args[i + 1]) {
            startIndex = parseInt(args[i + 1]);
            i++;
        }
        if (args[i] === '--no-images') skipImages = true;
        if (args[i] === '--images-only') imagesOnly = true;
        if (args[i] === '--teams-only') teamsOnly = true;
        if (args[i] === '--fix-missing') fixMissing = true;
    }

    // Dispatch to special modes
    if (imagesOnly) {
        return runImagesOnly();
    }
    if (teamsOnly) {
        return runTeamsOnly();
    }
    if (fixMissing) {
        return runFixMissing();
    }

    // Load existing checkpoint if no --start given and not in special mode
    if (startIndex === 0 && !imagesOnly && !teamsOnly) {
        const checkpoint = loadCheckpoint();
        if (checkpoint && checkpoint.lastTeamIndex > 0) {
            console.log(`Found checkpoint: last processed team #${checkpoint.lastTeamIndex} (${checkpoint.processedPlayers} players)`);
            console.log('Use --start 0 to restart from scratch.\n');
            startIndex = checkpoint.lastTeamIndex + 1;
        }
    }

    // Clear error log on fresh start
    if (startIndex === 0 && !imagesOnly && !teamsOnly && fs.existsSync(ERROR_LOG)) {
        fs.unlinkSync(ERROR_LOG);
    }

    // Load Excel
    console.log(`Loading: ${INPUT_EXCEL}`);
    const data = loadExcel();
    console.log(`Loaded ${data.length} team rows.\n`);

    if (data.length === 0) {
        console.log('No data found in Excel file.');
        return;
    }

    // Detect column names from first row
    const headers = Object.keys(data[0]);
    const playerCols = getPlayerColumns(headers);
    console.log(`Detected player columns:`);
    playerCols.forEach(c => {
        console.log(`  Player ${c.idx}: name="${c.nameCol}" link="${c.linkCol}"`);
    });
    console.log();

    // Add new columns to all rows (if not already present)
    for (const row of data) {
        for (let p = 1; p <= 5; p++) {
            if (row[`Player ${p} Age`] === undefined) row[`Player ${p} Age`] = '';
            if (row[`Player ${p} Country`] === undefined) row[`Player ${p} Country`] = '';
            if (row[`Player ${p} Country Code`] === undefined) row[`Player ${p} Country Code`] = '';
            if (row[`Player ${p} Rating 3.0`] === undefined) row[`Player ${p} Rating 3.0`] = '';
            if (row[`Player ${p} Firepower`] === undefined) row[`Player ${p} Firepower`] = '';
            if (row[`Player ${p} Entrying`] === undefined) row[`Player ${p} Entrying`] = '';
            if (row[`Player ${p} Trading`] === undefined) row[`Player ${p} Trading`] = '';
            if (row[`Player ${p} Opening`] === undefined) row[`Player ${p} Opening`] = '';
            if (row[`Player ${p} Clutching`] === undefined) row[`Player ${p} Clutching`] = '';
            if (row[`Player ${p} Sniping`] === undefined) row[`Player ${p} Sniping`] = '';
            if (row[`Player ${p} Utility`] === undefined) row[`Player ${p} Utility`] = '';
        }
        if (row['Team Nationality'] === undefined) row['Team Nationality'] = '';
    }

    // Stats counters
    const stats = {
        teamsProcessed: 0, teamsFailed: 0,
        playersProcessed: 0, playersFailed: 0, playersSkipped: 0,
        imagesDownloaded: 0, imagesFailed: 0,
    };

    // Process teams
    const totalTeams = data.length;
    console.log(`Starting from team #${startIndex} (of ${totalTeams})`);
    console.log(`Images: ${skipImages ? 'SKIPPED' : 'ENABLED'}`);
    console.log('-'.repeat(60));

    for (let i = startIndex; i < totalTeams; i++) {
        const row = data[i];
        const teamName = row['Team Name'] || `Team #${i}`;
        const teamUrl = row['Team Profile URL'] || '';
        const teamRank = row['Team Rank'] || i + 1;

        console.log(`\n[${i + 1}/${totalTeams}] Team: ${teamName} (Rank #${teamRank})`);

        // Scrape team page for logo/nationality
        if (teamUrl) {
            const teamData = await scrapeTeamPage(teamUrl);
            if (teamData) {
                row['Team Nationality'] = teamData.nationality || '';
                // Fill in team logo if empty
                if (!row['Team Logo'] && teamData.logoUrl) {
                    row['Team Logo'] = teamData.logoUrl;
                }
                stats.teamsProcessed++;

                // Download team logo
                if (!skipImages) {
                    const teamSlug = sanitizeName(teamName);
                    const teamDir = path.join(ASSETS_DIR, teamSlug);
                    ensureDir(teamDir);
                    const logoPath = path.join(teamDir, 'logo.png');
                    if (!fs.existsSync(logoPath)) {
                        if (isValidImageUrl(teamData.logoUrl)) {
                            try {
                                await downloadImage(teamData.logoUrl, logoPath);
                                stats.imagesDownloaded++;
                            } catch (e) {
                                logError('LOGO_DL_FAIL', teamData.logoUrl, e.message);
                                copyPlaceholder(TEAM_PLACEHOLDER, logoPath);
                                stats.imagesFailed++;
                            }
                        } else {
                            // Invalid or missing URL - use placeholder
                            copyPlaceholder(TEAM_PLACEHOLDER, logoPath);
                        }
                    }
                }
            } else {
                stats.teamsFailed++;
            }
            await randomDelay();
        }

        // Scrape each player
        for (const pc of playerCols) {
            const playerName = row[pc.nameCol] || '';
            const playerUrl = row[pc.linkCol] || '';

            if (!playerName || !playerUrl) {
                continue; // Empty player slot
            }

            // Check if already enriched (has Rating 3.0)
            if (row[`Player ${pc.idx} Rating 3.0`] && row[`Player ${pc.idx} Rating 3.0`] !== '') {
                console.log(`  [P${pc.idx}] ${playerName} - already enriched, skipping`);
                stats.playersSkipped++;
                continue;
            }

            process.stdout.write(`  [P${pc.idx}] ${playerName} ... `);

            const playerData = await scrapePlayerPage(playerUrl);

            if (playerData && playerData.nickname) {
                // Fill in data
                row[`Player ${pc.idx} Age`] = playerData.age || '';
                row[`Player ${pc.idx} Country`] = playerData.country || '';
                row[`Player ${pc.idx} Country Code`] = playerData.country ? getCountryCode(playerData.country) : '';
                row[`Player ${pc.idx} Rating 3.0`] = playerData.rating3 || '';
                row[`Player ${pc.idx} Firepower`] = playerData.firepower || '';
                row[`Player ${pc.idx} Entrying`] = playerData.entrying || '';
                row[`Player ${pc.idx} Trading`] = playerData.trading || '';
                row[`Player ${pc.idx} Opening`] = playerData.opening || '';
                row[`Player ${pc.idx} Clutching`] = playerData.clutching || '';
                row[`Player ${pc.idx} Sniping`] = playerData.sniping || '';
                row[`Player ${pc.idx} Utility`] = playerData.utility || '';

                // Fill in flag/picture URLs
                if (pc.flagCol && playerData.countryFlagUrl) {
                    row[pc.flagCol] = playerData.countryFlagUrl;
                }
                if (pc.picCol && playerData.portraitUrl) {
                    row[pc.picCol] = playerData.portraitUrl;
                }

                console.log(`OK (R:${playerData.rating3 || '?'} FP:${playerData.firepower || '?'})`);
                stats.playersProcessed++;

                // Download player portrait
                if (!skipImages) {
                    const teamSlug = sanitizeName(teamName);
                    const playersDir = path.join(ASSETS_DIR, teamSlug, 'players');
                    ensureDir(playersDir);
                    const playerSlug = sanitizeName(playerName);
                    const imgPath = path.join(playersDir, `${playerSlug}.png`);
                    if (!fs.existsSync(imgPath)) {
                        if (isValidImageUrl(playerData.portraitUrl)) {
                            try {
                                await downloadImage(playerData.portraitUrl, imgPath);
                                stats.imagesDownloaded++;
                            } catch (e) {
                                logError('PORTRAIT_DL_FAIL', playerData.portraitUrl, e.message);
                                copyPlaceholder(PLAYER_PLACEHOLDER, imgPath);
                                stats.imagesFailed++;
                            }
                        } else {
                            // Invalid or missing portrait URL - use placeholder
                            copyPlaceholder(PLAYER_PLACEHOLDER, imgPath);
                        }
                    }
                }
            } else {
                console.log('FAILED (no data)');
                stats.playersFailed++;
                logError('PLAYER_NO_DATA', playerUrl, 'Page blocked or structure changed');
            }

            await randomDelay();
        }

        // Save checkpoint after each team
        saveCheckpoint({
            lastTeamIndex: i,
            timestamp: new Date().toISOString(),
            processedPlayers: stats.playersProcessed,
            failedPlayers: stats.playersFailed,
        });

        // Save intermediate xlsx every 10 teams
        if ((i + 1) % 10 === 0) {
            console.log(`  [Saving intermediate xlsx at team #${i + 1}...]`);
            saveExcel(data);
        }
    }

    // Final save
    saveExcel(data);

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('  SCRAPING COMPLETE');
    console.log('='.repeat(60));
    console.log(`  Teams processed: ${stats.teamsProcessed} / ${totalTeams}`);
    console.log(`  Teams failed:    ${stats.teamsFailed}`);
    console.log(`  Players scraped: ${stats.playersProcessed}`);
    console.log(`  Players failed:  ${stats.playersFailed}`);
    console.log(`  Players skipped: ${stats.playersSkipped}`);
    console.log(`  Images downloaded: ${stats.imagesDownloaded}`);
    console.log(`  Images failed:     ${stats.imagesFailed}`);
    console.log(`\n  Output: ${OUTPUT_EXCEL}`);
    if (fs.existsSync(ERROR_LOG)) {
        console.log(`  Errors: ${ERROR_LOG}`);
    }
    console.log('='.repeat(60));

    // Clean up checkpoint on successful completion
    if (stats.playersFailed === 0 && stats.teamsFailed === 0) {
        if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
    }
}

main().catch(err => {
    console.error('\nFatal error:', err);
    process.exit(1);
});
