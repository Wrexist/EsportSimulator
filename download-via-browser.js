/**
 * Download Team Logos directly via Puppeteer browser
 * Navigates to HLTV team pages and saves logo images
 * Run with: node download-via-browser.js
 */

const puppeteer = require('puppeteer');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Read Excel data
const excelPath = path.join(__dirname, 'Thunderbit_901eab_20260102_235323.xlsx');
const workbook = XLSX.readFile(excelPath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const teamsData = XLSX.utils.sheet_to_json(worksheet);

const assetsDir = path.join(__dirname, 'public', 'assets', 'teams');

function teamNameToFolder(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

async function main() {
    console.log('=== Downloading Team Logos via Browser ===\n');

    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Filter teams that need logos
    const teamsNeedingLogos = teamsData.filter(team => {
        const teamName = team['Team Name'];
        if (!teamName) return false;

        const folderName = teamNameToFolder(teamName);
        const teamDir = path.join(assetsDir, folderName);
        const pngPath = path.join(teamDir, 'logo.png');
        const svgPath = path.join(teamDir, 'logo.svg');

        return !fs.existsSync(pngPath) && !fs.existsSync(svgPath);
    });

    console.log(`Teams needing logos: ${teamsNeedingLogos.length}\n`);

    let downloaded = 0;
    let failed = 0;

    // Process teams with profile URLs
    for (const team of teamsNeedingLogos) {
        const teamName = team['Team Name'];
        const profileUrl = team['Team Profile URL'];

        if (!profileUrl) {
            console.log(`⚠ ${teamName} - No profile URL`);
            failed++;
            continue;
        }

        const folderName = teamNameToFolder(teamName);
        const teamDir = path.join(assetsDir, folderName);

        // Create directory
        if (!fs.existsSync(teamDir)) {
            fs.mkdirSync(teamDir, { recursive: true });
        }

        try {
            await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 15000 });

            // Find team logo on the page
            const logoData = await page.evaluate(() => {
                // Look for team logo in profile
                const logoImg = document.querySelector('.profile-team-logo-container img, .teamlogo img, img.logo');
                if (logoImg && logoImg.src) {
                    return { src: logoImg.src };
                }

                // Fallback: any img with team in class
                const allImgs = document.querySelectorAll('img');
                for (const img of allImgs) {
                    if (img.src && (img.className.includes('logo') || img.src.includes('teamlogo'))) {
                        return { src: img.src };
                    }
                }
                return null;
            });

            if (logoData && logoData.src) {
                // Download the image via page context
                const ext = logoData.src.includes('.svg') ? 'svg' : 'png';
                const outputPath = path.join(teamDir, `logo.${ext}`);

                // Use page.goto to fetch the image and save it
                const imageResponse = await page.goto(logoData.src, { waitUntil: 'networkidle2' });
                const imageBuffer = await imageResponse.buffer();
                fs.writeFileSync(outputPath, imageBuffer);

                console.log(`✓ ${teamName}`);
                downloaded++;

                // Go back for next team
                await page.goBack();
            } else {
                console.log(`⚠ ${teamName} - Logo not found on page`);
                failed++;
            }
        } catch (err) {
            console.log(`✗ ${teamName} - ${err.message}`);
            failed++;
        }

        // Small delay
        await new Promise(r => setTimeout(r, 300));
    }

    await browser.close();

    console.log(`\n=== Complete ===`);
    console.log(`Downloaded: ${downloaded}`);
    console.log(`Failed: ${failed}`);
}

main().catch(console.error);
