import { MAP_LAYOUTS_ORDERED } from "@/data/map-layouts"
import { annotationSignature, parseRegistration, parseSpatialBinding, type MapRegistration, type MarkSpatialBinding, type AnnotationValidationReceipt } from '@/engine/spatial/registration'

export type MarkKind = "wall" | "passage" | "window" | "route" | "smoke" | "flash" | "he" | "fire" | "decoy" | "ctspawn" | "tspawn" | "bombsite" | "callout"
export type UtilityKind = "smoke" | "flash" | "he" | "fire" | "decoy"
export type MarkSide = "both" | "CT" | "T"
export const THROW_MODES = ["Standing", "Jump throw", "Running", "Run + jump", "Crouching", "Underhand"] as const
export type MapFloor = "upper" | "lower"
export interface MapPoint { x: number; y: number }
export interface MapMark {
    spatial?: MarkSpatialBinding
    id: string
    kind: MarkKind
    points: MapPoint[]
    label: string
    note: string
    detail?: "window" | "cover" | "jump"
    side?: MarkSide
    radius?: number
    throwMode?: typeof THROW_MODES[number]
    aim?: string
    status?: "draft" | "checked"
    locked?: boolean
    labelPosition?: "above" | "below" | "left" | "right"
    source?: { provider: "CS2Nades" | "radar-outline"; id: string; url?: string; originFloor?: MapFloor }
}
export interface MapAnnotationProject {
    registration?: MapRegistration
    validation?: AnnotationValidationReceipt
    format: "esim-map-annotations"
    version: 2
    mapId: string
    floor: MapFloor
    marks: MapMark[]
    libraryVersion?: string
    interiorBoundaryVersion?: string
}

export const MARK_TOOLS = {
    wall: { label: "Wall", plural: "Walls", color: "#ff5265", shortcut: "W", help: "Blocks walking and direct shots. Click along the wall, then finish." },
    passage: { label: "Passage", plural: "Passages", color: "#42e69b", shortcut: "G", help: "An open doorway or passage. Click its two edges." },
    window: { label: "Window / cover", plural: "Windows / cover", color: "#42baff", shortcut: "B", help: "Click two edges. Add a note for windows, low cover or jumps." },
    route: { label: "Route", plural: "Routes", color: "#ffdc5e", shortcut: "R", help: "Click a sequence of waypoints. The arrow follows your drawing direction." },
    smoke: { label: "Smoke", plural: "Smokes", color: "#bfccd9", shortcut: "S", help: "Click where you throw, then where the smoke blooms. Adjust its guide radius in Details." },
    flash: { label: "Flashbang", plural: "Flashbangs", color: "#fff2a3", shortcut: "F", help: "Click the throw position, then the airburst point. The circle is a guide, not a visibility calculation." },
    he: { label: "HE grenade", plural: "HE grenades", color: "#bd9bff", shortcut: "N", help: "Click the throw position, then the explosion point. Add bounce points if needed." },
    fire: { label: "Molotov / incendiary", plural: "Fire grenades", color: "#ff9a58", shortcut: "M", help: "Click the throw position, then the intended fire location. The footprint is approximate." },
    decoy: { label: "Decoy", plural: "Decoys", color: "#ef9ddd", shortcut: "D", help: "Click the throw position, then where the decoy lands." },
    ctspawn: { label: "CT spawn area", plural: "CT spawn areas", color: "#6aaeff", shortcut: "C", help: "Trace the CT starting area with at least three corners. Finish closes the shape." },
    tspawn: { label: "T spawn area", plural: "T spawn areas", color: "#f4cb70", shortcut: "T", help: "Trace the T starting area with at least three corners. Finish closes the shape." },
    bombsite: { label: "Bombsite area", plural: "Bombsites", color: "#f783a4", shortcut: "A", help: "Trace the plantable area, then finish. Label it A or B." },
    callout: { label: "Callout pin", plural: "Callouts", color: "#87dfd0", shortcut: "L", help: "Click once to place a named location. Add instructions in Notes." },
} as const
export const MARK_KINDS = Object.keys(MARK_TOOLS) as MarkKind[]
export const TOOL_GROUPS = {
    Geometry: ["wall", "passage", "window", "route"],
    Utility: ["smoke", "flash", "he", "fire", "decoy"],
    Areas: ["ctspawn", "tspawn", "bombsite", "callout"],
} satisfies Record<string, MarkKind[]>
export const isUtility = (kind: MarkKind): kind is UtilityKind => TOOL_GROUPS.Utility.includes(kind as UtilityKind)
export const isArea = (kind: MarkKind) => ["ctspawn", "tspawn", "bombsite"].includes(kind)
export const minimumPoints = (kind: MarkKind) => kind === "callout" ? 1 : isArea(kind) ? 3 : 2
export const markSide = (mark: MapMark): MarkSide => mark.kind === "ctspawn" ? "CT" : mark.kind === "tspawn" ? "T" : mark.side || "both"
export const labelPoint = (mark: MapMark) => isUtility(mark.kind) ? mark.points[mark.points.length - 1] : isArea(mark.kind) ? { x: mark.points.reduce((sum, p) => sum + p.x, 0) / mark.points.length, y: mark.points.reduce((sum, p) => sum + p.y, 0) / mark.points.length } : mark.points[0]
/** Keep dense native entity groups readable; selection still reveals the full source label. */
export function markDisplayLabel(mark: MapMark, selectedId?: string): string {
    if (mark.id === selectedId) return mark.label || MARK_TOOLS[mark.kind].label
    if (mark.id.startsWith('native-spawn:') || mark.id.startsWith('interior:')) return ''
    if (mark.id.startsWith('native-site:')) {
        const [, , site, part] = mark.id.split(':')
        return part === '0' ? `${site} plant zone` : ''
    }
    return mark.label || (isArea(mark.kind) ? MARK_TOOLS[mark.kind].label : '')
}
export function labelLayout(mark: MapMark) {
    const point = labelPoint(mark), placement = mark.labelPosition || "above"
    return { x: Math.max(1, Math.min(99, point.x + (placement === "left" ? -1.7 : placement === "right" ? 1.7 : 0))),
        y: Math.max(2, Math.min(99, point.y + (placement === "below" ? 3 : placement === "above" ? -1.6 : 0.5))),
        textAnchor: placement === "left" || placement !== "right" && point.x > 70 ? "end" : "start" }
}
export const MAP_OPTIONS = MAP_LAYOUTS_ORDERED.map(map => ({ id: map.mapId, name: map.mapId, images: map.radarImage }))
export const MAX_MARKS = 1000
export const MAX_POINTS = 256

