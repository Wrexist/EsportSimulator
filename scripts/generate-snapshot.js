const fs = require('fs');
const path = require('path');

// CONFIG
const ASSETS_DIR = path.join(process.cwd(), 'public', 'assets', 'teams');
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'data', 'snapshot');
const EXISTING_TEAMS_PATH = path.join(OUTPUT_DIR, 'teams.json');

// ============================================================
// REGION MAPPING (nationality → region)
// ============================================================
const REGION_MAP = {
    // EU
    'Denmark': 'EU', 'Sweden': 'EU', 'France': 'EU', 'Germany': 'EU',
    'Poland': 'EU', 'Finland': 'EU', 'Norway': 'EU', 'Czech Republic': 'EU',
    'Romania': 'EU', 'Portugal': 'EU', 'Netherlands': 'EU', 'Belgium': 'EU',
    'Spain': 'EU', 'United Kingdom': 'EU', 'Ireland': 'EU', 'Italy': 'EU',
    'Switzerland': 'EU', 'Austria': 'EU', 'Hungary': 'EU', 'Bulgaria': 'EU',
    'Serbia': 'EU', 'Croatia': 'EU', 'Slovakia': 'EU', 'Slovenia': 'EU',
    'North Macedonia': 'EU', 'Bosnia and Herzegovina': 'EU', 'Montenegro': 'EU',
    'Greece': 'EU', 'Iceland': 'EU', 'Luxembourg': 'EU', 'Albania': 'EU',
    'Moldova': 'EU', 'South Africa': 'EU',

    // CIS
    'Russia': 'CIS', 'Ukraine': 'CIS', 'Kazakhstan': 'CIS', 'Belarus': 'CIS',
    'Uzbekistan': 'CIS', 'Kyrgyzstan': 'CIS', 'Latvia': 'CIS', 'Lithuania': 'CIS',
    'Estonia': 'CIS', 'Georgia': 'CIS', 'Azerbaijan': 'CIS', 'Armenia': 'CIS',
    'Tajikistan': 'CIS',

    // NA
    'United States': 'NA', 'Canada': 'NA', 'Mexico': 'NA',

    // BR (South/Central America)
    'Brazil': 'BR', 'Argentina': 'BR', 'Chile': 'BR', 'Uruguay': 'BR',
    'Colombia': 'BR', 'Venezuela': 'BR', 'Peru': 'BR', 'Bolivia': 'BR',
    'Paraguay': 'BR', 'Ecuador': 'BR',

    // OCE
    'Australia': 'OCE', 'New Zealand': 'OCE',

    // ASIA
    'China': 'ASIA', 'Mongolia': 'ASIA', 'Indonesia': 'ASIA', 'Philippines': 'ASIA',
    'South Korea': 'ASIA', 'Japan': 'ASIA', 'India': 'ASIA', 'Pakistan': 'ASIA',
    'Vietnam': 'ASIA', 'Thailand': 'ASIA', 'Malaysia': 'ASIA', 'Singapore': 'ASIA',
    'Hong Kong': 'ASIA', 'Taiwan': 'ASIA',

    // MENA
    'Turkey': 'MENA', 'Iran': 'MENA', 'Iraq': 'MENA', 'Lebanon': 'MENA',
    'Kosovo': 'MENA', 'Palestine': 'MENA', 'Israel': 'MENA', 'Jordan': 'MENA',
    'Saudi Arabia': 'MENA', 'United Arab Emirates': 'MENA', 'Egypt': 'MENA',
    'Morocco': 'MENA',
};

function getRegion(nationality) {
    return REGION_MAP[nationality] || 'EU';
}

// Data integrity floors. Kept in sync with scripts/validateData.mjs.
const MIN_COMPETITIVE_AGE = 16;
const MAX_COMPETITIVE_AGE = 50;
const MIN_ROSTER_SIZE = 5;
const MIN_FANBASE = 0;

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

// ============================================================
// TIER ASSIGNMENT (HLTV rank → PlayerTier)
// ============================================================
function getTier(rank) {
    const r = parseInt(rank) || 999;
    if (r <= 10) return 'ELITE';
    if (r <= 50) return 'PRO';
    if (r <= 150) return 'SEMI_PRO';
    return 'ACADEMY';
}

