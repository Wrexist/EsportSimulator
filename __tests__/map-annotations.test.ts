import { annotationHistory, annotationSvg, emptyProject, parseProject, projectKey, radarSource, snapPoint, markVisuals, labelPoint, MARK_KINDS, minimumPoints, markSide, type MapMark } from "@/lib/map-annotations"
import { readFileSync } from "fs"
import { createHash } from "crypto"

const wall: MapMark = { id: "wall-1", kind: "wall", points: [{ x: 10.25, y: 20.5 }, { x: 40, y: 30 }], label: "Connector", note: "Solid boundary" }
const project = { ...emptyProject(), marks: [wall] }

describe("portable map annotations", () => {
    it("round-trips exact coordinates, labels, notes and cover details", () => {
        const doc = { ...project, marks: [wall, { ...wall, id: "window-1", kind: "window" as const, detail: "jump" as const }] }
        expect(parseProject(JSON.stringify(doc))).toEqual(doc)
    })
    it.each([
        { ...project, floor: "lower" },
        { ...project, mapId: "../private" },
        { ...project, version: 99 },
        { ...project, marks: [wall, wall] },
        { ...project, marks: [{ ...wall, points: [{ x: -1, y: 20 }, { x: 20, y: 30 }] }] },
        { ...project, marks: [{ ...wall, kind: "script" }] },
        { ...project, marks: [{ ...wall, kind: "passage", points: [...wall.points, { x: 1, y: 1 }] }] },
    ])("rejects malformed imports without mutating the open project", value => {
        expect(() => parseProject(JSON.stringify(value))).toThrow()
        expect(project.marks).toEqual([wall])
    })
    it("isolates floor drafts and resolves the exact radar image", () => {
        const upper = emptyProject("Nuke", "upper"), lower = emptyProject("Nuke", "lower")
        expect(projectKey(upper)).not.toBe(projectKey(lower))
        expect(radarSource(lower)).toBe("/maps/de_nuke_lower_radar_psd_2.png")
        expect(parseProject(JSON.stringify(lower))).toEqual(lower)
    })
    it("restores a moved marking with undo and clears redo after a new edit", () => {
        const initial = { past: [], present: project, future: [] }
        const moved = { ...project, marks: [{ ...wall, points: [{ x: 15, y: 25 }, wall.points[1]] }] }
        const changed = annotationHistory(initial, { type: "edit", project: moved })
        const undone = annotationHistory(changed, { type: "undo" })
        expect(undone.present).toEqual(project)
        expect(annotationHistory(undone, { type: "redo" }).present).toEqual(moved)
        expect(annotationHistory(undone, { type: "edit", project: emptyProject() }).future).toEqual([])
    })
    it("snaps to the nearest endpoint before grid rounding and bounds coordinates", () => {
        expect(snapPoint({ x: 10.4, y: 20.5 }, [{ x: 10.25, y: 20.5 }], 1, true)).toEqual(wall.points[0])
        expect(snapPoint({ x: -5, y: 105 }, [], 0)).toEqual({ x: 0, y: 100 })
    })
    it("escapes labels in PNG source and includes all authored lines", () => {
        const svg = annotationSvg({ ...project, marks: [{ ...wall, label: '<script>"&' }] }, "data:image/png;base64,AAAA")
        expect(svg).toContain('points="10.25,20.5 40,30"')
        expect(svg).not.toContain("<script>")
        expect(svg).toContain("&lt;script&gt;&quot;&amp;")
        expect(svg).toContain("data:image/png;base64,AAAA")
    })
    it("preserves the user's original 14-wall upload byte for byte and migrates without coordinate loss", () => {
        const raw = readFileSync("public/map-studio/drafts/mirage-user-draft-2026-09-12.json")
        expect(createHash("sha256").update(raw).digest("hex")).toBe("a61c264c82cc2e984fdc04dc78b0816d3185f818ac3664692d0f36bf2d936d46")
        const original = JSON.parse(raw.toString())
        const migrated = parseProject(raw.toString())
        expect(migrated.version).toBe(2)
        expect(migrated.marks).toHaveLength(14)
        expect(migrated.marks).toEqual(original.marks)
    })
    it.each(MARK_KINDS)("round-trips the %s tool with its minimum valid shape", kind => {
        const points = [{ x: 5, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 30 }].slice(0, minimumPoints(kind))
        const doc = { ...emptyProject(), marks: [{ ...wall, kind, points }] }
        expect(parseProject(JSON.stringify(doc))).toEqual(doc)
    })
    it("keeps throw, bounce, landing and all utility instructions through export/import and undo", () => {
        const grenade: MapMark = { ...wall, kind: "smoke", points: [...wall.points, { x: 50, y: 60 }], side: "T", radius: 4.5, throwMode: "Run + jump", aim: "Aim at the corner", status: "checked", locked: true, labelPosition: "below" }
        const doc = { ...emptyProject(), marks: [grenade] }
        expect(parseProject(JSON.stringify(doc))).toEqual(doc)
        expect(labelPoint(grenade)).toEqual({ x: 50, y: 60 })
        const circles = markVisuals(grenade).filter(shape => shape.tag === "circle")
        expect(circles).toEqual(expect.arrayContaining([expect.objectContaining({ attrs: expect.objectContaining({ cx: 50, cy: 60, r: 4.5 }) })]))
        const changed = annotationHistory({ past: [], present: doc, future: [] }, { type: "edit", project: emptyProject() })
        expect(annotationHistory(changed, { type: "undo" }).present).toEqual(doc)
    })
    it.each([
        { kind: "ctspawn", points: wall.points }, { kind: "callout", points: wall.points },
        { radius: -1 }, { radius: 16 }, { radius: "4" }, { side: "unknown" }, { locked: "yes" },
        { status: "verified-by-server" }, { throwMode: "teleport" }, { aim: 42 }, { labelPosition: "outside" },
    ])("rejects invalid tactical metadata: %j", patch => {
        expect(() => parseProject(JSON.stringify({ ...project, marks: [{ ...wall, ...patch }] }))).toThrow()
    })
    it("exports filled spawn boundaries and utility landing guides using the same primitives as the canvas", () => {
        const spawn: MapMark = { ...wall, kind: "ctspawn", points: [...wall.points, { x: 10, y: 40 }] }
        const flash: MapMark = { ...wall, id: "flash", kind: "flash", radius: 6 }
        expect(markSide(spawn)).toBe("CT")
        expect(markSide({ ...spawn, kind: "tspawn" })).toBe("T")
        expect(markVisuals(spawn)[0].tag).toBe("polygon")
        const svg = annotationSvg({ ...project, marks: [spawn, flash] }, "data:image/png;base64,AAAA")
        expect(svg).toContain("<polygon")
        expect(svg).toContain('r="6"')
        expect(svg).toContain(">F</text>")
        expect(svg).toContain("draft guides only")
    })
})
