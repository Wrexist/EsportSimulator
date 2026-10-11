/**
 * Season review accessor (Phase 5.1) — the one read path for a season's
 * story told from real numbers. Stream 5.4b builds the season-review screen
 * on it.
 *
 *   getSeasonReview(save, season) → SeasonReview | null
 *
 * A closed season (the first week of the next season has been played)
 * returns its stored honours (`final: true`). The season in progress returns
 * the same shape computed from the numbers so far (`final: false`); nothing
 * is written. Seasons from before Phase 5.1 (no record book) return null.
 *
 * Fields:
 *   awards        Season MVP and rookie of the year (AwardWinner: player id,
 *                 nickname, club, role, age, maps, rounds, rating, season
 *                 score, kills, deaths, ADR, titles, Majors, match MVPs),
 *                 the Top 20 (`rank` 1-20), `minMaps` and how many were ranked.
 *                 The ranking rules are documented in season-honours.ts.
 *   teamOfSeason  Five players: best AWPer, best IGL, three others.
 *   records       Season bests (best map rating, most kills in a map,
 *                 biggest map win, longest win streak: who, club, opponent,
 *                 week, match, map and score), the all-time records that fell
 *                 this season (`broken`), and the titles won.
 *   managerSummary  Clubs managed during the season (official W-L, titles,
 *                 how a stint ended), reputation at start/end with each change
 *                 and its cause, manager level.
 *   userClub      The managed club: final league position (last split),
 *                 world-rank tier move (promoted / relegated / none), titles,
 *                 best player, biggest win, worst loss, official W-L.
 *
 * Club and player ids resolve against save.teams / save.players; winners and
 * records carry the nickname too, because retired players are eventually
 * removed from the save.
 */

import type { GameSave } from "./save-types"
import type {
    AwardWinner, ManagerSeasonSummary, RecordKey, RecordSet, SeasonHonours, SeasonTitle, UserClubReview,
} from "./records-types"
import { honoursFor, seasonOfWeek } from "./official-stats"
import { awardWinner, buildManagerSummary, buildUserClubReview, provisionalAwards } from "./season-honours"

export interface SeasonReview {
    season: number
    /** True once the season is closed (honours stored); false while it is being played. */
    final: boolean
    awards: {
        mvp?: AwardWinner
        rookie?: AwardWinner
        top20: AwardWinner[]
        minMaps: number
        ranked: number
    }
    teamOfSeason: AwardWinner[]
    records: {
        season: RecordSet
        broken: RecordKey[]
        titles: SeasonTitle[]
    }
    managerSummary?: ManagerSeasonSummary
    userClub?: UserClubReview
}

function fromHonours(h: SeasonHonours): SeasonReview {
    return {
        season: h.season,
        final: true,
        awards: { ...(h.mvp ? { mvp: h.mvp } : {}), ...(h.rookie ? { rookie: h.rookie } : {}), top20: h.top20, minMaps: h.minMaps, ranked: h.ranked },
        teamOfSeason: h.teamOfSeason,
        records: { season: h.records, broken: h.brokenRecords, titles: h.titles },
        ...(h.manager ? { managerSummary: h.manager } : {}),
        ...(h.userClub ? { userClub: h.userClub } : {}),
    }
}

/** Closed seasons with honours, oldest first. */
export function reviewedSeasons(save: Pick<GameSave, "recordBook">): number[] {
    return (save.recordBook?.honours ?? []).map(h => h.season)
}

export function getSeasonReview(save: GameSave, season: number): SeasonReview | null {
    const closed = honoursFor(save, season)
    if (closed) return fromHonours(closed)
    const book = save.recordBook
    const open = book?.open.find(b => b.season === season)
    if (!book || !open || season !== seasonOfWeek(save.currentWeek)) return null
    const awards = provisionalAwards(save, season)
    const win = (r: (typeof awards.ranked)[number], rank?: number) => awardWinner(r, season, save.currentWeek, rank)
    return {
        season,
        final: false,
        awards: {
            ...(awards.mvp ? { mvp: win(awards.mvp) } : {}),
            ...(awards.rookie ? { rookie: win(awards.rookie) } : {}),
            top20: awards.top20.map((r, i) => win(r, i + 1)),
            minMaps: awards.minMaps,
            ranked: awards.ranked.length,
        },
        teamOfSeason: awards.teamOfSeason.map(r => win(r)),
        records: { season: { ...open.bests }, broken: [...open.broken], titles: [...open.titles] },
        managerSummary: buildManagerSummary(save, open, season),
        userClub: buildUserClubReview(save, open, season, save.playerTeamId),
    }
}