export function emptyProject(mapId = "Mirage", floor: MapFloor = "upper"): MapAnnotationProject {
    return { format: "esim-map-annotations", version: 2, mapId, floor, marks: [] }
}
export function projectKey(project: Pick<MapAnnotationProject, "mapId" | "floor">) {
    return `esim:map-annotations:v1:${project.mapId}:${project.floor}`
}
export function radarSource(project: Pick<MapAnnotationProject, "mapId" | "floor">) {
    const map = MAP_OPTIONS.find(map => map.id === project.mapId)
    const image = map?.images[project.floor]
    if (!image) throw new Error("This map or floor is unavailable.")
    return `/maps/${image}.png`
}

/** Imports are portable drafts, never executable SVG or live match settings. */
export function parseProject(text: string): MapAnnotationProject {
    if (text.length > 4_000_000) throw new Error("This project is too large (maximum 4 MB).")
    let value: unknown
    try { value = JSON.parse(text) } catch { throw new Error("That file is not a valid project. Choose an exported .json file.") }
    if (!value || typeof value !== "object") throw new Error("This is not a map project.")
    const doc = value as Partial<Omit<MapAnnotationProject, "version">> & { version?: number }
    if (doc.format !== "esim-map-annotations" || ![1, 2].includes(doc.version || 0)) throw new Error("Choose a project exported by Map Studio (version 1 or 2).")
    if (doc.floor !== "upper" && doc.floor !== "lower") throw new Error("The project floor is invalid.")
    if (typeof doc.mapId !== "string") throw new Error("The project map is missing.")
    radarSource({ mapId: doc.mapId, floor: doc.floor })
    if (!Array.isArray(doc.marks) || doc.marks.length > MAX_MARKS) throw new Error(`A project can contain up to ${MAX_MARKS} markings.`)
    const ids = new Set<string>()
    const marks: MapMark[] = doc.marks.map(mark => {
        if (!mark || typeof mark !== "object" || !MARK_KINDS.includes(mark.kind)) throw new Error("A marking has an unknown type.")
        if (typeof mark.id !== "string" || !mark.id || mark.id.length > 100 || ids.has(mark.id)) throw new Error("Marking IDs must be unique.")
        ids.add(mark.id)
        if (!Array.isArray(mark.points) || mark.points.length < minimumPoints(mark.kind) || mark.points.length > MAX_POINTS) throw new Error("A marking has too few or too many points.")
        if (mark.kind === "callout" && mark.points.length !== 1) throw new Error("Callouts need exactly one point.")
        if ((mark.kind === "passage" || mark.kind === "window") && mark.points.length !== 2) throw new Error("Passages and windows need exactly two endpoints.")
        const points = mark.points.map(point => {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 100 || point.y < 0 || point.y > 100) throw new Error("A point is outside the map.")
            return { x: point.x, y: point.y }
        })
        if (typeof mark.label !== "string" || mark.label.length > 80 || typeof mark.note !== "string" || mark.note.length > 1000) throw new Error("A label or note is too long.")
        if (mark.detail && !["window", "cover", "jump"].includes(mark.detail)) throw new Error("Unknown cover type.")
        if (mark.side !== undefined && !["CT", "T", "both"].includes(mark.side)) throw new Error("Unknown team side.")
        if (mark.radius !== undefined && (!Number.isFinite(mark.radius) || mark.radius < 0.5 || mark.radius > 15)) throw new Error("Guide radius must be between 0.5 and 15 map units.")
        if (mark.throwMode !== undefined && !THROW_MODES.includes(mark.throwMode)) throw new Error("Unknown throw technique.")
        if (mark.aim !== undefined && (typeof mark.aim !== "string" || mark.aim.length > 1000)) throw new Error("Aim instructions are too long.")
        if (mark.status !== undefined && !["draft", "checked"].includes(mark.status)) throw new Error("Unknown review status.")
        if (mark.locked !== undefined && typeof mark.locked !== "boolean") throw new Error("Invalid marking lock.")
        if (mark.labelPosition !== undefined && !["above", "below", "left", "right"].includes(mark.labelPosition)) throw new Error("Unknown label placement.")
        let source: MapMark["source"]
        if (mark.source !== undefined) {
            const value = mark.source
            if (!value || !["CS2Nades", "radar-outline"].includes(value.provider) || typeof value.id !== "string" || !value.id || value.id.length > 100) throw new Error("Invalid annotation source.")
            if (value.url !== undefined && (typeof value.url !== "string" || value.url.length > 500 || !/^https:\/\/cs2nades\.gg\/en\/map\/[a-z0-9/-]+$/.test(value.url))) throw new Error("Invalid lineup source link.")
            if (value.originFloor !== undefined && !["upper", "lower"].includes(value.originFloor)) throw new Error("Invalid source floor.")
            source = { provider: value.provider, id: value.id, ...(value.url ? { url: value.url } : {}), ...(value.originFloor ? { originFloor: value.originFloor } : {}) }
        }
        return { id: mark.id, kind: mark.kind, points, label: mark.label, note: mark.note,
            ...(mark.spatial ? { spatial: parseSpatialBinding(mark.spatial) } : {}),
            ...(mark.detail ? { detail: mark.detail } : {}), ...(mark.side ? { side: mark.side } : {}),
            ...(mark.radius !== undefined ? { radius: mark.radius } : {}), ...(mark.throwMode ? { throwMode: mark.throwMode } : {}),
            ...(mark.aim !== undefined ? { aim: mark.aim } : {}), ...(mark.status ? { status: mark.status } : {}),
            ...(mark.locked !== undefined ? { locked: mark.locked } : {}),
            ...(mark.labelPosition ? { labelPosition: mark.labelPosition } : {}),
            ...(source ? { source } : {}),
        }
    })
    if (doc.libraryVersion !== undefined && (typeof doc.libraryVersion !== "string" || doc.libraryVersion.length > 80)) throw new Error("Invalid library version.")
    if (doc.interiorBoundaryVersion !== undefined && (typeof doc.interiorBoundaryVersion !== "string" || doc.interiorBoundaryVersion.length > 80)) throw new Error("Invalid interior boundary version.")
    const project: MapAnnotationProject = { format: "esim-map-annotations", version: 2, mapId: doc.mapId, floor: doc.floor, marks, ...(doc.libraryVersion ? { libraryVersion: doc.libraryVersion } : {}), ...(doc.registration ? { registration: parseRegistration(doc.registration) } : {}) }
    if (doc.interiorBoundaryVersion) project.interiorBoundaryVersion = doc.interiorBoundaryVersion
    if (project.registration && project.registration.sourceRadar !== radarSource(project)) throw Error('Registration uses a different annotation radar')
    const v = doc.validation
    if (v && v.version === 1 && v.signature === annotationSignature(project) && Number.isInteger(v.errors) && v.errors >= 0 && Number.isInteger(v.warnings) && v.warnings >= 0 && ['blocked', 'review-ready'].includes(v.state)) project.validation = { version: 1, signature: v.signature, errors: v.errors, warnings: v.warnings, state: v.state }
    return project
}

