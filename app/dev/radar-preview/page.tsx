"use client"

import { useMemo, useState } from "react"
import { MapId } from "@/types"
import type { MatchEvent } from "@/types/match"
import { computeRadarPositions } from "@/lib/radar-position-engine"
import { MapRadarPanel } from "@/components/match/MapRadarPanel"

/**
 * Dev-only preview for the live-match radar (incl. the 2.5D perspective mode).
 * The radar only renders inside a live match, so this drives a fabricated round
 * through the real position engine to inspect/tune the look in isolation.
 * Not linked in nav — open /dev/radar-preview directly.
 */
const MAPS: { id: MapId; name: string }[] = [
    { id: MapId.MIRAGE, name: "Mirage" },
    { id: MapId.SANDSTONE, name: "Dust II" },
    { id: MapId.INFERNO, name: "Inferno" },
    { id: MapId.NUKE, name: "Nuke" },
    { id: MapId.ANCIENT, name: "Ancient" },
]

const home = [1, 2, 3, 4, 5].map(i => ({ id: `h${i}`, nickname: `HOME${i}`, isDead: false, money: 4500 }))
const away = [1, 2, 3, 4, 5].map(i => ({ id: `a${i}`, nickname: `AWAY${i}`, isDead: false, money: 3200 }))

// A fabricated round: home are T (attackers), plant A, a few duels along the way.
const events: MatchEvent[] = [
    { type: "KILL", time: 16, killerId: "h1", victimId: "a3", weapon: "ak47", isHeadshot: true, side: "t" },
    { type: "KILL", time: 22, killerId: "a2", victimId: "h4", weapon: "m4a1s", side: "ct" },
    { type: "PLANT", time: 36, playerId: "h1", details: "Bombsite A", side: "t" },
    { type: "KILL", time: 44, killerId: "a5", victimId: "h2", weapon: "awp", side: "ct" },
    { type: "KILL", time: 47, killerId: "h3", victimId: "a5", weapon: "deagle", isHeadshot: true, side: "t" },
    { type: "ROUND_END", time: 75 },
]

export default function RadarPreviewPage() {
    const [mapIdx, setMapIdx] = useState(0)
    const [time, setTime] = useState(48)
    const map = MAPS[mapIdx]

    const radar = useMemo(
        () => computeRadarPositions(map.id, time, events, home, away, false, 5, 1337),
        [map.id, time]
    )

    return (
        <div className="max-w-md mx-auto space-y-4">
            <div>
                <h1 className="text-xl font-bold uppercase tracking-tight">Radar Preview <span className="text-white/30 text-sm">(dev)</span></h1>
                <p className="text-xs text-white/40">Mock round → real position engine → MapRadarPanel. Toggle 2.5D in the panel header.</p>
            </div>

            <div className="flex flex-wrap gap-2">
                {MAPS.map((m, i) => (
                    <button
                        key={m.id}
                        onClick={() => setMapIdx(i)}
                        className={`px-3 py-1 rounded-lg text-xs border transition-colors ${i === mapIdx ? "bg-white/15 border-white/30 text-white" : "bg-white/5 border-white/10 text-white/50 hover:text-white/80"}`}
                    >
                        {m.name}
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-3">
                <span className="text-xs text-white/40 w-12 tabular-nums">t = {time}s</span>
                <input
                    type="range" min={0} max={75} value={time}
                    onChange={e => setTime(Number(e.target.value))}
                    className="flex-1 accent-cyan-400"
                />
            </div>

            <MapRadarPanel
                currentMapId={map.id}
                mapName={map.name}
                radarDots={radar.dots}
                bombState={radar.bomb}
                currentTime={time}
                killLines={radar.killLines}
                sitePositions={{ a: radar.aSite, b: radar.bSite }}
                smokes={radar.smokes}
            />
        </div>
    )
}
