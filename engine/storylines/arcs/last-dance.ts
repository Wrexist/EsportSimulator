/**
 * Veteran's last dance: a player aged 31+ whose season-end retirement chance
 * (engine/retirement-chance.ts) is at least LAST_DANCE_MIN_CHANCE.
 *
 *   0. He hints at retiring (news, with the real chance).
 *   1. Decision: persuade him (morale, loyalty, and the chance multiplied by
 *      PERSUADE_RETIREMENT_FACTOR this season), have him mentor a young
 *      team-mate (Phase 5.2 mentorship), or respect his decision.
 *   2. Week 52: farewell news with his career numbers, or he plays on.
 */

import type { ArcCandidate, ArcDefinition, StoryContext } from "../common"
import type { StoryArc } from "../types"
import type { PlayerSaveData } from "../../save-types"
import { PERSONALITY_TUNING as P, STORY_TUNING as S } from "@/lib/balance-tuning"
import { canBeMentored, canMentor } from "../../personality"
import { retirementChance } from "../../retirement-chance"
import {
    clubOf, fmtRating, logBeat, nameOf, nextBeat, raiseDecision, resolveArc, rosterPlayers, stillAt, storyNews,
    takeAnswer, waitForDesk, weekOfSeason,
} from "../common"

const num = (arc: StoryArc, key: string) => Number(arc.facts[key] ?? 0)
const pct = (x: number) => Math.round(x * 100)

/** Official maps he played for this club (closed season lines plus the open tally). */
function mapsForClub(p: PlayerSaveData, teamId: string): number {
    let maps = 0
    for (const l of p.seasonLines ?? []) if (l.clubId === teamId) maps += l.maps
    if (p.seasonTally?.clubId === teamId) maps += p.seasonTally.maps
    return maps
}

function successor(ctx: StoryContext, veteran: PlayerSaveData, teamId: string): PlayerSaveData | undefined {
    const team = ctx.team(teamId)
    if (!team || !canMentor(veteran)) return undefined
    const pairs = team.dressingRoom?.mentorships ?? []
    if (pairs.some(m => m.mentorId === veteran.id)) return undefined
    return rosterPlayers(ctx, team)
        .filter(p => p.id !== veteran.id && canBeMentored(p) && !pairs.some(m => m.menteeId === p.id))
        .sort((a, b) => (a.age ?? 0) - (b.age ?? 0) || a.id.localeCompare(b.id))[0]
}

