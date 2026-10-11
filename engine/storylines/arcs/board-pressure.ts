/**
 * Board under pressure: the managed club's board confidence (Phase 4.4)
 * below BOARD_PRESSURE_BELOW after the tenure grace period.
 *
 *   0. Media speculation (news) with the confidence and its real causes.
 *   1. The ultimatum (news): the board objective furthest behind, with where
 *      the club stands. The board's own warnings stay the board's (no second
 *      inbox message).
 *   2. Resolution: confidence back to RECOVERED_AT (survives), dismissal, or
 *      the season review.
 */

import type { ArcDefinition, StoryContext } from "../common"
import type { BoardObjective } from "../../save-types"
import { BOARD_TUNING as B, STORY_TUNING as S } from "@/lib/balance-tuning"
import { clubOf, logBeat, nextBeat, resolveArc, storyNews, usd, weekOfSeason } from "../common"

const ordinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"], v = n % 100
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

function standing(o: BoardObjective): string {
    if (o.current === undefined) return "no standing yet"
    return o.id === "finance" ? `${usd(o.current)} in the bank against ${usd(o.target)}`
        : o.id === "ranking" ? `ranked #${o.current} against a target of #${o.target}`
            : `${ordinal(o.current)} against a target of ${ordinal(o.target)}`
}

function manager(ctx: StoryContext): string {
    return ctx.save.managerDetails?.name || "the manager"
}

export const boardPressure: ArcDefinition = {
    kind: "BOARD_PRESSURE",

    detect(ctx) {
        const team = ctx.managed
        const board = ctx.save.boardState
        if (!team || !board || board.teamId !== team.id || board.confidence >= S.BOARD_PRESSURE_BELOW) return []
        const tenure = ctx.week - (ctx.save.managerDetails?.tenureStartWeek ?? 1) + 1
        if (tenure <= B.TENURE_GRACE_WEEKS) return []
        const causes = (board.history ?? []).filter(m => m.delta < 0).slice(0, 2).map(m => m.cause)
        return [{
            kind: "BOARD_PRESSURE", teamId: team.id, managed: true, playerIds: [], clubIds: [], subject: team.id,
            score: S.BOARD_PRESSURE_BELOW - board.confidence,
            facts: { confidence: Math.round(board.confidence), causes: causes.join("; ") },
        }]
    },

    open(ctx, arc) {
        const club = clubOf(ctx, arc.teamId)
        const causes = String(arc.facts.causes || "")
        storyNews(ctx, arc, "b0", `Pressure mounts on ${manager(ctx)} at ${club}`,
            `Board confidence at ${club} has fallen to ${arc.facts.confidence}/100.${causes ? ` Recent setbacks: ${causes.toLowerCase()}.` : ""} `
            + `Below ${B.WARN_BELOW} the board issues a warning, below ${B.NOTICE_BELOW} the manager is on notice, and a manager on notice is dismissed at ${B.SACK_AT_OR_BELOW}.`)
        logBeat(arc, ctx.week, `Board confidence down to ${arc.facts.confidence}/100.`)
        nextBeat(arc, ctx.week, S.BOARD_ULTIMATUM_AFTER_WEEKS)
    },

    advance(ctx, arc) {
        const club = clubOf(ctx, arc.teamId)
        if (ctx.save.gameOverReason === "SACKED" || ctx.save.playerTeamId !== arc.teamId) {
            const text = `${manager(ctx)} has been dismissed by ${club}.`
            storyNews(ctx, arc, "end", `${club} part ways with ${manager(ctx)}`, text)
            return resolveArc(arc, ctx.week, "SACKED", text)
        }
        const board = ctx.save.boardState
        if (!board) return resolveArc(arc, ctx.week, "VOID")
        const c = Math.round(board.confidence)
        if (board.confidence >= B.RECOVERED_AT) {
            const text = `${manager(ctx)} steadies the ship: board confidence back to ${c}/100.`
            storyNews(ctx, arc, "end", `${manager(ctx)} survives at ${club}`, text)
            return resolveArc(arc, ctx.week, "SURVIVES", text)
        }
        if (arc.beat === 1) {
            const behind = (board.objectives ?? []).filter(o => o.status === "AT_RISK" || o.status === "MISSED")
            const o = behind.find(x => x.id === "league") ?? behind.find(x => x.id === "ranking") ?? behind[0]
            const weeksLeft = 52 - weekOfSeason(ctx.week)
            const text = o
                ? `The board's message to ${manager(ctx)}: ${o.label.charAt(0).toLowerCase()}${o.label.slice(1)}. ${club} are ${standing(o)}, with ${weeksLeft} weeks of the season left. Confidence: ${c}/100.`
                : `The board's message to ${manager(ctx)}: results must improve. Confidence: ${c}/100, with ${weeksLeft} weeks of the season left.`
            storyNews(ctx, arc, "b1", `${club} board sets out its demand`, text)
            logBeat(arc, ctx.week, o ? `Ultimatum: ${o.label} (${standing(o)}).` : "Ultimatum: results must improve.")
            return nextBeat(arc, ctx.week)
        }
        arc.nextWeek = ctx.week + 1
        // The season review settles it either way.
        if (weekOfSeason(ctx.week) === 52 || ctx.week >= arc.startedWeek + S.BOARD_MAX_WEEKS) {
            const text = `${manager(ctx)} is still in post at ${club}, board confidence ${c}/100${board.onNotice ? ", on notice" : ""}.`
            storyNews(ctx, arc, "end", `${manager(ctx)} hangs on at ${club}`, text)
            resolveArc(arc, ctx.week, "HANGS_ON", text)
        }
    },
}
