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
import { evaluatePlayer } from "../../player-evaluation"
import {
    clubRef, departedLine, fmtRating, formOver, formRatings, joined, logBeat, nameOf, nextBeat, raiseDecision, resolveArc,
    rosterPlayers, said, stillAt, storyNews, takeAnswer, usd, waitForDesk, weeksRef,
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
        const rating = fmtRating(num(arc, "rating"))
        storyNews(ctx, arc, "b0", said("sl.rs.newsTitle", { name: n, age: num(arc, "age") }),
            joined(" ",
                said("sl.rs.newsBody", { name: n, rating, maps: num(arc, "maps"), club: clubRef(ctx, arc.teamId), age: num(arc, "age") }),
                !!p?.avgRating && said("sl.rs.career", { rating: fmtRating(p.avgRating) }, p.mapsPlayed ?? 0)))
        logBeat(arc, ctx.week, said("sl.rs.log", { name: n, rating, maps: num(arc, "maps"), age: num(arc, "age") }))
        nextBeat(arc, ctx.week)
    },

    advance(ctx, arc) {
        const id = arc.playerIds[0]
        const n = nameOf(ctx.player(id))
        const choice = arc.beat >= 2
            ? takeAnswer(ctx, arc, "quiet", (ch, byDefault) =>
                ch === "promise" ? said("sl.rs.ans.promise", { name: n })
                    : ch === "list" ? said("sl.listedAt", { name: n, value: usd(num(arc, "value")) })
                        : said(byDefault ? "sl.rs.ans.quietDefault" : "sl.rs.ans.quiet"))
            : null
        const p = stillAt(ctx, id, arc.teamId)
        if (!p) {
            const { line: text, joined: sold } = departedLine(ctx, arc, id, n)
            storyNews(ctx, arc, "end", said(sold ? "sl.rs.soldTitle" : "sl.rs.leftTitle", { name: n }), text)
            return resolveArc(arc, ctx.week, sold ? "SOLD" : "LEFT", text)
        }

        if (arc.beat === 1) {
            const team = ctx.team(arc.teamId)!
            const value = Math.round(evaluatePlayer(p, undefined, undefined, ctx.week).transferValue)
            const myRank = team.worldRanking && team.worldRanking > 0 ? team.worldRanking : 999
            const able = ctx.save.teams.filter(t => t.id !== team.id && (t.worldRanking ?? 999) > 0 && (t.worldRanking ?? 999) < myRank && t.budget >= value).length
            const ableText = able === 0 ? said("sl.rs.ableNone", { team: team.name }) : said("sl.rs.able", { team: team.name }, able)
            const raised = raiseDecision(ctx, arc, {
                title: said("sl.rs.title", { name: n }),
                playerId: id,
                message: joined("\n\n",
                    joined(" ", said("sl.rs.msg", { name: n, age: num(arc, "age"), rating: fmtRating(num(arc, "rating")), maps: num(arc, "maps"), value: usd(value) }), ableText),
                    joined("\n",
                        said("sl.rs.optPromise", { morale: S.RISING_PROMISE_MORALE, loyalty: S.RISING_PROMISE_LOYALTY, promise: { key: "promise.START.promise" }, weeks: P.PROMISE_START_WEEKS, limit: P.PROMISE_START_BENCH_LIMIT, brokenMorale: P.PROMISE_BROKEN_MORALE, brokenLoyalty: P.PROMISE_BROKEN_LOYALTY }),
                        said("sl.rs.optList", { value: usd(value) }),
                        said("sl.rs.optQuiet"))),
                choices: [
                    { id: "promise", text: said("sl.rs.c.promise"), effects: { promise: "START", morale: S.RISING_PROMISE_MORALE, loyalty: S.RISING_PROMISE_LOYALTY } },
                    { id: "list", text: said("sl.rs.c.list"), effects: { transferList: true } },
                    { id: "quiet", text: said("sl.rs.c.quiet"), effects: {} },
                ],
                defaultChoiceId: "quiet",
                consequence: said("sl.rs.cons", { name: "{name}" }),
                label: said("sl.rs.label", { name: n }),
            })
            if (!raised) {
                if (!waitForDesk(arc, ctx.week)) resolveArc(arc, ctx.week, "FADED", said("sl.rs.fade", { name: n }))
                return
            }
            storyNews(ctx, arc, "b1", said("sl.rs.marketTitle", { name: n }), joined(" ", said("sl.rs.marketBody", { name: n, value: usd(value) }), ableText))
            Object.assign(arc.facts, { value, able })
            logBeat(arc, ctx.week, able === 0 ? said("sl.rs.logNone", { value: usd(value) }) : said("sl.rs.logAble", { value: usd(value) }, able))
            return nextBeat(arc, ctx.week)
        }

        arc.nextWeek = ctx.week + 1
        if (choice === null) return
        const decided = num(arc, "decidedWeek")
        if (choice === "promise") {
            const last = p.personality?.lastPromise
            if (last && last.kind === "START" && last.week >= decided) {
                const kept = last.outcome === "KEPT"
                const text = kept ? said("sl.rs.kept", { name: n, weeks: weeksRef(P.PROMISE_START_WEEKS) }) : said("sl.rs.broken", { name: n }, P.PROMISE_START_BENCH_LIMIT)
                storyNews(ctx, arc, "end", said(kept ? "sl.rs.keptTitle" : "sl.rs.brokenTitle", { name: n }),
                    joined(" ", text, said("sl.moraleLoyalty", kept ? { morale: `+${P.PROMISE_KEPT_MORALE}`, loyalty: `+${P.PROMISE_KEPT_LOYALTY}` } : { morale: P.PROMISE_BROKEN_MORALE, loyalty: P.PROMISE_BROKEN_LOYALTY })))
                resolveArc(arc, ctx.week, kept ? "KEPT" : "BROKEN", text)
            } else if (!p.personality?.promise && ctx.week > decided + P.PROMISE_START_WEEKS + 1) {
                resolveArc(arc, ctx.week, "FADED")
            }
            return
        }
        if (choice === "list") {
            if (!p.forSale || ctx.week >= decided + S.LISTED_RESOLVE_WEEKS) {
                const text = p.forSale ? said("sl.rs.unsold", { value: usd(num(arc, "value")), name: n, weeks: weeksRef(S.LISTED_RESOLVE_WEEKS) }) : said("sl.rs.offList", { name: n })
                storyNews(ctx, arc, "end", said("sl.rs.staysTitle", { name: n }), text)
                resolveArc(arc, ctx.week, "UNSOLD", text)
            }
            return
        }
        if (ctx.week >= decided + S.RISING_QUIET_RESOLVE_WEEKS) {
            const form = recentRating(ctx, id, arc.teamId)
            const text = form ? said("sl.rs.now", { name: n, rating: fmtRating(form.rating), maps: form.maps }) : said("sl.rs.fewMaps", { name: n })
            storyNews(ctx, arc, "end", said("sl.rs.standsTitle", { name: n }), text)
            resolveArc(arc, ctx.week, "QUIET", text)
        }
    },
}
