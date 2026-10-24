/**
 * Dressing-room fit of a transfer target, before you sign him: what the
 * weekly dressing-room step (processors/dressing-room.ts) and the captain /
 * mentor rules (personality.ts) would do once he joins at his asking wage.
 *
 * Only effects the engine applies are listed: wage-fairness unhappiness
 * (either way), playing time and bench morale, the captain's defeat shield,
 * mentorship training, and the roster-change chemistry cost. Role overlap is
 * listed as a plain fact. Pure; nothing here changes the save.
 */

import type { ContractSaveData, PlayerSaveData, TeamSaveData } from "./save-types"
import { evaluatePlayer } from "./player-evaluation"
import { PERSONALITY_TUNING as T } from "@/lib/balance-tuning"
import {
    ARCHETYPE_INFO, benchMoraleFactor, canBeMentored, canMentor, captainDefeatShield, captainId, caresAboutWages, getArchetype,
} from "./personality"
import { CHEMISTRY_PENALTY_PER_SWAP } from "./chemistry-engine"

export type FitTone = "good" | "warn" | "info"

export interface FitLine {
    tone: FitTone
    text: string
}

const pct = (x: number) => `${Math.round(x * 100)}%`
/** First listed role, normalized: saves hold both "AWPER" (PlayerRole) and older "AWPer" spellings. */
const primaryRole = (p: Partial<PlayerSaveData>) => String(p.role || "RIFLER").split(",")[0].trim().toUpperCase().replace(/[^A-Z]/g, "_")

export function squadFit(input: {
    target: PlayerSaveData
    team: TeamSaveData
    lookup: (id: string) => PlayerSaveData | undefined
    contracts: ContractSaveData[]
    currentWeek: number
    /** The wage he would sign for (recruitmentSalary). */
    wage: number
    /**
     * What your scouting shows of him (fog of war): his rating, or the middle
     * of the scouted band, and his leader stat once a report reveals it.
     */
    visible: { rating: number; exact: boolean; leader?: number }
}): FitLine[] {
    const { target, team, lookup, contracts, currentWeek, wage, visible } = input
    const lines: FitLine[] = []
    const ovr = (p: PlayerSaveData) => evaluatePlayer(p, undefined, undefined, currentWeek).overallRating
    const name = (p: PlayerSaveData) => p.nickname || p.id
    const label = (p: PlayerSaveData) => ARCHETYPE_INFO[getArchetype(p)].label
    const wages = new Map<string, number>()
    for (const c of contracts) if (c.teamId === team.id && c.endWeek > currentWeek) wages.set(c.playerId, c.salaryPerWeek)

    const roster = team.rosterIds.map(lookup).filter((p): p is PlayerSaveData => !!p && !p.isRetired && p.id !== target.id)
    const targetOvr = visible.rating
    const about = visible.exact ? "" : "about "
    const targetType = getArchetype(target)

    // Wage fairness, both directions (dressing-room step 2).
    for (const mate of roster) {
        const mateWage = wages.get(mate.id)
        if (!mateWage) continue
        const mateOvr = ovr(mate)
        if (caresAboutWages(getArchetype(mate)) && mateWage < wage * T.WAGE_FAIRNESS_SHARE && targetOvr <= mateOvr - T.WAGE_FAIRNESS_MIN_GAP) {
            lines.push({ tone: "warn", text: `${name(mate)} (${label(mate)}, ${mateOvr}) would earn under ${pct(T.WAGE_FAIRNESS_SHARE)} of a lower-rated newcomer and lose ${T.WAGE_MORALE_PER_WEEK} morale a week until it changes.${visible.exact ? "" : " (Based on his scouted rating.)"}` })
        }
        if (caresAboutWages(targetType) && wage < mateWage * T.WAGE_FAIRNESS_SHARE && mateOvr <= targetOvr - T.WAGE_FAIRNESS_MIN_GAP) {
            lines.push({ tone: "warn", text: `${label(target)}: on this wage he would earn under ${pct(T.WAGE_FAIRNESS_SHARE)} of ${name(mate)} (${mateOvr}) and lose ${T.WAGE_MORALE_PER_WEEK} morale a week.` })
        }
    }

    // Playing time: the starting five is the first five on the roster.
    const starters = roster.slice(0, 5)
    const weakest = [...starters].sort((a, b) => ovr(a) - ovr(b))[0]
    const benchHit = (p: PlayerSaveData) => benchMoraleFactor(getArchetype(p))
    if (starters.length < 5) {
        lines.push({ tone: "good", text: `Walks into the starting five: you have ${starters.length} starters.` })
    } else if (weakest && targetOvr > ovr(weakest)) {
        const f = benchHit(weakest)
        lines.push({
            tone: f > 1 ? "warn" : "info",
            text: `Rated ${about}above ${name(weakest)} (${ovr(weakest)}), your weakest starter. Benching ${name(weakest)} for ${T.BENCH_MATCHES}+ matches costs ${T.BENCH_MORALE_PER_WEEK * f} morale a week${f !== 1 ? ` (${label(weakest)}, ${f}×)` : ""}.`,
        })
    } else {
        const f = benchHit(target)
        lines.push({
            tone: f > 1 ? "warn" : "info",
            text: `Rated ${about}below your five, so he starts on the bench.${f > 1 ? ` As a ${label(target)} he would lose morale ${f}× as fast once he has been a regular starter.` : ""}`,
        })
    }

    // Captain (defeat shield).
    const currentCaptainId = captainId(team, lookup)
    const currentCaptain = currentCaptainId ? lookup(currentCaptainId) : undefined
    const shieldNew = visible.leader === undefined ? 0 : captainDefeatShield({ ...target, leader: visible.leader })
    const shieldNow = currentCaptain ? captainDefeatShield(currentCaptain) : 0
    if (visible.leader !== undefined && shieldNew > shieldNow + 0.005) {
        lines.push({ tone: "good", text: `Would make a better captain than ${currentCaptain ? name(currentCaptain) : "anyone you have"}: spares the lineup ${pct(shieldNew)} of a defeat's morale loss (now ${pct(shieldNow)}).` })
    }

    // Mentorship (+training).
    if (canBeMentored(target)) {
        const mentor = roster.find(p => canMentor(p))
        if (mentor) lines.push({ tone: "good", text: `${name(mentor)} (${label(mentor)}) can mentor him: +${pct(T.MENTOR_TRAINING - 1)} training gains.` })
    } else if (canMentor(target)) {
        const mentees = roster.filter(p => canBeMentored(p))
        if (mentees.length) lines.push({ tone: "good", text: `Can mentor ${mentees.map(name).join(", ")}: +${pct(T.MENTOR_TRAINING - 1)} training gains.` })
    }

    // Role overlap (fact, not an effect).
    const role = primaryRole(target)
    const sameRole = starters.filter(p => primaryRole(p) === role)
    if (sameRole.length && (role === "AWPER" || role === "IGL")) {
        lines.push({ tone: "info", text: `Your five already has ${role === "AWPER" ? "an AWPer" : "an IGL"}: ${sameRole.map(name).join(", ")}.` })
    }

    lines.push({ tone: "info", text: `Any signing costs ${CHEMISTRY_PENALTY_PER_SWAP} team chemistry, which grows back once the roster settles.` })
    return lines
}
