#!/usr/bin/env tsx
/**
 * Sanitize-snapshot pipeline.
 *
 * Reads a raw snapshot (real-world teams, players, tournaments) and writes a
 * sanitized, ship-ready copy to:
 *   - public/data/snapshot/{players,teams,tournaments,sources}.json
 *   - public/assets/teams/<safe_slug>/logo.svg
 *   - public/assets/teams/<safe_slug>/players/<safe_nick>.svg
 *
 * Inputs (first-found, in order):
 *   1. RAW_SNAPSHOT_DIR env override
 *   2. /raw-data/snapshot/  (post-migration location)
 *   3. /public/data/snapshot/  (pre-migration)
 *
 * Idempotent. Deterministic. Does NOT mutate the input snapshot files.
 *
 * Usage:
 *   npx tsx scripts/sanitize-snapshot.ts [--dry-run]
 */

import fs from "node:fs"
import path from "node:path"

import {
    safeTeamName,
    safeTournamentName,
    safeDescription,
    safeSlug,
    safeNickSlug,
    transformNickname,
} from "@/lib/safe-branding/name-transform"
import { renderLogoSVG } from "@/lib/safe-branding/logo-generator"
import { renderPortraitSVG } from "@/lib/safe-branding/portrait-generator"

// ============================================================
// CONFIG
// ============================================================

const REPO_ROOT = process.cwd()
const DRY_RUN = process.argv.includes("--dry-run")

const RAW_SNAPSHOT_DIR =
    process.env.RAW_SNAPSHOT_DIR ||
    (fs.existsSync(path.join(REPO_ROOT, "raw-data", "snapshot"))
        ? path.join(REPO_ROOT, "raw-data", "snapshot")
        : path.join(REPO_ROOT, "public", "data", "snapshot"))

const OUT_SNAPSHOT_DIR = path.join(REPO_ROOT, "public", "data", "snapshot")
const OUT_ASSETS_DIR = path.join(REPO_ROOT, "public", "assets", "teams")
const OUT_TOURN_LOGO_DIR = path.join(REPO_ROOT, "public", "assets", "tournaments")
const DATA_TOURN_PATH = path.join(REPO_ROOT, "data", "tournaments.json")

// ============================================================
// HELPERS
// ============================================================

type AnyObj = Record<string, any>

function readJson<T = AnyObj>(p: string): T {
    return JSON.parse(fs.readFileSync(p, "utf8"))
}

function writeJson(p: string, data: unknown): void {
    if (DRY_RUN) return
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, JSON.stringify(data, null, 2))
}

function writeFile(p: string, content: string): void {
    if (DRY_RUN) return
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, content)
}

function shortNameFor(name: string): string {
    if (!name) return "TM"
    if (name.length <= 5) return name.toUpperCase()
    const clean = name.replace(/[^A-Za-z0-9]/g, "")
    return clean.slice(0, 4).toUpperCase() || "TM"
}

