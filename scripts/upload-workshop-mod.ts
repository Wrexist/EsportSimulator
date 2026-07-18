#!/usr/bin/env tsx
/**
 * Upload (or update) a Steam Workshop item from a built mod folder.
 *
 * Uses steamworks.js (createItem / updateItem). steamworks.js ships NAPI
 * prebuilds and auto-pumps callbacks after init(), so this runs as a plain
 * Node/tsx script — no Electron needed.
 *
 * REQUIREMENTS (on YOUR machine — this cannot run in CI/headless):
 *   1. The Steam client is running and logged in.
 *   2. steam_appid.txt exists with your real App ID (or pass --appid=NNN), and
 *      your account owns that app.
 *   3. Steam Workshop is enabled for the app in the Steamworks partner site
 *      (App Admin → Workshop).
 *   4. You've built the mod:  npm run build:mod
 *
 * FIRST upload (creates a new Workshop item):
 *   npm run workshop:upload -- --title="Real Teams & Players 2026" \
 *     --description="Real names, logos and portraits. Community overlay." \
 *     --preview=preview.png
 *
 *   → prints the new item id. SAVE IT.
 *
 * UPDATE the same item later (re-use the id):
 *   npm run workshop:upload -- --item=123456789 --changenote="Roster update"
 *
 * Flags:
 *   --content=<dir>       mod folder (default dist-mod/real-teams-2026)
 *   --item=<id>           update an existing item instead of creating one
 *   --title / --description / --changenote
 *   --preview=<png|jpg>   thumbnail (Steam requires one; <=1MB, ~512x512)
 *   --tags=a,b,c          Workshop tags (default: real-data,roster)
 *   --visibility=public|friends|private   (default public)
 *   --appid=<n>           override steam_appid.txt
 */

import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const ROOT = process.cwd()
const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=")

const CONTENT = path.resolve(ROOT, arg("content") || "dist-mod/real-teams-2026")
const ITEM = arg("item")
const TITLE = arg("title") || "Real Teams & Players"
const DESCRIPTION = arg("description") ||
    "Community real-data overlay: real team names, logos and player portraits. " +
    "Not affiliated with, or endorsed by, any real organization or player."
const CHANGENOTE = arg("changenote") || "Update"
const PREVIEW = arg("preview") ? path.resolve(ROOT, arg("preview")!) : ""
const TAGS = (arg("tags") || "real-data,roster").split(",").map(s => s.trim()).filter(Boolean)
const VIS = (arg("visibility") || "public").toLowerCase()

function fail(msg: string): never {
    console.error(`\n[workshop-upload] ERROR: ${msg}\n`)
    process.exit(1)
}

// parseInt("123abc") === 123, so a malformed value could upload against the
// wrong app. Require the WHOLE trimmed value to be a positive integer.
function parseAppId(value: string, source: string): number {
    if (!/^[1-9]\d*$/.test(value.trim())) fail(`${source} is not a valid App ID (got "${value}")`)
    return Number(value.trim())
}

function resolveAppId(): number {
    const override = arg("appid")
    if (override) return parseAppId(override, "--appid")
    const p = path.join(ROOT, "steam_appid.txt")
    if (!fs.existsSync(p)) fail("steam_appid.txt missing and no --appid=NNN given. Provision your real Steam App ID first.")
    const id = parseAppId(fs.readFileSync(p, "utf8").trim(), "steam_appid.txt")
    if (id === 480) fail("steam_appid.txt is the Spacewar test id (480). Set your real App ID.")
    return id
}

const VISIBILITY: Record<string, number> = { public: 0, friends: 1, private: 2, unlisted: 3 }

async function main(): Promise<void> {
    if (!fs.existsSync(CONTENT) || !fs.statSync(CONTENT).isDirectory()) {
        fail(`content folder not found: ${CONTENT}. Run 'npm run build:mod' first.`)
    }
    if (!fs.existsSync(path.join(CONTENT, "manifest.json"))) {
        fail(`no manifest.json in ${CONTENT} — is this a built mod folder?`)
    }
    if (PREVIEW && !fs.existsSync(PREVIEW)) fail(`--preview file not found: ${PREVIEW}`)
    if (!PREVIEW) {
        console.warn("[workshop-upload] WARNING: no --preview given. Steam Workshop items need a thumbnail; " +
            "add one via --preview=preview.png or set it on the item page afterward.")
    }
    if (!(VIS in VISIBILITY)) fail(`--visibility must be public|friends|private|unlisted (got "${VIS}")`)

    const appId = resolveAppId()
    let steamworks: any
    try { steamworks = require("steamworks.js") } catch (e: any) {
        fail(`could not load steamworks.js (${e.message}). Run 'npm ci' and try again.`)
    }

    let client: any
    try { client = steamworks.init(appId) } catch (e: any) {
        fail(`steamworks.init(${appId}) failed (${e.message}). Is Steam running and do you own the app?`)
    }
    if (!client.workshop) fail("steamworks client has no workshop API — update steamworks.js.")

    // Create a fresh item, or reuse the id passed with --item.
    let itemId: bigint
    if (ITEM) {
        itemId = BigInt(ITEM)
        console.log(`[workshop-upload] Updating existing item ${itemId}`)
    } else {
        console.log("[workshop-upload] Creating a new Workshop item…")
        const res = await client.workshop.createItem()
        itemId = res.itemId
        if (res.needsToAcceptAgreement) {
            console.warn("[workshop-upload] NOTE: you must accept the Steam Workshop Legal Agreement:\n" +
                "  https://steamcommunity.com/sharedfiles/workshoplegalagreement")
        }
        console.log(`[workshop-upload] Created item ${itemId} — SAVE THIS ID for future updates.`)
    }

    const update: Record<string, unknown> = {
        title: TITLE,
        description: DESCRIPTION,
        changeNote: CHANGENOTE,
        contentPath: CONTENT,
        tags: TAGS,
        visibility: VISIBILITY[VIS],
    }
    if (PREVIEW) update.previewPath = PREVIEW

    console.log(`[workshop-upload] Uploading content from ${CONTENT} …`)
    await client.workshop.updateItem(itemId, update, appId)

    console.log("\n[workshop-upload] Done ✓")
    console.log(`  Item:  https://steamcommunity.com/sharedfiles/filedetails/?id=${itemId}`)
    console.log("  It may take a minute to finish processing on Steam's side.\n")
    process.exit(0)
}

main().catch((e) => fail(e?.message || String(e)))
