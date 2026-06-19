/**
 * Cross-save Manager Career Profile.
 *
 * Persists the player's all-time manager progression OUTSIDE any single
 * GameSave (its own storage key), so a career arc survives starting a new
 * campaign or deleting a save — the keystone the team-unlock ladder needs
 * (AUDIT_UX_2026-06 C1/C2). Every field is a PEAK (max), a UNION, or a
 * counter, so merging the same save twice is idempotent — no cross-save
 * double-counting.
 *
 * Read at new-game to gate team selection (bigger orgs unlock as your peak
 * manager level climbs) and surfaced on the career page as a legacy track.
 *
 * Client-side I/O only (asyncStorage). NEVER touched by the deterministic week
 * tick — the store calls recordCareerProgress() after the authoritative save
 * and recordNewCampaign() when a campaign starts. (Timestamps use Date.now;
 * this record is metadata, not part of the deterministic/replayable save.)
 */

import type { GameSave } from "./save-types"
import { asyncStorage } from "./storage-adapter"
import { logger } from "@/lib/logger"

const PROFILE_KEY = "cs2_manager_career_profile"
const PROFILE_VERSION = 1
const TEAMS_MANAGED_CAP = 50

export interface ManagerCareerProfile {
    version: number
    /** Highest manager level ever reached across all campaigns. Gates new-game team selection. */
    peakLevel: number
    peakReputation: number
    /** Lowest (best) world ranking ever reached; 0 = none yet. */
    bestWorldRanking: number
    /** Most S-Tier majors won in a single campaign. */
    bestCareerMajors: number
    /** Most trophies won in a single campaign. */
    bestCareerTrophies: number
    /** Longest career measured in seasons managed. */
    mostSeasonsManaged: number
    campaignsStarted: number
    /** Distinct team names managed across all campaigns. */
    teamsManaged: string[]
    firstPlayedAt: number
    lastUpdatedAt: number
}

export function createEmptyCareerProfile(): ManagerCareerProfile {
    return {
        version: PROFILE_VERSION,
        peakLevel: 1,
        peakReputation: 0,
        bestWorldRanking: 0,
        bestCareerMajors: 0,
        bestCareerTrophies: 0,
        mostSeasonsManaged: 0,
        campaignsStarted: 0,
        teamsManaged: [],
        firstPlayedAt: 0,
        lastUpdatedAt: 0,
    }
}

export async function loadCareerProfile(): Promise<ManagerCareerProfile> {
    try {
        const raw = await asyncStorage.getItem(PROFILE_KEY)
        if (!raw) return createEmptyCareerProfile()
        const parsed = JSON.parse(raw) as Partial<ManagerCareerProfile>
        // Spread over a fresh default so older/partial records gain new fields.
        return { ...createEmptyCareerProfile(), ...parsed, version: PROFILE_VERSION }
    } catch (err) {
        logger.warn("[CareerProfile] load failed:", err)
        return createEmptyCareerProfile()
    }
}

async function writeProfile(profile: ManagerCareerProfile): Promise<void> {
    try {
        await asyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
    } catch (err) {
        logger.warn("[CareerProfile] write failed:", err)
    }
}

/**
 * Pure merge of a save's current progression into the profile. Idempotent:
 * all fields are max / union, so re-merging the same save is a no-op.
 */
export function mergeCareerProgress(profile: ManagerCareerProfile, save: GameSave): ManagerCareerProfile {
    const md = save.managerDetails
    const playerTeam = save.teams.find(t => t.id === save.playerTeamId)
    const trophies = playerTeam?.trophies ?? []
    const majors = trophies.filter(t => t.tier === "S_TIER").length
    const rank = playerTeam?.worldRanking ?? 0
    const seasons = save.careerStats?.totalSeasons ?? 0

    const teams = new Set(profile.teamsManaged)
    if (playerTeam?.name) teams.add(playerTeam.name)

    return {
        ...profile,
        version: PROFILE_VERSION,
        peakLevel: Math.max(profile.peakLevel, md?.level ?? 1),
        peakReputation: Math.max(profile.peakReputation, md?.reputation ?? 0),
        bestWorldRanking: rank > 0
            ? (profile.bestWorldRanking === 0 ? rank : Math.min(profile.bestWorldRanking, rank))
            : profile.bestWorldRanking,
        bestCareerMajors: Math.max(profile.bestCareerMajors, majors),
        bestCareerTrophies: Math.max(profile.bestCareerTrophies, trophies.length),
        mostSeasonsManaged: Math.max(profile.mostSeasonsManaged, seasons),
        teamsManaged: Array.from(teams).slice(-TEAMS_MANAGED_CAP),
        firstPlayedAt: profile.firstPlayedAt || Date.now(),
        lastUpdatedAt: Date.now(),
    }
}

/** Load, merge the given save's progression, persist. Fire-and-forget friendly. */
export async function recordCareerProgress(save: GameSave): Promise<ManagerCareerProfile> {
    const profile = await loadCareerProfile()
    const merged = mergeCareerProgress(profile, save)
    await writeProfile(merged)
    return merged
}

/** Bump the campaign counter when a new game starts. */
export async function recordNewCampaign(): Promise<void> {
    const profile = await loadCareerProfile()
    await writeProfile({
        ...profile,
        campaignsStarted: profile.campaignsStarted + 1,
        firstPlayedAt: profile.firstPlayedAt || Date.now(),
        lastUpdatedAt: Date.now(),
    })
}
