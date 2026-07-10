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

function walkExes(dir, acc = []) {
    let entries
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
        return acc
    }
    for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) walkExes(full, acc)
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

    // 1. Launch executable must be at the content root.
    const launchPath = path.join(CONTENT_ROOT, LAUNCH_EXE)
    if (fs.existsSync(launchPath)) {
        console.log(green(`  ok  ${LAUNCH_EXE} present at depot root`))
    } else {
        errors.push(
            `${LAUNCH_EXE} not found at the content root.\n` +
            `      The Steam launch option is configured to run "${LAUNCH_EXE}", so it MUST\n` +
            `      exist here. You are probably about to upload the wrong folder\n` +
            `      (portable SteamBuild/ instead of dist/win-unpacked/).`
        )
    }

    // 2. No forbidden executables anywhere in the depot.
    const allExes = walkExes(CONTENT_ROOT)
    const stray = allExes.filter(p => FORBIDDEN_EXES.has(path.basename(p).toLowerCase()))
    if (stray.length > 0) {
        errors.push(
            `Found ${stray.length} stray executable(s) Steam could launch by mistake:\n` +
            stray.map(p => `        - ${path.relative(CONTENT_ROOT, p)}`).join("\n") +
            `\n      This is exactly what got BuildID 23989573 rejected (7za.exe). The depot\n` +
            `      should be the packaged app, not a raw node_modules tree.`
        )
    } else {
        console.log(green(`  ok  no stray executables (${allExes.length} .exe total, all expected)`))
    }

    // 3. The deprecated portable build must not be what's being shipped.
    const steamBuild = path.join(ROOT, "SteamBuild")
    if (fs.existsSync(steamBuild) && path.resolve(CONTENT_ROOT).startsWith(path.resolve(steamBuild))) {
        errors.push(
            `Content root is inside the deprecated portable SteamBuild/ tree.\n` +
            `      Ship dist/win-unpacked/ (electron-builder) instead — see HOW_TO_BUILD_AND_SHIP.md.`
        )
    } else if (fs.existsSync(steamBuild)) {
        warnings.push(
            `A stale portable SteamBuild/ folder exists but is not being shipped (good).\n` +
            `      Consider deleting it so it can never be uploaded by accident.`
        )
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
