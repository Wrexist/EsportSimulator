/**
 * Contract standoff: one of the club's three highest-rated players, Ambitious
 * or Mercenary, with 6–12 weeks left and no new deal.
 *
 *   0. His agent goes public (news).
 *   1. Talks (decision): offer the stated wage now (a real renewal), wait, or
 *      transfer-list him.
 *   2. Resolution: renewed (any route), he leaves, or, having waited, he hands
 *      in a transfer request (the Phase 5.2 path) in the week the talks named.
 */

import type { ArcCandidate, ArcDefinition, StoryContext } from "../common"
import type { StoryArc } from "../types"
import { STORY_TUNING as S } from "@/lib/balance-tuning"
import { ARCHETYPE_INFO, ensurePersonality, getArchetype, renewalSalary } from "../../personality"
import { evaluatePlayer } from "../../player-evaluation"
import { transferRequestEvent } from "../../processors/dressing-room"
import {
    clubOf, departure, highestText, logBeat, nameOf, nextBeat, openTransferRequest, raiseDecision, resolveArc,
    rosterPlayers, seasonOf, stillAt, storyNews, takeAnswer, usd, waitForDesk,
} from "../common"

const num = (arc: StoryArc, key: string) => Number(arc.facts[key] ?? 0)

function left(ctx: StoryContext, arc: StoryArc, playerId: string): void {
    const p = ctx.player(playerId)
    const move = departure(ctx, playerId, arc.startedWeek)
    const n = nameOf(p)
    const club = clubOf(ctx, arc.teamId)
    const text = p?.isRetired ? `${n} has retired.`
        : move?.toTeamId && move.toTeamId !== arc.teamId
            ? `${n} has joined ${move.toTeamName ?? clubOf(ctx, move.toTeamId)}${move.fee > 0 ? ` for ${usd(move.fee)}` : " on a free"}.`
            : `${n} has left ${club}.`
    storyNews(ctx, arc, "end", `${n} leaves ${club}`, `${text} The standoff over his contract is over.`)
    resolveArc(arc, ctx.week, "LEFT", text)
}

