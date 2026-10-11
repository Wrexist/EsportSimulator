/**
 * Dressing-room rift, from one of three real situations at the managed club:
 *  - a Hothead regular sitting out official matches while another starts;
 *  - a Hothead paid under WAGE_FAIRNESS_SHARE of a lower-rated team-mate;
 *  - two starters with amicability under RIFT_AMICABILITY after a bad run.
 *
 *   0. Tension (news) stating the situation.
 *   1. Decision: side with one, side with the other, or clear the air in
 *      front of the squad (chemistry cost, morale for both).
 *   2. Resolution three weeks later: both players' morale and the team's
 *      chemistry, or one of them has left.
 */

import type { ArcCandidate, ArcDefinition, StoryContext } from "../common"
import type { StoryArc } from "../types"
import type { PlayerSaveData } from "../../save-types"
import { PERSONALITY_TUNING as P, STORY_TUNING as S } from "@/lib/balance-tuning"
import { getArchetype } from "../../personality"
import { clubOf, logBeat, nameOf, nextBeat, raiseDecision, resolveArc, rosterPlayers, stillAt, storyNews, takeAnswer, usd, waitForDesk } from "../common"

const num = (arc: StoryArc, key: string) => Number(arc.facts[key] ?? 0)

function recentLosses(ctx: StoryContext, teamId: string, n: number): number {
    let seen = 0, lost = 0
    for (let i = ctx.save.completedMatches.length - 1; i >= 0 && seen < n; i--) {
        const m = ctx.save.completedMatches[i]
        if ((m.homeTeamId !== teamId && m.awayTeamId !== teamId) || m.isScrim || !m.tournamentId || m.tournamentId === "SCRIM" || !m.result) continue
        seen++
        if (m.result.winnerId !== teamId) lost++
    }
    return seen >= n ? lost : 0
}

