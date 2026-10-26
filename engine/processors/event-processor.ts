import { GameSave, WeekTickState, PlayerSaveData } from "../save-types"
import { SeededRNG } from "../rng"
import { EventType, Team, InjuryType } from "@/types"
import { SaveManager } from "../save-manager"
import { hallOfFameAchievements, hallOfFameEntry, qualifiesForHallOfFame } from "../hall-of-fame-manager"
import { retirementChance } from "../retirement-chance"
import { WORKLOAD_TUNING, injuryRiskPerWeek, needsWorkloadWarning, riskPct } from "../workload"

export class EventProcessor {
    /**
     * C5: workload warnings for the managed squad. Runs after the week's rest
     * days, so the warning names the load a player carries into the next week.
     */
    static async generateWorkloadWarnings(
        save: GameSave,
        transaction: WeekTickState,
        playerTeamId: string,
        saveManager: SaveManager
    ): Promise<number> {
        const team = save.teams.find(t => t.id === playerTeamId)
        if (!team) return 0
        const generated = new Set(transaction.generatedEventIds)
        let eventsGenerated = 0
        for (const pid of team.rosterIds) {
            const player = save.players.find(p => p.id === pid)
            // The medical team flags a player whose weekly injury chance has
            // reached WORKLOAD_TUNING.WARN_RISK. The decision family's cooldown
            // keeps it to one open warning.
            if (!player || !needsWorkloadWarning(player)) continue
            const eventId = `workload_${player.id}_${save.currentWeek}`
            if (generated.has(eventId)) continue
            const risk = riskPct(injuryRiskPerWeek(player))
            const rested = Math.max(0, Math.round(player.fatigue) - WORKLOAD_TUNING.REST_FATIGUE)
            save.eventsLog.push({
                id: eventId,
                type: EventType.INJURY,
                week: save.currentWeek,
                data: {
                    playerId: player.id,
                    load: Math.round(player.fatigue),
                    risk,
                    title: `${player.nickname}'s workload is high`,
                    message: `${player.nickname} is carrying a heavy load (fatigue ${Math.round(player.fatigue)}). His injury chance this week is ${risk}, and it keeps rising while the load stays this high. Rest him this week (fatigue to ${rested}, out of the starting five if a fit substitute is free), or play him at that risk.`,
                },
                acknowledged: false,
                choices: [
                    { id: "rest", text: "Rest him this week", effects: { rest: { fatigue: WORKLOAD_TUNING.REST_FATIGUE, morale: WORKLOAD_TUNING.REST_MORALE } } },
                    { id: "play", text: "Play him", effects: { follows: `Injury chance ${risk} this week` } },
                ],
            })
            await saveManager.recordEventGenerated(transaction, eventId)
            eventsGenerated++
        }
        return eventsGenerated
    }

