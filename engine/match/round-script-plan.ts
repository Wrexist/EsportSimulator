/**
 * Round script plan: T strategy, attacked site and CT setup; roles to routes,
 * staging spots and holds; and each player's phases (default homes over time).
 */

import { PLANT_SECONDS, WALK_PACE, RUN_PACE, PLAN_PACE, HOME_GAP, FILE_GAP, isSniper, other, hyp, alive, weighted } from "./round-script-context"
import type { XY, Phase, Role, Job, Actor, Chain, Ctx } from "./round-script-context"
import type { CtSetup, RoundMapHold, RoundMapRoute, SiteId, TStrategy } from "./round-script-types"

// Math is read once: global lookups are very slow inside Jest's sandbox (tests time the builder).
const { abs, floor, max, min } = Math

// ─── Plan ──────────────────────────────────────────────────────────────────

export function choosePlan(ctx: Ctx): void {
    const { input } = ctx
    const rng = ctx.rng.plan
    const tStyle = (input.tPlaystyle ?? "").toLowerCase()
    const ctStyle = (input.ctPlaystyle ?? "").toLowerCase()

    if (input.buy.T === "eco") ctx.strategy = "eco"
    else {
        const w: Record<Exclude<TStrategy, "eco">, number> = { default: 4, execute: 3, split: 1.5, fake: 1, rush: 1 }
        if (input.buy.T === "force" || input.buy.T === "pistol") w.rush += 3
        if (tStyle === "aggressive") { w.rush += 2; w.execute += 1; w.default -= 1 }
        if (tStyle === "structured") { w.default += 1; w.split += 1; w.fake += 0.5 }
        ctx.strategy = weighted(rng, w)
    }
    // A rush that would idle on site for the resolver's (late) plant is an execute.
    if (ctx.strategy === "rush" && ctx.plantT !== undefined && ctx.plantT > 35) ctx.strategy = "execute"
    ctx.site = rng.bool(0.5) ? "A" : "B"

    const cw: Record<CtSetup, number> = { "2-1-2": 6, "stack-A": 1, "stack-B": 1, aggressive: 1 }
    if (ctStyle === "aggressive") cw.aggressive += 2
    if (ctStyle === "structured") cw["2-1-2"] += 2
    if (input.buy.CT === "eco" || input.buy.CT === "force") { cw["stack-A"] += 1.5; cw["stack-B"] += 1.5; cw.aggressive += 1.5 }
    ctx.ctSetup = weighted(rng, cw)
}

// ─── Assignment ────────────────────────────────────────────────────────────

export const PLANTER_PRIORITY: Record<Role, number> = { support: 0, igl: 1, rifler: 2, awp: 3, entry: 4, lurk: 5 }
export const LEAD_ORDER: Record<Job, number> = { entry: 0, support: 1, igl: 2, pack: 3, awp: 4, lurk: 5, fake: 6, ct: 9 }

