/**
 * Rising star: a player aged 21 or under rated 1.15+ over his last official
 * maps for the managed club.
 *
 *   0. Media hype (news) with his rating and maps.
 *   1. The market notices (news: his market value and how many higher-ranked
 *      clubs could pay it; no invented bids) and a decision: promise him a
 *      starting place (Phase 5.2 promise), list him (AI clubs bid through the
 *      real transfer-offer path), or say nothing.
 *   2. Resolution: the promise is kept or broken, he is sold or unsold, or
 *      a form update after a quiet spell.
 */

import type { ArcCandidate, ArcDefinition, StoryContext } from "../common"
import type { StoryArc } from "../types"
import { PERSONALITY_TUNING as P, STORY_TUNING as S } from "@/lib/balance-tuning"
import { PROMISE_LABEL } from "../../personality"
import { evaluatePlayer } from "../../player-evaluation"
import {
    clubOf, departure, fmtRating, formOver, formRatings, logBeat, nameOf, nextBeat, raiseDecision, resolveArc,
    rosterPlayers, stillAt, storyNews, takeAnswer, usd, waitForDesk,
} from "../common"

const num = (arc: StoryArc, key: string) => Number(arc.facts[key] ?? 0)

/** Rating over as many of his last FORM_WINDOW maps as he has (at least RISING_MIN_MAPS). */
function recentRating(ctx: StoryContext, playerId: string, teamId: string): { rating: number; maps: number } | null {
    const ratings = formRatings(ctx.player(playerId), teamId)
    if (ratings.length < S.RISING_MIN_MAPS) return null
    const maps = ratings.length
    return { rating: formOver(ctx.player(playerId), teamId, maps)!, maps }
}

