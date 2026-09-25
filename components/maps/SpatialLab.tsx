"use client"

import { MapCoordinateInput } from "./MapCoordinateInput"
import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Play, Pause, RotateCcw, Download, Upload, Plus, Minus, Eye, Footprints, Layers, ArrowRight } from "lucide-react"
import { MAP_OPTIONS, parseProject, projectKey, type MapAnnotationProject } from "@/lib/map-annotations"
import { registrationMatches, registeredRadar } from '@/engine/spatial/registration'
import type { AnnotationReport } from '@/engine/spatial/annotations'
import { NavigationMesh, DEFAULT_ROUTE_OPTIONS, type NavLocation, type Route } from "@/engine/spatial/navigation"
import { center, distance3, fromRadar, toRadar, type SpatialReference, type Vec3 } from "@/engine/spatial/types"
import type { MovementFrame } from "@/engine/spatial/movement"
import type { RayHit } from "@/engine/spatial/geometry"
import { DEFAULT_LAB_SETTINGS, emptyLabProject, labKey, parseLabProject, type LabProject, type LabSettings } from "@/lib/spatial-lab-project"
import styles from "./spatial-lab.module.css"
import { EncounterLab } from './EncounterLab'
import { TeamLab } from './TeamLab'

interface Result { route: Route; frames: MovementFrame[]; sight: { from: Vec3; to: Vec3; hit: RayHit | null } }
const saveFile = (project: LabProject, suffix = "") => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }))
    const a = document.createElement("a"); a.href = url; a.download = `${project.mapId.toLowerCase()}${suffix}.spatial-lab.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function SpatialLab() {
    const [mapId, setMapId] = useState("Mirage"), [reference, setReference] = useState<SpatialReference | null>(null)
    const [project, setProject] = useState<LabProject | null>(null), [result, setResult] = useState<Result | null>(null)
    const [status, setStatus] = useState("Loading reference geometry..."), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [saveBlocked, setSaveBlocked] = useState(false)
    const [target, setTarget] = useState<"a" | "b">("a")
    const { height, speed, ladders, jumps, drops } = project?.settings || DEFAULT_LAB_SETTINGS
    const [surfaceOptions, setSurfaceOptions] = useState<{ a: NavLocation[]; b: NavLocation[] }>({ a: [], b: [] })
    const [showNav, setShowNav] = useState(true), [showSight, setShowSight] = useState(true), [elevation, setElevation] = useState("all"), [floor, setFloor] = useState("upper")
    const [zoom, setZoom] = useState(1), [playing, setPlaying] = useState(false), [time, setTime] = useState(0), [stats, setStats] = useState({ triangles: 0, excludedPortals: 0 })
    const [past, setPast] = useState<LabProject[]>([])
    const [annotations, setAnnotations] = useState<MapAnnotationProject | null>(null), [annotationReport, setAnnotationReport] = useState<AnnotationReport | null>(null)
    const [panning, setPanning] = useState(false), [offset, setOffset] = useState({ x: 0, y: 0 })
    const panStart = useRef<{ x: number; y: number; offset: { x: number; y: number } } | null>(null)
    const worker = useRef<Worker | null>(null), serial = useRef(0), file = useRef<HTMLInputElement>(null), world = useRef<SVGGElement>(null)
    const drag = useRef<"a" | "b" | null>(null), ignoreClick = useRef(false)
    const nav = useMemo(() => reference ? new NavigationMesh(reference) : null, [reference])
    const edit = (next: LabProject) => { if (project) setPast(previous => [...previous, project].slice(-50)); setProject(next); setPlaying(false) }
    const configure = (settings: Partial<LabSettings>) => { if (project && !saveBlocked) edit({ ...project, settings: { ...project.settings, ...settings } }) }
    useEffect(() => { setAnnotations(project?.annotations || null); setAnnotationReport(null) }, [project?.annotations])

    useEffect(() => { const requested = new URLSearchParams(window.location.search).get("map"); if (requested && MAP_OPTIONS.some(m => m.id === requested)) setMapId(requested) }, [])
    useEffect(() => {
        setAnnotations(null); setAnnotationReport(null)
        setReference(null); setProject(null); setResult(null); setPlaying(false); setTime(0); setFloor("upper"); setElevation("all"); setZoom(1); setOffset({ x: 0, y: 0 }); setPast([]); setSurfaceOptions({ a: [], b: [] }); setStatus("Loading reference geometry..."); setSaveBlocked(false); setNotice("")
        const instance = new Worker(new URL("../../engine/spatial/spatial-lab.worker.ts", import.meta.url))
        worker.current = instance
        instance.onmessage = event => {
            const data = event.data
            if (data.type === "ready") {
                const ref = data.reference as SpatialReference
                setReference(ref); setStats(data); setStatus("Reference ready")
                try {
                    const raw = localStorage.getItem(labKey(mapId))
                    setProject(raw ? parseLabProject(raw, ref) : emptyLabProject(ref))
                } catch { setProject(emptyLabProject(ref)); setSaveBlocked(true); setNotice("An earlier lab draft could not be opened. It is preserved. Download it with Recover draft before starting fresh.") }
            } else if (data.type === 'validation' && data.id === serial.current) { setAnnotationReport(data.report); setBusy(false); setStatus('Annotation checks complete') }
            else if (data.type === "result" && data.id === serial.current) { setResult(data); setBusy(false); setTime(0); setStatus("Checks complete") }
            else if (data.type === "error" && (data.id === undefined || data.id === serial.current)) { setStatus(data.message); setBusy(false) }
        }
        instance.onerror = () => { setStatus("The geometry worker could not start. Reload to retry."); setBusy(false) }
        instance.postMessage({ type: "load", mapId })
        return () => { instance.terminate(); worker.current = null }
    }, [mapId])
    useEffect(() => {
        if (!project || saveBlocked) return
        try { localStorage.setItem(labKey(project.mapId), JSON.stringify(project)) } catch { setNotice("Device storage is full. Save a project download to keep your lab work.") }
    }, [project, saveBlocked])
    useEffect(() => {
        serial.current++; setPlaying(false); setResult(null); setTime(0)
        if (!project?.a || !project.b || !reference) { setBusy(false); return }
        setBusy(true); setStatus("Checking route and visibility...")
        worker.current?.postMessage({ type: "query", id: serial.current, a: project.a, b: project.b, annotations, occupied: project.occupied, speed, options: { ...DEFAULT_ROUTE_OPTIONS, ladders, jumps: !!jumps, drops: !!drops, height, blocked: project.blocked, links: project.links } })
    }, [project, reference, ladders, jumps, drops, height, speed, annotations])
    useEffect(() => {
        if (!playing || !result?.frames.length) return
        let handle: number, last = performance.now()
        const end = result.frames[result.frames.length - 1].time
        const tick = (now: number) => { const dt = Math.min(0.1, (now - last) / 1000); last = now; setTime(previous => { const next = Math.min(end, previous + dt); return next }); handle = requestAnimationFrame(tick) }
        handle = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(handle)
    }, [playing, result])
    useEffect(() => { if (result?.frames.length && time >= result.frames[result.frames.length - 1].time) setPlaying(false) }, [time, result])

    const place = (which: "a" | "b", x: number, y: number) => {
        if (!nav || !reference || !project || saveBlocked) return
        const p = fromRadar(x, y, reference), options = nav.surfaces(p[0], p[1])
        if (!options.length) { setNotice("That point is outside the imported walking surfaces. Choose a colored surface."); return }
        const z = project[which]?.point[2] ?? (floor === "lower" ? -10000 : 10000)
        const nearest = [...options].sort((a, b) => Math.abs(a.point[2] - z) - Math.abs(b.point[2] - z))[0]
        setSurfaceOptions(previous => ({ ...previous, [which]: options })); edit({ ...project, [which]: nearest }); setNotice(""); setTarget(which === "a" ? "b" : "a")
    }
    const eventPoint = (event: React.PointerEvent | React.MouseEvent) => { const matrix = world.current?.getScreenCTM(); return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null }
    const locations = (which: "a" | "b") => { const p = project?.[which]; return p && nav ? nav.surfaces(p.point[0], p.point[1]) : surfaceOptions[which] }
    const display = (p: Vec3) => reference ? toRadar(p, reference).join(",") : "0,0"
    const frame = result?.frames[Math.min(result.frames.length - 1, Math.floor(time * 64))]
    const blocked = useMemo(() => new Set(project?.blocked), [project?.blocked])
    const routeAreas = useMemo(() => new Set(result?.route.areas), [result?.route.areas])
    const visibleAreas = useMemo(() => reference?.areas.filter(area => { const z = center(area)[2]; if (elevation === "all" || !project?.a) return true; const a = project.a.point[2]; return elevation === "near" ? Math.abs(z - a) < 48 : elevation === "below" ? z < a - 24 : z > a + 24 }) || [], [reference, elevation, project?.a])
    const surfaceLayer = useMemo(() => reference && (showNav ? visibleAreas : visibleAreas.filter(a => routeAreas.has(a.id) || blocked.has(a.id))).map(area => <polygon key={area.id} points={area.corners.map(p => toRadar(p, reference).join(",")).join(" ")} fill={blocked.has(area.id) ? "#ff5368" : routeAreas.has(area.id) ? "#a6f4d4" : `hsl(${185 + Math.max(-40, Math.min(40, center(area)[2] / 12))} 65% 58%)`} fillOpacity={blocked.has(area.id) ? 0.6 : routeAreas.has(area.id) ? 0.32 : 0.07} stroke={routeAreas.has(area.id) ? "#9cefd1" : "#6dabbd"} strokeOpacity={routeAreas.has(area.id) ? 0.8 : 0.2} strokeWidth={0.07 / zoom} pointerEvents="none" />), [reference, showNav, visibleAreas, routeAreas, blocked, zoom])
    const downloadRecovery = () => { try { const raw = localStorage.getItem(labKey(mapId)); if (raw) { const a = document.createElement("a"); const url = URL.createObjectURL(new Blob([raw], { type: "application/json" })); a.href = url; a.download = `${mapId}-lab-recovery.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) } } catch { setNotice("Storage could not be read.") } }
    const importFile = async (selected?: File) => {
        if (!selected || !reference) return
        try { if (selected.size > 250_000) throw new Error("Lab project is too large"); const next = parseLabProject(await selected.text(), reference); if (project) saveFile(project, "-before-import"); if (saveBlocked) downloadRecovery(); setSaveBlocked(false); edit(next); setNotice("Lab project opened. Your map drawings are stored separately.") } catch (error) { setNotice(error instanceof Error ? error.message : "Could not open the lab project") }
    }

    return <div className={styles.lab}>
        <header className={styles.header}><div className={styles.brand}><Link href="/map-editor" aria-label="Back to Map Studio"><ArrowLeft size={18} /></Link><div><h1>Simulation lab <span>MAP STUDIO</span></h1><p>Real surfaces. Connected movement. Inspectable sight lines.</p></div></div><div className={styles.actions}><a href="#controlled-encounter">Encounter lab</a><a href="#team-lab">Team lab</a><button disabled={!reference} onClick={() => file.current?.click()}><Upload size={15} />Open test</button><button disabled={!project || saveBlocked} onClick={() => project && saveFile(project)}><Download size={15} />Save test</button><input type="file" ref={file} hidden accept=".json" aria-label="Import lab project" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = "" }} /></div></header>
        {notice && <div className={styles.notice} role="status">{notice}<button onClick={() => setNotice("")}>Dismiss</button></div>}
        {saveBlocked && <div className={styles.notice}><button onClick={downloadRecovery}>Recover draft</button><button onClick={() => { downloadRecovery(); setSaveBlocked(false); setNotice("A fresh lab test is ready. Keep the recovery download.") }}>Start fresh after recovery</button></div>}
        <div className={styles.workspace}>
            <aside className={styles.panel}>
                <label>Map<select value={mapId} onChange={e => setMapId(e.target.value)}>{MAP_OPTIONS.map(m => <option key={m.id}>{m.id}</option>)}</select></label>
                <div className={styles.section}>PLACE TEST PLAYERS</div>
                <div className={styles.segment}><button aria-pressed={target === "a"} onClick={() => setTarget("a")}>A · Move from</button><button aria-pressed={target === "b"} onClick={() => setTarget("b")}>B · Destination</button></div>
                <p>Click a walking surface. Drag either marker to reposition it. At overlapping floors, choose the height below.</p>
                {(["a", "b"] as const).map(which => <label key={which}>Player {which.toUpperCase()} surface<select aria-label={`Player ${which.toUpperCase()} surface`} disabled={!project?.[which]} value={project?.[which]?.area || ""} onChange={e => { const next = locations(which).find(p => p.area === +e.target.value); if (next && project) edit({ ...project, [which]: next }) }}><option value="" disabled>Place on map</option>{locations(which).map((p, i) => <option key={p.area} value={p.area}>Height {p.point[2].toFixed(0)} · surface {i + 1}</option>)}</select></label>)}
                <div className={styles.section}>MOVEMENT</div>
                <label>Stance<select aria-label="Movement stance" value={height} disabled={!project || saveBlocked} onChange={e => configure({ height: +e.target.value as 54 | 72 })}><option value={72}>Standing</option><option value={54}>Crouching</option></select></label>
                <label>Pace<select value={height === 54 ? 85 : speed} onChange={e => configure({ speed: +e.target.value as 130 | 220 })} disabled={height === 54 || !project || saveBlocked}>{height === 54 ? <option value={85}>Crouch · 85 units/s</option> : <><option value={220}>Run · 220 units/s</option><option value={130}>Walk · 130 units/s</option></>}</select></label>
                <label className={styles.check}><input type="checkbox" checked={ladders} disabled={!project || saveBlocked} onChange={e => configure({ ladders: e.target.checked })} />Allow connected ladders</label>
                <p>Movement accelerates and brakes. Body checks stop blocked routes. Optional jump and drop tests are in Edit test connections; boosts are not implemented.</p>
                <details><summary>Edit test connections</summary><p>Block A&apos;s surface to test a reroute. Add a short, one-way connection between A and B. Your test overrides stay separate from source geometry.</p><button disabled={!project?.a || saveBlocked} onClick={() => { if (project?.a) edit({ ...project, blocked: blocked.has(project.a.area) ? project.blocked.filter(id => id !== project.a!.area) : [...project.blocked, project.a.area] }) }}>{project?.a && blocked.has(project.a.area) ? "Unblock A surface" : "Block A surface"}</button>
                    <div className={styles.actions}><button disabled={!project?.a || saveBlocked || (project.occupied?.length || 0) >= 10} onClick={() => project?.a && edit({ ...project, occupied: [...(project.occupied || []), project.a] })}>Reserve A for teammate</button><button disabled={!project?.occupied?.length || saveBlocked} onClick={() => project && edit({ ...project, occupied: [] })}>Clear teammates</button></div><p>{project?.occupied?.length || 0} stationary teammates. Move A away from the reservation to test an alternate route.</p>
                    <label className={styles.check}><input type="checkbox" checked={!!jumps} disabled={saveBlocked} onChange={e => configure({ jumps: e.target.checked })} />Test jump arcs</label>
                    <label className={styles.check}><input type="checkbox" checked={!!drops} disabled={saveBlocked} onChange={e => configure({ drops: e.target.checked })} />Test one-way drops</label>
                    <p>Experimental lab tuning. Arcs need clear takeoff, swept clearance and supported landing. Off by default.</p>
                    <div className={styles.actions}>{(['walk', 'ladder', 'jump', 'drop'] as const).map(kind => <button key={kind} disabled={!project?.a || !project.b || saveBlocked || project.links.length >= 100 || distance3(project.a.point, project.b.point) > 512} onClick={() => {
                        if (!project?.a || !project.b || !reference) return
                        try { const next = { ...project, links: [...project.links, { id: crypto.randomUUID(), from: project.a.area, to: project.b.area, start: project.a.point, end: project.b.point, kind }] }; edit(parseLabProject(JSON.stringify(next), reference)); setNotice('Directed connection added. Route and body checks still apply.') } catch (error) { setNotice(String(error)) }
                    }}>A <ArrowRight size={12} /> B {kind}</button>)}</div><p>{project?.blocked.length || 0} blocked surfaces · {project?.links.length || 0} authored links. Link reach: 512 units.</p><button disabled={!past.length} onClick={() => { setProject(past[past.length - 1]); setPast(past.slice(0, -1)) }}><RotateCcw size={13} />Undo last edit</button></details>
            </aside>
            <main className={styles.canvasPanel}>
                <div className={styles.canvasBar}><span className={styles.dot} /><strong>{mapId}</strong><span>REFERENCE {reference?.sourceVersion || "..."}</span><div className={styles.actions}><button aria-pressed={panning} onClick={() => setPanning(!panning)}>{panning ? "Pan active" : "Pan"}</button><button aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(Math.max(1, zoom - 0.5))}><Minus size={15} /></button><button aria-label="Fit map" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }) }}>{Math.round(zoom * 100)}%</button><button aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom(Math.min(3, zoom + 0.5))}><Plus size={15} /></button></div></div>
                <div className={styles.stage}>
                    {reference && <svg viewBox="0 0 100 100" aria-label={`${mapId} spatial test map`} style={{ cursor: panning ? "grab" : "crosshair" }} onPointerDown={e => { if (!panning) return; const matrix = e.currentTarget.getScreenCTM(); if (!matrix) return; const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse()); panStart.current = { x: p.x, y: p.y, offset }; e.currentTarget.setPointerCapture(e.pointerId) }} onPointerMove={e => { const start = panStart.current, matrix = e.currentTarget.getScreenCTM(); if (!start || !matrix) return; const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse()); setOffset({ x: start.offset.x + p.x - start.x, y: start.offset.y + p.y - start.y }) }} onClick={e => { if (ignoreClick.current || panning) { ignoreClick.current = false; return } const p = eventPoint(e); if (p) place(target, p.x, p.y) }} onPointerUp={e => { if (panStart.current) { panStart.current = null; ignoreClick.current = true } if (drag.current) { const p = eventPoint(e); if (p) place(drag.current, p.x, p.y); drag.current = null; ignoreClick.current = true } }} onPointerCancel={() => { drag.current = null; panStart.current = null }}>
                        <g ref={world} transform={`translate(${50 - 50 * zoom + offset.x} ${50 - 50 * zoom + offset.y}) scale(${zoom})`}>
                            <image href={floor === "lower" && reference.radars.lower ? reference.radars.lower : reference.radars.upper} width="100" height="100" opacity="0.7" />
                            {surfaceLayer}
                            {project?.occupied?.map((p, i) => { const xy = toRadar(p.point, reference); return <circle key={i} cx={xy[0]} cy={xy[1]} r={16 / (reference.transform.scale * 10.24)} fill="#de9eff" stroke="#f1cfff" strokeWidth={0.15 / zoom} pointerEvents="none" /> })}
                            {annotations?.registration && annotations.marks.filter(m => m.kind === 'wall' || ['ctspawn', 'tspawn', 'bombsite'].includes(m.kind)).map(mark => {
                                const points = mark.points.map(p => { const xy = registeredRadar(p, annotations.registration!); return `${xy.x},${xy.y}` }).join(' ')
                                return mark.kind === 'wall' ? <polyline key={mark.id} points={points} fill="none" stroke="#ff6578" strokeDasharray={mark.spatial ? undefined : '0.5 0.5'} strokeWidth={0.25 / zoom} pointerEvents="none" /> : <polygon key={mark.id} points={points} fill={mark.kind === 'ctspawn' ? '#64bbff' : mark.kind === 'tspawn' ? '#ffd380' : '#a9f2cc'} fillOpacity="0.15" stroke="#a9f2cc" strokeWidth={0.15 / zoom} pointerEvents="none" />
                            })}
                            {project?.links.map(link => <polyline key={link.id} points={[link.start, link.end].map(display).join(" ")} stroke="#bc9bff" strokeWidth={0.3 / zoom} strokeDasharray="0.6 0.3" pointerEvents="none" />)}
                            {result?.route.points.length ? <polyline points={result.route.points.map(display).join(" ")} fill="none" stroke="#b5ffe3" strokeWidth={0.35 / zoom} pointerEvents="none" /> : null}
                            {showSight && result && <g pointerEvents="none"><polyline points={[result.sight.from, result.sight.to].map(display).join(" ")} fill="none" stroke={result.sight.hit ? "#ff7181" : "#ffe390"} strokeWidth={0.25 / zoom} strokeDasharray="0.8 0.45" />{result.sight.hit && <circle cx={toRadar(result.sight.hit.point, reference)[0]} cy={toRadar(result.sight.hit.point, reference)[1]} r={0.8 / zoom} fill="#ff5368" stroke="white" strokeWidth={0.15 / zoom} />}</g>}
                            {(["a", "b"] as const).map(which => { const p = project?.[which]; if (!p) return null; const xy = toRadar(p.point, reference); return <g key={which} transform={`translate(${xy[0]} ${xy[1]})`} className={styles.marker} onPointerDown={e => { e.stopPropagation(); drag.current = which; (e.target as Element).setPointerCapture(e.pointerId) }}><circle r={1.25 / zoom} fill={which === "a" ? "#92cfff" : "#f5d17c"} stroke="#0e1926" strokeWidth={0.25 / zoom} /><text textAnchor="middle" dominantBaseline="central" fontSize={1.35 / zoom} fill="#101923" fontWeight="700" pointerEvents="none">{which.toUpperCase()}</text></g> })}
                            {frame && time > 0 && <g transform={`translate(${toRadar(frame.position, reference).join(' ')}) rotate(${-(frame.heading || 0) * 180 / Math.PI})`} pointerEvents="none"><circle r={0.65 / zoom} fill="white" stroke="#79ffc7" strokeWidth={0.3 / zoom} /><path d={`M ${0.5 / zoom} ${-0.35 / zoom} L ${1.25 / zoom} 0 L ${0.5 / zoom} ${0.35 / zoom}`} fill="#79ffc7" /></g>}
                        </g>
                    </svg>}
                    {!reference && <div className={styles.loading} role="status">{status}</div>}
                </div>
                <div className={styles.playback}><button aria-label={playing ? "Pause movement" : "Play movement"} disabled={!result?.frames.length || busy} onClick={() => { if (result && time >= result.frames[result.frames.length - 1].time) setTime(0); setPlaying(!playing) }}>{playing ? <Pause size={17} /> : <Play size={17} />}</button><button aria-label="Restart movement" disabled={!result?.frames.length} onClick={() => { setTime(0); setPlaying(false) }}><RotateCcw size={16} /></button><input aria-label="Movement timeline" type="range" min="0" max={result?.frames.at(-1)?.time || 1} step="0.015625" value={time} disabled={!result?.frames.length} onChange={e => { setPlaying(false); setTime(+e.target.value) }} /><span>{time.toFixed(1)}s / {(result?.frames.at(-1)?.time || 0).toFixed(1)}s</span></div>
                <div className={styles.status} role="status">{busy ? "Checking geometry in background..." : status}<span>{frame ? `${frame.state} · height ${frame.position[2].toFixed(0)}` : "Place A and B to begin"}</span></div>
            </main>
            <aside className={styles.panel}>
                <MapCoordinateInput label="Test actor A" action="Place A" disabled={!reference || !project || saveBlocked || busy} onApply={point => place("a", point.x, point.y)} />
                <MapCoordinateInput label="Test actor B" action="Place B" disabled={!reference || !project || saveBlocked || busy} onApply={point => place("b", point.x, point.y)} />
                <div className={styles.card}><h2>Map Studio geometry</h2><p>Preview registered drawings here. Solid red walls have height bindings; dotted walls are drawings only. Release inclusion remains held.</p>
                    <button disabled={!reference || !project || saveBlocked} onClick={() => { try {
                        const raw = localStorage.getItem(projectKey({ mapId, floor: floor as 'upper' | 'lower' }))
                        if (!raw) throw Error('Save an annotation project in Map Studio first.')
                        const p = parseProject(raw)
                        if (!reference || !project || !registrationMatches(p, reference)) throw Error('Open Map Studio validation and register this floor first.')
                        const geometry = { ...p, validation: undefined, marks: p.marks.filter(m => ['wall', 'ctspawn', 'tspawn', 'bombsite'].includes(m.kind)) }
                        edit({ ...project, annotations: geometry }); setNotice('Draft geometry is included in this lab test. Career matches are unchanged.')
                    } catch (error) { setNotice(String(error)) } }}>Load Studio geometry</button>
                    {annotations && <><button disabled={busy} onClick={() => { serial.current++; setBusy(true); setPlaying(false); worker.current?.postMessage({ type: 'validate', id: serial.current, project: annotations }); setStatus('Checking zones…') }}>Check spawn / site zones</button><button disabled={saveBlocked} onClick={() => { if (project) edit({ ...project, annotations: undefined }) }}>Remove preview geometry</button></>}
                    {annotationReport?.zones.map(zone => <div key={zone.id}><p>{zone.label}: {zone.safe}/{zone.samples} clear samples</p>{zone.point && <div className={styles.actions}><button disabled={saveBlocked} onClick={() => project && edit({ ...project, a: zone.point })}>Start here</button><button disabled={saveBlocked} onClick={() => project && edit({ ...project, b: zone.point })}>Go here</button></div>}</div>)}
                    {annotationReport && <p>{annotationReport.receipt.errors} geometry issues. Refine them in Map Studio before acceptance.</p>}
                </div>
                <div className={styles.section}>INSPECTION</div>
                <div className={styles.card}><h2><Footprints size={16} />Route</h2><strong>{busy ? "Checking..." : result?.route.points.length ? `${result.route.distance.toFixed(0)} units` : "No route yet"}</strong><p>{result?.route.reason || (result ? `${result.route.areas.length} connected surfaces. ${result.route.rejected} transitions rejected by movement checks.` : "Choose a start and destination on the map.")}</p>{frame?.reason && <p className={styles.warning}>{frame.reason}</p>}</div>
                <div className={styles.card}><h2><Eye size={16} />Eye-to-eye visibility</h2><strong className={result?.sight.hit ? styles.warning : ""}>{result ? result.sight.hit ? "Blocked by geometry" : "Clear in this reference" : "Awaiting players"}</strong><p>{result?.sight.hit ? `Red marker: first hit at height ${result.sight.hit.point[2].toFixed(0)}.` : "The test includes height, floors and ceilings."} Static line of sight only; smoke, facing and breakable state are not included.</p></div>
                <div className={styles.section}><Layers size={14} /> VIEW & HEIGHT</div>
                <label className={styles.check}><input type="checkbox" checked={showNav} onChange={e => setShowNav(e.target.checked)} />Walking surfaces</label><label className={styles.check}><input type="checkbox" checked={showSight} onChange={e => setShowSight(e.target.checked)} />Sight line</label>
                <label>Show elevations<select value={elevation} onChange={e => setElevation(e.target.value)}><option value="all">All elevations</option><option value="near" disabled={!project?.a}>Near player A</option><option value="below" disabled={!project?.a}>Below player A</option><option value="above" disabled={!project?.a}>Above player A</option></select></label>
                {reference?.radars.lower && <label>Radar background<select value={floor} onChange={e => setFloor(e.target.value)}><option value="upper">Upper</option><option value="lower">Lower</option></select></label>}
                <div className={styles.reference}><b>{reference?.areas.length.toLocaleString() || "..."} surfaces · {reference?.ladders.length || 0} ladders</b><p>{stats.triangles.toLocaleString()} collision triangles. {stats.excludedPortals} ambiguous edge portals excluded.</p><a href={reference?.sourceUrl || "https://github.com/pnxenopoulos/awpy-data"} target="_blank" rel="noreferrer">View reference source ↗</a><p>Approximate static mesh, pinned to one map version. This lab does not yet determine live match results. Your existing Map Studio drawings remain saved separately.</p></div>
            </aside>
        </div>
        <EncounterLab project={project} reference={reference} worker={worker} disabled={saveBlocked} edit={edit} />
        <TeamLab project={project} reference={reference} worker={worker} disabled={saveBlocked} edit={edit} />
    </div>
}
