#!/usr/bin/env node
/**
 * Pre-upload ship guard.
 *
 * Steam review 2026-07 rejected BuildID 23989573 because the uploaded depot
 * contained no `EsportsManager.exe` — it was the raw portable `SteamBuild/`
 * tree (source + node_modules), so Steam auto-detected the first executable it
 * could find, `game\node_modules\7zip-bin\win\arm64\7za.exe`, and the launch
 * option pointed at an exe that wasn't there.
 *
 * The correct ship artifact is the electron-builder output
 * `dist/win-unpacked/`, which contains a real `EsportsManager.exe`. This script
 * validates the artifact that is about to be uploaded and FAILS LOUDLY before
 * steamcmd runs if anything about it would repeat that rejection:
 *
 *   1. `EsportsManager.exe` exists at the content root.
 *   2. No stray executables (7za.exe, node.exe, elevate.exe, …) that Steam
 *      might pick instead of the real launcher live in the depot.
 *   3. Warns if the deprecated portable `SteamBuild/` tree is present, since it
 *      must never be the thing uploaded.
 *
 * Cross-platform, zero-dependency; safe to run in CI or on the build machine.
 * Exit code 0 = ship, non-zero = do not upload.
 */

const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..")
// Default to the electron-builder unpacked dir (matches app_build_4326170.vdf
// contentroot). Override with `node scripts/verify-ship-build.js <dir>`.
const CONTENT_ROOT = path.resolve(ROOT, process.argv[2] || "dist/win-unpacked")
const LAUNCH_EXE = "EsportsManager.exe"

// Executables that must NOT sit in the depot — these are the ones Steam's
// auto-detect has picked before, or would obviously be wrong to launch.
const FORBIDDEN_EXES = new Set([
    "7za.exe",
    "7z.exe",
    "node.exe",
    "elevate.exe",
    "steamcmd.exe",
])

const red = s => `\x1b[31m${s}\x1b[0m`
const green = s => `\x1b[32m${s}\x1b[0m`
const yellow = s => `\x1b[33m${s}\x1b[0m`

// Collect every .exe under `dir`. `unreadable` accumulates directories that
// couldn't be read — the caller MUST fail the verification if it is non-empty,
// otherwise an incomplete scan could authorize an upload it never inspected.
function walkExes(dir, acc = [], unreadable = []) {
    let entries
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (err) {
        unreadable.push(`${dir} (${err.code || err.message})`)
        return acc
    }
    for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) walkExes(full, acc, unreadable)
        else if (e.name.toLowerCase().endsWith(".exe")) acc.push(full)
    }
    return acc
}

function main() {
    const errors = []
    const warnings = []

    console.log("=== Ship Build Verification ===")
    console.log(`Content root: ${CONTENT_ROOT}`)

    if (!fs.existsSync(CONTENT_ROOT)) {
        errors.push(
            `Content root does not exist: ${CONTENT_ROOT}\n` +
            `      Run \`npm run dist\` first to produce the electron-builder output.`
        )
        report(errors, warnings)
        return
    }

    // 1. Launch executable must be at the content root AND be a real file
    //    (existsSync alone also passes for a directory named EsportsManager.exe).
    const launchPath = path.join(CONTENT_ROOT, LAUNCH_EXE)
    let launchIsFile = false
    try {
        launchIsFile = fs.statSync(launchPath).isFile()
    } catch {
        launchIsFile = false
    }
    if (launchIsFile) {
        console.log(green(`  ok  ${LAUNCH_EXE} present at depot root`))
    } else {
        errors.push(
            `${LAUNCH_EXE} not found as a regular file at the content root.\n` +
            `      The Steam launch option is configured to run "${LAUNCH_EXE}", so it MUST\n` +
            `      exist here. You are probably about to upload the wrong folder\n` +
            `      (portable SteamBuild/ instead of dist/win-unpacked/).`
        )
    }

    // 2. Inspect every executable in the depot. Fail on the known-bad ones
    //    (these got BuildID 23989573 rejected); warn loudly on anything that
    //    isn't the validated root launcher so a new helper/updater exe can't
    //    slip through unnoticed and be auto-selected by Steam.
    const unreadable = []
    const allExes = walkExes(CONTENT_ROOT, [], unreadable)
    if (unreadable.length > 0) {
        errors.push(
            `Could not read ${unreadable.length} director(y/ies) — the scan is incomplete,\n` +
            `      so the depot cannot be certified safe to upload:\n` +
            unreadable.map(d => `        - ${d}`).join("\n")
        )
    }
    const allowedExe = path.resolve(launchPath).toLowerCase()
    const forbidden = []
    const unexpected = []
    for (const p of allExes) {
        if (path.resolve(p).toLowerCase() === allowedExe) continue
        if (FORBIDDEN_EXES.has(path.basename(p).toLowerCase())) forbidden.push(p)
        else unexpected.push(p)
    }
    if (forbidden.length > 0) {
        errors.push(
            `Found ${forbidden.length} stray executable(s) Steam could launch by mistake:\n` +
            forbidden.map(p => `        - ${path.relative(CONTENT_ROOT, p)}`).join("\n") +
            `\n      This is exactly what got BuildID 23989573 rejected (7za.exe). The depot\n` +
            `      should be the packaged app, not a raw node_modules tree.`
        )
    }
    if (unexpected.length > 0) {
        warnings.push(
            `${unexpected.length} executable(s) other than ${LAUNCH_EXE} are in the depot.\n` +
            `      Verify none of these can be auto-selected as the launcher by Steam:\n` +
            unexpected.map(p => `        - ${path.relative(CONTENT_ROOT, p)}`).join("\n")
        )
    }
    if (forbidden.length === 0 && unexpected.length === 0) {
        console.log(green(`  ok  no stray executables (${allExes.length} .exe total, all expected)`))
    }

    // 3. The deprecated portable build must not be what's being shipped.
    //    Use path.relative for containment so a sibling like SteamBuild-backup
    //    isn't mistaken for being inside SteamBuild/.
    const steamBuild = path.join(ROOT, "SteamBuild")
    if (fs.existsSync(steamBuild)) {
        const rel = path.relative(path.resolve(steamBuild), path.resolve(CONTENT_ROOT))
        const insideSteamBuild = rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))
        if (insideSteamBuild) {
            errors.push(
                `Content root is inside the deprecated portable SteamBuild/ tree.\n` +
                `      Ship dist/win-unpacked/ (electron-builder) instead — see HOW_TO_BUILD_AND_SHIP.md.`
            )
        } else {
            warnings.push(
                `A stale portable SteamBuild/ folder exists but is not being shipped (good).\n` +
                `      Consider deleting it so it can never be uploaded by accident.`
            )
        }
    }

    report(errors, warnings)
}

function report(errors, warnings) {
    for (const w of warnings) console.log(yellow(`  !!  ${w}`))
    if (errors.length === 0) {
        console.log(green("\nPASS: ship build looks correct. Safe to upload to Steam."))
        process.exit(0)
    }
    console.log(red(`\nFAIL: ${errors.length} blocker(s) — do NOT upload:`))
    for (const e of errors) console.log(red(`  ✗  ${e}`))
    process.exit(1)
}

main()
