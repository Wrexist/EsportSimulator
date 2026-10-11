/**
 * Pro Top 20 (Phase 5.1: real stats only).
 *
 * The yearly Top 20 is the closed season's ranking from season-honours.ts:
 * players with enough official maps, ordered by their importance-weighted
 * rating (each map counts at its competition's weight). Every number shown
 * is a real season total: rating, ADR, kills per round, K-D, maps, match MVP
 * awards, titles and Majors won on the club's roster. Nothing is invented:
 * the old OVR-based ratings and hash-made Major wins, Major MVPs, EVPs and
 * "big event wins" are gone.
 *
 * Revealed in the season review's awards ceremony (Phase 5.4b,
 * components/moments/season-review) from #20 to #1 at the start of the next
 * season; the inbox event carries the awards object and reopens the review.
 */

import type { GameSave } from "./save-types"
import type { AwardWinner, SeasonHonours } from "./records-types"
import { EventType } from "@/types"

export interface Top20Player {
    rank: number
    playerId: string
    playerName: string
    nickname: string
    nationality: string
    portraitPath: string
    teamId: string
    teamName: string
    teamLogo: string

    /** Rounds-weighted season rating (script-v1 HLTV-2.0-style). */
    rating: number
    /** Importance-weighted rating the ranking uses. */
    score: number
    adr: number
    kpr: number
    kills: number
    deaths: number
    mapsPlayed: number
    /** Match MVP awards this season. */
    mvpCount: number
    /** Titles won on the club's roster this season. */
    titles: number
    majorWins: number

    age: number
    role: string
    isPlayerTeam: boolean

    /** Day revealed (1-20, where 1 = #20 player, 20 = #1 player). */
    revealDay: number
}

export interface AnnualAwards {
    /** Season the awards are for. */
    year: number
    generatedWeek: number
    revealStartWeek: number
    currentRevealDay: number
    isFullyRevealed: boolean
    /** Official maps needed to be ranked. */
    minMaps: number

    top20: Top20Player[]

    /** Season MVP (the #1 of the ranking). */
    mvpOfTheYear: Top20Player | null
    /** Best ranked player aged 20 or younger, or in his first season (season-honours.ts). */
    rookieOfTheYear: Top20Player | null
    /** Best ranked IGL and AWPer. */
    iglOfTheYear: Top20Player | null
    awperOfTheYear: Top20Player | null
}

/**
 * True for awards built from real season stats (Phase 5.1). Awards events
 * from older saves carried OVR-derived ratings and invented Major wins; the
 * ceremony does not show them.
 */
export function isRealAwards(raw: unknown): raw is AnnualAwards {
    const a = raw as Partial<AnnualAwards> | null
    return !!a && typeof a.minMaps === "number" && Array.isArray(a.top20) && a.top20.every(p => typeof p?.rating === "number")
}

function toTop20Player(save: GameSave, w: AwardWinner, playerTeamId: string): Top20Player {
    const player = save.players.find(p => p.id === w.playerId)
    const team = save.teams.find(t => t.id === w.teamId)
    const rank = w.rank ?? 0
    return {
        rank,
        playerId: w.playerId,
        playerName: player?.name ?? w.name,
        nickname: w.name,
        nationality: player?.nationality ?? "",
        portraitPath: player?.portraitPath ?? "",
        teamId: w.teamId,
        teamName: team?.name ?? w.teamId,
        teamLogo: team?.logoPath ?? "",
        rating: w.rating,
        score: w.score,
        adr: w.adr,
        kpr: w.rounds ? Math.round(w.kills / w.rounds * 100) / 100 : 0,
        kills: w.kills,
        deaths: w.deaths,
        mapsPlayed: w.maps,
        mvpCount: w.mvps,
        titles: w.trophies,
        majorWins: w.majors,
        age: w.age,
        role: w.role,
        isPlayerTeam: w.teamId === playerTeamId,
        revealDay: rank ? 21 - rank : 0,
    }
}

/** The awards ceremony's data for a closed season. */
export function buildAnnualAwards(save: GameSave, honours: SeasonHonours, playerTeamId: string): AnnualAwards {
    const top20 = honours.top20.map(w => toTop20Player(save, w, playerTeamId))
    const byRole = (role: string) => top20.find(p => p.role.toUpperCase() === role) ?? null
    const rookie = honours.rookie ? (top20.find(p => p.playerId === honours.rookie!.playerId) ?? toTop20Player(save, honours.rookie, playerTeamId)) : null
    return {
        year: honours.season,
        generatedWeek: honours.week,
        revealStartWeek: honours.week,
        currentRevealDay: 0,
        isFullyRevealed: false,
        minMaps: honours.minMaps,
        top20,
        mvpOfTheYear: top20[0] ?? null,
        rookieOfTheYear: rookie,
        iglOfTheYear: byRole("IGL"),
        awperOfTheYear: byRole("AWPER"),
    }
}

/**
 * The awards (and the season close) run in the first week of each season
 * from season 2 (week 53, 105, ...), for the season that just ended.
 */
export function shouldTriggerAwards(currentWeek: number): boolean {
    return currentWeek >= 53 && currentWeek % 52 === 1
}

/** Day 1 reveals #20, day 20 reveals #1. */
export function getRevealForDay(day: number): number {
    if (day < 1 || day > 20) return 0
    return 21 - day
}

/** Inbox event carrying the awards (once per season). */
export function addProAwardsEvent(save: GameSave, awards: AnnualAwards): void {
    const id = `pro_top20_season${awards.year}`
    if (save.eventsLog.some(e => e.id === id)) return
    if (!awards.top20.length) return
    const ours = awards.top20.filter(p => p.isPlayerTeam)
    const message = ours.length > 0
        ? `The Pro Top 20 of season ${awards.year} is out: ${ours.length} of your players made the list. Ranked on official maps (at least ${awards.minMaps}), each map weighted by its competition.`
        : `The Pro Top 20 of season ${awards.year} is out. Ranked on official maps (at least ${awards.minMaps}), each map weighted by its competition.`
    save.eventsLog.push({
        id,
        type: EventType.MEDIA,
        week: save.currentWeek,
        data: {
            title: `Pro Top 20 of season ${awards.year}`,
            message,
            proAwards: awards,
            hasPlayerTeamMember: ours.length > 0,
            playerTeamMembers: ours.map(p => ({ rank: p.rank, nickname: p.nickname, revealDay: p.revealDay })),
        },
        acknowledged: false,
    })
}
