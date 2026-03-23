/**
 * Download Team Logos from HLTV using Puppeteer
 * Uses the Excel data to get team logo URLs
 * Run with: node download-logos-puppeteer.js
 */

const puppeteer = require('puppeteer');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Read Excel data
const excelPath = path.join(__dirname, 'Thunderbit_901eab_20260102_235323.xlsx');
const workbook = XLSX.readFile(excelPath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const teamsData = XLSX.utils.sheet_to_json(worksheet);

const assetsDir = path.join(__dirname, 'public', 'assets', 'teams');

// Helper to convert team name to folder name
function teamNameToFolder(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

// Download file with proper headers
function downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(outputPath);

        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://www.hltv.org/'
            }
        }, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                file.close();
                fs.unlinkSync(outputPath);
                downloadFile(response.headers.location, outputPath).then(resolve).catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                file.close();
                fs.unlinkSync(outputPath);
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            file.close();
            fs.unlink(outputPath, () => { });
            reject(err);
        });
    });
}

async function downloadTeamLogos() {
    console.log('=== Downloading Team Logos ===\n');

    let downloaded = 0;
    let skipped = 0;
    let failed = 0;

    for (const team of teamsData) {
        const teamName = team['Team Name'];
        const logoUrl = team['Team Logo'];

        if (!teamName) continue;

        const folderName = teamNameToFolder(teamName);
        const teamDir = path.join(assetsDir, folderName);

        // Create directory
        if (!fs.existsSync(teamDir)) {
            fs.mkdirSync(teamDir, { recursive: true });
        }

        // Check if logo already exists
        const pngPath = path.join(teamDir, 'logo.png');
        const svgPath = path.join(teamDir, 'logo.svg');

        if (fs.existsSync(pngPath) || fs.existsSync(svgPath)) {
            skipped++;
            continue;
        }

        if (!logoUrl || logoUrl.trim() === '') {
            console.log(`⚠ ${teamName} - No logo URL in Excel`);
            failed++;
            continue;
        }

        // Determine extension
        const ext = logoUrl.includes('.svg') ? 'svg' : 'png';
        const outputPath = path.join(teamDir, `logo.${ext}`);

        try {
            await downloadFile(logoUrl, outputPath);
            console.log(`✓ ${teamName}`);
            downloaded++;
        } catch (err) {
            console.log(`✗ ${teamName} - ${err.message}`);
            failed++;
        }

        // Small delay
        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`\n=== Logo Download Complete ===`);
    console.log(`Downloaded: ${downloaded}`);
    console.log(`Skipped (already exists): ${skipped}`);
    console.log(`Failed/No URL: ${failed}`);
}

async function downloadPlayerImages() {
    console.log('\n=== Downloading Player Images via Puppeteer ===\n');

    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    const playersDir = path.join(__dirname, 'public', 'assets', 'players');
    if (!fs.existsSync(playersDir)) {
        fs.mkdirSync(playersDir, { recursive: true });
    }

    let processed = 0;
    let downloaded = 0;
    let failed = 0;

    // Collect all player links
    const playerLinks = [];
    for (const team of teamsData) {
        const teamFolder = teamNameToFolder(team['Team Name'] || '');

        for (let i = 1; i <= 5; i++) {
            const playerUrl = team[`Player ${i} Link`];
            if (playerUrl && playerUrl.startsWith('http')) {
                // Extract player ID and name from URL like /player/12345/nickname
                const match = playerUrl.match(/\/player\/(\d+)\/([a-zA-Z0-9_-]+)/);
                if (match) {
                    playerLinks.push({
                        url: playerUrl,
                        id: match[1],
                        nickname: match[2],
                        team: teamFolder
                    });
                }
            }
        }
    }

    console.log(`Found ${playerLinks.length} player links to process\n`);

    // Process first 50 players as a test
    const toProcess = playerLinks.slice(0, 50);

    for (const player of toProcess) {
        processed++;

        // Check if already exists
        const playerDir = path.join(assetsDir, player.team, 'players');
        const outputPath = path.join(playerDir, `${player.nickname}.png`);

        if (fs.existsSync(outputPath)) {
            continue;
        }

        try {
            await page.goto(player.url, { waitUntil: 'networkidle2', timeout: 15000 });

            // Find player image
            const imageUrl = await page.evaluate(() => {
                // Try to find the player image (usually in .playerImage or similar)
                const img = document.querySelector('.bodyshot-img, .playerImage img, .player-photo img, img[alt*="Player"]');
                if (img && img.src) {
                    return img.src;
                }
                // Fallback: look for any large player image
                const allImgs = document.querySelectorAll('img');
                for (const i of allImgs) {
                    if (i.src && i.src.includes('playerbodyshot') || i.src.includes('player')) {
                        return i.src;
                    }
                }
                return null;
            });

            if (imageUrl) {
                // Create directory
                if (!fs.existsSync(playerDir)) {
                    fs.mkdirSync(playerDir, { recursive: true });
                }

                await downloadFile(imageUrl, outputPath);
                console.log(`✓ ${player.nickname}`);
                downloaded++;
            } else {
                console.log(`⚠ ${player.nickname} - No image found`);
                failed++;
            }
        } catch (err) {
            console.log(`✗ ${player.nickname} - ${err.message}`);
            failed++;
        }

        // Delay between requests
        await new Promise(r => setTimeout(r, 500));
    }

    await browser.close();

    console.log(`\n=== Player Download Complete ===`);
    console.log(`Processed: ${processed}`);
    console.log(`Downloaded: ${downloaded}`);
    console.log(`Failed: ${failed}`);
}

async function main() {
    // First download team logos
    await downloadTeamLogos();

    // Then download player images (optional - takes longer)
    // Uncomment to enable:
    // await downloadPlayerImages();

    console.log('\n=== ALL DONE ===');
}

main().catch(console.error);
