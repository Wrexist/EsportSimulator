"use client"

import { useState, useMemo } from "react"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { useLiveMatch } from "@/hooks/useLiveMatch"
import { LiveMatchScoreboard } from "@/components/match/LiveMatchScoreboard"
import { LiveMatchControlBar } from "@/components/match/LiveMatchControlBar"
import { MapRadarPanel } from "@/components/match/MapRadarPanel"
import { TacticalLoadoutEditor } from "@/components/match/TacticalLoadoutEditor"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { Skull, Swords, Zap as ZapIcon, EyeOff, Repeat, Settings2, Coins, Search, Shield, Crosshair, Sparkles, Bomb, Trophy } from "lucide-react"
import { cn } from "@/lib/utils"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { CustomTactics, MapId } from "@/types"
import { computeRadarPositions } from "@/lib/radar-position-engine"

// Helper for Weapon Icons (keep local or move to utils? keeping local for now as it was here)
const getWeaponIcon = (weaponName: string | undefined): string => {
    if (!weaponName) return "/assets/weapons/weapon_glock.png";
    const name = weaponName.toLowerCase().replace(/-/g, "").replace(/\s+/g, "");
    const mapping: Record<string, string> = {
        "m4a1s": "weapon_m4a1s.png",
        "ak47": "weapon_ak47.png",
        "m4a4": "weapon_m4a4.png",
        "awp": "weapon_awp.png",
        "deagle": "weapon_deagle.png",
        "usp": "weapon_usp.png",
        "glock": "weapon_glock.png",
        "p250": "weapon_p250.png",
        "mac10": "weapon_mac10.png",
        "mp9": "weapon_mp9.png",
        "xm1014": "weapon_xm1014.png",
        "p90": "weapon_p90.png",
        "famas": "weapon_famas.png",
        "galilar": "weapon_galil.png",
        "galil": "weapon_galil.png",
        "mp7": "weapon_mp7.png",
        "aug": "weapon_aug.png",
        "mag7": "weapon_mag7.png",
        "fiveseven": "weapon_fiveseven.png",
        "ssg08": "weapon_awp.png",
        "dualies": "weapon_p250.png",
        "tec9": "weapon_glock.png",
        "sg553": "weapon_ak47.png",
        "knife": "weapon_glock.png"
    };
    const mapped = mapping[name] || "weapon_glock.png";
    return `/assets/weapons/${mapped}`;
};

const MAP_NAMES: Record<string, string> = {
    [MapId.DUST2]: "Dust II",
    [MapId.MIRAGE]: "Mirage",
    [MapId.INFERNO]: "Inferno",
    [MapId.NUKE]: "Nuke",
    [MapId.OVERPASS]: "Overpass",
    [MapId.VERTIGO]: "Vertigo",
    [MapId.ANCIENT]: "Ancient",
    [MapId.ANUBIS]: "Anubis",
    "cache": "Cache",
    "train": "Train",
    "cobblestone": "Cobblestone"
}

