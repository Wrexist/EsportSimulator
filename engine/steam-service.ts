// Phase 40: Steam Integration (Optimized for Electron Bridge)
import { debug } from "@/lib/debug-logger"

export interface Achievement {
    id: string
    name: string
    description: string
    icon: string
    hidden: boolean
    unlocked: boolean
    unlockedAt?: Date
}

// Achievement definitions matching what you'd configure in Steamworks
export const ACHIEVEMENTS: Record<string, Omit<Achievement, 'unlocked' | 'unlockedAt'>> = {
    // ── Win Progression ──
    FIRST_WIN: { id: "FIRST_WIN", name: "First Victory", description: "Secure your first match win", icon: "trophy", hidden: false },
    WIN_10: { id: "WIN_10", name: "Momentum", description: "Win 10 matches", icon: "star", hidden: false },
    WIN_25: { id: "WIN_25", name: "Consistent", description: "Win 25 matches", icon: "star", hidden: false },
    WIN_50: { id: "WIN_50", name: "Force of Nature", description: "Win 50 matches", icon: "flame", hidden: false },
    WIN_100: { id: "WIN_100", name: "Centurion", description: "Win 100 matches", icon: "medal", hidden: false },
    WIN_250: { id: "WIN_250", name: "Relentless", description: "Win 250 matches", icon: "sparkles", hidden: false },
    WIN_500: { id: "WIN_500", name: "Immortal", description: "Win 500 matches", icon: "crown", hidden: false },

    // ── Tournament Achievements ──
    FIRST_TOURNAMENT: { id: "FIRST_TOURNAMENT", name: "Into the Arena", description: "Enter your first tournament", icon: "crosshair", hidden: false },
    WIN_B_TIER: { id: "WIN_B_TIER", name: "Proving Grounds", description: "Win a B-Tier tournament", icon: "award", hidden: false },
    WIN_A_TIER: { id: "WIN_A_TIER", name: "Premier Champion", description: "Win an A-Tier tournament", icon: "award", hidden: false },
    WIN_MAJOR: { id: "WIN_MAJOR", name: "Major Champion", description: "Lift the trophy at a CS2 Major", icon: "crown", hidden: false },
    GRAND_SLAM: { id: "GRAND_SLAM", name: "Grand Slam", description: "Win all 3 Majors in a single year", icon: "gem", hidden: true },
    DYNASTY: { id: "DYNASTY", name: "Dynasty", description: "Win 3 Major championships across your career", icon: "crown", hidden: false },
    PERFECT_TOURNAMENT: { id: "PERFECT_TOURNAMENT", name: "Flawless", description: "Win a tournament without dropping a single map", icon: "shield", hidden: false },

    // ── Competitive Achievements ──
    REACH_S_TIER: { id: "REACH_S_TIER", name: "Elite Circuit", description: "Reach S-Tier league status", icon: "gem", hidden: false },
    TOP_10_RANKING: { id: "TOP_10_RANKING", name: "World Class", description: "Break into the Top 10 world rankings", icon: "globe", hidden: false },
    NUMBER_ONE: { id: "NUMBER_ONE", name: "Apex Predator", description: "Become the #1 ranked team in the world", icon: "crown", hidden: false },
    COMEBACK_KING: { id: "COMEBACK_KING", name: "Comeback King", description: "Win a match after trailing 3-12 or worse", icon: "flame", hidden: false },
    UNDERDOG: { id: "UNDERDOG", name: "Giant Slayer", description: "Defeat a team ranked 20+ positions above you", icon: "swords", hidden: false },

    // ── Management Achievements ──
    FIRST_MILLION: { id: "FIRST_MILLION", name: "Seven Figures", description: "Accumulate $1,000,000 in team budget", icon: "dollar", hidden: false },
    BUDGET_10M: { id: "BUDGET_10M", name: "Empire Builder", description: "Reach $10,000,000 in team budget", icon: "gem", hidden: false },
    DEVELOP_STAR: { id: "DEVELOP_STAR", name: "Star Maker", description: "Develop an academy graduate to 90+ skill rating", icon: "trending", hidden: false },
    HALL_OF_FAME_INDUCTION: { id: "HALL_OF_FAME_INDUCTION", name: "Immortalized", description: "Have a player inducted into the Hall of Fame", icon: "monument", hidden: false },
    LOYAL_TEAM: { id: "LOYAL_TEAM", name: "The Brotherhood", description: "Maintain the same 5-player roster for 3+ years", icon: "heart", hidden: false },
    PROFIT_MASTER: { id: "PROFIT_MASTER", name: "Smart Money", description: "Sell a player for more than the original purchase price", icon: "chart", hidden: false },
    ZERO_TO_HERO: { id: "ZERO_TO_HERO", name: "From Nothing", description: "Rise from C-Tier to S-Tier league status", icon: "rocket", hidden: false },

    // ── Milestone Achievements ──
    TOURNAMENT_WIN: { id: "TOURNAMENT_WIN", name: "Champion", description: "Win any tournament for the first time", icon: "trophy", hidden: false },
    SEASON_COMPLETE: { id: "SEASON_COMPLETE", name: "Full Cycle", description: "Complete an entire 52-week season", icon: "calendar", hidden: false },
    FIRST_TRANSFER: { id: "FIRST_TRANSFER", name: "Dealmaker", description: "Complete your first player transfer", icon: "handshake", hidden: false },

    // ── Hidden Achievements ──
    UNLUCKY: { id: "UNLUCKY", name: "Heartbreaker", description: "Lose a Grand Final in overtime 14-16", icon: "broken_heart", hidden: true },
    REDEMPTION: { id: "REDEMPTION", name: "Redemption Arc", description: "Win a Major the year after losing one", icon: "refresh", hidden: true },
}

