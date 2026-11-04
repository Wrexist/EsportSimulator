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
 * touches the opponent. A bold claim about the match is also settled by the
 * result (settlePressStakes): backed up with a win, thrown back at you after
 * a loss.
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
import { divisionOfTeam, isLeagueMatchId, tablePosition } from "../season/regional-league"
import { biggestRival } from "./arcs/rivalry"
import { fmtRating, formOver, logBeat, nameOf } from "./common"

import { t, tn, tRefEn, ORDINAL_REF, LIST_REF, type TextRef } from "@/lib/i18n"
import { PRESS_PREFIX, pressDataOf, pressEventId, type PressAnswer, type PressData, type PressQuestion, type PressReason } from "./press-view"

export * from "./press-view"

const official = (m: { isScrim?: boolean; tournamentId?: string | null }) => !m.isScrim && !!m.tournamentId && m.tournamentId !== "SCRIM"
const rankOf = (t: TeamSaveData | undefined) => (t?.worldRanking && t.worldRanking > 0 ? t.worldRanking : 999)

interface BigMatch { reason: PressReason; detail: TextRef | null }

/** A line as a translation key plus its English copy (the copy is what older readers and the ledger keep). */
function said(key: string, params?: TextRef["params"], count?: number): { text: string; ref: TextRef } {
    const ref: TextRef = { key, ...(params ? { params } : {}), ...(count !== undefined ? { count } : {}) }
    return { text: tRefEn(ref), ref }
}
const answer = (id: string, key: string, effects: ChoiceEffects, afterResult?: PressAnswer["afterResult"]): PressAnswer =>
    ({ id, ...said(`press.a.${key}`), effects, ...(afterResult ? { afterResult } : {}) })

const REGION_ID: Record<string, string> = { Europe: "EUROPE", CIS: "CIS", Americas: "AMERICAS", "Asia-Pacific": "ASIA_PACIFIC" }
/** A stored division name ("Europe Division 2") as a translatable value; anything else as stored. */
function divisionRef(name: string): TextRef | string {
    const m = /^(Europe|CIS|Americas|Asia-Pacific) Division (\d+)$/.exec(name.trim())
    return m ? { key: "league.divisionName", params: { region: { key: `region.${REGION_ID[m[1]]}` }, level: Number(m[2]) } } : name
}
const h2hRef = (r: { wins: number; losses: number }): TextRef =>
    ({ key: r.wins > r.losses ? "press.h2h.lead" : r.wins < r.losses ? "press.h2h.trail" : "press.h2h.level", params: { w: r.wins, l: r.losses } })

/** Why a fixture is a big match for the managed club, or null. */
export function bigMatchReason(save: Pick<GameSave, "teams" | "tournaments" | "league">, match: Pick<MatchSaveData, "id" | "homeTeamId" | "awayTeamId" | "stage" | "tournamentId">, teamId: string): BigMatch | null {
    const team = save.teams.find(t => t.id === teamId)
    const oppId = match.homeTeamId === teamId ? match.awayTeamId : match.homeTeamId
    const opp = save.teams.find(t => t.id === oppId)
    if (!team || !opp || !official(match)) return null
    const event = match.tournamentId ? save.tournaments.find(t => t.id === match.tournamentId) : undefined
    if (!isLeagueMatchId(match.id) && getMatchTone(match.stage ?? undefined, true) === "championship") return { reason: "FINAL", detail: event?.name ? { key: "press.detail.final", params: { event: event.name } } : { key: "press.detail.finalPlain" } }
    const rival = biggestRival(team)
    const rivalry = getRivalryBetween(team, oppId)
    if ((rival && rival.opponentTeamId === oppId) || isDerby(rivalry?.intensity)) return { reason: "DERBY", detail: rivalry ? { key: "press.detail.derby", params: { team: team.name, h2h: h2hRef(rivalry) } } : null }
    if (rankOf(team) <= 10 && rankOf(opp) <= 10) return { reason: "TOP10", detail: { key: "press.detail.top10", params: { rank: rankOf(team), oppRank: rankOf(opp) } } }
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
                return { reason: "DECIDER", detail: { key: promotion ? "press.detail.promotion" : "press.detail.survival", count: left, params: { pos: { key: ORDINAL_REF, count: pos }, division: divisionRef(division.name) } } }
            }
        }
    }
    return null
}

