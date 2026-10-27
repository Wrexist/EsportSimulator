/**
 * Event choice effects: the one place an event answer changes the club.
 *
 * Shared by the store's resolveEventChoice (the manager picks an answer) and
 * the week processor's unanswered-decision defaults (Phase 4.9), so a default
 * applies exactly what the same answer would have applied by hand, and the
 * inbox's effect chips (describeChoice) describe both. Press-conference
 * answers (Phase 5.3, engine/storylines/press.ts) go through it too.
 *
 * Engine safe: no store, no React.
 */

import type { BoardState, ContractSaveData, FinanceLedgerEntry, GameEventSaveData, PlayerSaveData, PromiseKind, TeamSaveData } from "./save-types"
import { evaluatePlayer } from "./player-evaluation"
import { canBeMentored, canMentor, ensurePersonality, recordPromise } from "./personality"
import { BOARD_TUNING, STORY_TUNING } from "@/lib/balance-tuning"

export interface ChoiceEffects {
    morale?: number
    money?: number
    loyalty?: number
    reputation?: number
    fatigue?: number
    chemistry?: number
    /** Phase 5.2: put the event's player on the transfer list at his market value. */
    transferList?: boolean
    /** Phase 5.2: record a promise to the event's player (engine/personality.ts). */
    promise?: PromiseKind
    /** Phase 5.3: board confidence of the managed club, logged in the board's history with the answer as cause. */
    board?: number
    /** Phase 5.3: followers gained or lost by the event's club. */
    fans?: number
    /**
     * Phase 5.3: renew the event player's deal with the managed club at this
     * weekly wage for this many more weeks. Same gate as the Renew button:
     * the club must hold STANDOFF_RUNWAY_WEEKS of the raise. `current` is the
     * wage when the offer was written (for the label).
     */
    renew?: { salary: number; weeks: number; current?: number }
    /** Phase 5.3: morale and loyalty for named players (managed roster only; `name` is for the label). */
    players?: Array<{ id: string; name?: string; morale?: number; loyalty?: number }>
    /** Phase 5.3: the event player leaves the starting five; the first fit player outside it takes his place. */
    bench?: boolean
    /**
     * Phase 5.3: the event player is persuaded to play on: this season's
     * retirement chance is multiplied by STORY_TUNING.PERSUADE_RETIREMENT_FACTOR.
     * `from`/`to` are the chances in percent when the question was asked (label).
     */
    persuade?: { from: number; to: number }
    /** Phase 5.3: the event player mentors this team-mate (Phase 5.2 mentorship). */
    mentor?: { menteeId: string; name?: string }
    /** Phase 5.3: what the storyline does next because of this answer (the arc applies it; stated here). */
    follows?: string
    /**
     * C5: rest the event player this week: fatigue down by `fatigue` (not the
     * ±10 answer clamp), morale up, and out of the starting five when a fit
     * substitute is free (he stays in if there is none).
     */
    rest?: { fatigue: number; morale?: number }
    /**
     * C5: play the event player through a minor knock: the injury clears,
     * form moves by `form`, and the next injury check worsens it into a
     * moderate injury with `escalateChance` (engine/workload.ts).
     */
    playThrough?: { escalateChance: number; form?: number }
}

/** The slice of a save (or the store draft) a choice can touch. */
export interface ChoiceTarget {
    currentWeek: number
    playerTeamId: string | null
    teams: TeamSaveData[]
    players: PlayerSaveData[]
    financeLedger: FinanceLedgerEntry[]
    /** Phase 5.3: renewals. */
    contracts?: ContractSaveData[]
    /** Phase 5.3: board-confidence answers. */
    boardState?: BoardState
}

/** Same bound the store applies to fees (MAX_TRANSFER_FEE). */
const MAX_EVENT_MONEY = 1_000_000_000
/** Same bounds the store applies to wages and contract length. */
const MAX_SALARY = 10_000_000
const MAX_CONTRACT_WEEKS = 52 * 10
const MAX_FOLLOWERS = 2_000_000

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

/** Season number of a week (52-week seasons). */
const seasonOf = (week: number) => Math.floor((week - 1) / 52) + 1

