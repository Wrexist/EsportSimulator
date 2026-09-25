import { readFileSync } from "fs"
import { MAP_STUDIO_LIBRARY, libraryFor, mergeMapLibrary } from "@/lib/map-studio-library"
import { annotationSvg, emptyProject, MAP_OPTIONS, MAX_MARKS, parseProject, type MapFloor } from "@/lib/map-annotations"

describe("researched map library", () => {
    it("imports valid portable projects for every supported floor", () => {
        let floors = 0, lineups = 0, unplaced = 0
        for (const map of MAP_OPTIONS) for (const floor of Object.keys(map.images) as MapFloor[]) {
            const project = mergeMapLibrary(emptyProject(map.id, floor))
            expect(parseProject(JSON.stringify(project))).toEqual(project)
            const library = libraryFor(project)!
            expect(library.outlines.length).toBeGreaterThan(0)
            expect(library.outlines.every(mark => mark.kind === "wall" && mark.locked)).toBe(true)
            expect(new Set(project.marks.map(mark => mark.id)).size).toBe(project.marks.length)
            expect(library.lineups.every(mark => mark.status === "draft" && mark.source?.url?.startsWith("https://cs2nades.gg/en/map/"))).toBe(true)
            floors++; lineups += library.lineups.length; unplaced += library.unplaced.length
        }
        expect(floors).toBe(10)
        expect(lineups).toBe(628)
        expect(unplaced).toBe(16)
    })
    it("preserves all 21 current user markings exactly when adding the library", () => {
        const original = parseProject(readFileSync("docs/audit-2026-09-12/map-library/user-before-import.json", "utf8"))
        expect(original.marks).toHaveLength(21)
        const merged = mergeMapLibrary(original)
        expect(merged.marks).toHaveLength(138)
        expect(merged.marks.filter(mark => original.marks.some(old => old.id === mark.id))).toEqual(original.marks)
        expect(original.marks).toHaveLength(21)
        expect(mergeMapLibrary(merged)).toBe(merged)
        const deleted = { ...merged, marks: merged.marks.filter(mark => mark.source?.provider !== "CS2Nades") }
        expect(mergeMapLibrary(parseProject(JSON.stringify(deleted)))).toEqual(deleted)
    })
    it("retains an edited imported ID and fails capacity checks without changing work", () => {
        const imported = structuredClone(libraryFor(emptyProject())!.lineups[0])
        imported.label = "My correction"
        const doc = { ...emptyProject(), marks: [imported] }
        expect(mergeMapLibrary(doc).marks.find(mark => mark.id === imported.id)).toEqual(imported)
        const full = { ...emptyProject(), marks: Array.from({ length: MAX_MARKS }, (_, i) => ({ ...imported, id: `custom-${i}` })) }
        expect(() => mergeMapLibrary(full)).toThrow("not enough room")
        expect(full.marks).toHaveLength(MAX_MARKS)
        expect(full.libraryVersion).toBeUndefined()
    })
    it("never imports executable or unrelated source links", () => {
        const imported = libraryFor(emptyProject())!.lineups[0]
        const doc = { ...emptyProject(), marks: [{ ...imported, source: { ...imported.source, url: "javascript:alert(1)" } }] }
        expect(() => parseProject(JSON.stringify(doc))).toThrow()
    })
    it("uses compact landing dots in exports and allows full paths explicitly", () => {
        const imported = libraryFor(emptyProject())!.lineups[0]
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
    it("agrees with the auditable source coverage report", () => {
        const report = JSON.parse(readFileSync("docs/audit-2026-09-12/map-library/import-report.json", "utf8"))
        for (const [mapId, floors] of Object.entries(MAP_STUDIO_LIBRARY.maps)) {
            for (const [floor, library] of Object.entries(floors)) {
                expect(library.lineups.length).toBe(report[mapId].floors[floor].imported)
                expect(library.unplaced.length).toBe(report[mapId].floors[floor].unplaced)
            }
        }
    })
})
