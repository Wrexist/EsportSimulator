/**
 * Press conferences (Phase 5.3).
 *
 * Before a big match of the managed club (a final, a derby against the
 * biggest rival, a top-10 clash, a promotion or relegation decider) the week
 * tick raises one press conference: an inbox decision whose deadline is match
 * day and whose stated default is "the club sends no one: no effect". At most
 * one per match week, and only for a match still to be played.
 *
 * It asks 2–3 questions picked from context: the match, an active storyline
 * (or a player in form), and the club's form. Every answer applies exactly
 * the effects it shows, through engine/event-choice.ts: squad morale, one
 * named player's morale or loyalty, board confidence, followers. Nothing
 * touches the opponent.
 *
 * Engine safe: no store, no React. Deterministic: no RNG.
 */

import type { GameEventSaveData, GameSave, MatchSaveData, TeamSaveData } from "../save-types"
import type { StoryArc } from "./types"
import { applyChoiceEffects, type ChoiceEffects, type ChoiceTarget } from "../event-choice"
import { LEAGUE_TUNING, STORY_TUNING as S } from "@/lib/balance-tuning"
import { getMatchTone } from "@/lib/match-stakes"
import { getRivalryBetween, isDerby } from "../history-tracker"
import { captainId } from "../personality"
import { divisionOfTeam, isLeagueMatchId, ordinal, tablePosition } from "../season/regional-league"
import { biggestRival, headToHead } from "./arcs/rivalry"
import { fmtRating, formOver, logBeat, nameOf } from "./common"

import { PRESS_PREFIX, PRESS_REASON_LABEL, pressDataOf, pressEventId, type PressAnswer, type PressData, type PressQuestion, type PressReason } from "./press-view"

export * from "./press-view"

const official = (m: { isScrim?: boolean; tournamentId?: string | null }) => !m.isScrim && !!m.tournamentId && m.tournamentId !== "SCRIM"
const rankOf = (t: TeamSaveData | undefined) => (t?.worldRanking && t.worldRanking > 0 ? t.worldRanking : 999)

interface BigMatch { reason: PressReason; detail: string }

/** Why a fixture is a big match for the managed club, or null. */
export function bigMatchReason(save: Pick<GameSave, "teams" | "tournaments" | "league">, match: Pick<MatchSaveData, "id" | "homeTeamId" | "awayTeamId" | "stage" | "tournamentId">, teamId: string): BigMatch | null {
    const team = save.teams.find(t => t.id === teamId)
    const oppId = match.homeTeamId === teamId ? match.awayTeamId : match.homeTeamId
    const opp = save.teams.find(t => t.id === oppId)
    if (!team || !opp || !official(match)) return null
    const event = match.tournamentId ? save.tournaments.find(t => t.id === match.tournamentId) : undefined
    if (!isLeagueMatchId(match.id) && getMatchTone(match.stage ?? undefined, true) === "championship") return { reason: "FINAL", detail: `${event?.name ?? "the"} final` }
    const rival = biggestRival(team)
    const rivalry = getRivalryBetween(team, oppId)
    if ((rival && rival.opponentTeamId === oppId) || isDerby(rivalry?.intensity)) return { reason: "DERBY", detail: rivalry ? `${team.name} ${headToHead(rivalry)}` : "" }
    if (rankOf(team) <= 10 && rankOf(opp) <= 10) return { reason: "TOP10", detail: `#${rankOf(team)} v #${rankOf(opp)}` }
    if (isLeagueMatchId(match.id)) {
        const division = divisionOfTeam(save, teamId)
        const pos = tablePosition(division, teamId)
        if (division && pos) {
            const left = division.fixtures.filter(f => !f.result && (f.home === teamId || f.away === teamId)).length
            const bottomLevel = Math.max(...(save.league?.current?.divisions ?? []).filter(d => d.region === division.region).map(d => d.level))
            const n = division.teamIds.length
            const promotion = division.level > 1 && Math.abs(pos - LEAGUE_TUNING.PROMOTED) <= 1
            const relegation = division.level < bottomLevel && pos >= n - LEAGUE_TUNING.RELEGATED && pos <= n - LEAGUE_TUNING.RELEGATED + 1
            if (left > 0 && left <= S.PRESS_DECIDER_ROUNDS && (promotion || relegation)) {
                return { reason: "DECIDER", detail: `${ordinal(pos)} in ${division.name}, ${left} round${left === 1 ? "" : "s"} left, ${promotion ? "promotion" : "survival"} at stake` }
            }
        }
    }
    return null
}

