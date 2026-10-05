import { readFileSync } from "fs"
import { MAP_STUDIO_LIBRARY, libraryFor, mergeMapLibrary } from "@/lib/map-studio-library"
import { annotationSvg, emptyProject, MAP_OPTIONS, MAX_MARKS, parseProject, type MapFloor, type MapMark } from "@/lib/map-annotations"

// Imported CS2Nades lineups are excluded from the 1.0 base game and archived, not shipped.
const archive = JSON.parse(readFileSync("raw-data/archived-lineups/cs2nades-2026-10-04.json", "utf8"))
const archivedLineup = (): MapMark => structuredClone(archive.maps.Mirage.upper.lineups[0])

describe("researched map library", () => {
    it("imports valid portable projects for every supported floor with outlines only", () => {
        let floors = 0
        for (const map of MAP_OPTIONS) for (const floor of Object.keys(map.images) as MapFloor[]) {
            const project = mergeMapLibrary(emptyProject(map.id, floor))
            expect(parseProject(JSON.stringify(project))).toEqual(project)
            const library = libraryFor(project)!
            expect(library.outlines.length).toBeGreaterThan(0)
            expect(library.outlines.every(mark => mark.kind === "wall" && mark.locked)).toBe(true)
            expect(new Set(project.marks.map(mark => mark.id)).size).toBe(project.marks.length)
            expect(library.lineups).toEqual([])
            expect(library.unplaced).toEqual([])
            expect(project.marks.some(mark => mark.source?.provider === "CS2Nades")).toBe(false)
            floors++
        }
        expect(floors).toBe(10)
        expect(JSON.stringify(MAP_STUDIO_LIBRARY)).not.toMatch(/cs2nades/i)
    })
    it("preserves all 21 current user markings exactly when adding the library", () => {
        const original = parseProject(readFileSync("docs/audit-2026-09-12/map-library/user-before-import.json", "utf8"))
        expect(original.marks).toHaveLength(21)
        const merged = mergeMapLibrary(original)
        expect(merged.marks).toHaveLength(22)
        expect(merged.marks.filter(mark => original.marks.some(old => old.id === mark.id))).toEqual(original.marks)
        expect(original.marks).toHaveLength(21)
        expect(mergeMapLibrary(merged)).toBe(merged)
        const deleted = { ...merged, marks: merged.marks.filter(mark => mark.source?.provider !== "radar-outline") }
        expect(mergeMapLibrary(parseProject(JSON.stringify(deleted)))).toEqual(deleted)
    })
    it("keeps imported lineups already in a user draft and re-adds nothing on the version bump", () => {
        const lineup = archivedLineup()
        const outline = libraryFor(emptyProject())!.outlines[0]
        const mine = { ...lineup, id: "mine", source: undefined, label: "My throw" }
        const old = parseProject(JSON.stringify({ ...emptyProject(), libraryVersion: "2026-09-12.1", marks: [mine, lineup] }))
        const merged = mergeMapLibrary(old)
        expect(merged.libraryVersion).toBe(MAP_STUDIO_LIBRARY.version)
        expect(merged.marks).toEqual(old.marks) // user data kept; a deleted outline is not resurrected
        expect(merged.marks.some(mark => mark.id === outline.id)).toBe(false)
        expect(mergeMapLibrary(merged)).toBe(merged)
        // Drafts that predate any library still receive the outlines, and nothing else.
        const fresh = mergeMapLibrary(parseProject(JSON.stringify({ ...emptyProject(), marks: [lineup] })))
        expect(fresh.marks.map(mark => mark.id)).toEqual([outline.id, lineup.id])
    })
    it("retains an edited imported ID and fails capacity checks without changing work", () => {
        const imported = archivedLineup()
        imported.label = "My correction"
        const doc = { ...emptyProject(), marks: [imported] }
        expect(mergeMapLibrary(doc).marks.find(mark => mark.id === imported.id)).toEqual(imported)
        const full = { ...emptyProject(), marks: Array.from({ length: MAX_MARKS }, (_, i) => ({ ...imported, id: `custom-${i}` })) }
        expect(() => mergeMapLibrary(full)).toThrow("not enough room")
        expect(full.marks).toHaveLength(MAX_MARKS)
        expect(full.libraryVersion).toBeUndefined()
    })
    it("never imports executable or unrelated source links", () => {
        const imported = archivedLineup()
        const doc = { ...emptyProject(), marks: [{ ...imported, source: { ...imported.source, url: "javascript:alert(1)" } }] }
        expect(() => parseProject(JSON.stringify(doc))).toThrow()
    })
    it("uses compact landing dots in exports and allows full paths explicitly", () => {
        const imported = archivedLineup()
        const manual = { ...imported, id: "manual", source: undefined, label: "My throw" }
        const doc = { ...emptyProject(), marks: [imported, manual] }
        const compact = annotationSvg(doc, "data:image/png;base64,AA")
        const full = annotationSvg(doc, "data:image/png;base64,AA", true)
        expect((compact.match(/<polyline /g) || []).length).toBe(1)
        expect((full.match(/<polyline /g) || []).length).toBe(2)
        expect(compact).toContain("My throw")
        const selected = annotationSvg(doc, "data:image/png;base64,AA", false, imported.id)
        expect((selected.match(/<polyline /g) || []).length).toBe(2)
    })
    it("archives every excluded record against the auditable source coverage report", () => {
        const report = JSON.parse(readFileSync("docs/audit-2026-09-12/map-library/import-report.json", "utf8"))
        let lineups = 0, unplaced = 0
        for (const [mapId, floors] of Object.entries(MAP_STUDIO_LIBRARY.maps)) {
            for (const floor of Object.keys(floors)) {
                const archived = archive.maps[mapId]?.[floor] ?? { lineups: [], unplaced: [] }
                expect(archived.lineups.length).toBe(report[mapId].floors[floor].imported)
                expect(archived.unplaced.length).toBe(report[mapId].floors[floor].unplaced)
                expect(archived.lineups.every((mark: MapMark) => mark.source?.provider === "CS2Nades")).toBe(true)
                lineups += archived.lineups.length; unplaced += archived.unplaced.length
            }
        }
        expect([lineups, unplaced]).toEqual([628, 16])
        expect(archive.counts).toEqual({ lineups, unplaced })
    })
    it("ships no imported lineups in bundled drafts and archives their original bytes", () => {
        const manifest = JSON.parse(readFileSync("raw-data/archived-lineups/README.json", "utf8"))
        expect(manifest.drafts.length).toBeGreaterThan(0)
        const marks = (doc: { marks?: MapMark[]; annotations?: { marks: MapMark[] } }) => ((doc.annotations ?? doc).marks ?? []) as MapMark[]
        for (const draft of manifest.drafts) {
            const shipped = JSON.parse(readFileSync(draft.path, "utf8")), original = JSON.parse(readFileSync(draft.archivedOriginal, "utf8"))
            expect(marks(shipped).some(mark => mark.source?.provider === "CS2Nades")).toBe(false)
            expect(marks(shipped)).toEqual(marks(original).filter(mark => mark.source?.provider !== "CS2Nades"))
            expect(marks(original).length - marks(shipped).length).toBe(draft.removedLineups)
        }
    })
})
