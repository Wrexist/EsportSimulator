const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const XLSX = require('xlsx');

// CONFIG
const INPUT_EXCEL = path.join(__dirname, 'Thunderbit_901eab_20260102_041423.xlsx');
const OUTPUT_CSV = path.join(process.cwd(), 'public', 'players_rating3_output.csv');
const PROFILE_COLUMNS = [
    "player 1 Profile link",
    "player 2 profile link",
    "player 3 profile link",
    "player 4 profile link",
    "player 5 profile link",
];

async function scrapeHLTV() {
    console.log('Starting HLTV Scraper (Puppeteer)...');

    // Read Excel
    if (!fs.existsSync(INPUT_EXCEL)) {
        console.error(`Input file not found: ${INPUT_EXCEL}`);
        return;
    }
    const workbook = XLSX.readFile(INPUT_EXCEL);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    console.log(`Loaded ${data.length} rows from Excel.`);

    // Load existing CSV to skip duplicates
    const existingUrls = new Set();
    if (fs.existsSync(OUTPUT_CSV)) {
        const content = fs.readFileSync(OUTPUT_CSV, 'utf8');
        content.split('\n').forEach(line => {
            const parts = line.split(',');
            if (parts[0] && parts[0].startsWith('http')) existingUrls.add(parts[0]);
        });
    }

    const csvHeaders = ['profile_url', 'player_name', 'age', 'rating_3', 'firepower', 'entrying', 'trading', 'opening', 'clutching', 'sniping', 'utility'];

    // Write header immediately if file doesn't exist
    if (!fs.existsSync(OUTPUT_CSV) || fs.readFileSync(OUTPUT_CSV, 'utf8').trim() === '') {
        fs.writeFileSync(OUTPUT_CSV, csvHeaders.join(',') + '\n');
    }

    let processed = 0;

    // Flatten the list of URLs to process
    const targets = [];
    for (const row of data) {
        for (const col of PROFILE_COLUMNS) {
            const url = row[col];
            if (url && typeof url === 'string' && url.includes('hltv.org/player')) {
                targets.push(url);
            }
        }
    }

    console.log(`Found ${targets.length} total profiles. Already scraped: ${existingUrls.size}`);

    for (let i = 0; i < targets.length; i++) {
        const url = targets[i];

        if (existingUrls.has(url)) {
            continue;
        }

        processed++;
        process.stdout.write(`[${processed}/${targets.length - existingUrls.size}] ${url.split('/').pop()} ... `);

        // CONFIG: Restart browser every request (safest)
        let browser = null;
        try {
            browser = await puppeteer.launch({
                headless: "new",
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    '--window-size=1920,1080'
                ]
            });
            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });

            // STEALTH EVASIONS
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: Notification.permission }) :
                        Promise.resolve({ state: 'denied' })
                );
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
                Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            });

            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://www.google.com/'
            });

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            // Visit Page
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Check for 403/Challenge
            const title = await page.title();
            if (title.includes('Just a moment') || title.includes('Access denied')) {
                console.log('Detected Cloudflare Challenge. Waiting 5s...');
                await new Promise(r => setTimeout(r, 5000));
            }

            const stats = await page.evaluate(() => {
                const res = {
                    player_name: '', age: '', rating_3: '', firepower: '', entrying: '', trading: '', opening: '', clutching: '', sniping: '', utility: ''
                };

                // Name
                const nameEl = document.querySelector('h1.playerNickname');
                if (nameEl) res.player_name = nameEl.innerText.trim();

                // Age
                const ageEl = document.querySelector('.playerAge .listRight');
                if (ageEl) res.age = ageEl.innerText.trim().split(' ')[0];
                if (!res.age) {
                    const text = document.body.innerText;
                    const m = text.match(/(\d+) years/);
                    if (m) res.age = m[1];
                }

                // Stats
                const stats = document.querySelectorAll('.playerpage-container-attributes .player-stat');
                stats.forEach(stat => {
                    const label = stat.querySelector('b')?.innerText.trim();
                    const val = stat.querySelector('.statsVal')?.innerText.trim().replace(/\/100$/, '');

                    if (label === 'Rating 3.0') res.rating_3 = val;
                    else if (label === 'Firepower') res.firepower = val;
                    else if (label === 'Entrying') res.entrying = val;
                    else if (label === 'Trading') res.trading = val;
                    else if (label === 'Opening') res.opening = val;
                    else if (label === 'Clutching') res.clutching = val;
                    else if (label === 'Sniping') res.sniping = val;
                    else if (label === 'Utility') res.utility = val;
                });

                return res;
            });

            if (stats.player_name) {
                console.log(`✓ (R: ${stats.rating_3})`);
                const csvRow = [
                    url,
                    `"${stats.player_name}"`,
                    stats.age,
                    stats.rating_3,
                    stats.firepower,
                    stats.entrying,
                    stats.trading,
                    stats.opening,
                    stats.clutching,
                    stats.sniping,
                    stats.utility
                ].join(',');

                fs.appendFileSync(OUTPUT_CSV, csvRow + '\n');
            } else {
                console.log('? (No Data - Page might be blocked)');
            }

        } catch (e) {
            console.log(`Error: ${e.message}`);
        } finally {
            if (browser) await browser.close();
        }

        // Random delay between restarts (3-7s)
        const delay = Math.floor(Math.random() * 4000) + 3000;
        await new Promise(r => setTimeout(r, delay));
    }

    console.log('\nDone.');
}

scrapeHLTV();