export const risingStar: ArcDefinition = {
    kind: "RISING_STAR",

    detect(ctx) {
        const team = ctx.managed
        if (!team) return []
        const out: ArcCandidate[] = []
        for (const p of rosterPlayers(ctx, team)) {
            if ((p.age ?? 99) > S.RISING_MAX_AGE || p.forSale) continue
            const form = recentRating(ctx, p.id, team.id)
            if (!form || form.rating < S.RISING_RATING) continue
            out.push({
                kind: "RISING_STAR", teamId: team.id, managed: true, playerIds: [p.id], clubIds: [], subject: p.id,
                score: form.rating, facts: { rating: form.rating, maps: form.maps, age: p.age },
            })
        }
        return out
    },

    open(ctx, arc) {
        const p = ctx.player(arc.playerIds[0])
        const n = nameOf(p)
        const career = p?.avgRating ? ` His career rating stands at ${fmtRating(p.avgRating)} over ${p.mapsPlayed ?? 0} official maps.` : ""
        storyNews(ctx, arc, "b0", `${n}, ${num(arc, "age")}, is turning heads`,
            `${n} is rated ${fmtRating(num(arc, "rating"))} over his last ${num(arc, "maps")} official maps for ${clubOf(ctx, arc.teamId)}, at ${num(arc, "age")}.${career}`)
        logBeat(arc, ctx.week, `${n} rated ${fmtRating(num(arc, "rating"))} over his last ${num(arc, "maps")} maps at ${num(arc, "age")}.`)
        nextBeat(arc, ctx.week)
    },

    advance(ctx, arc) {
        const id = arc.playerIds[0]
        const n = nameOf(ctx.player(id))
        const choice = arc.beat >= 2
            ? takeAnswer(ctx, arc, "quiet", (ch, byDefault) =>
                ch === "promise" ? `You promise ${n} a starting place.`
                    : ch === "list" ? `${n} goes on the transfer list at ${usd(num(arc, "value"))}.`
                        : byDefault ? "No answer by the deadline, so the club says nothing." : "The club says nothing.")
            : null
        const p = stillAt(ctx, id, arc.teamId)
        if (!p) {
            const move = departure(ctx, id, arc.startedWeek)
            const sold = move?.toTeamId && move.toTeamId !== arc.teamId
            const text = sold
                ? `${n} has joined ${move!.toTeamName ?? clubOf(ctx, move!.toTeamId!)}${move!.fee > 0 ? ` for ${usd(move!.fee)}` : ""}.`
                : `${n} has left ${clubOf(ctx, arc.teamId)}.`
            storyNews(ctx, arc, "end", sold ? `${n} cashes in his rise` : `${n} leaves`, text)
            return resolveArc(arc, ctx.week, sold ? "SOLD" : "LEFT", text)
        }

        if (arc.beat === 1) {
            const team = ctx.team(arc.teamId)!
            const value = Math.round(evaluatePlayer(p, undefined, undefined, ctx.week).transferValue)
            const myRank = team.worldRanking && team.worldRanking > 0 ? team.worldRanking : 999
            const able = ctx.save.teams.filter(t => t.id !== team.id && (t.worldRanking ?? 999) > 0 && (t.worldRanking ?? 999) < myRank && t.budget >= value).length
            const ableText = able === 0 ? `No club ranked above ${team.name} has the funds to pay it.`
                : `${able} club${able === 1 ? "" : "s"} ranked above ${team.name} ${able === 1 ? "has" : "have"} the funds to pay it.`
            const raised = raiseDecision(ctx, arc, {
                title: `${n}'s rise: your call`,
                playerId: id,
                message: `${n} (${num(arc, "age")}) is rated ${fmtRating(num(arc, "rating"))} over his last ${num(arc, "maps")} official maps and his market value is ${usd(value)}. ${ableText}\n\n`
                    + `Promise him a starting place: morale +${S.RISING_PROMISE_MORALE}, loyalty +${S.RISING_PROMISE_LOYALTY}, and your word "${PROMISE_LABEL.START.promise}" for ${P.PROMISE_START_WEEKS} weeks (broken if he sits out ${P.PROMISE_START_BENCH_LIMIT} official matches in a row while fit: morale ${P.PROMISE_BROKEN_MORALE}, loyalty ${P.PROMISE_BROKEN_LOYALTY}).\n`
                    + `List him: he goes on the transfer list at ${usd(value)}; clubs that can afford him may bid.\n`
                    + `Say nothing: no change.`,
                choices: [
                    { id: "promise", text: "Promise him a starting place", effects: { promise: "START", morale: S.RISING_PROMISE_MORALE, loyalty: S.RISING_PROMISE_LOYALTY } },
                    { id: "list", text: "Cash in: put him on the transfer list", effects: { transferList: true } },
                    { id: "quiet", text: "Say nothing", effects: {} },
                ],
                defaultChoiceId: "quiet",
                consequence: "says nothing about {name}",
                label: `Rising star (${n})`,
            })
            if (!raised) {
                if (!waitForDesk(arc, ctx.week)) resolveArc(arc, ctx.week, "FADED", `The talk around ${n} dies down.`)
                return
            }
            storyNews(ctx, arc, "b1", `The market notices ${n}`, `${n}'s market value has reached ${usd(value)}. ${ableText}`)
            Object.assign(arc.facts, { value, able })
            logBeat(arc, ctx.week, able === 0 ? `Market value ${usd(value)}; no higher-ranked club could pay it.` : `Market value ${usd(value)}; ${able} higher-ranked club${able === 1 ? "" : "s"} could pay it.`)
            return nextBeat(arc, ctx.week)
        }

        arc.nextWeek = ctx.week + 1
        if (choice === null) return
        const decided = num(arc, "decidedWeek")
        if (choice === "promise") {
            const last = p.personality?.lastPromise
            if (last && last.kind === "START" && last.week >= decided) {
                const kept = last.outcome === "KEPT"
                const text = kept ? `${n} stayed in the side over the ${P.PROMISE_START_WEEKS} weeks, as promised.` : `${n} sat out ${P.PROMISE_START_BENCH_LIMIT} official matches in a row, breaking your promise.`
                storyNews(ctx, arc, "end", kept ? `${n} keeps his place` : `${n} feels let down`, `${text} Morale ${kept ? `+${P.PROMISE_KEPT_MORALE}` : P.PROMISE_BROKEN_MORALE}, loyalty ${kept ? `+${P.PROMISE_KEPT_LOYALTY}` : P.PROMISE_BROKEN_LOYALTY}.`)
                resolveArc(arc, ctx.week, kept ? "KEPT" : "BROKEN", text)
            } else if (!p.personality?.promise && ctx.week > decided + P.PROMISE_START_WEEKS + 1) {
                resolveArc(arc, ctx.week, "FADED")
            }
            return
        }
        if (choice === "list") {
            if (!p.forSale || ctx.week >= decided + S.LISTED_RESOLVE_WEEKS) {
                const text = p.forSale ? `No club has met the ${usd(num(arc, "value"))} valuation of ${n} in ${S.LISTED_RESOLVE_WEEKS} weeks.` : `${n} is off the transfer list and stays.`
                storyNews(ctx, arc, "end", `${n} stays`, text)
                resolveArc(arc, ctx.week, "UNSOLD", text)
            }
            return
        }
        if (ctx.week >= decided + S.RISING_QUIET_RESOLVE_WEEKS) {
            const form = recentRating(ctx, id, arc.teamId)
            const text = form ? `${n} is now rated ${fmtRating(form.rating)} over his last ${form.maps} official maps.` : `${n} has played few official maps since.`
            storyNews(ctx, arc, "end", `${n}: where the rise stands`, text)
            resolveArc(arc, ctx.week, "QUIET", text)
        }
    },
}