export const lastDance: ArcDefinition = {
    kind: "LAST_DANCE",

    detect(ctx) {
        const team = ctx.managed
        const w = weekOfSeason(ctx.week)
        if (!team || w < S.LAST_DANCE_FROM_WEEK || w > S.LAST_DANCE_TO_WEEK) return []
        const out: ArcCandidate[] = []
        for (const p of rosterPlayers(ctx, team)) {
            // From 38 retirement is forced (or he becomes a legend): nothing to persuade.
            if ((p.age ?? 0) < S.LAST_DANCE_MIN_AGE || (p.age ?? 0) >= 38 || p.isLegendary) continue
            const chance = retirementChance(p, ctx.week)
            if (chance < S.LAST_DANCE_MIN_CHANCE) continue
            out.push({
                kind: "LAST_DANCE", teamId: team.id, managed: true, playerIds: [p.id], clubIds: [], subject: p.id,
                score: chance, facts: { age: p.age, chance: pct(chance), maps: mapsForClub(p, team.id) },
            })
        }
        return out
    },

    open(ctx, arc) {
        const p = ctx.player(arc.playerIds[0])
        const n = nameOf(p)
        storyNews(ctx, arc, "b0", `${n} weighs his future`,
            `${n}, ${num(arc, "age")}, has played ${num(arc, "maps")} official maps for ${clubOf(ctx, arc.teamId)} and has hinted that this season could be his last. `
            + `As things stand, the season-end check gives him a ${num(arc, "chance")}% chance of retiring.`)
        logBeat(arc, ctx.week, `${n}, ${num(arc, "age")}, hints at retiring (${num(arc, "chance")}% chance at season end).`)
        nextBeat(arc, ctx.week)
    },

    advance(ctx, arc) {
        const id = arc.playerIds[0]
        const n = nameOf(ctx.player(id))
        const choice = arc.beat >= 2
            ? takeAnswer(ctx, arc, "respect", (ch, byDefault) =>
                ch === "persuade" ? `You persuade ${n} to give it another go.`
                    : ch === "mentor" ? `${n} takes ${String(arc.facts.menteeName ?? "a young team-mate")} under his wing.`
                        : byDefault ? `No answer by the deadline, so the call is ${n}'s.` : `You leave the call to ${n}.`)
            : null
        const retiree = ctx.player(id)
        if (retiree?.isRetired) {
            const trophies = retiree.careerTrophies ?? 0
            const text = `${n} retires at ${retiree.age} after ${retiree.mapsPlayed ?? 0} official maps (career rating ${fmtRating(retiree.avgRating || 0)}${trophies ? `, ${trophies} trophies` : ""})${retiree.isLegendary ? " and goes into the Hall of Fame" : ""}.`
            storyNews(ctx, arc, "end", `Farewell, ${n}`, text)
            return resolveArc(arc, ctx.week, "RETIRED", text)
        }
        const p = stillAt(ctx, id, arc.teamId)
        if (!p) return resolveArc(arc, ctx.week, "LEFT", `${n} has left ${clubOf(ctx, arc.teamId)}.`)

        if (arc.beat === 1) {
            const chance = retirementChance(p, ctx.week)
            const from = pct(chance), to = pct(chance * S.PERSUADE_RETIREMENT_FACTOR)
            const mentee = successor(ctx, p, arc.teamId)
            const raised = raiseDecision(ctx, arc, {
                title: `${n}'s last dance?`,
                playerId: id,
                message: `${n} (${p.age}) is thinking about retiring at the end of the season. The season-end check currently gives him a ${from}% chance (it rises with age and falls with skill, form and health).\n\n`
                    + `• Persuade him: morale +${S.PERSUADE_MORALE}, loyalty +${S.PERSUADE_LOYALTY}, and his retirement chance this season falls from ${from}% to ${to}% (× ${S.PERSUADE_RETIREMENT_FACTOR}).\n`
                    + (mentee ? `• Plan the succession: he mentors ${nameOf(mentee)} (${mentee.age}); ${nameOf(mentee)}'s training gains +${Math.round((P.MENTOR_TRAINING - 1) * 100)}% while both stay. His retirement chance is unchanged.\n` : "")
                    + `• Respect his decision: nothing changes.`,
                choices: [
                    { id: "persuade", text: "Persuade him to play on", effects: { persuade: { from, to }, morale: S.PERSUADE_MORALE, loyalty: S.PERSUADE_LOYALTY } },
                    ...(mentee ? [{ id: "mentor", text: `Plan the succession: he mentors ${nameOf(mentee)}`, effects: { mentor: { menteeId: mentee.id, name: nameOf(mentee) } } }] : []),
                    { id: "respect", text: "Respect his decision", effects: {} },
                ],
                defaultChoiceId: "respect",
                consequence: "leaves the decision to {name}",
                label: `Last dance (${n})`,
            })
            if (!raised) {
                if (!waitForDesk(arc, ctx.week)) resolveArc(arc, ctx.week, "FADED", `${n} keeps his thoughts to himself for now.`)
                return
            }
            if (mentee) arc.facts.menteeName = nameOf(mentee)
            logBeat(arc, ctx.week, `${n} asks for time to think.`)
            return nextBeat(arc, ctx.week)
        }

        arc.nextWeek = ctx.week + 1
        if (choice === null) return
        // The retirement check ran earlier this tick in week 52: he is still here.
        if (weekOfSeason(ctx.week) === 52 || ctx.week > arc.startedWeek + 30) {
            const text = `${n} will play another season at ${clubOf(ctx, arc.teamId)}.`
            storyNews(ctx, arc, "end", `${n} plays on`, text)
            resolveArc(arc, ctx.week, "PLAYS_ON", text)
        }
    },
}
