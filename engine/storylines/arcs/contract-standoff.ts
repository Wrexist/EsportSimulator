/**
 * Contract standoff: one of the club's STANDOFF_TOP_N highest-rated players
 * (the starting-five calibre), Ambitious or Mercenary, in the final year of
 * his deal (STANDOFF_MIN_WEEKS-STANDOFF_MAX_WEEKS left) with no new one, and
 * not one the club signed in the last STANDOFF_MIN_TENURE_WEEKS.
 * At most MAX_PER_SEASON a season (engine/storylines/index.ts).
 *
 *   0. His agent goes public (news).
 *   1. Talks (decision): offer the stated wage now (a real renewal), wait, or
 *      transfer-list him.
 *   2. Resolution: renewed (any route), he leaves, or, having waited, he hands
 *      in a transfer request (the Phase 5.2 path) in the week the talks named:
 *      STANDOFF_PATIENCE_WEEKS after the talks, or STANDOFF_REQUEST_BEFORE_END
 *      before his deal ends if that is sooner.
 *
 * Weeks in its texts are kept as season weeks ("Week 13, season 2"), never the
 * career's absolute week (HOME-22).
 */

import type { ArcCandidate, ArcDefinition, StoryContext } from "../common"
import type { StoryArc } from "../types"
import { STORY_TUNING as S } from "@/lib/balance-tuning"
import { weekRef } from "@/lib/season-week"
import { ensurePersonality, getArchetype, renewalSalary } from "../../personality"
import { evaluatePlayer } from "../../player-evaluation"
import { transferRequestEvent } from "../../processors/dressing-room"
import {
    clubRef, departedLine, joined, logBeat, nameOf, nextBeat, openTransferRequest, raiseDecision, rankedRef, resolveArc,
    rosterPlayers, said, seasonOf, stillAt, storyNews, takeAnswer, usd, waitForDesk, weeksRef,
} from "../common"

/** Weeks into a tenure before a standoff can start (NEWPLAYER-06). */
export const NEW_MANAGER_GRACE_WEEKS = 4

const num = (arc: StoryArc, key: string) => Number(arc.facts[key] ?? 0)

/** MODES-20: the club signed him (a transfer or a free agent) within STANDOFF_MIN_TENURE_WEEKS. */
function signedRecently(ctx: StoryContext, playerId: string, teamId: string): boolean {
    return (ctx.save.transferHistory ?? []).some(r => r.type === "TRANSFER" && r.playerId === playerId && r.toTeamId === teamId && ctx.week - r.week < S.STANDOFF_MIN_TENURE_WEEKS)
}

function left(ctx: StoryContext, arc: StoryArc, playerId: string): void {
    const n = nameOf(ctx.player(playerId))
    const text = departedLine(ctx, arc, playerId, n, { free: true }).line
    storyNews(ctx, arc, "end", said("sl.cs.leavesTitle", { name: n, club: clubRef(ctx, arc.teamId) }), joined(" ", text, said("sl.cs.standoffOver")))
    resolveArc(arc, ctx.week, "LEFT", text)
}

