/**
 * Equipment Manager
 * Equipment Shop system for team gear upgrades
 * 
 * Equipment contributes a bounded team-strength modifier during legacy career matches.
 * Higher tier equipment = better bonuses but higher weekly cost.
 */

import { TeamSaveData, EquipmentItem, FinanceLedgerEntry } from "./save-types"

// ===== EQUIPMENT TYPES =====

export type EquipmentType = "MOUSE" | "KEYBOARD" | "MONITOR" | "HEADSET" | "CHAIR" | "PC"
export type EquipmentTier = 1 | 2 | 3

// ===== EQUIPMENT CATALOG =====

export interface EquipmentCatalogItem {
    id: string
    type: EquipmentType
    tier: EquipmentTier
    name: string
    description: string
    bonus: { stat: string; value: number }
    purchaseCost: number
    weeklyCost: number
    icon: string // Lucide icon name
    imagePath?: string
}

export const EQUIPMENT_CATALOG: EquipmentCatalogItem[] = [
    // === MICE ===
    {
        id: "mouse_t1",
        type: "MOUSE",
        tier: 1,
        name: "Standard Gaming Mouse",
        description: "Basic optical mouse for competitive play",
        bonus: { stat: "reaction", value: 2 },
        purchaseCost: 500,
        weeklyCost: 50,
        icon: "Mouse",
        imagePath: "/esport-ui-assets/equipment/tiers/mouse-standard.webp"
    },
    {
        id: "mouse_t2",
        type: "MOUSE",
        tier: 2,
        name: "Pro Wireless Mouse",
        description: "Ultra-lightweight wireless with 1ms response",
        bonus: { stat: "reaction", value: 5 },
        purchaseCost: 2000,
        weeklyCost: 250,
        icon: "Mouse",
        imagePath: "/esport-ui-assets/equipment/tiers/mouse-pro.webp"
    },
    {
        id: "mouse_t3",
        type: "MOUSE",
        tier: 3,
        name: "Elite Tournament Mouse",
        description: "Custom-tuned sensor for precision aiming",
        bonus: { stat: "reaction", value: 8 },
        purchaseCost: 5000,
        weeklyCost: 600,
        icon: "Mouse",
        imagePath: "/esport-ui-assets/equipment/tiers/mouse-elite.webp"
    },

    // === KEYBOARDS ===
    {
        id: "keyboard_t1",
        type: "KEYBOARD",
        tier: 1,
        name: "Mechanical Keyboard",
        description: "Standard mechanical switches for gaming",
        bonus: { stat: "clutch", value: 2 },
        purchaseCost: 600,
        weeklyCost: 60,
        icon: "Keyboard",
        imagePath: "/esport-ui-assets/equipment/tiers/keyboard-standard.webp"
    },
    {
        id: "keyboard_t2",
        type: "KEYBOARD",
        tier: 2,
        name: "Pro Tournament Keyboard",
        description: "Rapid-trigger analog switches",
        bonus: { stat: "clutch", value: 5 },
        purchaseCost: 2500,
        weeklyCost: 300,
        icon: "Keyboard",
        imagePath: "/esport-ui-assets/equipment/tiers/keyboard-pro.webp"
    },
    {
        id: "keyboard_t3",
        type: "KEYBOARD",
        tier: 3,
        name: "Elite Custom Keyboard",
        description: "Handcrafted with 0.1mm actuation",
        bonus: { stat: "clutch", value: 8 },
        purchaseCost: 6000,
        weeklyCost: 750,
        icon: "Keyboard",
        imagePath: "/esport-ui-assets/equipment/tiers/keyboard-elite.webp"
    },

    // === MONITORS ===
    {
        id: "monitor_t1",
        type: "MONITOR",
        tier: 1,
        name: "144Hz Gaming Monitor",
        description: "Standard refresh rate for competitive",
        bonus: { stat: "rifle", value: 2 },
        purchaseCost: 1000,
        weeklyCost: 75,
        icon: "Monitor",
        imagePath: "/esport-ui-assets/equipment/tiers/monitor-standard.webp"
    },
    {
        id: "monitor_t2",
        type: "MONITOR",
        tier: 2,
        name: "240Hz Pro Monitor",
        description: "High refresh rate with 1ms GTG",
        bonus: { stat: "rifle", value: 5 },
        purchaseCost: 3000,
        weeklyCost: 400,
        icon: "Monitor",
        imagePath: "/esport-ui-assets/equipment/tiers/monitor-pro.webp"
    },
    {
        id: "monitor_t3",
        type: "MONITOR",
        tier: 3,
        name: "360Hz Tournament Display",
        description: "Ultra-fast panel for pro competition",
        bonus: { stat: "rifle", value: 8 },
        purchaseCost: 8000,
        weeklyCost: 1000,
        icon: "Monitor",
        imagePath: "/esport-ui-assets/equipment/tiers/monitor-elite.webp"
    },

    // === HEADSETS ===
    {
        id: "headset_t1",
        type: "HEADSET",
        tier: 1,
        name: "Gaming Headset",
        description: "7.1 surround sound for awareness",
        bonus: { stat: "tactic", value: 2 },
        purchaseCost: 400,
        weeklyCost: 40,
        icon: "Headphones",
        imagePath: "/esport-ui-assets/equipment/tiers/headset-standard.webp"
    },
    {
        id: "headset_t2",
        type: "HEADSET",
        tier: 2,
        name: "Pro Audio System",
        description: "Studio-grade drivers with ANC",
        bonus: { stat: "tactic", value: 5 },
        purchaseCost: 1500,
        weeklyCost: 200,
        icon: "Headphones",
        imagePath: "/esport-ui-assets/equipment/tiers/headset-pro.webp"
    },
    {
        id: "headset_t3",
        type: "HEADSET",
        tier: 3,
        name: "Elite In-Ear Setup",
        description: "Custom-molded in-ear monitors",
        bonus: { stat: "tactic", value: 8 },
        purchaseCost: 4000,
        weeklyCost: 550,
        icon: "Headphones",
        imagePath: "/esport-ui-assets/equipment/tiers/headset-elite.webp"
    },

    // === GAMING CHAIRS ===
    {
        id: "chair_t1",
        type: "CHAIR",
        tier: 1,
        name: "Gaming Chair",
        description: "Ergonomic support for long sessions",
        bonus: { stat: "creativity", value: 2 },
        purchaseCost: 800,
        weeklyCost: 50,
        icon: "Armchair",
        imagePath: "/esport-ui-assets/equipment/tiers/chair-standard.webp"
    },
    {
        id: "chair_t2",
        type: "CHAIR",
        tier: 2,
        name: "Pro Ergonomic Chair",
        description: "Swedish design with lumbar system",
        bonus: { stat: "creativity", value: 5 },
        purchaseCost: 3000,
        weeklyCost: 300,
        icon: "Armchair",
        imagePath: "/esport-ui-assets/equipment/tiers/chair-pro.webp"
    },
    {
        id: "chair_t3",
        type: "CHAIR",
        tier: 3,
        name: "Elite Player Station",
        description: "Custom-built seat with health monitoring",
        bonus: { stat: "creativity", value: 8 },
        purchaseCost: 7000,
        weeklyCost: 850,
        icon: "Armchair",
        imagePath: "/esport-ui-assets/equipment/tiers/chair-elite.webp"
    },

    // === GAMING PCs ===
    {
        id: "pc_t1",
        type: "PC",
        tier: 1,
        name: "Gaming PC",
        description: "Solid frame rates at 1080p",
        bonus: { stat: "skill", value: 1 },
        purchaseCost: 3000,
        weeklyCost: 150,
        icon: "Cpu",
        imagePath: "/esport-ui-assets/equipment/tiers/pc-standard.webp"
    },
    {
        id: "pc_t2",
        type: "PC",
        tier: 2,
        name: "Pro Workstation",
        description: "High-end specs for 400+ FPS",
        bonus: { stat: "skill", value: 3 },
        purchaseCost: 8000,
        weeklyCost: 500,
        icon: "Cpu",
        imagePath: "/esport-ui-assets/equipment/tiers/pc-pro.webp"
    },
    {
        id: "pc_t3",
        type: "PC",
        tier: 3,
        name: "Elite Tournament Rig",
        description: "Custom watercooled competition machine",
        bonus: { stat: "skill", value: 5 },
        purchaseCost: 15000,
        weeklyCost: 1500,
        icon: "Cpu",
        imagePath: "/esport-ui-assets/equipment/tiers/pc-elite.webp"
    },
]