// ---------------------------------------------------------------- questions

const bold = (): ChoiceEffects => ({ morale: S.PRESS_BOLD_MORALE, fans: S.PRESS_BOLD_FANS, board: S.PRESS_BOLD_BOARD })
const measured = (): ChoiceEffects => ({ board: S.PRESS_MEASURED_BOARD })
const NO_COMMENT: PressAnswer = { id: "no_comment", text: "No comment.", effects: {} }

function matchQuestion(save: GameSave, team: TeamSaveData, opp: TeamSaveData, match: MatchSaveData, big: BigMatch): PressQuestion {
    const event = match.tournamentId ? save.tournaments.find(t => t.id === match.tournamentId) : undefined
    switch (big.reason) {
        case "FINAL": return {
            id: "match", topic: "MATCH",
            text: `${event?.name ?? "The"} final against ${opp.name} (#${rankOf(opp)}). What is the target?`,
            answers: [
                { id: "bold", text: "We are here to lift the trophy.", effects: bold() },
                { id: "measured", text: "One match at a time. They are a fine side.", effects: measured() },
            ],
        }
        case "DERBY": {
            const r = getRivalryBetween(team, opp.id)
            return {
                id: "match", topic: "MATCH",
                text: r ? `${opp.name} again: meeting number ${r.matchesPlayed + 1}, and ${team.name} ${headToHead(r)}. What does this one mean?` : `${opp.name} again. What does this one mean?`,
                answers: [
                    { id: "bold", text: "It's the one our fans wait for, and we'll win it.", effects: bold() },
                    { id: "measured", text: "It's one more match. Our preparation doesn't change.", effects: measured() },
                ],
            }
        }
        case "TOP10": return {
            id: "match", topic: "MATCH",
            text: `${opp.name} are ranked #${rankOf(opp)}, ${team.name} #${rankOf(team)}. Who are the favourites?`,
            answers: [
                { id: "bold", text: "We are.", effects: bold() },
                { id: "measured", text: "They are, on paper. We'll see on the server.", effects: measured() },
            ],
        }
        case "DECIDER": return {
            id: "match", topic: "MATCH",
            text: `${team.name} are ${big.detail}. How do you handle the pressure?`,
            answers: [
                { id: "bold", text: "We'll go out and take it.", effects: bold() },
                { id: "measured", text: "We focus on our own job.", effects: measured() },
            ],
        }
    }
}

const playerFx = (id: string, name: string, morale?: number, loyalty?: number): ChoiceEffects["players"] => [{ id, name, ...(morale ? { morale } : {}), ...(loyalty ? { loyalty } : {}) }]

const PRESS_LINE = "You told the press, "
const askedBefore = (arc: StoryArc) => arc.log.some(l => l.text.startsWith(PRESS_LINE))

