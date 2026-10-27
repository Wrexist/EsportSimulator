/**
 * C10: pro career. Instead of running a club you play as one young pro.
 *
 * The club's staff run everything else: chores are delegated, the coach picks
 * the starting five on form (overall rating) every week, and every club
 * decision is answered with its stated default. What stays yours: your
 * player's week (training focus, rest-or-play), the matches, offers from
 * bigger clubs and, late on, when to retire. Retiring ends the pro career and
 * the save continues as a normal manager career at the club you finished at.
 */

import type { GameSave, PlayerSaveData, TeamSaveData } from "./save-types"
import { EventType, PlayerRole } from "@/types/enums"
import { SeededRNG, deriveSeed } from "./rng"
import { generateProspect, prospectToPlayerData } from "./prospect-generator"
import { evaluatePlayer } from "./player-evaluation"
import { switchClubManagement } from "./club-management"
import { closeStint, openStint } from "./manager-timeline"
import { fillAIRosterToFive } from "./ai/club-budget"
import { DELEGATION_AREAS } from "./delegation"
import { isOpenDecision } from "./decision-deadlines"

export interface ProCareerState {
    playerId: string
    startWeek: number
    /** Clubs played for, in order. */
    clubs: { teamId: string; fromWeek: number }[]
    /** Week of the last club offer (offers come at most every PRO_TUNING.OFFER_EVERY weeks). */
    lastOfferWeek?: number
    /** Set when the pro retires; the save carries on as a manager career. */
    retiredWeek?: number
}

export const PRO_TUNING = {
    START_AGE: 17,
    /** The new pro starts this many overall points under the club's weakest starter. */
    START_BELOW_STARTERS: 2,
    START_POTENTIAL: [84, 92] as const,
    /** Weeks between club offers. */
    OFFER_EVERY: 8,
    /** An offering club is at most this much reputation above the current one (one step up, not a leap). */
    OFFER_MAX_REP_STEP: 25,
    /** The pro must be at least this many overall points better than the offering club's weakest starter. */
    OFFER_MARGIN: 1,
    /** From this age the pro is asked each season end whether to retire. */
    RETIRE_ASK_FROM: 34,
    RETIRE_AT: 38,
    /** The club renews the pro's contract with this many weeks left, for RENEW_WEEKS. */
    RENEW_WITHIN: 12,
    RENEW_WEEKS: 104,
}

export const PRO_ROLES: { role: PlayerRole; label: string }[] = [
    { role: PlayerRole.RIFLER, label: "Rifler" },
    { role: PlayerRole.ENTRY_FRAGGER, label: "Entry" },
    { role: PlayerRole.AWPER, label: "AWPer" },
    { role: PlayerRole.SUPPORT, label: "Support" },
    { role: PlayerRole.IGL, label: "IGL" },
]

type ProSave = Pick<GameSave, "proCareer">

export function isProActive(save: ProSave): boolean {
    return !!save.proCareer && save.proCareer.retiredWeek == null
}

export function proPlayer(save: GameSave): PlayerSaveData | undefined {
    const id = save.proCareer?.playerId
    return id ? save.players.find(p => p.id === id) : undefined
}

export const ovrOf = (p: PlayerSaveData, week?: number): number => evaluatePlayer(p, undefined, undefined, week).overallRating

/** Stats that make a player his role; a new pro is strongest in them. */
const SIGNATURE: Record<string, readonly string[]> = {
    [PlayerRole.AWPER]: ["awp", "reaction"],
    [PlayerRole.ENTRY_FRAGGER]: ["entry", "reaction", "rifle"],
    [PlayerRole.IGL]: ["leader", "tactic"],
    [PlayerRole.SUPPORT]: ["grenades", "teamwork"],
    [PlayerRole.RIFLER]: ["rifle", "skill"],
}

const SHIFTED_STATS = ["skill", "awp", "rifle", "pistol", "grenades", "creativity", "clutch", "tactic", "entry", "trading", "leader", "teamwork", "reaction", "eyesight"] as const

/** Moves the skill stats together until the overall rating is as close to `target` as it gets. */
function tuneToOverall(base: PlayerSaveData, target: number, week: number): PlayerSaveData {
    const at = (shift: number): PlayerSaveData => {
        const p = { ...base } as Record<string, unknown>
        for (const k of SHIFTED_STATS) {
            const v = base[k as keyof PlayerSaveData]
            if (typeof v === "number") p[k] = Math.max(1, Math.min(99, Math.round(v + shift)))
        }
        return p as unknown as PlayerSaveData
    }
    let lo = -40, hi = 40
    for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2
        if (ovrOf(at(mid), week) < target) lo = mid
        else hi = mid
    }
    return at(hi)
}