// ===== EQUIPMENT TYPE DISPLAY =====

export const EQUIPMENT_TYPE_DISPLAY: Record<EquipmentType, { label: string; description: string; icon: string; imagePath: string }> = {
    MOUSE: { label: "Mouse", description: "Improves reaction time", icon: "Mouse", imagePath: "/esport-ui-assets/equipment/tiers/mouse-elite.webp" },
    KEYBOARD: { label: "Keyboard", description: "Enhances clutch potential", icon: "Keyboard", imagePath: "/esport-ui-assets/equipment/tiers/keyboard-elite.webp" },
    MONITOR: { label: "Monitor", description: "Sharpens visual precision", icon: "Monitor", imagePath: "/esport-ui-assets/equipment/tiers/monitor-elite.webp" },
    HEADSET: { label: "Headset", description: "Boosts tactical hearing", icon: "Headphones", imagePath: "/esport-ui-assets/equipment/tiers/headset-elite.webp" },
    CHAIR: { label: "Chair", description: "Improves focus and creativity", icon: "Armchair", imagePath: "/esport-ui-assets/equipment/tiers/chair-elite.webp" },
    PC: { label: "Gaming PC", description: "Overall skill boost", icon: "Cpu", imagePath: "/esport-ui-assets/equipment/tiers/pc-elite.webp" },
}

