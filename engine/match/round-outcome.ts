/**
 * Round-outcome generator: given a round winner + per-team economy,
 * produces the realistic kill/death distribution, plant/defuse/explode
 * timing, clutch detection, trade-kill assists, headshot probability,
 * and KAST-feeding event log for one round of the match.
 *
 * Extracted from match-simulation.ts (Phase I4) with I3 integration
 * tests as the safety net. The four functions are pure — no `this`,
 * no module-level state, all randomness threaded through SeededRNG.
 *
 * generateRoundStats is the heavyweight (~350 lines); the other three
 * are tiny utilities used by it.
 */

import { WEAPONS, WeaponType as EconomyWeaponType } from "../economy-manager"
import { getMasteryLevel, MASTERY_LEVELS } from "../weapon-mastery-system"
import type { Player, MatchEvent } from "@/types"
import type { SeededRNG } from "../rng"

/**
 * Per-player live state during a single map's simulation: cash, current
 * weapon, armor, kit, utility slots. Lives alongside the round-outcome
 * code since this module is the heaviest consumer.
 */
export interface PlayerSimulationState {
    id: string
    cash: number
    weapon: string
    hasArmor: boolean
    hasHelmet: boolean
    hasKit: boolean
    utility: string[]
}

type RoundWinType = "ELIMINATION" | "BOMB_EXPLODED" | "BOMB_DEFUSE" | "TIME"

/**
 * Pick a round win-condition flavor weighted by who won. CT wins lean
 * toward DEFUSE, T wins lean toward EXPLODED. ELIMINATION is the
 * residual category.
 */
export function determineWinType(rng: SeededRNG, ctWins: boolean): RoundWinType {
    const roll = rng.next()

    if (ctWins) {
        // 50% Defuse, 40% Elim, 10% Time
        if (roll < 0.40) return "ELIMINATION"
        if (roll < 0.90) return "BOMB_DEFUSE"
        return "TIME"
    } else {
        // 70% Plant (Explosion), 30% Elim
        if (roll < 0.30) return "ELIMINATION"
        return "BOMB_EXPLODED"
    }
}

/**
 * Weighted random selection from a player list for either KILL or DEATH
 * context. Skill-driven (skill / form / fatigue) with trait modifiers
 * (AGGRESSIVE / PASSIVE / TRADE_FRAGGER), weapon-mastery accuracy bonus
 * for KILL context, diminishing-returns on multi-kills within the same
 * round, and a ±30% RNG band so star players don't hog every kill.
 */
export function pickWeighted(
    rng: SeededRNG,
    players: Player[],
    context: "KILL" | "DEATH",
    roundKills?: Map<string, number>,
): Player {
    if (players.length === 0) throw new Error("[pickWeighted] No players to pick from")
    if (players.length === 1) return players[0]

    const weights = players.map(p => {
        let w = 1.0
        const traits = p.traits || []

        const skill = p.skill ?? 10
        const teamwork = p.teamwork ?? 10

        const skillFactor = skill / 100
        const formFactor = (p.form ?? 70) / 100
        const staminaFactor = 1.1 - ((p.fatigue ?? 0) / 100)

        // Weapon Mastery bonus (accuracy bonus from trained weapons).
        const mastery = p.weaponMastery
        if (mastery && context === "KILL") {
            const rifleXP = mastery.RIFLE ?? 0
            const masteryLevel = getMasteryLevel(rifleXP)
            const accuracyBonus = MASTERY_LEVELS[masteryLevel].accuracyBonus
            w *= 1.0 + (accuracyBonus / 100)
        }

        w *= (skillFactor * formFactor * staminaFactor)

        if (context === "KILL") {
            if (traits.includes("AGGRESSIVE")) w *= 1.25
            if (traits.includes("PASSIVE")) w *= 0.8

            // Trading contribution.
            w *= 0.9 + (teamwork / 100) * 0.2
            if (traits.includes("TRADE_FRAGGER")) w *= 1.2

            // Diminishing returns for multi-kills in the same round.
            if (roundKills) {
                const currentKills = roundKills.get(p.id) || 0
                if (currentKills > 0) {
                    w *= Math.pow(0.6, currentKills)
                }
            }
        } else {
            if (traits.includes("AGGRESSIVE")) w *= 1.15
            if (traits.includes("PASSIVE")) w *= 0.9

            // Entry risk via reaction time.
            const reaction = p.reaction ?? 10
            w *= 1.0 + (reaction / 100) * 0.3
        }

        // Random variance to prevent star monopolizing every kill.
        w *= rng.range(0.7, 1.3)

        return Math.max(0.1, w)
    })

    const total = weights.reduce((a, b) => a + b, 0)
    let r = rng.next() * total
    for (let i = 0; i < players.length; i++) {
        r -= weights[i]
        if (r <= 0) return players[i]
    }
    return players[players.length - 1]
}

