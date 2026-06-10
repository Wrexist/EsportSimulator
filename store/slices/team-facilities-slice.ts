"use client"

/**
 * Team facilities / sponsors / equipment / merch slice.
 *
 * Five actions for upgrading and monetizing the team org:
 *
 *   - upgradeFacility — build a new facility (TRAINING / RECOVERY /
 *     FANZONE / TACTICAL) at $10k or level up an existing one (cost
 *     scales linearly at $25k × current level, max level 5). Posts a
 *     FACILITY news item on success.
 *
 *   - signSponsor — sign one of the available sponsor offers. Caps at
 *     3 sponsors total, 1 per tier, rejects PREMIUM unless world rank
 *     ≤30, rejects ELITE unless team has S_TIER trophy / participation /
 *     top-10 ranking. Removes the offer from sponsorOffers on success.
 *
 *   - purchaseEquipment — delegate to EquipmentManager (static import
 *     instead of the lazy require previously used).
 *
 *   - upgradeMerchStore — level up the team's merch store (capped at 5).
 *     Cost doubles each level starting from $50k (50k → 100k → 200k…).
 *     Logs a FACILITIES expense.
 *
 *   - toggleMerchItem — add/remove an item from activeMerchItems.
 *     BUG FIX: previously the add path never set result.success=true,
 *     so adding an item silently reported "Team not found". Now both
 *     branches set the correct success message.
 */

import type { SliceCreator } from "@/store/types"
import type { SponsorSaveData, FacilitySaveData } from "@/engine/save-types"
import { EquipmentManager } from "@/engine/equipment-manager"
import { nextDeterministicId, nextRandomInt } from "@/store/utils/helpers"

const MAX_FACILITY_LEVEL = 5
const FACILITY_BUILD_COST = 10_000
const FACILITY_UPGRADE_BASE_COST = 25_000
const FACILITY_MONTHLY_COST_EXPONENT = 1.25
const FACILITY_MONTHLY_COST_MULTIPLIER = 2000

const MAX_SPONSORS_PER_TEAM = 3
const PREMIUM_TIER_RANK_THRESHOLD = 30
const ELITE_TIER_RANK_THRESHOLD = 10

const MAX_MERCH_STORE_LEVEL = 5
const MERCH_BASE_UPGRADE_COST = 50_000

const NEWS_FEED_CAP = 50

function getFacilityDescription(type: string, level: number): string {
    switch (type) {
        case "TRAINING":
            if (level === 1) return "Basic gaming booths for daily practice."
            if (level === 2) return "Upgraded setup with a dedicated analysts corner."
            if (level === 3) return "Professional academy with private practice rooms."
            if (level === 4) return "State-of-the-art lab with bio-metric feedback."
            if (level === 5) return "The Empire Training Center: Apex of esports."
            return "Inactive"
        case "RECOVERY":
            if (level === 1) return "Basic rest area with snacks and drinks."
            if (level === 2) return "Chill zone with gaming chairs and lounges."
            if (level === 3) return "Health suite with physical therapy equipment."
            if (level === 4) return "Performance kitchen and dedicated sleep pods."
            if (level === 5) return "Empire Wellness Retreat: Infinite stamina."
            return "Inactive"
        case "FANZONE":
            if (level === 1) return "Small local fan club booth."
            if (level === 2) return "Official team store and media studio."
            if (level === 3) return "Interactive museum and fan experience hub."
            if (level === 4) return "Global flagship store and content mansion."
            if (level === 5) return "Empire Fan Plaza: Global cultural center."
            return "Inactive"
        case "TACTICAL":
            if (level === 1) return "Whiteboard and projector setup."
            if (level === 2) return "VOD review station with basic software."
            if (level === 3) return "War room with multi-screen data analysis."
            if (level === 4) return "AI-assisted strategic simulator."
            if (level === 5) return "Empire Command Hub: Tactical perfection."
            return "Inactive"
        default:
            return "Professional facility"
    }
}

export interface TeamFacilitiesActions {
    upgradeFacility: (teamId: string, facilityType: string) => { success: boolean; message: string }
    signSponsor: (teamId: string, sponsor: SponsorSaveData) => { success: boolean; message: string }
    purchaseEquipment: (catalogId: string) => { success: boolean; error?: string }
    upgradeMerchStore: (teamId: string) => { success: boolean; message: string }
    toggleMerchItem: (teamId: string, itemType: string) => { success: boolean; message: string }
}