/** A question from an active managed storyline (one the press has not asked about yet first). */
function storyQuestion(save: GameSave, team: TeamSaveData, arcs: readonly StoryArc[]): PressQuestion | null {
    const player = (id: string | undefined) => (id ? save.players.find(p => p.id === id && team.rosterIds.includes(id)) : undefined)
    const ordered = [...arcs.filter(a => !askedBefore(a)), ...arcs.filter(askedBefore)]
    for (const arc of ordered) {
        if (arc.state !== "ACTIVE" || !arc.managed || arc.teamId !== team.id) continue
        const p = player(arc.playerIds[0])
        const n = nameOf(p)
        switch (arc.kind) {
            case "SLUMP": {
                if (!p) continue
                const r = formOver(p, team.id, S.SLUMP_MAPS)
                return {
                    id: "story", topic: "STORY", arcId: arc.id,
                    text: `${n} is rated ${r !== null ? fmtRating(r) : "below 0.90"} over his last ${S.SLUMP_MAPS} official maps. Does he keep his place?`,
                    answers: [
                        { id: "trust", text: "I trust him to come good.", effects: { players: playerFx(p.id, n, S.PRESS_PLAYER_BACK_MORALE) } },
                        { id: "earn", text: "Everyone has to earn their place.", effects: { players: playerFx(p.id, n, S.PRESS_PLAYER_CRITICISE_MORALE), board: S.PRESS_PLAYER_CRITICISE_BOARD } },
                        NO_COMMENT,
                    ],
                }
            }
            case "CONTRACT_STANDOFF": {
                if (!p) continue
                return {
                    id: "story", topic: "STORY", arcId: arc.id,
                    text: `${n}'s contract ends in Week ${arc.facts.endWeek}. Will he sign a new one?`,
                    answers: [
                        { id: "want", text: "We want him here for years.", effects: { players: playerFx(p.id, n, S.PRESS_PLAYER_BACK_MORALE, S.PRESS_PLAYER_STAY_LOYALTY) } },
                        { id: "bigger", text: "No player is bigger than the club.", effects: { players: playerFx(p.id, n, S.PRESS_PLAYER_CRITICISE_MORALE), board: S.PRESS_PLAYER_CRITICISE_BOARD } },
                        NO_COMMENT,
                    ],
                }
            }
            case "RISING_STAR": {
                if (!p) continue
                return {
                    id: "story", topic: "STORY", arcId: arc.id,
                    text: `${n} is rated ${fmtRating(Number(arc.facts.rating))} over his last ${arc.facts.maps} official maps. Is he for sale?`,
                    answers: [
                        { id: "not", text: "He's not for sale.", effects: { players: playerFx(p.id, n, S.PRESS_PLAYER_BACK_MORALE, S.PRESS_PLAYER_STAY_LOYALTY) } },
                        { id: "price", text: "Every player has a price.", effects: { players: playerFx(p.id, n, S.PRESS_PLAYER_CRITICISE_MORALE), board: S.PRESS_PLAYER_CRITICISE_BOARD } },
                        NO_COMMENT,
                    ],
                }
            }
            case "LAST_DANCE": {
                if (!p) continue
                return {
                    id: "story", topic: "STORY", arcId: arc.id,
                    text: `${n} is ${p.age}. Is this his last season?`,
                    answers: [
                        { id: "more", text: "He has plenty left to give.", effects: { players: playerFx(p.id, n, S.PRESS_PLAYER_BACK_MORALE) } },
                        NO_COMMENT,
                    ],
                }
            }
            case "RIFT": {
                const b = player(arc.playerIds[1])
                if (!p || !b) continue
                return {
                    id: "story", topic: "STORY", arcId: arc.id,
                    text: `There are reports of tension between ${n} and ${nameOf(b)}. True?`,
                    answers: [
                        { id: "united", text: "This squad is united.", effects: { morale: S.PRESS_TEAM_MORALE } },
                        { id: "healthy", text: "Competition for places is healthy.", effects: { players: playerFx(p.id, n, S.PRESS_PLAYER_CRITICISE_MORALE), board: S.PRESS_PLAYER_CRITICISE_BOARD } },
                        NO_COMMENT,
                    ],
                }
            }
            case "BOARD_PRESSURE": {
                const c = Math.round(save.boardState?.confidence ?? 0)
                return {
                    id: "story", topic: "STORY", arcId: arc.id,
                    text: `Board confidence is at ${c}/100. Is your job at risk?`,
                    answers: [
                        { id: "judge", text: "Judge me at the end of the season.", effects: { fans: S.PRESS_FORM_FANS, board: S.PRESS_BOLD_BOARD } },
                        { id: "accept", text: "The board is right to expect more.", effects: { board: S.PRESS_MEASURED_BOARD, morale: -S.PRESS_TEAM_MORALE } },
                    ],
                }
            }
            case "GIANT_KILLER": return {
                id: "story", topic: "STORY", arcId: arc.id,
                text: `${team.name} have beaten ${arc.clubIds.map(id => save.teams.find(t => t.id === id)?.name ?? "a top side").join(" and ")}. Can the run go on?`,
                answers: [
                    { id: "bold", text: "Nobody wants to play us right now.", effects: bold() },
                    { id: "measured", text: "We stay humble and keep working.", effects: measured() },
                ],
            }
            default: continue
        }
    }
    return null
}

/** The starter in the best form over his last SLUMP_MAPS maps, if PRESS_STAR_RATING or better. */
function playerQuestion(save: GameSave, team: TeamSaveData): PressQuestion | null {
    let best: { id: string; name: string; r: number } | null = null
    for (const id of team.rosterIds.slice(0, 5)) {
        const p = save.players.find(x => x.id === id)
        const r = formOver(p, team.id, S.SLUMP_MAPS)
        if (p && r !== null && r >= S.PRESS_STAR_RATING && (!best || r > best.r)) best = { id, name: nameOf(p), r }
    }
    if (!best) return null
    return {
        id: "player", topic: "PLAYER",
        text: `${best.name} is rated ${fmtRating(best.r)} over his last ${S.SLUMP_MAPS} official maps. Is he your key man?`,
        answers: [
            { id: "key", text: "He's our key man.", effects: { players: playerFx(best.id, best.name, S.PRESS_PLAYER_BACK_MORALE) } },
            { id: "team", text: "It's a team game.", effects: { morale: S.PRESS_TEAM_MORALE } },
        ],
    }
}

