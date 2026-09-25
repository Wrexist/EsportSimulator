"use client"

import { createElement, useCallback, useEffect, useReducer, useRef, useState } from "react"
import { MapPointEditor } from "./MapPointEditor"
import { MapCoordinateInput } from "./MapCoordinateInput"
import Link from "next/link"
import { ArrowLeft, ArrowUpRight, Check, Download, Eye, EyeOff, Hand, MousePointer2, Plus, Minus, Redo2, Undo2, Upload, Trash2, X, Maximize, HelpCircle, Pencil } from "lucide-react"
import { annotationHistory, annotationSvg, emptyProject, MAP_OPTIONS, MARK_KINDS, MARK_TOOLS, MAX_MARKS, MAX_POINTS, parseProject, projectKey, radarSource, snapPoint, isUtility, isArea, minimumPoints, markSide, markVisuals, labelPoint, labelLayout, markDisplayLabel, TOOL_GROUPS, THROW_MODES, type MarkSide, type MapAnnotationProject, type MapFloor, type MapMark, type MapPoint, type MarkKind } from "@/lib/map-annotations"
import { MIRAGE_UTILITY_TEMPLATES, MIRAGE_UTILITY_SOURCE } from "@/lib/map-utility-templates"
import { libraryFor, mergeMapLibrary } from "@/lib/map-studio-library"
import styles from "./map-editor.module.css"
import { MapValidationPanel } from './MapValidationPanel'
import type { SpatialReference } from '@/engine/spatial/types'
import nativeDrafts from '@/data/native-map-drafts.json'

type Tool = MarkKind | "select" | "pan" | "erase"
type View = { zoom: number; x: number; y: number }
const LAST_PROJECT = "esim:map-annotations:last"
const INITIAL_VIEW: View = { zoom: 1, x: 0, y: 0 }
const DRAW_TOOLS = new Set<string>(MARK_KINDS)

function loadStoredProject(mapId: string, floor: MapFloor) {
    const key = projectKey({ mapId, floor })
    const raw = localStorage.getItem(key)
    const previous = raw ? parseProject(raw) : emptyProject(mapId, floor)
    const merged = mergeMapLibrary(previous)
    if (merged !== previous) {
        if (raw && previous.marks.length && !localStorage.getItem(`${key}:before-library`)) localStorage.setItem(`${key}:before-library`, raw)
        if (raw && merged.interiorBoundaryVersion !== previous.interiorBoundaryVersion) localStorage.setItem(`${key}:before-interiors:${merged.interiorBoundaryVersion}`, raw)
        localStorage.setItem(key, JSON.stringify(merged))
    }
    return merged
}

