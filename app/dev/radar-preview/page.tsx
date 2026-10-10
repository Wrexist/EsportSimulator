"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { simulationEngineV2 } from "@/engine/match-simulation"
import { createLegacySeriesState, playLegacyRound, type LegacyRoundStep, type LegacySeriesContext } from "@/engine/match/legacy-series"
import { buildLiveRoundScript, liveRoundMap } from "@/lib/live-round-script"
import { ACTIVE_MAP_POOL, getMapName } from "@/data/map-pool"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import teams from "@/public/data/snapshot/teams.json"
import type { TeamBranding } from "@/data/snapshot-types"
import { MapRadarPanel } from "@/components/match/MapRadarPanel"
import { MapId, type CustomTactics, type Match, type Player, type Team } from "@/types"

/**
 * Dev-only preview for the live-match radar. The radar only renders inside a
 * live match, so this plays a fabricated BO1 on the chosen map through the
 * real resolver (legacy series), builds each round's script exactly like the
 * live screen does and feeds it to the same MapRadarPanel.
 * Not linked in nav — open /dev/radar-preview directly
 * (`?map=Nuke&round=4&t=40` jumps straight to a moment).
 */
// Every map with a round map (the active pool plus reserve maps such as Nuke).
const MAPS = [...ACTIVE_MAP_POOL, ...(Object.values(MapId) as MapId[]).filter(id => !ACTIVE_MAP_POOL.includes(id))].map(id => ({ id, name: getMapName(id) }))
const ROLES = ["AWPER", "IGL", "ENTRY_FRAGGER", "SUPPORT", "RIFLER"]
const NAMES = { H: ["kyto", "Blaze", "nexa", "Rook", "Velo"], A: ["Mako", "zent", "Orrin", "Frost", "pyx"] }
const UTILITY = [["smoke", "flash"], ["smoke", "molotov"], ["flash", "flash"], ["he", "smoke"], ["molotov", "smoke"]]

function mockPlayer(id: string, nickname: string, role: string): Player {
    const skill = 72
    return {
        id, name: nickname, nickname, age: 22, nationality: "X", portraitPath: "", role, tier: "PRO",
        skill, awp: skill, rifle: skill, pistol: skill, grenades: skill, creativity: skill, clutch: skill, tactic: skill,
        entry: skill, trading: skill, leader: skill, teamwork: skill, morale: 70, amicability: 50, productivity: 50,
        stressResistance: 60, loyalty: 50, reaction: skill, eyesight: skill, health: 100, strength: 50, endurance: 50,
        form: 70, fatigue: 0, potential: skill, energy: 100, maxEnergy: 100, matchesPlayed: 0, roundsPlayed: 0,
        avgRating: 1, clutchSuccessRate: 0,
        contract: { playerId: id, salaryPerWeek: 0, startWeek: 0, endWeek: 52, buyout: 0 }, traits: [], perks: [],
    } as unknown as Player
}

function mockTeam(id: string, players: Player[], playstyle: string): Team {
    return {
        id, name: id, tier: "PRO", logoPath: "", roster: players.map(p => p.id), staff: [], reputation: 50, fanbase: 0,
        chemistry: 60, facilitiesLevel: 1, trainingSlotsUsed: 0, maxTrainingSlots: 10, budget: 0, tacticalPrep: 0,
        equipment: [], playstyle,
    } as unknown as Team
}

/** The previewed (home) team buys grenades in every buy so rounds show utility. */
function utilityTactics(): CustomTactics {
    const side = (primary: string, kit: boolean) => ({
        playerLoadouts: UTILITY.map((utility, slotIndex) => ({ slotIndex, primaryWeaponId: primary, secondaryWeaponId: "deagle", armorTier: "HEAVY" as const, hasKit: kit, utility })),
    })
    const both = { ct: side("m4a4", true), t: side("ak47", false) }
    return { ECO: both, FORCE: both, SEMIBUY: both, FULL: both, "DOUBLE AWP": both } as unknown as CustomTactics
}

const homePlayers = ROLES.map((r, i) => mockPlayer(`h${i + 1}`, NAMES.H[i], r))
const awayPlayers = ROLES.map((r, i) => mockPlayer(`a${i + 1}`, NAMES.A[i], r))
const PLAYER_INFO = Object.fromEntries([...homePlayers, ...awayPlayers].map(p => [p.id, { name: p.nickname, money: 4800 }]))

/** One BO1 on the map through the canonical series stepper. */
function playSeries(mapId: MapId, seed: number): { ctx: LegacySeriesContext; steps: LegacyRoundStep[] } {
    const home = mockTeam("HOME", homePlayers, "aggressive"), away = mockTeam("AWAY", awayPlayers, "structured")
    const match = { id: `radar_preview_${mapId}_${seed}`, homeTeamId: "HOME", awayTeamId: "AWAY", format: "BO1", seed, date: new Date(0), mapVeto: [], vetoComplete: true, maps: [mapId], mapResults: [], roundHistory: [] } as unknown as Match
    const ctx = simulationEngineV2.createSeriesContext(match, home, away, homePlayers, awayPlayers, {}, {}, [mapId], utilityTactics(), "HOME")
    let state = createLegacySeriesState(ctx)
    const steps: LegacyRoundStep[] = []
    while (!state.finished && steps.length < 60) {
        const step = playLegacyRound(ctx, state)
        steps.push(step)
        state = step.state
    }
    return { ctx, steps }
}