/** Starting five by overall rating, best first; the rest keep their order on the bench. */
export function coachLineup(save: GameSave, team: TeamSaveData): void {
    const rating = new Map(team.rosterIds.map(id => {
        const p = save.players.find(x => x.id === id)
        const unavailable = !p || p.isRetired || (p.injury && p.injury.weeksRemaining > 0)
        return [id, unavailable ? -1 : ovrOf(p!, save.currentWeek)]
    }))
    const order = team.rosterIds.map((id, i) => ({ id, i }))
    order.sort((a, b) => (rating.get(b.id)! - rating.get(a.id)!) || a.i - b.i)
    team.rosterIds = order.map(o => o.id)
}

export interface ProStatus {
    player: PlayerSaveData
    team: TeamSaveData
    ovr: number
    /** 1 = best in the squad. */
    squadRank: number
    squadSize: number
    starter: boolean
    weeksUntilOffers: number
}

export function proStatus(save: GameSave): ProStatus | null {
    const player = proPlayer(save)
    const team = save.teams.find(t => t.id === save.playerTeamId)
    if (!player || !team || !save.proCareer) return null
    const ovr = ovrOf(player, save.currentWeek)
    const ratings = team.rosterIds.map(id => save.players.find(p => p.id === id)).filter((p): p is PlayerSaveData => !!p).map(p => ovrOf(p, save.currentWeek))
    const squadRank = 1 + ratings.filter(r => r > ovr).length
    const since = save.proCareer.lastOfferWeek ?? save.proCareer.startWeek
    return {
        player, team, ovr, squadRank, squadSize: ratings.length,
        starter: team.rosterIds.indexOf(player.id) > -1 && team.rosterIds.indexOf(player.id) < 5,
        weeksUntilOffers: Math.max(0, since + PRO_TUNING.OFFER_EVERY - save.currentWeek),
    }
}

/** Weekly wage the club pays its pro, by rating. */
export function proWage(ovr: number): number {
    return Math.round(150 + Math.max(0, ovr - 40) * 40)
}

export interface ProStartInput { nickname: string; role: PlayerRole; nationality?: string }

/**
 * Creates the pro at the managed club (a 17-year-old a little behind the
 * starters, with a high ceiling), hands the club to its staff and opens
 * the pro career. Returns the player, or null when the club is missing.
 */
export function startProCareer(save: GameSave, input: ProStartInput): PlayerSaveData | null {
    const team = save.teams.find(t => t.id === save.playerTeamId)
    if (!team || save.proCareer) return null
    const rng = new SeededRNG(deriveSeed(save.saveId, "pro-start", input.nickname))
    const identity = generateProspect("LOCAL", input.nationality, rng)
    const base = prospectToPlayerData(identity, save.currentWeek, rng) as unknown as PlayerSaveData
    const starters = team.rosterIds.slice(0, 5).map(id => save.players.find(p => p.id === id)).filter((p): p is PlayerSaveData => !!p)
    const weakest = starters.length ? Math.min(...starters.map(p => ovrOf(p, save.currentWeek))) : 45
    const nickname = input.nickname.trim().slice(0, 24) || identity.nickname
    const shaped = tuneToOverall({
        ...base,
        id: `pro_${save.saveId}`,
        nickname,
        name: `${identity.firstName} "${nickname}" ${identity.lastName}`,
        ...Object.fromEntries((SIGNATURE[input.role] ?? []).map(k => {
            const stats = SHIFTED_STATS.map(s => Number((base as unknown as Record<string, unknown>)[s]) || 50)
            return [k, Math.min(99, Math.max(Number((base as unknown as Record<string, unknown>)[k]) || 50, Math.max(...stats) + 4))]
        })),
        role: input.role,
        roleLocked: true,
        age: PRO_TUNING.START_AGE,
        tier: "ROOKIE",
        morale: 75, form: 55, fatigue: 0, health: 100, energy: 100, maxEnergy: 100, loyalty: 70,
    } as PlayerSaveData, Math.max(30, weakest - PRO_TUNING.START_BELOW_STARTERS), save.currentWeek)
    const [pLo, pHi] = PRO_TUNING.START_POTENTIAL
    const player: PlayerSaveData = { ...shaped, potential: rng.int(pLo, pHi) }
    save.players.push(player)
    team.rosterIds.push(player.id)
    save.contracts.push({ playerId: player.id, teamId: team.id, salaryPerWeek: proWage(ovrOf(player, save.currentWeek)), startWeek: save.currentWeek, endWeek: save.currentWeek + PRO_TUNING.RENEW_WEEKS, buyout: 0 })
    save.delegation = Object.fromEntries(DELEGATION_AREAS.map(a => [a, true]))
    save.proCareer = { playerId: player.id, startWeek: save.currentWeek, clubs: [{ teamId: team.id, fromWeek: save.currentWeek }] }
    coachLineup(save, team)
    save.eventsLog.unshift({
        id: `pro_start_${save.saveId}`, type: "CAREER_UPDATE", week: save.currentWeek, acknowledged: false,
        data: {
            teamId: team.id, playerId: player.id,
            title: `${nickname} signs for ${team.name}`,
            message: `You are ${nickname}, a ${PRO_TUNING.START_AGE}-year-old ${PRO_ROLES.find(r => r.role === input.role)?.label ?? "player"} on your first pro contract. The coach picks the five best players each week, so earn your place: set your training focus in the week plan and training screens, play your matches, and bigger clubs will call when you are good enough for their lineup. The staff run the club.`,
        },
    })
    return player
}