function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url; link.download = filename; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function MapAnnotationEditor() {
    const [history, dispatch] = useReducer(annotationHistory, { past: [], present: emptyProject(), future: [] })
    const project = history.present
    const [ready, setReady] = useState(false)
    const [saveBlocked, setSaveBlocked] = useState(false)
    const [saveStatus, setSaveStatus] = useState("Opening your draftâ€¦")
    const [message, setMessage] = useState("")
    const [tool, setTool] = useState<Tool>("wall")
    const [draft, setDraft] = useState<MapPoint[]>([])
    const [hover, setHover] = useState<MapPoint | null>(null)
    const [selected, setSelected] = useState<string | null>(null)
    const [preview, setPreview] = useState<MapMark | null>(null)
    const [view, setView] = useState<View>(INITIAL_VIEW)
    const [hidden, setHidden] = useState<Set<MarkKind>>(new Set())
    const [snap, setSnap] = useState(true)
    const [grid, setGrid] = useState(false)
    const [opacity, setOpacity] = useState(85)
    const [labels, setLabels] = useState(true)
    const [help, setHelp] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [imageError, setImageError] = useState(false)
    const [spacePan, setSpacePan] = useState(false)
    const [group, setGroup] = useState<keyof typeof TOOL_GROUPS>("Utility")
    const [bounces, setBounces] = useState(false)
    const [template, setTemplate] = useState("")
    const [search, setSearch] = useState("")
    const [sideFilter, setSideFilter] = useState<MarkSide>("both")
    const [draftLibrary, setDraftLibrary] = useState(false)
    const [nativeDraftSelection, setNativeDraftSelection] = useState('')
    const [showLibraryPaths, setShowLibraryPaths] = useState(false)
    const [referenceOverlay, setReferenceOverlay] = useState<SpatialReference | null>(null)
    const [originFilter, setOriginFilter] = useState("all")
    const [kindFilter, setKindFilter] = useState("all")
    const svg = useRef<SVGSVGElement>(null)
    const world = useRef<SVGGElement>(null)
    const fileInput = useRef<HTMLInputElement>(null)
    const ignoreClick = useRef(false)
    const drag = useRef<{ mode: "pan" | "point" | "mark"; start: MapPoint; view: View; mark?: MapMark; index?: number; next?: MapMark } | null>(null)
    const current = useRef(project)
    current.current = project
    const selectedMark = project.marks.find(mark => mark.id === selected)
    const map = MAP_OPTIONS.find(map => map.id === project.mapId)!
    const source = radarSource(project)
    const library = libraryFor(project)
    const nativeDraft = nativeDrafts.find(entry => entry.project === nativeDraftSelection) || nativeDrafts.find(entry => entry.mapId === project.mapId && entry.floor === project.floor) || nativeDrafts[0]

    const persist = useCallback((doc: MapAnnotationProject) => {
        try {
            localStorage.setItem(projectKey(doc), JSON.stringify(doc))
            localStorage.setItem(LAST_PROJECT, JSON.stringify({ mapId: doc.mapId, floor: doc.floor }))
            setSaveStatus("Saved on this device")
        } catch { setSaveStatus("Could not save here â€” download your project"); }
    }, [])

    useEffect(() => {
        try {
            const last = localStorage.getItem(LAST_PROJECT)
            const target = last ? JSON.parse(last) as { mapId: string; floor: MapFloor } : { mapId: "Mirage", floor: "upper" as const }
            radarSource(target)
            dispatch({ type: "load", project: loadStoredProject(target.mapId, target.floor) })
            // Seed every supported floor once; a damaged unrelated draft stays untouched.
            const skipped: string[] = []
            for (const map of MAP_OPTIONS) for (const floor of Object.keys(map.images) as MapFloor[]) {
                if (target.mapId === map.id && target.floor === floor) continue
                try { loadStoredProject(map.id, floor) } catch { skipped.push(`${map.id} ${floor}`) }
            }
            if (skipped.length) setMessage(`Library could not be merged into these preserved drafts: ${skipped.join(", ")}.`)
            setTool("select")
        } catch { setSaveBlocked(true); setMessage("Your saved draft could not be opened. It has been preserved. Import a backup or download it using Recover draft.") }
        setReady(true)
    }, [])
    useEffect(() => { if (ready && !saveBlocked) persist(project) }, [project, ready, saveBlocked, persist])
    useEffect(() => {
        if (!ready || saveBlocked) return
        const flush = () => persist(current.current)
        window.addEventListener("pagehide", flush)
        return () => { flush(); window.removeEventListener("pagehide", flush) }
    }, [ready, saveBlocked, persist])
    useEffect(() => { setImageError(false) }, [source])

    const edit = (marks: MapMark[]) => dispatch({ type: "edit", project: { ...project, marks } })
    const chooseTool = (next: Tool) => {
        if (draft.length) { setMessage("Finish or cancel your current line before changing tools."); return }
        setTool(next); setMessage(""); setTemplate("")
        if (DRAW_TOOLS.has(next)) { setSearch(""); setSideFilter("both"); setOriginFilter("all"); setKindFilter("all"); setGroup((Object.keys(TOOL_GROUPS) as (keyof typeof TOOL_GROUPS)[]).find(key => (TOOL_GROUPS[key] as string[]).includes(next))!) }
        if (DRAW_TOOLS.has(next)) setHidden(prev => { const nextSet = new Set(prev); nextSet.delete(next as MarkKind); return nextSet })
    }
    const newMark = (kind: MarkKind, points: MapPoint[]): MapMark => {
        const preset = MIRAGE_UTILITY_TEMPLATES.find(item => item.label === template && item.kind === kind)
        return { id: crypto.randomUUID(), kind, points, label: preset?.label || (isArea(kind) ? MARK_TOOLS[kind].label : ""), note: preset?.note || "", status: "draft",
            ...(kind === "window" ? { detail: "window" as const } : {}),
            ...(isUtility(kind) ? { radius: 3, side: preset?.side || "both", throwMode: "Standing" as const, aim: "" } : {}),
        }
    }
    const finish = () => {
        if (!DRAW_TOOLS.has(tool) || draft.length < minimumPoints(tool as MarkKind)) return
        if (project.marks.length >= MAX_MARKS) { setMessage(`This draft has reached ${MAX_MARKS} markings.`); return }
        const mark = newMark(tool as MarkKind, draft)
        edit([...project.marks, mark]); setDraft([]); setSelected(mark.id); setMessage("")
    }
    const removeSelected = () => { if (selectedMark?.locked) { setMessage("Unlock this marking before deleting it."); return } if (selected) { edit(project.marks.filter(mark => mark.id !== selected)); setSelected(null) } }
    const updateMark = (updated: MapMark) => edit(project.marks.map(mark => mark.id === updated.id ? updated : mark))
    const focusMark = (mark: MapMark) => {
        const xs = mark.points.map(p => p.x), ys = mark.points.map(p => p.y)
        const zoom = Math.min(4, 75 / Math.max(20, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)))
        setView({ zoom, x: 50 - (Math.min(...xs) + Math.max(...xs)) / 2 * zoom, y: 50 - (Math.min(...ys) + Math.max(...ys)) / 2 * zoom })
    }
    const duplicateSelected = () => {
        if (!selectedMark || project.marks.length >= MAX_MARKS) return
        const dx = Math.max(...selectedMark.points.map(p => p.x)) <= 98 ? 2 : -2
        const dy = Math.max(...selectedMark.points.map(p => p.y)) <= 98 ? 2 : -2
        const copy = { ...selectedMark, id: crypto.randomUUID(), locked: false, status: "draft" as const, label: `${selectedMark.label || MARK_TOOLS[selectedMark.kind].label} copy`.slice(0, 80), points: selectedMark.points.map(p => ({ x: Math.max(0, p.x + dx), y: Math.max(0, p.y + dy) })) }
        edit([...project.marks, copy]); setSelected(copy.id); setTool("select")
    }

    const pointAt = (clientX: number, clientY: number, local = true): MapPoint => {
        const matrix = (local ? world.current : svg.current)?.getScreenCTM()
        if (!matrix) return { x: 0, y: 0 }
        const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
        return { x: point.x, y: point.y }
    }
    const snapped = (point: MapPoint, excludedId?: string) => snapPoint(point,
        snap ? [...project.marks.filter(mark => mark.id !== excludedId && !hidden.has(mark.kind)).flatMap(mark => mark.points), ...draft] : [],
        0.8 / view.zoom, snap && grid)
    const zoomAt = useCallback((factor: number, anchor = { x: 50, y: 50 }) => setView(previous => {
        const zoom = Math.max(1, Math.min(6, previous.zoom * factor))
        return { zoom, x: anchor.x - (anchor.x - previous.x) * zoom / previous.zoom, y: anchor.y - (anchor.y - previous.y) * zoom / previous.zoom }
    }), [])
    useEffect(() => {
        const element = svg.current
        if (!element) return
        const wheel = (event: WheelEvent) => { event.preventDefault(); zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, pointAt(event.clientX, event.clientY, false)) }
        element.addEventListener("wheel", wheel, { passive: false })
        return () => element.removeEventListener("wheel", wheel)
    }, [zoomAt])

    useEffect(() => {
        const keydown = (event: KeyboardEvent) => {
            if ((event.target as HTMLElement)?.closest("input,textarea,select,[contenteditable=true]")) return
            if (event.code === "Space") { if ((event.target as HTMLElement)?.closest("button,a,[role=button]")) return; event.preventDefault(); setSpacePan(true); return }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); if (!draft.length) dispatch({ type: event.shiftKey ? "redo" : "undo" }); return }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); if (!draft.length) dispatch({ type: "redo" }); return }
            if (event.ctrlKey || event.metaKey || event.altKey) return
            if (event.key === "Escape") { setDraft([]); setSelected(null); setHelp(false); return }
            if (event.key === "Enter" && draft.length && !(event.target as HTMLElement)?.closest("button,a")) { event.preventDefault(); finish(); return }
            if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); if (draft.length) setDraft(draft.slice(0, -1)); else removeSelected(); return }
            const tools: Record<string, Tool> = { v: "select", h: "pan", e: "erase", ...Object.fromEntries(MARK_KINDS.map(kind => [MARK_TOOLS[kind].shortcut.toLowerCase(), kind])) }
            const next = tools[event.key.toLowerCase()]
            if (next) { event.preventDefault(); chooseTool(next) }
            if (event.key === "+" || event.key === "=") zoomAt(1.25)
            if (event.key === "-") zoomAt(0.8)
            if (event.key === "0") setView(INITIAL_VIEW)
        }
        const keyup = (event: KeyboardEvent) => { if (event.code === "Space") setSpacePan(false) }
        const blur = () => setSpacePan(false)
        window.addEventListener("keydown", keydown); window.addEventListener("keyup", keyup); window.addEventListener("blur", blur)
        return () => { window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); window.removeEventListener("blur", blur) }
        // Each handler intentionally uses the current drawing and history state.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project, selected, draft, tool, template, zoomAt])

    const loadMap = (mapId: string, floor: MapFloor) => {
        try {
            const next = loadStoredProject(mapId, floor)
            dispatch({ type: "load", project: next }); setSelected(null); setDraft([]); setView(INITIAL_VIEW); setSaveBlocked(false); setMessage(""); setTemplate(""); setSearch(""); setSideFilter("both"); setOriginFilter("all"); setKindFilter("all")
        } catch { setMessage("That map's saved draft could not be opened. Your current work is still here.") }
    }
    const recoverDraft = () => {
        try {
            const last = JSON.parse(localStorage.getItem(LAST_PROJECT) || "{}")
            const raw = localStorage.getItem(projectKey(last))
            if (raw) download(new Blob([raw], { type: "application/json" }), "recovered-map-draft.json")
            else setMessage("No stored draft was found. Import an exported project to continue.")
        } catch { setMessage("Storage is unavailable. You can still export and import your work.") }
    }
    const openProject = (original: MapAnnotationProject) => {
            const incoming = mergeMapLibrary(original)
            if (saveBlocked) recoverDraft()
            if (project.marks.length) download(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }), `${project.mapId.toLowerCase()}-before-import-${Date.now()}.json`)
            if (projectKey(incoming) !== projectKey(project)) {
                const targetDraft = localStorage.getItem(projectKey(incoming))
                if (targetDraft) download(new Blob([targetDraft], { type: "application/json" }), `${incoming.mapId.toLowerCase()}-previous-draft-${Date.now()}.json`)
                dispatch({ type: "load", project: targetDraft ? parseProject(targetDraft) : emptyProject(incoming.mapId, incoming.floor) })
            }
            dispatch({ type: "edit", project: incoming })
            setSaveBlocked(false); setSelected(null); setDraft([]); setView(INITIAL_VIEW); setHidden(new Set()); setSearch(""); setSideFilter("both"); setTemplate(""); setOriginFilter("all"); setKindFilter("all")
            setMessage(`Opened ${incoming.mapId} / ${incoming.marks.length} markings. Your previous work was backed up if it contained markings. Undo restores the previous draft.`)
    }
    const importFile = async (file?: File) => {
        if (!file) return
        try {
            if (file.size > 4_000_000) throw new Error("Choose a project smaller than 4 MB.")
            openProject(parseProject(await file.text()))
        } catch (error) { setMessage(error instanceof Error ? error.message : "Could not open the project.") }
    }
    const openSavedDraft = async (edition: 'latest' | 'registered' | 'routes' | 'native' = 'latest') => {
        try {
            const response = await fetch(edition === 'native' ? '/map-studio/drafts/mirage-v13-native-sites.json' : edition === 'registered' ? '/map-studio/drafts/mirage-registered-review.json' : edition === 'routes' ? '/map-studio/drafts/mirage-v13-with-reference-routes.json' : '/map-studio/drafts/mirage-user-v13-2026-09-22.json')
            if (!response.ok) throw new Error("The saved draft is unavailable.")
            openProject(parseProject(await response.text())); setDraftLibrary(false)
        } catch (error) { setMessage(error instanceof Error ? error.message : "Could not open the saved draft.") }
    }
    const openNativeDraft = async () => {
        try {
            const response = await fetch(nativeDraft.project)
            if (!response.ok) throw new Error('The native reference draft is unavailable.')
            openProject(parseProject(await response.text())); setDraftLibrary(false)
        } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not open the native reference.') }
    }
    const exportPng = async () => {
        setExporting(true)
        try {
            const response = await fetch(source)
            if (!response.ok) throw new Error("The map image could not be loaded.")
            const blob = await response.blob()
            const imageData = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob) })
            const vectorUrl = URL.createObjectURL(new Blob([annotationSvg(project, imageData, showLibraryPaths, selected || undefined)], { type: "image/svg+xml" }))
            try {
                const image = new Image(); image.src = vectorUrl; await image.decode()
                const canvas = document.createElement("canvas"); canvas.width = 1536; canvas.height = 1660
                const context = canvas.getContext("2d"); if (!context) throw new Error("PNG export is unavailable in this browser.")
                context.drawImage(image, 0, 0)
                const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not create PNG.")), "image/png"))
                download(png, `${project.mapId.toLowerCase()}-${project.floor}-annotations.png`)
                setMessage("PNG downloaded with all layers. Download the project too if you want to edit it later.")
            } finally { URL.revokeObjectURL(vectorUrl) }
        } catch (error) { setMessage(error instanceof Error ? error.message : "PNG export failed. Your draft is still saved.") }
        finally { setExporting(false) }
    }

    const onCanvasClick = (event: React.MouseEvent<SVGSVGElement>) => {
        if (ignoreClick.current) { ignoreClick.current = false; return }
        if (event.detail > 1) return
        addPoint(pointAt(event.clientX, event.clientY))
    }
    const addPoint = (raw: MapPoint) => {
        if (!ready || saveBlocked || !DRAW_TOOLS.has(tool) || imageError) return
        if (raw.x < 0 || raw.x > 100 || raw.y < 0 || raw.y > 100) return
        const point = snapped(raw)
        if (draft.length && Math.hypot(point.x - draft[draft.length - 1].x, point.y - draft[draft.length - 1].y) < 0.08) return
        if (project.marks.length >= MAX_MARKS || draft.length >= MAX_POINTS) { setMessage("Finish this line or remove an older marking before adding more points."); return }
        if (tool === "callout" || ((tool === "passage" || tool === "window" || isUtility(tool as MarkKind) && !bounces) && draft.length === 1)) {
            const mark = newMark(tool as MarkKind, [...draft, point])
            edit([...project.marks, mark]); setSelected(mark.id); setDraft([])
        } else setDraft([...draft, point])
    }
    const startDrag = (event: React.PointerEvent, mark?: MapMark, index?: number) => {
        if (!ready || saveBlocked || event.button !== 0 && event.button !== 1) return
        if (tool === "pan" || spacePan || event.button === 1) {
            event.preventDefault(); event.stopPropagation(); svg.current?.setPointerCapture(event.pointerId)
            drag.current = { mode: "pan", start: pointAt(event.clientX, event.clientY, false), view }
        } else if (mark && tool === "select" && !mark.locked) {
            event.stopPropagation(); svg.current?.setPointerCapture(event.pointerId); setSelected(mark.id)
            drag.current = { mode: index === undefined ? "mark" : "point", start: pointAt(event.clientX, event.clientY), view, mark, index }
        }
    }
    const movePointer = (event: React.PointerEvent) => {
        const active = drag.current
        if (!active) { setHover(snapped(pointAt(event.clientX, event.clientY))); return }
        if (active.mode === "pan") {
            const point = pointAt(event.clientX, event.clientY, false)
            setView({ ...active.view, x: active.view.x + point.x - active.start.x, y: active.view.y + point.y - active.start.y })
        } else if (active.mark) {
            const point = pointAt(event.clientX, event.clientY)
            let points: MapPoint[]
            if (active.mode === "point") points = active.mark.points.map((p, index) => index === active.index ? snapped(point, active.mark!.id) : p)
            else {
                const dx = Math.max(-Math.min(...active.mark.points.map(p => p.x)), Math.min(100 - Math.max(...active.mark.points.map(p => p.x)), point.x - active.start.x))
                const dy = Math.max(-Math.min(...active.mark.points.map(p => p.y)), Math.min(100 - Math.max(...active.mark.points.map(p => p.y)), point.y - active.start.y))
                points = active.mark.points.map(p => ({ x: +(p.x + dx).toFixed(3), y: +(p.y + dy).toFixed(3) }))
            }
            active.next = { ...active.mark, points, status: "draft" }; setPreview(active.next)
        }
    }
    const endDrag = (event: React.PointerEvent, cancel = false) => {
        if (!drag.current) return
        if (!cancel && drag.current.next) updateMark(drag.current.next)
        drag.current = null; setPreview(null); ignoreClick.current = true
        if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId)
    }
    const locked = !ready || saveBlocked
    const button = styles.button
    const activeTool = DRAW_TOOLS.has(tool) ? MARK_TOOLS[tool as MarkKind] : null
    const matchesFilter = (mark: MapMark) => mark.source?.provider === "radar-outline" || ((originFilter === "all" || (originFilter === "mine" ? !mark.source : mark.source?.provider === "CS2Nades")) && (kindFilter === "all" || mark.kind === kindFilter) && (sideFilter === "both" || markSide(mark) === "both" || markSide(mark) === sideFilter) && `${mark.label} ${mark.note} ${MARK_TOOLS[mark.kind].label}`.toLowerCase().includes(search.toLowerCase()))
    const shownMarks = project.marks.map(mark => preview?.id === mark.id ? preview : mark).filter(mark => !hidden.has(mark.kind) && matchesFilter(mark))
    const compactMark = (mark: MapMark) => mark.source?.provider === "CS2Nades" && selected !== mark.id && !showLibraryPaths

    return <div className={styles.editor}>
        <header className={styles.header}>
            <div className={styles.brand}><Link href="/settings" aria-label="Back to game settings" className={button}><ArrowLeft size={17} /></Link><div><h1>Map studio<span>DRAW THE RULES.</span></h1><p role="status" className={saveStatus.startsWith("Could") || saveBlocked ? styles.warning : ""}>{saveBlocked ? "Draft recovery needed" : saveStatus}</p></div></div>
            <div className={styles.headerActions}>
                <Link className={button} href={`/map-editor/lab?map=${project.mapId}`}><ArrowUpRight size={16} />Simulation lab</Link>
                <button className={button} onClick={() => setDraftLibrary(!draftLibrary)} aria-expanded={draftLibrary}>Saved drafts</button>
                <button className={button} onClick={() => setHelp(!help)} aria-expanded={help}><HelpCircle size={16} /> Guide</button>
                <button className={button} disabled={!ready || !!draft.length} onClick={() => fileInput.current?.click()}><Upload size={16} /> Open project</button>
                <input ref={fileInput} type="file" accept=".json,application/json" aria-label="Import map project" hidden onChange={event => { void importFile(event.target.files?.[0]); event.target.value = "" }} />
                <button className={button} disabled={locked || !!draft.length} onClick={() => download(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }), `${project.mapId.toLowerCase()}-${project.floor}.map-project.json`)}><Download size={16} /> Save project</button>
                <button className={`${button} ${styles.primary}`} disabled={locked || !!draft.length || exporting || imageError} onClick={() => void exportPng()}><ArrowUpRight size={16} />{exporting ? "Creating PNGâ€¦" : "Export PNG"}</button>
            </div>
        </header>
        {draftLibrary && <div className={styles.guide}><div><b>Your latest Mirage update (v13)</b><p>142 markings, including your redrawn walls, windows, spawns and bombsites. The upload is preserved unchanged. Opening backs up current work. The repaired route edition restores missing floor and A/B bindings; wall heights and blue openings still need review.</p></div><a className={button} href="/map-studio/drafts/mirage-user-v13-2026-09-22.json" download>Download latest</a><a className={button} href="/map-studio/drafts/mirage-user-draft-2026-09-12.json" download>Download original</a><button className={button} onClick={() => { const raw = localStorage.getItem(`${projectKey(project)}:before-library`); if (raw) download(new Blob([raw], { type: "application/json" }), `${project.mapId.toLowerCase()}-before-library.json`); else setMessage("No earlier draft needed a backup on this floor.") }}>Download pre-import backup</button><button className={`${button} ${styles.primary}`} disabled={!ready || !!draft.length} onClick={() => void openSavedDraft()}>Continue latest Mirage</button></div>}
        {draftLibrary && <div className={styles.guide}><div><b>Earlier registered review (142 markings)</b><p>Historical draft, before your v13 redraw. A/B names and provisional ground ranges added. Open validation to inspect the remaining floor and wall issues.</p></div><button className={button} disabled={!ready || !!draft.length} onClick={() => void openSavedDraft('registered')}>Open registered review copy</button><a className={button} href="/map-studio/registration.json" download>Download all-map coverage</a></div>}
        {draftLibrary && <div className={styles.guide}><div><b>Installed-map references: all other maps</b><p>Native plant footprints and enabled spawn pins, with upper/lower floors kept separate. Existing library drawings are included. Import backs up your current work; these are review drafts, not certified match geometry.</p></div><label>Map and floor <select aria-label="Native reference map and floor" value={nativeDraft.project} onChange={event => setNativeDraftSelection(event.target.value)}>{nativeDrafts.map(entry => <option key={entry.project} value={entry.project}>{entry.mapId} / {entry.floor}</option>)}</select></label><span>{nativeDraft.spawns} spawn pins / {nativeDraft.sitePieces} plant-volume pieces</span><button className={button} disabled={!ready || !!draft.length} onClick={() => void openNativeDraft()}>Open native map draft</button><a className={button} href={nativeDraft.project} download>Download selected draft</a><a className={button} href={nativeDraft.audit} download>Download native audit</a></div>}
        {draftLibrary && <div className={styles.guide}><div><b>Mirage: installed-map reference</b><p>Native A/B plant footprints and 33 enabled spawn pins extracted from your installed map. Navigation matches the existing reference. Spawn pins are entity origins; floor grounding, trigger overlap and collision masks still require engine validation. Your wall and utility drawings are preserved.</p></div><button className={button} disabled={!ready || !!draft.length} onClick={() => void openSavedDraft('native')}>Open native reference draft</button><a className={button} href="/map-studio/drafts/mirage-v13-native-sites.json" download>Download native draft</a><a className={button} href="/map-studio/reviews/mirage-native/audit.json" download>Download extraction audit</a></div>}
        {draftLibrary && <div className={styles.guide}><div><b>Mirage v13 repaired + reference routes</b><p>Your 142 markings with repaired spawn/site floor bindings plus 10 generated routes. Each route passed height-aware movement against the pinned static reference. These are draft paths, not recorded pro tactics. Unbound walls still need review.</p></div><button className={button} disabled={!ready || !!draft.length} onClick={() => void openSavedDraft('routes')}>Open latest + 10 routes</button><a className={button} href="/map-studio/drafts/mirage-v13-with-reference-routes.json" download>Download route project</a><a className={button} href="/map-studio/reviews/mirage-v13/routes.json" download>Download height-aware routes</a><a className={button} href="/map-studio/reviews/mirage-v13/audit.json" download>Download update audit</a><a className={button} href="/map-studio/reviews/mirage-v13/review.html" target="_blank" rel="noreferrer">Open numbered review</a></div>}
        {message && <div className={styles.notice} role="status"><span>{message}</span><button className={button} aria-label="Dismiss message" onClick={() => setMessage("")}><X size={14} /></button></div>}
        {saveBlocked && <div className={styles.notice}><button className={button} onClick={recoverDraft}>Recover draft</button><button className={button} onClick={() => { recoverDraft(); setSaveBlocked(false); setMessage("A fresh draft is ready. Keep the recovery download as your backup.") }}>Start fresh after recovery</button></div>}
        {help && <div className={styles.guide}><div><b>1. Choose a color</b><p>Geometry for walls. Utility for grenades. Areas for spawns, bombsites and callouts.</p></div><div><b>2. Click to draw</b><p>Grenades: throw first, landing second. Areas: three or more corners, then Finish. Escape cancels.</p></div><div><b>3. Refine & share</b><p>Select and drag points. Lock finished walls. Download your project to keep every detail.</p></div><button className={button} aria-label="Close guide" onClick={() => setHelp(false)}><X size={16} /></button></div>}
        <div className={styles.workspace}>
            <aside className={styles.tools} aria-label="Drawing tools">
                <div className={styles.sectionLabel}>YOUR CANVAS</div>
                <label className={styles.field}>Map<select aria-label="Map" value={project.mapId} disabled={!ready || !!draft.length} onChange={event => loadMap(event.target.value, "upper")}>{MAP_OPTIONS.map(map => <option key={map.id} value={map.id}>{map.name}</option>)}</select></label>
                {map.images.lower && <label className={styles.field}>Floor<select aria-label="Floor" value={project.floor} disabled={locked || !!draft.length} onChange={event => loadMap(project.mapId, event.target.value as MapFloor)}><option value="upper">Upper</option><option value="lower">Lower</option></select></label>}
                <div className={styles.sectionLabel}>MARK THE MAP</div>
                <div className={styles.toolTabs} aria-label="Tool categories">{(Object.keys(TOOL_GROUPS) as (keyof typeof TOOL_GROUPS)[]).map(name => <button key={name} aria-pressed={group === name} disabled={!!draft.length} onClick={() => { setGroup(name); chooseTool("select") }}>{name}</button>)}</div>
                <div className={styles.utilityTools}>{([{ id: "select", label: "Select", icon: MousePointer2, key: "V" }, { id: "pan", label: "Pan", icon: Hand, key: "H" }, { id: "erase", label: "Erase", icon: Trash2, key: "E" }] as const).map(item => <button key={item.id} className={`${button} ${tool === item.id ? styles.activeUtility : ""}`} disabled={locked} aria-pressed={tool === item.id} onClick={() => chooseTool(item.id)} title={`${item.label} (${item.key})`}><item.icon size={16} />{item.label}</button>)}</div>
                <div className={styles.toolList}>
                    {TOOL_GROUPS[group].map(kind => <button key={kind} className={`${styles.tool} ${tool === kind ? styles.activeTool : ""}`} style={{ "--tool-color": MARK_TOOLS[kind].color } as React.CSSProperties} aria-pressed={tool === kind} disabled={locked} onClick={() => chooseTool(kind)}><span className={styles.swatch} /> <span>{MARK_TOOLS[kind].label}</span><kbd>{MARK_TOOLS[kind].shortcut}</kbd></button>)}
                </div>
                {group === "Utility" && <>
                    <label className={styles.check}><input type="checkbox" checked={bounces} disabled={!!draft.length} onChange={event => setBounces(event.target.checked)} />Add bounce / path points</label>
                    {library && <div className={styles.presetCard}>
                        <b>Lineup library</b>
                        <p>{library.lineups.length} lineups on this floor from <a href="https://cs2nades.gg/en/" target="_blank" rel="noreferrer">CS2Nades</a>.</p>
                        <p>Click a landing dot or search a destination to reveal the throw and source guide. Several throws can share a target.</p>
                        <label className={styles.check}><input type="checkbox" checked={showLibraryPaths} onChange={event => setShowLibraryPaths(event.target.checked)} />Show all imported paths</label>
                        {!library.lineups.length && <p>The source has no mapped lineups for this floor yet. You can draw your own.</p>}
                        {!!library.unplaced.length && <details><summary>{library.unplaced.length} need placement</summary>{library.unplaced.map(item => <div className={styles.unplaced} key={item.id}><a href={item.url} target="_blank" rel="noreferrer">{item.label}</a><p>{item.reason}</p></div>)}</details>}
                        <p className={styles.effectNote}>Source target positions, aligned to this radar. Draft guides, not simulated trajectories. Red outer boundaries are locked; unlock to refine.</p>
                    </div>}
                    {project.mapId === "Mirage" && <div className={styles.presetCard}><label className={styles.field}>Common Mirage utility<select aria-label="Utility template" disabled={!!draft.length} value={template} onChange={event => { const preset = MIRAGE_UTILITY_TEMPLATES.find(item => item.label === event.target.value); if (preset) chooseTool(preset.kind); setTemplate(event.target.value) }}><option value="">Custom placement</option>{MIRAGE_UTILITY_TEMPLATES.map(item => <option key={item.label} value={item.label}>{item.side} / {item.label}</option>)}</select></label><p>Pick a purpose, then place your throw and landing. No coordinates are guessed.</p><a href={MIRAGE_UTILITY_SOURCE} target="_blank" rel="noreferrer">Open lineup reference</a></div>}
                </>}

                {DRAW_TOOLS.has(tool) && <MapCoordinateInput label="Add drawing point" action={tool === "callout" ? "Place callout" : "Add point"} disabled={locked || imageError} onApply={addPoint} />}
                <p className={styles.toolHelp}>{activeTool?.help || (tool === "select" ? "Select a marking. Drag its points to reshape it, or drag the shape to move it. Locked markings stay fixed." : tool === "erase" ? "Click any marking to remove it. Undo brings it back." : "Drag the canvas to move around. You can also hold Space with any tool.")}</p>
                <div className={styles.sectionLabel}>VIEW OPTIONS</div>
                <label className={styles.check}><input type="checkbox" checked={snap} onChange={event => setSnap(event.target.checked)} />Snap to nearby points</label>
                <label className={styles.check}><input type="checkbox" checked={grid} onChange={event => setGrid(event.target.checked)} />Show grid</label>
                <label className={styles.check}><input type="checkbox" checked={labels} onChange={event => setLabels(event.target.checked)} />Show labels</label>
                <label className={styles.field}>Map brightness <input aria-label="Map brightness" type="range" min="25" max="100" value={opacity} onChange={event => setOpacity(+event.target.value)} /></label>
                <p className={styles.localNote}>Drafts stay on this device. Download a project to back up your points and notes.</p>
            </aside>
            <main className={styles.canvasColumn}>
                <div className={styles.canvasBar}><div><span className={styles.liveDot} />{project.mapId} <span className={styles.muted}>/ {map.images.lower ? project.floor : "2D map"}</span></div><div className={styles.barActions}><button className={button} aria-label="Undo" title="Undo (Ctrl / Cmd + Z)" disabled={locked || !history.past.length || !!draft.length} onClick={() => dispatch({ type: "undo" })}><Undo2 size={17} /></button><button className={button} aria-label="Redo" title="Redo (Ctrl / Cmd + Shift + Z)" disabled={locked || !history.future.length || !!draft.length} onClick={() => dispatch({ type: "redo" })}><Redo2 size={17} /></button><span className={styles.divider} /><button className={button} aria-label="Zoom out" disabled={view.zoom <= 1} onClick={() => zoomAt(0.8)}><Minus size={16} /></button><span className={styles.zoom}>{Math.round(view.zoom * 100)}%</span><button className={button} aria-label="Zoom in" disabled={view.zoom >= 6} onClick={() => zoomAt(1.25)}><Plus size={16} /></button><button className={button} aria-label="Fit map" title="Fit map (0)" onClick={() => setView(INITIAL_VIEW)}><Maximize size={16} /></button></div></div>
                <div className={styles.stage}>
                    <svg ref={svg} viewBox="0 0 100 100" className={styles.canvas} role="group" aria-label={`${project.mapId} annotation canvas. Arrow keys pan; Home fits the map. Select a marking to adjust its points.`} onKeyDown={event => {
                        if (event.target !== event.currentTarget) return
                        const delta = { ArrowLeft: [5, 0], ArrowRight: [-5, 0], ArrowUp: [0, 5], ArrowDown: [0, -5] }[event.key]
                        if (delta) { event.preventDefault(); setView(previous => ({ ...previous, x: previous.x + delta[0], y: previous.y + delta[1] })) }
                        if (event.key === "Home") { event.preventDefault(); setView(INITIAL_VIEW) }
                    }} tabIndex={0} style={{ cursor: spacePan || tool === "pan" ? "grab" : tool === "select" ? "default" : "crosshair" }}
                        onClick={onCanvasClick} onDoubleClick={() => { if (DRAW_TOOLS.has(tool)) finish() }} onPointerDown={event => startDrag(event)} onPointerMove={movePointer} onPointerUp={event => endDrag(event)} onPointerCancel={event => endDrag(event, true)} onPointerLeave={() => setHover(null)}>
                        <defs><pattern id="annotation-grid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" fill="none" stroke="#cbd5e1" strokeOpacity="0.18" strokeWidth="0.1" /></pattern><marker id="annotation-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0L5 2.5L0 5Z" fill={MARK_TOOLS.route.color} /></marker></defs>
                        <g ref={world} transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
                            <rect width="100" height="100" fill="#141d27" />
                            <image href={source} width="100" height="100" opacity={opacity / 100} onError={() => setImageError(true)} />
                            {referenceOverlay && project.registration && (() => {
                                const [a, b, c, d, e, f] = project.registration.matrix, det = a * e - b * d
                                return <image href={referenceOverlay.radars[project.floor]} width="100" height="100" opacity="0.5" pointerEvents="none" transform={`matrix(${e / det} ${-d / det} ${-b / det} ${a / det} ${(b * f - e * c) / det} ${(d * c - a * f) / det})`} />
                            })()}
                            {grid && <rect width="100" height="100" fill="url(#annotation-grid)" pointerEvents="none" />}
                            {shownMarks.map(mark => <g key={mark.id} role="button" tabIndex={0} aria-label={`${MARK_TOOLS[mark.kind].label}: ${mark.label || "Untitled"}`} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); setSelected(mark.id); setTool("select") } }} onPointerDown={event => startDrag(event, mark)} onClick={event => { if (tool === "select" || tool === "erase") { event.stopPropagation(); ignoreClick.current = false; if (tool === "erase" && mark.locked) { setMessage("Unlock this marking before erasing it."); return } if (tool === "erase") { edit(project.marks.filter(item => item.id !== mark.id)); if (selected === mark.id) setSelected(null) } else setSelected(mark.id) } }}>
                                {compactMark(mark) ? <circle cx={labelPoint(mark).x} cy={labelPoint(mark).y} r={1.2 / Math.sqrt(view.zoom)} fill="transparent" /> : isArea(mark.kind) ? <polygon points={mark.points.map(p => `${p.x},${p.y}`).join(" ")} fill="transparent" stroke="transparent" strokeWidth={2.5 / view.zoom} /> : mark.kind === "callout" ? <circle cx={mark.points[0].x} cy={mark.points[0].y} r={1.5 / Math.sqrt(view.zoom)} fill="transparent" /> : <polyline points={mark.points.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="transparent" strokeWidth={2.5 / view.zoom} />}
                                {isUtility(mark.kind) && !compactMark(mark) && <circle cx={labelPoint(mark).x} cy={labelPoint(mark).y} r={mark.radius ?? 3} fill="transparent" />}
                                <g pointerEvents="none" opacity={selected && selected !== mark.id ? 0.72 : 1}>{markVisuals(mark, view.zoom, compactMark(mark)).map((shape, index) => createElement(shape.tag, { ...shape.attrs, key: index }, shape.text))}</g>
                                {labels && !compactMark(mark) && markDisplayLabel(mark, selected || undefined) && <text x={labelLayout(mark).x} y={labelLayout(mark).y} textAnchor={labelLayout(mark).textAnchor as "start" | "end"} fill="white" stroke="#101923" strokeWidth="0.4" paintOrder="stroke" fontSize={1.5 / Math.sqrt(view.zoom)} pointerEvents="none">{mark.locked ? "[Locked] " : ""}{markDisplayLabel(mark, selected || undefined)}</text>}
                                {tool === "select" && !mark.locked && selected === mark.id && mark.points.map((p, index) => <circle key={index} cx={p.x} cy={p.y} r={0.65 / view.zoom} fill="#fff" stroke={MARK_TOOLS[mark.kind].color} strokeWidth={0.25 / view.zoom} role="button" tabIndex={0} aria-label={isUtility(mark.kind) ? index === 0 ? "Throw point" : index === mark.points.length - 1 ? "Landing point" : `Bounce point ${index}` : `Point ${index + 1}`} onPointerDown={event => startDrag(event, mark, index)} onKeyDown={event => {
                                    const offsets: Record<string, MapPoint> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } }
                                    const offset = offsets[event.key]; if (!offset) return
                                    event.preventDefault(); event.stopPropagation(); const step = event.shiftKey ? 1 : 0.1
                                    updateMark({ ...mark, points: mark.points.map((point, i) => i === index ? snapPoint({ x: point.x + offset.x * step, y: point.y + offset.y * step }, [], 0) : point) })
                                }} />)}
                            </g>)}
                            {draft.length > 0 && <g pointerEvents="none"><polyline points={[...draft, ...(hover ? [hover] : [])].map(p => `${p.x},${p.y}`).join(" ")} fill={isArea(tool as MarkKind) ? activeTool?.color : "none"} fillOpacity="0.15" stroke={activeTool?.color || "white"} strokeWidth={0.4 / view.zoom} strokeDasharray={`${0.8 / view.zoom} ${0.4 / view.zoom}`} />{draft.map((p, index) => <circle key={index} cx={p.x} cy={p.y} r={0.45 / view.zoom} fill={activeTool?.color} />)}</g>}
                        </g>
                    </svg>
                    {imageError && <div className={styles.canvasMessage}>Map image unavailable. Your draft is preserved; try reopening the tool.</div>}
                    {!project.marks.length && !draft.length && !imageError && <div className={styles.startHint}><Pencil size={15} /> Choose a color, then click the map to start.</div>}
                </div>
                <div className={styles.canvasFooter}>{draft.length ? <><span><b>{draft.length} points</b> / {isUtility(tool as MarkKind) ? bounces ? "Last point = landing. Finish when ready." : "Now click the landing / burst point" : isArea(tool as MarkKind) ? "Trace the boundary, then Finish" : draft.length === 1 ? "Click the next point" : "Continue drawing or finish"}</span><div className={styles.barActions}><button className={button} onClick={() => setDraft(draft.slice(0, -1))}><Undo2 size={14} />Last point</button><button className={button} onClick={() => setDraft([])}><X size={14} />Cancel</button><button className={`${button} ${styles.primary}`} disabled={draft.length < minimumPoints(tool as MarkKind)} onClick={finish}><Check size={14} />Finish</button></div></> : <><span>Scroll to zoom / Space + drag to pan</span><span>{shownMarks.length} / {project.marks.length} visible</span></>}</div>
            </main>
            <aside className={styles.inspector} aria-label="Marking details and layers">
                <MapValidationPanel project={project} disabled={locked || !!draft.length} onChange={next => dispatch({ type: 'edit', project: next })} onOverlay={setReferenceOverlay} onSelect={id => { const mark = project.marks.find(m => m.id === id); if (mark) { setSelected(id); setTool('select'); setHidden(new Set()); setSearch(''); setSideFilter('both'); setKindFilter('all'); setOriginFilter('all'); focusMark(mark) } }} />
                <div className={styles.sectionLabel}>SELECTED MARKING</div>
                {selectedMark ? <div className={styles.detail}>
                    <div className={styles.selectionTitle}><span style={{ color: MARK_TOOLS[selectedMark.kind].color }}>{MARK_TOOLS[selectedMark.kind].label}</span><span>{selectedMark.points.length} points</span></div>
                    <MapPointEditor key={selectedMark.id} mark={selectedMark} disabled={locked || !!draft.length} onChange={updateMark} />
                    <label className={styles.field}>Label<input aria-label="Marking label" disabled={selectedMark.locked} value={selectedMark.label} maxLength={80} placeholder="e.g. Connector entrance" onChange={event => updateMark({ ...selectedMark, label: event.target.value })} /></label>
                    <label className={styles.field}>Label position<select aria-label="Label position" disabled={selectedMark.locked} value={selectedMark.labelPosition || "above"} onChange={event => updateMark({ ...selectedMark, labelPosition: event.target.value as MapMark["labelPosition"] })}><option value="above">Above</option><option value="below">Below</option><option value="left">Left</option><option value="right">Right</option></select></label>
                    {selectedMark.kind === "window" && <label className={styles.field}>Type<select aria-label="Cover type" disabled={selectedMark.locked} value={selectedMark.detail || "window"} onChange={event => updateMark({ ...selectedMark, detail: event.target.value as MapMark["detail"], status: "draft" })}><option value="window">Window</option><option value="cover">Low cover</option><option value="jump">Jump / climb</option></select></label>}
                    {!isArea(selectedMark.kind) && <label className={styles.field}>Team<select aria-label="Marking team" disabled={selectedMark.locked} value={selectedMark.side || "both"} onChange={event => updateMark({ ...selectedMark, side: event.target.value as MarkSide })}><option value="both">Both / shared</option><option value="CT">CT</option><option value="T">T</option></select></label>}
                    <label className={styles.field}>Review status<select aria-label="Review status" disabled={selectedMark.locked} value={selectedMark.status || "draft"} onChange={event => updateMark({ ...selectedMark, status: event.target.value as MapMark["status"] })}><option value="draft">Draft - needs checking</option><option value="checked">Checked by me</option></select></label>
                    {(isArea(selectedMark.kind) || ['wall', 'window', 'passage'].includes(selectedMark.kind)) && <div className={styles.utilityDetail}>
                        <b>Floor and physical height</b><p>Zones select ground surfaces in this range. Walls block only between their bottom and top. Window/passage heights are review notes and do not cut openings. Use world heights from validation or the lab.</p>
                        {!selectedMark.spatial ? <button className={button} disabled={selectedMark.locked} onClick={() => updateMark({ ...selectedMark, spatial: { floorId: project.floor, zMin: 0, zMax: 72 }, status: 'draft' })}>Set height range manually</button> : <>
                            <label className={styles.field}>Floor name<input aria-label="Geometry floor name" disabled={selectedMark.locked} value={selectedMark.spatial.floorId} maxLength={80} onChange={e => { if (e.target.value.trim()) updateMark({ ...selectedMark, spatial: { ...selectedMark.spatial!, floorId: e.target.value }, status: 'draft' }) }} /></label>
                            {(['zMin', 'zMax'] as const).map(key => <label className={styles.field} key={key}>{key === 'zMin' ? 'Bottom / minimum ground height' : 'Top / maximum ground height'}<input aria-label={key === 'zMin' ? 'Minimum geometry height' : 'Maximum geometry height'} key={`${selectedMark.id}:${selectedMark.spatial![key]}`} type="number" defaultValue={selectedMark.spatial![key]} disabled={selectedMark.locked} onBlur={e => { const n = e.target.valueAsNumber, next = { ...selectedMark.spatial!, [key]: n }; if (Number.isFinite(n) && next.zMin < next.zMax && n >= -20000 && n <= 20000) updateMark({ ...selectedMark, spatial: next, status: 'draft' }); else { e.target.value = String(selectedMark.spatial![key]); setMessage('Minimum height must be below maximum height.') } }} /></label>)}
                            {selectedMark.kind === 'bombsite' && <label className={styles.field}>Plant site<select aria-label="Plant site" disabled={selectedMark.locked} value={selectedMark.spatial.site || ''} onChange={e => updateMark({ ...selectedMark, spatial: { ...selectedMark.spatial!, site: e.target.value === 'A' || e.target.value === 'B' ? e.target.value : undefined }, status: 'draft' })}><option value="">Choose A or B</option><option>A</option><option>B</option></select></label>}
                        </>}
                    </div>}
                    {isUtility(selectedMark.kind) && <div className={styles.utilityDetail}>
                        {selectedMark.source?.url && <a className={styles.sourceLink} href={selectedMark.source.url} target="_blank" rel="noreferrer">Open source lineup <ArrowUpRight size={14} /></a>}
                        {selectedMark.source?.originFloor && selectedMark.source.originFloor !== project.floor && <p>Throw starts on the {selectedMark.source.originFloor} floor.</p>}
                        <div className={styles.endpointKey}><span>Hollow: throw</span><span>Filled: {selectedMark.kind === "flash" || selectedMark.kind === "he" ? "Detonation" : "Landing"}</span></div>
                        <label className={styles.field}>Throw technique<select aria-label="Throw technique" disabled={selectedMark.locked} value={selectedMark.throwMode || (selectedMark.source?.provider === "CS2Nades" ? "" : "Standing")} onChange={event => updateMark({ ...selectedMark, throwMode: (event.target.value || undefined) as MapMark["throwMode"] })}>{selectedMark.source?.provider === "CS2Nades" && <option value="">See source technique in notes</option>}{THROW_MODES.map(mode => <option key={mode}>{mode}</option>)}</select></label>
                        <label className={styles.field}>Guide radius: {selectedMark.radius ?? 3}% of map width<input aria-label="Effect guide radius" disabled={selectedMark.locked} type="range" min="0.5" max="15" step="0.5" value={selectedMark.radius ?? 3} onChange={event => updateMark({ ...selectedMark, radius: +event.target.value })} /></label>
                        <p className={styles.effectNote}>Planning guide only. Walls, height, smoke shape and flash visibility need checking in game.</p>
                        <label className={styles.field}>Aim & lineup<textarea aria-label="Aim instructions" disabled={selectedMark.locked} rows={2} value={selectedMark.aim || ""} maxLength={1000} placeholder="Stand at... Aim at... Release when..." onChange={event => updateMark({ ...selectedMark, aim: event.target.value })} /></label>
                    </div>}
                    <label className={styles.field}>Notes<textarea aria-label="Marking notes" disabled={selectedMark.locked} value={selectedMark.note} maxLength={1000} rows={4} placeholder="What should happen here? Add timing, sight lines or anything to check." onChange={event => updateMark({ ...selectedMark, note: event.target.value })} /></label>
                    <button className={button} disabled={!!draft.length || selectedMark.locked} onClick={() => { setTool("select"); setHidden(previous => { const next = new Set(previous); next.delete(selectedMark.kind); return next }) }}><MousePointer2 size={15} />Edit points</button>
                    {selectedMark.kind === "route" && <button disabled={selectedMark.locked} className={button} onClick={() => updateMark({ ...selectedMark, points: [...selectedMark.points].reverse() })}>Reverse direction</button>}
                    <div className={styles.barActions}><button className={button} onClick={() => focusMark(selectedMark)}>Focus</button><button className={button} disabled={!!draft.length || project.marks.length >= MAX_MARKS} onClick={duplicateSelected}>Duplicate</button><button className={button} disabled={!!draft.length} onClick={() => updateMark({ ...selectedMark, locked: !selectedMark.locked })}>{selectedMark.locked ? "Unlock" : "Lock"}</button></div>
                    <button disabled={selectedMark.locked} className={`${button} ${styles.danger}`} onClick={removeSelected}><Trash2 size={15} />Delete marking</button>
                </div> : <p className={styles.emptyDetail}>Select a marking to name it, add notes or move its points.</p>}
                <details className={styles.layerPanel}><summary>Layers & visibility</summary>                <div className={styles.sectionLabel}>LAYERS <span>{project.marks.length}</span></div>
                {MARK_KINDS.map(kind => <div className={styles.layer} key={kind}><span style={{ background: MARK_TOOLS[kind].color }} /><span>{MARK_TOOLS[kind].plural}</span><b>{project.marks.filter(mark => mark.kind === kind).length}</b><button className={button} aria-label={`${hidden.has(kind) ? "Show" : "Hide"} ${MARK_TOOLS[kind].plural}`} aria-pressed={!hidden.has(kind)} onClick={() => setHidden(previous => { const next = new Set(previous); if (next.has(kind)) next.delete(kind); else next.add(kind); return next })}>{hidden.has(kind) ? <EyeOff size={15} /> : <Eye size={15} />}</button></div>)}