export const createTeamFacilitiesSlice: SliceCreator<TeamFacilitiesActions> = (set) => ({
    upgradeFacility: (teamId, facilityType) => {
        let result = { success: false, message: "Upgrade failed." }
        set((state) => {
            // Always look up via state.teams inside producers. The Map
            // index can't share a draft with the array slot under Immer,
            // so mutations through _teamIndex.get() silently fail to
            // reach state.teams[i] — see store-mutation-propagation test.
            const team = state.teams.find(t => t.id === teamId)
            if (!team) {
                result = { success: false, message: "Team not found." }
                return
            }

            if (!team.facilities) team.facilities = []
            const facility = team.facilities.find(f => f.type === facilityType)

            if (facility) {
                // Upgrade path: cost scales linearly with current level.
                if (facility.level >= MAX_FACILITY_LEVEL) {
                    result = { success: false, message: `${facilityType} facility is already at max level.` }
                    return
                }
                const cost = facility.level * FACILITY_UPGRADE_BASE_COST
                if (team.budget < cost) {
                    result = { success: false, message: `Insufficient funds. Need $${cost.toLocaleString()}.` }
                    return
                }

                team.budget -= cost
                facility.level += 1
                facility.description = getFacilityDescription(facility.type, facility.level)
                facility.monthlyCost = Math.floor(
                    Math.pow(facility.level, FACILITY_MONTHLY_COST_EXPONENT) * FACILITY_MONTHLY_COST_MULTIPLIER
                )

                state.newsFeed.unshift({
                    id: nextDeterministicId(state, "news_fac", facilityType, facility.level),
                    title: `${team.name} upgrade ${facility.type} Facility`,
                    content: `${team.name} have officially completed work on their ${facility.type.toLowerCase()} center, now reaching level ${facility.level}. ${facility.description}`,
                    category: "FACILITY",
                    teamId: team.id,
                    week: state.currentWeek,
                    engagement: {
                        likes: nextRandomInt(state, 100, 599),
                        views: nextRandomInt(state, 1000, 5999),
                    },
                })
                if (state.newsFeed.length > NEWS_FEED_CAP) state.newsFeed.pop()
                result = { success: true, message: `${facility.type} upgraded to level ${facility.level}.` }
                return
            }

            // Build path: brand-new facility starts at level 1.
            if (team.budget < FACILITY_BUILD_COST) {
                result = { success: false, message: `Insufficient funds. Need $${FACILITY_BUILD_COST.toLocaleString()}.` }
                return
            }
            team.budget -= FACILITY_BUILD_COST
            team.facilities.push({
                id: nextDeterministicId(state, "fac", facilityType),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                type: facilityType as any,
                level: 1,
                description: getFacilityDescription(facilityType, 1),
                monthlyCost: 2000,
            } as FacilitySaveData)

            state.newsFeed.unshift({
                id: nextDeterministicId(state, "news_fac_new", facilityType),
                title: `New ${facilityType} Center for ${team.name}`,
                content: `${team.name} have announced the construction of a new dedicated ${facilityType.toLowerCase()} center to support their operations.`,
                category: "FACILITY",
                teamId: team.id,
                week: state.currentWeek,
                engagement: {
                    likes: nextRandomInt(state, 50, 349),
                    views: nextRandomInt(state, 500, 3499),
                },
            })
            if (state.newsFeed.length > NEWS_FEED_CAP) state.newsFeed.pop()
            result = { success: true, message: `${facilityType} facility built (level 1).` }
        })
        return result
    },

    signSponsor: (teamId, sponsor) => {
        let result = { success: false, message: "Sponsor signing failed." }
        set((state) => {
            const team = state.teams.find(t => t.id === teamId)
            if (!team) {
                result = { success: false, message: "Team not found." }
                return
            }

            if (!team.sponsors) team.sponsors = []

            // Slot cap.
            if (team.sponsors.length >= MAX_SPONSORS_PER_TEAM) {
                result = { success: false, message: "All sponsor slots are full." }
                return
            }
            // One per tier; one per name (covers re-clicking the same offer).
            if (team.sponsors.some(s => s.tier === sponsor.tier)) {
                result = { success: false, message: `You already have an active ${sponsor.tier.toLowerCase()} sponsor.` }
                return
            }
            if (team.sponsors.some(s => s.name === sponsor.name)) {
                result = { success: false, message: "This sponsor is already signed." }
                return
            }
            // Re-sign cooldown after a contract lapses (anti-cycling).
            const cooldownWeek = team.sponsorCooldowns?.[sponsor.name]
            if (typeof cooldownWeek === "number" && cooldownWeek > state.currentWeek) {
                result = { success: false, message: `${sponsor.name} won't return for ${cooldownWeek - state.currentWeek} more week(s) after the last deal lapsed.` }
                return
            }

            // Tier gating by world ranking + tournament achievements.
            const ranking = team.worldRanking || 999
            if (sponsor.tier === "PREMIUM" && ranking > PREMIUM_TIER_RANK_THRESHOLD) {
                result = { success: false, message: `Premium sponsors require a Top ${PREMIUM_TIER_RANK_THRESHOLD} world ranking.` }
                return
            }
            if (sponsor.tier === "ELITE") {
                const hasMajorTrophy = (team.trophies || []).some(t => t.tier === "S_TIER")
                const hasMajorParticipation = state.completedMatches.some(match => {
                    if (match.homeTeamId !== teamId && match.awayTeamId !== teamId) return false
                    if (!match.tournamentId) return false
                    const tournament = state.tournaments.find(t => t.id === match.tournamentId)
                    return tournament?.tier === "S_TIER"
                })
                const isTopRanked = ranking <= ELITE_TIER_RANK_THRESHOLD
                if (!hasMajorTrophy && !hasMajorParticipation && !isTopRanked) {
                    result = { success: false, message: `Elite sponsors require Top ${ELITE_TIER_RANK_THRESHOLD} ranking or major tournament participation.` }
                    return
                }
            }

            const normalizedSponsor: SponsorSaveData = {
                ...sponsor,
                id: sponsor.id || nextDeterministicId(state, "spon", sponsor.tier, sponsor.name),
                remainingWeeks: Math.max(1, Math.floor(sponsor.remainingWeeks || 0)),
                signedWeek: state.currentWeek,
                followerCheckpoint: team.followers || 0,
                lastProcessedWeek: undefined,
            }

            team.sponsors.push(normalizedSponsor)
            // Remove from the available offers pool so the UI doesn't show it
            // as still pickable after signing. Match on id when present, else
            // fall back to name+tier (offers are unique by name) so an id-less
            // offer can't linger as still-pickable.
            state.sponsorOffers = state.sponsorOffers.filter(o =>
                sponsor.id ? o.id !== sponsor.id : !(o.name === sponsor.name && o.tier === sponsor.tier)
            )
            result = { success: true, message: `${normalizedSponsor.name} signed successfully.` }
        })
        return result
    },

    purchaseEquipment: (catalogId) => {
        let result: { success: boolean; error?: string } = { success: false, error: "" }
        set((state) => {
            const team = state.teams.find(t => t.id === state.playerTeamId)
            if (!team) {
                result = { success: false, error: "Team not found" }
                return
            }
            result = EquipmentManager.purchaseEquipment(team, catalogId, state.currentWeek)
        })
        return result
    },

    upgradeMerchStore: (teamId) => {
        let result = { success: false, message: "" }
        set((state) => {
            const team = state.teams.find(t => t.id === teamId)
            if (!team) {
                result = { success: false, message: "Team not found" }
                return
            }

            const currentLevel = team.merchStoreLevel || 1
            if (currentLevel >= MAX_MERCH_STORE_LEVEL) {
                result = { success: false, message: `Store is already at maximum level (${MAX_MERCH_STORE_LEVEL})` }
                return
            }

            // Cost doubles per level: 50k → 100k → 200k → 400k → 800k.
            const cost = MERCH_BASE_UPGRADE_COST * Math.pow(2, currentLevel - 1)
            if (team.budget < cost) {
                result = { success: false, message: `Insufficient funds. Need $${cost.toLocaleString()}` }
                return
            }

            team.budget -= cost
            team.merchStoreLevel = currentLevel + 1

            state.financeLedger.push({
                id: `exp_merch_up_${state.currentWeek}_${teamId}`,
                week: state.currentWeek,
                teamId: teamId,
                type: "EXPENSE",
                category: "FACILITIES",
                amount: cost,
                description: `Merch Store Upgrade to Level ${team.merchStoreLevel}`,
                balance: team.budget,
            })

            result = { success: true, message: `Store upgraded to Level ${team.merchStoreLevel}` }
        })
        return result
    },

    toggleMerchItem: (teamId, itemType) => {
        // Bug fix: the previous inline implementation never updated result
        // on the "add" branch, so adding an item silently returned
        // success=false with "Team not found". Both branches now report
        // the correct outcome.
        let result = { success: false, message: "Team not found" }
        set((state) => {
            const team = state.teams.find(t => t.id === teamId)
            if (!team) return

            if (!team.activeMerchItems) team.activeMerchItems = []

            if (team.activeMerchItems.includes(itemType)) {
                team.activeMerchItems = team.activeMerchItems.filter(i => i !== itemType)
                result = { success: true, message: `${itemType} removed from active merch.` }
            } else {
                team.activeMerchItems.push(itemType)
                result = { success: true, message: `${itemType} added to active merch.` }
            }
        })
        return result
    },
})
