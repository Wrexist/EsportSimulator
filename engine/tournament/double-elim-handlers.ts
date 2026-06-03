/**
 * Double-elimination bracket result handlers.
 *
 * One handler per round-type:
 *   - handleOpeningResult      — opening matches; winners → upper semi, losers → lower R1
 *   - handleUpperSemiResult    — winners → upper final, losers → lower semi
 *   - handleUpperFinalResult   — loser → lower final
 *   - handleLowerResult        — routes within lower bracket; lower-final winner triggers playoffs
 *
 * All four were instance methods on TournamentManager. They reach into
 * tournament.playoffBracket to update bracket slots, append new bracket
 * matches when slots aren't pre-seeded, schedule once both sides are
 * known, and (for lower-bracket losses) mark elimination status.
 *
 * Because the lower handler triggers grand-final detection via
 * `checkAndStartPlayoffs` and elimination notifications via
 * `notifyPlayerElimination` — both static methods on TournamentManager —
 * those two dependencies are injected through `BracketHandlerDeps` so we
 * avoid a circular import.
 */

import type { GameSave, TournamentSaveData, BracketMatchSaveData } from "../save-types"
import { buildBracketIndex } from "@/store/indexes"
import { QualificationEngine } from "../tournament-qualification"
import {
    addBracketMatch,
    scheduleBracketMatch,
} from "./bracket-scheduling"

export interface BracketHandlerDeps {
    /** Called when lower-bracket final completes — TournamentManager.checkAndStartPlayoffs */
    checkAndStartPlayoffs: (save: GameSave, tournamentId: string) => void
    /** Called when a team is eliminated — TournamentManager.notifyPlayerElimination */
    notifyPlayerElimination: (save: GameSave, tournament: TournamentSaveData, teamId: string) => void
}

export function handleOpeningResult(
    save: GameSave,
    tournament: TournamentSaveData,
    match: BracketMatchSaveData,
    winnerId: string,
    loserId: string,
): void {
    const bracketMap = tournament.playoffBracket ? buildBracketIndex(tournament.playoffBracket) : undefined
    const groupId = match.id.split("_opening")[0]
    const matchIdx = parseInt(match.id.split("_").pop() || "0", 10)
    const semiIdx = Math.floor(matchIdx / 2)

    // Winner advances to the matching upper semi slot.
    const semiId = `${groupId}_upper_semi_${semiIdx}`
    const semi = bracketMap?.get(semiId)
        ?? tournament.playoffBracket?.find((m: BracketMatchSaveData) => m.id === semiId)
    if (semi) {
        if (matchIdx % 2 === 0) semi.homeTeamId = winnerId
        else semi.awayTeamId = winnerId
        if (semi.homeTeamId && semi.awayTeamId) scheduleBracketMatch(save, semi)
    }

    // Loser drops into lower R1 (created on-demand if not pre-seeded).
    const lowerR1Id = `${groupId}_lower_r1_${semiIdx}`
    let lowerR1 = bracketMap?.get(lowerR1Id)
        ?? tournament.playoffBracket?.find((m: BracketMatchSaveData) => m.id === lowerR1Id)
    if (!lowerR1) {
        lowerR1 = {
            id: lowerR1Id,
            tournamentId: tournament.id,
            stage: `${match.stage.split(" ")[0]} Lower Round 1`,
            isCompleted: false,
            week: match.week + 1,
            format: "BO3",
            seed: match.seed + 1,
            sourceMatchIds: [],
        }
        addBracketMatch(tournament, lowerR1)
    }
    if (matchIdx % 2 === 0) lowerR1.homeTeamId = loserId
    else lowerR1.awayTeamId = loserId
    if (lowerR1.homeTeamId && lowerR1.awayTeamId) scheduleBracketMatch(save, lowerR1)
}

export function handleUpperSemiResult(
    save: GameSave,
    tournament: TournamentSaveData,
    match: BracketMatchSaveData,
    winnerId: string,
    loserId: string,
): void {
    const bracketMap = tournament.playoffBracket ? buildBracketIndex(tournament.playoffBracket) : undefined
    const groupId = match.id.split("_upper_semi")[0]
    const matchIdx = parseInt(match.id.split("_").pop() || "0", 10)

    // Winner advances to upper final.
    const upperFinalId = `${groupId}_upper_final`
    const upperFinal = bracketMap?.get(upperFinalId)
        ?? tournament.playoffBracket?.find((m: BracketMatchSaveData) => m.id === upperFinalId)
    if (upperFinal) {
        if (matchIdx === 0) upperFinal.homeTeamId = winnerId
        else upperFinal.awayTeamId = winnerId
        if (upperFinal.homeTeamId && upperFinal.awayTeamId) scheduleBracketMatch(save, upperFinal)
    }

    // Loser drops to lower semi (created on-demand).
    const lowerSemiId = `${groupId}_lower_semi_${matchIdx}`
    let lowerSemi = bracketMap?.get(lowerSemiId)
        ?? tournament.playoffBracket?.find((m: BracketMatchSaveData) => m.id === lowerSemiId)
    if (!lowerSemi) {
        lowerSemi = {
            id: lowerSemiId,
            tournamentId: tournament.id,
            stage: `${match.stage.split(" ")[0]} Lower Semi`,
            isCompleted: false,
            week: match.week + 1,
            format: "BO3",
            seed: match.seed + 1,
            sourceMatchIds: [],
        }
        addBracketMatch(tournament, lowerSemi)
    }
    lowerSemi.homeTeamId = loserId
    // Pair with whoever already won the matching lower-R1.
    const lowerR1 = bracketMap?.get(`${groupId}_lower_r1_${matchIdx}`)
        ?? tournament.playoffBracket?.find((m: BracketMatchSaveData) => m.id === `${groupId}_lower_r1_${matchIdx}`)
    if (lowerR1?.winnerId) {
        lowerSemi.awayTeamId = lowerR1.winnerId
        scheduleBracketMatch(save, lowerSemi)
    }
}

