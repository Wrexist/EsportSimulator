/**
 * Storyline-aware lines for the news (Phase 5.3): the final preview reads
 * the managed club's most important active story, else its real form. No
 * invented quotes: every clause is a fact in the save.
 */

import type { GameSave, MatchSaveData, TeamSaveData } from "../save-types"
import type { StoryArc, StoryArcKind } from "./types"
import { STORY_TUNING as S } from "@/lib/balance-tuning"
import { getRivalryBetween } from "../history-tracker"
import { headToHead } from "./arcs/rivalry"
import { fmtRating, formOver, nameOf } from "./common"

const ORDER: StoryArcKind[] = ["BOARD_PRESSURE", "CONTRACT_STANDOFF", "LAST_DANCE", "SLUMP", "RIFT", "RISING_STAR", "GIANT_KILLER", "RIVALRY"]

function storyLine(save: GameSave, team: TeamSaveData, opp: TeamSaveData | undefined, arc: StoryArc): string | null {
    const p = arc.playerIds[0] ? save.players.find(x => x.id === arc.playerIds[0] && team.rosterIds.includes(x.id)) : undefined
    const n = nameOf(p)
    switch (arc.kind) {
        case "BOARD_PRESSURE": return save.boardState ? `With board confidence at ${Math.round(save.boardState.confidence)}/100, a trophy would ease the pressure on ${save.managerDetails?.name || "the manager"}.` : null
        case "CONTRACT_STANDOFF": return p ? `${n} plays with his contract ending in Week ${arc.facts.endWeek} and no new deal agreed.` : null
        case "LAST_DANCE": return p ? `${n}, ${p.age}, may be playing his last final.` : null
        case "SLUMP": {
            const r = formOver(p, team.id, S.SLUMP_MAPS)
            return p && r !== null ? `${n} arrives rated ${fmtRating(r)} over his last ${S.SLUMP_MAPS} official maps; a final is a chance to answer.` : null
        }
        case "RIFT": {
            const b = save.players.find(x => x.id === arc.playerIds[1])
            return p && b ? `${n} and ${nameOf(b)} will have to put their differences aside.` : null
        }
        case "RISING_STAR": return p ? `All eyes on ${n}, ${p.age}, rated ${fmtRating(Number(arc.facts.rating))} over ${arc.facts.maps} official maps when his rise began.` : null
        case "GIANT_KILLER": return `${team.name} arrive having beaten ${arc.clubIds.map(id => save.teams.find(t => t.id === id)?.name ?? "a top side").join(" and ")} on the way.`
        case "RIVALRY": {
            const r = opp && arc.clubIds[0] === opp.id ? getRivalryBetween(team, opp.id) : undefined
            return r ? `It is ${opp!.name} again: ${team.name} ${headToHead(r)}.` : null
        }
        default: return null
    }
}

function formLine(save: GameSave, team: TeamSaveData, opp: TeamSaveData | undefined): string {
    let w = 0, n = 0
    for (let i = save.completedMatches.length - 1; i >= 0 && n < 5; i--) {
        const m = save.completedMatches[i]
        if ((m.homeTeamId !== team.id && m.awayTeamId !== team.id) || m.isScrim || !m.tournamentId || m.tournamentId === "SCRIM" || !m.result) continue
        n++
        if (m.result.winnerId === team.id) w++
    }
    const form = n ? `${team.name} come in with ${w} win${w === 1 ? "" : "s"} from their last ${n} official match${n === 1 ? "" : "es"}` : `${team.name} come in fresh`
    return `${form}${opp?.worldRanking ? `; ${opp.name} are ranked #${opp.worldRanking}` : ""}.`
}

/** Final preview copy for the managed club's final this week. */
export function finalPreview(save: GameSave, team: TeamSaveData, match: Pick<MatchSaveData, "homeTeamId" | "awayTeamId">, eventName: string): { title: string; content: string } {
    const opp = save.teams.find(t => t.id === (match.homeTeamId === team.id ? match.awayTeamId : match.homeTeamId))
    const arcs = (save.storylines ?? []).filter(a => a.state === "ACTIVE" && a.managed && a.teamId === team.id)
        .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
    let line: string | null = null
    for (const arc of arcs) if ((line = storyLine(save, team, opp, arc))) break
    return {
        title: `${team.name} in the ${eventName} final`,
        content: `${team.name} face ${opp?.name ?? "their opponent"} in the ${eventName} final this week. ${line ?? formLine(save, team, opp)}`,
    }
}
