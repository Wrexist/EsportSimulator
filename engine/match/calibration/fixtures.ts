/**
 * Synthetic rosters for the calibration harness, ported from the 2026-10-09
 * audit harness (makePlayer / makeRoster / makeTeam).
 *
 * Every attribute of a player equals their skill, so "skill" is the one knob;
 * morale/form 70, no fatigue, full energy, no traits. Teams have chemistry
 * 60, facilities level 1, no gear and reputation 20 (no implicit AI gear),
 * so a managed team and an AI team of the same skill are equally strong.
 *
 * A built team object carries both the runtime (`Team`) and the save
 * (`TeamSaveData`) field names, so the same side feeds the managed path
 * (prepareLegacySeries) and the AI path (MatchEngine.simulateMatch).
 */

import type { Player } from '@/types'

export const ROLES5 = ['AWPER', 'IGL', 'ENTRY_FRAGGER', 'SUPPORT', 'RIFLER'] as const
export const ALL_RIFLERS = ['RIFLER', 'RIFLER', 'RIFLER', 'RIFLER', 'RIFLER'] as const

export type Playstyle = 'aggressive' | 'structured' | 'balanced'

export interface SideSpec {
    id: string
    /** Five skills, in lineup order. */
    skills: readonly number[]
    /** Roles in lineup order (default ROLES5). */
    roles?: readonly string[]
    playstyle?: Playstyle
    economyStyle?: 'standard' | 'force' | 'eco'
    tacticalPrep?: number
    /** Staff levels 1–5; omitted roles are not hired. */
    staff?: { coach?: number; analyst?: number; psychologist?: number }
}

/** Staff record accepted by both paths (prepareLegacySeries `staff`, MatchEngine `homeTeamStaff`). */
export interface StaffRecord {
    id: string
    name: string
    role: 'coach' | 'analyst' | 'psychologist'
    level: number
    salaryPerWeek: number
}

/** Team object with runtime and save field names (see module comment). */
export interface CalibrationTeam {
    id: string
    name: string
    tier: string
    logoPath: string
    roster: string[]
    rosterIds: string[]
    staff: never[]
    staffIds: string[]
    reputation: number
    fanbase: number
    followers: number
    chemistry: number
    facilitiesLevel: number
    trainingSlotsUsed: number
    maxTrainingSlots: number
    budget: number
    playstyle?: Playstyle
    economyStyle?: 'standard' | 'force' | 'eco'
    tacticalPrep: number
    equipment: never[]
}

export interface BuiltSide {
    team: CalibrationTeam
    players: Player[]
    staff: StaffRecord[]
}

export function makePlayer(id: string, skill: number, role: string): Player {
    const s = skill
    return {
        id, name: id, nickname: id, age: 22, nationality: 'X', portraitPath: '', role, tier: 'PRO',
        skill: s, awp: s, rifle: s, pistol: s, grenades: s, creativity: s, clutch: s, tactic: s, entry: s, trading: s,
        leader: s, teamwork: s, morale: 70, amicability: 50, productivity: 50, stressResistance: 60, loyalty: 50,
        reaction: s, eyesight: s, health: 100, strength: 50, endurance: 50,
        form: 70, fatigue: 0, potential: s, energy: 100, maxEnergy: 100,
        matchesPlayed: 0, roundsPlayed: 0, avgRating: 1, clutchSuccessRate: 0,
        contract: { playerId: id, salaryPerWeek: 0, startWeek: 0, endWeek: 52, buyout: 0 },
        traits: [], perks: [],
    } as unknown as Player
}

export function buildSide(spec: SideSpec): BuiltSide {
    if (spec.skills.length !== 5) throw Error(`Side ${spec.id} needs five skills`)
    const roles = spec.roles ?? ROLES5
    const players = spec.skills.map((skill, i) => makePlayer(`${spec.id}_${i}`, skill, roles[i] ?? 'RIFLER'))
    const staff: StaffRecord[] = []
    for (const role of ['coach', 'analyst', 'psychologist'] as const) {
        const level = spec.staff?.[role]
        if (level) staff.push({ id: `${spec.id}_${role}`, name: role, role, level, salaryPerWeek: 0 })
    }
    const ids = players.map(p => p.id)
    return {
        players,
        staff,
        team: {
            id: spec.id, name: spec.id, tier: 'PRO', logoPath: '',
            roster: ids, rosterIds: ids, staff: [], staffIds: staff.map(s => s.id),
            reputation: 20, fanbase: 0, followers: 0, chemistry: 60, facilitiesLevel: 1,
            trainingSlotsUsed: 0, maxTrainingSlots: 10, budget: 0,
            playstyle: spec.playstyle, economyStyle: spec.economyStyle, tacticalPrep: spec.tacticalPrep ?? 0, equipment: [],
        },
    }
}

/** Five players of one skill. */
export const even = (skill: number): number[] => [skill, skill, skill, skill, skill]