export function handleUpperFinalResult(
    save: GameSave,
    tournament: TournamentSaveData,
    match: BracketMatchSaveData,
    _winnerId: string,
    loserId: string,
): void {
    void _winnerId
    const bracketMap = tournament.playoffBracket ? buildBracketIndex(tournament.playoffBracket) : undefined
    const groupId = match.id.split("_upper_final")[0]
    const lowerFinalId = `${groupId}_lower_final`
    let lowerFinal = bracketMap?.get(lowerFinalId)
        ?? tournament.playoffBracket?.find((m: BracketMatchSaveData) => m.id === lowerFinalId)
    if (!lowerFinal) {
        lowerFinal = {
            id: lowerFinalId,
            tournamentId: tournament.id,
            stage: `${match.stage.split(" ")[0]} Lower Final`,
            isCompleted: false,
            week: match.week + 2,
            format: "BO3",
            seed: match.seed + 1,
            sourceMatchIds: [],
        }
        addBracketMatch(tournament, lowerFinal)
    }
    lowerFinal.homeTeamId = loserId
    // Pair with the lower-bracket survivor (the lower-R2 winner). If R2 hasn't
    // resolved yet, handleLowerResult's lower_r2 branch fills + schedules this.
    const lowerR2 = bracketMap?.get(`${groupId}_lower_r2`)
        ?? tournament.playoffBracket?.find((m: BracketMatchSaveData) => m.id === `${groupId}_lower_r2`)
    if (lowerR2?.winnerId) {
        lowerFinal.awayTeamId = lowerR2.winnerId
        scheduleBracketMatch(save, lowerFinal)
    }
}

export function handleLowerResult(
    save: GameSave,
    tournament: TournamentSaveData,
    match: BracketMatchSaveData,
    winnerId: string,
    loserId: string,
    deps: BracketHandlerDeps,
): void {
    const bracketMap = tournament.playoffBracket ? buildBracketIndex(tournament.playoffBracket) : undefined
    const find = (id: string) =>
        bracketMap?.get(id) ?? tournament.playoffBracket?.find((m: BracketMatchSaveData) => m.id === id)
    const groupId = match.id.split("_lower")[0]
    const isLowerFinal = match.id.includes("lower_final")

    if (match.id.includes("lower_r1")) {
        // R1 winner → matching lower semi (away slot; home is the upper-semi loser).
        const matchIdx = parseInt(match.id.split("_").pop() || "0", 10)
        const semi = find(`${groupId}_lower_semi_${matchIdx}`)
        if (semi) {
            semi.awayTeamId = winnerId
            if (semi.homeTeamId && semi.awayTeamId) scheduleBracketMatch(save, semi)
        }
    } else if (match.id.includes("lower_semi")) {
        // Both lower-semi winners meet in lower R2 (created on demand): semi_0 →
        // home, semi_1 → away. This is the round the previous (incomplete)
        // implementation was missing, which orphaned a lower-semi winner.
        const matchIdx = parseInt(match.id.split("_").pop() || "0", 10)
        const r2Id = `${groupId}_lower_r2`
        let r2 = find(r2Id)
        if (!r2) {
            r2 = {
                id: r2Id,
                tournamentId: tournament.id,
                stage: `${match.stage.split(" ")[0]} Lower R2`,
                isCompleted: false,
                week: match.week + 1,
                format: "BO3",
                seed: match.seed + 1,
                sourceMatchIds: [],
            }
            addBracketMatch(tournament, r2)
        }
        if (matchIdx === 0) r2.homeTeamId = winnerId
        else r2.awayTeamId = winnerId
        if (r2.homeTeamId && r2.awayTeamId) scheduleBracketMatch(save, r2)
    } else if (match.id.includes("lower_r2")) {
        // R2 winner → lower final (away; home is the upper-final loser).
        const final = find(`${groupId}_lower_final`)
        if (final) {
            final.awayTeamId = winnerId
            if (final.homeTeamId && final.awayTeamId) scheduleBracketMatch(save, final)
        }
    } else if (isLowerFinal) {
        // Lower-final winner is the group's 2nd seed; both groups done → playoffs.
        deps.checkAndStartPlayoffs(save, tournament.id)
    }

    // Losing in the lower bracket eliminates you — EXCEPT the lower-final loser,
    // who is the group's 3rd seed and still advances to the playoff QF (see
    // generatePlayoffs, which seeds pA.third / pB.third).
    if (!isLowerFinal) {
        save.tournamentQualifications = QualificationEngine.updateStatus(
            save.tournamentQualifications,
            tournament.id,
            loserId,
            "ELIMINATED",
        )
        deps.notifyPlayerElimination(save, tournament, loserId)
    }
}
