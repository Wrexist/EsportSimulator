/**
 * World ranking (Phase 4.8): one rating, one order, tiers by rank band.
 *
 * Elo is the ranking. A result moves the same number of points from the
 * loser to the winner (zero-sum, so the pool never inflates); how many
 * depends on the match (RANKING_TUNING.K: league < qualifier < event tier,
 * playoffs weigh more, friendlies are unrated), a small margin-of-victory
 * factor damped when the favourite wins big, and a provisional factor for a
 * new club's first matches. World rank is the Elo order (ties: reputation,
 * then club number, as the Rankings screen sorts). League tiers are rank
 * bands assigned at season end. Between seasons every rating moves a little
 * toward the pool mean.
 *
 * Deterministic: pure arithmetic on saved values, no RNG.
 */

import type { GameSave, TeamSaveData } from "./save-types"
import { RANKING_TUNING } from "@/lib/balance-tuning"
import { isLeagueMatchId } from "./season/regional-league"

export type BandTier = "S_TIER" | "A_TIER" | "B_TIER" | "C_TIER"

/** RANKING_TUNING's shape (widened so tools can try other values). */
export interface RankingTuning {
    K: Record<string, number>
    PLAYOFF_MULTIPLIER: number
    MOV_MAX: number
    MOV_FULL_ROUND_DIFF: number
    MOV_DAMPING_SCALE: number
    PROVISIONAL_MATCHES: number
    PROVISIONAL_MULTIPLIER: number
    FLOOR: number
    REGRESSION: number
    TIER_BANDS: ReadonlyArray<{ tier: BandTier; share: number }>
}

export type MatchImportance = "FRIENDLY" | "LEAGUE" | "QUALIFIER" | "C_TIER" | "B_TIER" | "A_TIER" | "S_TIER"

export const IMPORTANCE_LABEL: Record<MatchImportance, string> = {
    FRIENDLY: "Friendly",
    LEAGUE: "League",
    QUALIFIER: "Qualifier",
    C_TIER: "C-Tier",
    B_TIER: "B-Tier",
    A_TIER: "A-Tier",
    S_TIER: "S-Tier",
}

const EVENT_TIERS = new Set<MatchImportance>(["QUALIFIER", "C_TIER", "B_TIER", "A_TIER", "S_TIER"])

/** Importance of a match from its competition: no competition (or SCRIM) is a friendly. */
export function matchImportance(tournamentId?: string | null, tournamentTier?: string | null): MatchImportance {
    if (!tournamentId || tournamentId === "SCRIM") return "FRIENDLY"
    if (isLeagueMatchId(tournamentId)) return "LEAGUE"
    const tier = String(tournamentTier ?? "").toUpperCase().replace("-", "_") as MatchImportance
    // An event whose tier is unknown (definition removed) counts as a minor event.
    return EVENT_TIERS.has(tier) ? tier : "C_TIER"
}

/** Elimination-bracket stage of an event ("Round of 16" to the final), not group, Swiss or league rounds. */
export function isPlayoffStage(stage?: string | null): boolean {
    if (!stage) return false
    return /final|semi|quarter|playoff|3rd place|round of/i.test(stage) && !/group|upper|lower|swiss|league|division/i.test(stage)
}

export function expectedScore(rating: number, opponent: number): number {
    return 1 / (1 + Math.pow(10, (opponent - rating) / 400))
}

export interface RatingExchangeInput {
    winnerElo: number
    loserElo: number
    importance: MatchImportance
    playoff?: boolean
    /** Winner's net rounds over the series (>= 0). */
    roundDiff?: number
    /** Maps played (0 = forfeit, no margin). */
    maps?: number
    /** Either side still provisional (a new club). */
    provisional?: boolean
}

export interface RatingExchange {
    /** Points that move from the loser to the winner (integer, >= 0). */
    delta: number
    k: number
    /** Winner's expected score before the match. */
    expected: number
    marginFactor: number
}

/** Points a result moves from the loser to the winner. Pure. */
export function ratingExchange(input: RatingExchangeInput, tuning: RankingTuning = RANKING_TUNING): RatingExchange {
    const expected = expectedScore(input.winnerElo, input.loserElo)
    const base = tuning.K[input.importance] ?? tuning.K.C_TIER
    if (!(base > 0)) return { delta: 0, k: 0, expected, marginFactor: 1 }
    const k = base
        * (input.playoff && input.importance !== "LEAGUE" ? tuning.PLAYOFF_MULTIPLIER : 1)
        * (input.provisional ? tuning.PROVISIONAL_MULTIPLIER : 1)
    const maps = Math.max(0, input.maps ?? 0)
    const perMap = maps > 0 ? Math.max(0, input.roundDiff ?? 0) / maps : 0
    // FiveThirtyEight-style autocorrelation damping: a favourite's big win
    // was partly expected, an underdog's big win says more.
    const edge = (input.winnerElo - input.loserElo) / 1000
    const damping = Math.min(1.5, Math.max(0.5, tuning.MOV_DAMPING_SCALE / (tuning.MOV_DAMPING_SCALE + edge)))
    const marginFactor = 1 + tuning.MOV_MAX * Math.min(1, perMap / tuning.MOV_FULL_ROUND_DIFF) * damping
    const delta = Math.max(0, Math.round(k * marginFactor * (1 - expected)))
    return { delta, k, expected, marginFactor }
}

