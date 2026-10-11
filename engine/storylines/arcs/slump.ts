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
import { PROMISE_LABEL } from "../../personality"
import { benchSubstitute } from "../../event-choice"
import {
    clubOf, departure, fmtRating, formOver, logBeat, nameOf, nextBeat, raiseDecision, resolveArc, rosterPlayers,
    stillAt, storyNews, takeAnswer, usd, waitForDesk,
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
        storyNews(ctx, arc, "b0", `Questions over ${n}'s form`,
            `${n} is rated ${fmtRating(num(arc, "rating"))} over his last ${S.SLUMP_MAPS} official maps for ${clubOf(ctx, arc.teamId)}, against a career rating of ${fmtRating(num(arc, "career"))}.`)
        logBeat(arc, ctx.week, `${n} rated ${fmtRating(num(arc, "rating"))} over his last ${S.SLUMP_MAPS} maps.`)
        nextBeat(arc, ctx.week)
    },

    advance(ctx, arc) {
        const id = arc.playerIds[0]
        const n = nameOf(ctx.player(id))
        const choice = arc.beat >= 2
            ? takeAnswer(ctx, arc, "rest", (ch, byDefault) =>
                ch === "back" ? `You back ${n} in public and promise he starts.`
                    : ch === "bench" ? `${n} drops out of the starting five.`
                        : byDefault ? `Unanswered: ${n} gets a rest week.` : `${n} gets a rest week.`)
            : null
        const p = stillAt(ctx, id, arc.teamId)
        if (!p) {
            const move = departure(ctx, id, arc.startedWeek)
            const text = move?.toTeamId && move.toTeamId !== arc.teamId
                ? `${n} has joined ${move.toTeamName ?? clubOf(ctx, move.toTeamId)}${move.fee > 0 ? ` for ${usd(move.fee)}` : ""}.`
                : `${n} has left ${clubOf(ctx, arc.teamId)}.`
            return resolveArc(arc, ctx.week, "LEFT", text)
        }

        if (arc.beat === 1) {
            const team = ctx.team(arc.teamId)!
            const sub = benchSubstitute(team, id, ctx.player)
            const subName = sub ? nameOf(ctx.player(sub)) : null
            const r = fmtRating(num(arc, "rating"))
            const raised = raiseDecision(ctx, arc, {
                title: `${n}'s slump`,
                playerId: id,
                message: `${n} is rated ${r} over his last ${S.SLUMP_MAPS} official maps (career ${fmtRating(num(arc, "career"))}). The press wants to know if he keeps his place.\n\n`
                    + `Back him: morale +${S.SLUMP_BACK_MORALE} and your word "${PROMISE_LABEL.START.promise}" for ${P.PROMISE_START_WEEKS} weeks (broken if he sits out ${P.PROMISE_START_BENCH_LIMIT} official matches in a row while fit: morale ${P.PROMISE_BROKEN_MORALE}, loyalty ${P.PROMISE_BROKEN_LOYALTY}).\n`
                    + (subName ? `Bench him: ${subName} takes his place in the starting five; ${n} loses ${Math.abs(S.SLUMP_BENCH_MORALE)} morale now, and after ${P.BENCH_MATCHES} official matches out a regular starter loses morale every week.\n` : `Bench him: not possible, no fit player outside the starting five.\n`)
                    + `Rest week: fatigue ${S.SLUMP_REST_FATIGUE}, morale +${S.SLUMP_REST_MORALE}; he keeps his place.`,
                choices: [
                    { id: "back", text: "Back him in public", effects: { promise: "START", morale: S.SLUMP_BACK_MORALE } },
                    ...(subName ? [{ id: "bench", text: `Bench him for ${subName}`, effects: { bench: true, morale: S.SLUMP_BENCH_MORALE } }] : []),
                    { id: "rest", text: "Give him a rest week", effects: { fatigue: S.SLUMP_REST_FATIGUE, morale: S.SLUMP_REST_MORALE } },
                ],
                defaultChoiceId: "rest",
                consequence: "gives {name} a rest week",
                label: `Slump (${n})`,
            })
            if (!raised) {
                if (!waitForDesk(arc, ctx.week)) resolveArc(arc, ctx.week, "FADED", `The club lets ${n}'s slump run its course.`)
                return
            }
            logBeat(arc, ctx.week, `The press asks whether ${n} keeps his place.`)
            return nextBeat(arc, ctx.week)
        }

        arc.nextWeek = ctx.week + 1
        if (choice === null) return
        // Back in form: RECOVERY_MAPS maps since the slump began, averaging RECOVERY_RATING+.
        const since = (p.mapsPlayed ?? 0) - num(arc, "mapsAtStart")
        const recent = formOver(p, arc.teamId, S.RECOVERY_MAPS)
        if (since >= S.RECOVERY_MAPS && recent !== null && recent >= S.RECOVERY_RATING) {
            const text = `${n} is back in form: rated ${fmtRating(recent)} over his last ${S.RECOVERY_MAPS} official maps.`
            storyNews(ctx, arc, "end", `${n} answers his critics`, text)
            return resolveArc(arc, ctx.week, "RECOVERED", text)
        }
        const benched = p.personality?.apps?.teamId === arc.teamId ? p.personality.apps.benched : 0
        if (benched >= S.DROPPED_BENCHED) {
            const text = `${n} is out of the side: ${benched} official matches in a row on the bench.`
            storyNews(ctx, arc, "end", `${n} loses his place`, text)
            return resolveArc(arc, ctx.week, "DROPPED", text)
        }
        if (ctx.week >= arc.startedWeek + S.SLUMP_MAX_WEEKS) {
            const r = formOver(p, arc.teamId, S.SLUMP_MAPS)
            const text = r !== null ? `${n}'s slump goes on: rated ${fmtRating(r)} over his last ${S.SLUMP_MAPS} official maps.` : `${n} has played few official maps since the slump began.`
            storyNews(ctx, arc, "end", `No end yet to ${n}'s slump`, text)
            resolveArc(arc, ctx.week, "FADED", text)
        }
    },
}