/** Always available: the captain (the manager's pick, else the highest leader stat). */
function captainQuestion(save: GameSave, team: TeamSaveData): PressQuestion | null {
    const id = captainId(team, x => save.players.find(p => p.id === x))
    const p = id ? save.players.find(x => x.id === id) : undefined
    if (!p) return null
    const n = nameOf(p)
    return {
        id: "player", topic: "PLAYER",
        text: `${n} captains the side. What do you need from him?`,
        answers: [
            { id: "heart", text: "He's the heart of this team.", effects: { players: playerFx(p.id, n, S.PRESS_PLAYER_BACK_MORALE) } },
            { id: "everyone", text: "Everyone has to step up, not just him.", effects: { morale: S.PRESS_TEAM_MORALE } },
        ],
    }
}

function formQuestion(save: GameSave, team: TeamSaveData): PressQuestion | null {
    const results: boolean[] = []
    for (let i = save.completedMatches.length - 1; i >= 0 && results.length < 5; i--) {
        const m = save.completedMatches[i]
        if ((m.homeTeamId === team.id || m.awayTeamId === team.id) && official(m) && m.result) results.push(m.result.winnerId === team.id)
    }
    if (results.length === 0) return null
    const w = results.filter(Boolean).length, n = results.length
    const good = w * 2 > n
    return {
        id: "form", topic: "FORM",
        text: `${w} win${w === 1 ? "" : "s"} from your last ${n} official match${n === 1 ? "" : "es"}. ${good ? "Is the momentum with you?" : "What is going wrong?"}`,
        answers: good
            ? [
                { id: "momentum", text: "We're building something here.", effects: { fans: S.PRESS_FORM_FANS, morale: S.PRESS_TEAM_MORALE } },
                { id: "granted", text: "We take nothing for granted.", effects: measured() },
            ]
            : [
                { id: "turn", text: "We'll turn it round. I believe in this group.", effects: { morale: S.PRESS_TEAM_MORALE } },
                { id: "responsibility", text: "The players must take responsibility.", effects: { board: S.PRESS_MEASURED_BOARD, morale: -S.PRESS_TEAM_MORALE * 2 } },
            ],
    }
}

/**
 * Raise this week's press conference, if the managed club has a big match
 * this week and none was raised yet. Returns the event (already pushed).
 */
export function createPressConference(save: GameSave): GameEventSaveData | null {
    const team = save.teams.find(t => t.id === save.playerTeamId)
    if (!team || save.gameOverReason) return null
    const week = save.currentWeek
    if (save.eventsLog.some(e => e.id.startsWith(PRESS_PREFIX) && e.week === week)) return null
    const done = new Set(save.completedMatches.filter(m => m.week >= week - 1).map(m => m.id))
    const fixtures = save.scheduledMatches
        .filter(m => m.week === week && (m.homeTeamId === team.id || m.awayTeamId === team.id) && official(m) && !done.has(m.id))
        .sort((a, b) => (a.day ?? 6) - (b.day ?? 6) || a.id.localeCompare(b.id))
    const lastPress = save.eventsLog.reduce((w, e) => e.id.startsWith(PRESS_PREFIX) ? Math.max(w, e.week) : w, -Infinity)
    for (const match of fixtures) {
        const big = bigMatchReason(save, match, team.id)
        if (!big) continue
        if (big.reason !== "FINAL" && week - lastPress < S.PRESS_MIN_WEEKS_BETWEEN) continue
        const opp = save.teams.find(t => t.id === (match.homeTeamId === team.id ? match.awayTeamId : match.homeTeamId))!
        const questions: PressQuestion[] = [matchQuestion(save, team, opp, match, big)]
        const second = storyQuestion(save, team, save.storylines ?? []) ?? playerQuestion(save, team)
        if (second) questions.push(second)
        const form = formQuestion(save, team)
        if (form) questions.push(form)
        // Early in a career there may be no story, form or results yet: ask about the captain.
        const captain = questions.length < 2 ? captainQuestion(save, team) : null
        if (captain) questions.push(captain)
        if (questions.length < 2) return null
        const press: PressData = { reason: big.reason, matchId: match.id, opponentId: opp.id, questions: questions.slice(0, 3) }
        const event = {
            id: pressEventId(match.id),
            type: "PRESS",
            week,
            acknowledged: false,
            data: {
                title: `Press conference: ${opp.name} (${PRESS_REASON_LABEL[big.reason].toLowerCase()})`,
                message: `${team.name} face ${opp.name} this week${big.detail ? ` (${big.detail})` : ""}. The press has ${press.questions.length} questions. Every answer applies the effects shown next to it; a question you skip changes nothing.`,
                teamId: team.id,
                matchId: match.id,
                deadlineWeek: match.week,
                press,
            },
            choices: [{ id: "no_one", text: "Send no one", effects: {} }],
        } as unknown as GameEventSaveData
        save.eventsLog.push(event)
        return event
    }
    return null
}

