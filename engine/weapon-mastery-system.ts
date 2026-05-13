/**
 * Weapon Mastery System
 * Phase 48: Train players to specialize in specific weapons
 * 
 * WEAPON TYPES:
 * - RIFLE: AK-47, M4A4, M4A1-S (base weapon for most players)
 * - AWP: Primary sniper rifle (high skill ceiling)
 * - PISTOL: Deagle, USP, Glock, etc. (eco/clutch weapon)
 * - SMG: MP9, MAC-10, UMP (anti-eco/force buy specialist)
 * 
 * MASTERY LEVELS (XP thresholds):
 * - Novice: 0-99 XP (no bonus)
 * - Competent: 100-299 XP (+2% accuracy)
 * - Skilled: 300-599 XP (+5% accuracy, +3% damage)
 * - Expert: 600-999 XP (+8% accuracy, +5% damage)
 * - Master: 1000+ XP (+12% accuracy, +8% damage, unlocks weapon badge)
 */

import { Player } from "@/types/player"
import { PlayerSaveData } from "./save-types"

// Type alias for compatibility
type PlayerData = Player | PlayerSaveData

// ===== CONSTANTS =====

export const WEAPON_TYPES = {
    RIFLE: "RIFLE",
    AWP: "AWP",
    PISTOL: "PISTOL",
    SMG: "SMG"
} as const

export type WeaponType = typeof WEAPON_TYPES[keyof typeof WEAPON_TYPES]

export const MASTERY_LEVELS = {
    NOVICE: { name: "Novice", minXP: 0, accuracyBonus: 0, damageBonus: 0, icon: "Circle" },
    COMPETENT: { name: "Competent", minXP: 100, accuracyBonus: 2, damageBonus: 0, icon: "CircleDot" },
    SKILLED: { name: "Skilled", minXP: 300, accuracyBonus: 5, damageBonus: 3, icon: "Target" },
    EXPERT: { name: "Expert", minXP: 600, accuracyBonus: 8, damageBonus: 5, icon: "Crosshair" },
    MASTER: { name: "Master", minXP: 1000, accuracyBonus: 12, damageBonus: 8, icon: "Crown" }
} as const

export type MasteryLevel = keyof typeof MASTERY_LEVELS

// Training drill definitions
export const WEAPON_DRILLS = {
    RIFLE_AIM: {
        id: "rifle_aim",
        name: "Rifle Aim Training",
        description: "Intensive aim training with AK-47 and M4. Spray control and tap shooting drills.",
        weapon: WEAPON_TYPES.RIFLE,
        xpGain: 50,
        cost: 5000,
        duration: 1,
        icon: "Crosshair",
        difficulty: "medium"
    },
    RIFLE_SPRAY: {
        id: "rifle_spray",
        name: "Spray Control Mastery",
        description: "Advanced spray transfer and recoil control. Learn perfect spray patterns.",
        weapon: WEAPON_TYPES.RIFLE,
        xpGain: 75,
        cost: 8000,
        duration: 1,
        icon: "Target",
        difficulty: "hard"
    },
    AWP_FLICKS: {
        id: "awp_flicks",
        name: "AWP Flick Training",
        description: "Practice quick-scopes and flick shots. Become a mechanical AWP god.",
        weapon: WEAPON_TYPES.AWP,
        xpGain: 60,
        cost: 7500,
        duration: 1,
        icon: "Zap",
        difficulty: "hard"
    },
    AWP_POSITIONING: {
        id: "awp_positioning",
        name: "AWP Angle Holding",
        description: "Learn common AWP spots and timing. Master patience and positioning.",
        weapon: WEAPON_TYPES.AWP,
        xpGain: 50,
        cost: 6000,
        duration: 1,
        icon: "Eye",
        difficulty: "medium"
    },
    PISTOL_HEADSHOTS: {
        id: "pistol_headshots",
        name: "Pistol Precision",
        description: "Deagle and USP headshot training. One-taps for days.",
        weapon: WEAPON_TYPES.PISTOL,
        xpGain: 45,
        cost: 4000,
        duration: 1,
        icon: "Target",
        difficulty: "medium"
    },
    PISTOL_ECO: {
        id: "pistol_eco",
        name: "Eco Round Specialist",
        description: "Force buy strategies and pistol clutch scenarios.",
        weapon: WEAPON_TYPES.PISTOL,
        xpGain: 55,
        cost: 5500,
        duration: 1,
        icon: "DollarSign",
        difficulty: "medium"
    },
    SMG_RUSH: {
        id: "smg_rush",
        name: "SMG Rush Training",
        description: "Anti-eco dominance. Learn to run and gun with MAC-10 and MP9.",
        weapon: WEAPON_TYPES.SMG,
        xpGain: 40,
        cost: 3000,
        duration: 1,
        icon: "Zap",
        difficulty: "easy"
    },
    SMG_ANGLES: {
        id: "smg_angles",
        name: "Close Angle Combat",
        description: "CQB specialist training. UMP and close-range duels.",
        weapon: WEAPON_TYPES.SMG,
        xpGain: 45,
        cost: 4000,
        duration: 1,
        icon: "Shield",
        difficulty: "medium"
    }
} as const