/** The renewal a `renew` effect would make, or the reason it cannot. */
export function renewalCheck(target: ChoiceTarget, playerId: string | null, renew: NonNullable<ChoiceEffects["renew"]>): { contract: ContractSaveData; cost: number } | { blocked: string } {
    const managed = target.teams.find(t => t.id === target.playerTeamId)
    const contract = playerId && managed?.rosterIds.includes(playerId)
        ? target.contracts?.find(c => c.playerId === playerId && c.teamId === managed.id)
        : undefined
    if (!managed || !contract) return { blocked: "He is no longer under contract with you" }
    if (contract.endWeek <= target.currentWeek) return { blocked: "His contract has already expired" }
    if (!Number.isSafeInteger(renew.salary) || renew.salary < 1 || renew.salary > MAX_SALARY
        || !Number.isSafeInteger(renew.weeks) || renew.weeks < 1
        || contract.endWeek + renew.weeks - target.currentWeek > MAX_CONTRACT_WEEKS) return { blocked: "The offer exceeds the contract limits" }
    const cost = Math.max(0, renew.salary - contract.salaryPerWeek) * STORY_TUNING.STANDOFF_RUNWAY_WEEKS
    if (!finite(managed.budget) || managed.budget < cost) return { blocked: "Not enough funds for the raise" }
    return { contract, cost }
}

/** The fit player outside the starting five who would replace `playerId`, if any. */
export function benchSubstitute(team: Pick<TeamSaveData, "rosterIds">, playerId: string, playerOf: (id: string) => PlayerSaveData | undefined): string | null {
    const index = team.rosterIds.indexOf(playerId)
    if (index < 0 || index >= 5) return null
    for (let i = 5; i < team.rosterIds.length; i++) {
        const p = playerOf(team.rosterIds[i])
        if (p && !p.isRetired && !p.injury) return p.id
    }
    return null
}

/**
 * Apply a choice's effect bundle. Player-scoped stats hit the event's player,
 * or the whole managed roster for a team event; money, reputation, chemistry
 * and fans hit the event's club (the managed club by default). Fatigue
 * clamps to ±10 and chemistry to ±5 per answer.
 *
 * Returns false and changes nothing when the bundle cannot be applied: the
 * club is unknown, the amount is invalid, the club cannot pay, or a
 * storyline action (renewal, bench, mentor) no longer applies.
 * `ledgerId` is only called when money moves (store ids consume RNG).
 */