export function assignRoles(ctx: Ctx): void {
    const rng = ctx.rng.assign
    const ts = ctx.actors.filter(a => a.side === "T")
    const byPriority = (pool: Actor[]) => [...pool].sort((a, b) => PLANTER_PRIORITY[a.role] - PLANTER_PRIORITY[b.role] || a.order - b.order)

    // The planter has to be alive at the plant; the bomb starts with them.
    if (ctx.plantT !== undefined) {
        const plantT = ctx.plantT
        ctx.planter = byPriority(ts.filter(a => alive(a, plantT)))[0] ?? byPriority(ts)[0]
        const spots = ctx.g.plantNodes[ctx.site]
        ctx.plantNode = spots.length ? rng.pick(spots) : ctx.g.siteNodes[ctx.site]
    }
    const carrier = ctx.planter ?? byPriority(ts)[0]
    ctx.carrierId = carrier?.id ?? null
    if (carrier) ctx.bomb.carrier.push({ t: 0, carrierId: carrier.id })

    const quick = ctx.strategy === "rush" || ctx.strategy === "eco"
    for (const a of ts) {
        a.job = a.role === "entry" ? "entry" : a.role === "support" ? "support" : a.role === "igl" ? "igl" : a.role === "lurk" && !quick ? "lurk" : "pack"
        if (isSniper(a.player.weapon)) a.job = "awp"
        if (a === ctx.planter && (a.job === "lurk")) a.job = "pack"
    }
    if (!quick && ts.length >= 4 && !ts.some(a => a.job === "lurk")) {
        const pool = ts.filter(a => a.job === "pack" && a !== ctx.planter)
        if (pool.length) rng.pick(pool).job = "lurk"
    }
    if (!ts.some(a => a.job === "entry")) {
        const pool = ts.filter(a => a.job === "pack" || a.job === "igl" || a.job === "support")
        const pick = pool.find(a => a !== ctx.planter) ?? pool[0]
        if (pick) pick.job = "entry"
    }
    if (ctx.strategy === "fake") {
        const fakers = ts.filter(a => a.job === "lurk")
        const extra = ts.filter(a => (a.job === "pack" || a.job === "igl") && a !== ctx.planter)
        if (extra.length && fakers.length < 2) fakers.push(extra[extra.length - 1])
        for (const a of fakers.slice(0, 2)) a.job = "fake"
    }
    ;[...ts].sort((a, b) => LEAD_ORDER[a.job] - LEAD_ORDER[b.job] || a.order - b.order).forEach((a, i) => { a.order = i })
}

export function tRoutes(ctx: Ctx, site: SiteId): { main?: RoundMapRoute; alt?: RoundMapRoute; split?: RoundMapRoute } {
    const exec = ctx.map.routes.filter(r => r.kind === "t-exec" && r.site === site)
    const main = exec.find(r => /main/.test(r.id)) ?? [...exec].sort((a, b) => a.length - b.length)[0]
    const alt = exec.find(r => r !== main && /alt/.test(r.id)) ?? exec.find(r => r !== main) ?? main
    const split = exec.find(r => r !== main && /split/.test(r.id)) ?? alt
    return { main, alt, split }
}

export function chainOf(ctx: Ctx, route: RoundMapRoute): Chain {
    const cached = ctx.chains.get(route.id)
    if (cached) return cached
    const { g } = ctx
    const nodes = g.routeNodes.get(route.id) ?? []
    const arc = [0]
    for (let i = 1; i < nodes.length; i++) arc.push(arc[i - 1] + g.dist(nodes[i - 1], nodes[i]))
    const cp = route.points[min(max(0, route.contactIndex), route.points.length - 1)]
    let ci = 0
    for (let i = 1; i < nodes.length; i++) if (hyp(g.point(nodes[i]), cp) < hyp(g.point(nodes[ci]), cp)) ci = i
    const chain = { nodes, arc, contactArc: arc[ci] ?? 0, contactNode: nodes[ci] ?? g.siteNodes[route.site] }
    ctx.chains.set(route.id, chain)
    return chain
}

export function nodeAtArc(chain: Chain, s: number): number {
    let best = 0
    for (let i = 1; i < chain.arc.length; i++) if (abs(chain.arc[i] - s) < abs(chain.arc[best] - s)) best = i
    return chain.nodes[best]
}

/** Spread players along a route behind its contact point, `gap` + 4 per player. */
export function stageOnChain(ctx: Ctx, chain: Chain, players: Actor[], gap: number, taken: number[]): Map<Actor, number> {
    const out = new Map<Actor, number>()
    if (!chain.nodes.length) return out
    const minArc = min(8, chain.contactArc * 0.5)
    players.forEach((a, k) => {
        let s = max(minArc, chain.contactArc - gap - 4 * k)
        let node = nodeAtArc(chain, s)
        for (let tries = 0; tries < 6 && taken.some(n => ctx.g.dist(n, node) < HOME_GAP); tries++) {
            s = max(0, s - 2.5)
            node = nodeAtArc(chain, s)
        }
        taken.push(node)
        out.set(a, node)
    })
    return out
}

