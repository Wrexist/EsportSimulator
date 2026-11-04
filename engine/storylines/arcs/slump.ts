/**
 * Slump: a starter rated under 0.90 over his last five official maps.
 *
 *   0. Questions in the press (news) with his rating against his career one.
 *   1. Decision: back him publicly (morale, and the Phase 5.2 "you'll start"
 *      promise), bench him (he leaves the starting five; the 5.2 bench rules
 *      apply from there), or a rest week (fatigue and morale).
 *   2. Resolution: back in form (three maps at 1.00+ since the slump began),
 *      out of the side, or the slump runs past eight weeks.
 */

import type { ArcCandidate, ArcDefinition, StoryContext } from "../common"
import type { StoryArc } from "../types"
import { PERSONALITY_TUNING as P, STORY_TUNING as S } from "@/lib/balance-tuning"
import { benchSubstitute } from "../../event-choice"
import {
    clubRef, departedLine, fmtRating, formOver, joined, logBeat, nameOf, nextBeat, raiseDecision, resolveArc, rosterPlayers,
    said, stillAt, storyNews, takeAnswer, waitForDesk,
} from "../common"

const num = (arc: StoryArc, key: string) => Number(arc.facts[key] ?? 0)

function starters(ctx: StoryContext, teamId: string): string[] {
    return (ctx.team(teamId)?.rosterIds ?? []).slice(0, 5)
}

