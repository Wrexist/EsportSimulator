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
import { clubOf, competitionName, fmtRating, logBeat, nameOf, nextBeat, resolveArc, storyNews } from "../common"

const ordinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"], v = n % 100
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

/** The club's biggest rival, once they have met RIVAL_MIN_MEETINGS times. */
export function biggestRival(team: TeamSaveData | undefined): RivalryData | null {
    const r = team ? getBiggestRival(team) : null
    return r && r.matchesPlayed >= S.RIVAL_MIN_MEETINGS ? r : null
}

/** "leads 4–2", "trails 1–3", "level at 2–2" from the club's side. */
export function headToHead(r: Pick<RivalryData, "wins" | "losses">): string {
    return r.wins > r.losses ? `leads ${r.wins}–${r.losses}` : r.wins < r.losses ? `trails ${r.wins}–${r.losses}` : `level at ${r.wins}–${r.losses}`
}

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
        const club = clubOf(ctx, arc.teamId), opp = clubOf(ctx, arc.clubIds[0])
        const m = ctx.save.scheduledMatches.find(x => x.id === arc.facts.matchId)
        const where = m ? competitionName(ctx, m) : "the next round"
        const h2h = headToHead({ wins: Number(arc.facts.wins), losses: Number(arc.facts.losses) })
        storyNews(ctx, arc, "b0", `${club} v ${opp}: the rivalry resumes`,
            `${club} and ${opp} meet for the ${ordinal(Number(arc.facts.meetings) + 1)} time in Week ${arc.facts.matchWeek} (${where}). ${club} ${h2h} in the head-to-head. Rivalry: ${String(arc.facts.intensity).toLowerCase()}.`)
        logBeat(arc, ctx.week, `${club} ${h2h} against ${opp} before meeting ${Number(arc.facts.meetings) + 1} in Week ${arc.facts.matchWeek}.`)
        nextBeat(arc, ctx.week)
    },

    advance(ctx, arc) {
        const club = clubOf(ctx, arc.teamId), opp = clubOf(ctx, arc.clubIds[0])
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
            const text = `${won ? `${club} win` : `${opp} win`} the derby by forfeit.`
            storyNews(ctx, arc, "b1", text, text)
            return resolveArc(arc, ctx.week, won ? "WON" : "LOST", text)
        }
        const mvpId = done.result.mvpPlayerId
        const mvp = mvpId ? ctx.player(mvpId) : undefined
        const mvpRating = mvpId ? done.result.playerStats?.[mvpId]?.rating : undefined
        const after = getRivalryBetween(ctx.team(arc.teamId) ?? ({} as TeamSaveData), arc.clubIds[0])
        const mvpLine = mvp ? ` MVP: ${nameOf(mvp)}${typeof mvpRating === "number" && Number.isFinite(mvpRating) ? ` (${fmtRating(mvpRating)} rating)` : ""}.` : ""
        const h2hLine = after ? ` Head-to-head: ${club} ${headToHead(after)}.` : ""
        const title = won ? `${club} take the derby ${score}` : `${opp} take the derby, ${club} lose ${score}`
        const text = `${club} ${won ? "beat" : "lost to"} ${opp} ${score} in ${competitionName(ctx, done)}.${mvpLine}${h2hLine}`
        storyNews(ctx, arc, "b1", title, text)
        // The story keeps a one-line version.
        const line = `${club} ${won ? "beat" : "lost to"} ${opp} ${score}${mvp ? `, ${nameOf(mvp)} the MVP${typeof mvpRating === "number" && Number.isFinite(mvpRating) ? ` (${fmtRating(mvpRating)})` : ""}` : ""}.`
        resolveArc(arc, ctx.week, won ? "WON" : "LOST", line)
    },
}