export class SteamService {
    private static instance: SteamService
    private unlockedAchievements: Set<string> = new Set()
    private isInitialized: boolean = false
    private onUnlockCallback?: (achievement: Achievement) => void
    private electronBridge: any = null
    private readonly cacheKey = "steam_achievements_cache_v1"
    private activeSaveId: string | null = null

    private constructor() { }

    static getInstance(): SteamService {
        if (!SteamService.instance) {
            SteamService.instance = new SteamService()
        }
        return SteamService.instance
    }

    /**
     * Initialize the Steam SDK via Electron Bridge
     */
    async initialize(onUnlock?: (achievement: Achievement) => void): Promise<boolean> {
        if (this.isInitialized) return true

        if (typeof window !== "undefined") {
            // Access the bridge exposed in preload.js
            this.electronBridge = (window as any).electron?.steam

            if (this.electronBridge) {
                console.log("[Steam] Connected to Electron Steamworks bridge")
                this.isInitialized = true

                if (onUnlock) {
                    this.onUnlockCallback = onUnlock
                }

                await this.refreshUnlockedFromSteam()
            } else {
                debug.warn("[Steam] Electron bridge not found. Running in stub mode.")
                this.loadCachedAchievements()
                this.isInitialized = true
            }
        }

        return true
    }

    async setActiveSave(saveId: string | null): Promise<void> {
        this.activeSaveId = saveId
        if (!this.isInitialized) return
        if (this.electronBridge) {
            await this.refreshUnlockedFromSteam()
            return
        }
        this.loadCachedAchievements()
    }

    // ===== STATS & ACHIEVEMENTS =====
    async setStat(name: string, value: number) {
        if (!this.electronBridge) return
        await this.electronBridge.setStat(name, value)
        await this.electronBridge.storeStats()
    }

