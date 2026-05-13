const fs = require('fs');
const path = require('path');

const teamsPath = path.join(__dirname, '../public/data/snapshot/teams.json');
const playersPath = path.join(__dirname, '../public/data/snapshot/players.json');

const teams = JSON.parse(fs.readFileSync(teamsPath, 'utf8'));
const players = JSON.parse(fs.readFileSync(playersPath, 'utf8'));

console.log("Teams Schema:", Object.keys(teams[0]));
console.log("Players Schema:", Object.keys(players[0]));

const boom = teams.find(t => t.name.toLowerCase().includes('boom'));
console.log("Found 9BOOMPRO:", boom);

const d4rty = players.find(p => p.nickname && p.nickname.toLowerCase() === 'd4rty');
console.log("Found d4rty:", d4rty);

const gejm = players.find(p => p.nickname && p.nickname.toLowerCase() === 'gejmzilla'); // check spelling
console.log("Found gejmzilla:", gejm);