export default function LiveMatchPage({ params }: { params: { id: string } }) {
    const {
        gameState,
        simState,
        homeRoster,
        awayRoster,
        logs,
        matchData,
        isAutoTactics,
        setIsAutoTactics,
        isPlaying,
        setIsPlaying,
        speed,
        setSpeed,
        isWaitingForStrategy,
        startNextRound,
        simulateRoundInstant,
        simulateMatchInstant,
        handleFinish,
        customTactics,
        teams, // unused, removing from destructure if not needed
        updateCustomTactic,
        playerTeam,
        originalHomePlayers,
        originalAwayPlayers,
        currentRoundEvents
    } = useLiveMatch(params.id)

    // Local UI State for Loadout Editor (UI Concern)
    const [isEditingLoadout, setIsEditingLoadout] = useState(false)
    const [editingSide, setEditingSide] = useState<"ct" | "t">("ct")
    const [editingStrategy, setEditingStrategy] = useState<keyof CustomTactics>("FULL")

    // Compute live radar positions from round events (must be before early return for hooks rules)
    const currentMapId = matchData.current?.result.maps[gameState.currentMapIndex]?.map || MapId.DUST2
    const radarData = useMemo(() => {
        if (!simState || !matchData.current || gameState.time < 0) return null
        return computeRadarPositions(
            currentMapId as MapId,
            gameState.time,
            currentRoundEvents.current,
            homeRoster.map(p => ({ id: p.id, isDead: p.isDead, nickname: p.name, money: p.money })),
            awayRoster.map(p => ({ id: p.id, isDead: p.isDead, nickname: p.name, money: p.money })),
            simState.homeStartsCT,
            gameState.round,
            matchData.current.match.seed ?? 0
        )
    }, [gameState.time, gameState.round, currentMapId, simState?.homeStartsCT, homeRoster, awayRoster])

    if (!matchData.current || !simState) return (
        <div className="min-h-screen bg-[#0e1217] flex items-center justify-center">
            <div className="text-center">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground text-sm font-bold uppercase tracking-widest">Loading Match...</p>
            </div>
        </div>
    )

    const { homeTeam, awayTeam } = matchData.current
    const mapName = MAP_NAMES[currentMapId] || currentMapId || "Unknown Map"

    // Dynamic Colors based on Side
    const homeIsCT = simState.homeStartsCT
    const homeBorderClass = homeIsCT ? "border-l-blue-500/30" : "border-l-orange-500/30"
    const awayBorderClass = !homeIsCT ? "border-r-blue-500/30" : "border-r-orange-500/30"

    return (
        <ErrorBoundary section="Live Match">
        <div className="min-h-screen bg-[#0e1217] text-white p-6 flex flex-col overflow-hidden font-sans select-none relative"
            role="main"
            aria-label={`Live match: ${homeTeam?.name || 'Home'} vs ${awayTeam?.name || 'Away'}`}
            style={{
                backgroundImage: `radial-gradient(circle at center, rgba(0,0,0,0.7) 0%, #0e1217 100%), url(/maps/${currentMapId}.png)`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundBlendMode: "overlay"
            }}
        >
            <div className="max-w-7xl mx-auto w-full flex flex-col flex-1 h-full min-h-0">

                <LiveMatchScoreboard
                    gameState={gameState}
                    homeTeam={homeTeam}
                    awayTeam={awayTeam}
                    matchFormat={matchData.current.match.format}
                    currentMapId={currentMapId}
                    mapName={mapName}
                    homeSeriesScore={simState.homeSeriesScore}
                    awaySeriesScore={simState.awaySeriesScore}
                    homeScore={gameState.homeScore}
                    awayScore={gameState.awayScore}
                />

                {/* STRATEGY PANEL */}
                <AnimatePresence>
                    {isWaitingForStrategy && !isAutoTactics && (
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="glass-panel-dark rounded-[24px] p-6 border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-transparent mb-4"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-xl font-normal uppercase">Round {gameState.round} • Select Strategy</h3>
                                    <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                                        Team Budget: ${Math.floor(Object.values(simState.homeEconomy).reduce((s, p) => s + p.cash, 0)).toLocaleString()}
                                    </p>
                                </div>
                            </div>
                            <div className="grid grid-cols-5 gap-3">
                                {(() => {
                                    const avgCash = Math.floor(Object.values(simState.homeEconomy).reduce((s: number, p: any) => s + p.cash, 0) / 5)
                                    const side = simState.homeStartsCT ? "ct" : "t"

                                    const strategies = [
                                        { id: "ECO", fallback: "SAVE", icon: <Coins className="w-5 h-5" />, baseColor: "bg-white/5 text-white/50 border-white/10" },
                                        { id: "FORCE", fallback: "FORCE", icon: <ZapIcon className="w-5 h-5" />, baseColor: "bg-orange-500/10 text-orange-300 border-orange-500/20" },
                                        { id: "SEMIBUY", fallback: "SEMI", icon: <Search className="w-5 h-5" />, baseColor: "bg-purple-500/10 text-purple-300 border-purple-500/20" },
                                        { id: "FULL", fallback: "FULL", icon: <Shield className="w-5 h-5" />, baseColor: "bg-blue-500/20 text-blue-400 border-blue-500/40" },
                                        { id: "DOUBLE AWP", fallback: "2xAWP", icon: <Crosshair className="w-5 h-5" />, baseColor: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" }
                                    ]

                                    const getStrategyCost = (stratId: string) => {
                                        if (stratId === "ECO") return 0
                                        if (stratId === "FORCE") return 1800
                                        if (stratId === "SEMIBUY") return 3600
                                        if (stratId === "FULL") return 4700
                                        if (stratId === "DOUBLE AWP") return 6500
                                        return 0
                                    }

                                    return strategies.map((strat) => {
                                        const cost = getStrategyCost(strat.id)
                                        const canAfford = avgCash >= cost

                                        return (
                                            <div key={strat.id} className="relative group">
                                                <Button
                                                    onClick={() => canAfford && startNextRound(strat.id as any)}
                                                    disabled={!canAfford}
                                                    className={cn(
                                                        "w-full h-24 rounded-2xl flex flex-col gap-1 border transition-all",
                                                        canAfford
                                                            ? strat.baseColor + " hover:ring-2 hover:ring-emerald-500 hover:bg-emerald-500/10 hover:border-emerald-500/50"
                                                            : "bg-white/5 text-white/20 border-white/5 cursor-not-allowed opacity-40"
                                                    )}
                                                >
                                                    <span className="font-normal text-[11px] leading-tight text-center">{strat.fallback}</span>
                                                    <div className={cn("text-[10px] font-bold", canAfford ? "text-emerald-400" : "text-red-400")}>
                                                        ${cost.toLocaleString()}
                                                    </div>
                                                </Button>
                                                <button
                                                    aria-label={`Edit ${strat.fallback} loadout`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingStrategy(strat.id as any);
                                                        setEditingSide(side as "ct" | "t");
                                                        setIsEditingLoadout(true);
                                                    }}
                                                    className="absolute top-2 right-2 p-1 rounded-lg bg-white/5 hover:bg-white/20 text-white/30 hover:text-white transition-colors"
                                                >
                                                    <Settings2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        )
                                    })
                                })()}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* GAME AREA */}
                <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
                    {/* HOME TEAM ROSTER */}
                    <div className={cn("col-span-3 glass-panel-dark rounded-[40px] border-l-4 p-4 overflow-y-auto space-y-2", homeBorderClass)}>
                        {homeRoster.slice(0, 5).map(p => {
                            const originalPlayer = originalHomePlayers.find(op => op.id === p.id)
                            return (
                                <div key={p.id} className={cn("p-2 rounded-2xl flex items-center gap-3 border transition-colors", p.isDead ? "bg-black/40 border-white/5 opacity-50" : "bg-white/5 border-white/5")}>
                                    <div className="w-10 h-10 bg-black/30 rounded-lg overflow-hidden flex items-center justify-center shrink-0 border border-white/5">
                                        <PlayerPortrait
                                            src={originalPlayer?.portraitPath}
                                            alt={p.name}
                                            size={40}
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <div className="font-normal text-xs uppercase truncate pr-2">{p.name}</div>
                                            <div className="text-[10px] text-emerald-400 font-bold whitespace-nowrap">${p.money}</div>
                                        </div>
                                        <div className="text-[10px] text-white/40 font-bold truncate mt-0.5">{p.weapon?.toUpperCase() || "USP"}</div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-xs font-normal">{p.kills}/{p.deaths}/{p.assists}</div>
                                        {p.isDead && <Skull className="w-3 h-3 text-red-500 ml-auto mt-1" />}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* CONSOLE / CENTER */}
                    <div className="col-span-6 flex flex-col gap-4">

                        <LiveMatchControlBar
                            gameState={gameState}
                            isAutoTactics={isAutoTactics}
                            setIsAutoTactics={setIsAutoTactics}
                            isPlaying={isPlaying}
                            setIsPlaying={setIsPlaying}
                            isWaitingForStrategy={isWaitingForStrategy}
                            speed={speed}
                            setSpeed={setSpeed}
                            onSimulateRound={simulateRoundInstant}
                            onSimulateMatch={simulateMatchInstant}
                        />

                        <MapRadarPanel
                            currentMapId={currentMapId}
                            mapName={mapName}
                            radarDots={radarData?.dots}
                            bombState={radarData?.bomb}
                            killLines={radarData?.killLines}
                            smokes={radarData?.smokes}
                            sitePositions={radarData ? { a: radarData.aSite, b: radarData.bSite } : undefined}
                            currentTime={gameState.time}
                        />

                        {/* LOGS */}
                        <div className="glass-panel-dark flex-1 rounded-[40px] p-6 overflow-hidden flex flex-col border border-white/5">
                            <div className="flex items-center gap-2 mb-4 text-xs font-normal opacity-40 uppercase tracking-widest">
                                <Swords className="w-4 h-4" /> SERVER LOGS
                            </div>
                            <div className="flex-1 pr-2 overflow-y-auto custom-scrollbar h-full min-h-0 relative">
                                <div className="space-y-1.5 pb-4">
                                    {logs.map((l, i) => {
                                        const timeStr = l.time != null ? `[${Math.floor(l.time / 60)}:${(l.time % 60).toString().padStart(2, '0')}]` : ""

                                        {/* ── KILL EVENTS ── */}
                                        if (l.type === "KILL") {
                                            return (
                                                <div key={i} className={cn(
                                                    "p-2 rounded-xl text-[11px] border-l-2 border border-white/5 flex items-center gap-1.5",
                                                    l.killerSide === "CT"
                                                        ? "bg-blue-500/10 border-l-blue-400/50"
                                                        : "bg-orange-500/10 border-l-orange-400/50"
                                                )}>
                                                    <span className="opacity-30 text-[10px] w-7 shrink-0 font-mono">{timeStr}</span>
                                                    {/* Killer portrait + name */}
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        {l.killerImage && (
                                                            <div className="w-5 h-5 rounded overflow-hidden shrink-0">
                                                                <PlayerPortrait src={l.killerImage} alt="" size={20} />
                                                            </div>
                                                        )}
                                                        <span className={cn("font-semibold truncate max-w-[60px]",
                                                            l.killerSide === "CT" ? "text-blue-300/90" : "text-orange-300/90"
                                                        )}>{l.killerName}</span>
                                                    </div>
                                                    {/* Assister */}
                                                    {l.assisterName && (
                                                        <span className="text-white/30 text-[9px] shrink-0">+ {l.assisterName}</span>
                                                    )}
                                                    {/* Weapon icon + headshot */}
                                                    <div className="flex items-center gap-0.5 mx-0.5 shrink-0">
                                                        <img src={getWeaponIcon(l.weapon)} alt="" className="h-2.5 w-auto brightness-0 invert opacity-40" />
                                                        {l.isHeadshot && (
                                                            <img src="/assets/weapons/headshot.png" alt="HS" className="h-2.5 w-2.5 opacity-70" />
                                                        )}
                                                    </div>
                                                    {/* Victim name + portrait */}
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <span className="font-semibold text-white/40 truncate max-w-[60px]">{l.victimName}</span>
                                                        {l.victimImage && (
                                                            <div className="w-5 h-5 rounded overflow-hidden shrink-0 opacity-50">
                                                                <PlayerPortrait src={l.victimImage} alt="" size={20} />
                                                            </div>
                                                        )}
                                                    </div>
                                                    {/* Tags */}
                                                    <div className="flex gap-1 ml-auto shrink-0">
                                                        {l.isHeadshot && <span className="px-1 py-0.5 rounded text-[7px] font-bold bg-red-500/20 text-red-300">HS</span>}
                                                        {l.isTrade && <span className="px-1 py-0.5 rounded text-[7px] font-bold bg-yellow-500/20 text-yellow-300">TRADE</span>}
                                                    </div>
                                                </div>
                                            )
                                        }

                                        {/* ── PLANT EVENT ── */}
                                        if (l.type === "PLANT") {
                                            return (
                                                <div key={i} className="p-2 rounded-xl text-[11px] border-l-2 border border-white/5 bg-red-500/10 border-l-red-400/50 flex items-center gap-2">
                                                    <span className="opacity-30 text-[10px] w-7 shrink-0 font-mono">{timeStr}</span>
                                                    <Bomb className="w-3 h-3 text-red-400 shrink-0" />
                                                    <span className="text-red-300/80 font-semibold">{l.message}</span>
                                                </div>
                                            )
                                        }

                                        {/* ── DEFUSE EVENT ── */}
                                        if (l.type === "DEFUSE") {
                                            return (
                                                <div key={i} className="p-2 rounded-xl text-[11px] border-l-2 border border-white/5 bg-blue-500/10 border-l-blue-400/50 flex items-center gap-2">
                                                    <span className="opacity-30 text-[10px] w-7 shrink-0 font-mono">{timeStr}</span>
                                                    <Shield className="w-3 h-3 text-blue-400 shrink-0" />
                                                    <span className="text-blue-300/80 font-semibold">{l.message}</span>
                                                </div>
                                            )
                                        }

                                        {/* ── EXPLODE EVENT ── */}
                                        if (l.type === "EXPLODE") {
                                            return (
                                                <div key={i} className="p-2 rounded-xl text-[11px] border-l-2 border border-white/5 bg-orange-600/15 border-l-orange-500/60 flex items-center gap-2">
                                                    <span className="opacity-30 text-[10px] w-7 shrink-0 font-mono">{timeStr}</span>
                                                    <ZapIcon className="w-3 h-3 text-orange-400 shrink-0" />
                                                    <span className="text-orange-300/80 font-semibold">{l.message}</span>
                                                </div>
                                            )
                                        }

                                        {/* ── ROUND END EVENT ── */}
                                        if (l.type === "ROUND_END") {
                                            return (
                                                <div key={i} className="p-2.5 rounded-xl text-[11px] border-l-2 border border-white/10 bg-white/8 border-l-white/30 flex items-center gap-2">
                                                    <Trophy className="w-3.5 h-3.5 text-white/50 shrink-0" />
                                                    <span className="text-white/70 font-bold uppercase tracking-wide">{l.message}</span>
                                                </div>
                                            )
                                        }

                                        {/* ── CLUTCH EVENT ── */}
                                        if (l.type === "CLUTCH") {
                                            return (
                                                <div key={i} className="p-2 rounded-xl text-[11px] border-l-2 border border-white/5 bg-yellow-500/10 border-l-yellow-400/50 flex items-center gap-2">
                                                    <span className="opacity-30 text-[10px] w-7 shrink-0 font-mono">{timeStr}</span>
                                                    <Sparkles className="w-3 h-3 text-yellow-400 shrink-0" />
                                                    <span className="text-yellow-300/80 font-semibold">{l.message}</span>
                                                </div>
                                            )
                                        }

                                        {/* ── SAVE EVENT ── */}
                                        if (l.type === "SAVE") {
                                            return (
                                                <div key={i} className="p-2 rounded-xl text-[11px] border-l-2 border border-white/5 bg-white/3 border-l-white/10 flex items-center gap-2">
                                                    <span className="opacity-30 text-[10px] w-7 shrink-0 font-mono">{timeStr}</span>
                                                    <EyeOff className="w-3 h-3 text-white/30 shrink-0" />
                                                    <span className="text-white/40">{l.message}</span>
                                                </div>
                                            )
                                        }

                                        {/* ── BUY EVENTS ── */}
                                        if (l.type === "BUY") {
                                            return (
                                                <div key={i} className="p-1.5 rounded-lg text-[10px] border border-white/3 bg-white/[0.02] flex items-center gap-2">
                                                    <Coins className="w-3 h-3 text-emerald-400/40 shrink-0" />
                                                    <span className="text-white/30 font-medium">{l.message}</span>
                                                </div>
                                            )
                                        }

                                        {/* ── DEFAULT / SYSTEM ── */}
                                        return (
                                            <div key={i} className="p-2 rounded-xl text-[11px] border border-white/5 bg-black/20 flex items-center gap-2">
                                                <span className="opacity-30 text-[10px] w-7 shrink-0 font-mono">{timeStr}</span>
                                                <span className="text-white/50">{l.message}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* AWAY TEAM ROSTER */}
                    <div className={cn("col-span-3 glass-panel-dark rounded-[40px] border-r-4 p-4 overflow-y-auto space-y-2", awayBorderClass)}>
                        {awayRoster.slice(0, 5).map(p => {
                            const originalPlayer = originalAwayPlayers.find(op => op.id === p.id)
                            return (
                                <div key={p.id} className={cn("p-2 rounded-2xl flex items-center gap-3 border transition-colors", p.isDead ? "bg-black/40 border-white/5 opacity-50" : "bg-white/5 border-white/5")}>
                                    <div className="w-10 h-10 bg-black/30 rounded-lg overflow-hidden flex items-center justify-center shrink-0 border border-white/5">
                                        <PlayerPortrait
                                            src={originalPlayer?.portraitPath}
                                            alt={p.name}
                                            size={40}
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <div className="font-normal text-xs uppercase truncate pr-2">{p.name}</div>
                                            <div className="text-[10px] text-emerald-400 font-bold whitespace-nowrap">${p.money}</div>
                                        </div>
                                        <div className="text-[10px] text-white/40 font-bold truncate mt-0.5">{p.weapon?.toUpperCase() || "GLOCK"}</div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-xs font-normal">{p.kills}/{p.deaths}/{p.assists}</div>
                                        {p.isDead && <Skull className="w-3 h-3 text-red-500 ml-auto mt-1" />}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* MODALS */}
            <AnimatePresence>
                {isEditingLoadout && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 top-16 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    >
                        <TacticalLoadoutEditor
                            side={editingSide}
                            strategyId={editingStrategy}
                            config={customTactics[editingStrategy][editingSide]}
                            teamBudget={Math.floor(Object.values(simState?.homeEconomy || {}).reduce((s: any, p: any) => s + p.cash, 0))}
                            playerCash={homeRoster.map(p => simState?.homeEconomy?.[p.id]?.cash ?? p.money ?? 0)}
                            playerNames={homeRoster.map(p => p.name)}
                            playerImages={originalHomePlayers.map(p => p.portraitPath || "")}
                            onSave={(newConfig) => {
                                updateCustomTactic(editingStrategy, editingSide, newConfig)
                                setIsEditingLoadout(false)
                            }}
                            onClose={() => setIsEditingLoadout(false)}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {gameState.status === "FINISHED" && (
                <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 w-full max-w-md z-50 px-4">
                    <Button
                        onClick={handleFinish}
                        className="w-full h-16 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-normal uppercase tracking-[0.2em] rounded-3xl shadow-lg hover:shadow-emerald-500/20 transition-all transform hover:scale-[1.02]"
                    >
                        CONTINUE TO RESULTS
                    </Button>
                </div>
            )}

            <style jsx global>{`
            .glass-panel-dark {
                background: rgba(14, 18, 23, 0.7);
                backdrop-filter: blur(20px);
            }
            .custom-scrollbar::-webkit-scrollbar {
                width: 4px;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
                background: rgba(255, 255, 255, 0.05);
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 2px;
            }
        `}</style>
        </div>
        </ErrorBoundary>
    )
}