/** Distinct spots on a site, deepest (farthest from `from`) first. */
export function siteSpots(ctx: Ctx, site: SiteId, from: number, taken: number[], count: number): number[] {
    const { g } = ctx
    const c = g.siteNodes[site]
    const pool = [...new Set([...g.plantNodes[site], ...g.around(c, 6)])].filter(n => g.floor[n] === g.floor[c])
    pool.sort((a, b) => g.dist(b, from) - g.dist(a, from) || a - b)
    const out: number[] = []
    for (const gap of [HOME_GAP, 2.5, 0]) {
        for (const n of pool) {
            if (out.length >= count) return out
            if (out.includes(n) || [...taken, ...out].some(m => g.dist(m, n) < gap)) continue
            out.push(n)
        }
    }
    while (out.length < count) out.push(c)
    return out
}

/** Post-plant positions 4–13 from the bomb, holds preferred. */
export function postPlantSpots(ctx: Ctx, count: number): number[] {
    const { g } = ctx
    const bomb = ctx.plantNode
    const holdNodes = new Set(ctx.map.holds.filter(h => h.site === ctx.site).map(h => g.holdNodes.get(h.id)))
    const pool = g.around(bomb, 13).filter(n => g.dist(n, bomb) >= 3.5)
        .map(n => ({ n, score: abs(g.dist(n, bomb) - 8) - (holdNodes.has(n) ? 3 : 0) + ctx.rng.assign.range(0, 2) }))
        .sort((a, b) => a.score - b.score)
    const out: number[] = []
    for (const gap of [HOME_GAP, 2.5]) {
        for (const { n } of pool) {
            if (out.length >= count) return out
            if (!out.includes(n) && out.every(m => g.dist(m, n) >= gap)) out.push(n)
        }
    }
    while (out.length < count) out.push(bomb)
    return out
}

/** Node on the walk from `from` to `to`, about `back` short of `to` (and clear of `taken`). */
export function shortOf(ctx: Ctx, from: number, to: number, back: number, taken: number[]): number | null {
    const { g } = ctx
    const path = g.path(from, to)
    let acc = 0
    for (let i = path.length - 2; i >= 0; i--) {
        acc += g.dist(path[i], path[i + 1])
        if (acc < back || g.dist(path[i], to) < back * 0.6) continue
        if (taken.some(n => g.dist(n, path[i]) < HOME_GAP)) continue
        return path[i]
    }
    return null
}

// ─── Phases ────────────────────────────────────────────────────────────────