    static async generateEvents(
        save: GameSave,
        transaction: WeekTickState,
        rng: SeededRNG,
        playerTeamId: string,
        saveManager: SaveManager
    ): Promise<number> {
        let eventsGenerated = 0

        const playerTeam = save.teams.find(t => t.id === playerTeamId)

        // Build lookup maps for O(1) access inside loops
        const playerMap = new Map<string, PlayerSaveData>()
        save.players.forEach(p => playerMap.set(p.id, p))
        const generatedEventIdSet = new Set(transaction.generatedEventIds)

        // 1. Single pass over rosterIds for morale (workload warnings: generateWorkloadWarnings, after rest days). Expiring
        // contracts are one message per contract from processContractExpiry
        // (the old weekly "Discuss renewal" choice renewed nothing; Phase 4.9).
        if (playerTeam) {
            for (const pid of playerTeam.rosterIds) {
                const player = playerMap.get(pid)
                if (!player) continue

                // 1. Low morale warnings
                if (player.morale < 30 && rng.bool(0.3)) {
                    const eventId = `morale_${player.id}_${save.currentWeek}`
                    if (!generatedEventIdSet.has(eventId)) {
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
                                { id: "talk", text: "One-on-One Talk (Morale +10)", effects: { morale: 10 } },
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
                            { id: "focus", text: "Stay Focused (Rep +1)", effects: { reputation: 1 } }
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
                            { id: "shakeup", text: "Roster Shakeup Warning (Morale -2)", effects: { morale: -2 } }
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
                        { id: "fan_meet", text: "Host Fan Meetup (Money -2k, Rep +5)", effects: { money: -2000, reputation: 5 } },
                        { id: "social_post", text: "Social Media Campaign (Rep +1)", effects: { reputation: 1 } },
                        { id: "ignore_fans", text: "Focus purely on practice (Morale +2)", effects: { morale: 2 } }
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
                        { id: "negotiate", text: "Negotiate Performance Bonus (Rep -5)", effects: { reputation: -5 } },
                        { id: "status_quo", text: "Standard Progress Report (Rep +2)", effects: { reputation: 2 } }
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

        // Build player-to-team map for O(1) lookups in news feed
        const playerTeamMap = new Map<string, typeof save.teams[0]>()
        save.teams.forEach(t => t.rosterIds.forEach(pid => playerTeamMap.set(pid, t)))

        save.players.forEach(player => {
            if (player.injury) {
                player.injury.weeksRemaining = Math.max(0, player.injury.weeksRemaining - 1)
                if (player.injury.weeksRemaining <= 0) {
                    if (playerTeamMap.get(player.id)?.id === save.playerTeamId) save.eventsLog.push({
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

            // C5: a knock the manager chose to play through either clears or
            // worsens into a moderate injury, with the chance stated when he chose.
            let worsened: { name: string; type: InjuryType } | null = null
            if (player.knock) {
                const knock = player.knock
                player.knock = undefined
                if (knock.week < save.currentWeek && rng.bool(knock.escalateChance)) worsened = { name: knock.name, type: knock.type }
            }

            if (worsened || rng.bool(injuryRiskPerWeek(player))) {
                injuries++
                const severityRoll = worsened ? 0.6 : rng.next()
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
                    // C5: burnout follows the load; a worsened knock keeps its own kind.
                    const t = worsened
                        ? { type: worsened.type, name: `${worsened.name} (worsened)`, desc: "A knock played through has become a proper injury." }
                        : player.fatigue >= WORKLOAD_TUNING.BURNOUT_FATIGUE ? types[1] : rng.pick(types)
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
                    const t = player.fatigue >= WORKLOAD_TUNING.BURNOUT_FATIGUE ? types[1] : rng.pick(types)
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

                // Inbox message only for the manager's own players; every
                // injury is still reported in the news feed below.
                const injuredTeam = playerTeamMap.get(player.id)
                // C5: a minor knock at the managed club is the manager's call:
                // rest him (the layoff stands) or play through it at a stated risk.
                if (injuredTeam?.id === save.playerTeamId && severity === "MINOR" && !worsened) {
                    const escalate = Math.round(WORKLOAD_TUNING.KNOCK_ESCALATE * 100)
                    save.eventsLog.unshift({
                        id: `knock_${player.id}_${save.currentWeek}`,
                        type: EventType.INJURY,
                        week: save.currentWeek,
                        acknowledged: false,
                        data: {
                            playerId: player.id,
                            weeksOut,
                            healthLoss,
                            severity,
                            title: `${player.nickname} has a knock: ${injuryName}`,
                            message: `${player.nickname} picked up a minor ${injuryName.toLowerCase()}. Rest him and he is out for ${weeksOut} week${weeksOut === 1 ? "" : "s"}. Play him through it and he is back for your next match, loses ${-WORKLOAD_TUNING.KNOCK_FORM} form, and has a ${escalate}% chance it worsens into a moderate injury (2 to 4 weeks out) at next week's check.`,
                        },
                        choices: [
                            { id: "rest", text: `Rest him (out ${weeksOut} week${weeksOut === 1 ? "" : "s"})`, effects: {} },
                            { id: "play_through", text: "Play through it", effects: { playThrough: { escalateChance: WORKLOAD_TUNING.KNOCK_ESCALATE, form: WORKLOAD_TUNING.KNOCK_FORM } } },
                        ],
                    })
                } else if (injuredTeam?.id === save.playerTeamId) save.eventsLog.unshift({
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
                    const playerTeam = injuredTeam
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

        // Build contract map for O(1) lookups inside retirement logic
        const contractMap = new Map<string, typeof save.contracts[0]>()
        save.contracts.forEach(c => contractMap.set(c.playerId, c))

        const retirePlayer = (player: PlayerSaveData) => {
            player.isRetired = true
            player.retirementWeek = save.currentWeek
            retired.push(player.id)

            // A retiree can't keep occupying academy slots.
            if (save.academyPlayers?.length) {
                save.academyPlayers = save.academyPlayers.filter(ap => ap.playerId !== player.id)
            }
            if (save.academyRoster) {
                for (const role of Object.keys(save.academyRoster)) {
                    if (save.academyRoster[role] === player.id) save.academyRoster[role] = null
                }
            }

            // Auto-terminate contract and remove from roster
            const contract = contractMap.get(player.id)
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
            // (HALL_OF_FAME_TUNING: a few inductions per season, not every long career.)
            const achievements = hallOfFameAchievements(player)
            const isLegendary = qualifiesForHallOfFame(player)

            if (isLegendary) {
                player.isLegendary = true
                player.legendaryAchievements = achievements
                legends.push(player.id)

                // Write-through to hallOfFame so legends appear in HoF display
                // (the one induction path, Phase 5.1). Dedup also against the
                // legacy hof_ id scheme of older saves.
                if (!save.hallOfFame) save.hallOfFame = []
                if (!save.hallOfFame.some(h => h.id === player.id || h.id === `hof_${player.id}`)) {
                    save.hallOfFame.push(hallOfFameEntry(player, save.currentWeek, lastTeamId))
                }
            }

            // Inbox entry only for the manager's own players; other retirements
            // (including Hall of Fame inductions, ~50 a season by season 10)
            // stay in the news feed and Hall of Fame. World-wide inbox items
            // put 50-65 retirements in the inbox every season end.
            if (lastTeamId === save.playerTeamId) save.eventsLog.push({
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
        const checkLegendaryEligibility = (player: PlayerSaveData): boolean => qualifiesForHallOfFame(player)

        save.players.forEach(player => {
            if (player.isRetired) return

            // Legends never retire — they play forever
            if (player.isLegendary) return

            // At age 38+, check if player qualifies as legendary
            if (player.age >= 38) {
                if (checkLegendaryEligibility(player)) {
                    // Grant legendary status — they keep playing
                    player.isLegendary = true
                    const achievements = hallOfFameAchievements(player)
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
                        const legendTeamId = contractMap.get(player.id)?.teamId
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
                if (rng.bool(retirementChance(player, save.currentWeek))) {
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

        // Build contract map for O(1) lookups
        const midContractMap = new Map<string, typeof save.contracts[0]>()
        save.contracts.forEach(c => midContractMap.set(c.playerId, c))

        for (const player of candidates) {
            if (rng.next() >= 0.02) continue // 2% chance

            // Retire the player
            player.isRetired = true
            player.retirementWeek = save.currentWeek
            retired.push(player.id)

            // Remove from roster/contracts
            const contract = midContractMap.get(player.id)
            const lastTeamId = contract?.teamId
            if (contract) {
                const team = save.teams.find(t => t.id === contract.teamId)
                if (team) {
                    team.rosterIds = team.rosterIds.filter(id => id !== player.id)
                }
                save.contracts = save.contracts.filter(c => c.playerId !== player.id)
            }

            // Same Hall of Fame judgement as a season-end retirement.
            if (qualifiesForHallOfFame(player)) {
                player.isLegendary = true
                player.legendaryAchievements = hallOfFameAchievements(player)
                legends.push(player.id)
                if (!save.hallOfFame) save.hallOfFame = []
                if (!save.hallOfFame.some(h => h.id === player.id || h.id === `hof_${player.id}`)) save.hallOfFame.push(hallOfFameEntry(player, save.currentWeek, lastTeamId))
            }

            // Never the manager's player (excluded above): news feed only,
            // not an inbox item.
            if (lastTeamId === save.playerTeamId) save.eventsLog.push({
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