export const contractStandoff: ArcDefinition = {
    kind: "CONTRACT_STANDOFF",

    detect(ctx) {
        const team = ctx.managed
        if (!team) return []
        // NEWPLAYER-06: a new manager first gets a few weeks with the squad
        // before an agent goes public (the first report led with a standoff).
        if (ctx.week - (ctx.save.managerDetails?.tenureStartWeek ?? 1) < NEW_MANAGER_GRACE_WEEKS) return []
        const top = rosterPlayers(ctx, team).sort((a, b) => ctx.ovr(b) - ctx.ovr(a) || a.id.localeCompare(b.id)).slice(0, S.STANDOFF_TOP_N)
        const out: ArcCandidate[] = []
        top.forEach((p, i) => {
            const archetype = getArchetype(p)
            if (archetype !== "AMBITIOUS" && archetype !== "MERCENARY") return
            if (p.forSale || openTransferRequest(ctx, p.id)) return
            const c = ctx.contract(p.id, team.id)
            if (!c) return
            const weeksLeft = c.endWeek - ctx.week
            if (weeksLeft < S.STANDOFF_MIN_WEEKS || weeksLeft > S.STANDOFF_MAX_WEEKS) return
            if (signedRecently(ctx, p.id, team.id)) return
            out.push({
                kind: "CONTRACT_STANDOFF", teamId: team.id, managed: true, playerIds: [p.id], clubIds: [], subject: p.id,
                score: 100 - weeksLeft,
                facts: { endWeek: c.endWeek, wage: c.salaryPerWeek, rank: i + 1, ovr: Math.round(ctx.ovr(p)), archetype },
            })
        })
        return out
    },

    open(ctx, arc) {
        const p = ctx.player(arc.playerIds[0])
        const n = nameOf(p)
        const weeksLeft = num(arc, "endWeek") - ctx.week
        const archetype = getArchetype(p ?? { id: arc.playerIds[0] })
        storyNews(ctx, arc, "b0", said("sl.cs.agentTitle", { name: n }),
            said("sl.cs.agentBody", {
                name: n, weeks: weeksRef(weeksLeft), club: clubRef(ctx, arc.teamId), end: weekRef(num(arc, "endWeek")),
                rank: rankedRef(num(arc, "rank")), ovr: num(arc, "ovr"), wage: usd(num(arc, "wage")), personality: { key: `arch.${archetype}.label` },
            }))
        logBeat(arc, ctx.week, said("sl.cs.agentLog", { name: n, weeks: weeksRef(weeksLeft) }))
        nextBeat(arc, ctx.week)
    },

    advance(ctx, arc) {
        const id = arc.playerIds[0]
        const n = nameOf(ctx.player(id))
        // Beat 2: the talks were answered (or lapsed to their default) before anything else is judged.
        const choice = arc.beat >= 2
            ? takeAnswer(ctx, arc, "wait", (ch, byDefault) =>
                ch === "offer" ? said("sl.cs.ans.offer", { wage: usd(num(arc, "ask")) })
                    : ch === "sell" ? said("sl.listedAt", { name: n, value: usd(num(arc, "value")) })
                        : said(byDefault ? "sl.cs.ans.waitDefault" : "sl.cs.ans.wait"))
            : null
        const p = stillAt(ctx, id, arc.teamId)
        if (!p) return left(ctx, arc, id)
        const c = ctx.contract(id, arc.teamId)
        if (c && c.endWeek > num(arc, "endWeek")) {
            const text = said("sl.cs.renewed", { name: n, club: clubRef(ctx, arc.teamId), wage: usd(c.salaryPerWeek), end: weekRef(c.endWeek) })
            storyNews(ctx, arc, "end", said("sl.cs.renewedTitle", { name: n }), joined(" ", text, said("sl.cs.over")))
            return resolveArc(arc, ctx.week, "RENEWED", text)
        }
        if (!c) return left(ctx, arc, id)

        if (arc.beat === 1) {
            const wage = c.salaryPerWeek
            const ask = Math.max(wage + 1, Math.round(renewalSalary(p, wage, ctx.week) * S.STANDOFF_PREMIUM))
            const raise = Math.round((ask / Math.max(1, wage) - 1) * 100)
            const runway = (ask - wage) * S.STANDOFF_RUNWAY_WEEKS
            const newEnd = c.endWeek + S.STANDOFF_EXTENSION_WEEKS
            const requestWeek = Math.max(ctx.week + S.DECISION_WINDOW + 1, Math.min(c.endWeek - S.STANDOFF_REQUEST_BEFORE_END, ctx.week + S.STANDOFF_PATIENCE_WEEKS))
            const value = Math.round(evaluatePlayer(p, undefined, undefined, ctx.week).transferValue)
            const raised = raiseDecision(ctx, arc, {
                title: said("sl.cs.title", { name: n }),
                playerId: id,
                message: joined("\n\n",
                    said("sl.cs.msg", { name: n, end: weekRef(c.endWeek), weeks: weeksRef(c.endWeek - ctx.week), wage: usd(wage), ask: usd(ask), raise }),
                    joined("\n",
                        said("sl.cs.optOffer", { ask: usd(ask), ext: weeksRef(S.STANDOFF_EXTENSION_WEEKS), end: weekRef(newEnd), morale: S.STANDOFF_OFFER_MORALE, loyalty: S.STANDOFF_OFFER_LOYALTY, runway: usd(runway), runwayWeeks: weeksRef(S.STANDOFF_RUNWAY_WEEKS) }),
                        said("sl.cs.optWait", { week: weekRef(requestWeek) }),
                        said("sl.optSell", { value: usd(value) }))),
                choices: [
                    { id: "offer", text: said("sl.cs.c.offer", { ask: usd(ask), end: weekRef(newEnd) }), effects: { renew: { salary: ask, weeks: S.STANDOFF_EXTENSION_WEEKS, current: wage }, morale: S.STANDOFF_OFFER_MORALE, loyalty: S.STANDOFF_OFFER_LOYALTY } },
                    { id: "wait", text: said("sl.cs.c.wait"), effects: { follows: { key: "sl.next.request", params: { week: weekRef(requestWeek) } } } },
                    { id: "sell", text: said("sl.c.list"), effects: { transferList: true } },
                ],
                defaultChoiceId: "wait",
                consequence: said("sl.cs.cons", { name: "{name}" }),
                label: said("sl.cs.label", { name: n }),
            })
            if (!raised) {
                if (!waitForDesk(arc, ctx.week)) resolveArc(arc, ctx.week, "FADED", said("sl.cs.fade", { name: n }))
                return
            }
            Object.assign(arc.facts, { ask, requestWeek, value })
            logBeat(arc, ctx.week, said("sl.cs.logAsk", { name: n, ask: usd(ask), raise }))
            return nextBeat(arc, ctx.week)
        }

        // Beat 2: what follows from the answer.
        arc.nextWeek = ctx.week + 1
        if (choice === null) return
        // An accepted offer renews on the spot (checked above); anything else here has gone stale.
        if (choice === "offer") return resolveArc(arc, ctx.week, "FADED")
        if (choice === "sell") {
            if (ctx.week >= num(arc, "decidedWeek") + S.LISTED_RESOLVE_WEEKS) {
                const text = said("sl.cs.unsold", { name: n, weeks: weeksRef(S.LISTED_RESOLVE_WEEKS), end: weekRef(c.endWeek) })
                storyNews(ctx, arc, "end", said("sl.cs.unsoldTitle", { name: n }), text)
                resolveArc(arc, ctx.week, "UNSOLD", text)
            }
            return
        }
        if (choice === "wait" && ctx.week >= num(arc, "requestWeek")) {
            const team = ctx.team(arc.teamId)!
            if (!openTransferRequest(ctx, id)) {
                const event = transferRequestEvent(p, team, ctx.week, { reason: "CONTRACT", ref: { key: "tr.req.contract", params: { week: weekRef(c.endWeek) } } })
                ctx.save.eventsLog.push(event)
                ctx.openDecisions++
                ensurePersonality(p).personality!.lastRequestWeek = ctx.week
                const room = (team.dressingRoom ??= {})
                room.requestWeeks = [...(room.requestWeeks ?? []).filter(w => seasonOf(w) === seasonOf(ctx.week)), ctx.week]
            }
            const text = said("sl.cs.request", { name: n, end: weekRef(c.endWeek) })
            storyNews(ctx, arc, "end", said("sl.cs.requestTitle", { name: n }), joined(" ", text, said("sl.cs.requestTail")))
            resolveArc(arc, ctx.week, "REQUEST", text)
        }
    },
}
