#!/usr/bin/env tsx
/**
 * Build a Steam-Workshop-ready "real data" mod from the local raw-data.
 *
 * The shipped game ships fully fictional (premium generated names + procedural
 * crests + AI portraits) so it carries no real-world IP. This tool packages the
 * REAL scraped teams/logos/players/portraits sitting in raw-data/ into a mod
 * OVERLAY that a player can install (or that you can upload to the Steam
 * Workshop) to get real names + logos + faces on their own copy — the same
 * legally-clean "real-name fix" model Football Manager mods use.
 *
 * The overlay is keyed on the SHIPPED ids, so every team/player keeps its
 * simulation stats, roster links, tier and colours — only the display name,
 * nickname, logo and portrait become real. Merge happens by id at new-career
 * time (engine/mod-loader.ts → mergeSnapshot).
 *
 * Output (git-ignored — it contains real IP; never commit or ship it):
 *   dist-mod/<name>/
 *     manifest.json
 *     teams.json
 *     players.json
 *     assets/teams/<slug>/logo.<ext>
 *     assets/teams/<slug>/players/<nick>.<ext>
 *
 * Usage:
 *   npx tsx scripts/build-mod.ts [--name=real-teams-2026] [--author="You"] [--dry-run]
 */

import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=")
const MOD_NAME = arg("name") || "real-teams-2026"
// MOD_NAME becomes a directory that gets recursively deleted (fs.rm below), so a
// value like "../public" must never escape dist-mod. Require a plain slug.
if (!/^[a-z0-9][a-z0-9_-]*$/i.test(MOD_NAME)) {
    console.error(`[build-mod] --name must be a slug (letters, numbers, "_" or "-"); got "${MOD_NAME}"`)
    process.exit(1)
}
const AUTHOR = arg("author") || ""
const STAMP = arg("date") || "" // pass an ISO date for reproducible manifests; else omitted
const DRY = process.argv.includes("--dry-run")
const MOD_ROOT = path.join(ROOT, "dist-mod")
const OUT = path.join(MOD_ROOT, MOD_NAME)
// Defence in depth: even a slug-shaped name must resolve inside dist-mod.
if (OUT !== MOD_ROOT && !OUT.startsWith(MOD_ROOT + path.sep)) {
    console.error(`[build-mod] refusing to write outside dist-mod: "${OUT}"`)
    process.exit(1)
}

const IMAGE_EXTS = [".png", ".webp", ".jpg", ".jpeg"]

function readJSON<T = any>(rel: string): T {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"))
}

// Cache directory listings so we can match "<base>.<ext>" case-insensitively
// without stat-ing every candidate for 1300+ players.
const dirCache = new Map<string, string[]>()
function listDir(dir: string): string[] {
    if (!dirCache.has(dir)) {
        dirCache.set(dir, fs.existsSync(dir) ? fs.readdirSync(dir) : [])
    }
    return dirCache.get(dir)!
}
/** Find "<base>.<img-ext>" in dir, case-insensitive. Returns filename or null. */
function findImage(dir: string, base: string): string | null {
    const lb = base.toLowerCase()
    for (const f of listDir(dir)) {
        const ext = path.extname(f).toLowerCase()
        if (IMAGE_EXTS.includes(ext) && f.slice(0, f.length - ext.length).toLowerCase() === lb) {
            return f
        }
    }
    return null
}

function copyInto(srcAbs: string, relDest: string): void {
    if (DRY) return
    const dest = path.join(OUT, relDest)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(srcAbs, dest)
}

