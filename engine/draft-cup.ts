/**
 * G7: the Draft Cup, a short career type.
 *
 * The manager drafts one player per role from a random pool under a points
 * budget, then plays one 8-team single-elimination cup (BO3 quarter-final
 * and semi-final, BO5 grand final, one round a week) on the normal match screens.
 * The run ends when the team is knocked out or lifts the cup, and scores
 * points for how far it went, maps won, round difference, the difficulty
 * and any budget left.
 *
 * Everything here is pure: the store builds the career (initializeDraftCup)
 * and the screens read the outcome.
 */

import { SeededRNG } from "./rng"
import { evaluatePlayer } from "./player-evaluation"
import { aimPoints, buildProfile } from "./match/round-sim/profile"
import { TUNING } from "./match/round-sim/tuning"
import type { GameSave } from "./save-types"

export const DRAFT_ROLES = ["IGL", "AWPER", "ENTRY_FRAGGER", "RIFLER", "SUPPORT"] as const
export type DraftRole = typeof DRAFT_ROLES[number]

export const DRAFT_ROLE_LABEL: Record<DraftRole, string> = {
    IGL: "In-game leader",
    AWPER: "AWPer",
    ENTRY_FRAGGER: "Entry fragger",
    RIFLER: "Rifler",
    SUPPORT: "Support",
}

export type DraftCupDifficulty = "open" | "pro" | "elite"
export const DRAFT_CUP_DIFFICULTIES: readonly DraftCupDifficulty[] = ["open", "pro", "elite"]

export const DRAFT_CUP_DIFFICULTY: Record<DraftCupDifficulty, {
    label: string
    hint: string
    /** The seven opponents come from clubs ranked this far down by starting-five strength (0 = strongest). */
    band: [number, number]
    scoreMultiplier: number
}> = {
    open: { label: "Open", hint: "Opponents from the chasing pack. A balanced draft should go deep.", band: [24, 60], scoreMultiplier: 1 },
    pro: { label: "Pro", hint: "Established clubs. An even fight for a balanced draft.", band: [8, 24], scoreMultiplier: 1.25 },
    elite: { label: "Elite", hint: "The best clubs in the world, settled sides with better chemistry than yours.", band: [0, 8], scoreMultiplier: 1.5 },
}

export const DRAFT_BUDGET = 100
/** Players offered per role. */
export const DRAFT_POOL_PER_ROLE = 6
/** Fresh pools the manager may ask for before picking. */
export const DRAFT_REROLLS = 1
export const DRAFT_CUP_TEAMS = 8

/** Dearest player the pool offers: anyone pricier would eat the whole budget. */
export const DRAFT_MAX_PRICE = 60

/**
 * Duel rating that costs nothing. A full budget spread evenly buys five
 * players about 20 points above it: set so that draft sits a little above
 * the Pro band (clubs ranked 9-24, mean duel 66 since ratings follow the
 * engine; was 38 when the world's strength was flat, Pro band 54).
 */
export const DRAFT_PRICE_FLOOR = 50

/** Points a player costs, from his duel rating: steep at the top, so five stars never fit. */
export function draftPrice(duel: number): number {
    return Math.max(1, Math.round(Math.pow(Math.max(0, duel - DRAFT_PRICE_FLOOR), 1.6) / 6))
}

/**
 * Duel rating: what the match engine plays a player at in gunfights, in
 * skill points. Aim from `skill` plus the weapon adjustment for his role's
 * weapon (AWP for the AWPer, rifle for the rest), as the rounds and the
 * pre-match win chance use it. Prices and the opponents' strength both come
 * from it, so a draft is as strong in matches as it looks.
 */
export function duelRating(p: DraftSourcePlayer): number {
    const profile = buildProfile(p as never)
    return Math.round(aimPoints(profile, profile.role === "awp" ? "awp" : "rifle") / TUNING.AIM_PER_SKILL)
}

/** Minimal player shape the draft reads (snapshot and save players both fit). */
export interface DraftSourcePlayer {
    id: string
    nickname: string
    role?: string
    age?: number
    isRetired?: boolean
}

export interface DraftSourceTeam {
    id: string
    name: string
    rosterIds: string[]
}

export interface DraftOption {
    playerId: string
    nickname: string
    role: DraftRole
    /** Engine duel rating (prices and strength). */
    duel: number
    /** The overall the rest of the game shows. */
    overall: number
    price: number
    /** Club the player is drafted from ("" for a free agent). */
    fromTeamId: string
}

