/**
 * Liquipedia Enhanced Player Data Scraper v2.0
 * 
 * Scrapes comprehensive player data from Liquipedia including:
 * - Role, Age, Status, Nationality
 * - Major tournament wins
 * - HLTV Top 20 rankings
 * - Prize earnings
 * - Tier calculation (LEGEND/STAR/PRO)
 * 
 * Run with: node scripts/scrape-liquipedia.js
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
    // Path to players.json
    PLAYERS_JSON_PATH: path.join(process.cwd(), 'public', 'data', 'snapshot', 'players.json'),
    // Backup path
    BACKUP_PATH: path.join(process.cwd(), 'public', 'data', 'snapshot', 'players_backup.json'),
    // Base delay between requests (ms)
    BASE_DELAY: 5000,
    // Additional random delay (ms)
    RANDOM_DELAY: 2000,
    // Max retries per player
    MAX_RETRIES: 3,
    // Page load timeout (ms)
    TIMEOUT: 30000,
    // Start from this index (for resuming)
    START_INDEX: 0,
    // Limit number of players (null = no limit)
    LIMIT: null,
    // Only update players with missing data
    ONLY_MISSING: false,
    // Only update players that are currently Riflers (to find specific roles)
    ONLY_RIFLERS: true,
    // Resume from this count of filtered players (e.g. 71 done)
    SKIP_FILTERED_COUNT: 281,
};

// ═══════════════════════════════════════════════════════════════════════════
// KNOWN DATA - Manual overrides for legendary players
// ═══════════════════════════════════════════════════════════════════════════

const KNOWN_MAJOR_WINNERS = {
    // 4x Major winners
    'device': 4, 'xyp9x': 4, 'dupreeh': 4, 'gla1ve': 4,
    // 3x Major winners
    'magisk': 3,
    // 2x Major winners
    'olofmeister': 2, 'flusha': 2, 'krimz': 2, 'jw': 2, 'pronax': 2,
    'fnx': 2, 'fer': 2, 'coldzera': 2, 'taco': 2, 'fallen': 2,
    'nbk-': 2, 'happy': 2, 'shox': 2, 'kioshima': 2,
    // 1x Major winners
    'smithzz': 1, 'apex': 1, 'kennys': 1, 's1mple': 1, 'electronic': 1,
    'b1t': 1, 'perfecto': 1, 'sdy': 1, 'niko': 1, 'karrigan': 1,
    'rain': 1, 'broky': 1, 'twistzz': 1, 'ropz': 1, 'monesy': 1,
    'nexa': 1, 'hunter-': 1, 'hooxi': 1, 'snax': 1, 'pasha': 1,
    'neo': 1, 'taz': 1, 'byali': 1, 'stewie2k': 1, 'skadoodle': 1,
    'autimatic': 1, 'tarik': 1, 'rush': 1, 'get_right': 1, 'f0rest': 1,
    'xizt': 1, 'fifflaren': 1, 'friberg': 1, 'guardian': 1,
};

const KNOWN_HLTV_TOP5 = [
    's1mple', 'zywoo', 'device', 'niko', 'coldzera', 'olofmeister',
    'get_right', 'shox', 'kennyS', 'flusha', 'electronic', 'dupreeh'
];

// ═══════════════════════════════════════════════════════════════════════════
// SCRAPER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class LiquipediaScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.stats = { processed: 0, updated: 0, skipped: 0, errors: 0 };
    }

    async init() {
        console.log('🚀 Launching browser...');
        this.browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
        });
        this.page = await this.browser.newPage();
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await this.page.setViewport({ width: 1280, height: 800 });
    }

    async close() {
        if (this.browser) await this.browser.close();
    }

    delay(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    async scrapePlayer(nickname) {
        // Try different URL formats
        const urlVariants = [
            nickname,
            nickname.toLowerCase(),
            nickname.charAt(0).toUpperCase() + nickname.slice(1).toLowerCase(),
            nickname.replace(/\s+/g, '_'),
        ];

        for (const variant of urlVariants) {
            const url = `https://liquipedia.net/counterstrike/${encodeURIComponent(variant)}`;

            for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
                try {
                    const response = await this.page.goto(url, {
                        waitUntil: 'domcontentloaded',
                        timeout: CONFIG.TIMEOUT
                    });

                    // Rate limited
                    if (response.status() === 429) {
                        console.log(`   ⏳ Rate limited, waiting 60s...`);
                        await this.delay(60000);
                        continue;
                    }

                    // Not found
                    if (response.status() === 404) break;

                    // Success
                    if (response.status() === 200) {
                        // Check if it's a valid player page (not disambiguation)
                        const isValid = await this.page.evaluate(() => {
                            const content = document.querySelector('.infobox-cell-2');
                            const disambiguation = document.querySelector('.disambig');
                            return content && !disambiguation;
                        });

                        if (!isValid) break;

                        // Extract data
                        return await this.extractPlayerData();
                    }

                } catch (e) {
                    if (attempt === CONFIG.MAX_RETRIES) break;
                    await this.delay(2000);
                }
            }
        }
        return null;
    }

    async extractPlayerData() {
        return await this.page.evaluate(() => {
            const result = {
                realName: null,
                age: null,
                nationality: null,
                role: null,
                status: null,
                majorWins: 0,
                hltvHistory: [],
                achievements: [],
                earnings: null,
            };

            // Helper to get infobox value
            const getInfoboxValue = (label) => {
                const cells = Array.from(document.querySelectorAll('.infobox-cell-2'));
                for (let i = 0; i < cells.length; i++) {
                    if (cells[i].textContent.trim().toLowerCase().includes(label.toLowerCase())) {
                        const next = cells[i + 1];
                        if (next) return next.textContent.trim();
                    }
                }
                return null;
            };

            // Real name
            result.realName = getInfoboxValue('Name:');

            // Age from "(age XX)"
            const ageMatch = document.body.textContent.match(/\(age\s*(\d+)\)/i);
            if (ageMatch) result.age = parseInt(ageMatch[1]);

            // Nationality - from flag image alt text
            const flagImg = document.querySelector('.infobox-image img[alt], .flag img');
            if (flagImg) {
                result.nationality = flagImg.alt || flagImg.title;
            }

            // Role
            const roleValue = getInfoboxValue('Role');
            if (roleValue) {
                // Get the full text to find all roles (e.g. "Rifler\nIn-game leader")
                result.role = roleValue;
            } else {
                // Try category links
                const categoryLinks = Array.from(document.querySelectorAll('a[href*="/counterstrike/Category:"]'));
                for (const link of categoryLinks) {
                    const text = link.textContent;
                    if (['Rifler', 'AWPer', 'In-game leader', 'Support', 'Lurker', 'Entry'].some(r => text.includes(r))) {
                        result.role = text;
                        break;
                    }
                }
            }

            // Status
            const activeLink = document.querySelector('a[href="/counterstrike/Active"]');
            const retiredLink = document.querySelector('a[href="/counterstrike/Retired"]');
            if (activeLink) result.status = 'Active';
            else if (retiredLink) result.status = 'Retired';
            else {
                const statusValue = getInfoboxValue('Status');
                if (statusValue) result.status = statusValue;
            }

            // Achievements - Major wins
            const achievementsTable = document.querySelector('#Achievements + table, #Achievements ~ table');
            if (achievementsTable) {
                const rows = achievementsTable.querySelectorAll('tr');
                rows.forEach(row => {
                    const text = row.textContent.toLowerCase();
                    // Check for 1st place in major-tier tournaments
                    if (text.includes('1st') || text.includes('gold') || text.includes('🥇')) {
                        const isMajor = text.includes('major') ||
                            (text.includes('dreamhack') && (text.includes('2013') || text.includes('2014') || text.includes('2015'))) ||
                            text.includes('esl one cologne') ||
                            text.includes('esl one katowice') ||
                            text.includes('pgl') ||
                            text.includes('eleague major') ||
                            text.includes('faceit major') ||
                            text.includes('starladder major');

                        if (isMajor) {
                            result.majorWins++;
                            // Get tournament name
                            const tournamentCell = row.querySelector('td:nth-child(4), td:nth-child(3)');
                            if (tournamentCell) {
                                result.achievements.push(tournamentCell.textContent.trim().substring(0, 50));
                            }
                        }
                    }
                });
            }

            // HLTV Top 20 rankings
            const hltvMatches = document.body.textContent.match(/#(\d{1,2})\s+(?:of|in|best player of)\s*(\d{4})/gi);
            if (hltvMatches) {
                hltvMatches.forEach(match => {
                    const parts = match.match(/#(\d+).*?(\d{4})/);
                    if (parts) {
                        const rank = parseInt(parts[1]);
                        const year = parseInt(parts[2]);
                        if (rank <= 20 && year >= 2010 && year <= 2025) {
                            result.hltvHistory.push({ year, rank });
                        }
                    }
                });
            }

            // Also check for explicit mentions
            const pageText = document.body.textContent;
            for (let year = 2013; year <= 2024; year++) {
                const patterns = [
                    new RegExp(`#(\\d{1,2}).*?${year}`, 'i'),
                    new RegExp(`${year}.*?#(\\d{1,2})`, 'i'),
                    new RegExp(`(\\d{1,2})(?:st|nd|rd|th).*?${year}`, 'i'),
                ];
                for (const pattern of patterns) {
                    const match = pageText.match(pattern);
                    if (match && parseInt(match[1]) <= 20) {
                        const existing = result.hltvHistory.find(h => h.year === year);
                        if (!existing) {
                            result.hltvHistory.push({ year, rank: parseInt(match[1]) });
                        }
                    }
                }
            }

            // Deduplicate and sort
            const unique = {};
            result.hltvHistory.forEach(r => {
                if (!unique[r.year] || unique[r.year] > r.rank) unique[r.year] = r.rank;
            });
            result.hltvHistory = Object.entries(unique)
                .map(([year, rank]) => ({ year: parseInt(year), rank }))
                .sort((a, b) => b.year - a.year);

            // Earnings
            const earningsMatch = pageText.match(/(?:Total|Approx).*?\$[\d,]+/i);
            if (earningsMatch) {
                const amount = earningsMatch[0].match(/\$([\d,]+)/);
                if (amount) result.earnings = parseInt(amount[1].replace(/,/g, ''));
            }

            return result;
        });
    }

    mapRole(role) {
        if (!role) return 'Rifler';
        const r = role.toLowerCase();
        // Priority order: IGL > AWP > Entry/Support/Lurk > Rifler
        if (r.includes('igl') || r.includes('leader') || r.includes('captain')) return 'IGL';
        if (r.includes('awp') || r.includes('sniper')) return 'AWPer';
        if (r.includes('entry')) return 'Entry';
        if (r.includes('support')) return 'Support';
        if (r.includes('lurk')) return 'Lurker';
        return 'Rifler';
    }

    calculateTier(player, scraped) {
        const nick = player.nickname.toLowerCase();
        const majorWins = scraped?.majorWins || KNOWN_MAJOR_WINNERS[nick] || 0;
        const hasTop5 = KNOWN_HLTV_TOP5.includes(nick) ||
            (scraped?.hltvHistory?.some(h => h.rank <= 5));

        if (majorWins >= 2 || hasTop5) return 'LEGEND';
        if (majorWins === 1 || scraped?.hltvHistory?.length > 0) return 'STAR';
        return 'PRO';
    }

    calculateSkill(player, tier, scraped) {
        let skill = player.skill || 50;

        if (tier === 'LEGEND') skill = Math.max(skill, 78);
        else if (tier === 'STAR') skill = Math.max(skill, 68);

        // Boost based on HLTV rankings
        const bestRank = scraped?.hltvHistory?.[0]?.rank;
        if (bestRank) {
            if (bestRank <= 3) skill = Math.max(skill, 88);
            else if (bestRank <= 5) skill = Math.max(skill, 82);
            else if (bestRank <= 10) skill = Math.max(skill, 76);
        }

        return Math.min(95, skill);
    }

    async run() {
        console.log('═'.repeat(60));
        console.log('       LIQUIPEDIA ENHANCED PLAYER SCRAPER v2.0');
        console.log('═'.repeat(60));

        // Load players
        console.log(`\n📂 Loading ${CONFIG.PLAYERS_JSON_PATH}...`);
        let players = JSON.parse(fs.readFileSync(CONFIG.PLAYERS_JSON_PATH, 'utf8'));
        console.log(`   Found ${players.length} players`);

        // Create backup
        console.log(`\n💾 Creating backup...`);
        fs.writeFileSync(CONFIG.BACKUP_PATH, JSON.stringify(players, null, 2));

        await this.init();

        // Apply filters
        let toProcess = players.slice(CONFIG.START_INDEX);
        if (CONFIG.LIMIT) toProcess = toProcess.slice(0, CONFIG.LIMIT);

        if (CONFIG.ONLY_MISSING) {
            toProcess = toProcess.filter(p => !p.hltvHistory?.length || p.majorWins === 0);
        }

        if (CONFIG.ONLY_RIFLERS) {
            console.log('   🔍 Filter: Processing ONLY Riflers to check for specific roles...');
            toProcess = toProcess.filter(p => !p.role || p.role === 'Rifler');
        }

        // Resume capability
        if (CONFIG.SKIP_FILTERED_COUNT > 0) {
            console.log(`   ⏩ Resuming: Skipping first ${CONFIG.SKIP_FILTERED_COUNT} players...`);
            toProcess = toProcess.slice(CONFIG.SKIP_FILTERED_COUNT);
        }

        console.log(`\n🎯 Processing ${toProcess.length} players...\n`);
        console.log('─'.repeat(60));

        for (let i = 0; i < toProcess.length; i++) {
            const player = toProcess[i];
            const idx = players.findIndex(p => p.id === player.id);

            process.stdout.write(`[${i + 1}/${toProcess.length}] ${player.nickname.padEnd(20)}... `);
            this.stats.processed++;

            const scraped = await this.scrapePlayer(player.nickname);

            if (scraped) {
                // Update player data
                if (scraped.realName) players[idx].name = scraped.realName;
                if (scraped.age) players[idx].age = scraped.age;
                if (scraped.nationality) players[idx].nationality = scraped.nationality;

                // Map role with new logic
                if (scraped.role) {
                    const newRole = this.mapRole(scraped.role);

                    // Logic for Riflers: If they are currently Rifler, and we found a special role, 
                    // make the special role their secondary role.
                    if (players[idx].role === 'Rifler' && newRole !== 'Rifler') {
                        console.log(`   ✨ Found secondary role: Rifler + ${newRole}`);
                        players[idx].secondaryRole = newRole;
                    }
                    // If they are not Rifler, or if the scraped role is Rifler, we follow standard update 
                    // (though user asked to ONLY update if we find another role for Rifler, mainly)
                    else if (!players[idx].role || players[idx].role === 'Unknown') {
                        players[idx].role = newRole;
                    }
                }

                // Major wins (use max of scraped, known, and existing)
                const nick = player.nickname.toLowerCase();
                const knownMajors = KNOWN_MAJOR_WINNERS[nick] || 0;
                players[idx].majorWins = Math.max(scraped.majorWins, knownMajors, player.majorWins || 0);

                // HLTV history
                if (scraped.hltvHistory.length > 0) {
                    players[idx].hltvHistory = scraped.hltvHistory;
                }

                // Achievements
                if (scraped.achievements.length > 0) {
                    players[idx].achievements = scraped.achievements;
                }

                // Calculate tier and skill
                const tier = this.calculateTier(player, scraped);
                players[idx].tier = tier;
                players[idx].skill = this.calculateSkill(player, tier, scraped);

                // Role-specific bonuses
                if (players[idx].role === 'IGL') {
                    players[idx].leader = Math.max(players[idx].leader || 50, 82);
                    players[idx].tactic = Math.max(players[idx].tactic || 50, 78);
                } else if (players[idx].role === 'AWPer') {
                    players[idx].awp = Math.max(players[idx].awp || 50, 85);
                    players[idx].sniping = Math.max(players[idx].sniping || 50, 85);
                }

                console.log(`✓ ${tier} | Majors: ${players[idx].majorWins} | Skill: ${players[idx].skill}`);
                this.stats.updated++;

            } else {
                // Try known data
                const nick = player.nickname.toLowerCase();
                if (KNOWN_MAJOR_WINNERS[nick]) {
                    players[idx].majorWins = KNOWN_MAJOR_WINNERS[nick];
                    players[idx].tier = KNOWN_MAJOR_WINNERS[nick] >= 2 ? 'LEGEND' : 'STAR';
                    console.log(`⚡ (known) ${players[idx].tier}`);
                    this.stats.updated++;
                } else {
                    console.log(`✗ Not found`);
                    this.stats.errors++;
                }
            }

            // Rate limiting
            const delay = CONFIG.BASE_DELAY + Math.random() * CONFIG.RANDOM_DELAY;
            await this.delay(delay);
        }

        // Save
        console.log('\n' + '─'.repeat(60));
        console.log('\n💾 Saving updated data...');
        fs.writeFileSync(CONFIG.PLAYERS_JSON_PATH, JSON.stringify(players, null, 2));

        // Summary
        console.log('\n' + '═'.repeat(60));
        console.log('                      SUMMARY');
        console.log('═'.repeat(60));
        console.log(`  Processed: ${this.stats.processed}`);
        console.log(`  Updated:   ${this.stats.updated}`);
        console.log(`  Errors:    ${this.stats.errors}`);
        console.log('═'.repeat(60) + '\n');

        await this.close();
    }
}

// Run
new LiquipediaScraper().run().catch(console.error);
