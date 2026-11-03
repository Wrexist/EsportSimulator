/**
 * Match-stakes helpers. Pure functions used to surface "what does this
 * match mean" in the pre-match popup, the tactical context panel, and
 * the result screen.
 *
 * Extracted from the former TournamentMatchContext component so the
 * lighter pre-match popup can share the same vocabulary instead of
 * re-deriving stage semantics from a different code path.
 */

import { t } from "./i18n"
import { stageName } from "./display-names"

export interface MatchStakes {
    win: string
    loss: string
}

/**
 * Regional league fixtures carry their stage as "<Region> Division <n> ·
 * Round <r>" (engine/season/regional-league.ts). A league round is not a
 * bracket: no one advances or goes out, three points change hands.
 */
export function isLeagueStage(stage: string | undefined | null): boolean {
    return !!stage && /\bdivision \d+\s*·\s*round \d+\b/i.test(stage)
}

export function leagueStakes(): MatchStakes {
    return { win: t("stakes.league.win"), loss: t("stakes.league.loss") }
}

/**
 * What happens on win / loss, given a bracket stage name + format.
 */
export function getStakes(
    stage: string | undefined,
    isElimination: boolean,
    nextStage?: string,
): MatchStakes {
    const stageLower = stage?.toLowerCase() || ""

    if (isLeagueStage(stage)) return leagueStakes()
    const next = nextStage ? t("stakes.advanceTo", { stage: stageName(nextStage) }) : undefined

    if (stageLower.includes("grand final")
        || (stageLower.includes("final") && !stageLower.includes("semi") && !stageLower.includes("quarter"))) {
        return {
            win: t("stakes.final.win"),
            loss: isElimination ? t("stakes.final.lossElim") : t("stakes.final.loss"),
        }
    }

    if (stageLower.includes("semi")) {
        return {
            win: next || t("stakes.semi.win"),
            loss: isElimination ? t("stakes.semi.lossElim") : t("stakes.dropLosers"),
        }
    }

    if (stageLower.includes("quarter")) {
        return {
            win: next || t("stakes.quarter.win"),
            loss: isElimination ? t("stakes.quarter.lossElim") : t("stakes.dropLosers"),
        }
    }

    if (stageLower.includes("round of 16") || stageLower.includes("ro16")) {
        return {
            win: next || t("stakes.ro16.win"),
            loss: isElimination ? t("stakes.eliminated") : t("stakes.dropLosers"),
        }
    }

    if (stageLower.includes("round of 32") || stageLower.includes("ro32")) {
        return {
            win: next || t("stakes.ro32.win"),
            loss: isElimination ? t("stakes.eliminated") : t("stakes.dropLosers"),
        }
    }

    if (stageLower.includes("swiss")) {
        return {
            win: t("stakes.swiss.win"),
            loss: t("stakes.swiss.loss"),
        }
    }

    if (stageLower.includes("group")) {
        return {
            win: t("stakes.group.win"),
            loss: t("stakes.group.loss"),
        }
    }

    return {
        win: next || t("stakes.next.win"),
        loss: isElimination ? t("stakes.next.lossElim") : t("stakes.next.loss"),
    }
}

/**
 * Tone of the match — drives the pre-match chip palette.
 *
 * "championship" — grand-final / final
 * "elimination" — knockout where a loss ends the run
 * "advancement" — win = move forward, loss = drop but still playing
 * "ladder"      — Swiss / group; outcome shifts standings, no elimination
 * "league"      — a regional league round; three points, no elimination
 * "regular"     — fallback / unknown stage
 */
export type MatchTone = "championship" | "elimination" | "advancement" | "ladder" | "league" | "regular"

export function getMatchTone(stage: string | undefined, isElimination: boolean): MatchTone {
    if (isLeagueStage(stage)) return "league"
    const s = stage?.toLowerCase() || ""
    if (s.includes("grand final") || (s.includes("final") && !s.includes("semi") && !s.includes("quarter"))) {
        return "championship"
    }
    if (s.includes("semi") || s.includes("quarter") || s.includes("round of 16") || s.includes("ro16") || s.includes("round of 32") || s.includes("ro32")) {
        return isElimination ? "elimination" : "advancement"
    }
    if (s.includes("swiss") || s.includes("group")) return "ladder"
    return "regular"
}

/**
 * One-line headline for the pre-match popup. Compact narrative, not the
 * full win/loss table.
 */
export function getMatchHeadline(
    stage: string | undefined,
    isElimination: boolean,
    opponentName: string,
): string {
    const tone = getMatchTone(stage, isElimination)
    switch (tone) {
        case "championship":
            return t("stakes.headline.championship", { team: opponentName })
        case "elimination":
            return t("stakes.headline.elimination", { team: opponentName })
        case "advancement":
            return t("stakes.headline.advancement")
        case "ladder":
            return t((stage || "").toLowerCase().includes("swiss") ? "stakes.headline.swiss" : "stakes.headline.group")
        case "league":
            return t("stakes.headline.league", { team: opponentName })
        case "regular":
        default:
            return t("stakes.headline.regular", { team: opponentName })
    }
}