export type DraftPool = Record<DraftRole, DraftOption[]>

export interface DraftPick { playerId: string; role: DraftRole; price: number }

/** Persisted on the save while (and after) a Draft Cup runs. */
export interface DraftCupState {
    tournamentId: string
    teamId: string
    difficulty: DraftCupDifficulty
    budget: number
    picks: DraftPick[]
    startWeek: number
    /** Set once when the run ends (store: settleDraftCup). */
    result?: DraftCupOutcome & { finishedWeek: number }
}

const overallOf = (p: DraftSourcePlayer) => evaluatePlayer(p as never, undefined, undefined, 1).overallRating

function shuffle<T>(items: T[], rng: SeededRNG): T[] {
    const out = [...items]
    for (let i = out.length - 1; i > 0; i--) {
        const j = rng.int(0, i)
        ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
}

/** Starting-five strength of a club (mean duel rating of its first five). */
export function clubStrength(team: DraftSourceTeam, playersById: Map<string, DraftSourcePlayer>): number {
    const five = team.rosterIds.map(id => playersById.get(id)).filter((p): p is DraftSourcePlayer => !!p && !p.isRetired).slice(0, 5)
    if (five.length < 5) return 0
    return five.reduce((s, p) => s + duelRating(p), 0) / 5
}

/** The seven opponents: random clubs from the difficulty's strength band. */
export function pickCupField(teams: DraftSourceTeam[], playersById: Map<string, DraftSourcePlayer>, difficulty: DraftCupDifficulty, seed: number): string[] {
    const ranked = teams
        .map(t => ({ id: t.id, strength: clubStrength(t, playersById) }))
        .filter(t => t.strength > 0)
        .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id))
    const [from, to] = DRAFT_CUP_DIFFICULTY[difficulty].band
    const band = ranked.slice(from, Math.max(from + DRAFT_CUP_TEAMS - 1, to))
    return shuffle(band.map(t => t.id), new SeededRNG(seed)).slice(0, DRAFT_CUP_TEAMS - 1)
}

/**
 * The pool: per role, players from clubs outside the cup and free agents
 * (by duel rating, dearer than DRAFT_MAX_PRICE left out), one from the top
 * 3% of the role, one from the next 7%, two from the next 20% and two from
 * the next 30%, so every price range is on offer.
 */
export function buildDraftPool(players: DraftSourcePlayer[], teams: DraftSourceTeam[], excludedTeamIds: readonly string[], seed: number): DraftPool {
    const rng = new SeededRNG(seed)
    const excluded = new Set(excludedTeamIds)
    const clubOf = new Map<string, string>()
    for (const t of teams) for (const id of t.rosterIds) clubOf.set(id, t.id)
    const pool = {} as DraftPool
    for (const role of DRAFT_ROLES) {
        const eligible = players
            .filter(p => p.role === role && !p.isRetired && !excluded.has(clubOf.get(p.id) ?? ""))
            .map(p => ({ p, duel: duelRating(p) }))
            .filter(x => draftPrice(x.duel) <= DRAFT_MAX_PRICE)
            .sort((a, b) => b.duel - a.duel || a.p.id.localeCompare(b.p.id))
        const n = eligible.length
        const slice = (a: number, b: number) => eligible.slice(Math.floor(n * a), Math.max(Math.floor(n * a) + 1, Math.floor(n * b)))
        const bands: Array<[number, number, number]> = [[0, 0.03, 1], [0.03, 0.1, 1], [0.1, 0.3, 2], [0.3, 0.6, 2]]
        const options: DraftOption[] = []
        for (const [a, b, count] of bands) {
            for (const { p, duel } of shuffle(slice(a, b), rng).slice(0, count)) {
                options.push({ playerId: p.id, nickname: p.nickname, role, duel, overall: overallOf(p), price: draftPrice(duel), fromTeamId: clubOf.get(p.id) ?? "" })
            }
        }
        pool[role] = options.sort((x, y) => y.price - x.price || x.playerId.localeCompare(y.playerId))
    }
    return pool
}

export function draftSpent(picks: readonly { price: number }[]): number {
    return picks.reduce((s, p) => s + p.price, 0)
}

