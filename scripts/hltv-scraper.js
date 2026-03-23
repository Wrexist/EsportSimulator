/**
 * HLTV Team & Player Scraper
 * 
 * A reusable Puppeteer script to scrape team and player data from HLTV.org
 * and create game asset files.
 * 
 * Usage:
 *   node scripts/hltv-scraper.js --team <team-url> --players <player1-url> <player2-url> ...
 * 
 * Example:
 *   node scripts/hltv-scraper.js --team https://www.hltv.org/team/8474/100-thieves --players https://www.hltv.org/player/7592/device https://www.hltv.org/player/8183/rain
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Configuration
const ASSETS_DIR = path.join(__dirname, '..', 'public', 'assets', 'teams');
const DELAY_BETWEEN_REQUESTS = 2000; // 2 seconds to avoid rate limiting

// Country code mapping
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
};

function getCountryCode(country) {
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

async function downloadImage(url, filepath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;

        const request = protocol.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                // Follow redirect
                downloadImage(response.headers.location, filepath)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }

            const fileStream = fs.createWriteStream(filepath);
            response.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream.close();
                resolve(filepath);
            });

            fileStream.on('error', reject);
        });

        request.on('error', reject);
    });
}

async function scrapeTeam(browser, teamUrl) {
    console.log(`\n📊 Scraping team: ${teamUrl}`);
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        await page.goto(teamUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await sleep(1000);

        // Extract team data
        const teamData = await page.evaluate(() => {
            const name = document.querySelector('.profile-team-name')?.innerText?.trim() ||
                document.querySelector('h1.name')?.innerText?.trim() || 'Unknown';

            // Get rank from profile stats
            const rankElement = document.querySelector('.profile-team-stats-container .profile-team-stat .right');
            let rank = rankElement?.innerText?.trim() || '-';
            rank = rank.replace('#', '');

            // Get team logo
            const logoImg = document.querySelector('.team-logo-container img, .profile-team-logo-container img');
            const logoUrl = logoImg?.src || '';

            // Get players list
            const players = [];
            const playerElements = document.querySelectorAll('.bodyshot-team-bg a, .player-selector a');
            playerElements.forEach(el => {
                const playerName = el.querySelector('.nickWrapper')?.innerText?.trim() ||
                    el.querySelector('.text')?.innerText?.trim() ||
                    el.getAttribute('title');
                const flag = el.querySelector('.flag');
                const country = flag?.getAttribute('title') || '';

                if (playerName) {
                    players.push({
                        name: playerName,
                        country: country,
                        countryCode: '' // Will be filled in later
                    });
                }
            });

            return { name, rank, logoUrl, players };
        });

        // Add country codes
        teamData.players = teamData.players.map(p => ({
            ...p,
            countryCode: getCountryCode(p.country)
        }));

        console.log(`   Team: ${teamData.name}`);
        console.log(`   Rank: #${teamData.rank}`);
        console.log(`   Players: ${teamData.players.map(p => p.name).join(', ')}`);

        await page.close();
        return teamData;

    } catch (error) {
        console.error(`   ❌ Error scraping team: ${error.message}`);
        await page.close();
        return null;
    }
}

async function scrapePlayer(browser, playerUrl) {
    console.log(`\n👤 Scraping player: ${playerUrl}`);
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        await page.goto(playerUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await sleep(1000);

        // Extract player data
        const playerData = await page.evaluate(() => {
            const name = document.querySelector('.player-nick, h1.name')?.innerText?.trim() || 'Unknown';

            // Get country
            const countryEl = document.querySelector('.player-real-name .flag, .playerRealname .flag');
            const country = countryEl?.getAttribute('title') || '';

            // Get age
            const ageText = document.querySelector('.player-realname span, .playerRealname')?.innerText || '';
            const ageMatch = ageText.match(/(\d+)\s*years/i);
            const age = ageMatch ? parseInt(ageMatch[1]) : null;

            // Get team
            const teamEl = document.querySelector('.team-name a, .playerTeam a');
            const team = teamEl?.innerText?.trim() || '';

            // Get team rank
            const teamRankEl = document.querySelector('.team-ranking a');
            let teamRank = teamRankEl?.innerText?.trim() || '-';
            teamRank = teamRank.replace('#', '');

            // Get rating (2.0)
            const ratingEl = document.querySelector('.player-stat .statsVal');
            const rating = ratingEl ? parseFloat(ratingEl.innerText) : 1.0;

            // Get portrait image
            const portraitImg = document.querySelector('.playerPicture img, .bodyshot-img');
            const portraitUrl = portraitImg?.src || '';

            // Stats breakdown (if available)
            const stats = {};
            const statBoxes = document.querySelectorAll('.stats-row span.strong');
            // These are approximate mappings - HLTV structure varies

            return {
                name,
                country,
                age,
                team,
                teamRank,
                rating,
                portraitUrl,
                stats
            };
        });

        // Get HLTV history by navigating to player's ranking history
        let hltvHistory = [];
        try {
            // Navigate to stats page to get more detailed info
            const statsUrl = playerUrl.replace('/player/', '/stats/players/') + '?startDate=all&endDate=all';
            // Skip for now, keep simple
        } catch (e) {
            // Ignore stats errors
        }

        // Add country code
        playerData.countryCode = getCountryCode(playerData.country);

        console.log(`   Name: ${playerData.name}`);
        console.log(`   Country: ${playerData.country} (${playerData.countryCode})`);
        console.log(`   Age: ${playerData.age || 'Unknown'}`);
        console.log(`   Team: ${playerData.team} (#${playerData.teamRank})`);
        console.log(`   Rating: ${playerData.rating}`);

        await page.close();
        return playerData;

    } catch (error) {
        console.error(`   ❌ Error scraping player: ${error.message}`);
        await page.close();
        return null;
    }
}

function findExistingPlayer(playerName) {
    const sanitized = sanitizeName(playerName);
    const teams = fs.readdirSync(ASSETS_DIR);

    for (const team of teams) {
        const playersDir = path.join(ASSETS_DIR, team, 'players');
        if (fs.existsSync(playersDir)) {
            const files = fs.readdirSync(playersDir);
            for (const file of files) {
                if (file === `${sanitized}.json`) {
                    return {
                        team,
                        jsonPath: path.join(playersDir, `${sanitized}.json`),
                        pngPath: path.join(playersDir, `${sanitized}.png`)
                    };
                }
            }
        }
    }
    return null;
}

function removePlayerFromTeam(teamSlug, playerName) {
    const teamJsonPath = path.join(ASSETS_DIR, teamSlug, 'team.json');

    if (fs.existsSync(teamJsonPath)) {
        const teamData = JSON.parse(fs.readFileSync(teamJsonPath, 'utf8'));
        teamData.players = teamData.players.filter(
            p => p.name.toLowerCase() !== playerName.toLowerCase()
        );
        fs.writeFileSync(teamJsonPath, JSON.stringify(teamData, null, 2));
        console.log(`   Removed ${playerName} from ${teamSlug}/team.json`);
    }
}

async function createTeamAssets(teamData, teamSlug) {
    const teamDir = path.join(ASSETS_DIR, teamSlug);
    const playersDir = path.join(teamDir, 'players');

    // Create directories
    if (!fs.existsSync(teamDir)) {
        fs.mkdirSync(teamDir, { recursive: true });
    }
    if (!fs.existsSync(playersDir)) {
        fs.mkdirSync(playersDir, { recursive: true });
    }

    // Download team logo
    if (teamData.logoUrl) {
        const logoPath = path.join(teamDir, 'logo.png');
        try {
            await downloadImage(teamData.logoUrl, logoPath);
            console.log(`   ✅ Downloaded team logo`);
        } catch (e) {
            console.log(`   ⚠️ Could not download logo: ${e.message}`);
            // Copy placeholder
            const placeholderPath = path.join(__dirname, '..', 'public', 'team_placeholder.png');
            if (fs.existsSync(placeholderPath)) {
                fs.copyFileSync(placeholderPath, logoPath);
            }
        }
    }

    // Create team.json
    const teamJson = {
        name: teamData.name,
        hltvRank: teamData.rank,
        players: teamData.players,
        matchesPlayed: 100,
        hltvHistory: []
    };

    fs.writeFileSync(
        path.join(teamDir, 'team.json'),
        JSON.stringify(teamJson, null, 2)
    );
    console.log(`   ✅ Created team.json`);

    return { teamDir, playersDir };
}

async function createPlayerAssets(playerData, playersDir, existingPlayer = null) {
    const sanitized = sanitizeName(playerData.name);
    const jsonPath = path.join(playersDir, `${sanitized}.json`);
    const pngPath = path.join(playersDir, `${sanitized}.png`);

    // If player exists elsewhere, move files
    if (existingPlayer) {
        console.log(`   📦 Moving player from ${existingPlayer.team}...`);

        // Copy files to new location
        if (fs.existsSync(existingPlayer.jsonPath)) {
            fs.copyFileSync(existingPlayer.jsonPath, jsonPath);
            fs.unlinkSync(existingPlayer.jsonPath); // Delete original
        }
        if (fs.existsSync(existingPlayer.pngPath)) {
            fs.copyFileSync(existingPlayer.pngPath, pngPath);
            fs.unlinkSync(existingPlayer.pngPath); // Delete original
        }

        // Remove from old team.json
        removePlayerFromTeam(existingPlayer.team, playerData.name);

        // Update the JSON with new team info
        const existingData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        existingData.team = playerData.team;
        existingData.teamRank = playerData.teamRank;
        fs.writeFileSync(jsonPath, JSON.stringify(existingData, null, 2));

        console.log(`   ✅ Transferred ${playerData.name}`);
        return;
    }

    // Download portrait
    if (playerData.portraitUrl) {
        try {
            await downloadImage(playerData.portraitUrl, pngPath);
            console.log(`   ✅ Downloaded portrait for ${playerData.name}`);
        } catch (e) {
            console.log(`   ⚠️ Could not download portrait: ${e.message}`);
            // Copy placeholder
            const placeholderPath = path.join(__dirname, '..', 'public', 'player_placeholder.png');
            if (fs.existsSync(placeholderPath)) {
                fs.copyFileSync(placeholderPath, pngPath);
            }
        }
    }

    // Create player JSON
    const playerJson = {
        name: playerData.name,
        country: playerData.country,
        countryCode: playerData.countryCode,
        team: playerData.team,
        teamRank: playerData.teamRank || '-',
        age: playerData.age || 25,
        rating: playerData.rating || 1.0,
        stats: {
            firepower: Math.round(50 + Math.random() * 40),
            entrying: Math.round(30 + Math.random() * 50),
            trading: Math.round(40 + Math.random() * 40),
            opening: Math.round(30 + Math.random() * 50),
            clutching: Math.round(30 + Math.random() * 40),
            sniping: Math.round(20 + Math.random() * 60),
            utility: Math.round(40 + Math.random() * 40)
        },
        hltvHistory: [],
        matchesPlayed: Math.round(300 + Math.random() * 600),
        majorWins: 0,
        totalMVPs: 0
    };

    // Adjust stats based on rating
    if (playerData.rating >= 1.2) {
        playerJson.stats.firepower = Math.min(99, playerJson.stats.firepower + 20);
    }

    fs.writeFileSync(jsonPath, JSON.stringify(playerJson, null, 2));
    console.log(`   ✅ Created ${sanitized}.json`);
}

async function main() {
    const args = process.argv.slice(2);

    // Parse arguments
    let teamUrl = null;
    let playerUrls = [];

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--team' && args[i + 1]) {
            teamUrl = args[i + 1];
            i++;
        } else if (args[i] === '--players') {
            // All remaining args are player URLs
            playerUrls = args.slice(i + 1);
            break;
        }
    }

    if (!teamUrl) {
        console.log(`
HLTV Team & Player Scraper

Usage:
  node scripts/hltv-scraper.js --team <team-url> --players <player1-url> <player2-url> ...

Example:
  node scripts/hltv-scraper.js \\
    --team https://www.hltv.org/team/8474/100-thieves \\
    --players https://www.hltv.org/player/7592/device https://www.hltv.org/player/8183/rain
        `);
        process.exit(1);
    }

    console.log('\n🚀 Starting HLTV Scraper...\n');
    console.log(`Team URL: ${teamUrl}`);
    console.log(`Player URLs: ${playerUrls.length}`);

    // Launch browser
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        // Scrape team info
        const teamData = await scrapeTeam(browser, teamUrl);

        if (!teamData) {
            console.error('\n❌ Failed to scrape team data');
            process.exit(1);
        }

        const teamSlug = sanitizeName(teamData.name);
        console.log(`\n📁 Creating team assets in: ${teamSlug}/`);

        const { playersDir } = await createTeamAssets(teamData, teamSlug);

        // Scrape and process players
        const scrapedPlayers = [];

        for (const playerUrl of playerUrls) {
            await sleep(DELAY_BETWEEN_REQUESTS);

            const playerData = await scrapePlayer(browser, playerUrl);
            if (playerData) {
                // Update team info
                playerData.team = teamData.name;
                playerData.teamRank = teamData.rank;

                // Check if player exists elsewhere
                const existingPlayer = findExistingPlayer(playerData.name);
                if (existingPlayer) {
                    console.log(`   ⚠️ Player exists in ${existingPlayer.team}, will transfer`);
                }

                await createPlayerAssets(playerData, playersDir, existingPlayer);

                scrapedPlayers.push({
                    name: playerData.name,
                    country: playerData.country,
                    countryCode: playerData.countryCode
                });
            }
        }

        // Update team.json with final player list
        const teamJsonPath = path.join(ASSETS_DIR, teamSlug, 'team.json');
        const finalTeamData = JSON.parse(fs.readFileSync(teamJsonPath, 'utf8'));
        finalTeamData.players = scrapedPlayers;
        fs.writeFileSync(teamJsonPath, JSON.stringify(finalTeamData, null, 2));

        console.log('\n✅ Scraping complete!');
        console.log(`   Team: ${teamData.name}`);
        console.log(`   Players: ${scrapedPlayers.map(p => p.name).join(', ')}`);
        console.log(`   Location: public/assets/teams/${teamSlug}/`);

    } finally {
        await browser.close();
    }
}

// Export functions for use as module
module.exports = {
    scrapeTeam,
    scrapePlayer,
    findExistingPlayer,
    removePlayerFromTeam,
    createTeamAssets,
    createPlayerAssets,
    sanitizeName,
    getCountryCode
};

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}
