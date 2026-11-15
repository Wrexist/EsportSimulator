/**
 * Storyline-aware lines for the news (Phase 5.3): the final preview reads
 * the managed club's most important active story, else its real form. No
 * invented quotes: every clause is a fact in the save. Written with
 * translation keys, so the feed shows it in the active language.
 */

import type { GameSave, MatchSaveData, TeamSaveData } from "../save-types"
import type { StoryArc, StoryArcKind } from "./types"
import { STORY_TUNING as S } from "@/lib/balance-tuning"
import { getRivalryBetween } from "../history-tracker"
import { headToHeadRef } from "./arcs/rivalry"
import { fmtRating, formOver, nameOf } from "./common"
import { LIST_REF, type TextParam, type TextRef } from "@/lib/i18n"
import { newsText } from "@/lib/news-ref"

const ORDER: StoryArcKind[] = ["BOARD_PRESSURE", "CONTRACT_STANDOFF", "LAST_DANCE", "SLUMP", "RIFT", "RISING_STAR", "GIANT_KILLER", "RIVALRY"]

function storyLine(save: GameSave, team: TeamSaveData, opp: TeamSaveData | undefined, arc: StoryArc): TextRef | null {
    const p = arc.playerIds[0] ? save.players.find(x => x.id === arc.playerIds[0] && team.rosterIds.includes(x.id)) : undefined
    const n = nameOf(p)
    switch (arc.kind) {
        case "BOARD_PRESSURE": return save.boardState ? { key: "nw.final.board", params: { c: Math.round(save.boardState.confidence), manager: save.managerDetails?.name || { key: "nw.final.theManager" } } } : null
        case "CONTRACT_STANDOFF": return p ? { key: "nw.final.contract", params: { name: n, week: Number(arc.facts.endWeek) } } : null
        case "LAST_DANCE": return p ? { key: "nw.final.lastDance", params: { name: n, age: p.age } } : null
        case "SLUMP": {
            const r = formOver(p, team.id, S.SLUMP_MAPS)
            return p && r !== null ? { key: "nw.final.slump", count: S.SLUMP_MAPS, params: { name: n, rating: fmtRating(r) } } : null
        }
        case "RIFT": {
            const b = save.players.find(x => x.id === arc.playerIds[1])
            return p && b ? { key: "nw.final.rift", params: { name: n, other: nameOf(b) } } : null
        }
        case "RISING_STAR": return p ? { key: "nw.final.rising", count: Number(arc.facts.maps), params: { name: n, age: p.age, rating: fmtRating(Number(arc.facts.rating)) } } : null
        case "GIANT_KILLER": return { key: "nw.final.giant", params: { team: team.name, clubs: { key: LIST_REF, params: Object.fromEntries(arc.clubIds.map((id, i) => [`c${i}`, save.teams.find(t => t.id === id)?.name ?? { key: "nw.final.topSide" }])) } } }
        case "RIVALRY": {
            const r = opp && arc.clubIds[0] === opp.id ? getRivalryBetween(team, opp.id) : undefined
            return r ? { key: "nw.final.rivalry", params: { opp: opp!.name, team: team.name, h2h: headToHeadRef(r) } } : null
        }
        default: return null
    }
}

function formLine(save: GameSave, team: TeamSaveData, opp: TeamSaveData | undefined): TextRef {
    let w = 0, n = 0
    for (let i = save.completedMatches.length - 1; i >= 0 && n < 5; i--) {
        const m = save.completedMatches[i]
        if ((m.homeTeamId !== team.id && m.awayTeamId !== team.id) || m.isScrim || !m.tournamentId || m.tournamentId === "SCRIM" || !m.result) continue
        n++
        if (m.result.winnerId === team.id) w++
    }
    const form: TextRef = n ? { key: "nw.final.form", count: n, params: { team: team.name, w, l: n - w } } : { key: "nw.final.fresh", params: { team: team.name } }
    return opp?.worldRanking ? { key: "nw.final.formRank", params: { form, opp: opp.name, rank: opp.worldRanking } } : { key: "nw.final.formOnly", params: { form } }
}

/** Final preview copy for the managed club's final this week (English text plus the keys the feed shows). */
export function finalPreview(save: GameSave, team: TeamSaveData, match: Pick<MatchSaveData, "homeTeamId" | "awayTeamId">, eventName: TextParam): { title: string; content: string; titleRef: TextRef; contentRef: TextRef } {
    const opp = save.teams.find(t => t.id === (match.homeTeamId === team.id ? match.awayTeamId : match.homeTeamId))
    const arcs = (save.storylines ?? []).filter(a => a.state === "ACTIVE" && a.managed && a.teamId === team.id)
        .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
    let line: TextRef | null = null
    for (const arc of arcs) if ((line = storyLine(save, team, opp, arc))) break
    return newsText(
        { key: "nw.final.t", params: { team: team.name, event: eventName } },
        { key: "nw.final.c", params: { team: team.name, opp: opp?.name ?? { key: "nw.final.theirOpponent" }, event: eventName, line: line ?? formLine(save, team, opp) } },
    )
}
