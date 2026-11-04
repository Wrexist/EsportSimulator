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
    clubRef, fmtRating, joined, logBeat, nameOf, nextBeat, raiseDecision, resolveArc, rosterPlayers, said, stillAt, storyNews,
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
        storyNews(ctx, arc, "b0", said("sl.ld.newsTitle", { name: n }),
            said("sl.ld.newsBody", { name: n, age: num(arc, "age"), club: clubRef(ctx, arc.teamId), chance: num(arc, "chance") }, num(arc, "maps")))
        logBeat(arc, ctx.week, said("sl.ld.log", { name: n, age: num(arc, "age"), chance: num(arc, "chance") }))
        nextBeat(arc, ctx.week)
    },

    advance(ctx, arc) {
        const id = arc.playerIds[0]
        const n = nameOf(ctx.player(id))
        const choice = arc.beat >= 2
            ? takeAnswer(ctx, arc, "respect", (ch, byDefault) =>
                ch === "persuade" ? said("sl.ld.ans.persuade", { name: n })
                    : ch === "mentor" ? said("sl.ld.ans.mentor", { name: n, mentee: arc.facts.menteeName !== undefined ? String(arc.facts.menteeName) : { key: "sl.ld.aYoungster" } })
                        : said(byDefault ? "sl.ld.ans.respectDefault" : "sl.ld.ans.respect", { name: n }))
            : null
        const retiree = ctx.player(id)
        if (retiree?.isRetired) {
            const trophies = retiree.careerTrophies ?? 0
            const text = said(retiree.isLegendary ? "sl.ld.retiredHof" : "sl.ld.retired", {
                name: n, age: retiree.age ?? 0, rating: fmtRating(retiree.avgRating || 0),
                trophies: trophies ? { key: "sl.ld.trophies", count: trophies } : "",
            }, retiree.mapsPlayed ?? 0)
            storyNews(ctx, arc, "end", said("sl.ld.farewell", { name: n }), text)
            return resolveArc(arc, ctx.week, "RETIRED", text)
        }
        const p = stillAt(ctx, id, arc.teamId)
        if (!p) return resolveArc(arc, ctx.week, "LEFT", said("sl.left", { name: n, club: clubRef(ctx, arc.teamId) }))

        if (arc.beat === 1) {
            const chance = retirementChance(p, ctx.week)
            const from = pct(chance), to = pct(chance * S.PERSUADE_RETIREMENT_FACTOR)
            const mentee = successor(ctx, p, arc.teamId)
            const raised = raiseDecision(ctx, arc, {
                title: said("sl.ld.title", { name: n }),
                playerId: id,
                message: joined("\n\n",
                    said("sl.ld.msg", { name: n, age: p.age ?? 0, chance: from }),
                    joined("\n",
                        said("sl.ld.optPersuade", { morale: S.PERSUADE_MORALE, loyalty: S.PERSUADE_LOYALTY, from, to, factor: S.PERSUADE_RETIREMENT_FACTOR }),
                        mentee && said("sl.ld.optMentor", { mentee: nameOf(mentee), age: mentee.age ?? 0, pct: Math.round((P.MENTOR_TRAINING - 1) * 100) }),
                        said("sl.ld.optRespect"))),
                choices: [
                    { id: "persuade", text: said("sl.ld.c.persuade"), effects: { persuade: { from, to }, morale: S.PERSUADE_MORALE, loyalty: S.PERSUADE_LOYALTY } },
                    ...(mentee ? [{ id: "mentor", text: said("sl.ld.c.mentor", { mentee: nameOf(mentee) }), effects: { mentor: { menteeId: mentee.id, name: nameOf(mentee) } } }] : []),
                    { id: "respect", text: said("sl.ld.c.respect"), effects: {} },
                ],
                defaultChoiceId: "respect",
                consequence: said("sl.ld.cons", { name: "{name}" }),
                label: said("sl.ld.label", { name: n }),
            })
            if (!raised) {
                if (!waitForDesk(arc, ctx.week)) resolveArc(arc, ctx.week, "FADED", said("sl.ld.fade", { name: n }))
                return
            }
            if (mentee) arc.facts.menteeName = nameOf(mentee)
            logBeat(arc, ctx.week, said("sl.ld.logThink", { name: n }))
            return nextBeat(arc, ctx.week)
        }

        arc.nextWeek = ctx.week + 1
        if (choice === null) return
        // The retirement check ran earlier this tick in week 52: he is still here.
        if (weekOfSeason(ctx.week) === 52 || ctx.week > arc.startedWeek + 30) {
            const text = said("sl.ld.playsOn", { name: n, club: clubRef(ctx, arc.teamId) })
            storyNews(ctx, arc, "end", said("sl.ld.playsOnTitle", { name: n }), text)
            resolveArc(arc, ctx.week, "PLAYS_ON", text)
        }
    },
}