export type WeaponDrillId = keyof typeof WEAPON_DRILLS

// Weapon display info
export const WEAPON_DISPLAY = {
    RIFLE: {
        name: "Rifle",
        icon: "Crosshair",
        color: "text-blue-400",
        bgColor: "bg-blue-500/20",
        borderColor: "border-blue-500/30",
        description: "AK-47, M4A4, M4A1-S"
    },
    AWP: {
        name: "AWP",
        icon: "Target",
        color: "text-amber-400",
        bgColor: "bg-amber-500/20",
        borderColor: "border-amber-500/30",
        description: "Primary Sniper"
    },
    PISTOL: {
        name: "Pistol",
        icon: "Circle",
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/20",
        borderColor: "border-emerald-500/30",
        description: "Deagle, USP, Glock"
    },
    SMG: {
        name: "SMG",
        icon: "Zap",
        color: "text-purple-400",
        bgColor: "bg-purple-500/20",
        borderColor: "border-purple-500/30",
        description: "MAC-10, MP9, UMP"
    }
} as const

// ===== HELPER FUNCTIONS =====

/**
 * Get mastery level from XP
 */
export function getMasteryLevel(xp: number): MasteryLevel {
    if (xp >= MASTERY_LEVELS.MASTER.minXP) return "MASTER"
    if (xp >= MASTERY_LEVELS.EXPERT.minXP) return "EXPERT"
    if (xp >= MASTERY_LEVELS.SKILLED.minXP) return "SKILLED"
    if (xp >= MASTERY_LEVELS.COMPETENT.minXP) return "COMPETENT"
    return "NOVICE"
}

/**
 * Get mastery info for display
 */
export function getMasteryInfo(xp: number): {
    level: MasteryLevel
    name: string
    xp: number
    accuracyBonus: number
    damageBonus: number
    icon: string
    isMaster: boolean
    nextLevel: string | null
    xpToNext: number
    progress: number
} {
    const level = getMasteryLevel(xp)
    const levelInfo = MASTERY_LEVELS[level]
    const nextLevelInfo = getNextLevel(level) ? MASTERY_LEVELS[getNextLevel(level)!] : null

    return {
        level,
        name: levelInfo.name,
        xp,
        accuracyBonus: levelInfo.accuracyBonus,
        damageBonus: levelInfo.damageBonus,
        icon: levelInfo.icon,
        isMaster: level === "MASTER",
        nextLevel: nextLevelInfo?.name || null,
        xpToNext: nextLevelInfo ? nextLevelInfo.minXP - xp : 0,
        progress: nextLevelInfo
            ? ((xp - levelInfo.minXP) / (nextLevelInfo.minXP - levelInfo.minXP)) * 100
            : 100
    }
}

function getNextLevel(current: MasteryLevel): MasteryLevel | null {
    const order: MasteryLevel[] = ["NOVICE", "COMPETENT", "SKILLED", "EXPERT", "MASTER"]
    const idx = order.indexOf(current)
    return idx < order.length - 1 ? order[idx + 1] : null
}

// ===== WEAPON MASTERY MANAGER =====

export class WeaponMasteryManager {

    /**
     * Get player's weapon mastery stats
     * Handles both simple number format and complex object format
     */
    static getPlayerMastery(player: PlayerData): Record<WeaponType, number> {
        const getXP = (value: any): number => {
            if (value === undefined || value === null) return 0
            if (typeof value === 'number') return value
            if (typeof value === 'object' && 'xp' in value) return value.xp || 0
            return 0
        }

        return {
            RIFLE: getXP(player.weaponMastery?.RIFLE),
            AWP: getXP(player.weaponMastery?.AWP),
            PISTOL: getXP(player.weaponMastery?.PISTOL),
            SMG: getXP(player.weaponMastery?.SMG)
        }
    }