// ---------------------------------------------------------------- questions

const bold = (): ChoiceEffects => ({ morale: S.PRESS_BOLD_MORALE, fans: S.PRESS_BOLD_FANS, board: S.PRESS_BOLD_BOARD })
/** What a bold claim about the match costs or earns once it is played. */
const boldStakes = (): NonNullable<PressAnswer["afterResult"]> => ({
    win: { fans: S.PRESS_BOLD_WIN_FANS, board: S.PRESS_BOLD_WIN_BOARD },
    loss: { morale: S.PRESS_BOLD_LOSS_MORALE, board: S.PRESS_BOLD_LOSS_BOARD },
})
const measured = (): ChoiceEffects => ({ board: S.PRESS_MEASURED_BOARD })
const NO_COMMENT_ID = "no_comment"
const noComment = (): PressAnswer => ({ id: NO_COMMENT_ID, ...said("press.noComment"), effects: {} })

function matchQuestion(save: GameSave, team: TeamSaveData, opp: TeamSaveData, match: MatchSaveData, big: BigMatch): PressQuestion {
    const event = match.tournamentId ? save.tournaments.find(t => t.id === match.tournamentId) : undefined
    switch (big.reason) {
        case "FINAL": return {
            id: "match", topic: "MATCH",
            ...(event?.name ? said("press.q.final", { event: event.name, opp: opp.name, rank: rankOf(opp) }) : said("press.q.finalPlain", { opp: opp.name, rank: rankOf(opp) })),
            answers: [answer("bold", "final.bold", bold(), boldStakes()), answer("measured", "final.measured", measured())],
        }
        case "DERBY": {
            const r = getRivalryBetween(team, opp.id)
            return {
                id: "match", topic: "MATCH",
                ...(r ? said("press.q.derby", { opp: opp.name, n: r.matchesPlayed + 1, team: team.name, h2h: h2hRef(r) }) : said("press.q.derbyPlain", { opp: opp.name })),
                answers: [answer("bold", "derby.bold", bold(), boldStakes()), answer("measured", "derby.measured", measured())],
            }
        }
        case "TOP10": return {
            id: "match", topic: "MATCH",
            ...said("press.q.top10", { opp: opp.name, oppRank: rankOf(opp), team: team.name, rank: rankOf(team) }),
            answers: [answer("bold", "top10.bold", bold(), boldStakes()), answer("measured", "top10.measured", measured())],
        }
        case "DECIDER": return {
            id: "match", topic: "MATCH",
            ...said("press.q.decider", { team: team.name, detail: big.detail ?? "" }),
            answers: [answer("bold", "decider.bold", bold(), boldStakes()), answer("measured", "decider.measured", measured())],
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
                    ...said(r !== null ? "press.q.slump" : "press.q.slumpBelow", { name: n, rating: r !== null ? fmtRating(r) : "0.90", maps: S.SLUMP_MAPS }),
                    answers: [
                        answer("trust", "slump.trust", { players: playerFx(p.id, n, S.PRESS_PLAYER_BACK_MORALE) }),
                        answer("earn", "slump.earn", { players: playerFx(p.id, n, S.PRESS_PLAYER_CRITICISE_MORALE), board: S.PRESS_PLAYER_CRITICISE_BOARD }),
                        noComment(),
                    ],
                }
            }
            case "CONTRACT_STANDOFF": {
                if (!p) continue
                return {
                    id: "story", topic: "STORY", arcId: arc.id,
                    ...said("press.q.contract", { name: n, week: String(arc.facts.endWeek) }),
                    answers: [
                        answer("want", "contract.want", { players: playerFx(p.id, n, S.PRESS_PLAYER_BACK_MORALE, S.PRESS_PLAYER_STAY_LOYALTY) }),
                        answer("bigger", "contract.bigger", { players: playerFx(p.id, n, S.PRESS_PLAYER_CRITICISE_MORALE), board: S.PRESS_PLAYER_CRITICISE_BOARD }),
                        noComment(),
                    ],
                }
            }
            case "RISING_STAR": {
                if (!p) continue
                return {
                    id: "story", topic: "STORY", arcId: arc.id,
                    ...said("press.q.rising", { name: n, rating: fmtRating(Number(arc.facts.rating)), maps: String(arc.facts.maps) }),
                    answers: [
                        answer("not", "rising.not", { players: playerFx(p.id, n, S.PRESS_PLAYER_BACK_MORALE, S.PRESS_PLAYER_STAY_LOYALTY) }),
                        answer("price", "rising.price", { players: playerFx(p.id, n, S.PRESS_PLAYER_CRITICISE_MORALE), board: S.PRESS_PLAYER_CRITICISE_BOARD }),
                        noComment(),
                    ],
                }
            }
            case "LAST_DANCE": {
                if (!p) continue
                return {
                    id: "story", topic: "STORY", arcId: arc.id,
                    ...said("press.q.lastDance", { name: n, age: p.age }),
                    answers: [
                        answer("more", "lastDance.more", { players: playerFx(p.id, n, S.PRESS_PLAYER_BACK_MORALE) }),
                        noComment(),
                    ],
                }
            }
            case "RIFT": {
                const b = player(arc.playerIds[1])
                if (!p || !b) continue
                return {
                    id: "story", topic: "STORY", arcId: arc.id,
                    ...said("press.q.rift", { a: n, b: nameOf(b) }),
                    answers: [
                        answer("united", "rift.united", { morale: S.PRESS_TEAM_MORALE }),
                        answer("healthy", "rift.healthy", { players: playerFx(p.id, n, S.PRESS_PLAYER_CRITICISE_MORALE), board: S.PRESS_PLAYER_CRITICISE_BOARD }),
                        noComment(),
                    ],
                }
            }
            case "BOARD_PRESSURE": {
                const c = Math.round(save.boardState?.confidence ?? 0)
                return {
                    id: "story", topic: "STORY", arcId: arc.id,
                    ...said("press.q.board", { confidence: c }),
                    answers: [
                        answer("judge", "board.judge", { fans: S.PRESS_FORM_FANS, board: S.PRESS_BOLD_BOARD }),
                        answer("accept", "board.accept", { board: S.PRESS_MEASURED_BOARD, morale: -S.PRESS_TEAM_MORALE }),
                    ],
                }
            }
            case "GIANT_KILLER": return {
                id: "story", topic: "STORY", arcId: arc.id,
                ...said("press.q.giant", { team: team.name, clubs: { key: LIST_REF, params: Object.fromEntries(arc.clubIds.map((id, i) => [i, save.teams.find(x => x.id === id)?.name ?? { key: "press.aTopSide" }])) } }),
                answers: [answer("bold", "giant.bold", bold()), answer("measured", "giant.measured", measured())],
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
        ...said("press.q.player", { name: best.name, rating: fmtRating(best.r), maps: S.SLUMP_MAPS }),
        answers: [
            answer("key", "player.key", { players: playerFx(best.id, best.name, S.PRESS_PLAYER_BACK_MORALE) }),
            answer("team", "player.team", { morale: S.PRESS_TEAM_MORALE }),
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
        ...said("press.q.captain", { name: n }),
        answers: [
            answer("heart", "captain.heart", { players: playerFx(p.id, n, S.PRESS_PLAYER_BACK_MORALE) }),
            answer("everyone", "captain.everyone", { morale: S.PRESS_TEAM_MORALE }),
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
        ...said(good ? "press.q.formGood" : "press.q.formBad", { wins: { key: "press.wins", count: w } }, n),
        answers: good
            ? [
                answer("momentum", "form.momentum", { fans: S.PRESS_FORM_FANS, morale: S.PRESS_TEAM_MORALE }),
                answer("granted", "form.granted", measured()),
            ]
            : [
                answer("turn", "form.turn", { morale: S.PRESS_TEAM_MORALE }),
                answer("responsibility", "form.responsibility", { board: S.PRESS_MEASURED_BOARD, morale: -S.PRESS_TEAM_MORALE * 2 }),
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
        const titleRef: TextRef = { key: "press.title", params: { topic: { key: `press.topic.${big.reason}`, params: { opp: opp.name } } } }
        const messageRef: TextRef = big.detail
            ? { key: "press.msg", count: press.questions.length, params: { team: team.name, opp: opp.name, detail: big.detail } }
            : { key: "press.msgPlain", count: press.questions.length, params: { team: team.name, opp: opp.name } }
        const event = {
            id: pressEventId(match.id),
            type: "PRESS",
            week,
            acknowledged: false,
            data: {
                title: tRefEn(titleRef),
                titleRef,
                message: tRefEn(messageRef),
                messageRef,
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
    if (!e || !press) return { ok: false, message: t("press.res.notFound"), applied: 0 }
    const data = (e.data ?? {}) as { isWithdrawn?: boolean; deadlineWeek?: number; teamId?: string }
    if (e.selectedChoiceId !== undefined || data.isWithdrawn || target.gameOverReason) return { ok: false, message: t("press.res.closed"), applied: 0 }
    if (typeof data.deadlineWeek === "number" && target.currentWeek > data.deadlineWeek) return { ok: false, message: t("press.res.closed"), applied: 0 }
    if (data.teamId && data.teamId !== target.playerTeamId) return { ok: false, message: t("press.res.otherClub"), applied: 0 }
    if (target.completedMatches.some(m => m.id === press.matchId) || !target.scheduledMatches.some(m => m.id === press.matchId)) {
        closePressConference(target, press.matchId)
        return { ok: false, message: t("press.res.played"), applied: 0 }
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
        if (arc && a.id !== NO_COMMENT_ID && !arc.log.some(l => l.text === line)) logBeat(arc, target.currentWeek, line)
    }
    // A bold claim about the match waits for the result (settlePressStakes).
    const stakes = press.questions.map(q => q.answers.find(x => x.id === chosen[q.id])?.afterResult).find(Boolean)
    e.selectedChoiceId = "answered"
    e.data = { ...(e.data ?? {}), pressAnswers: chosen, resolvedWeek: target.currentWeek, ...(stakes ? { pressStakes: stakes } : {}) }
    e.acknowledged = true
    if (!target.acknowledgedEventIds.includes(e.id)) target.acknowledgedEventIds.push(e.id)
    return { ok: true, message: applied ? tn("press.res.answered", Object.keys(chosen).length) : t("press.res.faced"), applied }
}

/**
 * The match a press conference was about has been played: settle the bold
 * claim made there, once. Returns what was applied ("win" / "loss"), or null.
 */
export function settlePressStakes(target: Pick<PressTarget, "eventsLog" | "currentWeek" | "playerTeamId" | "teams" | "players" | "financeLedger" | "boardState">, matchId: string, won: boolean): "win" | "loss" | null {
    const e = target.eventsLog.find(x => x.id === pressEventId(matchId))
    const data = (e?.data ?? {}) as { pressStakes?: PressAnswer["afterResult"]; pressSettled?: string }
    if (!e || e.selectedChoiceId !== "answered" || !data.pressStakes || data.pressSettled) return null
    const outcome = won ? "win" : "loss"
    const pseudo = { id: `${e.id}_result`, type: "PRESS", week: target.currentWeek, acknowledged: true, data: { teamId: target.playerTeamId } } as unknown as GameEventSaveData
    applyChoiceEffects(target, pseudo, data.pressStakes[outcome], { id: () => `fin_${pseudo.id}`, description: won ? "Press conference: the claim was backed up" : "Press conference: the claim came back to bite" })
    e.data = { ...(e.data ?? {}), pressSettled: outcome }
    return outcome
}