export function buildTPhases(ctx: Ctx): void {
    const { g, rng } = ctx
    const ts = ctx.actors.filter(a => a.side === "T").sort((a, b) => a.order - b.order)
    if (!ts.length) return
    const S = ctx.site
    const O = other(S)
    const { main, alt, split } = tRoutes(ctx, S)
    const fakeRoute = tRoutes(ctx, O).main
    const lurkRoute = ctx.map.routes.find(r => r.kind === "lurk" && r.site === O) ?? ctx.map.routes.find(r => r.kind === "lurk") ?? fakeRoute
    const site = g.point(g.siteNodes[S])
    if (ctx.planter && ctx.plantT !== undefined) {
        ctx.planter.fixed.push({ t: ctx.plantT - PLANT_SECONDS, node: ctx.plantNode, holdUntil: ctx.plantT, kind: "plant", look: site })
    }
    if (!main) {
        // No T routes for the site: walk straight there over the graph.
        for (const a of ts) a.phases = [{ t: 0, node: a.spawn, pace: RUN_PACE }, { t: FILE_GAP * a.order, node: a === ctx.planter ? ctx.plantNode : g.siteNodes[S], pace: RUN_PACE }]
        ctx.execAt = 0
        ctx.trigger = min(20, ctx.plantT ?? Infinity)
        return
    }

    let splitAlt = 0
    for (const a of ts) {
        let route = main
        if (ctx.strategy === "execute" && (a.job === "awp" || a.job === "lurk")) route = alt ?? main
        if (ctx.strategy === "default") route = a.job === "awp" ? alt ?? main : a.job === "lurk" ? lurkRoute ?? main : main
        if (ctx.strategy === "fake") route = a.job === "awp" ? alt ?? main : a.job === "fake" ? fakeRoute ?? main : main
        if (ctx.strategy === "split" && a !== ctx.planter && a.job !== "entry" && a.job !== "support" && (a.job === "awp" || a.job === "lurk" || splitAlt < 2)) {
            route = split ?? alt ?? main
            splitAlt++
        }
        a.route = route
    }

    // Staging spots per route group (and a closer regroup spot for defaults).
    const taken: number[] = []
    const stage = new Map<Actor, number>()
    const regroup = new Map<Actor, number>()
    const groups = new Map<RoundMapRoute, Actor[]>()
    for (const a of ts) groups.set(a.route!, [...(groups.get(a.route!) ?? []), a])
    for (const [route, members] of groups) {
        const gap = route === lurkRoute && route !== main ? 3 : ctx.strategy === "default" ? (route === main ? 10 : 5) : ctx.strategy === "eco" || ctx.strategy === "execute" ? 4 : 5
        for (const [a, n] of stageOnChain(ctx, chainOf(ctx, route), members, gap, taken)) stage.set(a, n)
    }
    if (ctx.strategy === "default") {
        const regroupTaken: number[] = []
        const members = groups.get(main) ?? []
        for (const [a, n] of stageOnChain(ctx, chainOf(ctx, main), members, 3, regroupTaken)) regroup.set(a, n)
    }

    // Execute time: from the plant if there is one, else seeded (pulled earlier when the fights come early).
    const mainChain = chainOf(ctx, main)
    const execDelay = (a: Actor) => (a.route === main ? FILE_GAP * (groups.get(main) ?? []).indexOf(a) : 1.2 + FILE_GAP * a.order)
    if (ctx.strategy === "rush") ctx.execAt = 0
    else {
        const base = ctx.strategy === "eco" ? rng.plan.range(15, 30) : ctx.strategy === "execute" ? rng.plan.range(25, 40)
            : ctx.strategy === "split" ? rng.plan.range(30, 50) : rng.plan.range(35, 55)
        if (ctx.plantT !== undefined && ctx.planter) {
            const from = regroup.get(ctx.planter) ?? stage.get(ctx.planter) ?? ctx.planter.spawn
            const travel = g.pathDist(from, ctx.plantNode) / (ctx.v * RUN_PACE)
            ctx.execAt = max(6, ctx.plantT - PLANT_SECONDS - travel - execDelay(ctx.planter) - rng.plan.range(1, 5))
        } else if (ctx.kills.length) {
            const median = ctx.kills[floor((ctx.kills.length - 1) / 2)].t
            ctx.execAt = min(base, max(12, median - 2))
        } else ctx.execAt = base
    }

    // Where each T goes on the execute.
    const siteTaken: number[] = ctx.plantT !== undefined ? [ctx.plantNode] : []
    const onSite = ts.filter(a => a !== ctx.planter && a.job !== "awp" && a.job !== "lurk")
    const spots = siteSpots(ctx, S, mainChain.contactNode, siteTaken, onSite.length)
    const execHome = new Map<Actor, { node: number; look?: XY }>()
    const deeper = (n: number): XY => {
        const p = g.point(n)
        const c = g.point(mainChain.contactNode)
        return { x: p.x + (p.x - c.x), y: p.y + (p.y - c.y) }
    }
    onSite.forEach((a, i) => execHome.set(a, { node: spots[i], look: deeper(spots[i]) }))
    if (ctx.planter) execHome.set(ctx.planter, { node: ctx.plantT !== undefined ? ctx.plantNode : spots[0] ?? g.siteNodes[S], look: site })
    const cut = ctx.map.routes.find(r => r.kind === "rotate" && r.site === S && r.from === O)
    for (const a of ts) {
        if (execHome.has(a)) continue
        if (a.job === "awp") execHome.set(a, { node: chainOf(ctx, a.route ?? main).contactNode, look: site })
        else if (a.job === "lurk" && ctx.strategy === "default" && cut) {
            const c = chainOf(ctx, cut)
            execHome.set(a, { node: nodeAtArc(c, c.arc[c.arc.length - 1] * 0.45), look: g.point(g.siteNodes[O]) })
        } else execHome.set(a, { node: siteSpots(ctx, S, mainChain.contactNode, [...spots, ...siteTaken], 1)[0], look: site })
    }
    const post = ctx.plantT !== undefined ? postPlantSpots(ctx, ts.length) : []
    // The first to leave spawn gets the spawn closest to where they head, so the stagger keeps them in single file.
    const freeSpawns = ts.map(a => a.spawn)
    for (const a of ts) {
        const target = ctx.strategy === "rush" ? execHome.get(a)!.node : stage.get(a) ?? execHome.get(a)!.node
        const dist = g.distancesTo(target)
        const pick = freeSpawns.reduce((best, n) => (dist[n] < dist[best] ? n : best), freeSpawns[0])
        freeSpawns.splice(freeSpawns.indexOf(pick), 1)
        a.spawn = pick
        a.anchors[0].node = pick
    }

    for (const a of ts) {
        const home = execHome.get(a)!
        const chain = chainOf(ctx, a.route ?? main)
        const forward = (n: number): XY => g.point(chain.nodes[min(chain.nodes.indexOf(n) + 3, chain.nodes.length - 1)] ?? n)
        const phases: Phase[] = [{ t: 0, node: a.spawn, pace: RUN_PACE }]
        const leave = FILE_GAP * a.order
        if (ctx.strategy === "rush") phases.push({ t: leave, node: home.node, pace: RUN_PACE, look: home.look })
        else {
            const s0 = stage.get(a) ?? chain.contactNode
            phases.push({ t: leave, node: s0, pace: WALK_PACE, look: forward(s0) })
            const r = regroup.get(a)
            if (r !== undefined) phases.push({ t: max(leave + 1, ctx.execAt - rng.plan.range(6, 10)), node: r, pace: WALK_PACE, look: forward(r) })
            if (a.job === "fake" && fakeRoute) {
                const fc = chainOf(ctx, fakeRoute)
                phases.push({ t: max(leave + 1, ctx.execAt - 8), node: fc.contactNode, pace: RUN_PACE, look: g.point(g.siteNodes[O]) })
                phases.push({ t: ctx.execAt + 3, node: home.node, pace: RUN_PACE, look: home.look })
            } else phases.push({ t: ctx.execAt + execDelay(a), node: home.node, pace: RUN_PACE, look: home.look })
        }
        if (ctx.plantT !== undefined && !(a.job === "lurk" && cut && ctx.strategy === "default")) {
            const spot = post[a.order % post.length]
            const p = g.point(spot)
            const bomb = g.point(ctx.plantNode)
            phases.push({ t: ctx.plantT + 0.5 + 0.4 * a.order, node: spot, pace: WALK_PACE, look: { x: p.x + (p.x - bomb.x), y: p.y + (p.y - bomb.y) } })
        }
        a.phases = sortPhases(phases)
    }

    // CTs rotate once the entry shows up at the attacked site.
    const entry = ts.find(a => a.job === "entry") ?? ts[0]
    const from = ctx.strategy === "rush" ? entry.spawn : regroup.get(entry) ?? stage.get(entry) ?? entry.spawn
    const contact = (ctx.strategy === "rush" ? 0.5 * entry.order : ctx.execAt) + g.pathDist(from, mainChain.contactNode) / (ctx.v * RUN_PACE)
    ctx.trigger = min(contact + 1, ctx.plantT ?? Infinity)
    applySave(ctx, ts)
}

