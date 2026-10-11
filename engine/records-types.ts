/**
 * Records & truth (Phase 5.1): save shapes for official-match statistics,
 * season lines, season honours, records and the manager timeline.
 *
 * Every field is optional on the save (additive, no save-version bump): an
 * older save simply starts recording from the first official match it plays.
 * Official = any match with a league or tournament id other than SCRIM;
 * friendlies and scrims never count.
 *
 * Writers: engine/official-stats.ts (per match, trophies),
 * engine/season-honours.ts (season rollover), engine/manager-timeline.ts
 * (manager stints and reputation). Reader for screens: engine/season-review.ts.
 */

// ---------------------------------------------------------------- players

/** One player's official-match totals for one club in one season (closed). */
export interface PlayerSeasonLine {
    season: number
    clubId: string
    maps: number
    rounds: number
    kills: number
    deaths: number
    /** Average damage per round, 1 dp. */
    adr: number
    /** Rounds-weighted average of the per-map ratings (script-v1 HLTV-2.0-style), 2 dp. */
    rating: number
    /** Importance-weighted rating sum: sum of (map rating - 1) x rounds x competition weight, 1 dp. */
    impact: number
    /** Titles the club won while the player was on its roster. Omitted when 0. */
    trophies?: number
    /** Majors among those titles. Omitted when 0. */
    majors?: number
    /** Match MVP awards (highest rating on the winning side). Omitted when 0. */
    mvps?: number
}

/** Running totals for the current season and club; closed into a PlayerSeasonLine. */
export interface PlayerSeasonTally {
    season: number
    clubId: string
    maps: number
    rounds: number
    kills: number
    deaths: number
    assists: number
    damage: number
    /** Sum of map rating x map rounds. */
    ratingSum: number
    /** Sum of (map rating - 1) x map rounds x competition weight. */
    impact: number
    trophies: number
    majors: number
    mvps: number
}

/** A personal best on a single map. */
export interface PersonalBest {
    value: number
    week: number
    /** Opponent club id. */
    vs: string
    map: string
}

export type HonourKind = "MVP" | "TEAM_OF_SEASON" | "ROOKIE" | "TOP20"

/** A season award the player received. `rank` is set for TOP20. */
export interface PlayerHonour {
    season: number
    award: HonourKind
    rank?: number
}

// ---------------------------------------------------------------- records

/** One record: who, when, against whom, and the number. */
export interface RecordEntry {
    value: number
    /** Club holding the record (for player records: the player's club then). */
    teamId: string
    /** Opponent beaten / faced (win streak: the last club beaten in the run). */
    opponentId: string
    week: number
    matchId: string
    playerId?: string
    /** Nickname at the time (the player may later retire and be removed). */
    playerName?: string
    map?: string
    /** Score from the holder's side, e.g. "13-0" or "2-0". */
    score?: string
    /** Win streak: week of the first win of the run. */
    fromWeek?: number
    /** Win streak: club that ended the run (absent while it is still running). */
    endedBy?: string
}

export type RecordKey = "bestMapRating" | "mostMapKills" | "biggestWin" | "longestWinStreak"

export const RECORD_KEYS: readonly RecordKey[] = ["bestMapRating", "mostMapKills", "biggestWin", "longestWinStreak"]

export type RecordSet = Partial<Record<RecordKey, RecordEntry>>

export interface ClubRecordSet extends RecordSet {
    /** Current run of official wins (no entry while the club's last result was a loss). */
    streak?: { count: number; fromWeek: number; lastOpponentId: string; lastMatchId: string; lastWeek: number }
}

/** A title won in a season (league top division or a tournament). */
export interface SeasonTitle {
    tournamentId: string
    name: string
    tier: string
    teamId: string
    week: number
    major?: boolean
}

/** The managed club's season, collected as it is played. */
export interface UserClubSeason {
    teamId: string
    /** Official series won and lost while managed. */
    wins: number
    losses: number
    /** Largest winning round difference over a series. */
    biggestWin?: RecordEntry
    /** Largest losing round difference over a series (value is the margin, positive). */
    worstLoss?: RecordEntry
    /** World-rank tier band move at season end (LeagueEngine.processSeasonEnd). */
    tierMove?: { from: string; to: string; rank: number }
}

/** A season still being written. */
export interface OpenSeasonBook {
    season: number
    /** Season bests (all clubs). */
    bests: RecordSet
    /** All-time records that fell this season (keys, in order). */
    broken: RecordKey[]
    titles: SeasonTitle[]
    /** Keyed by managed club id (a mid-season job change leaves two). */
    user: Record<string, UserClubSeason>
}

// ---------------------------------------------------------------- honours

/** A player in a season award, with the season numbers that earned it. */
export interface AwardWinner {
    playerId: string
    /** Nickname. */
    name: string
    /** Club the player spent most rounds with that season. */
    teamId: string
    role: string
    /** Age during the season. */
    age: number
    maps: number
    rounds: number
    rating: number
    /** Importance-weighted rating used for ranking (see season-honours.ts). */
    score: number
    kills: number
    deaths: number
    adr: number
    trophies: number
    majors: number
    mvps: number
    /** TOP20 only. */
    rank?: number
}

export interface UserClubReview {
    teamId: string
    /** Last league split of the season the club finished. */
    finalLeaguePosition?: { position: number; of: number; division: string; level: number; split: 1 | 2 }
    tierMove: "promoted" | "relegated" | "none"
    tierFrom?: string
    tierTo?: string
    trophies: SeasonTitle[]
    bestPlayer?: AwardWinner
    biggestWin?: RecordEntry
    worstLoss?: RecordEntry
    record: { wins: number; losses: number }
}

export interface ManagerSeasonSummary {
    /** Clubs managed during the season, in order, with official results. */
    stints: Array<{ teamId: string; matches: number; wins: number; losses: number; trophies: number; ended?: ManagerStint["ended"] }>
    reputationStart: number
    reputationEnd: number
    /** Reputation changes during the season, newest last. */
    reputationChanges: ReputationChange[]
    level: number
}

/** A closed season's honours. */
export interface SeasonHonours {
    season: number
    /** Week the season was closed. */
    week: number
    /** Minimum official maps to be ranked. */
    minMaps: number
    /** Players ranked (with at least minMaps maps). */
    ranked: number
    mvp?: AwardWinner
    teamOfSeason: AwardWinner[]
    rookie?: AwardWinner
    top20: AwardWinner[]
    records: RecordSet
    brokenRecords: RecordKey[]
    titles: SeasonTitle[]
    userClub?: UserClubReview
    manager?: ManagerSeasonSummary
}

/** GameSave.recordBook */
export interface RecordBook {
    version: 1
    /** All-time records across the world since this career began. */
    world: RecordSet
    /** All-time records per club. */
    clubs: Record<string, ClubRecordSet>
    /** Seasons still being written (the current one, and the last until its honours are built). */
    open: OpenSeasonBook[]
    /** Closed seasons, oldest first (capped). */
    honours: SeasonHonours[]
}

// ---------------------------------------------------------------- manager

/** How a spell at a club ended. There is no resignation action in the game. */
export type StintEnd = "moved" | "sacked" | "folded"

export interface ManagerStint {
    teamId: string
    teamName: string
    fromWeek: number
    toWeek?: number
    /** Set when tracking began after the stint did (a save from before Phase 5.1). */
    trackedFromWeek?: number
    /** Official matches (friendlies excluded). */
    matches: number
    wins: number
    losses: number
    trophies: number
    ended?: StintEnd
}

export interface ReputationChange {
    week: number
    delta: number
    cause: string
}