export const rift: ArcDefinition = {
    kind: "RIFT",

    detect(ctx) {
        const team = ctx.managed
        if (!team) return []
        const roster = rosterPlayers(ctx, team)
        const five = roster.filter(p => team.rosterIds.indexOf(p.id) < 5)
        const out: ArcCandidate[] = []
        const make = (a: PlayerSaveData, b: PlayerSaveData, reason: string, score: number, facts: Record<string, number | string>) => out.push({
            kind: "RIFT", teamId: team.id, managed: true, playerIds: [a.id, b.id], clubIds: [], subject: a.id, score, facts: { reason, ...facts },
        })
        for (const a of roster) {
            if (getArchetype(a) !== "HOTHEAD" || a.injury) continue
            const apps = a.personality?.apps
            if (apps && apps.teamId === team.id && apps.regular && apps.benched >= P.BENCH_MATCHES) {
                // The starter keeping him out: the lowest-rated of the five.
                const b = [...five].filter(x => x.id !== a.id).sort((x, y) => ctx.ovr(x) - ctx.ovr(y) || x.id.localeCompare(y.id))[0]
                if (b) make(a, b, "BENCH", 3 + apps.benched, { benched: apps.benched })
                continue
            }
            const wageA = ctx.contract(a.id, team.id)?.salaryPerWeek
            if (!wageA) continue
            const b = roster.filter(x => x.id !== a.id).map(x => ({ x, wage: ctx.contract(x.id, team.id)?.salaryPerWeek ?? 0 }))
                .filter(({ x, wage }) => wageA < wage * P.WAGE_FAIRNESS_SHARE && ctx.ovr(x) <= ctx.ovr(a) - P.WAGE_FAIRNESS_MIN_GAP)
                .sort((u, v) => v.wage - u.wage || u.x.id.localeCompare(v.x.id))[0]
            if (b) make(a, b.x, "WAGE", 2, { wageA, wageB: b.wage, gap: Math.round(ctx.ovr(a) - ctx.ovr(b.x)) })
        }
        const lost = recentLosses(ctx, team.id, 3)
        if (lost >= 2) {
            const cold = five.filter(p => (p.amicability ?? 70) < S.RIFT_AMICABILITY).sort((x, y) => (x.amicability ?? 70) - (y.amicability ?? 70) || x.id.localeCompare(y.id))
            if (cold.length >= 2) make(cold[0], cold[1], "CLASH", 1, { amicA: cold[0].amicability, amicB: cold[1].amicability, lost })
        }
        return out
    },

    open(ctx, arc) {
        const a = ctx.player(arc.playerIds[0]), b = ctx.player(arc.playerIds[1])
        const A = nameOf(a), B = nameOf(b), club = clubOf(ctx, arc.teamId)
        const reason = String(arc.facts.reason)
        const text = reason === "BENCH"
            ? `${A} has sat out ${num(arc, "benched")} official matches in a row while ${B} starts, and the Hothead is making no secret of it.`
            : reason === "WAGE"
                ? `${A} earns ${usd(num(arc, "wageA"))} a week, less than ${B} on ${usd(num(arc, "wageB"))}, who is rated ${num(arc, "gap")} OVR lower. The Hothead has noticed.`
                : `${A} and ${B}, two of the least easy-going players in the squad (amicability ${num(arc, "amicA")} and ${num(arc, "amicB")}), clashed after ${club} lost ${num(arc, "lost")} of their last 3 official matches.`
        storyNews(ctx, arc, "b0", `Tension at ${club}: ${A} and ${B}`, text)
        logBeat(arc, ctx.week, text)
        nextBeat(arc, ctx.week)
    },

    advance(ctx, arc) {
        const [ida, idb] = arc.playerIds
        const A = nameOf(ctx.player(ida)), B = nameOf(ctx.player(idb))
        const choice = arc.beat >= 2
            ? takeAnswer(ctx, arc, "clear", (ch, byDefault) =>
                ch === "side_a" ? `You side with ${A}.` : ch === "side_b" ? `You side with ${B}.`
                    : byDefault ? "No answer by the deadline, so the club calls a team meeting." : "You clear the air in a team meeting.")
            : null
        const a = stillAt(ctx, ida, arc.teamId), b = stillAt(ctx, idb, arc.teamId)
        if (!a || !b) return resolveArc(arc, ctx.week, "LEFT", `${!a ? A : B} has left ${clubOf(ctx, arc.teamId)}; the rift goes with him.`)

        if (arc.beat === 1) {
            const raised = raiseDecision(ctx, arc, {
                title: `Dressing-room rift: ${A} and ${B}`,
                playerId: ida,
                message: `${arc.log[0]?.text ?? `${A} and ${B} are at odds.`}\n\n`
                    + `Side with ${A}: ${A} morale +${S.RIFT_SIDE_WITH}, ${B} morale ${S.RIFT_SIDE_AGAINST}.\n`
                    + `Side with ${B}: ${B} morale +${S.RIFT_SIDE_WITH}, ${A} morale ${S.RIFT_SIDE_AGAINST}.\n`
                    + `Clear the air in a team meeting: team chemistry ${S.RIFT_CLEAR_CHEMISTRY}, both players morale +${S.RIFT_CLEAR_MORALE}.`,
                choices: [
                    { id: "side_a", text: `Side with ${A}`, effects: { players: [{ id: ida, name: A, morale: S.RIFT_SIDE_WITH }, { id: idb, name: B, morale: S.RIFT_SIDE_AGAINST }] } },
                    { id: "side_b", text: `Side with ${B}`, effects: { players: [{ id: idb, name: B, morale: S.RIFT_SIDE_WITH }, { id: ida, name: A, morale: S.RIFT_SIDE_AGAINST }] } },
                    { id: "clear", text: "Clear the air in a team meeting", effects: { chemistry: S.RIFT_CLEAR_CHEMISTRY, players: [{ id: ida, name: A, morale: S.RIFT_CLEAR_MORALE }, { id: idb, name: B, morale: S.RIFT_CLEAR_MORALE }] } },
                ],
                defaultChoiceId: "clear",
                consequence: "calls a team meeting to clear the air",
                label: `Rift (${A} and ${B})`,
            })
            if (!raised) {
                if (!waitForDesk(arc, ctx.week)) resolveArc(arc, ctx.week, "FADED", `The tension between ${A} and ${B} goes unaddressed.`)
                return
            }
            logBeat(arc, ctx.week, `The squad waits for your call on ${A} and ${B}.`)
            return nextBeat(arc, ctx.week)
        }

        arc.nextWeek = ctx.week + 1
        if (choice === null) return
        if (ctx.week < num(arc, "decidedWeek") + S.RIFT_RESOLVE_WEEKS) return
        const chem = Math.round(ctx.team(arc.teamId)?.chemistry ?? 0)
        const settled = a.morale >= 50 && b.morale >= 50
        const text = `${settled ? "The rift has settled" : "The rift lingers"} (${A} morale ${Math.round(a.morale)}, ${B} morale ${Math.round(b.morale)}, team chemistry ${chem}).`
        storyNews(ctx, arc, "end", settled ? `Calm returns at ${clubOf(ctx, arc.teamId)}` : `${A} and ${B}: still at odds`, text)
        resolveArc(arc, ctx.week, settled ? "SETTLED" : "LINGERS", text)
    },
}
