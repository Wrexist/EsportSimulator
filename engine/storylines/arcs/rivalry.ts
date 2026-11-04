/**
 * Rivalry: the managed club's next official fixture against its biggest
 * rival (engine/history-tracker.ts: most meetings, at least
 * RIVAL_MIN_MEETINGS).
 *
 *   0. Build-up (news): the meeting number, the head-to-head and the heat.
 *      The press conference before the match asks about it.
 *   1. Aftermath (news): the real score and the match MVP with his rating.
 */

import type { ArcDefinition, StoryContext } from "../common"
import type { RivalryData, TeamSaveData } from "../../save-types"
import { STORY_TUNING as S } from "@/lib/balance-tuning"
import { getBiggestRival, getRivalryBetween } from "../../history-tracker"
import { sideScore } from "@/lib/week-changes"
import { ORDINAL_REF, type TextRef } from "@/lib/i18n"
import { clubRef, competitionRef, fmtRating, joined, logBeat, nameOf, nextBeat, resolveArc, said, storyNews } from "../common"

/** The club's biggest rival, once they have met RIVAL_MIN_MEETINGS times. */
export function biggestRival(team: TeamSaveData | undefined): RivalryData | null {
    const r = team ? getBiggestRival(team) : null
    return r && r.matchesPlayed >= S.RIVAL_MIN_MEETINGS ? r : null
}

/** "leads 4–2", "trails 1–3", "level at 2–2" from the club's side. */
export function headToHead(r: Pick<RivalryData, "wins" | "losses">): string {
    return r.wins > r.losses ? `leads ${r.wins}–${r.losses}` : r.wins < r.losses ? `trails ${r.wins}–${r.losses}` : `level at ${r.wins}–${r.losses}`
}

/** headToHead as a translatable value (same keys as the press conference). */
export const headToHeadRef = (r: Pick<RivalryData, "wins" | "losses">): TextRef =>
    ({ key: r.wins > r.losses ? "press.h2h.lead" : r.wins < r.losses ? "press.h2h.trail" : "press.h2h.level", params: { w: r.wins, l: r.losses } })

function nextFixture(ctx: StoryContext, teamId: string, rivalId: string) {
    let best: (typeof ctx.save.scheduledMatches)[number] | undefined
    for (const m of ctx.save.scheduledMatches) {
        if (m.week < ctx.week || m.week > ctx.week + S.RIVAL_LOOKAHEAD || m.isScrim || !m.tournamentId || m.tournamentId === "SCRIM") continue
        const pair = (m.homeTeamId === teamId && m.awayTeamId === rivalId) || (m.awayTeamId === teamId && m.homeTeamId === rivalId)
        if (pair && (!best || m.week < best.week || (m.week === best.week && (m.day ?? 6) < (best.day ?? 6)))) best = m
    }
    return best
}

export const rivalry: ArcDefinition = {
    kind: "RIVALRY",

    detect(ctx) {
        const team = ctx.managed
        const rival = biggestRival(team)
        if (!team || !rival) return []
        const m = nextFixture(ctx, team.id, rival.opponentTeamId)
        if (!m || ctx.save.completedMatches.some(c => c.id === m.id)) return []
        return [{
            kind: "RIVALRY", teamId: team.id, managed: true, playerIds: [], clubIds: [rival.opponentTeamId], subject: rival.opponentTeamId,
            score: rival.matchesPlayed,
            facts: { matchId: m.id, matchWeek: m.week, meetings: rival.matchesPlayed, wins: rival.wins, losses: rival.losses, intensity: rival.intensity },
        }]
    },

    open(ctx, arc) {
        const club = clubRef(ctx, arc.teamId), opp = clubRef(ctx, arc.clubIds[0])
        const m = ctx.save.scheduledMatches.find(x => x.id === arc.facts.matchId)
        const where = m ? competitionRef(ctx, m) : { key: "sl.riv.nextRound" }
        const h2h = headToHeadRef({ wins: Number(arc.facts.wins), losses: Number(arc.facts.losses) })
        const meeting = Number(arc.facts.meetings) + 1
        storyNews(ctx, arc, "b0", said("sl.riv.newsTitle", { club, opp }),
            said("sl.riv.newsBody", { club, opp, nth: { key: ORDINAL_REF, count: meeting }, week: String(arc.facts.matchWeek), where, h2h, intensity: { key: `rivalry.intensity.${String(arc.facts.intensity)}` } }))
        logBeat(arc, ctx.week, said("sl.riv.log", { club, h2h, opp, n: meeting, week: String(arc.facts.matchWeek) }))
        nextBeat(arc, ctx.week)
    },

    advance(ctx, arc) {
        const club = clubRef(ctx, arc.teamId), opp = clubRef(ctx, arc.clubIds[0])
        const done = ctx.save.completedMatches.find(c => c.id === arc.facts.matchId)
        if (!done?.result) {
            // Not played yet; a fixture that disappeared (withdrawn, compacted) ends the story.
            if (!ctx.save.scheduledMatches.some(m => m.id === arc.facts.matchId) || ctx.week > Number(arc.facts.matchWeek) + 1) resolveArc(arc, ctx.week, "VOID")
            else arc.nextWeek = ctx.week + 1
            return
        }
        const isHome = done.homeTeamId === arc.teamId
        const won = done.result.winnerId === arc.teamId
        const score = sideScore(done.result, isHome)
        if (!done.result.maps?.length) {
            const text = said("sl.riv.forfeit", { club: won ? club : opp })
            storyNews(ctx, arc, "b1", text, text)
            return resolveArc(arc, ctx.week, won ? "WON" : "LOST", text)
        }
        const mvpId = done.result.mvpPlayerId
        const mvp = mvpId ? ctx.player(mvpId) : undefined
        const mvpRating = mvpId ? done.result.playerStats?.[mvpId]?.rating : undefined
        const after = getRivalryBetween(ctx.team(arc.teamId) ?? ({} as TeamSaveData), arc.clubIds[0])
        const rated = typeof mvpRating === "number" && Number.isFinite(mvpRating)
        const title = said(won ? "sl.riv.wonTitle" : "sl.riv.lostTitle", { club, opp, score })
        const text = joined(" ",
            said(won ? "sl.riv.won" : "sl.riv.lost", { club, opp, score, competition: competitionRef(ctx, done) }),
            mvp && (rated ? said("sl.riv.mvpRated", { name: nameOf(mvp), rating: fmtRating(mvpRating!) }) : said("sl.riv.mvp", { name: nameOf(mvp) })),
            after && said("sl.riv.h2h", { club, h2h: headToHeadRef(after) }))
        storyNews(ctx, arc, "b1", title, text)
        // The story keeps a one-line version.
        const line = mvp
            ? said(won ? "sl.riv.lineWonMvp" : "sl.riv.lineLostMvp", { club, opp, score, name: nameOf(mvp), rating: rated ? ` (${fmtRating(mvpRating!)})` : "" })
            : said(won ? "sl.riv.lineWon" : "sl.riv.lineLost", { club, opp, score })
        resolveArc(arc, ctx.week, won ? "WON" : "LOST", line)
    },
}
