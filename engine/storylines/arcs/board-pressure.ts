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
import { ORDINAL_REF, STORED_REF, type TextParam, type TextRef } from "@/lib/i18n"
import { clubRef, divisionRef, joined, logBeat, nextBeat, resolveArc, said, storyNews, usd, weekOfSeason, weeksRef } from "../common"

const ord = (n: number): TextRef => ({ key: ORDINAL_REF, count: n })

function standing(o: BoardObjective): TextRef {
    if (o.current === undefined) return { key: "sl.bp.standing.none" }
    return o.id === "finance" ? { key: "sl.bp.standing.finance", params: { current: usd(o.current), target: usd(o.target) } }
        : o.id === "ranking" ? { key: "sl.bp.standing.ranking", params: { current: o.current, target: o.target } }
            : o.id === "trophies" ? { key: "sl.bp.standing.trophies", params: { current: o.current, target: o.target } }
                : { key: "sl.bp.standing.place", params: { current: ord(o.current), target: ord(o.target) } }
}

/** An objective as a demand ("finish 7th or better in X"), read from its stored label and target. */
function demand(o: BoardObjective): TextRef {
    const l = o.label ?? ""
    let m: RegExpMatchArray | null
    if (o.id === "league") {
        if ((m = l.match(/^Win promotion from (.+) \(top (\d+)\)$/))) return { key: "sl.bp.demand.promotion", params: { division: divisionRef(m[1]), n: Number(m[2]) } }
        if ((m = l.match(/^Avoid relegation from (.+) \((\d+)\w* or better\)$/))) return { key: "sl.bp.demand.avoid", params: { division: divisionRef(m[1]), position: ord(Number(m[2])) } }
        if ((m = l.match(/^Finish (\d+)\w* or better in (.+)$/))) return { key: "sl.bp.demand.finish", params: { position: ord(Number(m[1])), division: divisionRef(m[2]) } }
        if ((m = l.match(/^Win (.+)$/))) return { key: "sl.bp.demand.win", params: { division: divisionRef(m[1]) } }
    }
    if (o.id === "ranking") return { key: "sl.bp.demand.ranking", params: { rank: o.target } }
    if (o.id === "finance") return { key: "sl.bp.demand.finance", params: { amount: usd(o.target) } }
    if (o.id === "trophies") return { key: "sl.bp.demand.trophies", count: o.target }
    const text = l.replace(/^Budget discipline:\s*/i, "")
    return { key: STORED_REF, params: { text: text.charAt(0).toLowerCase() + text.slice(1) } }
}

function manager(ctx: StoryContext): TextParam {
    return ctx.save.managerDetails?.name || { key: "sl.bp.theManager" }
}

/** The board's recent setbacks (stored English causes), lower-cased, as a list. */
function joinedCauses(causes: string[]): TextRef {
    return { key: "@list", params: Object.fromEntries(causes.map((c, i) => [i, { key: STORED_REF, params: { text: c } }])) }
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
        const club = clubRef(ctx, arc.teamId)
        const causes = String(arc.facts.causes || "").split("; ").filter(Boolean)
        storyNews(ctx, arc, "b0", said("sl.bp.newsTitle", { manager: manager(ctx), club }),
            joined(" ",
                said("sl.bp.fallen", { club, confidence: String(arc.facts.confidence) }),
                causes.length > 0 && said("sl.bp.setbacks", { causes: joinedCauses(causes) }),
                said("sl.bp.rules", { warn: B.WARN_BELOW, notice: B.NOTICE_BELOW, sack: B.SACK_AT_OR_BELOW })))
        logBeat(arc, ctx.week, said("sl.bp.log", { confidence: String(arc.facts.confidence) }))
        nextBeat(arc, ctx.week, S.BOARD_ULTIMATUM_AFTER_WEEKS)
    },

    advance(ctx, arc) {
        const club = clubRef(ctx, arc.teamId)
        if (ctx.save.gameOverReason === "SACKED") {
            const text = said("sl.bp.sacked", { manager: manager(ctx), club })
            storyNews(ctx, arc, "end", said("sl.bp.sackedTitle", { club, manager: manager(ctx) }), text)
            return resolveArc(arc, ctx.week, "SACKED", text)
        }
        if (ctx.save.playerTeamId !== arc.teamId) {
            // He left before the board decided: a job elsewhere, not a dismissal.
            const text = said("sl.bp.left", { manager: manager(ctx), club, other: clubRef(ctx, ctx.save.playerTeamId) })
            storyNews(ctx, arc, "end", said("sl.bp.leftTitle", { manager: manager(ctx), club }), text)
            return resolveArc(arc, ctx.week, "LEFT", text)
        }
        const board = ctx.save.boardState
        if (!board) return resolveArc(arc, ctx.week, "VOID")
        const c = Math.round(board.confidence)
        if (board.confidence >= B.RECOVERED_AT) {
            const text = said("sl.bp.survives", { manager: manager(ctx), confidence: c })
            storyNews(ctx, arc, "end", said("sl.bp.survivesTitle", { manager: manager(ctx), club }), text)
            return resolveArc(arc, ctx.week, "SURVIVES", text)
        }
        if (arc.beat === 1) {
            const behind = (board.objectives ?? []).filter(o => o.status === "AT_RISK" || o.status === "MISSED")
            const o = behind.find(x => x.id === "league") ?? behind.find(x => x.id === "ranking") ?? behind[0]
            const weeksLeft = 52 - weekOfSeason(ctx.week)
            const text = o
                ? said("sl.bp.message", { manager: manager(ctx), demand: demand(o), club, standing: standing(o), weeks: weeksRef(weeksLeft), confidence: c })
                : said("sl.bp.demandResults", { manager: manager(ctx), confidence: c, weeks: weeksRef(weeksLeft) })
            storyNews(ctx, arc, "b1", said("sl.bp.demandTitle", { club }), text)
            logBeat(arc, ctx.week, o ? said("sl.bp.logDemand", { demand: demand(o), standing: standing(o) }) : said("sl.bp.logResults"))
            return nextBeat(arc, ctx.week)
        }
        arc.nextWeek = ctx.week + 1
        // The season review settles it either way.
        if (weekOfSeason(ctx.week) === 52 || ctx.week >= arc.startedWeek + S.BOARD_MAX_WEEKS) {
            const text = said(board.onNotice ? "sl.bp.hangsOnNotice" : "sl.bp.hangsOn", { manager: manager(ctx), club, confidence: c })
            storyNews(ctx, arc, "end", said("sl.bp.hangsOnTitle", { manager: manager(ctx), club }), text)
            resolveArc(arc, ctx.week, "HANGS_ON", text)
        }
    },
}
