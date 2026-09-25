"use client"

import { useState } from 'react'
import type { MapMark } from '@/lib/map-annotations'
import { MapCoordinateInput } from './MapCoordinateInput'

export function MapPointEditor({ mark, disabled, onChange }: { mark: MapMark; disabled: boolean; onChange: (mark: MapMark) => void }) {
    const [selection, setSelection] = useState(0)
    const index = Math.min(selection, mark.points.length - 1)
    const point = mark.points[index]
    if (!point) return null
    return <details className="space-y-2">
        <summary className="cursor-pointer py-2 text-sm">Edit point coordinates</summary>
        <label className="block text-sm">Point
            <select aria-label="Point to edit" className="my-2 w-full rounded border border-white/20 bg-slate-950 p-2" value={index} onChange={event => setSelection(Number(event.target.value))}>
                {mark.points.map((p, i) => <option key={i} value={i}>Point {i + 1}: {p.x.toFixed(1)}, {p.y.toFixed(1)}</option>)}
            </select>
        </label>
        <MapCoordinateInput key={`${index}:${point.x}:${point.y}`} initialPoint={point} label={`Edit point ${index + 1}`} action="Apply coordinates" disabled={disabled || !!mark.locked}
            onApply={next => { if (!disabled && !mark.locked) onChange({ ...mark, status: 'draft', points: mark.points.map((p, i) => i === index ? next : p) }) }} />
    </details>
}