function main(): void {
    const rawTeams = readJSON<any[]>("raw-data/snapshot/teams.json")
    const rawPlayers = readJSON<any[]>("raw-data/snapshot/players.json")
    const shpTeams = readJSON<any[]>("public/data/snapshot/teams.json")
    const shpPlayers = readJSON<any[]>("public/data/snapshot/players.json")

    if (rawPlayers.length !== shpPlayers.length) {
        console.error(
            `Player count mismatch (raw ${rawPlayers.length} vs shipped ${shpPlayers.length}). ` +
            `This tool relies on index alignment produced by the sanitize pipeline.`,
        )
        process.exit(1)
    }

    // raw team slug (from its logoPath) -> real display name/short.
    const slugMeta = new Map<string, { name: string; shortName?: string }>()
    for (const t of rawTeams) {
        const slug = String(t.logoPath || "").match(/teams\/([^/]+)\//)?.[1]
        if (slug) slugMeta.set(slug, { name: t.name, shortName: t.shortName })
    }

    // shipped player id -> index (== raw player index).
    const idxById = new Map<string, number>()
    shpPlayers.forEach((p, i) => idxById.set(p.id, i))

    if (!DRY) {
        fs.rmSync(OUT, { recursive: true, force: true })
        fs.mkdirSync(OUT, { recursive: true })
    }

    // --- players overlay: real name/nick/portrait onto shipped id+stats ---
    let copiedPortraits = 0, missingPortraits = 0
    const playersOut = shpPlayers.map((sp, i) => {
        const rp = rawPlayers[i]
        let portraitPath = ""
        const m = String(rp.portraitPath || "").match(/teams\/([^/]+)\/players\/([^/.]+)/)
        if (m) {
            const [, slug, nick] = m
            const srcDir = path.join(ROOT, "raw-data", "teams", slug, "players")
            const file = findImage(srcDir, nick)
            if (file) {
                const rel = `assets/teams/${slug}/players/${file}`
                copyInto(path.join(srcDir, file), rel)
                portraitPath = rel
                copiedPortraits++
            } else {
                missingPortraits++
            }
        }
        return { ...sp, name: rp.name, nickname: rp.nickname, portraitPath }
    })

    // --- teams overlay: real name/logo onto shipped id+stats ---
    let copiedLogos = 0, missingLogos = 0
    const teamsOut = shpTeams.map(st => {
        // Resolve the raw team slug via any roster player's raw counterpart.
        let slug: string | null = null
        for (const rid of (st.rosterIds || [])) {
            const i = idxById.get(rid)
            if (i == null) continue
            const mm = String(rawPlayers[i].portraitPath || "").match(/teams\/([^/]+)\/players\//)
            if (mm) { slug = mm[1]; break }
        }
        let name = st.name, shortName = st.shortName, logoPath = ""
        if (slug) {
            const meta = slugMeta.get(slug)
            if (meta) { name = meta.name; if (meta.shortName) shortName = meta.shortName }
            const teamDir = path.join(ROOT, "raw-data", "teams", slug)
            const file = findImage(teamDir, "logo")
            if (file) {
                const rel = `assets/teams/${slug}/${file}`
                copyInto(path.join(teamDir, file), rel)
                logoPath = rel
                copiedLogos++
            } else {
                missingLogos++
            }
        }
        return { ...st, name, shortName, logoPath }
    })

    const manifest: Record<string, unknown> = {
        name: MOD_NAME,
        title: "Real Teams & Players",
        author: AUTHOR,
        version: "1.0.0",
        game: "Esports Manager",
        schema: 1,
        note: "Community real-data overlay. Replaces generated names/logos/portraits with real ones by id. Not affiliated with any real organization or player.",
        teams: teamsOut.length,
        players: playersOut.length,
        ...(STAMP ? { createdAt: STAMP } : {}),
    }

    if (!DRY) {
        fs.writeFileSync(path.join(OUT, "teams.json"), JSON.stringify(teamsOut, null, 2))
        fs.writeFileSync(path.join(OUT, "players.json"), JSON.stringify(playersOut, null, 2))
        fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2))
    }

    console.log("=".repeat(58))
    console.log(`  Build mod: ${MOD_NAME}${DRY ? "  (DRY RUN)" : ""}`)
    console.log("=".repeat(58))
    console.log(`  Teams:      ${teamsOut.length}  (logos ${copiedLogos} copied, ${missingLogos} missing)`)
    console.log(`  Players:    ${playersOut.length}  (portraits ${copiedPortraits} copied, ${missingPortraits} missing)`)
    console.log(`  Output:     ${path.relative(ROOT, OUT)}${DRY ? " (not written)" : ""}`)
    console.log("")
    console.log("  Sample name remaps:")
    for (const t of teamsOut.slice(0, 6)) {
        const orig = shpTeams.find(s => s.id === t.id)
        console.log(`    ${String(orig?.name).padEnd(22)} ->  ${t.name}`)
    }
}

main()
