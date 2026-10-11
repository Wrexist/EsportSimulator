/**
 * Inbox noise audit (Phase 4.9).
 *
 * Drives the real store over a new career the way a manager who never opens
 * the inbox plays it: press Continue, play every match by instant sim, press
 * Continue again on every other stop. Per week it counts what reached the
 * inbox (messages / decisions / wire news, by event type), the open
 * decisions, the unread badge, and why Continue stopped.
 *
 *   npx tsx scripts/launch/inbox-noise-audit.ts --weeks=12 --seeds=1,2,3 --label=before
 *
 * Writes docs/launch-readiness/evidence/phase4-9-inbox-noise-<label>.json.
 */
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

const root = process.cwd()
const argv = process.argv.slice(2)
const arg = (key: string, fallback: string) => argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback
const WEEKS = Number(arg("weeks", "12"))
const SEEDS = arg("seeds", "1,2,3").split(",").map(Number)
const LABEL = arg("label", "run")
const TIER = arg("tier", "mid") as "top" | "mid" | "low"

function mulberry32(a: number) {
    return () => {
        a = (a + 0x6D2B79F5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

interface WeekRow {
    week: number
    messages: Record<string, number>
    decisions: Record<string, number>
    news: Record<string, number>
    /** Low-value messages folded into the weekly digest. */
    folded: Record<string, number>
    newInbox: number
    openDecisions: number
    badge: number
    unreadAll: number
    stops: string[]
}

async function runCareer(seed: number) {
    const random = mulberry32(seed)
    Math.random = () => random()
    globalThis.crypto.getRandomValues = (<T extends ArrayBufferView | null>(array: T): T => {
        const view = array as unknown as { length: number; BYTES_PER_ELEMENT: number; [i: number]: number }
        for (let i = 0; i < view.length; i++) view[i] = Math.floor(random() * 2 ** (8 * view.BYTES_PER_ELEMENT))
        return array
    }) as Crypto["getRandomValues"]
    const { useGameStore } = await import("../../store/game-store")
    const { snapshotLoader } = await import("../../data")
    const { countInbox, getInboxKind, inboxBadgeCount } = await import("../../components/inbox/inbox-model")
    const { selectInboxContext } = await import("../../components/inbox/inbox-store-bindings")
    const get = () => useGameStore.getState()

    ;(snapshotLoader as unknown as { snapshotPath: string }).snapshotPath = path.join(root, "public/data/snapshot")
    const loaded = await snapshotLoader.loadSnapshot()
    if (!loaded.success) throw Error(loaded.error)
    const ranked = [...snapshotLoader.getSnapshot()!.teams].filter(t => t.rosterIds.length >= 5).sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id))
    const band = TIER === "top" ? [0, 10] : TIER === "mid" ? [50, 80] : [130, Math.min(170, ranked.length)]
    const club = ranked[band[0] + (seed * 7) % (band[1] - band[0])]
    const realNow = Date.now
    Date.now = () => 1_700_000_000_000 + seed
    try { await get().initializeNewGame(`inbox-${seed}`, club.id) } finally { Date.now = realNow }
    if (get().error || !get().playerTeamId) throw Error(`init failed: ${get().error}`)

    const startWeek = get().currentWeek
    const rows = new Map<number, WeekRow>()
    const row = (week: number): WeekRow => {
        let r = rows.get(week)
        if (!r) { r = { week, messages: {}, decisions: {}, news: {}, folded: {}, newInbox: 0, openDecisions: 0, badge: 0, unreadAll: 0, stops: [] }; rows.set(week, r) }
        return r
    }
    const bump = (o: Record<string, number>, k: string) => { o[k] = (o[k] ?? 0) + 1 }
    const seen = new Set<string>()
    const stopsByKind: Record<string, number> = {}
    const stopsByReason: Record<string, number> = {}
    /** Event id families (ids with player/team/week parts stripped), by inbox kind. */
    const byFamily: Record<string, number> = {}
    let maxOpen = 0

    /** Digest id → item count last time it was counted (a rolling digest is one inbox item). */
    const digests = new Map<string, number>()
    let censusWeek = -1
    /**
     * New inbox items, classified once per week from the state after the tick
     * (so in-week items the tick folds into a digest count as the digest).
     * Rows are labelled with the week the manager is now in.
     */
    const census = () => {
        const s = get()
        if (s.currentWeek === censusWeek) return
        censusWeek = s.currentWeek
        const ctx = selectInboxContext(s as never)
        const r = row(s.currentWeek)
        for (const e of s.eventsLog) {
            const data = (e.data ?? {}) as Record<string, unknown>
            if (String(e.type) === "DIGEST") {
                const n = Array.isArray(data.items) ? data.items.length : 0
                if (digests.get(e.id) !== n) { r.newInbox++; bump(r.messages, "DIGEST") }
                digests.set(e.id, n)
                continue
            }
            if (seen.has(e.id)) continue
            seen.add(e.id)
            const type = String(e.type)
            if (data.digestId) { bump(r.folded, type); continue }
            const kind = getInboxKind(e, ctx)
            const tag = kind === "decision" ? r.decisions : kind === "news" ? r.news : r.messages
            bump(tag, type)
            bump(byFamily, `${kind}:${type}:${e.id.split("_").filter(part => !/\d/.test(part)).join("_")}`)
            if (kind !== "news") r.newInbox++
        }
        const counts = countInbox(s.eventsLog, ctx)
        r.openDecisions = counts.decisions
        r.badge = inboxBadgeCount(counts)
        r.unreadAll = s.eventsLog.filter(e => !e.acknowledged).length
        maxOpen = Math.max(maxOpen, counts.decisions)
    }
    const peakOpen = () => {
        const s = get()
        maxOpen = Math.max(maxOpen, countInbox(s.eventsLog, selectInboxContext(s as never)).decisions)
    }
    // Week 1: the opening mail.
    census()

    for (let guard = 0; guard < WEEKS * 30 && get().currentWeek < startWeek + WEEKS && !get().gameOverReason; guard++) {
        await get().continueToNextDecision()
        census()
        peakOpen()
        const stop = get().advanceStop
        if (!stop) continue
        const normalized = stop.reason.replace(/\$[\d.,]+[kM]?/g, "$X").replace(/\d+/g, "N")
        if (stop.kind !== "match") {
            row(get().currentWeek).stops.push(`${stop.kind}: ${stop.reason}`)
            bump(stopsByKind, stop.kind)
            bump(stopsByReason, `${stop.kind}: ${normalized}`)
        }
        if (stop.kind === "match") {
            const id = stop.key.slice("match:".length)
            const before = get().completedMatches.length
            await get().simulateInstantMatch(id)
            if (get().completedMatches.length === before) throw Error(`match ${id} could not be played`)
        }
        if (stop.kind === "error") throw Error(stop.reason)
    }

    const final = get()
    const ctx = selectInboxContext(final as never)
    const counts = countInbox(final.eventsLog, ctx)
    const weeks = [...rows.values()].sort((a, b) => a.week - b.week)
    const sum = (k: "messages" | "decisions" | "news") => weeks.reduce((acc, w) => { for (const [t, n] of Object.entries(w[k])) acc[t] = (acc[t] ?? 0) + n; return acc }, {} as Record<string, number>)
    const played = weeks.filter(w => w.week > startWeek)
    return {
        seed, club: club.id, clubName: club.name, startWeek, endWeek: final.currentWeek,
        final: { badge: inboxBadgeCount(counts), openDecisions: counts.decisions, unreadMessages: counts.unreadMessages, unreadNews: counts.unreadNews, unreadAll: final.eventsLog.filter(e => !e.acknowledged).length },
        maxOpenDecisions: maxOpen,
        avgNewInboxPerWeek: Math.round(played.reduce((a, w) => a + w.newInbox, 0) / Math.max(1, played.length) * 10) / 10,
        maxNewInboxPerWeek: Math.max(0, ...played.map(w => w.newInbox)),
        totals: { messages: sum("messages"), decisions: sum("decisions"), news: sum("news") },
        stopsByKind, stopsByReason, byFamily,
        weeks,
    }
}

function printCareer(r: Awaited<ReturnType<typeof runCareer>>) {
    process.stdout.write(`seed ${r.seed} ${r.clubName}: final badge ${r.final.badge} (open decisions ${r.final.openDecisions}, unread msgs ${r.final.unreadMessages}), max open ${r.maxOpenDecisions}, avg new/week ${r.avgNewInboxPerWeek}, max ${r.maxNewInboxPerWeek}\n`)
    for (const w of r.weeks) {
        const fmt = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(" ")
        process.stdout.write(`  w${w.week} new ${w.newInbox} open ${w.openDecisions} badge ${w.badge} | dec[${fmt(w.decisions)}] msg[${fmt(w.messages)}] news[${fmt(w.news)}] folded[${fmt(w.folded ?? {})}]${w.stops.length ? ` | stops: ${w.stops.join("; ")}` : ""}\n`)
    }
    process.stdout.write(`  stops: ${JSON.stringify(r.stopsByReason)}\n`)
}

/** One career per process: the store module holds frozen state after a career. */
async function main() {
    const tmp = path.join(root, "tmp", "inbox-noise")
    fs.mkdirSync(tmp, { recursive: true })
    if (argv.includes("--child")) {
        const r = await runCareer(SEEDS[0])
        fs.writeFileSync(path.join(tmp, `${LABEL}-${SEEDS[0]}.json`), JSON.stringify(r))
        process.exit(0)
    }
    const results = []
    for (const seed of SEEDS) {
        const child = spawnSync(process.execPath, [...process.execArgv, process.argv[1], `--seeds=${seed}`, `--weeks=${WEEKS}`, `--label=${LABEL}`, `--tier=${TIER}`, "--child"], { cwd: root, stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" })
        const file = path.join(tmp, `${LABEL}-${seed}.json`)
        if (child.status !== 0 || !fs.existsSync(file)) throw Error(`seed ${seed} failed: ${child.stderr?.split("\n").filter(l => /Error/.test(l)).slice(-3).join(" | ")}`)
        const r = JSON.parse(fs.readFileSync(file, "utf8"))
        fs.rmSync(file)
        printCareer(r)
        results.push(r)
    }
    const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length) * 10) / 10
    const summary = {
        finalBadge: results.map(r => r.final.badge),
        finalOpenDecisions: results.map(r => r.final.openDecisions),
        maxOpenDecisions: results.map(r => r.maxOpenDecisions),
        avgNewInboxPerWeek: avg(results.map(r => r.avgNewInboxPerWeek)),
        maxNewInboxPerWeek: Math.max(...results.map(r => r.maxNewInboxPerWeek)),
        nonMatchStops: results.map(r => Object.values(r.stopsByKind as Record<string, number>).reduce((a, b) => a + b, 0)),
    }
    process.stdout.write(`summary ${JSON.stringify(summary)}\n`)
    const out = path.join(root, "docs/launch-readiness/evidence", `phase4-9-inbox-noise-${LABEL}.json`)
    fs.writeFileSync(out, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), weeks: WEEKS, tier: TIER, driver: "Real useGameStore: initializeNewGame, continueToNextDecision, simulateInstantMatch on match stops; the inbox is never opened.", summary, results }, null, 2))
    process.stdout.write(`wrote ${path.relative(root, out)}\n`)
}

main().catch(e => { console.error(e); process.exit(1) })