export interface AnnotationHistory { past: MapAnnotationProject[]; present: MapAnnotationProject; future: MapAnnotationProject[] }
export type HistoryAction = { type: "edit" | "load"; project: MapAnnotationProject } | { type: "undo" | "redo" }
export function annotationHistory(state: AnnotationHistory, action: HistoryAction): AnnotationHistory {
    if (action.type === "load") return { past: [], present: action.project, future: [] }
    if (action.type === "edit") {
        if (action.project.validation && action.project.validation.signature !== annotationSignature(action.project)) action = { ...action, project: { ...action.project, validation: undefined } }
        if (JSON.stringify(action.project) === JSON.stringify(state.present)) return state
        return { past: [...state.past, state.present].slice(-100), present: action.project, future: [] }
    }
    if (action.type === "undo" && state.past.length) return { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future] }
    if (action.type === "redo" && state.future.length) return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) }
    return state
}

export function snapPoint(point: MapPoint, endpoints: MapPoint[], threshold: number, grid = false): MapPoint {
    const bounded = { x: Math.max(0, Math.min(100, point.x)), y: Math.max(0, Math.min(100, point.y)) }
    const nearest = endpoints.reduce<MapPoint | undefined>((best, candidate) => Math.hypot(candidate.x - bounded.x, candidate.y - bounded.y) <= threshold && (!best || Math.hypot(candidate.x - bounded.x, candidate.y - bounded.y) < Math.hypot(best.x - bounded.x, best.y - bounded.y)) ? candidate : best, undefined)
    if (nearest) return { ...nearest }
    return grid ? { x: Math.round(bounded.x), y: Math.round(bounded.y) } : { x: +bounded.x.toFixed(3), y: +bounded.y.toFixed(3) }
}