export interface RatedResultContext {
    tournamentId?: string | null
    tournamentTier?: string | null
    stage?: string | null
    roundDiff?: number
    maps?: number
}

const isProvisional = (team: Pick<TeamSaveData, "ratedMatches">, tuning: RankingTuning) =>
    typeof team.ratedMatches === "number" && team.ratedMatches < tuning.PROVISIONAL_MATCHES

/**
 * Apply a result to both clubs: the winner gains exactly what the loser
 * loses (clamped at the floor). Returns the signed changes.
 */
export function applyRatedResult(
    winner: TeamSaveData,
    loser: TeamSaveData,
    context: RatedResultContext,
    tuning: RankingTuning = RANKING_TUNING,
): { winnerChange: number; loserChange: number; importance: MatchImportance } {
    const importance = matchImportance(context.tournamentId, context.tournamentTier)
    if (importance === "FRIENDLY") return { winnerChange: 0, loserChange: 0, importance }
    const winnerElo = Number.isFinite(winner.elo) ? winner.elo : 1000
    const loserElo = Number.isFinite(loser.elo) ? loser.elo : 1000
    const { delta } = ratingExchange({
        winnerElo, loserElo, importance,
        playoff: isPlayoffStage(context.stage),
        roundDiff: context.roundDiff,
        maps: context.maps,
        provisional: isProvisional(winner, tuning) || isProvisional(loser, tuning),
    }, tuning)
    const moved = Math.max(0, Math.min(delta, Math.floor(loserElo - tuning.FLOOR)))
    winner.elo = winnerElo + moved
    loser.elo = loserElo - moved
    if (typeof winner.ratedMatches === "number") winner.ratedMatches++
    if (typeof loser.ratedMatches === "number") loser.ratedMatches++
    return { winnerChange: moved, loserChange: moved ? -moved : 0, importance }
}

// ---------------------------------------------------------------- order

type RankedTeam = Pick<TeamSaveData, "id" | "elo" | "reputation">

/** World-ranking order: Elo, then reputation, then club number (the Rankings screen's sort). */
export function compareRanking(a: RankedTeam, b: RankedTeam): number {
    const ea = a.elo || 0, eb = b.elo || 0
    if (eb !== ea) return eb - ea
    if ((b.reputation || 0) !== (a.reputation || 0)) return (b.reputation || 0) - (a.reputation || 0)
    const an = parseInt(a.id.replace(/\D/g, ""), 10) || 0
    const bn = parseInt(b.id.replace(/\D/g, ""), 10) || 0
    return an - bn || a.id.localeCompare(b.id)
}

/**
 * Sort clubs by Elo and assign world ranks. Records each club's Elo at this
 * refresh (rankedElo) so the next refresh can split a rank change into the
 * club's own results and everyone else's.
 */
export function refreshWorldRankings(save: Pick<GameSave, "teams">): void {
    const sorted = [...save.teams].sort((a, b) => compareRanking(a, b))
    sorted.forEach((team, index) => {
        team.worldRanking = index + 1
        team.rankedElo = team.elo
        // Career-best (lowest) rank ever held — only improves (C8).
        if (team.peakWorldRanking === undefined || team.worldRanking < team.peakWorldRanking) {
            team.peakWorldRanking = team.worldRanking
        }
    })
}

type MovementTeam = RankedTeam & Pick<TeamSaveData, "worldRanking" | "rankedElo">

export interface RankMovement {
    from: number
    to: number
    /** Places the club's own results explain (negative = climbed). */
    own: number
    /** Places other clubs' results explain. */
    others: number
    /** Other clubs whose results took them past the club / dropped them behind it. */
    passedBy: string[]
    droppedBehind: string[]
}

/**
 * A club's rank change since the last refresh, split into the part its own
 * results explain (its new Elo against everyone else's Elo at the last
 * refresh) and the part other clubs' results explain. `before` holds the
 * last refresh (worldRanking, rankedElo); `after` the current Elo (defaults
 * to the same teams: call before refreshing).
 */