export interface PressTarget extends ChoiceTarget {
    eventsLog: GameEventSaveData[]
    acknowledgedEventIds: string[]
    scheduledMatches: Array<Pick<MatchSaveData, "id">>
    completedMatches: Array<Pick<MatchSaveData, "id">>
    storylines?: StoryArc[]
    gameOverReason?: string | null
}

/** Withdraw the open press conference of a match that has been played. */
export function closePressConference(target: Pick<PressTarget, "eventsLog">, matchId: string): void {
    const e = target.eventsLog.find(x => x.id === pressEventId(matchId))
    if (!e || e.selectedChoiceId !== undefined) return
    e.data = { ...(e.data ?? {}), isWithdrawn: true, withdrawnReason: "The match has been played." }
    e.acknowledged = true
}

/**
 * Face the press: apply the chosen answer of each question (questions left
 * out change nothing) and close the conference. Refused once the match has
 * been played, after the deadline, or for another club's event.
 */
export function answerPressConference(target: PressTarget, eventId: string, answers: Record<string, string>): { ok: boolean; message: string; applied: number } {
    const e = target.eventsLog.find(x => x.id === eventId)
    const press = pressDataOf(e)
    if (!e || !press) return { ok: false, message: "Press conference not found.", applied: 0 }
    const data = (e.data ?? {}) as { isWithdrawn?: boolean; deadlineWeek?: number; teamId?: string }
    if (e.selectedChoiceId !== undefined || data.isWithdrawn || target.gameOverReason) return { ok: false, message: "This press conference is closed.", applied: 0 }
    if (typeof data.deadlineWeek === "number" && target.currentWeek > data.deadlineWeek) return { ok: false, message: "This press conference is closed.", applied: 0 }
    if (data.teamId && data.teamId !== target.playerTeamId) return { ok: false, message: "This press conference is for another club.", applied: 0 }
    if (target.completedMatches.some(m => m.id === press.matchId) || !target.scheduledMatches.some(m => m.id === press.matchId)) {
        closePressConference(target, press.matchId)
        return { ok: false, message: "The match has been played; the press room is closed.", applied: 0 }
    }
    let applied = 0
    const chosen: Record<string, string> = {}
    for (const q of press.questions) {
        const a = q.answers.find(x => x.id === answers[q.id])
        if (!a) continue
        chosen[q.id] = a.id
        const pseudo = { id: `${e.id}_${q.id}`, type: "PRESS", week: target.currentWeek, acknowledged: true, data: { teamId: target.playerTeamId } } as unknown as GameEventSaveData
        if (applyChoiceEffects(target, pseudo, a.effects, { id: () => `fin_${pseudo.id}`, description: `Press conference: "${a.text}"` })) applied++
        // The story keeps the line once (the press may ask again before a later match).
        const arc = q.arcId ? target.storylines?.find(x => x.id === q.arcId) : undefined
        const line = `${PRESS_LINE}"${a.text}"`
        if (arc && a.id !== NO_COMMENT.id && !arc.log.some(l => l.text === line)) logBeat(arc, target.currentWeek, line)
    }
    e.selectedChoiceId = "answered"
    e.data = { ...(e.data ?? {}), pressAnswers: chosen, resolvedWeek: target.currentWeek }
    e.acknowledged = true
    if (!target.acknowledgedEventIds.includes(e.id)) target.acknowledgedEventIds.push(e.id)
    return { ok: true, message: applied ? `You answered ${Object.keys(chosen).length} question${Object.keys(chosen).length === 1 ? "" : "s"}.` : "You faced the press.", applied }
}
