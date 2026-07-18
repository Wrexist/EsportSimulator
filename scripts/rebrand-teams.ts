#!/usr/bin/env tsx
/**
 * Rebrand shipped team display names to premium, original esports brands.
 *
 * Rewrites ONLY `name` / `shortName` (and `branding.logoStyle`) in
 * public/data/snapshot/teams.json. Ids, logoPaths, rosterIds, colours and
 * every other field are left untouched — players link to teams by id, and the
 * live <TeamEmblem> is seeded on the stable team id, so renaming is safe and
 * self-contained (no player/tournament/source records reference team names).
 *
 * Deterministic: each team's brand is seeded on its id, with a salted re-roll
 * on collision so no two teams share a name.
 *
 * Usage:  npx tsx scripts/rebrand-teams.ts [--dry-run]
 */

import fs from "node:fs"
import path from "node:path"

import { premiumTeamName } from "../lib/safe-branding/name-transform"

const DRY_RUN = process.argv.includes("--dry-run")
const TEAMS_PATH = path.join(process.cwd(), "public", "data", "snapshot", "teams.json")

interface Team {
    id: string
    name: string
    shortName?: string
    branding?: { logoStyle?: string;[k: string]: unknown }
    [k: string]: unknown
}

/** First unused 2-3 char tag derived from a brand name; deterministic. */
function pickUniqueTag(name: string, preferred: string, used: Set<string>): string {
    const words = name.replace(/[^A-Za-z0-9\s]/g, "").split(/\s+/)
        .filter(w => w && w.toLowerCase() !== "team")
    const w = (words[0] || name).toUpperCase()
    const mid = w[Math.floor(w.length / 2)] || w[1] || ""
    const last = w[w.length - 1] || ""
    const candidates = [
        preferred,
        w.slice(0, 3),
        w[0] + mid + last,          // e.g. WARHOWL -> WHL
        w[0] + w[1] + last,         // WARHOWL -> WRL
        w[0] + mid,                 // WA... -> WH
        w.slice(0, 2),
    ].filter(t => t && t.length >= 2 && t.length <= 3)
    for (const c of candidates) {
        if (!used.has(c)) return c
    }
    // Exhausted: append a digit (rare; still <=3 chars where possible).
    for (let d = 2; d < 10; d++) {
        const t = (w.slice(0, 2) + d)
        if (!used.has(t)) return t
    }
    return preferred
}

function main(): void {
    if (!fs.existsSync(TEAMS_PATH)) {
        console.error(`Not found: ${TEAMS_PATH}`)
        process.exit(1)
    }

    const teams = JSON.parse(fs.readFileSync(TEAMS_PATH, "utf8")) as Team[]
    const usedNames = new Set<string>()
    const usedTags = new Set<string>()
    const sample: Array<[string, string, string]> = []

    for (const team of teams) {
        const seed = team.id || team.name
        let salt = 0
        let brand = premiumTeamName(seed, salt)
        // Re-roll until the name is unique across the league.
        while (usedNames.has(brand.name.toLowerCase()) && salt < 50) {
            salt++
            brand = premiumTeamName(seed, salt)
        }
        usedNames.add(brand.name.toLowerCase())

        // Keep tags unique (emblems render them). Try clean 2-3 char candidates
        // derived from the name before giving up — never emit a 4th padding
        // char, which reads badly in the crest.
        const tag = pickUniqueTag(brand.name, brand.tag, usedTags)
        usedTags.add(tag)

        const before = team.name
        team.name = brand.name
        team.shortName = tag
        if (team.branding && typeof team.branding === "object") {
            team.branding.logoStyle = brand.logoStyle
        }
        if (sample.length < 16) sample.push([before, brand.name, tag])
    }

    console.log("=".repeat(56))
    console.log(`  Rebrand teams  (${teams.length} teams)`)
    console.log("=".repeat(56))
    for (const [before, after, tag] of sample) {
        console.log(`  ${before.padEnd(22)} ->  ${after.padEnd(26)} [${tag}]`)
    }
    console.log(`  ... and ${teams.length - sample.length} more`)
    console.log(`  Unique names: ${usedNames.size}/${teams.length}`)

    if (DRY_RUN) {
        console.log("\n(DRY RUN — teams.json not written)")
        return
    }
    fs.writeFileSync(TEAMS_PATH, JSON.stringify(teams, null, 2))
    console.log(`\nWrote ${path.relative(process.cwd(), TEAMS_PATH)}`)
}

main()