export function rankMovement(before: Pick<GameSave, "teams">, teamId: string, after: { teams: MovementTeam[] } = before): RankMovement | null {
    const prior = before.teams.find(t => t.id === teamId)
    const team = after.teams.find(t => t.id === teamId)
    if (!prior || !team || typeof prior.worldRanking !== "number") return null
    const rankedEloOf = new Map(before.teams.map(t => [t.id, typeof t.rankedElo === "number" ? t.rankedElo : t.elo]))
    let ownOnly = 1, to = 1
    const passedBy: string[] = [], droppedBehind: string[] = []
    for (const other of after.teams) {
        if (other.id === teamId) continue
        // Own results only: everyone else as at the last refresh.
        const aheadOwnOnly = compareRanking({ ...other, elo: rankedEloOf.get(other.id) ?? other.elo }, team) < 0
        const aheadNow = compareRanking(other, team) < 0
        if (aheadOwnOnly) ownOnly++
        if (aheadNow) to++
        if (aheadNow && !aheadOwnOnly) passedBy.push(other.id)
        if (!aheadNow && aheadOwnOnly) droppedBehind.push(other.id)
    }
    const from = prior.worldRanking
    return { from, to, own: ownOnly - from, others: to - ownOnly, passedBy, droppedBehind }
}

// ---------------------------------------------------------------- tiers

/** Last rank of each band for a world of `teamCount` clubs. */
export function tierBandLimits(teamCount: number, tuning: RankingTuning = RANKING_TUNING): Array<{ tier: BandTier; maxRank: number }> {
    return tuning.TIER_BANDS.map(b => ({ tier: b.tier, maxRank: Math.round(b.share * teamCount) }))
}

export function tierForRank(rank: number, teamCount: number, tuning: RankingTuning = RANKING_TUNING): BandTier {
    for (const band of tierBandLimits(teamCount, tuning)) if (rank <= band.maxRank) return band.tier
    return "C_TIER"
}

const BAND_TIERS: BandTier[] = ["S_TIER", "A_TIER", "B_TIER", "C_TIER"]

/**
 * Where a club would move if the season ended now: tiers are re-banded by
 * world rank at season end, so a club ranked inside a higher band goes up and
 * one ranked inside a lower band goes down (LeagueEngine.getPromotionZone /
 * getRelegationZone use the same rule).
 */
export function seasonEndTierMove(currentTier: string | undefined, rank: number | undefined, teamCount: number, tuning: RankingTuning = RANKING_TUNING): "up" | "down" | null {
    const now = BAND_TIERS.indexOf(currentTier as BandTier)
    if (now < 0 || !teamCount) return null
    const next = BAND_TIERS.indexOf(tierForRank(rank ?? Number.MAX_SAFE_INTEGER, teamCount, tuning))
    return next < now ? "up" : next > now ? "down" : null
}

/** True when every club holds a band tier and each tier holds exactly its band's size. */
export function tiersAreBanded(save: Pick<GameSave, "teams">, tuning: RankingTuning = RANKING_TUNING): boolean {
    const n = save.teams.length
    const want = new Map<string, number>(BAND_TIERS.map(t => [t, 0]))
    let previous = 0
    for (const band of tierBandLimits(n, tuning)) { want.set(band.tier, band.maxRank - previous); previous = band.maxRank }
    want.set("C_TIER", n - previous)
    const have = new Map<string, number>()
    for (const t of save.teams) {
        if (!want.has(t.leagueTier)) return false
        have.set(t.leagueTier, (have.get(t.leagueTier) ?? 0) + 1)
    }
    return BAND_TIERS.every(t => (have.get(t) ?? 0) === want.get(t))
}

/**
 * Assign every club the tier of its rank band, ranking by current Elo
 * (without touching world ranks). Returns the clubs that moved.
 */
export function applyTierBands(save: Pick<GameSave, "teams">, tuning: RankingTuning = RANKING_TUNING): Array<{ teamId: string; from: string; to: BandTier }> {
    const n = save.teams.length
    const moved: Array<{ teamId: string; from: string; to: BandTier }> = []
    ;[...save.teams].sort((a, b) => compareRanking(a, b)).forEach((team, index) => {
        const tier = tierForRank(index + 1, n, tuning)
        if (team.leagueTier !== tier) moved.push({ teamId: team.id, from: team.leagueTier, to: tier })
        team.leagueTier = tier
    })
    return moved
}

// ---------------------------------------------------------------- season end

/**
 * Season rollover: every rating (and its last ranked value) moves REGRESSION
 * of the way toward the pool mean. Order preserving up to rounding ties.
 */
export function regressRatingsToMean(save: Pick<GameSave, "teams">, tuning: RankingTuning = RANKING_TUNING): number {
    const rated = save.teams.filter(t => Number.isFinite(t.elo))
    if (!rated.length || !(tuning.REGRESSION > 0)) return 0
    const mean = rated.reduce((s, t) => s + t.elo, 0) / rated.length
    const keep = 1 - tuning.REGRESSION
    for (const t of rated) {
        t.elo = Math.round(mean + (t.elo - mean) * keep)
        if (typeof t.rankedElo === "number") t.rankedElo = Math.round(mean + (t.rankedElo - mean) * keep)
    }
    return mean
}
