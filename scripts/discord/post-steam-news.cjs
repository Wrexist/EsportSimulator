#!/usr/bin/env node
// Posts new Steam announcements to the Discord #announcements webhook.
// Run by .github/workflows/discord-steam-news.yml on a schedule.
//
// State: the gids already handled live in STATE_FILE, carried between runs by
// the workflow cache. With no state yet (first run, or the cache expired) the
// current announcements are recorded without posting, so a lost cache never
// re-posts old news with @everyone.
//
// Env:
//   DISCORD_UPDATES_WEBHOOK  webhook URL of #announcements (repo secret)
//   STATE_FILE               default .discord-state/steam-news.json
//   POST_LATEST=1            also (re)post the newest announcement (manual test)
//   DRY_RUN=1                print the messages instead of sending them

const fs = require('node:fs')
const path = require('node:path')
const { NEWS_URL, announcementsOf, buildDiscordMessage } = require('./steam-news.cjs')

const STATE_FILE = process.env.STATE_FILE || '.discord-state/steam-news.json'
const WEBHOOK = (process.env.DISCORD_UPDATES_WEBHOOK || '').trim()
const DRY_RUN = process.env.DRY_RUN === '1'
const POST_LATEST = process.env.POST_LATEST === '1'
const KEEP = 200

function readState() {
    try {
        const json = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
        return Array.isArray(json.posted) ? json : null
    } catch { return null }
}

function writeState(posted) {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
    fs.writeFileSync(STATE_FILE, JSON.stringify({ posted: posted.slice(-KEEP), updatedAt: new Date().toISOString() }, null, 2))
}

async function send(message) {
    if (DRY_RUN) { console.log(JSON.stringify(message, null, 2)); return }
    for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(`${WEBHOOK}?wait=true`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(message) })
        if (res.ok) return
        if (res.status === 429) {
            const retry = Number((await res.json().catch(() => ({}))).retry_after) || 2
            await new Promise(r => setTimeout(r, Math.ceil(retry * 1000)))
            continue
        }
        throw new Error(`Discord answered ${res.status}: ${(await res.text()).slice(0, 300)}`)
    }
    throw new Error('Discord kept rate limiting the webhook')
}

async function main() {
    if (!WEBHOOK && !DRY_RUN) {
        console.log('::notice::DISCORD_UPDATES_WEBHOOK is not set; nothing to do.')
        return
    }
    if (WEBHOOK && !/^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(WEBHOOK)) {
        throw new Error('DISCORD_UPDATES_WEBHOOK does not look like a Discord webhook URL')
    }
    const res = await fetch(NEWS_URL, { headers: { 'user-agent': 'esm-discord-feed' } })
    if (!res.ok) throw new Error(`Steam news answered ${res.status}`)
    const items = announcementsOf(await res.json())

    const state = readState()
    const posted = state ? [...state.posted] : []
    const seen = new Set(posted)
    let queue = state ? items.filter(i => !seen.has(i.gid)) : []
    if (!state) console.log(`No saved state: recording ${items.length} existing announcement(s) without posting.`)
    if (POST_LATEST && items.length) {
        const latest = items[items.length - 1]
        if (!queue.includes(latest)) queue.push(latest)
    }

    // Everything not queued is marked handled now; each queued item only once Discord took it.
    for (const item of items) if (!seen.has(item.gid) && !queue.includes(item)) { posted.push(item.gid); seen.add(item.gid) }
    writeState(posted)
    for (const item of queue) {
        await send(buildDiscordMessage(item))
        if (!seen.has(item.gid)) { posted.push(item.gid); seen.add(item.gid) }
        if (!DRY_RUN) writeState(posted)
        console.log(`Posted: ${item.title}`)
    }
    if (!queue.length) console.log('No new announcements.')
}

main().catch(err => { console.error(`::error::${err.message}`); process.exit(1) })