    async updatePlayerStats(stats: {
        kills?: number,
        headshots?: number,
        wins?: number,
        matches?: number,
        budget?: number,
        tournamentsWon?: number,
        majorsWon?: number,
        matchesLost?: number,
        peakRanking?: number,
        playersDeveloped?: number,
        prizeMoney?: number
    }) {
        if (!this.electronBridge) return

        // Core stats
        if (stats.kills !== undefined) await this.electronBridge.setStat("stat_total_kills", stats.kills)
        if (stats.headshots !== undefined) await this.electronBridge.setStat("stat_total_hs", stats.headshots)
        if (stats.wins !== undefined) await this.electronBridge.setStat("stat_total_wins", stats.wins)
        if (stats.matches !== undefined) await this.electronBridge.setStat("stat_total_matches", stats.matches)
        if (stats.budget !== undefined) await this.electronBridge.setStat("stat_max_budget", stats.budget)

        // Extended stats
        if (stats.tournamentsWon !== undefined) await this.electronBridge.setStat("stat_tournaments_won", stats.tournamentsWon)
        if (stats.majorsWon !== undefined) await this.electronBridge.setStat("stat_majors_won", stats.majorsWon)
        if (stats.matchesLost !== undefined) await this.electronBridge.setStat("stat_matches_lost", stats.matchesLost)
        if (stats.peakRanking !== undefined) await this.electronBridge.setStat("stat_peak_ranking", stats.peakRanking)
        if (stats.playersDeveloped !== undefined) await this.electronBridge.setStat("stat_players_developed", stats.playersDeveloped)
        if (stats.prizeMoney !== undefined) await this.electronBridge.setStat("stat_prize_money", stats.prizeMoney)

        await this.electronBridge.storeStats()
    }

    async pushLeaderboardStats(stats: {
        maxElo?: number
        majorWins?: number
        weeksToSTier?: number
        totalEarnings?: number
        longestWinStreak?: number
        tournamentsWon?: number
    }) {
        if (!this.electronBridge) return
        if (stats.maxElo !== undefined) {
            await this.electronBridge.setLeaderboardScore?.("lead_world_ranking", stats.maxElo)
        }
        if (stats.majorWins !== undefined) {
            await this.electronBridge.setLeaderboardScore?.("lead_major_wins", stats.majorWins)
        }
        if (stats.weeksToSTier !== undefined) {
            await this.electronBridge.setLeaderboardScore?.("lead_fastest_stier", stats.weeksToSTier)
        }
        if (stats.totalEarnings !== undefined) {
            await this.electronBridge.setLeaderboardScore?.("lead_total_earnings", stats.totalEarnings)
        }
        if (stats.longestWinStreak !== undefined) {
            await this.electronBridge.setLeaderboardScore?.("lead_win_streak", stats.longestWinStreak)
        }
        if (stats.tournamentsWon !== undefined) {
            await this.electronBridge.setLeaderboardScore?.("lead_tournaments_won", stats.tournamentsWon)
        }
    }

    async unlockAchievement(achievementId: string): Promise<boolean> {
        if (!this.isInitialized) await this.initialize()
        if (this.unlockedAchievements.has(achievementId)) return true

        const achievement = ACHIEVEMENTS[achievementId]
        if (!achievement) return false

        try {
            if (this.electronBridge?.isAchievementUnlocked) {
                const alreadyUnlocked = await this.electronBridge.isAchievementUnlocked(achievementId)
                if (alreadyUnlocked) {
                    this.unlockedAchievements.add(achievementId)
                    this.persistCachedAchievements()
                    return true
                }
            }

            if (this.electronBridge) {
                await this.electronBridge.setAchievement(achievementId)
                if (this.electronBridge.isAchievementUnlocked) {
                    const confirmed = await this.electronBridge.isAchievementUnlocked(achievementId)
                    if (!confirmed) return false
                }
            }
            this.unlockedAchievements.add(achievementId)
            this.persistCachedAchievements()
            console.log(`[Steam] Achievement Unlocked: ${achievement.name}`)

            if (this.onUnlockCallback) {
                this.onUnlockCallback({ ...achievement, unlocked: true, unlockedAt: new Date() })
            }
            return true
        } catch (error) {
            debug.error(`[Steam] Failed to unlock achievement ${achievementId}:`, error)
            return false
        }
    }

    isUnlocked(achievementId: string): boolean {
        return this.unlockedAchievements.has(achievementId)
    }

    getAllAchievements(): Achievement[] {
        return Object.values(ACHIEVEMENTS).map(a => ({
            ...a,
            unlocked: this.isUnlocked(a.id),
            unlockedAt: undefined // In a real app we'd track this date
        }))
    }

    getProgress(): { unlocked: number; total: number; percentage: number } {
        const total = Object.keys(ACHIEVEMENTS).length
        const unlocked = this.unlockedAchievements.size
        return {
            unlocked,
            total,
            percentage: total === 0 ? 0 : Math.round((unlocked / total) * 100)
        }
    }