export function applyChoiceEffects(
    target: ChoiceTarget,
    event: GameEventSaveData,
    effects: ChoiceEffects | undefined,
    ledger: { id: () => string; description: string },
): boolean {
    const { morale, money, loyalty, reputation, fatigue, chemistry, transferList, promise, board, fans, renew, players, bench, persuade, mentor, rest, playThrough } = (effects ?? {}) as ChoiceEffects
    const data = (event.data ?? {}) as { playerId?: unknown; teamId?: unknown }
    const playerId = data.playerId != null ? String(data.playerId) : null
    const teamId = (typeof data.teamId === "string" && data.teamId) || target.playerTeamId
    const managed = target.teams.find(t => t.id === target.playerTeamId)
    const playerOf = (id: string) => target.players.find(p => p.id === id)

    // Listing a player, a promise, a renewal, benching, persuading or a
    // mentorship needs him in the managed squad.
    let subject: PlayerSaveData | undefined
    if (transferList || promise || renew || bench || persuade || mentor || rest || playThrough) {
        subject = playerId && managed?.rosterIds.includes(playerId) ? playerOf(playerId) : undefined
        if (!subject) return false
    }

    let team: TeamSaveData | undefined
    let amount = 0
    if (teamId && (money || reputation || chemistry || fans)) {
        team = target.teams.find(t => t.id === teamId)
        if (!team) return false
        const raw = money || 0
        if (typeof raw !== "number" || !Number.isFinite(raw)) return false
        amount = Math.floor(raw)
        if (Math.abs(amount) > MAX_EVENT_MONEY) return false
        // Refuse answers that would overdraw: the event stays open (or, for a
        // default, lapses without effect).
        if (amount < 0 && team.budget < -amount) return false
    }

    // Phase 5.3 actions are checked before anything changes.
    let renewal: { contract: ContractSaveData; cost: number } | undefined
    if (renew && subject) {
        const check = renewalCheck(target, subject.id, renew)
        if ("blocked" in check) return false
        renewal = check
    }
    let substitute: string | null = null
    if (bench && subject && managed) {
        substitute = benchSubstitute(managed, subject.id, playerOf)
        if (!substitute) return false
    }
    if (playThrough && subject && (subject.injury?.severity !== "MINOR" || !finite(playThrough.escalateChance))) return false
    let mentee: PlayerSaveData | undefined
    if (mentor && subject && managed) {
        mentee = managed.rosterIds.includes(mentor.menteeId) ? playerOf(mentor.menteeId) : undefined
        if (!mentee || mentee.id === subject.id || !canMentor(subject) || !canBeMentored(mentee)) return false
    }

    if (morale || loyalty || fatigue) {
        const rosterIds = playerId
            ? [playerId]
            : managed?.rosterIds ?? []
        for (const pid of rosterIds) {
            const player = playerOf(pid)
            if (!player) continue
            if (morale) player.morale = clamp(player.morale + morale, 0, 100)
            if (fatigue) player.fatigue = clamp(player.fatigue + clamp(fatigue, -10, 10), 0, 100)
            if (loyalty) player.loyalty = clamp(player.loyalty + loyalty, 0, 100)
        }
    }

    // Named players (managed roster only; anyone who left is skipped).
    for (const entry of players ?? []) {
        if (!managed?.rosterIds.includes(entry.id)) continue
        const player = playerOf(entry.id)
        if (!player) continue
        if (finite(entry.morale)) player.morale = clamp(player.morale + entry.morale, 0, 100)
        if (finite(entry.loyalty)) player.loyalty = clamp((player.loyalty ?? 50) + entry.loyalty, 0, 100)
    }

    if (team) {
        if (chemistry) team.chemistry = clamp((team.chemistry ?? 50) + clamp(chemistry, -5, 5), 0, 100)
        if (amount !== 0) {
            team.budget += amount
            target.financeLedger.push({
                id: ledger.id(),
                week: target.currentWeek,
                teamId: team.id,
                type: amount > 0 ? "INCOME" : "EXPENSE",
                category: "OTHER",
                amount: Math.abs(amount),
                description: ledger.description,
                balance: team.budget,
            })
        }
        if (reputation) team.reputation = clamp(team.reputation + reputation, 0, 100)
        if (finite(fans) && fans !== 0) team.followers = clamp(Math.floor((team.followers ?? 0) + fans), 0, MAX_FOLLOWERS)
    }

    // Board confidence: the managed club's board only, with the answer as its cause.
    if (finite(board) && board !== 0 && target.boardState && target.boardState.teamId === target.playerTeamId) {
        const b = target.boardState
        const before = b.confidence
        b.confidence = clamp(Math.round((b.confidence + board) * 10) / 10, 0, 100)
        const delta = Math.round((b.confidence - before) * 10) / 10
        if (delta !== 0) b.history = [{ week: target.currentWeek, delta, cause: ledger.description }, ...(b.history ?? [])].slice(0, BOARD_TUNING.HISTORY_LENGTH)
    }

    if (subject && transferList) {
        subject.forSale = true
        subject.transferListingPrice = Math.max(0, Math.round(evaluatePlayer(subject, undefined, undefined, target.currentWeek).transferValue))
    }
    if (subject && promise) recordPromise(target, subject, promise, target.playerTeamId ?? undefined)
    if (renewal && renew) {
        renewal.contract.salaryPerWeek = renew.salary
        renewal.contract.endWeek += renew.weeks
    }
    if (substitute && subject && managed) {
        const i = managed.rosterIds.indexOf(subject.id), j = managed.rosterIds.indexOf(substitute)
        managed.rosterIds[i] = substitute
        managed.rosterIds[j] = subject.id
    }
    if (subject && rest && finite(rest.fatigue)) {
        subject.fatigue = clamp(subject.fatigue - Math.abs(rest.fatigue), 0, 100)
        if (finite(rest.morale)) subject.morale = clamp(subject.morale + rest.morale, 0, 100)
        const sub = managed ? benchSubstitute(managed, subject.id, playerOf) : null
        if (sub && managed) {
            const i = managed.rosterIds.indexOf(subject.id), j = managed.rosterIds.indexOf(sub)
            managed.rosterIds[i] = sub
            managed.rosterIds[j] = subject.id
        }
    }
    if (subject && playThrough && subject.injury) {
        subject.knock = { name: subject.injury.name, type: subject.injury.type, week: target.currentWeek, escalateChance: clamp(playThrough.escalateChance, 0, 1) }
        subject.injury = undefined
        if (finite(playThrough.form)) subject.form = clamp((subject.form ?? 50) + playThrough.form, 0, 100)
    }
    if (subject && persuade) ensurePersonality(subject).personality!.persuadedSeason = seasonOf(target.currentWeek)
    if (subject && mentee && managed) {
        // Same pairing rule as the dressing-room screen: one mentee per mentor.
        const room = (managed.dressingRoom ??= {})
        room.mentorships = [...(room.mentorships ?? []).filter(m => m.mentorId !== subject!.id && m.menteeId !== mentee!.id), { mentorId: subject.id, menteeId: mentee.id, sinceWeek: target.currentWeek }]
    }
    return true
}