export const contractStandoff: ArcDefinition = {
    kind: "CONTRACT_STANDOFF",

    detect(ctx) {
        const team = ctx.managed
        if (!team) return []
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
        const label = ARCHETYPE_INFO[getArchetype(p ?? { id: arc.playerIds[0] })].label
        storyNews(ctx, arc, "b0", `${n}'s agent goes public`,
            `${n} has ${weeksLeft} weeks left on his contract at ${clubOf(ctx, arc.teamId)}, which ends in Week ${num(arc, "endWeek")}, and no new deal on the table. `
            + `His agent points to his standing: the club's ${highestText(num(arc, "rank"))}-rated player (OVR ${num(arc, "ovr")}) on ${usd(num(arc, "wage"))} a week. Personality: ${label}.`)
        logBeat(arc, ctx.week, `${n}'s agent goes public: ${weeksLeft} weeks left, no new terms.`)
        nextBeat(arc, ctx.week)
    },

    advance(ctx, arc) {
        const id = arc.playerIds[0]
        const n = nameOf(ctx.player(id))
        // Beat 2: the talks were answered (or lapsed to their default) before anything else is judged.
        const choice = arc.beat >= 2
            ? takeAnswer(ctx, arc, "wait", (ch, byDefault) =>
                ch === "offer" ? `You offer ${usd(num(arc, "ask"))} a week.`
                    : ch === "sell" ? `${n} goes on the transfer list at ${usd(num(arc, "value"))}.`
                        : byDefault ? "Unanswered: the club waits." : "The club waits for him to come round.")
            : null
        const p = stillAt(ctx, id, arc.teamId)
        if (!p) return left(ctx, arc, id)
        const c = ctx.contract(id, arc.teamId)
        if (c && c.endWeek > num(arc, "endWeek")) {
            const text = `${n} has signed a new deal at ${clubOf(ctx, arc.teamId)}: ${usd(c.salaryPerWeek)} a week, running to Week ${c.endWeek}.`
            storyNews(ctx, arc, "end", `${n} signs a new deal`, `${text} The standoff is over.`)
            return resolveArc(arc, ctx.week, "RENEWED", text)
        }
        if (!c) return left(ctx, arc, id)

        if (arc.beat === 1) {
            const wage = c.salaryPerWeek
            const ask = Math.max(wage + 1, Math.round(renewalSalary(p, wage) * S.STANDOFF_PREMIUM))
            const raise = Math.round((ask / Math.max(1, wage) - 1) * 100)
            const runway = (ask - wage) * S.STANDOFF_RUNWAY_WEEKS
            const newEnd = c.endWeek + S.STANDOFF_EXTENSION_WEEKS
            const requestWeek = Math.max(ctx.week + S.DECISION_WINDOW + 1, c.endWeek - S.STANDOFF_REQUEST_BEFORE_END)
            const value = Math.round(evaluatePlayer(p, undefined, undefined, ctx.week).transferValue)
            const raised = raiseDecision(ctx, arc, {
                title: `Contract talks: ${n}`,
                playerId: id,
                message: `${n} wants a new deal before his contract ends in Week ${c.endWeek} (${c.endWeek - ctx.week} weeks). He earns ${usd(wage)} a week; his agent asks ${usd(ask)} (+${raise}%).\n\n`
                    + `Offer the deal: ${usd(ask)} a week and ${S.STANDOFF_EXTENSION_WEEKS} more weeks, to Week ${newEnd}; morale +${S.STANDOFF_OFFER_MORALE}, loyalty +${S.STANDOFF_OFFER_LOYALTY}. The club must hold ${usd(runway)}, ${S.STANDOFF_RUNWAY_WEEKS} weeks of the raise.\n`
                    + `Wait: nothing changes now. If his deal is still unrenewed in Week ${requestWeek}, he hands in a transfer request.\n`
                    + `Sell: he goes on the transfer list at his market value of ${usd(value)}; clubs that can afford him may bid.`,
                choices: [
                    { id: "offer", text: `Offer ${usd(ask)} a week to Week ${newEnd}`, effects: { renew: { salary: ask, weeks: S.STANDOFF_EXTENSION_WEEKS, current: wage }, morale: S.STANDOFF_OFFER_MORALE, loyalty: S.STANDOFF_OFFER_LOYALTY } },
                    { id: "wait", text: "Wait for him to come round", effects: { follows: `Transfer request in Week ${requestWeek} if still unrenewed` } },
                    { id: "sell", text: "Put him on the transfer list", effects: { transferList: true } },
                ],
                defaultChoiceId: "wait",
                consequence: "waits: no offer is made to {name}",
                label: `Contract talks (${n})`,
            })
            if (!raised) {
                if (!waitForDesk(arc, ctx.week)) resolveArc(arc, ctx.week, "FADED", `Talks with ${n}'s agent stall.`)
                return
            }
            Object.assign(arc.facts, { ask, requestWeek, value })
            logBeat(arc, ctx.week, `Talks open: his agent asks ${usd(ask)} a week (+${raise}%).`)
            return nextBeat(arc, ctx.week)
        }

        // Beat 2: what follows from the answer.
        arc.nextWeek = ctx.week + 1
        if (choice === null) return
        // An accepted offer renews on the spot (checked above); anything else here has gone stale.
        if (choice === "offer") return resolveArc(arc, ctx.week, "FADED")
        if (choice === "sell") {
            if (ctx.week >= num(arc, "decidedWeek") + S.LISTED_RESOLVE_WEEKS) {
                const text = `No club has met the price for ${n} in ${S.LISTED_RESOLVE_WEEKS} weeks; he stays, deal ending in Week ${c.endWeek}.`
                storyNews(ctx, arc, "end", `No buyer for ${n}`, text)
                resolveArc(arc, ctx.week, "UNSOLD", text)
            }
            return
        }
        if (choice === "wait" && ctx.week >= num(arc, "requestWeek")) {
            const team = ctx.team(arc.teamId)!
            if (!openTransferRequest(ctx, id)) {
                const event = transferRequestEvent(p, team, ctx.week, { reason: "CONTRACT", text: `His contract ends in Week ${c.endWeek} and no new deal was offered.` })
                ctx.save.eventsLog.push(event)
                ctx.openDecisions++
                ensurePersonality(p).personality!.lastRequestWeek = ctx.week
                const room = (team.dressingRoom ??= {})
                room.requestWeeks = [...(room.requestWeeks ?? []).filter(w => seasonOf(w) === seasonOf(ctx.week)), ctx.week]
            }
            const text = `${n} hands in a transfer request: his deal ends in Week ${c.endWeek} with no new terms.`
            storyNews(ctx, arc, "end", `${n} asks to leave`, `${text} The club must now accept it, refuse it or make him a promise.`)
            resolveArc(arc, ctx.week, "REQUEST", text)
        }
    },
}