/** The best club that wants the pro now: one step up in reputation, where he would start. */
export function findOfferingClub(save: GameSave): TeamSaveData | undefined {
    const player = proPlayer(save)
    const current = save.teams.find(t => t.id === save.playerTeamId)
    if (!player || !current) return undefined
    const ovr = ovrOf(player, save.currentWeek)
    let best: TeamSaveData | undefined
    for (const t of save.teams) {
        if (t.id === current.id || t.rosterIds.length < 5) continue
        if (t.reputation <= current.reputation || t.reputation > current.reputation + PRO_TUNING.OFFER_MAX_REP_STEP) continue
        const starters = t.rosterIds.slice(0, 5).map(id => save.players.find(p => p.id === id)).filter((p): p is PlayerSaveData => !!p)
        if (starters.length < 5) continue
        const weakest = Math.min(...starters.map(p => ovrOf(p, save.currentWeek)))
        if (ovr < weakest + PRO_TUNING.OFFER_MARGIN) continue
        if (!best || t.reputation > best.reputation || (t.reputation === best.reputation && t.id < best.id)) best = t
    }
    return best
}

/**
 * Moves the pro to `toTeamId`: the new club signs him on a fresh contract,
 * replaces its weakest starter's place in the order, and its staff take over
 * as the career's club.
 */
export function moveProPlayer(save: GameSave, toTeamId: string): boolean {
    const player = proPlayer(save)
    const from = save.teams.find(t => t.id === save.playerTeamId)
    const to = save.teams.find(t => t.id === toTeamId)
    if (!player || !from || !to || from.id === to.id || !save.proCareer) return false
    from.rosterIds = from.rosterIds.filter(id => id !== player.id)
    save.contracts = save.contracts.filter(c => c.playerId !== player.id)
    to.rosterIds.push(player.id)
    save.contracts.push({ playerId: player.id, teamId: to.id, salaryPerWeek: proWage(ovrOf(player, save.currentWeek)), startWeek: save.currentWeek, endWeek: save.currentWeek + PRO_TUNING.RENEW_WEEKS, buyout: 0 })
    closeStint(save, "moved")
    switchClubManagement(save, from, to)
    save.managerDetails.lastJobChangeWeek = save.currentWeek
    save.managerDetails.tenureStartWeek = save.currentWeek + 1
    openStint(save)
    save.proCareer.clubs.push({ teamId: to.id, fromWeek: save.currentWeek })
    if (from.rosterIds.length < 5) fillAIRosterToFive(save, from)
    coachLineup(save, to)
    save.eventsLog.unshift({
        id: `pro_moved_${to.id}_${save.currentWeek}`, type: "CAREER_UPDATE", week: save.currentWeek, acknowledged: false,
        data: { teamId: to.id, playerId: player.id, title: `${player.nickname} joins ${to.name}`, message: `${player.nickname} signs a two-year deal at ${to.name}. New club, new lineup: the coach still picks the best five.` },
    })
    return true
}

/** Ends the pro career: he retires, and the save carries on with you as the club's manager. */
export function retirePro(save: GameSave): boolean {
    const player = proPlayer(save)
    if (!player || !save.proCareer || save.proCareer.retiredWeek != null) return false
    const team = save.teams.find(t => t.id === save.playerTeamId)
    player.isRetired = true
    player.retirementWeek = save.currentWeek
    if (team) {
        team.rosterIds = team.rosterIds.filter(id => id !== player.id)
        if (team.rosterIds.length < 5) fillAIRosterToFive(save, team)
    }
    save.contracts = save.contracts.filter(c => c.playerId !== player.id)
    save.proCareer.retiredWeek = save.currentWeek
    save.eventsLog.unshift({
        id: `pro_retired_${save.currentWeek}`, type: EventType.RETIREMENT, week: save.currentWeek, acknowledged: false,
        data: { playerId: player.id, playerName: player.nickname, teamId: team?.id, title: `${player.nickname} retires`, message: `${player.nickname} hangs up the mouse at ${player.age} after ${save.proCareer.clubs.length} club${save.proCareer.clubs.length === 1 ? "" : "s"}. The board at ${team?.name ?? "the club"} offers you the manager's office: the career carries on with you running the club. Staff still handle the chores you delegated; change that under Staff.` },
    })
    return true
}

