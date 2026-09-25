"use client"
import { useEffect, useRef, useState } from 'react'
import { MARK_TOOLS, type MapAnnotationProject } from '@/lib/map-annotations'
import type { AnnotationReport } from '@/engine/spatial/annotations'
import { annotationSignature, parseRegistration, type MapRegistration } from '@/engine/spatial/registration'
import type { SpatialReference } from '@/engine/spatial/types'
import styles from './map-editor.module.css'

export function MapValidationPanel({ project, disabled, onChange, onSelect, onOverlay }: { project: MapAnnotationProject; disabled: boolean; onChange: (p: MapAnnotationProject) => void; onSelect: (id: string) => void; onOverlay: (ref: SpatialReference | null) => void }) {
    const [open, setOpen] = useState(false), [status, setStatus] = useState(''), [report, setReport] = useState<AnnotationReport | null>(null), [reference, setReference] = useState<SpatialReference | null>(null)
    const [preset, setPreset] = useState<MapRegistration | null>(null), [overlay, setOverlay] = useState(false)
    const worker = useRef<Worker | null>(null), serial = useRef(0)
    const signature = annotationSignature(project)
    useEffect(() => {
        if (!open) return
        let disposed = false
        setReport(null); setReference(null); setPreset(null); setStatus('Loading geometry…')
        fetch('/map-studio/registration.json').then(r => { if (!r.ok) throw Error(); return r.json() }).then(data => {
            const row = data.maps.find((r: { mapId: string; floor: string }) => r.mapId === project.mapId && r.floor === project.floor)
            if (!disposed && row?.registration) setPreset(parseRegistration(row.registration))
        }).catch(() => { if (!disposed) setStatus('Alignment presets unavailable. Reopen to retry.') })
        const instance = new Worker(new URL('../../engine/spatial/spatial-lab.worker.ts', import.meta.url)); worker.current = instance
        instance.onmessage = event => {
            const data = event.data
            if (data.type === 'ready') { setReference(data.reference); setStatus('Geometry ready') }
            if (data.type === 'validation' && data.id === serial.current) { setReport(data.report); setStatus('Checks complete') }
            if (data.type === 'error' && (data.id === undefined || data.id === serial.current)) setStatus(data.message)
        }
        instance.onerror = () => setStatus('Geometry worker failed. Close and reopen validation to retry.')
        instance.postMessage({ type: 'load', mapId: project.mapId })
        return () => { disposed = true; serial.current++; instance.terminate(); worker.current = null }
    }, [open, project.mapId, project.floor])
    useEffect(() => {
        setReport(null); serial.current++
        if (!reference || !open) return
        const id = serial.current, timer = setTimeout(() => { setStatus('Checking walls, floors and routes…'); worker.current?.postMessage({ type: 'validate', id, project }) }, 250)
        return () => clearTimeout(timer)
    // Receipt-only changes do not start another expensive validation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature, reference, open])
    useEffect(() => { onOverlay(open && overlay ? reference : null); return () => onOverlay(null) }, [open, overlay, reference, onOverlay])
    const selectMark = (id: string) => { setOpen(false); onSelect(id) }
    const markingName = (id: string) => { const index = project.marks.findIndex(m => m.id === id), mark = project.marks[index]; return mark ? mark.label || `${MARK_TOOLS[mark.kind].label} ${index + 1}` : 'marking' }
    const modify = (matrix: MapRegistration['matrix']) => { if (project.registration) onChange({ ...project, registration: { ...project.registration, matrix, method: 'manual', confidence: 'provisional' } }) }
    return <section className={`${styles.presetCard} ${styles.validationPanel}`} aria-label="Map validation">
        <button className={styles.button} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Close validation' : 'Validate map geometry'}</button>
        {!open && <p>{project.validation?.signature === signature ? `Saved check: ${project.validation.errors} issues to fix. Reopen to recheck.` : 'Align drawings, choose floors, then test spawns and plant zones.'}</p>}
        {open && <>
            <b>Geometry review · Release held</b><p>Checks use an approximate static reference. A passed check does not approve a map for release.</p>
            <p role="status">{status}</p>
            <button className={styles.button} disabled={disabled || !preset} onClick={() => preset && onChange({ ...project, registration: structuredClone(preset) })}>{project.registration ? 'Reset to measured alignment' : 'Use measured alignment'}</button>
            <p>{project.registration?.evidence || preset?.evidence || 'No measured alignment available.'}</p>
            {project.registration && <>
                <label className={styles.check}><input type="checkbox" checked={overlay} onChange={e => setOverlay(e.target.checked)} />Overlay reference radar</label>
                <details><summary>Adjust alignment</summary><p>Match stairs and site corners on both radars. Moving drawings invalidates their previous check.</p>
                    {(['Horizontal scale', 'Horizontal shear', 'Horizontal offset (%)', 'Vertical shear', 'Vertical scale', 'Vertical offset (%)'] as const).map((label, i) => <label className={styles.field} key={label}>{label}<input type="number" aria-label={label} step={i === 2 || i === 5 ? 0.05 : 0.001} disabled={disabled} value={project.registration!.matrix[i]} onChange={e => { const n = e.target.valueAsNumber; if (!Number.isFinite(n) || Math.abs(n) > 1000) return; const matrix = [...project.registration!.matrix] as MapRegistration['matrix']; matrix[i] = n; if (Math.abs(matrix[0] * matrix[4] - matrix[1] * matrix[3]) > 0.00001) modify(matrix) }} /></label>)}
                </details>
                <label className={styles.check}><input type="checkbox" checked={project.registration.confidence === 'reviewed'} disabled={disabled} onChange={e => onChange({ ...project, registration: { ...project.registration!, confidence: e.target.checked ? 'reviewed' : 'provisional' } })} />I checked matching landmarks</label>
            </>}
            {report && <>
                <b>{report.receipt.errors} issues to fix · {report.receipt.warnings} review notes</b><p>{report.wallsUsed} height-bound walls used in the preview. Unbound red lines stay drawings.</p>
                {report.zones.map(zone => <div key={zone.id} className={styles.unplaced}>
                    <button className={styles.button} onClick={() => selectMark(zone.id)}>{zone.label}</button>
                    <p>{zone.safe}/{zone.samples} clear inset samples · {zone.exits} sampled exits</p>
                    {zone.spawnPositions && <p>{zone.spawnPositions.length}/5 separated player positions found</p>}
                    <label className={styles.field}>Bind ground height<select aria-label={`Ground height for ${zone.id}`} disabled={disabled || project.marks.find(m => m.id === zone.id)?.locked} value="" onChange={e => { if (!e.target.value) return; const z = Number(e.target.value); onChange({ ...project, marks: project.marks.map(m => m.id === zone.id ? { ...m, status: 'draft', spatial: { ...m.spatial, floorId: `${project.floor} @ ${Math.round(z)}`, zMin: z - 16, zMax: z + 16 } } : m) }) }}><option value="">Choose a reference surface…</option>{zone.candidates.map((p, i) => <option key={i} value={p.point[2]}>Height {p.point[2].toFixed(1)} · surface {p.area}</option>)}</select></label>
                </div>)}
                <details open><summary>Issues and review notes</summary>{report.issues.map((issue, i) => <div className={styles.unplaced} key={i}><p>{issue.severity === 'error' ? 'Fix' : 'Review'}: {issue.message}</p>{issue.markId && <button className={styles.button} onClick={() => selectMark(issue.markId!)}>Show {markingName(issue.markId!)}</button>}</div>)}</details>
                <button className={styles.button} disabled={disabled} onClick={() => onChange({ ...project, validation: report.receipt })}>Save check with project</button>
                <p>Geometry edits make saved checks stale. Undo restores the prior drawing and its check. Save project downloads both.</p>
            </>}
        </>}
    </section>
}
