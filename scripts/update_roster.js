const fs = require('fs');
const path = require('path');

const teamsPath = path.join(__dirname, '../public/data/snapshot/teams.json');
const playersPath = path.join(__dirname, '../public/data/snapshot/players.json');

const teams = JSON.parse(fs.readFileSync(teamsPath, 'utf8'));
const players = JSON.parse(fs.readFileSync(playersPath, 'utf8'));

console.log(`Loaded ${teams.length} teams and ${players.length} players.`);

// 1. Remove 9BOOMPRO
const boomIndex = teams.findIndex(t => t.name.toUpperCase() === '9BOOMPRO');
let boomId = null;
if (boomIndex !== -1) {
    boomId = teams[boomIndex].id;
    console.log(`Found 9BOOMPRO (ID: ${boomId}). Removing team...`);
    teams.splice(boomIndex, 1);
} else {
    console.log("9BOOMPRO not found.");
}

// 2. Free Agent 9BOOMPRO Players
if (boomId) {
    let count = 0;
    players.forEach(p => {
        if (p.teamId === boomId) {
            p.teamId = null;
            count++;
        }
    });
    console.log(`Released ${count} players from 9BOOMPRO.`);
}

// Helper to release player
function releasePlayer(nickname) {
    const player = players.find(p => p.nickname.toLowerCase() === nickname.toLowerCase());
    if (!player) {
        console.log(`Player ${nickname} not found.`);
        return;
    }

    if (player.teamId) {
        // Remove from Team Roster
        const team = teams.find(t => t.id === player.teamId);
        if (team) {
            if (team.rosterIds) {
                const idx = team.rosterIds.indexOf(player.id);
                if (idx !== -1) {
                    team.rosterIds.splice(idx, 1);
                    console.log(`Removed ${nickname} from team ${team.name} roster.`);
                }
            }
        }
        player.teamId = null;
        console.log(`${nickname} is now a free agent.`);
    } else {
        console.log(`${nickname} is already a free agent.`);
    }
}

// 3. Release d4rty
releasePlayer('d4rty');

// 4. Release gejmzilla
releasePlayer('gejmzilla');

// Save
fs.writeFileSync(teamsPath, JSON.stringify(teams, null, 2));
fs.writeFileSync(playersPath, JSON.stringify(players, null, 2));
console.log("Saved updates.");
