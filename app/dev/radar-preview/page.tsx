"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import type { MatchEvent } from "@/types/match"
import { computeRadarPositions } from "@/lib/radar-position-engine"
import { ACTIVE_MAP_POOL, getMapName } from "@/data/map-pool"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import teams from "@/public/data/snapshot/teams.json"
import type { TeamBranding } from "@/data/snapshot-types"
import { MapRadarPanel } from "@/components/match/MapRadarPanel"

/**
 * Dev-only preview for the live-match radar (incl. the 2.5D perspective mode).
 * The radar only renders inside a live match, so this drives a fabricated round
 * through the real position engine to inspect/tune the look in isolation.
 * Not linked in nav — open /dev/radar-preview directly.
 */
const MAPS = ACTIVE_MAP_POOL.map(id => ({ id, name: getMapName(id) }))

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
    const [time, setTime] = useState(0)
    const [playing, setPlaying] = useState(false)
    const [speed, setSpeed] = useState(1)
    const map = MAPS[mapIdx]

    useEffect(() => {
        if (!playing) return
        const timer = window.setInterval(() => setTime(t => Math.min(75, Math.round((t + 0.1 * speed) * 10) / 10)), 100)
        return () => window.clearInterval(timer)
    }, [playing, speed])
    useEffect(() => { if (time >= 75) setPlaying(false) }, [time])

    const radar = useMemo(
        () => computeRadarPositions(map.id, time, events, home, away, false, 5, 1337),
        [map.id, time]
    )

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div>
                <h1 className="text-xl font-bold uppercase tracking-tight">Radar Preview <span className="text-white/30 text-sm">(dev)</span></h1>
                <p className="text-xs text-white/40">Mock round → real position engine → MapRadarPanel. 2D tactical view.</p>
            </div>

            <div className="flex flex-wrap gap-2">
                {MAPS.map((m, i) => (
                    <button
                        key={m.id}
                        onClick={() => { setMapIdx(i); setTime(0); setPlaying(false) }}
                        className={`px-3 py-1 rounded-lg text-xs border transition-colors ${i === mapIdx ? "bg-white/15 border-white/30 text-white" : "bg-white/5 border-white/10 text-white/50 hover:text-white/80"}`}
                    >
                        {m.name}
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-3">
                <button className="rounded-lg border border-white/20 px-3 py-2 text-sm" aria-pressed={playing} onClick={() => { if (time >= 75) setTime(0); setPlaying(p => !p) }}>{playing ? 'Pause preview' : 'Play preview'}</button>
                <button className="rounded-lg border border-white/20 px-3 py-2 text-sm" onClick={() => { setPlaying(false); setTime(0) }}>Restart</button>
                <select aria-label="Preview playback speed" value={speed} onChange={e => setSpeed(Number(e.target.value))} className="rounded-lg bg-slate-900 p-2"><option value={1}>1x</option><option value={2}>2x</option></select>
                <span className="text-xs text-white/40 w-12 tabular-nums">t = {time}s</span>
                <input
                    aria-label="Preview round time"
                    type="range" min={0} max={75} step={0.1} value={time}
                    onChange={e => { setPlaying(false); setTime(Number(e.target.value)) }}
                    className="flex-1 accent-cyan-400"
                />
            </div>

            <div className="max-w-2xl mx-auto">
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
            <section className="glass-card rounded-3xl p-5">
                <h2 className="text-lg font-semibold mb-1">Individual logo redesigns: first study</h2>
                <p className="text-xs text-slate-400 mb-5">Preserved reference on the left; new fictional club mark at 36px and 80px.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {([
                        ["team_3_falconry", "falcons"],
                        ["team_6_perivesion", "parivision"],
                        ["team_11_eurora", "aurora"],
                    ] as const).map(([id, source]) => {
                        const team = teams.find(team => team.id === id)!
                        return <div key={id} className="rounded-2xl border border-white/10 p-4">
                            <div className="flex items-center justify-center gap-5 h-24">
                                <Image src={`/assets/teams/${source}/logo.original.webp`} alt={`${source} preserved reference`} width={48} height={48} unoptimized className="object-contain opacity-70" />
                                {[36, 80].map(size => <TeamLogoDisplay key={size} team={{ ...team, branding: team.branding as TeamBranding }} size={size} />)}
                            </div>
                            <p className="text-sm text-center mt-3">{team.name}</p>
                        </div>
                    })}
                </div>
            </section>
            <section className="glass-card rounded-3xl p-5">
                <h2 className="text-lg font-semibold mb-4">Team identity at match and table sizes</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {teams.slice(0, 12).map(team => <div key={team.id} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                        <div className="flex items-center justify-center gap-4 mb-3">
                            {[24, 36, 72].map(size => <TeamLogoDisplay key={size} team={{...team, branding: team.branding as TeamBranding}} size={size} />)}
                        </div>
                        <p className="text-xs text-slate-300 text-center">{team.name}</p>
                    </div>)}
                </div>
            </section>
        </div>
    )
}