/** Escape authored labels when writing the standalone SVG used by PNG export. */
const escapeXml = (text: string) => text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!))
/** Shared primitives keep the editable canvas and exported image identical. */
export interface MarkVisual { tag: "polyline" | "polygon" | "circle" | "text"; attrs: Record<string, string | number>; text?: string }
export function markVisuals(mark: MapMark, zoom = 1, compact = false): MarkVisual[] {
    const nativeSpawn = mark.kind === 'callout' && mark.id.startsWith('native-spawn:')
    const color = nativeSpawn ? MARK_TOOLS[mark.side === 'CT' ? 'ctspawn' : 'tspawn'].color : MARK_TOOLS[mark.kind].color
    const points = mark.points.map(p => `${p.x},${p.y}`).join(" ")
    const strokeWidth = 0.45 / Math.sqrt(zoom)
    const base = { stroke: color, strokeWidth, strokeLinecap: "round", strokeLinejoin: "round" }
    const text = (x: number, y: number, value: string): MarkVisual => ({ tag: "text", attrs: { x, y, fill: "#10202c", fontSize: 1.2, fontWeight: 700, textAnchor: "middle", dominantBaseline: "central", fontFamily: "Arial,sans-serif" }, text: value })
    if (compact && isUtility(mark.kind)) {
        const end = mark.points[mark.points.length - 1]
        return [{ tag: "circle", attrs: { cx: end.x, cy: end.y, r: 0.75 / Math.sqrt(zoom), fill: color, stroke: "#101923", strokeWidth: 0.15 } }]
    }
    if (isArea(mark.kind)) return [{ tag: "polygon", attrs: { ...base, points, fill: color, fillOpacity: 0.13, strokeDasharray: "1.2 0.6" } }]
    if (nativeSpawn) return [{ tag: 'circle', attrs: { cx: mark.points[0].x, cy: mark.points[0].y, r: 0.42, fill: color, stroke: '#101923', strokeWidth: 0.12 } }]
    if (mark.kind === "callout") return [{ tag: "circle", attrs: { cx: mark.points[0].x, cy: mark.points[0].y, r: 0.9, fill: color } }, text(mark.points[0].x, mark.points[0].y, "+")]
    const visuals: MarkVisual[] = [{ tag: "polyline", attrs: { ...base, points, fill: "none", ...(mark.kind === "window" || isUtility(mark.kind) ? { strokeDasharray: "1 0.6" } : {}) } }]
    if (mark.kind === "route" || isUtility(mark.kind)) {
        const end = mark.points[mark.points.length - 1], prev = mark.points[mark.points.length - 2]
        const angle = Math.atan2(end.y - prev.y, end.x - prev.x), size = 1.5 / Math.sqrt(zoom)
        const wing = (offset: number) => `${end.x - Math.cos(angle + offset) * size},${end.y - Math.sin(angle + offset) * size}`
        visuals.push({ tag: "polygon", attrs: { points: `${end.x},${end.y} ${wing(0.5)} ${wing(-0.5)}`, fill: color } })
    }
    if (isUtility(mark.kind)) {
        const start = mark.points[0], end = mark.points[mark.points.length - 1], radius = mark.radius ?? 3
        visuals.unshift({ tag: "circle", attrs: { cx: end.x, cy: end.y, r: radius, stroke: color, strokeWidth: 0.18, strokeDasharray: "0.5 0.5", fill: color, fillOpacity: 0.12 } })
        visuals.push({ tag: "circle", attrs: { cx: start.x, cy: start.y, r: 0.75, fill: "#14202d", stroke: color, strokeWidth: 0.3 } })
        mark.points.slice(1, -1).forEach(p => visuals.push({ tag: "circle", attrs: { cx: p.x, cy: p.y, r: 0.4, fill: color } }))
        visuals.push({ tag: "circle", attrs: { cx: end.x, cy: end.y, r: 1.1, fill: color } }, text(end.x, end.y, { smoke: "S", flash: "F", he: "HE", fire: "M", decoy: "D" }[mark.kind]))
    }
    return visuals
}
export function annotationSvg(project: MapAnnotationProject, imageDataUrl: string, allLibraryPaths = false, selectedId?: string): string {
    const marks = project.marks.map(mark => {
        const mid = labelLayout(mark)
        const label = markDisplayLabel(mark, selectedId)
        const compact = mark.source?.provider === "CS2Nades" && !allLibraryPaths && mark.id !== selectedId
        const shapes = markVisuals(mark, 1, compact).map(shape => `<${shape.tag} ${Object.entries(shape.attrs).map(([key, value]) => `${key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}="${escapeXml(String(value))}"`).join(" ")}>${escapeXml(shape.text || "")}</${shape.tag}>`).join("")
        return shapes + (label && !compact ? `<text x="${mid.x}" y="${mid.y}" text-anchor="${mid.textAnchor}" fill="white" stroke="#101923" stroke-width="0.5" paint-order="stroke" font-size="1.4" font-family="Arial,sans-serif">${escapeXml(label)}</text>` : "")
    }).join("")
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1660" viewBox="0 0 100 108"><rect width="100" height="108" fill="#111923"/><image href="${escapeXml(imageDataUrl)}" x="0" y="5" width="100" height="100"/><text x="2" y="3" fill="white" font-size="2" font-family="Arial,sans-serif">${escapeXml(project.mapId)} · ${project.floor} · Map Studio draft</text><g transform="translate(0 5)">${marks}</g><text x="2" y="106.2" fill="#cbd5e1" font-size="1.05" font-family="Arial,sans-serif">RED walls · GREEN passages · BLUE cover · YELLOW routes · CT blue / T gold areas</text><text x="2" y="107.6" fill="#cbd5e1" font-size="1.05" font-family="Arial,sans-serif">Utility: gray smoke / yellow flash / orange fire. Dots = targets. CS2Nades library; draft guides only.</text></svg>`
}