    /**
     * Process weapon training drill
     * Returns the new mastery state without mutating the player (for Zustand compatibility)
     */
    static processTrainingDrill(
        player: PlayerData,
        drillId: WeaponDrillId,
        teamBudget: number
    ): { success: boolean; cost: number; xpGained: number; newMastery: Record<string, number>; message: string } {
        const drill = WEAPON_DRILLS[drillId]

        if (teamBudget < drill.cost) {
            return {
                success: false,
                cost: 0,
                xpGained: 0,
                newMastery: {},
                message: `Insufficient budget. Need $${drill.cost.toLocaleString()}.`
            }
        }

        // Get current mastery (defaults to 0 for each weapon)
        const currentMastery = this.getPlayerMastery(player)

        // Calculate XP gain (bonus for skilled players)
        let xpGain = drill.xpGain
        const skillBonus = Math.floor(((player.skill ?? 50) - 70) / 10) * 5
        xpGain += Math.max(0, skillBonus)

        // Calculate new XP for the weapon
        const oldXP = currentMastery[drill.weapon]
        const newXP = oldXP + xpGain

        // Check for level up
        const oldLevel = getMasteryLevel(oldXP)
        const newLevel = getMasteryLevel(newXP)
        // Return new mastery state (to be applied by the calling component)
        const newMastery = {
            ...currentMastery,
            [drill.weapon]: newXP
        }

        return {
            success: true,
            cost: drill.cost,
            xpGained: xpGain,
            newMastery,
            message: `${player.nickname} completed ${drill.name}! +${xpGain} ${drill.weapon} XP`
        }
    }

    /**
     * Get player's best weapon (highest mastery)
     */
    static getBestWeapon(player: PlayerData): WeaponType | null {
        const mastery = this.getPlayerMastery(player)
        let best: WeaponType | null = null
        let bestXP = 0

        for (const [weapon, xp] of Object.entries(mastery)) {
            if (xp > bestXP) {
                bestXP = xp
                best = weapon as WeaponType
            }
        }

        return bestXP >= MASTERY_LEVELS.SKILLED.minXP ? best : null
    }

    /**
     * Get weapon mastery bonuses for match simulation
     */
    static getMasteryBonuses(player: PlayerData, weapon: WeaponType): { accuracy: number; damage: number } {
        const mastery = this.getPlayerMastery(player)
        const xp = mastery[weapon]
        const level = getMasteryLevel(xp)
        const levelInfo = MASTERY_LEVELS[level]

        return {
            accuracy: levelInfo.accuracyBonus,
            damage: levelInfo.damageBonus
        }
    }

    /**
     * Get all mastered weapons (Master level)
     */
    static getMasteredWeapons(player: PlayerData): WeaponType[] {
        const mastery = this.getPlayerMastery(player)
        return (Object.keys(mastery) as WeaponType[]).filter(
            weapon => mastery[weapon] >= MASTERY_LEVELS.MASTER.minXP
        )
    }

    /**
     * Award XP after a match based on kills
     * NOTE: This mutates the player directly - only use in contexts where this is allowed
     * (e.g., inside immer produce blocks or with plain mutable objects)
     */
    static processMatchWeaponXP(
        player: PlayerData,
        rifleKills: number,
        awpKills: number,
        pistolKills: number,
        smgKills: number
    ): void {
        // Initialize mastery if needed
        if (!player.weaponMastery) {
            player.weaponMastery = {}
        }

        // Helper to award XP to a weapon
        const awardXP = (weapon: WeaponType, kills: number, xpPerKill: number) => {
            if (kills <= 0) return
            const currentXP = this.getXPForWeapon(player, weapon)
            const newXP = currentXP + (kills * xpPerKill)
            player.weaponMastery![weapon] = newXP
        }

        // Each kill = 2-5 XP based on weapon difficulty
        awardXP("RIFLE", rifleKills, 3)       // Rifles: baseline
        awardXP("AWP", awpKills, 4)           // AWP: harder, more XP
        awardXP("PISTOL", pistolKills, 5)     // Pistols: impressive
        awardXP("SMG", smgKills, 2)           // SMG: easier, less XP
    }

    /**
     * Helper to get XP for a specific weapon, handling both number and object formats
     */
    private static getXPForWeapon(player: PlayerData, weapon: WeaponType): number {
        const value = player.weaponMastery?.[weapon]
        if (value === undefined || value === null) return 0
        if (typeof value === 'number') return value
        if (typeof value === 'object' && 'xp' in value) return (value as { xp: number }).xp || 0
        return 0
    }
}

export default WeaponMasteryManager
