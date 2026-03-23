const fs = require('fs');
const path = require('path');

const TEAMS_PATH = path.join(process.cwd(), 'public', 'data', 'snapshot', 'teams.json');
const PLAYERS_PATH = path.join(process.cwd(), 'public', 'data', 'snapshot', 'players.json');

function run() {
    console.log('Loading data...');
    let teams = JSON.parse(fs.readFileSync(TEAMS_PATH, 'utf8'));
    let players = JSON.parse(fs.readFileSync(PLAYERS_PATH, 'utf8'));

    // Helper to find team by fuzzy name
    const findTeam = (name) => teams.find(t => t.name.toLowerCase().includes(name.toLowerCase()));
    // Helper to find player by nickname
    const findPlayer = (nick) => players.find(p => p.nickname.toLowerCase() === nick.toLowerCase());

    let changes = [];

    // 1. Remove 9BOOMPRO and release players
    const team9boom = findTeam('9BOOMPRO');
    if (team9boom) {
        console.log(`Found 9BOOMPRO (id: ${team9boom.id}). Releasing ${team9boom.rosterIds.length} players...`);
        // Update players
        team9boom.rosterIds.forEach(pid => {
            const p = players.find(pl => pl.id === pid);
            if (p) {
                p.teamId = null;
                changes.push(`Released ${p.nickname} from 9BOOMPRO`);
            }
        });
        // Remove team
        teams = teams.filter(t => t.id !== team9boom.id);
        changes.push('Deleted team 9BOOMPRO');
    } else {
        console.log('⚠ Team 9BOOMPRO not found');
    }

    // 2. Remove Wildcard Academy and release players
    const teamWildcardAcad = findTeam('Wildcard Academy');
    if (teamWildcardAcad) {
        console.log(`Found Wildcard Academy (id: ${teamWildcardAcad.id}). Releasing ${teamWildcardAcad.rosterIds.length} players...`);
        // Update players
        teamWildcardAcad.rosterIds.forEach(pid => {
            const p = players.find(pl => pl.id === pid);
            if (p) {
                p.teamId = null;
                changes.push(`Released ${p.nickname} from Wildcard Academy`);
            }
        });
        // Remove team
        teams = teams.filter(t => t.id !== teamWildcardAcad.id);
        changes.push('Deleted team Wildcard Academy');
    } else {
        console.log('⚠ Team Wildcard Academy not found');
    }

    // 3. Remove d4rty from BOSS
    const teamBoss = findTeam('BOSS');
    if (teamBoss) {
        const d4rtyIdx = teamBoss.rosterIds.findIndex(id => {
            const p = players.find(pl => pl.id === id);
            return p && p.nickname.toLowerCase() === 'd4rty';
        });

        if (d4rtyIdx !== -1) {
            const playerId = teamBoss.rosterIds[d4rtyIdx];
            teamBoss.rosterIds.splice(d4rtyIdx, 1);

            const player = players.find(p => p.id === playerId);
            if (player) {
                player.teamId = null;
                changes.push('Released d4rty from BOSS');
            }
        } else {
            console.log('⚠ Player d4rty not found in BOSS');
        }
    } else {
        console.log('⚠ Team BOSS not found');
    }

    // 4. Remove gejmzilla from MANA
    const teamMana = findTeam('MANA');
    if (teamMana) {
        const gejmzillaIdx = teamMana.rosterIds.findIndex(id => {
            const p = players.find(pl => pl.id === id);
            return p && p.nickname.toLowerCase() === 'gejmzilla';
        });

        if (gejmzillaIdx !== -1) {
            const playerId = teamMana.rosterIds[gejmzillaIdx];
            teamMana.rosterIds.splice(gejmzillaIdx, 1);

            const player = players.find(p => p.id === playerId);
            if (player) {
                player.teamId = null;
                changes.push('Released gejmzilla from MANA');
            }
        } else {
            console.log('⚠ Player gejmzilla not found in MANA');
        }
    } else {
        console.log('⚠ Team MANA not found');
    }

    // Save changes
    if (changes.length > 0) {
        fs.writeFileSync(TEAMS_PATH, JSON.stringify(teams, null, 2));
        fs.writeFileSync(PLAYERS_PATH, JSON.stringify(players, null, 2));
        console.log('\nSUCCESS! changes applied:');
        changes.forEach(c => console.log(` - ${c}`));
    } else {
        console.log('\nNo changes needed.');
    }
}

run();