export const EQUIPMENT_TIER_DISPLAY: Record<EquipmentTier, { label: string; color: string; bgColor: string }> = {
    1: { label: "Standard", color: "text-slate-400", bgColor: "bg-slate-500/10" },
    2: { label: "Pro", color: "text-blue-400", bgColor: "bg-blue-500/10" },
    3: { label: "Elite", color: "text-amber-400", bgColor: "bg-amber-500/10" },
}

// ===== EQUIPMENT MANAGER =====

export class EquipmentManager {
    /** Legacy duplicate slots count once; each rating is bounded by its catalog maximum. */
    static activeEquipment(team: { equipment?: EquipmentItem[] }): EquipmentItem[] {
        const seen = new Set<string>()
        return (team.equipment || []).filter(item => {
            if (!(item.type in EQUIPMENT_TYPE_DISPLAY) || seen.has(item.type)) return false
            seen.add(item.type)
            return true
        })
    }

    static strengthBonus(team: { equipment?: EquipmentItem[] }): number {
        return this.activeEquipment(team).reduce((sum, item) => {
            const maximum = item.type === 'PC' ? 5 : 8
            const rating = Number.isFinite(item.bonus?.value) ? Math.max(0, Math.min(maximum, item.bonus.value)) : 0
            return sum + rating / 80
        }, 0)
    }
    /**
     * Get all available equipment for purchase
     */
    static getCatalog(): EquipmentCatalogItem[] {
        return EQUIPMENT_CATALOG
    }

    /**
     * Get equipment by type
     */
    static getByType(type: EquipmentType): EquipmentCatalogItem[] {
        return EQUIPMENT_CATALOG.filter(e => e.type === type)
    }

    /**
     * Get catalog item by ID
     */
    static getCatalogItem(id: string): EquipmentCatalogItem | undefined {
        return EQUIPMENT_CATALOG.find(e => e.id === id)
    }

    /**
     * Get team's current equipment of a type
     */
    static getTeamEquipment(team: TeamSaveData, type: EquipmentType): EquipmentItem | undefined {
        return team.equipment?.find(e => e.type === type)
    }