/**
 * Append a KILL event + bump kill/death tallies. Trade-kill /
 * flash-assist / headshot / utility flags shape the displayed
 * `details` string.
 */
export function addKillEvent(
    kills: { playerId: string; kills: number; weapon: string }[],
    deaths: { playerId: string; deaths: number }[],
    events: MatchEvent[],
    killer: Player,
    victim: Player,
    weapon: string,
    time: number,
    assisterId?: string,
    isHeadshot?: boolean,
    isUtility?: boolean,
    isTrade?: boolean,
    isFlashAssist?: boolean,
): void {
    const existingKill = kills.find(k => k.playerId === killer.id)
    if (existingKill) existingKill.kills++
    else kills.push({ playerId: killer.id, kills: 1, weapon })

    const existingDeath = deaths.find(d => d.playerId === victim.id)
    if (existingDeath) existingDeath.deaths++
    else deaths.push({ playerId: victim.id, deaths: 1 })

    let details = "secured a solo kill"
    if (isHeadshot) details = "secured a headshot kill"
    else if (isTrade) details = "traded their teammate"
    else if (isFlashAssist) details = "secured a blinded kill"
    else if (assisterId) details = "secured an assisted kill"

    events.push({
        type: "KILL",
        time,
        playerId: killer.id,
        victimId: victim.id,
        assisterId,
        weapon,
        isHeadshot,
        isUtility,
        isTrade,
        isFlashAssist,
        details,
    })
}

/**
 * Generate kill/death/event sequence for one round given the high-level
 * winner + winType + per-team economy. Drives clutch tracking,
 * trade-kill windows, assist weighting, plant/defuse timing, and
 * save logic when one team is heavily outnumbered.
 *
 * The function mutates winnersAlive/losersAlive locally as kills land,
 * exits when both kill quotas are met (or after a save break), and
 * appends ROUND_END as the final event.
 */