// ============================================================
// SALARY DEFAULTS (by tier)
// ============================================================
function getSalaryDefaults(tier) {
    switch (tier) {
        case 'ELITE': return { salary: 15000, years: 2 };
        case 'PRO': return { salary: 5000, years: 2 };
        case 'SEMI_PRO': return { salary: 1500, years: 2 };
        case 'ACADEMY': return { salary: 300, years: 3 };
        default: return { salary: 1500, years: 2 };
    }
}

// ============================================================
// STAT MAPPING (HLTV stats → game stats)
// ============================================================
function mapPlayerStats(json) {
    const s = json.stats || {};
    const rating = json.rating || 1.0;

    // Base Skill derived from Rating (0.5 - 1.5 range typically)
    let baseSkill = Math.min(99, Math.max(40, (rating - 0.5) * 80));

    // Normalize HLTV stats (sometimes they are missing or 0)
    const firepower = s.firepower || baseSkill;
    const entrying = s.entrying || 50;
    const trading = s.trading || 50;
    const opening = s.opening || 50;
    const clutching = s.clutching || 50;
    const sniping = s.sniping || 0;
    const utility = s.utility || 50;

    return {
        // Technical
        skill: Math.round(baseSkill),
        awp: Math.round(sniping),
        rifle: Math.round(Math.max(firepower, 90 - sniping)),
        pistol: Math.round(baseSkill * 0.9),
        grenades: Math.round(utility),
        creativity: Math.round((trading + clutching) / 2),
        clutch: Math.round(clutching),
        tactic: Math.round((utility + (rating * 50)) / 2),

        // Mental (Inferred)
        leader: 50,
        teamwork: Math.round((trading + utility) / 2),
        amicability: 70,
        productivity: 80,
        stressResistance: Math.round(clutching),
        loyalty: 80,

        // Physical (Inferred)
        reaction: Math.round((entrying + opening) / 2),
        eyesight: 85,
        health: 90,
        strength: 70,
        endurance: 80,

        // Potential
        potential: Math.min(99, Math.round(baseSkill + 10)),

        // Store raw HLTV stats for role detection
        _hltv: { firepower, entrying, trading, opening, clutching, sniping, utility }
    };
}

// ============================================================
// ROLE DETECTION (per team)
// ============================================================
function assignTeamRoles(playerDataArray) {
    if (playerDataArray.length === 0) return;

    const assigned = new Set();

    function pickBest(scoreFn) {
        let best = null, bestScore = -1, bestIdx = -1;
        for (let i = 0; i < playerDataArray.length; i++) {
            if (assigned.has(i)) continue;
            const score = scoreFn(playerDataArray[i]);
            if (score > bestScore) { bestScore = score; best = playerDataArray[i]; bestIdx = i; }
        }
        return { player: best, idx: bestIdx, score: bestScore };
    }

    // 1. AWPer: highest sniping (if any player has sniping >= 30)
    const awper = pickBest(p => p._hltv.sniping);
    if (awper.player && awper.score >= 30) {
        playerDataArray[awper.idx].role = 'AWPER';
        assigned.add(awper.idx);
    }

    // 2. IGL: highest utility + trading (the "brain")
    const igl = pickBest(p => p._hltv.utility + p._hltv.trading);
    if (igl.player) {
        playerDataArray[igl.idx].role = 'IGL';
        assigned.add(igl.idx);
    }

    // 3. Entry Fragger: highest entrying + opening
    const entry = pickBest(p => p._hltv.entrying + p._hltv.opening);
    if (entry.player) {
        playerDataArray[entry.idx].role = 'ENTRY_FRAGGER';
        assigned.add(entry.idx);
    }

    // 4. Support: highest utility among remaining
    const support = pickBest(p => p._hltv.utility);
    if (support.player) {
        playerDataArray[support.idx].role = 'SUPPORT';
        assigned.add(support.idx);
    }

    // 5. Rifler: everyone else
    for (let i = 0; i < playerDataArray.length; i++) {
        if (!assigned.has(i)) {
            playerDataArray[i].role = 'RIFLER';
        }
    }

    // ---- Role Boost Pass ----
    // Ensure stats meet role-reconciler thresholds so roles aren't overridden
    for (const p of playerDataArray) {
        switch (p.role) {
            case 'AWPER':
                p.awp = Math.max(p.awp, 75);
                break;
            case 'IGL':
                p.leader = Math.max(p.leader, 78);
                p.tactic = Math.max(p.tactic, 78);
                break;
            case 'ENTRY_FRAGGER':
                p.reaction = Math.max(p.reaction, 78);
                p.rifle = Math.max(p.rifle, 78);
                break;
            case 'SUPPORT':
                p.grenades = Math.max(p.grenades, 78);
                p.teamwork = Math.max(p.teamwork, 78);
                break;
        }
    }
}