    /**
     * Calculate total equipment bonuses for a team
     */
    static calculateBonuses(team: TeamSaveData): Record<string, number> {
        const bonuses: Record<string, number> = {}

        if (!team.equipment) return bonuses

        this.activeEquipment(team).forEach(item => {
            const stat = item.bonus.stat
            const maximum = item.type === 'PC' ? 5 : 8
            const rating = Number.isFinite(item.bonus.value) ? Math.max(0, Math.min(maximum, item.bonus.value)) : 0
            bonuses[stat] = (bonuses[stat] || 0) + rating
        })

        return bonuses
    }

    /**
     * Calculate total weekly equipment cost
     */
    static calculateWeeklyCost(team: TeamSaveData): number {
        if (!team.equipment) return 0
        return this.activeEquipment(team).reduce((sum, item) => sum + (Number.isFinite(item.weeklyCost) ? Math.max(0, item.weeklyCost) : 0), 0)
    }

    /**
     * Purchase equipment for a team
     * Returns true if purchase successful
     */
    static purchaseEquipment(
        team: TeamSaveData,
        catalogId: string,
        currentWeek: number
    ): { success: boolean; error?: string } {
        const catalogItem = this.getCatalogItem(catalogId)
        if (!catalogItem) {
            return { success: false, error: "Equipment not found" }
        }

        if (team.equipment?.some(item => item.id === catalogId)) {
            return { success: false, error: "This equipment is already installed" }
        }
        // Check budget
        if (!Number.isFinite(team.budget) || team.budget < catalogItem.purchaseCost) {
            return { success: false, error: "Insufficient funds" }
        }

        // Initialize equipment array if needed
        if (!team.equipment) {
            team.equipment = []
        }

        // Remove existing equipment of same type (upgrade)
        team.equipment = team.equipment.filter(e => e.type !== catalogItem.type)

        // Add new equipment
        const newItem: EquipmentItem = {
            id: catalogItem.id,
            type: catalogItem.type,
            tier: catalogItem.tier,
            name: catalogItem.name,
            bonus: { ...catalogItem.bonus },
            weeklyCost: catalogItem.weeklyCost,
            purchasedWeek: currentWeek,
        }
        team.equipment.push(newItem)

        // Deduct cost
        team.budget -= catalogItem.purchaseCost

        return { success: true }
    }

    /**
     * Sell/remove equipment
     * Returns 50% of purchase price
     */
    static sellEquipment(team: TeamSaveData, type: EquipmentType): { success: boolean; refund: number } {
        if (!team.equipment) {
            return { success: false, refund: 0 }
        }

        const item = team.equipment.find(e => e.type === type)
        if (!item) {
            return { success: false, refund: 0 }
        }

        const catalogItem = this.getCatalogItem(item.id)
        const refund = Math.floor((catalogItem?.purchaseCost || 0) * 0.5)

        team.equipment = team.equipment.filter(e => e.type !== type)
        team.budget += refund

        return { success: true, refund }
    }

    /**
     * Get equipment upgrade path for a type
     */
    static getUpgradePath(type: EquipmentType): EquipmentCatalogItem[] {
        return EQUIPMENT_CATALOG
            .filter(e => e.type === type)
            .sort((a, b) => a.tier - b.tier)
    }

    /**
     * Check if team has any equipment
     */
    static hasEquipment(team: TeamSaveData): boolean {
        return (team.equipment?.length || 0) > 0
    }

    /**
     * Get equipment completion percentage (0-100)
     */
    static getEquipmentCompleteness(team: TeamSaveData): number {
        const types: EquipmentType[] = ["MOUSE", "KEYBOARD", "MONITOR", "HEADSET", "CHAIR", "PC"]
        const equipped = types.filter(type => this.getTeamEquipment(team, type) !== undefined).length
        return Math.round((equipped / types.length) * 100)
    }

    /**
     * Get average equipment tier (1-3)
     */
    static getAverageEquipmentTier(team: TeamSaveData): number {
        if (!team.equipment || team.equipment.length === 0) return 0
        const totalTier = team.equipment.reduce((sum, e) => sum + e.tier, 0)
        return Math.round((totalTier / team.equipment.length) * 10) / 10
    }
}

export default EquipmentManager
