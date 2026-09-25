"use client"

import { useId, useState } from 'react'
import { parseMapCoordinates } from '@/lib/map-coordinate-input'
import type { MapPoint } from '@/lib/map-annotations'

export function MapCoordinateInput({ label, action, disabled, onApply, initialPoint = { x: 50, y: 50 } }: {
    label: string; action: string; disabled: boolean; onApply: (point: MapPoint) => void; initialPoint?: MapPoint
}) {
    const id = useId()
    const [x, setX] = useState(String(initialPoint.x)), [y, setY] = useState(String(initialPoint.y))
    const point = parseMapCoordinates(x, y)
    return <fieldset disabled={disabled} className="min-w-0 space-y-2 rounded-lg border border-white/15 p-3 text-sm">
        <legend className="px-1 font-medium">{label}</legend>
        <p id={`${id}-help`} className="text-xs text-slate-300">Map coordinates: 0–100%. X goes right; Y goes down.</p>
        <div className="flex flex-wrap gap-2">
            {(['X', 'Y'] as const).map(axis => <label key={axis} className="flex min-w-0 flex-1 items-center gap-2">{axis}
                <input aria-label={`${label} ${axis}`} aria-describedby={`${id}-help`} type="number" min={0} max={100} step={0.1}
                    className="w-full min-w-0 rounded border border-white/20 bg-slate-950 px-2 py-1.5" value={axis === 'X' ? x : y}
                    onChange={event => (axis === 'X' ? setX : setY)(event.target.value)} />
            </label>)}
        </div>
        {!point && <p role="status" className="text-xs text-amber-200">Enter both coordinates between 0 and 100.</p>}
        <button type="button" className="w-full rounded border border-white/20 px-3 py-2 disabled:opacity-50" disabled={disabled || !point} onClick={() => { if (point) onApply(point) }}>{action}</button>
    </fieldset>
}