export const slump: ArcDefinition = {
    kind: "SLUMP",

    detect(ctx) {
        const team = ctx.managed
        if (!team) return []
        const five = new Set(starters(ctx, team.id))
        const out: ArcCandidate[] = []
        for (const p of rosterPlayers(ctx, team)) {
            if (p.injury || !five.has(p.id)) continue
            const r = formOver(p, team.id, S.SLUMP_MAPS)
            if (r === null || r >= S.SLUMP_RATING) continue
            // Well under his own standard, not just under the line.
            if (p.avgRating && r > p.avgRating - S.SLUMP_BELOW_CAREER) continue
            out.push({
                kind: "SLUMP", teamId: team.id, managed: true, playerIds: [p.id], clubIds: [], subject: p.id,
                score: 2 - r, facts: { rating: r, career: Math.round((p.avgRating || 0) * 100) / 100, mapsAtStart: p.mapsPlayed ?? 0 },
            })
        }
        return out
    },

    open(ctx, arc) {
        const p = ctx.player(arc.playerIds[0])
        const n = nameOf(p)
        const rating = fmtRating(num(arc, "rating"))
        storyNews(ctx, arc, "b0", said("sl.slump.newsTitle", { name: n }),
            said("sl.slump.newsBody", { name: n, rating, maps: S.SLUMP_MAPS, club: clubRef(ctx, arc.teamId), career: fmtRating(num(arc, "career")) }))
        logBeat(arc, ctx.week, said("sl.slump.log", { name: n, rating, maps: S.SLUMP_MAPS }))
        nextBeat(arc, ctx.week)
    },

    advance(ctx, arc) {
        const id = arc.playerIds[0]
        const n = nameOf(ctx.player(id))
        const choice = arc.beat >= 2
            ? takeAnswer(ctx, arc, "rest", (ch, byDefault) =>
                said(ch === "back" ? "sl.slump.ans.back" : ch === "bench" ? "sl.slump.ans.bench" : byDefault ? "sl.slump.ans.restDefault" : "sl.slump.ans.rest", { name: n }))
            : null
        const p = stillAt(ctx, id, arc.teamId)
        if (!p) return resolveArc(arc, ctx.week, "LEFT", departedLine(ctx, arc, id, n).line)

        if (arc.beat === 1) {
            const team = ctx.team(arc.teamId)!
            const sub = benchSubstitute(team, id, ctx.player)
            const subName = sub ? nameOf(ctx.player(sub)) : null
            const r = fmtRating(num(arc, "rating"))
            const raised = raiseDecision(ctx, arc, {
                title: said("sl.slump.title", { name: n }),
                playerId: id,
                message: joined("\n\n",
                    said("sl.slump.msg", { name: n, rating: r, maps: S.SLUMP_MAPS, career: fmtRating(num(arc, "career")) }),
                    joined("\n",
                        said("sl.optPromise", { morale: S.SLUMP_BACK_MORALE, promise: { key: "promise.START.promise" }, weeks: P.PROMISE_START_WEEKS, limit: P.PROMISE_START_BENCH_LIMIT, brokenMorale: P.PROMISE_BROKEN_MORALE, brokenLoyalty: P.PROMISE_BROKEN_LOYALTY }),
                        subName
                            ? said("sl.slump.optBench", { sub: subName, name: n, loss: Math.abs(S.SLUMP_BENCH_MORALE), matches: P.BENCH_MATCHES })
                            : said("sl.slump.optNoBench"),
                        said("sl.slump.optRest", { fatigue: S.SLUMP_REST_FATIGUE, morale: S.SLUMP_REST_MORALE }))),
                choices: [
                    { id: "back", text: said("sl.slump.c.back"), effects: { promise: "START", morale: S.SLUMP_BACK_MORALE } },
                    ...(subName ? [{ id: "bench", text: said("sl.slump.c.bench", { sub: subName }), effects: { bench: true, morale: S.SLUMP_BENCH_MORALE } }] : []),
                    { id: "rest", text: said("sl.slump.c.rest"), effects: { fatigue: S.SLUMP_REST_FATIGUE, morale: S.SLUMP_REST_MORALE } },
                ],
                defaultChoiceId: "rest",
                consequence: said("sl.slump.cons", { name: "{name}" }),
                label: said("sl.slump.label", { name: n }),
            })
            if (!raised) {
                if (!waitForDesk(arc, ctx.week)) resolveArc(arc, ctx.week, "FADED", said("sl.slump.fade", { name: n }))
                return
            }
            logBeat(arc, ctx.week, said("sl.slump.logAsk", { name: n }))
            return nextBeat(arc, ctx.week)
        }

        arc.nextWeek = ctx.week + 1
        if (choice === null) return
        // Back in form: RECOVERY_MAPS maps since the slump began, averaging RECOVERY_RATING+.
        const since = (p.mapsPlayed ?? 0) - num(arc, "mapsAtStart")
        const recent = formOver(p, arc.teamId, S.RECOVERY_MAPS)
        if (since >= S.RECOVERY_MAPS && recent !== null && recent >= S.RECOVERY_RATING) {
            const text = said("sl.slump.recovered", { name: n, rating: fmtRating(recent), maps: S.RECOVERY_MAPS })
            storyNews(ctx, arc, "end", said("sl.slump.recoveredTitle", { name: n }), text)
            return resolveArc(arc, ctx.week, "RECOVERED", text)
        }
        const benched = p.personality?.apps?.teamId === arc.teamId ? p.personality.apps.benched : 0
        if (benched >= S.DROPPED_BENCHED) {
            const text = said("sl.slump.dropped", { name: n }, benched)
            storyNews(ctx, arc, "end", said("sl.slump.droppedTitle", { name: n }), text)
            return resolveArc(arc, ctx.week, "DROPPED", text)
        }
        if (ctx.week >= arc.startedWeek + S.SLUMP_MAX_WEEKS) {
            const r = formOver(p, arc.teamId, S.SLUMP_MAPS)
            const text = r !== null ? said("sl.slump.goesOn", { name: n, rating: fmtRating(r), maps: S.SLUMP_MAPS }) : said("sl.slump.fewMaps", { name: n })
            storyNews(ctx, arc, "end", said("sl.slump.goesOnTitle", { name: n }), text)
            resolveArc(arc, ctx.week, "FADED", text)
        }
    },
}