/** A draft is complete with one player per role inside the budget. */
export function draftComplete(picks: readonly DraftPick[], budget = DRAFT_BUDGET): boolean {
    return DRAFT_ROLES.every(r => picks.filter(p => p.role === r).length === 1) && picks.length === DRAFT_ROLES.length && draftSpent(picks) <= budget
}

// ─── Outcome and run score ─────────────────────────────────────────────────

export type DraftCupFinish = "champion" | "final" | "semi" | "quarter"

export const DRAFT_CUP_FINISH_LABEL: Record<DraftCupFinish, string> = {
    champion: "Champions",
    final: "Runners-up",
    semi: "Semi-finalists",
    quarter: "Out in the quarter-finals",
}

export const DRAFT_CUP_SCORE = {
    finish: { champion: 1000, final: 600, semi: 350, quarter: 150 } as Record<DraftCupFinish, number>,
    perMapWon: 40,
    perRoundDiff: 3,
    perBudgetPointLeft: 5,
}

export interface DraftCupOutcome {
    finish: DraftCupFinish
    seriesWon: number
    mapsWon: number
    mapsLost: number
    roundDiff: number
    budgetLeft: number
    score: number
    breakdown: Array<{ label: string; points: number }>
}

/** Stage label of a bracket match → how far a team that lost it went. */
function finishFromStage(stage: string): DraftCupFinish {
    if (/grand final/i.test(stage)) return "final"
    if (/semi/i.test(stage)) return "semi"
    return "quarter"
}

/** The run's outcome once it is over (knocked out or champion); null while it runs. */
export function draftCupOutcome(save: Pick<GameSave, "tournaments" | "completedMatches"> & { draftCup?: DraftCupState }): DraftCupOutcome | null {
    const cup = save.draftCup
    if (!cup) return null
    const tournament = save.tournaments.find(t => t.id === cup.tournamentId)
    if (!tournament) return null
    const mine = (tournament.playoffBracket ?? []).filter(m => m.homeTeamId === cup.teamId || m.awayTeamId === cup.teamId)
    const lost = mine.find(m => m.isCompleted && m.winnerId && m.winnerId !== cup.teamId)
    const champion = tournament.isCompleted && tournament.winnerId === cup.teamId
    if (!lost && !champion) return null
    const finish: DraftCupFinish = champion ? "champion" : finishFromStage(lost!.stage)

    let mapsWon = 0, mapsLost = 0, roundDiff = 0, seriesWon = 0
    for (const m of save.completedMatches) {
        if (m.tournamentId !== cup.tournamentId || (m.homeTeamId !== cup.teamId && m.awayTeamId !== cup.teamId)) continue
        const home = m.homeTeamId === cup.teamId
        if (m.result?.winnerId === cup.teamId) seriesWon++
        for (const map of m.result?.maps ?? []) {
            const h = map.homeScore ?? map.finalScore?.team1 ?? 0
            const a = map.awayScore ?? map.finalScore?.team2 ?? 0
            const ours = home ? h : a, theirs = home ? a : h
            if (ours > theirs) mapsWon++
            else if (theirs > ours) mapsLost++
            roundDiff += ours - theirs
        }
    }
    const budgetLeft = Math.max(0, cup.budget - draftSpent(cup.picks))
    const mult = DRAFT_CUP_DIFFICULTY[cup.difficulty].scoreMultiplier
    const breakdown = [
        { label: DRAFT_CUP_FINISH_LABEL[finish], points: DRAFT_CUP_SCORE.finish[finish] },
        { label: `${mapsWon} map${mapsWon === 1 ? "" : "s"} won`, points: mapsWon * DRAFT_CUP_SCORE.perMapWon },
        { label: `Round difference ${roundDiff >= 0 ? "+" : ""}${roundDiff}`, points: roundDiff * DRAFT_CUP_SCORE.perRoundDiff },
        { label: `${budgetLeft} draft point${budgetLeft === 1 ? "" : "s"} unspent`, points: budgetLeft * DRAFT_CUP_SCORE.perBudgetPointLeft },
    ]
    const raw = breakdown.reduce((s, b) => s + b.points, 0)
    const score = Math.max(0, Math.round(raw * mult))
    if (mult !== 1) breakdown.push({ label: `${DRAFT_CUP_DIFFICULTY[cup.difficulty].label} difficulty ×${mult}`, points: score - raw })
    return { finish, seriesWon, mapsWon, mapsLost, roundDiff, budgetLeft, score, breakdown }
}
