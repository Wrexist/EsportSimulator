import { parseTeamSetup, type TeamSetup } from '@/engine/spatial/team-model'
import type { NavLocation, SpatialLink } from "@/engine/spatial/navigation"
import type { SpatialReference } from "@/engine/spatial/types"
import { NavigationMesh } from "@/engine/spatial/navigation"
import { distance3 } from "@/engine/spatial/types"
import { parseProject, type MapAnnotationProject } from './map-annotations'
import { registrationMatches } from '@/engine/spatial/registration'
import { parseEncounterSettings, type EncounterSettings } from '@/engine/spatial/encounter'
import { parseUtilitySetup, type UtilitySetup } from '@/engine/spatial/utility'

export interface LabSettings { height: 54 | 72; speed: 130 | 220; ladders: boolean; jumps?: boolean; drops?: boolean }
export const DEFAULT_LAB_SETTINGS: LabSettings = { height: 72, speed: 220, ladders: true }
export interface LabProject { format: "esim-spatial-lab"; version: 1; mapId: string; sourceVersion: string; a: NavLocation | null; b: NavLocation | null; blocked: number[]; links: SpatialLink[]; settings: LabSettings; annotations?: MapAnnotationProject; occupied?: NavLocation[]; encounter?: EncounterSettings; utility?: UtilitySetup; teams?: TeamSetup }
export const emptyLabProject = (ref: SpatialReference): LabProject => ({ format: "esim-spatial-lab", version: 1, mapId: ref.mapId, sourceVersion: ref.sourceVersion, a: null, b: null, blocked: [], links: [], settings: { ...DEFAULT_LAB_SETTINGS } })
export const labKey = (mapId: string) => `esim:spatial-lab:v1:${mapId}`
export function parseLabProject(raw: string, reference: SpatialReference): LabProject {
    if (raw.length > 250_000) throw new Error("Lab project is too large")
    const p = JSON.parse(raw) as LabProject
    if (!p || p.format !== "esim-spatial-lab" || p.version !== 1 || p.mapId !== reference.mapId || p.sourceVersion !== reference.sourceVersion) throw new Error("Choose a lab project for this map and reference version")
    const nav = new NavigationMesh(reference)
    const annotations = p.annotations ? parseProject(JSON.stringify(p.annotations)) : undefined
    const encounter = p.encounter === undefined ? undefined : parseEncounterSettings(p.encounter)
    const teams = p.teams === undefined ? undefined : parseTeamSetup(p.teams, nav)
    const utility = p.utility === undefined ? undefined : parseUtilitySetup(p.utility)
    if (annotations && !registrationMatches(annotations, reference)) throw Error('Embedded annotations use a different map or reference')
    const valid = (location: NavLocation) => location && Number.isInteger(location.area) && Array.isArray(location.point) && location.point.length === 3 && location.point.every(Number.isFinite) && nav.validLocation(location)
    if ((p.a !== null && !valid(p.a)) || (p.b !== null && !valid(p.b))) throw new Error("An endpoint is outside its navigation surface")
    if (p.occupied !== undefined && (!Array.isArray(p.occupied) || p.occupied.length > 10 || p.occupied.some(p => !valid(p)))) throw Error('Invalid teammate reservations')
    if (!Array.isArray(p.blocked) || p.blocked.length > reference.areas.length || p.blocked.some(id => !nav.areas.has(id))) throw new Error("Invalid blocked area list")
    if (!Array.isArray(p.links) || p.links.length > 100) throw new Error("Too many authored connections")
    const settings = p.settings === undefined ? DEFAULT_LAB_SETTINGS : p.settings
    if (!settings || ![54, 72].includes(settings.height) || ![130, 220].includes(settings.speed) || typeof settings.ladders !== "boolean") throw new Error("Invalid movement settings")
    if ([settings.jumps, settings.drops].some(v => v !== undefined && typeof v !== 'boolean')) throw Error('Invalid airborne preview settings')
    const ids = new Set<string>()
    for (const link of p.links) {
        if (!link || typeof link.id !== "string" || link.id.length > 100 || ids.has(link.id) || !["walk", "step", "ladder", "jump", "drop"].includes(link.kind) || !valid({ area: link.from, point: link.start }) || !valid({ area: link.to, point: link.end }) || distance3(link.start, link.end) > 512) throw new Error("Invalid authored connection")
        if ((link.kind === 'walk' || link.kind === 'step') && Math.abs(link.start[2] - link.end[2]) > 20) throw new Error("Height changes above 20 units need an explicit traversal connection")
        if (link.kind === 'walk' && !nav.supportedSegment(link.start, link.end)) throw Error('A walking connection crosses unsupported ground. Use a reviewed height transition instead.')
        if (link.kind === 'step' && Math.hypot(link.start[0] - link.end[0], link.start[1] - link.end[1]) > 4) throw Error('A step must join adjacent surface edges')
        ids.add(link.id)
    }
    // Whitelist portable data instead of retaining arbitrary imported properties.
    const location = (value: NavLocation | null): NavLocation | null => value ? { area: value.area, point: [...value.point] } : null
    return { ...emptyLabProject(reference), a: location(p.a), b: location(p.b), blocked: [...new Set(p.blocked)], links: p.links.map(l => ({ id: l.id, from: l.from, to: l.to, start: [...l.start], end: [...l.end], kind: l.kind })), settings: { height: settings.height, speed: settings.speed, ladders: settings.ladders, ...(settings.jumps !== undefined ? { jumps: settings.jumps } : {}), ...(settings.drops !== undefined ? { drops: settings.drops } : {}) }, ...(annotations ? { annotations } : {}), ...(p.occupied ? { occupied: p.occupied.map(p => location(p)!) } : {}), ...(encounter ? { encounter } : {}), ...(utility ? { utility } : {}), ...(teams ? { teams } : {}) }
}
