import type { Player } from '@/types/player'
import { physicalArmor, type PhysicalEconomyState } from './physical-economy'
import { parseLabProject, type LabProject } from '@/lib/spatial-lab-project'
import type { SpatialReference } from './types'
import { physicalWeapon } from './weapon-profiles'
import { DEFAULT_UTILITY, EMPTY_STOCK, type UtilityStock } from './utility'
import { registeredWorld, registrationMatches } from './registration'
import type { CareerRoundBinding } from './career-round-adapter'

export type CareerCombatPlayer = Pick<Player, 'id' | 'rifle' | 'awp' | 'pistol' | 'reaction' | 'tactic'>
export function utilityStock(items: string[]): UtilityStock {
    const result = { ...EMPTY_STOCK }
    for (const item of items) {
        const key = item === 'molotov' ? 'fire' : item
        if (!Object.hasOwn(result, key)) throw Error(`Unsupported utility: ${item}`)
        result[key as keyof UtilityStock]++
    }
    return result
}

/** Snapshot career inputs into an isolated physical scenario. Never purchase or deduct money. */
export function bindCareerLoadouts(input: LabProject, ref: SpatialReference, binding: CareerRoundBinding, players: CareerCombatPlayer[], economy: Record<string, PhysicalEconomyState>): LabProject {
    const project = structuredClone(input), teams = project.teams
    if (!teams || binding.mapId !== project.mapId || players.length !== teams.actors.length || binding.players.length !== teams.actors.length) throw Error('Roster does not match physical scenario')
    const used = new Set<string>(), byId = new Map(players.map(p => [p.id, p]))
    if (byId.size !== players.length) throw Error('Duplicate career player')
    const stock: Record<string, UtilityStock> = {}
    teams.actors = teams.actors.map(actor => {
        const links = binding.players.filter(p => p.actorId === actor.id), link = links[0]
        if (links.length !== 1 || used.has(link.playerId) || link.teamId !== (actor.side === binding.homeSide ? binding.homeTeamId : binding.awayTeamId)) throw Error('Invalid career identity assignment')
        const player = byId.get(link.playerId), funds = economy[link.playerId]
        if (!player || !funds || ![player.rifle, player.awp, player.pistol, player.reaction, player.tactic].every(v => Number.isFinite(v) && v >= 0 && v <= 100)) throw Error('Missing or invalid career combat attributes')
        used.add(link.playerId)
        const weapon = physicalWeapon(funds.weapon)
        const proficiency = weapon.category === 'sniper' ? player.awp : weapon.category === 'pistol' ? player.pistol : player.rifle
        stock[actor.id] = utilityStock(funds.utility || [])
        return { ...actor, armor: physicalArmor(funds), ammo: weapon.magazine,
            loadout: { weapon: weapon.id, helmet: funds.hasHelmet, kit: funds.hasKit },
            attributes: { aim: proficiency / 100, reaction: player.reaction / 100, control: (proficiency + player.tactic) / 200 } }
    })
    // Retain authored throw plans while taking inventory exclusively from purchased items.
    teams.utility = { ...DEFAULT_UTILITY, ...teams.utility, ceasefire: false, inventory: stock, throws: teams.utility?.throws || [] }
    return parseLabProject(JSON.stringify(project), ref)
}

/** Bind authored polygon/floor limits; this does not mark draft geometry as reviewed. */
export function bindAuthoredPlantZones(input: LabProject, ref: SpatialReference): LabProject {
    const project = structuredClone(input)
    if (!project.teams || !project.annotations || !registrationMatches(project.annotations, ref)) throw Error('Registered objective drawings are required')
    project.teams.plantZones = Object.fromEntries((['A', 'B'] as const).map(site => {
        const marks = project.annotations!.marks.filter(m => m.kind === 'bombsite' && m.spatial?.site === site)
        if (marks.length !== 1) throw Error(`Site ${site} needs exactly one bound polygon`)
        const mark = marks[0]
        return [site, { points: mark.points.map(p => registeredWorld(p, project.annotations!.registration!, ref)), zMin: mark.spatial!.zMin, zMax: mark.spatial!.zMax }]
    })) as NonNullable<typeof project.teams.plantZones>
    return parseLabProject(JSON.stringify(project), ref)
}