/**
 * The pro's week, run once per week tick after the board: contract renewal,
 * the coach's lineup, a club offer when one is due, and the retirement
 * question late in the career.
 */
export function processProWeek(save: GameSave): void {
    if (!isProActive(save) || !save.proCareer) return
    const player = proPlayer(save)
    const team = save.teams.find(t => t.id === save.playerTeamId)
    if (!player || !team) return
    if (player.isRetired) { save.proCareer.retiredWeek = save.currentWeek; return }

    const contract = save.contracts.find(c => c.playerId === player.id)
    if (!contract) {
        save.contracts.push({ playerId: player.id, teamId: team.id, salaryPerWeek: proWage(ovrOf(player, save.currentWeek)), startWeek: save.currentWeek, endWeek: save.currentWeek + PRO_TUNING.RENEW_WEEKS, buyout: 0 })
    } else if (contract.endWeek - save.currentWeek <= PRO_TUNING.RENEW_WITHIN) {
        contract.endWeek = save.currentWeek + PRO_TUNING.RENEW_WEEKS
        contract.salaryPerWeek = Math.max(contract.salaryPerWeek, proWage(ovrOf(player, save.currentWeek)))
    }
    if (team.rosterIds.length < 5) fillAIRosterToFive(save, team)
    coachLineup(save, team)

    const since = save.proCareer.lastOfferWeek ?? save.proCareer.startWeek
    if (save.currentWeek - since >= PRO_TUNING.OFFER_EVERY) {
        const club = findOfferingClub(save)
        save.proCareer.lastOfferWeek = save.currentWeek
        const id = club ? `pro_offer_${club.id}_${save.currentWeek}` : ""
        if (club && !save.eventsLog.some(e => e.id === id)) {
            save.eventsLog.unshift({
                id, type: "CAREER_UPDATE", week: save.currentWeek, acknowledged: false,
                data: {
                    playerId: player.id, teamId: team.id, offeringTeamId: club.id,
                    title: `${club.name} want ${player.nickname}`,
                    message: `${club.name} (world #${club.worldRanking ?? "–"}) offer a two-year deal and a starting place. Their weakest starter is below your level. Join them, or stay at ${team.name}.`,
                },
                choices: [
                    { id: "accept", text: `Join ${club.name}`, effects: { follows: "Moves you to the new club next match" } },
                    { id: "stay", text: `Stay at ${team.name}`, effects: {} },
                ],
            })
        }
    }

    if (save.currentWeek % 52 === 0 && player.age >= PRO_TUNING.RETIRE_ASK_FROM) {
        if (player.age >= PRO_TUNING.RETIRE_AT) { retirePro(save); return }
        const id = `pro_retire_${save.currentWeek}`
        if (!save.eventsLog.some(e => e.id === id)) {
            save.eventsLog.unshift({
                id, type: "CAREER_UPDATE", week: save.currentWeek, acknowledged: false,
                data: { playerId: player.id, teamId: team.id, title: `${player.nickname} at ${player.age}: one more season?`, message: `The season is over. Retire now and take the manager's office at ${team.name}, or play another season. At ${PRO_TUNING.RETIRE_AT} the decision is made for you.` },
                choices: [
                    { id: "play_on", text: "Play another season", effects: {} },
                    { id: "retire", text: "Retire and manage the club", effects: { follows: "Ends the pro career; the save continues as a manager career" } },
                ],
            })
        }
    }
}

/** Is this open decision the pro's own (offers, retirement, his workload or knocks)? */
export function isProDecision(save: GameSave, e: { id: string; data?: Record<string, unknown> }): boolean {
    if (e.id.startsWith("pro_")) return true
    return !!save.proCareer && e.data?.playerId === save.proCareer.playerId
}

/**
 * The staff answer every open club decision with its default (bids lapse);
 * the pro's own stay open. Sets each one's deadline to last week so
 * expireDecisions settles it the same way an unanswered decision is settled.
 */
export function handClubDecisionsToStaff(save: GameSave): number {
    if (!isProActive(save)) return 0
    let n = 0
    for (const e of save.eventsLog) {
        if (!isOpenDecision(e) || isProDecision(save, e)) continue
        if (String(e.type) === "JOB_OFFER") { e.data = { ...e.data, isWithdrawn: true }; e.choices = []; continue }
        if (String(e.type) === "TRANSFER_OFFER") e.data = { ...e.data, expiresWeek: save.currentWeek }
        else e.data = { ...e.data, deadlineWeek: save.currentWeek - 1 }
        n++
    }
    return n
}
