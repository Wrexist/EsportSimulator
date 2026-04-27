#!/usr/bin/env tsx
/**
 * Delete legacy asset files/folders whose paths embed real-world trademarks
 * and that are no longer referenced by the sanitized snapshot.
 *
 * Inputs:
 *   - public/data/snapshot/{teams,players,tournaments}.json
 *   - data/tournaments.json
 *   - config/steam-compliance-policy.json (trademark keyword list)
 *
 * For each file under public/assets/teams/ and public/assets/tournaments/,
 * remove it if BOTH:
 *   1. its path contains a trademark keyword from the policy, AND
 *   2. its path is NOT referenced by any logoPath/portraitPath/trophyPath
 *      in the shipped JSON.
 *
 * Empty directories left behind are pruned at the end.
 *
 * Usage:
 *   npx tsx scripts/cleanup-legacy-assets.ts [--dry-run]
 */

import fs from "node:fs"
import path from "node:path"

const REPO_ROOT = process.cwd()
const DRY_RUN = process.argv.includes("--dry-run")

const POLICY_PATH = path.join(REPO_ROOT, "config", "steam-compliance-policy.json")
const SNAPSHOT_DIR = path.join(REPO_ROOT, "public", "data", "snapshot")
const RUNTIME_TOURN = path.join(REPO_ROOT, "data", "tournaments.json")
const ASSET_ROOTS = [
    path.join(REPO_ROOT, "public", "assets", "teams"),
    path.join(REPO_ROOT, "public", "assets", "tournaments"),
]

type AnyObj = Record<string, unknown>

function readJson<T>(p: string): T {
    return JSON.parse(fs.readFileSync(p, "utf8"))
}

function collectReferencedAssets(): Set<string> {
    const refs = new Set<string>()
    const sources = [
        path.join(SNAPSHOT_DIR, "teams.json"),
        path.join(SNAPSHOT_DIR, "players.json"),
        path.join(SNAPSHOT_DIR, "tournaments.json"),
        RUNTIME_TOURN,
    ]
    for (const src of sources) {
        if (!fs.existsSync(src)) continue
        const data = readJson<AnyObj[] | AnyObj>(src)
        const arr = Array.isArray(data) ? data : [data]
        for (const item of arr) {
            for (const key of ["logoPath", "portraitPath", "trophyPath"]) {
                const v = (item as AnyObj)[key]
                if (typeof v === "string" && v.startsWith("/assets/")) {
                    // Normalise: drop leading slash, store as repo-relative
                    refs.add(path.join("public", v.replace(/^\//, "")))
                }
            }
        }
    }
    return refs
}

function walkFiles(root: string): string[] {
    const out: string[] = []
    if (!fs.existsSync(root)) return out
    const stack: string[] = [root]
    while (stack.length) {
        const dir = stack.pop()!
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, entry.name)
            if (entry.isDirectory()) stack.push(p)
            else if (entry.isFile()) out.push(p)
        }
    }
    return out
}

function pathContainsKeyword(rel: string, keywords: string[]): string | null {
    const lower = rel.toLowerCase()
    for (const k of keywords) {
        const re = new RegExp(`(^|[^a-z0-9])${k.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}([^a-z0-9]|$)`, "i")
        if (re.test(lower)) return k
    }
    return null
}

function pruneEmptyDirs(root: string): number {
    if (!fs.existsSync(root)) return 0
    let removed = 0
    const entries = fs.readdirSync(root, { withFileTypes: true })
    for (const e of entries) {
        if (e.isDirectory()) removed += pruneEmptyDirs(path.join(root, e.name))
    }
    if (root !== ASSET_ROOTS[0] && root !== ASSET_ROOTS[1]) {
        const remaining = fs.readdirSync(root)
        if (remaining.length === 0) {
            if (!DRY_RUN) fs.rmdirSync(root)
            removed++
        }
    }
    return removed
}

function main(): void {
    if (!fs.existsSync(POLICY_PATH)) {
        console.error(`Missing policy: ${POLICY_PATH}`)
        process.exit(1)
    }
    const policy = readJson<{ trademarkKeywords: string[] }>(POLICY_PATH)
    const keywords = policy.trademarkKeywords
    console.log(`Loaded ${keywords.length} trademark keywords from policy`)

    const referenced = collectReferencedAssets()
    console.log(`Referenced asset paths: ${referenced.size}`)

    let totalScanned = 0
    let totalFlagged = 0
    let totalProtected = 0
    let totalDeleted = 0
    const deletedSamples: string[] = []
    const protectedSamples: string[] = []

    for (const root of ASSET_ROOTS) {
        const files = walkFiles(root)
        for (const f of files) {
            totalScanned++
            const rel = path.relative(REPO_ROOT, f)
            const kw = pathContainsKeyword(rel, keywords)
            if (!kw) continue
            totalFlagged++
            if (referenced.has(rel)) {
                totalProtected++
                if (protectedSamples.length < 10) protectedSamples.push(`${rel} (kw=${kw})`)
                continue
            }
            totalDeleted++
            if (deletedSamples.length < 10) deletedSamples.push(`${rel} (kw=${kw})`)
            if (!DRY_RUN) fs.unlinkSync(f)
        }
    }

    let prunedDirs = 0
    if (!DRY_RUN) {
        for (const root of ASSET_ROOTS) prunedDirs += pruneEmptyDirs(root)
    }

    console.log("")
    console.log("=== Cleanup Summary ===")
    console.log(`Scanned files:              ${totalScanned}`)
    console.log(`Flagged with trademark kw:  ${totalFlagged}`)
    console.log(`Protected (still in JSON):  ${totalProtected}`)
    console.log(`Deleted (orphan + flagged): ${totalDeleted}`)
    console.log(`Empty dirs pruned:          ${prunedDirs}`)
    if (DRY_RUN) console.log("(DRY RUN — nothing was actually deleted)")
    console.log("")
    if (deletedSamples.length) {
        console.log("Deleted samples:")
        for (const s of deletedSamples) console.log(`  - ${s}`)
    }
    if (protectedSamples.length) {
        console.log("Protected (referenced) samples — review these manually:")
        for (const s of protectedSamples) console.log(`  - ${s}`)
    }
}

main()