    resetAll(): void {
        if (process.env.NODE_ENV === "production") {
            debug.warn("[Steam] resetAll is disabled in production")
            return
        }
        this.unlockedAchievements.clear()
        this.persistCachedAchievements()
    }

    private getCacheKey(): string {
        return this.activeSaveId ? `${this.cacheKey}_${this.activeSaveId}` : this.cacheKey
    }

    private async refreshUnlockedFromSteam(): Promise<void> {
        if (!this.electronBridge?.isAchievementUnlocked) {
            this.loadCachedAchievements()
            return
        }

        const unlocked = new Set<string>()
        for (const id of Object.keys(ACHIEVEMENTS)) {
            try {
                const isUnlocked = await this.electronBridge.isAchievementUnlocked(id)
                if (isUnlocked) unlocked.add(id)
            } catch {
                // Continue; partial Steam outages should not crash initialization.
            }
        }
        this.unlockedAchievements = unlocked
        this.persistCachedAchievements()
    }

    private loadCachedAchievements(): void {
        if (typeof window === "undefined") return
        try {
            const raw = window.localStorage.getItem(this.getCacheKey())
            if (!raw) return
            const parsed = JSON.parse(raw)
            if (!Array.isArray(parsed)) return
            this.unlockedAchievements = new Set(parsed.filter((v) => typeof v === "string"))
        } catch {
            // Ignore cache parse errors and continue with empty set.
        }
    }

    private persistCachedAchievements(): void {
        if (typeof window === "undefined") return
        try {
            window.localStorage.setItem(this.getCacheKey(), JSON.stringify(Array.from(this.unlockedAchievements)))
        } catch {
            // Ignore storage write failures.
        }
    }

    // Rich Presence for Steam
    async updateRichPresence(status: string, display: string): Promise<void> {
        if (!this.electronBridge) return
        try {
            if (this.electronBridge.setRichPresence) {
                await this.electronBridge.setRichPresence("status", status)
                await this.electronBridge.setRichPresence("steam_display", display)
            }
        } catch (e) {
            debug.warn("[Steam] Rich presence not available")
        }
    }

    // Cloud Save support
    async uploadSaveToCloud(saveId: string, data: string): Promise<boolean> {
        if (!this.electronBridge) return false
        try {
            if (this.electronBridge.writeToCloud) {
                await this.electronBridge.writeToCloud(`save_${saveId}.json`, data)
                return true
            }
        } catch (e) {
            debug.warn("[Steam] Cloud save not available")
        }
        return false
    }

    async downloadSaveFromCloud(saveId: string): Promise<string | null> {
        if (!this.electronBridge) return null
        try {
            if (this.electronBridge.readFromCloud) {
                return await this.electronBridge.readFromCloud(`save_${saveId}.json`)
            }
        } catch (e) {
            debug.warn("[Steam] Cloud load not available")
        }
        return null
    }

    async deleteCloudFile(filename: string): Promise<boolean> {
        if (!this.electronBridge) return false
        try {
            if (this.electronBridge.deleteFromCloud) {
                await this.electronBridge.deleteFromCloud(filename)
                return true
            }
        } catch (e) {
            debug.warn("[Steam] Cloud delete not available")
        }
        return false
    }
}

export const steamService = SteamService.getInstance()