export default function RadarPreviewPage() {
    const [mapIdx, setMapIdx] = useState(0)
    const [roundIdx, setRoundIdx] = useState(0)
    const [time, setTime] = useState(0)
    const [playing, setPlaying] = useState(false)
    const [speed, setSpeed] = useState(1)
    const map = MAPS[mapIdx]

    // ?map=Nuke&round=4&t=40 (capture scripts jump straight to a moment).
    useEffect(() => {
        const q = new URLSearchParams(window.location.search)
        const m = MAPS.findIndex(x => x.id.toLowerCase() === (q.get("map") || "").toLowerCase())
        if (m >= 0) setMapIdx(m)
        const r = Number(q.get("round"))
        if (Number.isFinite(r) && r >= 1) setRoundIdx(r - 1)
        const t = Number(q.get("t"))
        if (Number.isFinite(t) && t > 0) setTime(t)
    }, [])

    const series = useMemo(() => playSeries(map.id, 1337), [map.id])
    const steps = series.steps
    const step = steps[Math.min(roundIdx, steps.length - 1)]
    const live = useMemo(() => step
        ? buildLiveRoundScript({ ctx: series.ctx, mapId: map.id, mapIndex: 0, round: step.round, loadouts: { ...step.preRound.home, ...step.preRound.away } })
        : null, [series, step, map.id])
    const roundMap = useMemo(() => liveRoundMap(map.id) ?? null, [map.id])
    const end = Math.ceil(live?.script.endTime ?? 75)

    // Whole-second ticks like the live match; the radar glides between them.
    useEffect(() => {
        if (!playing) return
        const timer = window.setInterval(() => setTime(t => Math.min(end, Math.floor(t) + 1)), 1000 / speed)
        return () => window.clearInterval(timer)
    }, [playing, speed, end])
    useEffect(() => { if (time >= end) setPlaying(false) }, [time, end])

    const plan = live?.script.plan
    const events = step?.round.events ?? []

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div>
                <h1 className="text-xl font-bold uppercase tracking-tight">Radar Preview <span className="text-white/30 text-sm">(dev)</span></h1>
                <p className="text-xs text-white/40">Fabricated BO1 → real resolver → round script → MapRadarPanel (the live match path).</p>
            </div>

            <div className="flex flex-wrap gap-2">
                {MAPS.map((m, i) => (
                    <button
                        key={m.id}
                        onClick={() => { setMapIdx(i); setRoundIdx(0); setTime(0); setPlaying(false) }}
                        className={`px-3 py-1 rounded-lg text-xs border transition-colors ${i === mapIdx ? "bg-white/15 border-white/30 text-white" : "bg-white/5 border-white/10 text-white/50 hover:text-white/80"}`}
                    >
                        {m.name}
                    </button>
                ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <button className="rounded-lg border border-white/20 px-3 py-2 text-sm" onClick={() => { setRoundIdx(r => Math.max(0, r - 1)); setTime(0); setPlaying(false) }}>Previous round</button>
                <span className="text-sm tabular-nums">Round {step?.round.roundNumber ?? "-"} / {steps.length}</span>
                <button className="rounded-lg border border-white/20 px-3 py-2 text-sm" onClick={() => { setRoundIdx(r => Math.min(steps.length - 1, r + 1)); setTime(0); setPlaying(false) }}>Next round</button>
                <button className="rounded-lg border border-white/20 px-3 py-2 text-sm" aria-pressed={playing} onClick={() => { if (time >= end) setTime(0); setPlaying(p => !p) }}>{playing ? "Pause preview" : "Play preview"}</button>
                <button className="rounded-lg border border-white/20 px-3 py-2 text-sm" onClick={() => { setPlaying(false); setTime(0) }}>Restart</button>
                <select aria-label="Preview playback speed" value={speed} onChange={e => setSpeed(Number(e.target.value))} className="rounded-lg bg-slate-900 p-2">
                    {[1, 2, 4].map(s => <option key={s} value={s}>{s}x</option>)}
                </select>
                <span className="text-xs text-white/40 w-14 tabular-nums">t = {time.toFixed(1)}s</span>
                <input
                    aria-label="Preview round time"
                    type="range" min={0} max={end} step={0.1} value={time}
                    onChange={e => { setPlaying(false); setTime(Number(e.target.value)) }}
                    className="flex-1 min-w-[200px] accent-cyan-400"
                />
            </div>
            <p className="text-xs text-white/50" data-testid="radar-preview-plan">
                {plan ? `${plan.tStrategy} → ${plan.site} vs ${plan.ctSetup}` : "no script"} · {step?.round.winner.toUpperCase()} win ({step?.round.winType}) · {events.filter(e => e.type !== "ROUND_END").map(e => `${e.type}@${e.time}`).join(" ")}
                {live?.script.utility.length ? ` · utility ${live.script.utility.map(u => `${u.kind}@${u.t}`).join(" ")}` : ""}
            </p>

            <div className="mx-auto h-[760px] max-w-[900px]">
                <MapRadarPanel
                    currentMapId={map.id}
                    mapName={map.name}
                    script={live?.script ?? null}
                    roundMap={roundMap}
                    players={PLAYER_INFO}
                    currentTime={time}
                    tickDurationMs={1000 / speed}
                    isAnimating={playing}
                    roundOver={time >= end}
                    fillHeight
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
