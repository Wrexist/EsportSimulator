import { inPlantZone, type PlantZone } from './objective-zones'
import { polygonProblem } from './annotations'
import { type NavLocation, NavigationMesh } from './navigation'
import { parseUtilitySetup, type UtilitySetup } from './utility'
import type { Vec3 } from './types'
import { physicalWeapon } from './weapon-profiles'

export type Side = 'T' | 'CT'
export type Role = 'entry' | 'support' | 'lurk' | 'anchor'
export type Intent = Role | 'default' | 'trade' | 'rotate' | 'execute' | 'retake' | 'save' | 'clutch' | 'plant' | 'defuse' | 'blocked' | 'dead'
export interface TeamMember { id: string; side: Side; role: Role; start: NavLocation; station: NavLocation; yaw: number; health: number; armor: number; ammo: number; loadout?: { weapon: string; helmet: boolean; kit: boolean }; attributes?: { aim: number; reaction: number; control: number } }
export interface TeamSetup { version: 1; seed: number; seconds: number; roundSeconds: number; bombSeconds: number; plantSeconds: number; defuseSeconds: number; openingSeconds: number; communicationMs: number; memorySeconds: number; skill: Record<Side, number>; economy: 'protect' | 'balanced' | 'commit'; guns: boolean; initialBomb: 'carried' | 'planted' | 'dropped'; carrier: string; objective: 'A' | 'B'; sites: Record<'A' | 'B', NavLocation>; actors: TeamMember[]; plantZones?: Record<'A' | 'B', PlantZone>; utility?: UtilitySetup }
export const TEAM_DEFAULTS = { version: 1 as const, seed: 13, seconds: 35, roundSeconds: 25, bombSeconds: 12, plantSeconds: 3, defuseSeconds: 5, openingSeconds: 2, communicationMs: 500, memorySeconds: 4, skill: { T: 0.7, CT: 0.7 }, economy: 'balanced' as const, guns: false, initialBomb: 'carried' as const, objective: 'A' as const }
export function parseTeamSetup(value: unknown, nav: NavigationMesh): TeamSetup {
    const s = value as TeamSetup, n = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi
    const place = (p: NavLocation): NavLocation => { if (!p || !Array.isArray(p.point) || p.point.length !== 3 || p.point.some(v => !n(v, -100000, 100000)) || !nav.validLocation(p)) throw Error('Team position is outside its navigation surface'); return { area: p.area, point: [...p.point] } }
    if (!s || s.version !== 1 || !Number.isInteger(s.seed) || !n(s.seed, 0, 0xffffffff) || !n(s.seconds, 5, 240) || !n(s.roundSeconds, 5, 180) || !n(s.bombSeconds, 5, 45) || !n(s.plantSeconds, 1, 4) || !n(s.defuseSeconds, 1, 10) || !n(s.openingSeconds, 0, 10) || !n(s.communicationMs, 0, 2000) || !n(s.memorySeconds, 1, 8) || !n(s.skill?.T, 0, 1) || !n(s.skill?.CT, 0, 1) || !['protect', 'balanced', 'commit'].includes(s.economy) || typeof s.guns !== 'boolean' || !['carried', 'planted', 'dropped'].includes(s.initialBomb) || !['A', 'B'].includes(s.objective) || !Array.isArray(s.actors) || s.actors.length < 2 || s.actors.length > 10) throw Error('Invalid bounded team scenario')
    const plantZones = s.plantZones ? Object.fromEntries((['A', 'B'] as const).map(site => {
        const z = s.plantZones![site]
        if (!z || z.pieces !== undefined && (!Array.isArray(z.pieces) || z.pieces.length > 31)) throw Error('Invalid plant pieces')
        for (const piece of [z, ...(z.pieces || [])]) if (!piece || !n(piece.zMin, -100000, 100000) || !n(piece.zMax, -100000, 100000) || piece.zMin >= piece.zMax || !Array.isArray(piece.points) || piece.points.length < 3 || piece.points.length > 256
            || piece.points.some(p => !Array.isArray(p) || p.length !== 3 || p.some(v => !n(v, -100000, 100000)))
            || polygonProblem(piece.points.map(p => ({ x: p[0], y: p[1] })))) throw Error('Invalid plant polygon')
        if (!inPlantZone(place(s.sites[site]).point, z)) throw Error('Objective point outside its floor/area')
        const copy = (piece: PlantZone) => ({ points: piece.points.map(p => [...p] as Vec3), zMin: piece.zMin, zMax: piece.zMax })
        return [site, { ...copy(z), ...(z.pieces ? { pieces: z.pieces.map(copy) } : {}) }]
    })) as Record<'A' | 'B', PlantZone> : undefined
    const ids = new Set<string>()
    const actors = s.actors.map(a => {
        const weapon = physicalWeapon(a?.loadout?.weapon)
        if (!a || !['T', 'CT'].includes(a.side) || !['entry', 'support', 'lurk', 'anchor'].includes(a.role) || !/^(T|CT)[1-5]$/.test(a.id) || !a.id.startsWith(a.side) || ids.has(a.id) || !n(a.yaw, -180, 180) || !n(a.health, 0, 100) || !n(a.armor, 0, 100) || !Number.isInteger(a.ammo) || !n(a.ammo, 0, weapon.magazine)) throw Error('Invalid team member')
        if (a.loadout && (typeof a.loadout.weapon !== 'string' || typeof a.loadout.helmet !== 'boolean' || typeof a.loadout.kit !== 'boolean' || a.side === 'T' && a.loadout.kit)) throw Error('Invalid physical loadout')
        if (a.attributes && ![a.attributes.aim, a.attributes.reaction, a.attributes.control].every(v => n(v, 0, 1))) throw Error('Invalid physical player attributes')
        ids.add(a.id)
        return { id: a.id, side: a.side, role: a.role, start: place(a.start), station: place(a.station), yaw: a.yaw, health: a.health, armor: a.armor, ammo: a.ammo, ...(a.loadout ? { loadout: { weapon: weapon.id, helmet: a.loadout.helmet, kit: a.loadout.kit } } : {}), ...(a.attributes ? { attributes: { aim: a.attributes.aim, reaction: a.attributes.reaction, control: a.attributes.control } } : {}) }
    }).sort((a, b) => a.id.localeCompare(b.id, 'en'))
    if (['T', 'CT'].some(side => !actors.some(a => a.side === side && a.health > 0) || actors.filter(a => a.side === side).length > 5) || !actors.some(a => a.id === s.carrier && a.side === 'T' && a.health > 0)) throw Error('Both teams and a living T bomb carrier are required')
    return { version: 1, seed: s.seed, seconds: s.seconds, roundSeconds: s.roundSeconds, bombSeconds: s.bombSeconds, plantSeconds: s.plantSeconds, defuseSeconds: s.defuseSeconds, openingSeconds: s.openingSeconds, communicationMs: s.communicationMs, memorySeconds: s.memorySeconds, skill: { T: s.skill.T, CT: s.skill.CT }, economy: s.economy, guns: s.guns, initialBomb: s.initialBomb, carrier: s.carrier, objective: s.objective, sites: { A: place(s.sites?.A), B: place(s.sites?.B) }, actors, ...(plantZones ? { plantZones } : {}), ...(s.utility ? { utility: parseUtilitySetup(s.utility, actors.map(a => a.id)) } : {}) }
}
export interface Contact { enemy: string; point: Vec3; seen: number; received: number; source: string; visible: boolean; confidence: number; uncertainty: number }
export interface TeamPlan { mode: 'default' | 'execute' | 'rotate' | 'retake' | 'save'; site: 'A' | 'B'; since: number; reason: string }
export interface DecisionEvidence { side: Side; tick: number; alive: number; contactsAtSite: number; credibleEnemies: number; planted: boolean; bombSite: 'A' | 'B'; bombRemaining: number; travelSeconds: number; roundRemaining: number; openingSeconds: number; defuseSeconds: number; economy: TeamSetup['economy']; plan: TeamPlan }
/** Tactical policy accepts evidence and friendly resources only; there is no world/enemy-position parameter. */
export function chooseTeamPlan(v: DecisionEvidence): TeamPlan {
    const set = (mode: TeamPlan['mode'], site: 'A' | 'B', reason: string) => ({ mode, site, since: v.tick, reason })
    if (v.plan.mode === 'save') return v.plan
    if (v.side === 'CT' && v.planted) {
        if (v.economy !== 'commit' && v.bombRemaining <= v.travelSeconds + v.defuseSeconds + 0.25) return set('save', v.bombSite, 'Remaining bomb time cannot cover the checked route and defuse; preserve equipment.')
        return set('retake', v.bombSite, 'Public plant announcement identifies the objective; coordinate a retake.')
    }
    if (v.side === 'T' && v.planted) return set('execute', v.bombSite, 'Defend the planted bomb; do not rotate to an unused site.')
    if (v.economy === 'protect' && v.alive === 1 && v.credibleEnemies >= 2) return set('save', v.plan.site, 'One teammate remains against multiple recent reports; protect equipment.')
    if (v.side === 'T') {
        if (v.tick < v.openingSeconds * 64) return v.plan
        if (v.plan.mode !== 'rotate' && v.contactsAtSite >= 2 && v.roundRemaining > 12 && v.tick - v.plan.since >= 128) return set('rotate', v.plan.site === 'A' ? 'B' : 'A', 'Two recent communicated defenders at the planned site; use the alternate objective.')
        if (v.plan.mode === 'default') return set('execute', v.plan.site, 'Opening interval complete; entry advances with support and bomb carrier.')
    } else if (v.credibleEnemies > 0 && v.plan.mode === 'default') return set('rotate', v.plan.site, 'A delivered enemy report permits a support rotation; anchors retain their assigned angle.')
    return v.plan
}
