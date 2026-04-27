#!/usr/bin/env node
/**
 * Data integrity validator.
 *
 * Loads the shipped game datasets (players, teams, tournaments, map pool,
 * runtime tournament calendar) and checks for:
 *   1. Missing required fields
 *   2. Stat / numeric values outside valid ranges
 *   3. Orphan references across datasets
 *   4. Duplicate IDs
 *   5. Every team has enough players to field a CS2 lineup (5)
 *
 * Exits with code 1 if any issue is found.
 *
 * Usage:
 *   node scripts/validateData.mjs
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, "..")

const SNAPSHOT_DIR = path.join(REPO_ROOT, "public", "data", "snapshot")
const RUNTIME_CALENDAR_PATH = path.join(REPO_ROOT, "data", "tournaments.json")
const MAP_POOL_PATH = path.join(REPO_ROOT, "data", "map-pool.ts")

// ---------- Schema constants ----------

const MIN_COMPETITIVE_AGE = 16
const MAX_COMPETITIVE_AGE = 50
const CS2_TEAM_SIZE = 5

const VALID_PLAYER_ROLES = new Set([
    "AWPER", "RIFLER", "IGL", "SUPPORT", "ENTRY_FRAGGER",
])
const VALID_PLAYER_TIERS = new Set(["ELITE", "PRO", "SEMI_PRO", "ACADEMY"])
const VALID_TEAM_TIERS = VALID_PLAYER_TIERS
const VALID_TEAM_REGIONS = new Set([
    "EU", "NA", "BR", "SA", "CIS", "ASIA", "OCE", "OCEANIA", "MENA", "INTERNATIONAL",
])
const VALID_TOURNAMENT_TIERS = new Set([
    "S_TIER", "A_TIER", "B_TIER", "C_TIER", "QUALIFIER",
])
const VALID_TOURNAMENT_FORMATS = new Set([
    "bracket", "league", "swiss", "double_elim", "gsl",
])
const VALID_TOURNAMENT_REGIONS = new Set([
    "INTERNATIONAL", "EU", "NA", "SA", "BR", "ASIA", "CIS", "OCEANIA", "OCE", "MENA",
])
const VALID_MAP_IDS = new Set([
    "Dust2", "Mirage", "Inferno", "Nuke", "Overpass", "Vertigo", "Ancient", "Anubis",
])

const PLAYER_STAT_FIELDS = [
    "skill", "awp", "rifle", "pistol", "grenades", "creativity", "clutch", "tactic",
    "leader", "teamwork", "amicability", "productivity", "stressResistance", "loyalty",
    "reaction", "eyesight", "health", "strength", "endurance", "potential",
]
const PLAYER_REQUIRED = [
    "id", "name", "nickname", "age", "nationality", "portraitPath", "role", "tier",
    ...PLAYER_STAT_FIELDS,
    "defaultSalary", "defaultContractYears",
]
const TEAM_REQUIRED = [
    "id", "name", "shortName", "tier", "region", "logoPath", "rosterIds",
    "reputation", "fanbase", "facilitiesLevel", "startingBudget",
]
const TOURNAMENT_REQUIRED = [
    "id", "name", "shortName", "tier", "region", "format",
    "prizePool", "startWeek", "duration",
]

// ---------- Issue collector ----------

class Issues {
    constructor() { this.byCategory = new Map() }
    add(category, message) {
        if (!this.byCategory.has(category)) this.byCategory.set(category, [])
        this.byCategory.get(category).push(message)
    }
    count() {
        let n = 0
        for (const list of this.byCategory.values()) n += list.length
        return n
    }
    report() {
        if (this.count() === 0) {
            console.log("\n✔ All checks passed.")
            return
        }
        console.log("")
        for (const [category, messages] of this.byCategory) {
            console.log(`\n✖ ${category} (${messages.length})`)
            const preview = messages.slice(0, 10)
            for (const m of preview) console.log(`  - ${m}`)
            if (messages.length > preview.length) {
                console.log(`  … and ${messages.length - preview.length} more`)
            }
        }
        console.log(`\nTotal issues: ${this.count()}`)
    }
}

// ---------- Loaders ----------

function readJson(p) {
    return JSON.parse(fs.readFileSync(p, "utf8"))
}

function readMapPool() {
    const src = fs.readFileSync(MAP_POOL_PATH, "utf8")
    const match = src.match(/ACTIVE_MAP_POOL:\s*MapId\[\]\s*=\s*\[([\s\S]*?)\]/)
    if (!match) throw new Error("Could not parse ACTIVE_MAP_POOL from map-pool.ts")
    return [...match[1].matchAll(/MapId\.(\w+)/g)].map(m => m[1])
}

// ---------- Field helpers ----------

function isNumber(v) { return typeof v === "number" && Number.isFinite(v) }
function isNonEmptyString(v) { return typeof v === "string" && v.length > 0 }

function checkRequired(issues, category, record, fields, label) {
    for (const f of fields) {
        if (record[f] === undefined || record[f] === null) {
            issues.add(category, `${label}: missing "${f}"`)
        }
    }
}

function checkRange(issues, category, record, field, min, max, label) {
    const v = record[field]
    if (!isNumber(v)) {
        issues.add(category, `${label}: ${field} not a number (${JSON.stringify(v)})`)
        return
    }
    if (v < min || v > max) {
        issues.add(category, `${label}: ${field}=${v} out of range [${min}, ${max}]`)
    }
}

// ---------- Validators ----------

function validatePlayers(players, issues) {
    const ids = new Set()
    for (const p of players) {
        const label = `player ${p.id ?? "<no id>"}`

        checkRequired(issues, "Missing fields (players)", p, PLAYER_REQUIRED, label)

        if (isNonEmptyString(p.id)) {
            if (ids.has(p.id)) issues.add("Duplicate IDs (players)", `${p.id}`)
            ids.add(p.id)
        }

        if (isNonEmptyString(p.role) && !VALID_PLAYER_ROLES.has(p.role)) {
            issues.add("Invalid enum values (players)", `${label}: role="${p.role}"`)
        }
        if (isNonEmptyString(p.tier) && !VALID_PLAYER_TIERS.has(p.tier)) {
            issues.add("Invalid enum values (players)", `${label}: tier="${p.tier}"`)
        }

        checkRange(issues, "Out-of-range stats (players)", p, "age", MIN_COMPETITIVE_AGE, MAX_COMPETITIVE_AGE, label)
        for (const f of PLAYER_STAT_FIELDS) {
            checkRange(issues, "Out-of-range stats (players)", p, f, 0, 100, label)
        }
        if (isNumber(p.defaultSalary) && p.defaultSalary < 0) {
            issues.add("Out-of-range stats (players)", `${label}: defaultSalary=${p.defaultSalary} negative`)
        }
        if (isNumber(p.defaultContractYears) && (p.defaultContractYears < 1 || p.defaultContractYears > 10)) {
            issues.add("Out-of-range stats (players)", `${label}: defaultContractYears=${p.defaultContractYears} out of range [1, 10]`)
        }
    }
    return ids
}

function validateTeams(teams, playerIds, issues) {
    const ids = new Set()
    const playerUses = new Map()
    for (const t of teams) {
        const label = `team ${t.id ?? "<no id>"}`

        checkRequired(issues, "Missing fields (teams)", t, TEAM_REQUIRED, label)

        if (isNonEmptyString(t.id)) {
            if (ids.has(t.id)) issues.add("Duplicate IDs (teams)", `${t.id}`)
            ids.add(t.id)
        }

        if (isNonEmptyString(t.tier) && !VALID_TEAM_TIERS.has(t.tier)) {
            issues.add("Invalid enum values (teams)", `${label}: tier="${t.tier}"`)
        }
        if (isNonEmptyString(t.region) && !VALID_TEAM_REGIONS.has(t.region)) {
            issues.add("Invalid enum values (teams)", `${label}: region="${t.region}"`)
        }

        checkRange(issues, "Out-of-range stats (teams)", t, "reputation", 0, 100, label)
        if (isNumber(t.fanbase) && t.fanbase < 0) {
            issues.add("Out-of-range stats (teams)", `${label}: fanbase=${t.fanbase} negative`)
        }
        if (isNumber(t.facilitiesLevel) && t.facilitiesLevel < 1) {
            issues.add("Out-of-range stats (teams)", `${label}: facilitiesLevel=${t.facilitiesLevel} < 1`)
        }
        if (isNumber(t.startingBudget) && t.startingBudget < 0) {
            issues.add("Out-of-range stats (teams)", `${label}: startingBudget=${t.startingBudget} negative`)
        }

        if (Array.isArray(t.rosterIds)) {
            if (t.rosterIds.length < CS2_TEAM_SIZE) {
                issues.add("Roster size (teams)", `${label}: has ${t.rosterIds.length} players (need ≥ ${CS2_TEAM_SIZE})`)
            }
            for (const pid of t.rosterIds) {
                if (!playerIds.has(pid)) {
                    issues.add("Orphan roster references", `${label}: player "${pid}" not found`)
                }
                if (!playerUses.has(pid)) playerUses.set(pid, [])
                playerUses.get(pid).push(t.id)
            }
        }
    }
    for (const [pid, teamList] of playerUses) {
        if (teamList.length > 1) {
            issues.add("Player on multiple teams", `${pid} appears on: ${teamList.join(", ")}`)
        }
    }
    return ids
}

function validateTournaments(tournaments, label, issues) {
    const ids = new Set()
    for (const t of tournaments) {
        const prefix = `${label} ${t.id ?? "<no id>"}`

        checkRequired(issues, `Missing fields (${label})`, t, TOURNAMENT_REQUIRED, prefix)

        if (isNonEmptyString(t.id)) {
            if (ids.has(t.id)) issues.add(`Duplicate IDs (${label})`, `${t.id}`)
            ids.add(t.id)
        }

        if (isNonEmptyString(t.tier) && !VALID_TOURNAMENT_TIERS.has(t.tier)) {
            issues.add(`Invalid enum values (${label})`, `${prefix}: tier="${t.tier}"`)
        }
        if (isNonEmptyString(t.format) && !VALID_TOURNAMENT_FORMATS.has(t.format)) {
            issues.add(`Invalid enum values (${label})`, `${prefix}: format="${t.format}"`)
        }
        if (isNonEmptyString(t.region) && !VALID_TOURNAMENT_REGIONS.has(t.region)) {
            issues.add(`Invalid enum values (${label})`, `${prefix}: region="${t.region}"`)
        }

        if (isNumber(t.prizePool) && t.prizePool < 0) {
            issues.add(`Out-of-range values (${label})`, `${prefix}: prizePool=${t.prizePool} negative`)
        }
        if (isNumber(t.startWeek) && (t.startWeek < 1 || t.startWeek > 52)) {
            issues.add(`Out-of-range values (${label})`, `${prefix}: startWeek=${t.startWeek} out of [1, 52]`)
        }
        if (isNumber(t.duration) && t.duration < 1) {
            issues.add(`Out-of-range values (${label})`, `${prefix}: duration=${t.duration} < 1`)
        }
        if (isNumber(t.slots) && t.slots < 1) {
            issues.add(`Out-of-range values (${label})`, `${prefix}: slots=${t.slots} < 1`)
        }
    }
    // Orphan qualifierFor references
    for (const t of tournaments) {
        if (t.qualifierFor && !ids.has(t.qualifierFor)) {
            issues.add(`Orphan qualifierFor references (${label})`, `${t.id} → "${t.qualifierFor}" (not found)`)
        }
    }
    return ids
}

function validateSources(sources, playerIds, issues) {
    for (const s of sources) {
        if (!s.playerId) {
            issues.add("Missing fields (sources)", `source missing playerId`)
            continue
        }
        if (!playerIds.has(s.playerId)) {
            issues.add("Orphan source references", `source references unknown player "${s.playerId}"`)
        }
    }
}

function validateMapPool(mapPool, issues) {
    if (!Array.isArray(mapPool) || mapPool.length === 0) {
        issues.add("Map pool", "ACTIVE_MAP_POOL is empty")
        return
    }
    const seen = new Set()
    for (const m of mapPool) {
        const mapName = (() => {
            // entries come through as enum keys ("MIRAGE"); resolve to MapId value
            const entries = {
                DUST2: "Dust2", MIRAGE: "Mirage", INFERNO: "Inferno", NUKE: "Nuke",
                OVERPASS: "Overpass", VERTIGO: "Vertigo", ANCIENT: "Ancient", ANUBIS: "Anubis",
            }
            return entries[m] ?? m
        })()
        if (!VALID_MAP_IDS.has(mapName)) {
            issues.add("Map pool", `unknown map "${m}"`)
        }
        if (seen.has(mapName)) {
            issues.add("Map pool", `duplicate map "${m}"`)
        }
        seen.add(mapName)
    }
}

// ---------- Main ----------

function main() {
    const issues = new Issues()

    const playersPath = path.join(SNAPSHOT_DIR, "players.json")
    const teamsPath = path.join(SNAPSHOT_DIR, "teams.json")
    const tournamentsPath = path.join(SNAPSHOT_DIR, "tournaments.json")
    const sourcesPath = path.join(SNAPSHOT_DIR, "sources.json")

    for (const p of [playersPath, teamsPath, tournamentsPath, sourcesPath]) {
        if (!fs.existsSync(p)) {
            console.error(`Missing dataset file: ${p}`)
            process.exit(2)
        }
    }

    const players = readJson(playersPath)
    const teams = readJson(teamsPath)
    const tournaments = readJson(tournamentsPath)
    const sources = readJson(sourcesPath)
    const mapPool = readMapPool()

    console.log("Loaded datasets:")
    console.log(`  players:      ${players.length}`)
    console.log(`  teams:        ${teams.length}`)
    console.log(`  tournaments:  ${tournaments.length}  (snapshot)`)
    console.log(`  sources:      ${sources.length}`)
    console.log(`  map pool:     ${mapPool.length}`)

    const playerIds = validatePlayers(players, issues)
    validateTeams(teams, playerIds, issues)
    validateTournaments(tournaments, "tournaments", issues)
    validateSources(sources, playerIds, issues)
    validateMapPool(mapPool, issues)

    if (fs.existsSync(RUNTIME_CALENDAR_PATH)) {
        const runtime = readJson(RUNTIME_CALENDAR_PATH)
        console.log(`  calendar:     ${runtime.length}  (data/tournaments.json)`)
        validateTournaments(runtime, "calendar", issues)
    }

    issues.report()
    if (issues.count() > 0) process.exit(1)
}

main()