export function generateRoundStats(
    rng: SeededRNG,
    homePlayers: Player[],
    awayPlayers: Player[],
    homeWins: boolean,
    homeEconomy: Record<string, PlayerSimulationState>,
    awayEconomy: Record<string, PlayerSimulationState>,
    winType: RoundWinType,
    homePlayerIdSet: Set<string>,
    playerMap: Map<string, Player>,
): {
    kills: { playerId: string; kills: number; weapon: string }[]
    deaths: { playerId: string; deaths: number }[]
    events: MatchEvent[]
    winType: RoundWinType
} {
    const kills: { playerId: string; kills: number; weapon: string }[] = []
    const deaths: { playerId: string; deaths: number }[] = []
    const events: MatchEvent[] = []
    const winningPlayers = homeWins ? [...homePlayers] : [...awayPlayers]
    const losingPlayers = homeWins ? [...awayPlayers] : [...homePlayers]

    let isClutchScenario = false
    let clutchStartEnemies = 0

    let currentTime = rng.int(5, 12)

    // Loser deaths: 2-5 weighted toward 3-4 (or 5 if elimination win).
    let loserDeathCount: number
    if (winType === "ELIMINATION") {
        loserDeathCount = 5
    } else {
        const loserRoll = rng.next()
        if (loserRoll < 0.10) loserDeathCount = 2
        else if (loserRoll < 0.45) loserDeathCount = 3
        else if (loserRoll < 0.80) loserDeathCount = 4
        else loserDeathCount = 5
    }

    // Defuse win: T side must be near-eliminated (95% chance of 4-5 deaths;
    // 5% ninja defuse leaves 1-3).
    if (winType === "BOMB_DEFUSE") {
        if (!rng.bool(0.05)) {
            loserDeathCount = rng.int(4, 5)
        }
    }

    // Winner deaths: 0-3 weighted toward 1-2.
    let winnerDeathCount: number
    const winnerRoll = rng.next()
    if (winnerRoll < 0.15) winnerDeathCount = 0
    else if (winnerRoll < 0.50) winnerDeathCount = 1
    else if (winnerRoll < 0.85) winnerDeathCount = 2
    else winnerDeathCount = 3
    winnerDeathCount = Math.min(winnerDeathCount, Math.max(0, loserDeathCount - 1))

    const winnersAlive = [...winningPlayers]
    const losersAlive = [...losingPlayers]

    let winnerDeathsRemaining = winnerDeathCount
    let loserDeathsRemaining = loserDeathCount

    let plantTime = (winType === "BOMB_EXPLODED" || winType === "BOMB_DEFUSE") ? rng.int(45, 75) : 0
    let hasPlanted = false

    const roundKills = new Map<string, number>()
    let lastDeath: { time: number; victimId: string; killerId: string } | null = null

    while (winnerDeathsRemaining > 0 || loserDeathsRemaining > 0) {
        const winnersAliveCount = winnersAlive.length
        const losersAliveCount = losersAlive.length

        if (winnersAliveCount === 1 && losersAliveCount >= 2 && !isClutchScenario) {
            isClutchScenario = true
            clutchStartEnemies = losersAliveCount
        }
        if (currentTime > 110) break

        // PANIC: increase trade probability late in round.
        const isLateRound = currentTime > 90
        const isTradeOpportunity = events.length > 0 && (events[events.length - 1].time + (isLateRound ? 5 : 3) >= currentTime)
        const tradeChance = isTradeOpportunity ? (isLateRound ? 0.9 : 0.7) : (isLateRound ? 0.4 : 0.1)
        const isTrade = rng.bool(tradeChance)

        let killer: Player | undefined
        let victim: Player | undefined
        let isWinnerKill = false

        const totalRemaining = winnerDeathsRemaining + loserDeathsRemaining
        let winnerDeathWeight = winnerDeathsRemaining / (totalRemaining || 1)

        // MAN ADVANTAGE: team with more alive players gets a kill bias.
        const manAdvantage = winnersAlive.length - losersAlive.length
        if (manAdvantage > 0) {
            const advantageBonus = Math.min(0.50, manAdvantage * 0.12)
            winnerDeathWeight = Math.max(0.05, winnerDeathWeight - advantageBonus)
        } else if (manAdvantage < 0) {
            const disadvantagePenalty = Math.min(0.50, Math.abs(manAdvantage) * 0.15)
            winnerDeathWeight = Math.min(0.95, winnerDeathWeight + disadvantagePenalty)
        }

        // SAVE LOGIC: 1v5+ with valuable gun → 7% chance to break and save.
        if (manAdvantage >= 4 && losersAlive.length > 0 && losersAlive.length <= 2 && currentTime > 35) {
            const isHomeLoser = homePlayerIdSet.has(losersAlive[0].id)
            const economy = isHomeLoser ? homeEconomy : awayEconomy

            const hasValuableGun = losersAlive.some(p => {
                const state = economy[p.id]
                if (!state) return false
                const weapon = WEAPONS[state.weapon?.toUpperCase()]
                return (weapon?.price || 0) > 2000
            })

            if (hasValuableGun) {
                if (rng.bool(0.07)) {
                    const names = losersAlive.map(p => p.nickname).join(", ")
                    events.push({ type: "SAVE", time: currentTime, details: `${names} saving` })
                    break
                }
            }
        }

        if (rng.bool(winnerDeathWeight) && winnerDeathsRemaining > 0 && losersAlive.length > 0) {
            killer = pickWeighted(rng, losersAlive, "KILL", roundKills)
            victim = pickWeighted(rng, winnersAlive, "DEATH")
            isWinnerKill = false
        } else if (loserDeathsRemaining > 0 && winnersAlive.length > 0) {
            killer = pickWeighted(rng, winnersAlive, "KILL", roundKills)
            victim = pickWeighted(rng, losersAlive, "DEATH")
            isWinnerKill = true
        }

        if (killer && victim) {
            const weapon = homePlayers.includes(killer) ? homeEconomy[killer.id]?.weapon || "glock" : awayEconomy[killer.id]?.weapon || "usp"

            let timeStep = isTrade ? rng.int(1, 4) : rng.int(8, 25)

            // PANIC: faster engagements late in round.
            if (currentTime > 90) {
                timeStep = rng.int(2, 6)
            }

            if (!hasPlanted && plantTime > 0 && currentTime + timeStep > plantTime) {
                const isTWinning = winType === "BOMB_EXPLODED"
                const activeTs = isTWinning ? winnersAlive : losersAlive
                const activeCTs = isTWinning ? losersAlive : winnersAlive

                const tDisadvantage = activeCTs.length - activeTs.length

                let canPlant = true
                if (activeTs.length === 0) {
                    canPlant = false
                } else if (tDisadvantage >= 2 && !rng.bool(0.1)) {
                    canPlant = false
                }

                if (canPlant) {
                    currentTime = plantTime
                    events.push({ type: "PLANT", time: plantTime, side: "t", details: "Bomb has been planted" })
                    hasPlanted = true
                    timeStep = rng.int(2, 5)
                } else {
                    plantTime += rng.int(10, 20)
                }
            }

            currentTime += timeStep

            if (isWinnerKill) {
                const idx = losersAlive.findIndex(p => p.id === victim!.id)
                if (idx !== -1) losersAlive.splice(idx, 1)
                loserDeathsRemaining--
                roundKills.set(killer!.id, (roundKills.get(killer!.id) || 0) + 1)
                lastDeath = { time: currentTime, victimId: victim!.id, killerId: killer!.id }
            } else {
                const idx = winnersAlive.findIndex(p => p.id === victim!.id)
                if (idx !== -1) winnersAlive.splice(idx, 1)
                winnerDeathsRemaining--
                roundKills.set(killer!.id, (roundKills.get(killer!.id) || 0) + 1)
                lastDeath = { time: currentTime, victimId: victim!.id, killerId: killer!.id }
            }

            // Assist logic: trade-kill window is a guaranteed assist;
            // otherwise damage/flash assist roll.
            let assister: Player | undefined

            const isTradeKill = lastDeath &&
                (currentTime - lastDeath.time <= 4) &&
                (victim!.id === lastDeath.killerId) &&
                (killer!.id !== lastDeath.victimId)

            if (isTradeKill && lastDeath) {
                const fallenTeammate = playerMap.get(lastDeath!.victimId)
                if (fallenTeammate) assister = fallenTeammate
            }

            if (!assister) {
                let assistProb = 0.40
                const weaponData = WEAPONS[weapon.toUpperCase()]
                if (weaponData?.type === EconomyWeaponType.SNIPER) assistProb = 0.15

                if (rng.bool(assistProb)) {
                    const teammates = isWinnerKill ? winnersAlive : losersAlive
                    const potentialAssisters = teammates.filter(p => p.id !== killer!.id)

                    if (potentialAssisters.length > 0) {
                        const assisterWeights = potentialAssisters.map(p =>
                            0.5 + ((p.reaction ?? 10) / 100) * 1.5 + ((p.grenades ?? 10) / 100) * 1.0)
                        const totalAssisterWeight = assisterWeights.reduce((a, b) => a + b, 0)
                        let r2 = rng.next() * totalAssisterWeight

                        for (let i = 0; i < potentialAssisters.length; i++) {
                            r2 -= assisterWeights[i]
                            if (r2 <= 0) {
                                assister = potentialAssisters[i]
                                break
                            }
                        }
                    }
                }
            }

            // Headshot probability + utility detection.
            const killWeaponData = WEAPONS[weapon.toUpperCase()]
            const killerSkill = killer.skill ?? 10

            let hsChance = 0.2
            if (killWeaponData?.type === EconomyWeaponType.SNIPER) {
                hsChance = 0.08
            } else if (killWeaponData?.type === EconomyWeaponType.RIFLE) {
                hsChance = 0.3 + (killerSkill / 100) * 0.3
            } else {
                hsChance = 0.15 + (killerSkill / 100) * 0.2
            }
            const isHeadshot = rng.bool(hsChance)
            const isUtility = killWeaponData?.type === EconomyWeaponType.UTILITY
            const isFlashAssist = !isTradeKill && assister && rng.bool(0.3)

            addKillEvent(kills, deaths, events, killer!, victim!, weapon, currentTime, assister?.id, isHeadshot, isUtility, !!isTradeKill, isFlashAssist)
        } else {
            break
        }
    }

    // Post-loop: emit CLUTCH event if applicable.
    if (isClutchScenario && winnersAlive.length === 1) {
        const clutcher = winnersAlive[0]
        events.push({
            type: "CLUTCH",
            time: currentTime + 1,
            playerId: clutcher.id,
            details: `1v${clutchStartEnemies}`,
        })
    }

    // Catch-up plant emission if the inner loop didn't reach it.
    if (!hasPlanted && (winType === "BOMB_EXPLODED" || winType === "BOMB_DEFUSE")) {
        const isTWinning = winType === "BOMB_EXPLODED"
        const activeTs = isTWinning ? winnersAlive : losersAlive

        if (activeTs.length > 0) {
            const time = Math.max(currentTime + 2, plantTime > 0 ? plantTime : 55)
            events.push({ type: "PLANT", time, side: "t", details: "Bomb has been planted" })
            currentTime = time
            hasPlanted = true
        } else {
            // No T alive to plant — collapse to elimination outcome.
            winType = "ELIMINATION"
        }
    }

    if (hasPlanted && winType === "BOMB_DEFUSE") {
        const defuseTime = currentTime + rng.int(5, 10)
        events.push({ type: "DEFUSE", time: defuseTime, side: "ct", details: "Bomb has been defused" })
        currentTime = defuseTime
    }

    if (hasPlanted && winType === "BOMB_EXPLODED") {
        // Optimization: all CTs dead → skip the full 40s explode wait.
        const allCTsDead = losersAlive.length === 0
        const waitTime = allCTsDead ? 3 : 40

        const explodeTime = currentTime + waitTime
        events.push({
            type: "EXPLODE",
            time: explodeTime,
            side: "t",
            details: allCTsDead ? "Bomb exploded (All CTs eliminated)" : "Bomb has exploded",
        })
        currentTime = explodeTime
    }

    if (winType === "TIME") {
        currentTime = 115
    }

    events.sort((a, b) => a.time - b.time)
    const displayType = winType === "TIME" ? "TIME" : winType.replace('_', ' ')
    events.push({ type: "ROUND_END", time: currentTime + 2, details: `Round won via ${displayType}` })

    return { kills, deaths, events, winType }
}