export function checkAchievements(gameState: {
    totalWins?: number
    worldRanking?: number
    leagueTier?: string
    startingLeagueTier?: string // Track initial tier for ZERO_TO_HERO
    budget?: number
    tournamentsWon?: { tier: string; id: string; flawless?: boolean }[]
    hallOfFamePlayers?: number
    totalKills?: number
    totalHS?: number
    matchesPlayed?: number
    firstTournamentParticipation?: boolean
    developedStar?: boolean
    majorWinsInSeason?: number
    totalMajorWins?: number
    comebackWin?: boolean // Won a match after being down 12-3 or worse
    underdogWin?: boolean // Beat a team ranked 20+ higher
    loyalTeamYears?: number // Years with same 5 players
    profitableSale?: boolean // Sold player for more than paid
    lostGrandFinal1614?: boolean // Lost Grand Final 16-14
    redemptionArc?: boolean // Won Major after losing one previous year
    wonTournament?: boolean // Won any tournament (placement === 1)
    seasonComplete?: boolean // Completed a full 52-week season
    completedTransfer?: boolean // Completed a player transfer
}): void {
    const service = SteamService.getInstance()

    // Win Progression Achievements
    if (gameState.totalWins && gameState.totalWins >= 1) service.unlockAchievement("FIRST_WIN")
    if (gameState.totalWins && gameState.totalWins >= 10) service.unlockAchievement("WIN_10")
    if (gameState.totalWins && gameState.totalWins >= 25) service.unlockAchievement("WIN_25")
    if (gameState.totalWins && gameState.totalWins >= 50) service.unlockAchievement("WIN_50")
    if (gameState.totalWins && gameState.totalWins >= 100) service.unlockAchievement("WIN_100")
    if (gameState.totalWins && gameState.totalWins >= 250) service.unlockAchievement("WIN_250")
    if (gameState.totalWins && gameState.totalWins >= 500) service.unlockAchievement("WIN_500")

    // Ranking Achievements
    if (gameState.worldRanking && gameState.worldRanking <= 10) service.unlockAchievement("TOP_10_RANKING")
    if (gameState.worldRanking === 1) service.unlockAchievement("NUMBER_ONE")
    if (gameState.leagueTier === "S_TIER") service.unlockAchievement("REACH_S_TIER")

    // Budget Achievements
    if (gameState.budget && gameState.budget >= 1000000) service.unlockAchievement("FIRST_MILLION")
    if (gameState.budget && gameState.budget >= 10000000) service.unlockAchievement("BUDGET_10M")

    // Tournament Achievements
    if (gameState.firstTournamentParticipation) service.unlockAchievement("FIRST_TOURNAMENT")
    if (gameState.majorWinsInSeason && gameState.majorWinsInSeason >= 3) service.unlockAchievement("GRAND_SLAM")

    if (gameState.tournamentsWon) {
        if (gameState.tournamentsWon.some(t => t.tier === "B_TIER")) service.unlockAchievement("WIN_B_TIER")
        if (gameState.tournamentsWon.some(t => t.tier === "A_TIER")) service.unlockAchievement("WIN_A_TIER")
        if (gameState.tournamentsWon.some(t => t.tier === "S_TIER")) service.unlockAchievement("WIN_MAJOR")
        if (gameState.tournamentsWon.some(t => t.flawless)) service.unlockAchievement("PERFECT_TOURNAMENT")
    }

    // Major Championship Achievements
    if (gameState.totalMajorWins && gameState.totalMajorWins >= 3) service.unlockAchievement("DYNASTY")

    // Competitive Achievements
    if (gameState.comebackWin) service.unlockAchievement("COMEBACK_KING")
    if (gameState.underdogWin) service.unlockAchievement("UNDERDOG")

    // Management Achievements
    if (gameState.developedStar) service.unlockAchievement("DEVELOP_STAR")
    if (gameState.hallOfFamePlayers && gameState.hallOfFamePlayers > 0) service.unlockAchievement("HALL_OF_FAME_INDUCTION")
    if (gameState.loyalTeamYears && gameState.loyalTeamYears >= 3) service.unlockAchievement("LOYAL_TEAM")
    if (gameState.profitableSale) service.unlockAchievement("PROFIT_MASTER")

    // Zero to Hero: Started at C-Tier, now at S-Tier
    if (gameState.startingLeagueTier === "C_TIER" && gameState.leagueTier === "S_TIER") {
        service.unlockAchievement("ZERO_TO_HERO")
    }

    // Milestone Achievements
    if (gameState.wonTournament) service.unlockAchievement("TOURNAMENT_WIN")
    if (gameState.seasonComplete) service.unlockAchievement("SEASON_COMPLETE")
    if (gameState.completedTransfer) service.unlockAchievement("FIRST_TRANSFER")

    // Hidden Achievements
    if (gameState.lostGrandFinal1614) service.unlockAchievement("UNLUCKY")
    if (gameState.redemptionArc) service.unlockAchievement("REDEMPTION")

    // Stats Updates
    service.updatePlayerStats({
        kills: gameState.totalKills,
        headshots: gameState.totalHS,
        wins: gameState.totalWins,
        matches: gameState.matchesPlayed,
        budget: gameState.budget
    })
}
