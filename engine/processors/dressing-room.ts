/**
 * Weekly dressing-room step (Phase 5.2, morale v2).
 *
 * Runs once per week tick after the matches and events, for every club:
 *   1. Playing time: a regular starter left out of BENCH_MATCHES+ official
 *      matches in a row while fit loses morale (× his archetype).
 *   2. Wage fairness: an Ambitious or Mercenary player paid under
 *      WAGE_FAIRNESS_SHARE of a teammate rated WAGE_FAIRNESS_MIN_GAP+ lower
 *      loses morale.
 *   3. Promises: kept or broken promises move morale and loyalty (and the
 *      managed club gets a message).
 *   4. Managed club only: weeks of low morale make an Ambitious or Mercenary
 *      player ask to leave (an inbox decision with a deadline and default).
 *   5. Mentorships that no longer qualify end.
 *
 * Each driver is applied, then `mark` attributes the movement to its cause
 * ("Benched 3 matches", "Paid less than ace", "Promise kept: started") for
 * the weekly report. The existing drift of morale towards 50 is untouched
 * (step 2 of the tick). No RNG.
 */

import type { GameEventSaveData, GameSave, PlayerSaveData, TeamSaveData } from "../save-types"
import type { CauseResolver, ChangeCause } from "@/lib/week-changes"
import { evaluatePlayer } from "../player-evaluation"
import { PERSONALITY_TUNING as T } from "@/lib/balance-tuning"
import {
    ARCHETYPE_INFO,
    PROMISE_LABEL,
    benchMoraleFactor,
    caresAboutWages,
    ensurePersonality,
    getArchetype,
    mayRequestTransfer,
    promiseVerdict,
    pruneMentorships,
} from "../personality"

