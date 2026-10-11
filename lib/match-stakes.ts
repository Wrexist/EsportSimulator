/**
 * Match-stakes helpers. Pure functions used to surface "what does this
 * match mean" in the pre-match popup, the tactical context panel, and
 * the result screen.
 *
 * Extracted from the former TournamentMatchContext component so the
 * lighter pre-match popup can share the same vocabulary instead of
 * re-deriving stage semantics from a different code path.
 */

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

export const LEAGUE_STAKES: MatchStakes = {
    win: "3 points in the division table",
    loss: "No points from this round",
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

    if (isLeagueStage(stage)) return { ...LEAGUE_STAKES }

    if (stageLower.includes("grand final")
        || (stageLower.includes("final") && !stageLower.includes("semi") && !stageLower.includes("quarter"))) {
        return {
            win: "Win the tournament!",
            loss: isElimination ? "Runner-up finish" : "Second place",
        }
    }

    if (stageLower.includes("semi")) {
        return {
            win: nextStage || "Advance to Grand Final",
            loss: isElimination ? "Eliminated (3rd-4th place)" : "Drop to losers bracket",
        }
    }

    if (stageLower.includes("quarter")) {
        return {
            win: nextStage || "Advance to Semi-finals",
            loss: isElimination ? "Eliminated (5th-8th place)" : "Drop to losers bracket",
        }
    }

    if (stageLower.includes("round of 16") || stageLower.includes("ro16")) {
        return {
            win: nextStage || "Advance to Quarter-finals",
            loss: isElimination ? "Eliminated" : "Drop to losers bracket",
        }
    }

    if (stageLower.includes("round of 32") || stageLower.includes("ro32")) {
        return {
            win: nextStage || "Advance to Round of 16",
            loss: isElimination ? "Eliminated" : "Drop to losers bracket",
        }
    }

    if (stageLower.includes("swiss")) {
        return {
            win: "Improve record, move toward qualification",
            loss: "Record worsens, risk elimination at 0-3",
        }
    }

    if (stageLower.includes("group")) {
        return {
            win: "Improve group standings",
            loss: "Drop in group standings",
        }
    }

    return {
        win: nextStage || "Advance to next round",
        loss: isElimination ? "Eliminated from tournament" : "Continue in bracket",
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
            return `Championship match — ${opponentName} stands between you and the trophy.`
        case "elimination":
            return `Win-or-go-home against ${opponentName}.`
        case "advancement":
            return `Win to advance; a loss drops you to the losers' bracket.`
        case "ladder":
            return `${(stage || "").toLowerCase().includes("swiss") ? "Swiss round" : "Group stage"} — every result moves the standings.`
        case "league":
            return `League match — 3 points at stake against ${opponentName}.`
        case "regular":
        default:
            return `Tournament match against ${opponentName}.`
    }
}
