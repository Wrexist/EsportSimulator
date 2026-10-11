/**
 * Giant-killer run: a club, managed or not, beats two or more clubs ranked
 * GIANT_RANK_GAP+ world-ranking places above it in official matches within
 * GIANT_WINDOW_WEEKS. Another club's run makes news only when both beaten
 * clubs are in the top GIANT_AI_MAX_OPP_RANK.
 *
 *   0. News with the beaten clubs, their ranks and the scores. The managed
 *      club's run also brings GIANT_FANS followers and GIANT_BOARD board
 *      confidence, applied once and stated in the story.
 *   1. The club's next official result: the run goes on or ends.
 */

import type { ArcCandidate, ArcDefinition, StoryContext } from "../common"
import type { GameEventSaveData } from "../../save-types"
import { STORY_TUNING as S } from "@/lib/balance-tuning"
import { applyChoiceEffects } from "../../event-choice"
import { sideScore } from "@/lib/week-changes"
import { clubOf, competitionName, logBeat, nextBeat, resolveArc, storyNews } from "../common"

interface Upset { loserId: string; matchId: string; score: string; week: number }

const official = (m: { isScrim?: boolean; tournamentId?: string | null }) => !m.isScrim && !!m.tournamentId && m.tournamentId !== "SCRIM"

/** Places above the winner a beaten club must be: GIANT_RANK_GAP, or GIANT_RANK_SHARE of the winner's rank further down the table. */
const rankGap = (winnerRank: number) => Math.max(S.GIANT_RANK_GAP, Math.ceil(winnerRank * S.GIANT_RANK_SHARE))

function recentUpsets(ctx: StoryContext): Map<string, Upset[]> {
    const out = new Map<string, Upset[]>()
    const from = ctx.week - S.GIANT_WINDOW_WEEKS + 1
    const list = ctx.save.completedMatches
    for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i]
        // The log is appended week by week (live matches a week behind): stop well past the window.
        if (m.week < from - 4) break
        if (m.week < from || m.week > ctx.week || !official(m) || !m.result?.winnerId || !m.result.maps?.length) continue
        const winner = m.result.winnerId
        const loser = winner === m.homeTeamId ? m.awayTeamId : m.homeTeamId
        const wr = ctx.team(winner)?.worldRanking ?? 0, lr = ctx.team(loser)?.worldRanking ?? 0
        if (wr <= 0 || lr <= 0 || lr > wr - rankGap(wr)) continue
        const rows = out.get(winner) ?? []
        if (!rows.some(r => r.loserId === loser)) rows.push({ loserId: loser, matchId: m.id, score: sideScore(m.result, m.homeTeamId === winner), week: m.week })
        out.set(winner, rows)
    }
    return out
}

export const giantKiller: ArcDefinition = {
    kind: "GIANT_KILLER",

    detect(ctx) {
        const out: ArcCandidate[] = []
        for (const [teamId, upsets] of recentUpsets(ctx)) {
            if (upsets.length < 2) continue
            const managed = teamId === ctx.managed?.id
            const rank = ctx.team(teamId)?.worldRanking ?? 0
            const beaten = [...upsets].sort((a, b) => (ctx.team(a.loserId)?.worldRanking ?? 999) - (ctx.team(b.loserId)?.worldRanking ?? 999) || a.loserId.localeCompare(b.loserId)).slice(0, 2)
            if (!managed && beaten.some(u => (ctx.team(u.loserId)?.worldRanking ?? 999) > S.GIANT_AI_MAX_OPP_RANK)) continue
            const gap = beaten.reduce((s, u) => s + rank - (ctx.team(u.loserId)?.worldRanking ?? rank), 0)
            out.push({
                kind: "GIANT_KILLER", teamId, managed, playerIds: [], clubIds: beaten.map(u => u.loserId), subject: teamId,
                score: gap,
                facts: {
                    rank,
                    ...Object.fromEntries(beaten.flatMap((u, i) => [[`rank${i}`, ctx.team(u.loserId)?.worldRanking ?? 0], [`score${i}`, u.score], [`match${i}`, u.matchId]])),
                },
            })
        }
        return out
    },

    open(ctx, arc) {
        const club = clubOf(ctx, arc.teamId)
        const beaten = arc.clubIds.map((id, i) => `${clubOf(ctx, id)} (#${arc.facts[`rank${i}`]}) ${arc.facts[`score${i}`]}`)
        let content = `${club} (#${arc.facts.rank}) have beaten ${beaten.join(" and ")} in official matches within ${S.GIANT_WINDOW_WEEKS} weeks. Ranks as they stand today.`
        if (arc.managed) {
            const pseudo = { id: `story_${arc.id}`, type: "STORYLINE", week: ctx.week, acknowledged: true, data: { teamId: arc.teamId } } as unknown as GameEventSaveData
            const label = `Giant-killer run: beat ${arc.clubIds.map(id => clubOf(ctx, id)).join(" and ")}`
            if (applyChoiceEffects(ctx.save, pseudo, { fans: S.GIANT_FANS, board: S.GIANT_BOARD }, { id: () => pseudo.id, description: label })) {
                content += ` The run brings ${S.GIANT_FANS.toLocaleString("en-US")} new followers, and the board's confidence rises by ${S.GIANT_BOARD}.`
                ctx.applied.push(label)
            }
        }
        storyNews(ctx, arc, "b0", `Giant-killers: ${club}`, content)
        logBeat(arc, ctx.week, `${club} beat ${beaten.join(" and ")}.`)
        nextBeat(arc, ctx.week)
    },

    advance(ctx, arc) {
        const counted = new Set([arc.facts.match0, arc.facts.match1].map(String))
        const club = clubOf(ctx, arc.teamId)
        let next: (typeof ctx.save.completedMatches)[number] | undefined
        for (let i = ctx.save.completedMatches.length - 1; i >= 0; i--) {
            const m = ctx.save.completedMatches[i]
            if (m.week < arc.startedWeek - 4) break
            if (m.week < arc.startedWeek || counted.has(m.id) || !official(m) || !m.result || (m.homeTeamId !== arc.teamId && m.awayTeamId !== arc.teamId)) continue
            if (!next || m.week < next.week) next = m
        }
        if (!next?.result) {
            if (ctx.week >= arc.startedWeek + S.GIANT_RESOLVE_WEEKS) resolveArc(arc, ctx.week, "QUIET")
            else arc.nextWeek = ctx.week + 1
            return
        }
        const won = next.result.winnerId === arc.teamId
        const opp = clubOf(ctx, next.homeTeamId === arc.teamId ? next.awayTeamId : next.homeTeamId)
        const score = sideScore(next.result, next.homeTeamId === arc.teamId)
        const text = won ? `${club}'s run goes on: ${score} against ${opp} in ${competitionName(ctx, next)}.` : `${club}'s run ends: ${score} against ${opp} in ${competitionName(ctx, next)}.`
        storyNews(ctx, arc, "b1", won ? `${club} keep rolling` : `${club}'s run comes to an end`, text)
        resolveArc(arc, ctx.week, won ? "CONTINUES" : "ENDED", text)
    },
}