function tournamentSlug(name: string): string {
    return safeTournamentName(name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        || "event"
}

function sanitizeTournament(t: AnyObj): AnyObj {
    const safeName = safeTournamentName(t.name || "")
    const safeShort = typeof t.shortName === "string" ? safeTournamentName(t.shortName) : t.shortName
    const safeDesc = typeof t.description === "string" ? safeDescription(t.description) : t.description
    const slug = tournamentSlug(t.id || safeName)

    // Procedural logo: reuse team logo-generator with a tournament-seeded id.
    // Output goes to /public/assets/tournaments/logo_<slug>.svg and we rewrite
    // logoPath to match. Trophy paths stay as-is (they aren't trademarked).
    const logoSvg = renderLogoSVG(`tournament_${slug}`, safeName || slug)
    writeFile(path.join(OUT_TOURN_LOGO_DIR, `logo_${slug}.svg`), logoSvg)

    return {
        ...t,
        name: safeName,
        shortName: safeShort,
        description: safeDesc,
        logoPath: `/assets/tournaments/logo_${slug}.svg`,
    }
}

// ============================================================
// MAIN
// ============================================================

function main(): void {
    console.log("=".repeat(60))
    console.log("  Sanitize Snapshot")
    console.log("=".repeat(60))
    console.log(`Input:  ${path.relative(REPO_ROOT, RAW_SNAPSHOT_DIR)}`)
    console.log(`Output: ${path.relative(REPO_ROOT, OUT_SNAPSHOT_DIR)}`)
    if (DRY_RUN) console.log("(DRY RUN — no files will be written)")
    console.log("")

    const playersPath = path.join(RAW_SNAPSHOT_DIR, "players.json")
    const teamsPath = path.join(RAW_SNAPSHOT_DIR, "teams.json")
    const tournamentsPath = path.join(RAW_SNAPSHOT_DIR, "tournaments.json")
    const sourcesPath = path.join(RAW_SNAPSHOT_DIR, "sources.json")

    if (!fs.existsSync(playersPath) || !fs.existsSync(teamsPath)) {
        console.error(`Missing input: players.json or teams.json at ${RAW_SNAPSHOT_DIR}`)
        process.exit(1)
    }

    const playersIn = readJson<AnyObj[]>(playersPath)
    const teamsIn = readJson<AnyObj[]>(teamsPath)
    const tournamentsIn = fs.existsSync(tournamentsPath) ? readJson<AnyObj[]>(tournamentsPath) : []

    // --- Build team remaps first (old slug/id → new) ---
    const teamSlugRemap = new Map<string, string>()
    const teamIdRemap = new Map<string, string>()
    const teamNameRemap = new Map<string, string>()

    for (const t of teamsIn) {
        const oldSlugMatch = typeof t.logoPath === "string"
            ? t.logoPath.match(/\/teams\/([^\/]+)\//)
            : null
        const oldSlug = oldSlugMatch?.[1] ||
            (t.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_")
        const newName = safeTeamName(t.name || "")
        const newSlug = safeSlug(t.name || "")
        teamSlugRemap.set(oldSlug, newSlug)
        teamNameRemap.set(t.name, newName)

        // Team id format is `team_<rank>_<slug>` — preserve rank for ordering.
        const idParts = (t.id || "").split("_")
        let newId: string = t.id
        if (idParts.length >= 3 && idParts[0] === "team") {
            newId = `team_${idParts[1]}_${newSlug.replace(/_/g, "")}`
        }
        teamIdRemap.set(t.id, newId)
    }

    // --- Teams pass: write logos, build output records ---
    const teamsOut = teamsIn.map(t => {
        const newName = teamNameRemap.get(t.name) || safeTeamName(t.name || "")
        const newSlug = safeSlug(t.name || "")
        const newId = teamIdRemap.get(t.id) || t.id

        const logoSvg = renderLogoSVG(newId, newName)
        writeFile(path.join(OUT_ASSETS_DIR, newSlug, "logo.svg"), logoSvg)

        return {
            ...t,
            id: newId,
            name: newName,
            shortName: shortNameFor(newName),
            logoPath: `/assets/teams/${newSlug}/logo.svg`,
            description: typeof t.description === "string" ? safeDescription(t.description) : t.description,
            rosterIds: Array.isArray(t.rosterIds) ? [...t.rosterIds] : [],
        }
    })

    // --- Players pass: write portraits, remap ids, rewrite portrait paths ---
    const playerIdRemap = new Map<string, string>()
    const playersOut = playersIn.map(p => {
        const oldNick = p.nickname || p.name || ""
        const newNick = transformNickname(oldNick)
        const idParts = (p.id || "").split("_")
        let newId: string = p.id
        let newTeamDir = "unknown"
        if (idParts.length >= 4 && idParts[0] === "player") {
            const rank = idParts[1]
            const oldTeamDir = idParts[2]
            newTeamDir = teamSlugRemap.get(oldTeamDir) || safeSlug(oldTeamDir)
            newId = `player_${rank}_${newTeamDir}_${safeNickSlug(oldNick)}`
        } else {
            // Fall back: parse portraitPath if present.
            const m = typeof p.portraitPath === "string"
                ? p.portraitPath.match(/\/teams\/([^\/]+)\/players\//)
                : null
            if (m) newTeamDir = teamSlugRemap.get(m[1]) || safeSlug(m[1])
        }
        playerIdRemap.set(p.id, newId)

        const portraitFile = `${safeNickSlug(oldNick)}.svg`
        const portraitPath = `/assets/teams/${newTeamDir}/players/${portraitFile}`
        const portraitSvg = renderPortraitSVG(newId, newNick)
        writeFile(
            path.join(OUT_ASSETS_DIR, newTeamDir, "players", portraitFile),
            portraitSvg
        )

        return {
            ...p,
            id: newId,
            name: newNick,
            nickname: newNick,
            portraitPath,
        }
    })

    // --- Patch team rosters with remapped player ids ---
    for (const t of teamsOut) {
        t.rosterIds = t.rosterIds.map((oid: string) => playerIdRemap.get(oid) || oid)
    }

    // --- Tournaments pass (snapshot) ---
    const tournamentsOut = tournamentsIn.map(t => sanitizeTournament(t))

    // --- Write snapshot JSON ---
    writeJson(path.join(OUT_SNAPSHOT_DIR, "teams.json"), teamsOut)
    writeJson(path.join(OUT_SNAPSHOT_DIR, "players.json"), playersOut)
    writeJson(path.join(OUT_SNAPSHOT_DIR, "tournaments.json"), tournamentsOut)

    // --- Runtime tournament calendar (data/tournaments.json) ---
    // This is a separate file from the snapshot. Same shape (mostly), different
    // consumer. Rewrite it in place.
    if (fs.existsSync(DATA_TOURN_PATH)) {
        const rtIn = readJson<AnyObj[]>(DATA_TOURN_PATH)
        const rtOut = rtIn.map(t => sanitizeTournament(t))
        writeJson(DATA_TOURN_PATH, rtOut)
        console.log(`Rewrote runtime calendar: ${path.relative(REPO_ROOT, DATA_TOURN_PATH)} (${rtOut.length} tournaments)`)
    }

    // --- Sources: rewrite to scrubbed equivalents ---
    if (fs.existsSync(sourcesPath)) {
        const sourcesIn = readJson<AnyObj[]>(sourcesPath)
        const sourcesOut = sourcesIn
            .filter(s => playerIdRemap.has(s.playerId))
            .map(s => ({
                ...s,
                playerId: playerIdRemap.get(s.playerId),
                source: "Procedural (sanitized)",
                sourceUrl: undefined,
                license: "Generated",
                modifications: ["Sanitized identifiers", "Procedural portrait"],
            }))
        writeJson(path.join(OUT_SNAPSHOT_DIR, "sources.json"), sourcesOut)
    }

    console.log("")
    console.log(`Teams:         ${teamsOut.length}`)
    console.log(`Players:       ${playersOut.length}`)
    console.log(`Tournaments:   ${tournamentsOut.length}`)
    console.log(`Logos SVG:     ${teamsOut.length}`)
    console.log(`Portraits SVG: ${playersOut.length}`)
    console.log("Done.")
}

main()