export function buildCtPhases(ctx: Ctx): void {
    const { g } = ctx
    const rng = ctx.rng.assign
    const cts = ctx.actors.filter(a => a.side === "CT")
    if (!cts.length) return
    const S = ctx.site

    // Holds per setup: 2-1-2, stacks, or 2-1-2 with one player pushing out.
    const counts = { A: 2, B: 2, mid: 1 }
    if (ctx.ctSetup === "stack-A") Object.assign(counts, { A: 3, B: 1 })
    if (ctx.ctSetup === "stack-B") Object.assign(counts, { A: 1, B: 3 })
    const mids = rng.shuffle(ctx.map.holds.filter(h => h.kind === "mid"))
    if (!mids.length) { counts[rng.bool(0.5) ? "A" : "B"] += counts.mid; counts.mid = 0 }
    const slots: RoundMapHold[] = []
    const spaced = (h: RoundMapHold) => !slots.includes(h) && slots.every(o => o.at.floor !== h.at.floor || hyp(o.at, h.at) >= HOME_GAP)
    for (const s of ["A", "B"] as const) {
        const ofSite = ctx.map.holds.filter(h => h.site === s && h.kind !== "mid")
        const ranked = [
            ...rng.shuffle(ofSite.filter(h => h.kind === "anchor")),
            ...rng.shuffle(ofSite.filter(h => h.kind === "site")),
            ...rng.shuffle(ofSite.filter(h => h.kind === "retake")),
        ]
        let taken = 0
        for (const h of ranked) if (taken < counts[s] && spaced(h)) { slots.push(h); taken++ }
    }
    let midTaken = 0
    for (const h of mids) if (midTaken < counts.mid && spaced(h)) { slots.push(h); midTaken++ }
    for (const h of rng.shuffle(ctx.map.holds)) if (slots.length < cts.length && spaced(h)) slots.push(h)
    for (const h of ctx.map.holds) if (slots.length < cts.length && !slots.includes(h)) slots.push(h)

    const awper = cts.find(a => isSniper(a.player.weapon)) ?? cts.find(a => a.role === "awp")
    const ordered = rng.shuffle(cts.filter(a => a !== awper))
    if (awper) ordered.unshift(awper)
    const free = [...slots]
    for (const a of ordered) {
        let i = 0
        if (a === awper) i = max(0, free.findIndex(h => h.kind === "anchor" || h.kind === "mid"))
        a.hold = free.splice(i, 1)[0] ?? slots[0]
    }

    const aggressor = ctx.ctSetup === "aggressive" ? (cts.find(a => a.role === "entry" && a !== awper) ?? ordered.find(a => a !== awper)) : undefined
    const site = g.point(g.siteNodes[S])
    const bomb = ctx.plantT !== undefined ? g.point(ctx.plantNode) : undefined
    const holdNodeOf = (a: Actor) => g.holdNodes.get(a.hold!.id) ?? g.siteNodes[a.hold!.site]
    // Shortest trips leave spawn first, from the spawn closest to their hold, so shared corridors stay in file.
    const leaveRank = [...cts].sort((a, b) => g.pathDist(a.spawn, holdNodeOf(a)) - g.pathDist(b.spawn, holdNodeOf(b)) || a.order - b.order)
    const freeSpawns = leaveRank.map(a => a.spawn)
    for (const a of leaveRank) {
        const dist = g.distancesTo(holdNodeOf(a))
        const pick = freeSpawns.reduce((best, n) => (dist[n] < dist[best] ? n : best), freeSpawns[0])
        freeSpawns.splice(freeSpawns.indexOf(pick), 1)
        a.spawn = pick
        a.anchors[0].node = pick
    }
    // Rotators and retakers stop clear of the players already holding the site.
    const siteHolders = cts.filter(a => a.hold!.site === S && a.hold!.kind !== "mid").map(holdNodeOf)
    const retakeTaken: number[] = [...siteHolders]
    const spotTaken: number[] = [...siteHolders]
    cts.forEach(a => {
        const k = leaveRank.indexOf(a)
        const hold = a.hold!
        const holdNode = holdNodeOf(a)
        const phases: Phase[] = [{ t: 0, node: a.spawn, pace: RUN_PACE }]
        if (a === aggressor) {
            const main = tRoutes(ctx, hold.site).main
            const chain = main ? chainOf(ctx, main) : null
            const fwd = chain ? nodeAtArc(chain, chain.contactArc - rng.range(5, 10)) : holdNode
            const up = chain ? g.point(nodeAtArc(chain, chain.contactArc - 18)) : hold.watch
            phases.push({ t: FILE_GAP * k, node: fwd, pace: RUN_PACE, look: up })
            phases.push({ t: rng.range(10, 18), node: holdNode, pace: RUN_PACE, look: hold.watch })
        } else phases.push({ t: FILE_GAP * k, node: holdNode, pace: RUN_PACE, look: hold.watch })

        let home = holdNode
        if (hold.site !== S || hold.kind === "mid") {
            const stage = shortOf(ctx, holdNode, g.siteNodes[S], 10, retakeTaken)
            if (stage !== null) {
                phases.push({ t: ctx.trigger + 0.5 + FILE_GAP * (retakeTaken.length - siteHolders.length) + rng.range(0, 0.4), node: stage, pace: RUN_PACE, look: site })
                retakeTaken.push(stage)
                if (ctx.trigger <= (ctx.plantT ?? Infinity)) home = stage
            }
        }
        if (ctx.plantT !== undefined && bomb) {
            const spot = shortOf(ctx, home, ctx.plantNode, 6, spotTaken)
            if (spot !== null) {
                phases.push({ t: ctx.plantT + 1 + FILE_GAP * (spotTaken.length - siteHolders.length) + rng.range(0, 0.4), node: spot, pace: PLAN_PACE, look: bomb })
                spotTaken.push(spot)
            }
        }
        a.phases = sortPhases(phases)
    })
    applySave(ctx, cts)
}