<div className={styles.barActions}><button className={button} onClick={() => setHidden(new Set())}>Show all</button><button className={button} onClick={() => setHidden(new Set(MARK_KINDS))}>Hide all</button></div></details>
                <label className={styles.field}>Find a marking<input aria-label="Search markings" value={search} placeholder="Search names, types, notes" onChange={event => setSearch(event.target.value)} /></label>
                <label className={styles.field}>Show team<select aria-label="Team filter" value={sideFilter} onChange={event => setSideFilter(event.target.value as MarkSide)}><option value="both">Both teams</option><option value="CT">CT + shared</option><option value="T">T + shared</option></select></label>
                <label className={styles.field}>Collection<select aria-label="Collection filter" value={originFilter} onChange={event => setOriginFilter(event.target.value)}><option value="all">Everything</option><option value="mine">My work</option><option value="library">Imported lineups</option></select></label>
                <label className={styles.field}>Marking type<select aria-label="Marking type filter" value={kindFilter} onChange={event => setKindFilter(event.target.value)}><option value="all">All types</option>{MARK_KINDS.map(kind => <option value={kind} key={kind}>{MARK_TOOLS[kind].plural}</option>)}</select></label>
                <div className={styles.markList} aria-label="All markings">{project.marks.filter(matchesFilter).map((mark, index) => <button key={mark.id} className={selected === mark.id ? styles.selectedRow : ""} onClick={() => { if (draft.length) { setMessage("Finish your line before selecting another marking."); return } setSelected(mark.id); setTool("select"); setHidden(previous => { const next = new Set(previous); next.delete(mark.kind); return next }) }}><span style={{ background: MARK_TOOLS[mark.kind].color }} />{mark.label || (mark.source?.provider === "radar-outline" ? "Outer boundary" : `${MARK_TOOLS[mark.kind].label} ${index + 1}`)}<small>{mark.locked ? "Locked" : mark.status === "checked" ? "Checked" : "Draft"}</small></button>)}</div>
                <p className={styles.localNote}>Exported projects include every layer and your notes. Drawings are drafts for review; they do not change live matches yet.</p>
            </aside>
        </div>
    </div>
}

