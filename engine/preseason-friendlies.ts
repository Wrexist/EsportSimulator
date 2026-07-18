/**
 * Preseason friendlies seeding.
 *
 * A brand-new career starts at Week 1 with an empty calendar: the player is
 * not yet registered for any tournament (the first events are still weeks
 * away) and no scrims are booked, so the Schedule reads as a blank grid and
 * the dashboard shows "No upcoming matches". That is a weak first hour.
 *
 * This seeds a short set of practice scrims ("Preseason Friendly") against
 * similarly-ranked opponents across the opening weeks, so the player has
 * something to play immediately, the dashboard surfaces a real next match,
 * and the stats/results pages fill in once those games are played.
 *
 * Fully deterministic (seeded off the save) and additive — it only pushes
 * scrims into scheduledMatches, so it is safe to skip on old saves.
 */

import type { GameSave, MatchSaveData, TeamSaveData } from "./save-types"
import { SeededRNG } from "./rng"

// Mid-week slots (0=Mon … 6=Sun). Tournament/league games land on the
// weekend, so friendlies sit on Wed/Thu to avoid clashing.
const FRIENDLY_SLOTS: Array<{ week: number; day: number }> = [
    { week: 1, day: 2 }, // Wed, week 1
    { week: 1, day: 4 }, // Fri, week 1
    { week: 2, day: 2 }, // Wed, week 2
]

/**
 * Choose opponents closest to the player's team in world ranking that can
 * actually field a five (so the scrim is played, not force-forfeited).
 * Deterministic: ties broken by stable team id, and the final pick order is
 * lightly shuffled with the seeded rng so different careers vary.
 */
function pickOpponents(
    save: GameSave,
    playerTeam: TeamSaveData,
    count: number,
    rng: SeededRNG,
): TeamSaveData[] {
    const playerRank = playerTeam.worldRanking ?? 50
    const candidates = save.teams
        .filter(t => t.id !== playerTeam.id && (t.rosterIds?.length ?? 0) >= 5)
        .map(t => ({
            team: t,
            distance: Math.abs((t.worldRanking ?? 50) - playerRank),
        }))
        .sort((a, b) => {
            if (a.distance !== b.distance) return a.distance - b.distance
            return a.team.id.localeCompare(b.team.id)
        })

    // Build a shortlist of genuinely close-ranked teams — everyone within a
    // ranking band of the count-th closest — then seed-shuffle within it so the
    // exact opponents vary between careers without ever reaching outliers.
    const RANK_BAND = 12
    const cutoff = (candidates[count - 1]?.distance ?? Infinity) + RANK_BAND
    const shortlist = candidates.filter(c => c.distance <= cutoff)
    for (let i = shortlist.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1))
        ;[shortlist[i], shortlist[j]] = [shortlist[j], shortlist[i]]
    }
    return shortlist.slice(0, count).map(c => c.team)
}

/**
 * Seed preseason friendlies into `save.scheduledMatches`. Returns the number
 * of scrims added. No-op (returns 0) when the player has no valid team or
 * there are no eligible opponents.
 */
export function seedPreseasonFriendlies(save: GameSave, playerTeamId: string): number {
    const playerTeam = save.teams.find(t => t.id === playerTeamId)
    if (!playerTeam || (playerTeam.rosterIds?.length ?? 0) < 5) return 0

    const rng = new SeededRNG(((save.lastRngSeed ?? 1) ^ 0x5c817d) >>> 0)
    const opponents = pickOpponents(save, playerTeam, FRIENDLY_SLOTS.length, rng)
    if (opponents.length === 0) return 0

    let added = 0
    opponents.forEach((opponent, i) => {
        const slot = FRIENDLY_SLOTS[i]
        if (!slot) return
        const match: MatchSaveData = {
            id: `scrim_preseason_${i}_${save.saveId}`,
            homeTeamId: playerTeamId,
            awayTeamId: opponent.id,
            tournamentId: "SCRIM",
            stage: "Preseason Friendly",
            week: slot.week,
            day: slot.day,
            format: "BO1",
            seed: Math.floor(rng.next() * 0xffffffff) >>> 0,
            isScrim: true,
        }
        save.scheduledMatches.push(match)
        added++
    })

    return added
}
