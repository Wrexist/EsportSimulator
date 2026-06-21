#!/usr/bin/env node
/**
 * Packaging guard: refuse to build a release without a real Steam App ID.
 *
 * steam_appid.txt is gitignored (it holds the live App ID), so a build machine
 * that forgot to provision it would silently fall back to the Spacewar test app
 * (480) — achievements, stats, leaderboards and cloud saves would all bind to
 * the wrong app and the build would "work" in QA, hiding the misconfig.
 * Wired into `dist` / `electron:build` so packaging fails loudly instead.
 */
const fs = require("fs")
const path = require("path")

const SPACEWAR_APP_ID = "480"
const file = path.join(process.cwd(), "steam_appid.txt")

function fail(msg) {
    console.error(`\n[steam-appid] FATAL: ${msg}\n`)
    process.exit(1)
}

if (!fs.existsSync(file)) {
    fail(
        "steam_appid.txt is missing.\n" +
        "  Provision it on the build machine with your real Steam App ID before packaging.\n" +
        "  Without it, Steam features bind to the Spacewar test app (480)."
    )
}

const id = fs.readFileSync(file, "utf8").trim()

if (!/^\d+$/.test(id)) {
    fail(`steam_appid.txt must contain a numeric App ID (got "${id}").`)
}
if (id === SPACEWAR_APP_ID) {
    fail(
        "steam_appid.txt still contains the Spacewar test App ID (480).\n" +
        "  Replace it with your real Steam App ID before packaging a release."
    )
}

console.log(`[steam-appid] OK — packaging for App ID ${id}`)