/** After a SAVE call the losing side's survivors fall back toward their spawn. */
export function applySave(ctx: Ctx, side: Actor[]): void {
    const saveT = ctx.saveT
    if (saveT === undefined) return applyLateSave(ctx, side)
    if (!side.length || side[0].side === ctx.input.winnerSide) return
    for (const a of side) {
        if (!alive(a, saveT)) continue
        a.phases = [...a.phases.filter(p => p.t < saveT + 0.5), { t: saveT + 0.5, node: a.spawn, pace: RUN_PACE }]
    }
}

/**
 * Losers who survive a bomb round without a SAVE call and take no part in it
 * after the plant (CTs while the bomb explodes, Ts while it is defused) give
 * the site up: from their last fight (or the plant) they fall back toward
 * their spawn instead of walking up to the enemy and standing next to them
 * until the round ends.
 */
export function applyLateSave(ctx: Ctx, side: Actor[]): void {
    if (!side.length || ctx.plantT === undefined || ctx.saveT !== undefined) return
    const s = side[0].side
    if (s === ctx.input.winnerSide) return
    const lost = s === "CT" ? ctx.exploded : ctx.defuseT !== undefined
    if (!lost) return
    for (const a of side) {
        if (a.deathT !== Infinity) continue
        const t = max(ctx.plantT, ...a.eventTimes) + 1
        a.phases = [...a.phases.filter(p => p.t < t), { t, node: a.spawn, pace: RUN_PACE }]
    }
}

export function sortPhases(phases: Phase[]): Phase[] {
    return phases.map((p, i) => ({ p, i })).sort((a, b) => a.p.t - b.p.t || a.i - b.i).map(x => x.p)
}
