import raw from "@/data/map-studio-library.json"
import interiorRaw from "@/data/map-interior-boundaries.json"
import { MAX_MARKS, type MapAnnotationProject, type MapMark, type MarkKind } from "./map-annotations"

interface UnplacedLineup { id: string; label: string; url: string; kind: MarkKind | null; reason: string }
interface FloorLibrary { outlines: MapMark[]; lineups: MapMark[]; unplaced: UnplacedLineup[] }
interface MapLibrary { version: string; maps: Record<string, Partial<Record<"upper" | "lower", FloorLibrary>>> }
export const MAP_STUDIO_LIBRARY = raw as unknown as MapLibrary
export const INTERIOR_BOUNDARIES = interiorRaw as unknown as { version: string; maps: Record<string, Partial<Record<"upper" | "lower", MapMark[]>>> }
export const libraryFor = (project: Pick<MapAnnotationProject, "mapId" | "floor">) => MAP_STUDIO_LIBRARY.maps[project.mapId]?.[project.floor]

/** Add the snapshot once. Preserve user marks and never resurrect later deletions. */
export function mergeMapLibrary(project: MapAnnotationProject): MapAnnotationProject {
    const library = libraryFor(project)
    const interiors = INTERIOR_BOUNDARIES.maps[project.mapId]?.[project.floor]
    const addLibrary = !!library && project.libraryVersion !== MAP_STUDIO_LIBRARY.version
    const addInteriors = !!interiors && project.interiorBoundaryVersion !== INTERIOR_BOUNDARIES.version
    if (!addLibrary && !addInteriors) return project
    const ids = new Set(project.marks.map(mark => mark.id))
    const outlines = [...(addLibrary ? library!.outlines : []), ...(addInteriors ? interiors! : [])].filter(mark => !ids.has(mark.id))
    const lineups = (addLibrary ? library!.lineups : []).filter(mark => !ids.has(mark.id))
    if (project.marks.length + outlines.length + lineups.length > MAX_MARKS) throw new Error("There is not enough room to merge the library. Your draft is preserved; export a backup and free some markings first.")
    // A separate receipt prevents this additive update resurrecting deleted
    // utility guides or overwriting user-edited boundaries in existing drafts.
    const merged = { ...project, ...(addLibrary ? { libraryVersion: MAP_STUDIO_LIBRARY.version } : {}), ...(addInteriors ? { interiorBoundaryVersion: INTERIOR_BOUNDARIES.version } : {}), marks: [...structuredClone(outlines), ...project.marks, ...structuredClone(lineups)] }
    if (outlines.length || lineups.length) delete merged.validation
    return merged
}