// ============================================================
// MAIN
// ============================================================
function generateSnapshot() {
    console.log('='.repeat(60));
    console.log('  Generating Game Snapshot from Asset Files');
    console.log('='.repeat(60));

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Load existing teams to preserve properties
    let existingTeams = {};
    if (fs.existsSync(EXISTING_TEAMS_PATH)) {
        const existing = JSON.parse(fs.readFileSync(EXISTING_TEAMS_PATH, 'utf8'));
        for (const t of existing) {
            const key = t.name.toLowerCase().replace(/\s+/g, '');
            existingTeams[key] = t;
        }
        console.log(`Loaded ${existing.length} existing teams for property preservation.\n`);
    }

    const players = [];
    const teams = [];
    const sources = [];

    if (!fs.existsSync(ASSETS_DIR)) {
        console.error('Assets directory not found:', ASSETS_DIR);
        return;
    }

    const teamDirs = fs.readdirSync(ASSETS_DIR).filter(d => {
        const p = path.join(ASSETS_DIR, d);
        return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'team.json'));
    });

    console.log(`Found ${teamDirs.length} team directories with team.json\n`);

    for (const tDir of teamDirs) {
        const teamPath = path.join(ASSETS_DIR, tDir);
        const teamJsonPath = path.join(teamPath, 'team.json');
        const tData = JSON.parse(fs.readFileSync(teamJsonPath, 'utf8'));
        const rank = parseInt(tData.hltvRank) || 999;
        const tier = getTier(rank);
        const region = getRegion(tData.nationality || '');

        // Team ID
        const teamNameSlug = tData.name.replace(/\s+/g, '').toLowerCase();
        const teamId = `team_${rank}_${teamNameSlug}`;

        // Process players for this team
        const playersDir = path.join(teamPath, 'players');
        const teamPlayerData = [];
        const rosterIds = [];

        if (fs.existsSync(playersDir)) {
            const pFiles = fs.readdirSync(playersDir).filter(f => f.endsWith('.json'));

            for (const pFile of pFiles) {
                const pData = JSON.parse(fs.readFileSync(path.join(playersDir, pFile), 'utf8'));
                const pNameSlug = pData.name.replace(/\s+/g, '').toLowerCase();
                const pId = `player_${rank}_${tDir}_${pNameSlug}`;
                rosterIds.push(pId);

                // Map stats
                const stats = mapPlayerStats(pData);
                const salaryDefaults = getSalaryDefaults(tier);

                // Portrait path
                const portraitPath = `/assets/teams/${tDir}/players/${pFile.replace('.json', '.png')}`;

                // Age-based potential adjustment
                const age = clamp(pData.age || 22, MIN_COMPETITIVE_AGE, MAX_COMPETITIVE_AGE);
                let potential = stats.potential;
                if (age < 21) potential = Math.min(99, potential + 15);
                else if (age < 24) potential = Math.min(99, potential + 5);
                else if (age > 30) potential = Math.max(30, potential - 15);

                const playerEntry = {
                    id: pId,
                    name: pData.name,
                    nickname: pData.name,
                    age: age,
                    nationality: pData.country || 'Unknown',
                    portraitPath: portraitPath,
                    role: 'RIFLER', // Will be assigned by assignTeamRoles()
                    tier: tier,

                    skill: stats.skill,
                    awp: stats.awp,
                    rifle: stats.rifle,
                    pistol: stats.pistol,
                    grenades: stats.grenades,
                    creativity: stats.creativity,
                    clutch: stats.clutch,
                    tactic: stats.tactic,
                    leader: stats.leader,
                    teamwork: stats.teamwork,
                    amicability: stats.amicability,
                    productivity: stats.productivity,
                    stressResistance: stats.stressResistance,
                    loyalty: stats.loyalty,
                    reaction: stats.reaction,
                    eyesight: stats.eyesight,
                    health: stats.health,
                    strength: stats.strength,
                    endurance: stats.endurance,
                    potential: potential,

                    defaultSalary: salaryDefaults.salary,
                    defaultContractYears: salaryDefaults.years,

                    hltvHistory: pData.hltvHistory || [],
                    matchesPlayed: pData.matchesPlayed || 0,
                    majorWins: 0,
                    totalMVPs: 0,

                    // Internal: for role detection
                    _hltv: stats._hltv,
                };

                teamPlayerData.push(playerEntry);

                sources.push({
                    playerId: pId,
                    source: "HLTV.org",
                    retrievedAt: new Date().toISOString(),
                    license: "Public Data",
                    modifications: ["Mapped stats to game format"]
                });
            }
        }

        // Assign roles based on stats
        assignTeamRoles(teamPlayerData);

        // Clean up internal fields and push to players array
        for (const p of teamPlayerData) {
            delete p._hltv;
            players.push(p);
        }

        // Look up existing team properties
        const existingKey = tData.name.toLowerCase().replace(/\s+/g, '');
        const existing = existingTeams[existingKey];

        // Build short name
        const shortName = tData.name.length <= 5
            ? tData.name.toUpperCase()
            : tData.name.replace(/[^A-Z0-9]/gi, '').substring(0, 4).toUpperCase();

        const fanbase = existing ? existing.fanbase : Math.max(500, 10000 - rank * 40);

        teams.push({
            id: teamId,
            name: tData.name,
            shortName: shortName || tData.name.substring(0, 4).toUpperCase(),
            tier: tier,
            region: region,
            logoPath: `/assets/teams/${tDir}/logo.png`,
            rosterIds: rosterIds,
            reputation: Math.max(5, Math.round(100 - rank * 0.4)),
            fanbase: Math.max(MIN_FANBASE, fanbase),
            facilitiesLevel: existing ? existing.facilitiesLevel : 1,
            startingBudget: existing ? existing.startingBudget : 500000,
        });
    }

    // Sort teams by rank
    teams.sort((a, b) => {
        const rankA = parseInt(a.id.split('_')[1]) || 999;
        const rankB = parseInt(b.id.split('_')[1]) || 999;
        return rankA - rankB;
    });

    // Deduplicate teams by name (keep highest-ranked, i.e. first after sort)
    const seenTeamNames = new Set();
    const removedDupPlayerIds = new Set();
    const teamsBeforeDedup = teams.length;
    const dedupedTeams = [];
    for (const t of teams) {
        const nameKey = t.name.toLowerCase().trim();
        if (seenTeamNames.has(nameKey)) {
            // Mark this duplicate's players for removal
            for (const pid of t.rosterIds) removedDupPlayerIds.add(pid);
            continue;
        }
        seenTeamNames.add(nameKey);
        dedupedTeams.push(t);
    }
    if (teamsBeforeDedup !== dedupedTeams.length) {
        console.log(`Deduplication: removed ${teamsBeforeDedup - dedupedTeams.length} duplicate team(s), ${removedDupPlayerIds.size} duplicate player(s)`);
    }
    teams.length = 0;
    teams.push(...dedupedTeams);

    // Remove duplicate players
    const playersBeforeDedup = players.length;
    const dedupedPlayers = players.filter(p => !removedDupPlayerIds.has(p.id));
    players.length = 0;
    players.push(...dedupedPlayers);
    if (playersBeforeDedup !== players.length) {
        console.log(`Removed ${playersBeforeDedup - players.length} players from duplicate teams`);
    }

    // Validate: no duplicate player IDs
    const seenPlayerIds = new Set();
    let dupCount = 0;
    for (const p of players) {
        if (seenPlayerIds.has(p.id)) {
            console.error(`  ERROR: Duplicate player ID "${p.id}" (player: ${p.name})`);
            dupCount++;
        }
        seenPlayerIds.add(p.id);
    }
    if (dupCount > 0) {
        console.error(`\n  FATAL: ${dupCount} duplicate player ID(s) found. Fix asset data before proceeding.`);
        process.exit(1);
    }

    // Filter: only teams ranked 1-200 are active (compete in game)
    // Teams 201+ are inactive — their players stay in players.json as free agents
    // Also drop teams with too few players to field a CS2 lineup.
    const ACTIVE_RANK_CUTOFF = 200;
    const activeTeams = teams.filter(t => {
        const rank = parseInt(t.id.split('_')[1]) || 999;
        if (rank > ACTIVE_RANK_CUTOFF) return false;
        if (t.rosterIds.length < MIN_ROSTER_SIZE) {
            console.log(`  Dropping ${t.id} (${t.name}): ${t.rosterIds.length} players, need ≥ ${MIN_ROSTER_SIZE}`);
            return false;
        }
        return true;
    });
    const inactiveTeams = teams.filter(t => {
        const rank = parseInt(t.id.split('_')[1]) || 999;
        return rank > ACTIVE_RANK_CUTOFF;
    });

    // Count free agents (players from inactive teams, not on any active roster)
    const activeRosterIds = new Set(activeTeams.flatMap(t => t.rosterIds));
    const freeAgentCount = players.filter(p => !activeRosterIds.has(p.id)).length;

    // Write output: activeTeams only to teams.json, ALL players to players.json
    fs.writeFileSync(path.join(OUTPUT_DIR, 'players.json'), JSON.stringify(players, null, 2));
    fs.writeFileSync(path.join(OUTPUT_DIR, 'teams.json'), JSON.stringify(activeTeams, null, 2));
    fs.writeFileSync(path.join(OUTPUT_DIR, 'sources.json'), JSON.stringify(sources, null, 2));

    // Don't overwrite tournaments if it has real data
    const tournPath = path.join(OUTPUT_DIR, 'tournaments.json');
    if (!fs.existsSync(tournPath) || fs.readFileSync(tournPath, 'utf8').length < 200) {
        const tournaments = [{
            id: "tourn_major_01", name: "Global Championship", tier: "S_TIER",
            format: "LEAGUE", prizePool: 1000000, minTeamTier: "PRO",
            maxTeams: 16, startWeek: 4, durationWeeks: 4,
            recurring: true, frequencyWeeks: 24
        }];
        fs.writeFileSync(tournPath, JSON.stringify(tournaments, null, 2));
        console.log('  (Created default tournaments.json)');
    } else {
        console.log('  (Kept existing tournaments.json)');
    }

    // Summary stats
    const tierCounts = {}, regionCounts = {}, roleCounts = {};
    for (const t of activeTeams) tierCounts[t.tier] = (tierCounts[t.tier] || 0) + 1;
    for (const t of activeTeams) regionCounts[t.region] = (regionCounts[t.region] || 0) + 1;
    for (const p of players) roleCounts[p.role] = (roleCounts[p.role] || 0) + 1;

    const preservedCount = activeTeams.filter(t => {
        const key = t.name.toLowerCase().replace(/\s+/g, '');
        return !!existingTeams[key];
    }).length;

    console.log('\n' + '='.repeat(60));
    console.log('  SNAPSHOT GENERATED');
    console.log('='.repeat(60));
    console.log(`  Active Teams (rank 1-${ACTIVE_RANK_CUTOFF}): ${activeTeams.length}`);
    console.log(`  Inactive Teams (rank ${ACTIVE_RANK_CUTOFF + 1}+): ${inactiveTeams.length}`);
    console.log(`  Total Players: ${players.length}`);
    console.log(`  Free Agents:   ${freeAgentCount}`);
    console.log(`  Sources: ${sources.length}`);
    console.log(`\n  Existing teams preserved: ${preservedCount}`);
    console.log(`  New teams added: ${activeTeams.length - preservedCount}`);
    console.log(`\n  Tiers:   ${JSON.stringify(tierCounts)}`);
    console.log(`  Regions: ${JSON.stringify(regionCounts)}`);
    console.log(`  Roles:   ${JSON.stringify(roleCounts)}`);
    console.log(`\n  Output: ${OUTPUT_DIR}`);
    console.log('='.repeat(60));
}

generateSnapshot();
