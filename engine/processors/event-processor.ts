import { GameSave, WeekTickState, PlayerSaveData, HallOfFameEntry } from "../save-types"
import { SeededRNG } from "../rng"
import { EventType, Team, InjuryType } from "@/types"
import { SaveManager } from "../save-manager"

const INJURY_BASE_CHANCE = 0.002
const FATIGUE_INJURY_MULTIPLIER = 0.002

export class EventProcessor {
    static async generateEvents(
        save: GameSave,
        transaction: WeekTickState,
        rng: SeededRNG,
        playerTeamId: string,
        saveManager: SaveManager
    ): Promise<number> {
        let eventsGenerated = 0

        const playerTeam = save.teams.find(t => t.id === playerTeamId)

        // 1. Contract expiration warnings (All players on user team)
        if (playerTeam) {
            for (const pid of playerTeam.rosterIds) {
                const contract = save.contracts.find(c => c.playerId === pid)
                if (contract) {
                    const weeksLeft = contract.endWeek - save.currentWeek
                    if (weeksLeft > 0 && weeksLeft <= 4) {
                        const eventId = `contract_${contract.playerId}_${save.currentWeek}`
                        if (!transaction.generatedEventIds.includes(eventId)) {
                            // const player = save.players.find(p => p.id === pid)
                            // We don't actually use player explicitly here other than for ID, 
                            // but the original code fetched it. Kept for safety if needed later.

                            save.eventsLog.push({
                                id: eventId,
                                type: EventType.CONTRACT,
                                week: save.currentWeek,
                                data: {
                                    playerId: contract.playerId,
                                    weeksLeft,
                                    action: "EXPIRING",
                                },
                                acknowledged: false,
                                choices: [
                                    { id: "renew", text: "Discuss Renewal", effects: { morale: 5 } },
                                    { id: "release", text: "Plan Release", effects: { morale: -5, loyalty: -10 } }
                                ]
                            })
                            await saveManager.recordEventGenerated(transaction, eventId)
                            eventsGenerated++
                        }
                    }
                }
            }
        }

        // 2. Low morale warnings (User team only)
        if (playerTeam) {
            for (const pid of playerTeam.rosterIds) {
                const player = save.players.find(p => p.id === pid)
                if (player && player.morale < 30 && rng.bool(0.3)) {
                    const eventId = `morale_${player.id}_${save.currentWeek}`
                    if (!transaction.generatedEventIds.includes(eventId)) {
                        save.eventsLog.push({
                            id: eventId,
                            type: EventType.MORALE,
                            week: save.currentWeek,
                            data: {
                                playerId: player.id,
                                morale: player.morale,
                                reason: "Player unhappy",
                            },
                            acknowledged: false,
                            choices: [
                                { id: "talk", text: "Team Meeting (Morale +10)", effects: { morale: 10 } },
                                { id: "bonus", text: "Performance Bonus (Money -5k, Loyalty +5)", effects: { money: -5000, loyalty: 5 } },
                                { id: "ignore", text: "Ignore", effects: { loyalty: -5, morale: -5 } }
                            ]
                        })
                        await saveManager.recordEventGenerated(transaction, eventId)
                        eventsGenerated++
                    }
                }
            }
        }

        // 3. High Fatigue Checks (User team)
        if (playerTeam) {
            for (const pid of playerTeam.rosterIds) {
                const player = save.players.find(p => p.id === pid)
                if (player && player.fatigue > 80 && rng.bool(0.5)) {
                    const eventId = `fatigue_${player.id}_${save.currentWeek}`
                    if (!transaction.generatedEventIds.includes(eventId)) {
                        save.eventsLog.push({
                            id: eventId,
                            type: EventType.INJURY, // Using generic type
                            week: save.currentWeek,
                            data: { playerId: player.id, fatigue: player.fatigue },
                            acknowledged: false,
                            choices: [
                                { id: "rest", text: "Light Training (Morale +5)", effects: { morale: 5 } },
                                { id: "push", text: "Push Harder (Loyalty -5)", effects: { loyalty: -5, morale: -5 } }
                            ]
                        })
                        await saveManager.recordEventGenerated(transaction, eventId)
                        eventsGenerated++
                    }
                }
            }
        }

        // 4. Streak Detection (User team)
        // Check last 5 matches for user team
        if (playerTeam) {
            const userMatches = save.completedMatches
                .filter(m => m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
                .sort((a, b) => b.week - a.week)
                .slice(0, 5)

            let winStreak = 0
            let lossStreak = 0

            for (const m of userMatches) {
                const isHome = m.homeTeamId === playerTeamId
                const won = isHome ? m.result.homeScore > m.result.awayScore : m.result.awayScore > m.result.homeScore
                if (won) {
                    if (lossStreak > 0) break
                    winStreak++
                } else {
                    if (winStreak > 0) break
                    lossStreak++
                }
            }

            if (winStreak === 3) { // Trigger on exactly 3 to avoid spam
                const eventId = `streak_win_${save.currentWeek}`
                if (!transaction.generatedEventIds.includes(eventId)) {
                    save.eventsLog.push({
                        id: eventId,
                        type: "win_streak",
                        week: save.currentWeek,
                        data: { streak: winStreak, teamId: playerTeamId },
                        acknowledged: false,
                        choices: [
                            { id: "celebrate", text: "Team Dinner (Money -1k, Rep +2)", effects: { money: -1000, reputation: 2 } },
                            { id: "focus", text: "Stay Focused (Tactics Bonus)", effects: { reputation: 1 } }
                        ]
                    })
                    await saveManager.recordEventGenerated(transaction, eventId)
                    eventsGenerated++
                }
            }

            if (lossStreak === 3) {
                const eventId = `streak_loss_${save.currentWeek}`
                if (!transaction.generatedEventIds.includes(eventId)) {
                    save.eventsLog.push({
                        id: eventId,
                        type: "loss_streak",
                        week: save.currentWeek,
                        data: { streak: lossStreak, teamId: playerTeamId },
                        acknowledged: false,
                        choices: [
                            { id: "crisis", text: "Crisis Meeting (Morale +5, Money -500)", effects: { money: -500, morale: 5 } },
                            { id: "shakeup", text: "Roster Shakeup Warning (Morale -2, Hunger +10)", effects: { morale: -2 } }
                        ]
                    })
                    await saveManager.recordEventGenerated(transaction, eventId)
                    eventsGenerated++
                }
            }
        }

        // 5. Fan Interactions (Phase 21)
        if (playerTeam && rng.bool(0.15)) {
            const eventId = `fan_meet_${save.currentWeek}`
            if (!transaction.generatedEventIds.includes(eventId)) {
                save.eventsLog.push({
                    id: eventId,
                    type: EventType.FAN,
                    week: save.currentWeek,
                    data: { hype: playerTeam.merchHype || 10 },
                    acknowledged: false,
                    choices: [
                        { id: "fan_meet", text: "Host Fan Meetup (Money -2k, Rep +5, Hype +10)", effects: { money: -2000, reputation: 5 } },
                        { id: "social_post", text: "Social Media Campaign (Hype +5)", effects: { reputation: 1 } },
                        { id: "ignore_fans", text: "Focus purely on practice", effects: { morale: 2 } }
                    ]
                })
                await saveManager.recordEventGenerated(transaction, eventId)
                eventsGenerated++
            }
        }

        // 6. Sponsor Meetings (Phase 21)
        if (playerTeam && rng.bool(0.10)) {
            const eventId = `sponsor_review_${save.currentWeek}`
            if (!transaction.generatedEventIds.includes(eventId)) {
                save.eventsLog.push({
                    id: eventId,
                    type: EventType.SPONSOR,
                    week: save.currentWeek,
                    data: { currentSponsors: playerTeam.sponsors?.length || 0 },
                    acknowledged: false,
                    choices: [
                        { id: "negotiate", text: "Negotiate Performance Bonus (Rep -5, Bonus Chance)", effects: { reputation: -5 } },
                        { id: "status_quo", text: "Standard Progress Report", effects: { reputation: 2 } }
                    ]
                })
                await saveManager.recordEventGenerated(transaction, eventId)
                eventsGenerated++
            }
        }

        return eventsGenerated
    }

    static processInjuryChecks(save: GameSave, rng: SeededRNG): number {
        let injuries = 0

        save.players.forEach(player => {
            if (player.injury) {
                player.injury.weeksRemaining = Math.max(0, player.injury.weeksRemaining - 1)
                if (player.injury.weeksRemaining <= 0) {
                    save.eventsLog.push({
                        id: `recovery_${player.id}_${save.currentWeek}`,
                        type: EventType.INJURY,
                        week: save.currentWeek,
                        acknowledged: false,
                        data: {
                            playerId: player.id,
                            title: "Player Recovered",
                            message: `${player.nickname} has fully recovered from their ${player.injury.name} and is ready to compete.`,
                            severity: "success",
                        },
                    })
                    player.injury = undefined
                }
                return
            }

            let chance = INJURY_BASE_CHANCE
            if (player.fatigue > 50) {
                chance += (player.fatigue - 50) * FATIGUE_INJURY_MULTIPLIER
            }
            chance *= (1 - player.health / 200)
            if (player.age > 30) {
                chance *= 1 + (player.age - 30) * 0.05
            }
            chance *= 0.2

            if (rng.bool(chance)) {
                injuries++
                const severityRoll = rng.next()
                let weeksOut: number
                let healthLoss: number
                let injuryType: InjuryType
                let injuryName: string
                let injuryDesc: string
                let severity: "MINOR" | "MODERATE" | "SEVERE"

                if (severityRoll < 0.6) {
                    severity = "MINOR"
                    weeksOut = rng.int(1, 2)
                    healthLoss = 5
                    const types: { type: InjuryType, name: string, desc: string }[] = [
                        { type: "RSI", name: "Wrist Strain", desc: "Minor discomfort in the wrist from overuse." },
                        { type: "FATIGUE", name: "Digital Eye Strain", desc: "Headaches and blurred vision needs rest." },
                        { type: "ILLNESS", name: "Common Cold", desc: "Feeling under the weather." }
                    ]
                    const t = rng.pick(types)
                    injuryType = t.type
                    injuryName = t.name
                    injuryDesc = t.desc
                } else if (severityRoll < 0.9) {
                    severity = "MODERATE"
                    weeksOut = rng.int(2, 4)
                    healthLoss = 15
                    const types: { type: InjuryType, name: string, desc: string }[] = [
                        { type: "RSI", name: "Carpal Tunnel Flare-up", desc: "Numbness and tingling requiring break." },
                        { type: "BURNOUT", name: "Mild Burnout", desc: "Loss of motivation and high stress levels." },
                        { type: "OTHER", name: "Back Spasm", desc: "Sudden back pain from poor posture." }
                    ]
                    const t = rng.pick(types)
                    injuryType = t.type
                    injuryName = t.name
                    injuryDesc = t.desc
                } else {
                    severity = "SEVERE"
                    weeksOut = rng.int(4, 8)
                    healthLoss = 30
                    const types: { type: InjuryType, name: string, desc: string }[] = [
                        { type: "RSI", name: "Severe Tendonitis", desc: "Inflammation of the tendons requiring extended rest." },
                        { type: "BURNOUT", name: "Mental Exhaustion", desc: "Critical level of stress requiring medical leave." },
                        { type: "OTHER", name: "Fractured Wrist", desc: "Accidental injury resulting in a fracture." },
                        { type: "ILLNESS", name: "Severe Viral Infection", desc: "High fever and fatigue affecting performance." }
                    ]
                    const t = rng.pick(types)
                    injuryType = t.type
                    injuryName = t.name
                    injuryDesc = t.desc
                }

                player.health = Math.max(0, player.health - healthLoss)
                player.fatigue = Math.min(100, player.fatigue + 30)
                player.injury = {
                    type: injuryType,
                    name: injuryName,
                    description: injuryDesc,
                    severity: severity,
                    weeksRemaining: weeksOut,
                    isRecovering: true
                }

                save.eventsLog.unshift({
                    id: `injury_${player.id}_${save.currentWeek}`,
                    type: EventType.INJURY,
                    week: save.currentWeek,
                    acknowledged: false,
                    data: {
                        playerId: player.id,
                        weeksOut,
                        healthLoss,
                        severity: severity,
                        title: `Injury Report: ${player.nickname}`,
                        message: `${player.nickname} has suffered a ${injuryName} (${severity}) and will be out for ${weeksOut} weeks.`,
                    },
                })

                if (save.newsFeed) {
                    const playerTeam = save.teams.find(t => t.rosterIds.includes(player.id))
                    save.newsFeed.unshift({
                        id: `news_inj_${save.currentWeek}_${player.id}`,
                        title: `${player.nickname} sidelined with ${injuryName}`,
                        content: `Medical staff have confirmed that ${player.nickname} will be out of action for approximately ${weeksOut} weeks due to a ${severity.toLowerCase()} ${injuryName.toLowerCase()}.`,
                        category: "INJURY",
                        playerId: player.id,
                        teamId: playerTeam?.id,
                        week: save.currentWeek,
                        engagement: { likes: rng.int(10, 409), views: rng.int(100, 4099) }
                    })
                    if (save.newsFeed.length > 50) save.newsFeed.pop()
                }
            }
        })

        return injuries
    }

    static processRetirements(save: GameSave, rng: SeededRNG): { retired: string[]; legends: string[] } {
        if (save.currentWeek % 52 !== 0) return { retired: [], legends: [] }

        const retired: string[] = []
        const legends: string[] = []

        const retirePlayer = (player: PlayerSaveData) => {
            player.isRetired = true
            player.retirementWeek = save.currentWeek
            retired.push(player.id)

            // Auto-terminate contract and remove from roster
            const contract = save.contracts.find(c => c.playerId === player.id)
            const lastTeamId = contract?.teamId
            if (contract) {
                const team = save.teams.find(t => t.id === contract.teamId)
                if (team) {
                    team.rosterIds = team.rosterIds.filter(id => id !== player.id)
                    if (team.activeRoleTraining) {
                        team.activeRoleTraining = team.activeRoleTraining.filter(t => t.playerId !== player.id)
                        team.trainingSlotsUsed = Math.max(0, (team.trainingSlotsUsed || 0) - 1)
                    }
                }
                save.contracts = save.contracts.filter(c => c.playerId !== player.id)
            }

            // Calculate achievements and legendary status
            const achievements: string[] = []
            if (player.majorWins && player.majorWins >= 1) achievements.push(`${player.majorWins}x Major Champion`)
            if (player.totalMVPs && player.totalMVPs >= 3) achievements.push(`${player.totalMVPs}x Tournament MVP`)
            if (player.totalKills && player.totalKills >= 1000) achievements.push(`${player.totalKills}+ Career Kills`)
            if (player.avgRating >= 1.15) achievements.push(`${player.avgRating.toFixed(2)} Career Rating`)
            if (player.matchesPlayed >= 200) achievements.push(`${player.matchesPlayed}+ Matches Veteran`)

            const isLegendary = achievements.length >= 2 || (player.majorWins && player.majorWins >= 1) || (player.avgRating >= 1.20)

            if (isLegendary) {
                player.isLegendary = true
                player.legendaryAchievements = achievements
                legends.push(player.id)

                // Write-through to hallOfFame so legends appear in HoF display
                if (!save.hallOfFame) save.hallOfFame = []
                if (!save.hallOfFame.some(h => h.id === `hof_${player.id}`)) {
                    const reasons: HallOfFameEntry['inductionReasons'] = []
                    if (player.majorWins && player.majorWins >= 1) reasons.push({ type: 'CHAMPION', label: `${player.majorWins}x Major Champion`, icon: 'Trophy' })
                    if (player.avgRating >= 1.15) reasons.push({ type: 'MVP', label: `${player.avgRating.toFixed(2)} Career Rating`, icon: 'Star' })
                    if (player.matchesPlayed >= 200) reasons.push({ type: 'LONGEVITY', label: `${player.matchesPlayed}+ Matches`, icon: 'Clock' })
                    if (player.totalKills && player.totalKills >= 1000) reasons.push({ type: 'IMPACT', label: `${player.totalKills}+ Career Kills`, icon: 'Crosshair' })
                    save.hallOfFame.push({
                        id: `hof_${player.id}`,
                        name: player.nickname,
                        portraitPath: player.portraitPath || '',
                        eraStart: Math.max(1, Math.ceil(save.currentWeek / 52) - Math.floor(player.age / 3)),
                        eraEnd: Math.ceil(save.currentWeek / 52),
                        primaryRole: player.role || 'RIFLER',
                        category: 'INDUCTED',
                        inductionReasons: reasons.length > 0 ? reasons : [{ type: 'IMPACT', label: 'Career Achievement', icon: 'Award' }],
                        nationality: player.nationality || '',
                    })
                }
            }

            // Event log entry
            save.eventsLog.push({
                id: `retirement_${player.id}_${save.currentWeek}`,
                type: EventType.RETIREMENT,
                week: save.currentWeek,
                data: {
                    playerId: player.id,
                    playerName: player.nickname,
                    isLegendary: player.isLegendary,
                    achievements: player.legendaryAchievements,
                    message: player.isLegendary
                        ? `${player.nickname} has retired and been inducted into the Hall of Fame!`
                        : `${player.nickname} has announced their retirement from professional play.`
                },
                acknowledged: false,
            })

            // News feed announcement
            if (save.newsFeed) {
                save.newsFeed.unshift({
                    id: `news_retirement_${player.id}_${save.currentWeek}`,
                    title: player.isLegendary
                        ? `${player.nickname} retires — inducted into Hall of Fame`
                        : `${player.nickname} announces retirement`,
                    content: player.isLegendary
                        ? `After a storied career, ${player.nickname} has retired and been inducted into the Hall of Fame. Achievements: ${(player.legendaryAchievements || []).join(", ")}.`
                        : `${player.nickname} has announced their retirement from professional esports at age ${player.age}.`,
                    category: "RETIREMENT",
                    playerId: player.id,
                    teamId: lastTeamId,
                    week: save.currentWeek,
                    engagement: { likes: rng.int(500, 10000), views: rng.int(5000, 50000) }
                })
                if (save.newsFeed.length > 50) save.newsFeed.pop()
            }
        }

        // Check legendary eligibility without retiring — legends never retire
        const checkLegendaryEligibility = (player: PlayerSaveData): boolean => {
            const achievements: string[] = []
            if (player.majorWins && player.majorWins >= 1) achievements.push(`${player.majorWins}x Major Champion`)
            if (player.totalMVPs && player.totalMVPs >= 3) achievements.push(`${player.totalMVPs}x Tournament MVP`)
            if (player.totalKills && player.totalKills >= 1000) achievements.push(`${player.totalKills}+ Career Kills`)
            if (player.avgRating >= 1.15) achievements.push(`${player.avgRating.toFixed(2)} Career Rating`)
            if (player.matchesPlayed >= 200) achievements.push(`${player.matchesPlayed}+ Matches Veteran`)
            return achievements.length >= 2 || (player.majorWins != null && player.majorWins >= 1) || (player.avgRating >= 1.20)
        }

        save.players.forEach(player => {
            if (player.isRetired) return

            // Legends never retire — they play forever
            if (player.isLegendary) return

            // At age 38+, check if player qualifies as legendary
            if (player.age >= 38) {
                if (checkLegendaryEligibility(player)) {
                    // Grant legendary status — they keep playing
                    player.isLegendary = true
                    const achievements: string[] = []
                    if (player.majorWins && player.majorWins >= 1) achievements.push(`${player.majorWins}x Major Champion`)
                    if (player.totalMVPs && player.totalMVPs >= 3) achievements.push(`${player.totalMVPs}x Tournament MVP`)
                    if (player.totalKills && player.totalKills >= 1000) achievements.push(`${player.totalKills}+ Career Kills`)
                    if (player.avgRating >= 1.15) achievements.push(`${player.avgRating.toFixed(2)} Career Rating`)
                    if (player.matchesPlayed >= 200) achievements.push(`${player.matchesPlayed}+ Matches Veteran`)
                    player.legendaryAchievements = achievements
                    legends.push(player.id)

                    // Announce legendary status
                    save.eventsLog.push({
                        id: `legend_${player.id}_${save.currentWeek}`,
                        type: EventType.RETIREMENT,
                        week: save.currentWeek,
                        data: {
                            playerId: player.id,
                            playerName: player.nickname,
                            isLegendary: true,
                            achievements: player.legendaryAchievements,
                            message: `${player.nickname} has achieved Legendary status and will continue playing!`
                        },
                        acknowledged: false,
                    })

                    if (save.newsFeed) {
                        const legendTeamId = save.contracts.find(c => c.playerId === player.id)?.teamId
                        save.newsFeed.unshift({
                            id: `news_legend_${player.id}_${save.currentWeek}`,
                            title: `${player.nickname} earns Legendary status`,
                            content: `At age ${player.age}, ${player.nickname} has been recognized as a Legend of the game. Achievements: ${achievements.join(", ")}. They will continue to compete indefinitely.`,
                            category: "RETIREMENT",
                            playerId: player.id,
                            teamId: legendTeamId,
                            week: save.currentWeek,
                            engagement: { likes: rng.int(5000, 50000), views: rng.int(50000, 500000) }
                        })
                        if (save.newsFeed.length > 50) save.newsFeed.pop()
                    }
                    return
                }

                // Non-legendary: forced retirement at 38
                retirePlayer(player)
                return
            }

            // Probabilistic retirement from age 32+
            if (player.age >= 32) {
                const ageOverThreshold = player.age - 31
                let retirementChance = 0.05 * ageOverThreshold
                if (player.skill < 60) retirementChance += 0.1
                if (player.form < 40) retirementChance += 0.1
                if (player.health < 50) retirementChance += 0.15

                if (rng.bool(retirementChance)) {
                    retirePlayer(player)
                }
            }
        })

        return { retired, legends }
    }

    /**
     * Mid-season surprise retirements for old, declining AI players.
     * Runs every 4 weeks. Only affects non-player-team players aged 34+
     * with low skill and form. 2% chance per eligible player per check.
     */
    static processMidSeasonRetirements(
        save: GameSave,
        playerTeamId: string,
        rng: SeededRNG
    ): { retired: string[]; legends: string[] } {
        if (save.currentWeek % 4 !== 0) return { retired: [], legends: [] }

        const playerTeam = save.teams.find(t => t.id === playerTeamId)
        const candidates = save.players.filter(p =>
            !p.isRetired && !p.isLegendary &&
            p.age >= 34 && (p.skill ?? 50) < 50 && (p.form ?? 50) < 40 &&
            !playerTeam?.rosterIds.includes(p.id)
        )

        const retired: string[] = []
        const legends: string[] = []

        for (const player of candidates) {
            if (rng.next() >= 0.02) continue // 2% chance

            // Retire the player
            player.isRetired = true
            player.retirementWeek = save.currentWeek
            retired.push(player.id)

            // Remove from roster/contracts
            const contract = save.contracts.find(c => c.playerId === player.id)
            const lastTeamId = contract?.teamId
            if (contract) {
                const team = save.teams.find(t => t.id === contract.teamId)
                if (team) {
                    team.rosterIds = team.rosterIds.filter(id => id !== player.id)
                }
                save.contracts = save.contracts.filter(c => c.playerId !== player.id)
            }

            // Event log
            save.eventsLog.push({
                id: `midseason_retirement_${player.id}_${save.currentWeek}`,
                type: EventType.RETIREMENT,
                week: save.currentWeek,
                data: {
                    playerId: player.id,
                    playerName: player.nickname,
                    isLegendary: false,
                    message: `${player.nickname} has announced a surprise mid-season retirement at age ${player.age}.`
                },
                acknowledged: false,
            })

            if (save.newsFeed) {
                save.newsFeed.unshift({
                    id: `news_midretire_${player.id}_${save.currentWeek}`,
                    title: `${player.nickname} retires mid-season`,
                    content: `In a surprise move, ${player.nickname} has decided to hang up the mouse mid-season at age ${player.age}, citing declining form and motivation.`,
                    category: "RETIREMENT",
                    playerId: player.id,
                    teamId: lastTeamId,
                    week: save.currentWeek,
                    engagement: { likes: rng.int(200, 5000), views: rng.int(2000, 20000) }
                })
                if (save.newsFeed.length > 50) save.newsFeed.pop()
            }
        }

        return { retired, legends }
    }
}