export interface DressingRoomResult {
    benched: number
    underpaid: number
    promisesKept: number
    promisesBroken: number
    requests: string[]
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const DEFAULT_CAUSE: ChangeCause = { type: "dressing_room", label: "Dressing room" }

/** Season number of a week (52-week seasons, week 1 = season 1). */
const seasonOf = (week: number) => Math.floor((week - 1) / 52) + 1

/** Lower morale by `loss`, never below `floor` (and never raise it). */
function drop(p: PlayerSaveData, loss: number, floor: number): boolean {
    if (!(loss > 0) || p.morale <= floor) return false
    p.morale = Math.max(floor, p.morale - loss)
    return true
}

export function processDressingRoom(save: GameSave, playerTeamId: string | null, mark?: (cause: CauseResolver) => unknown): DressingRoomResult {
    const result: DressingRoomResult = { benched: 0, underpaid: 0, promisesKept: 0, promisesBroken: 0, requests: [] }
    const week = save.currentWeek
    const byId = new Map<string, PlayerSaveData>()
    for (const p of save.players) byId.set(p.id, p)
    const lookup = (id: string) => byId.get(id)
    const resolve = (causes: Map<string, ChangeCause>): CauseResolver => e => causes.get(e.subjectId) ?? DEFAULT_CAUSE

    // 1. Playing time.
    const benchCauses = new Map<string, ChangeCause>()
    for (const team of save.teams) {
        for (const id of team.rosterIds) {
            const p = byId.get(id)
            const apps = p?.personality?.apps
            if (!p || p.isRetired || p.injury || !apps || apps.teamId !== team.id || !apps.regular || apps.benched < T.BENCH_MATCHES) continue
            const loss = T.BENCH_MORALE_PER_WEEK * benchMoraleFactor(getArchetype(p))
            if (drop(p, loss, T.BENCH_MORALE_FLOOR)) {
                result.benched++
                benchCauses.set(p.id, { type: "dressing_room", label: `Benched ${apps.benched} matches` })
            }
        }
    }
    mark?.(resolve(benchCauses))

    // 2. Wage fairness (ratings only for the few players who could be underpaid).
    const wages = new Map<string, number>()
    for (const c of save.contracts) if (c.endWeek > week) wages.set(`${c.teamId}|${c.playerId}`, c.salaryPerWeek)
    const ovrCache = new Map<string, number>()
    const ovr = (p: PlayerSaveData) => {
        let v = ovrCache.get(p.id)
        if (v === undefined) { v = evaluatePlayer(p, undefined, undefined, week).overallRating; ovrCache.set(p.id, v) }
        return v
    }
    const wageCauses = new Map<string, ChangeCause>()
    for (const team of save.teams) {
        const roster: Array<{ p: PlayerSaveData; wage: number }> = []
        for (const id of team.rosterIds) {
            const p = byId.get(id)
            const wage = wages.get(`${team.id}|${id}`)
            if (p && !p.isRetired && wage && wage > 0) roster.push({ p, wage })
        }
        for (const { p, wage } of roster) {
            if (p.morale <= T.WAGE_MORALE_FLOOR || !caresAboutWages(getArchetype(p))) continue
            const better = roster.filter(x => x.p !== p && wage < x.wage * T.WAGE_FAIRNESS_SHARE)
            if (!better.length) continue
            const mine = ovr(p)
            const unfair = better.filter(x => ovr(x.p) <= mine - T.WAGE_FAIRNESS_MIN_GAP)
                .sort((a, b) => b.wage - a.wage || a.p.id.localeCompare(b.p.id))[0]
            if (unfair && drop(p, T.WAGE_MORALE_PER_WEEK, T.WAGE_MORALE_FLOOR)) {
                result.underpaid++
                wageCauses.set(p.id, { type: "dressing_room", label: `Paid less than ${unfair.p.nickname || unfair.p.id}` })
            }
        }
    }
    mark?.(resolve(wageCauses))

    // 3. Promises.
    const teamById = new Map<string, TeamSaveData>(save.teams.map(t => [t.id, t]))
    const promiseCauses = new Map<string, ChangeCause>()
    for (const p of save.players) {
        const promise = p.personality?.promise
        if (!promise) continue
        const team = teamById.get(promise.teamId)
        if (!team || !team.rosterIds.includes(p.id) || p.isRetired) {
            // He left the club (or retired): nothing left to keep.
            delete p.personality!.promise
            continue
        }
        const verdict = promiseVerdict(promise, team, week)
        if (verdict === "OPEN") continue
        const kept = verdict === "KEPT"
        p.morale = clamp(p.morale + (kept ? T.PROMISE_KEPT_MORALE : T.PROMISE_BROKEN_MORALE), 0, 100)
        p.loyalty = clamp((p.loyalty ?? 50) + (kept ? T.PROMISE_KEPT_LOYALTY : T.PROMISE_BROKEN_LOYALTY), 0, 100)
        p.personality!.lastPromise = { kind: promise.kind, outcome: verdict, week }
        delete p.personality!.promise
        const label = kept ? PROMISE_LABEL[promise.kind].kept : PROMISE_LABEL[promise.kind].broken
        promiseCauses.set(p.id, { type: "dressing_room", label })
        if (kept) result.promisesKept++
        else result.promisesBroken++
        if (team.id === playerTeamId) {
            const id = `promise_${kept ? "kept" : "broken"}_${p.id}_${week}`
            if (!save.eventsLog.some(e => e.id === id)) save.eventsLog.push({
                id, type: "MORALE", week, acknowledged: false,
                data: {
                    playerId: p.id, playerName: p.nickname, teamId: team.id,
                    title: kept ? `${p.nickname}: promise kept` : `${p.nickname}: promise broken`,
                    message: kept
                        ? `You kept your word to ${p.nickname} (“${PROMISE_LABEL[promise.kind].promise}”). Morale +${T.PROMISE_KEPT_MORALE}, loyalty +${T.PROMISE_KEPT_LOYALTY}.`
                        : `${p.nickname} feels let down: “${PROMISE_LABEL[promise.kind].promise}” did not happen. Morale ${T.PROMISE_BROKEN_MORALE}, loyalty ${T.PROMISE_BROKEN_LOYALTY}.`,
                },
            })
        }
    }
    mark?.(resolve(promiseCauses))

    // 4. Managed club: unhappy weeks and transfer requests.
    const managed = playerTeamId ? teamById.get(playerTeamId) : undefined
    if (managed) {
        const candidates: PlayerSaveData[] = []
        for (const id of managed.rosterIds) {
            const p = byId.get(id)
            if (!p || p.isRetired) continue
            const personality = ensurePersonality(p).personality!
            personality.unhappyWeeks = p.morale < T.UNHAPPY_MORALE ? (personality.unhappyWeeks ?? 0) + 1 : 0
            if (personality.unhappyWeeks >= T.REQUEST_AFTER_WEEKS && mayRequestTransfer(personality.archetype) && !p.forSale
                && !personality.promise && week - (personality.lastRequestWeek ?? -Infinity) >= T.REQUEST_COOLDOWN_WEEKS) candidates.push(p)
        }
        const room = (managed.dressingRoom ??= {})
        const thisSeason = (room.requestWeeks ?? []).filter(w => seasonOf(w) === seasonOf(week))
        const openRequest = save.eventsLog.some(e => e.id.startsWith("transfer_request_") && e.selectedChoiceId === undefined && !(e.data as { isWithdrawn?: boolean } | undefined)?.isWithdrawn)
        if (candidates.length && !openRequest && thisSeason.length < T.REQUESTS_PER_SEASON) {
            const p = [...candidates].sort((a, b) => a.morale - b.morale || a.id.localeCompare(b.id))[0]
            save.eventsLog.push(transferRequestEvent(p, managed, week))
            p.personality!.lastRequestWeek = week
            room.requestWeeks = [...thisSeason, week]
            result.requests.push(p.id)
        }
    }

    // 5. Mentorships that no longer qualify.
    for (const team of save.teams) if (team.dressingRoom?.mentorships?.length) pruneMentorships(team, lookup)
    return result
}

/** Why he is unhappy, in his words, and the promise that answers it. */
function requestReason(p: PlayerSaveData, team: TeamSaveData): { reason: "BENCH" | "MORALE"; text: string } {
    const apps = p.personality?.apps
    if (apps && apps.teamId === team.id && apps.regular && apps.benched >= T.BENCH_MATCHES) {
        return { reason: "BENCH", text: `He has sat out ${apps.benched} official matches in a row and wants to play.` }
    }
    return { reason: "MORALE", text: `His morale has been below ${T.UNHAPPY_MORALE} for weeks and he doubts the project.` }
}

/** The inbox decision. Choice effects go through engine/event-choice.ts like every answer. */
export function transferRequestEvent(p: PlayerSaveData, team: TeamSaveData, week: number): GameEventSaveData {
    const archetype = getArchetype(p)
    const { reason, text } = requestReason(p, team)
    const promise = reason === "BENCH" ? "START" : "COMPETE"
    return {
        id: `transfer_request_${p.id}_${week}`,
        type: "MORALE",
        week,
        acknowledged: false,
        data: {
            playerId: p.id,
            playerName: p.nickname,
            teamId: team.id,
            reason,
            archetype,
            title: `${p.nickname} asks to leave`,
            message: `${p.nickname} (${ARCHETYPE_INFO[archetype].label}) has handed in a transfer request. ${text} `
                + `List him and his morale recovers; refuse and it drops; or give him your word: “${PROMISE_LABEL[promise].promise}”. `
                + (promise === "START"
                    ? `A promise to start is broken if he sits out ${T.PROMISE_START_BENCH_LIMIT} official matches in a row within ${T.PROMISE_START_WEEKS} weeks.`
                    : `A promise to compete is kept by a trophy or a climb of ${T.PROMISE_COMPETE_RANK_GAIN} world-ranking places within ${T.PROMISE_COMPETE_WEEKS} weeks.`)
                + ` Kept: morale +${T.PROMISE_KEPT_MORALE}, loyalty +${T.PROMISE_KEPT_LOYALTY}. Broken: morale ${T.PROMISE_BROKEN_MORALE}, loyalty ${T.PROMISE_BROKEN_LOYALTY}.`,
        },
        choices: [
            { id: "accept", text: "Accept: transfer-list him", effects: { transferList: true, morale: T.REQUEST_ACCEPT_MORALE } },
            { id: "promise", text: `Promise: “${PROMISE_LABEL[promise].promise}”`, effects: { promise, morale: T.REQUEST_PROMISE_MORALE } },
            { id: "refuse", text: "Refuse the request", effects: { morale: T.REQUEST_REFUSE_MORALE, loyalty: T.REQUEST_REFUSE_LOYALTY } },
        ],
    } as unknown as GameEventSaveData
}
