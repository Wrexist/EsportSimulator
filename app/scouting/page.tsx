"use client"

import React, { useState, useMemo, useEffect, memo } from "react"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { useDebounce } from "@/hooks/useDebounce"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { PlayerPortrait, TeamLogoImage } from "@/components/ui/asset-images"
import {
    Search,
    Users,
    DollarSign,
    Star,
    X,
    Target,
    Activity,
    ArrowRight,
    ArrowUp,
    ArrowDown,
    ArrowUpDown,
    ChevronDown,
    ChevronUp,
    Globe,
    Clock,
    SlidersHorizontal,
    AlertTriangle,
    Heart,
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/src/components/ui/EmptyState"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Slider } from "@/components/ui/slider"
import {
    Collapsible,
    CollapsibleTrigger,
    CollapsibleContent,
} from "@/components/ui/collapsible"
import type { PlayerSaveData } from "@/engine/save-types"
import {
    GlassTable,
    GlassTableHeader,
    GlassTableHead,
    GlassTableRow,
    GlassTableCell,
} from "@/components/ui/GlassTable"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { evaluatePlayer, isPlayerForSale } from "@/engine/player-evaluation"
import { PlayerSpiderChart } from "@/components/ui/player-spider-chart"
import { resolvePlayerRole } from "@/engine/role-determination"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { NegotiationModal } from "@/components/transfer/NegotiationModal"
import { SynergyCalculator } from "@/engine/synergy-calculator"
import {
    ALL_REGIONS,
    toCountryCode,
    getPlayerRegion,
    calculateRosterSynergy,
    detectMissingRoles,
    getAffordabilityStatus,
    getContractWeeksRemaining,
} from "@/engine/scouting-helpers"
import { fuzzyBand } from "@/engine/scouting-system"

interface SnapshotPlayer {
    id: string
    name: string
    nickname: string
    age: number
    nationality: string
    portraitPath: string
    role: string
    secondaryRole?: string
    tier: string
    skill: number
    awp: number
    rifle: number
    firepower?: number
    entrying?: number
    trading?: number
    opening?: number
    clutching?: number
    sniping?: number
    utility?: number
    isRetired?: boolean
    teamwork?: number
    amicability?: number
    experience?: number
    [key: string]: any
}

interface SnapshotTeam {
    id: string
    name: string
    rosterIds: string[]
    reputation: number
}

type SortField = "ovr" | "age" | "value" | "synergy" | "name"
type SortDirection = "asc" | "desc"

// Hoisted outside the page so it isn't rebuilt on every parent re-render.
// memo'd so the 5 header cells don't reconcile on unrelated parent updates.
const SortIcon = memo(function SortIcon({ field, sortField, sortDirection }: { field: SortField; sortField: SortField; sortDirection: SortDirection }) {
    if (sortField !== field) return <ArrowUpDown size={10} className="ml-1 opacity-30" />
    return sortDirection === "asc"
        ? <ArrowUp size={10} className="ml-1 text-primary" />
        : <ArrowDown size={10} className="ml-1 text-primary" />
})

export default function ScoutingPage() {
    const {
        teams: gameTeams,
        players,
        playerTeamId,
        scoutedPlayers,
        isPlayerScouted,
        startScoutingMission,
        activeScoutingMission,
        transferHistory,
        contracts,
        currentWeek,
        watchlistedPlayerIds,
        toggleWatchlistPlayer,
        isPlayerWatchlisted,
    } = useGameStore(useShallow(state => ({
        teams: state.teams,
        players: state.players,
        playerTeamId: state.playerTeamId,
        scoutedPlayers: state.scoutedPlayers,
        isPlayerScouted: state.isPlayerScouted,
        startScoutingMission: state.startScoutingMission,
        activeScoutingMission: state.activeScoutingMission,
        transferHistory: state.transferHistory,
        contracts: state.contracts,
        currentWeek: state.currentWeek,
        watchlistedPlayerIds: state.watchlistedPlayerIds,
        toggleWatchlistPlayer: state.toggleWatchlistPlayer,
        isPlayerWatchlisted: state.isPlayerWatchlisted,
    })))

    const [allPlayers, setAllPlayers] = useState<SnapshotPlayer[]>([])
    const [allTeams, setAllTeams] = useState<SnapshotTeam[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [selectedPlayer, setSelectedPlayer] = useState<SnapshotPlayer | null>(null)
    const [negotiatingPlayerId, setNegotiatingPlayerId] = useState<string | null>(null)

    // Basic filters
    const [searchTerm, setSearchTerm] = useState("")
    const debouncedSearch = useDebounce(searchTerm, 300)
    const [selectedRole, setSelectedRole] = useState<string>("ALL")
    const [showForSaleOnly, setShowForSaleOnly] = useState(false)

    // Advanced filters
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
    const [ageRange, setAgeRange] = useState<[number, number]>([16, 40])
    const [priceRange, setPriceRange] = useState<[number, number]>([0, 10000000])
    const [selectedRegions, setSelectedRegions] = useState<string[]>([])
    const [showFreeAgentsOnly, setShowFreeAgentsOnly] = useState(false)
    const [contractExpiryFilter, setContractExpiryFilter] = useState<string>("any")
    const [showScoutedOnly, setShowScoutedOnly] = useState(false)
    const [minSynergy, setMinSynergy] = useState(0)
    const [showWatchlistedOnly, setShowWatchlistedOnly] = useState(false)

    // Pagination
    const [page, setPage] = useState(0)
    const PAGE_SIZE = 25

    // Sorting
    const [sortField, setSortField] = useState<SortField>("ovr")
    const [sortDirection, setSortDirection] = useState<SortDirection>("desc")

    // Load all players dynamically from store
    useEffect(() => {
        setIsLoading(true)
        setAllPlayers(players as unknown as SnapshotPlayer[])
        setAllTeams(gameTeams as unknown as SnapshotTeam[])
        setIsLoading(false)
    }, [players, gameTeams])

    // O(1) playerId → team lookup. Was a linear scan of allTeams per call
    // (~200 teams × ~1500 player evaluations in the player table = 300k
    // ops per evaluatedPlayers rebuild). Memoize the map once per teams
    // change so the getPlayerTeam helper below is constant-time.
    const teamByPlayerId = useMemo(() => {
        const m = new Map<string, typeof allTeams[number]>()
        for (const t of allTeams) {
            for (const pid of (t.rosterIds ?? [])) m.set(pid, t)
        }
        return m
    }, [allTeams])
    const getPlayerTeam = (playerId: string) => teamByPlayerId.get(playerId)

    // My roster for synergy calculations
    const myRoster = useMemo(() => {
        const myTeam = allTeams.find(t => t.id === playerTeamId)
        if (!myTeam) return []
        return allPlayers.filter(p => myTeam.rosterIds?.includes(p.id))
    }, [allTeams, allPlayers, playerTeamId])

    // My team budget
    const myTeamBudget = useMemo(() => {
        const myTeam = gameTeams.find(t => t.id === playerTeamId)
        return myTeam?.budget || 0
    }, [gameTeams, playerTeamId])

    // Missing roles detection
    const missingRoles = useMemo(() => {
        if (myRoster.length === 0) return []
        return detectMissingRoles(myRoster as any)
    }, [myRoster])

    // Evaluate and filter players — use teamByPlayerId Map (O(1) lookup)
    // rather than the getPlayerTeam helper so the dep array sees the
    // stable Map reference instead of the per-render function identity.
    const evaluatedPlayers = useMemo(() => {
        return allPlayers.map(player => {
            // Scouting works against the SnapshotPlayer shape (which is
            // structurally a subset of PlayerSaveData — same stat fields,
            // no energy / talent / dynamic state). evaluatePlayer and
            // isPlayerForSale only read those subset fields at runtime,
            // so the bridging cast is safe here.
            const evaluation = evaluatePlayer(player as unknown as PlayerSaveData)
            const team = teamByPlayerId.get(player.id)
            const teamRanking = team ? Math.max(1, 50 - Math.floor((team.reputation || 0) / 2)) : 50
            const forSale = isPlayerForSale(player as unknown as PlayerSaveData, evaluation, teamRanking)

            return {
                ...player,
                evaluation,
                team,
                forSale,
            }
        })
    }, [allPlayers, teamByPlayerId])

    // Synergy map: playerId → average synergy with my roster
    const synergyMap = useMemo(() => {
        const map = new Map<string, number>()
        if (myRoster.length === 0) return map
        for (const ep of evaluatedPlayers) {
            if (ep.team?.id === playerTeamId) continue // skip own team
            map.set(ep.id, calculateRosterSynergy(ep as any, myRoster as any))
        }
        return map
    }, [evaluatedPlayers, myRoster, playerTeamId])

    // Handle sort toggle
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(d => d === "asc" ? "desc" : "asc")
        } else {
            setSortField(field)
            setSortDirection(field === "name" ? "asc" : "desc")
        }
    }

    // Filter players
    const filteredPlayers = useMemo(() => {
        return evaluatedPlayers
            .filter(p => {
                const matchesSearch =
                    p.nickname.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                    p.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                    p.team?.name.toLowerCase().includes(debouncedSearch.toLowerCase())

                const matchesRole = selectedRole === "ALL" ||
                    p.role?.toLowerCase().includes(selectedRole.toLowerCase())

                const matchesForSale = !showForSaleOnly || p.forSale

                const matchesPrice =
                    p.evaluation.transferValue >= priceRange[0] &&
                    p.evaluation.transferValue <= priceRange[1]

                // Exclude players from player's team
                const notOnPlayerTeam = p.team?.id !== playerTeamId

                // Exclude retired players
                const notRetired = !p.isRetired

                // Exclude FPL non-pro generated players (they belong in FPL page only)
                const notFPLNonPro = !(p as any).isFPLNonPro && !p.id.startsWith("fpl_nonpro_")

                // Age range filter
                const matchesAge = p.age >= ageRange[0] && p.age <= ageRange[1]

                // Region filter
                const matchesRegion = selectedRegions.length === 0 || (() => {
                    const playerRegion = getPlayerRegion(p.nationality)
                    return playerRegion ? selectedRegions.includes(playerRegion) : false
                })()

                // Free agents filter
                const matchesFreeAgent = !showFreeAgentsOnly || !p.team

                // Scouted only filter
                const matchesScouted = !showScoutedOnly || isPlayerScouted(p.id)

                // Contract expiry filter
                const matchesContract = contractExpiryFilter === "any" || (() => {
                    const weeks = getContractWeeksRemaining(p.id, contracts || [], currentWeek || 0)
                    if (weeks === null) return contractExpiryFilter === "free" // free agents match "free"
                    const maxWeeks = parseInt(contractExpiryFilter, 10)
                    return !isNaN(maxWeeks) && weeks <= maxWeeks
                })()

                // Synergy filter
                const matchesSynergy = minSynergy === 0 || (() => {
                    const syn = synergyMap.get(p.id)
                    return syn !== undefined && syn >= minSynergy
                })()

                // Watchlisted filter
                const matchesWatchlist = !showWatchlistedOnly || isPlayerWatchlisted(p.id)

                return matchesSearch && matchesRole && matchesForSale && matchesPrice &&
                    notOnPlayerTeam && notRetired && notFPLNonPro && matchesAge && matchesRegion &&
                    matchesFreeAgent && matchesScouted && matchesContract && matchesSynergy &&
                    matchesWatchlist
            })
            .sort((a, b) => {
                let cmp = 0
                switch (sortField) {
                    case "ovr":
                        cmp = a.evaluation.overallRating - b.evaluation.overallRating
                        break
                    case "age":
                        cmp = a.age - b.age
                        break
                    case "value":
                        cmp = a.evaluation.transferValue - b.evaluation.transferValue
                        break
                    case "synergy":
                        cmp = (synergyMap.get(a.id) || 0) - (synergyMap.get(b.id) || 0)
                        break
                    case "name":
                        cmp = a.nickname.localeCompare(b.nickname)
                        break
                }
                return sortDirection === "asc" ? cmp : -cmp
            })
        // isPlayerScouted / isPlayerWatchlisted are pure functions over
        // scoutedPlayers / watchlist which ARE in deps via showScoutedOnly
        // / showWatchlistedOnly — listing the functions themselves would
        // bust this memo on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [evaluatedPlayers, debouncedSearch, selectedRole, showForSaleOnly, priceRange, playerTeamId,
        ageRange, selectedRegions, showFreeAgentsOnly, showScoutedOnly, contractExpiryFilter,
        minSynergy, showWatchlistedOnly, sortField, sortDirection, synergyMap, contracts, currentWeek])

    const roles = ["ALL", "AWPER", "IGL", "ENTRY", "SUPPORT", "RIFLER", "LURKER"]

    const formatPrice = (value: number) => {
        if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
        return `$${(value / 1000).toFixed(0)}k`
    }

    const toggleRegion = (region: string) => {
        setSelectedRegions(prev =>
            prev.includes(region) ? prev.filter(r => r !== region) : [...prev, region]
        )
    }

    // Active filter count (for badge)
    const activeFilterCount = [
        ageRange[0] > 16 || ageRange[1] < 40,
        priceRange[0] > 0 || priceRange[1] < 10000000,
        selectedRegions.length > 0,
        showFreeAgentsOnly,
        contractExpiryFilter !== "any",
        showScoutedOnly,
        minSynergy > 0,
        showWatchlistedOnly,
    ].filter(Boolean).length

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-muted-foreground text-sm font-bold uppercase tracking-widest">Loading Scouting Database...</p>
                </div>
            </div>
        )
    }

    return (
        <ErrorBoundary section="Scouting">
        <div className="space-y-6 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-4xl font-normal tracking-tighter uppercase liquid-text mb-2">
                        Scouting Database
                    </h1>
                    <p className="text-muted-foreground font-medium uppercase text-xs tracking-[0.2em]">
                        {allPlayers.length} players across {allTeams.length} teams worldwide
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <Badge className="bg-primary/20 text-primary border-primary/20 px-4 py-2">
                        <Users size={14} className="mr-2" />
                        {filteredPlayers.length} Results
                    </Badge>
                </div>
            </div>

            {/* Filters */}
            <div className="glass-panel p-6 border-white/5 space-y-4">
                {/* Row 1: Search + Quick Toggles */}
                <div className="flex flex-wrap gap-3">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                        <Input
                            placeholder="Search players or teams..."
                            aria-label="Search players or teams"
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setPage(0) }}
                            className="pl-12 h-12 bg-white/5 border-white/10 rounded-xl"
                        />
                    </div>

                    {/* For Sale Toggle */}
                    <button
                        onClick={() => setShowForSaleOnly(!showForSaleOnly)}
                        className={cn(
                            "px-5 py-3 rounded-xl text-xs font-normal uppercase tracking-widest border transition-all flex items-center gap-2",
                            showForSaleOnly
                                ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                                : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20"
                        )}
                    >
                        <DollarSign size={14} />
                        For Sale
                    </button>

                    {/* Free Agents Toggle */}
                    <button
                        onClick={() => setShowFreeAgentsOnly(!showFreeAgentsOnly)}
                        className={cn(
                            "px-5 py-3 rounded-xl text-xs font-normal uppercase tracking-widest border transition-all flex items-center gap-2",
                            showFreeAgentsOnly
                                ? "bg-blue-500/20 border-blue-500/30 text-blue-400"
                                : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20"
                        )}
                    >
                        <Users size={14} />
                        Free Agents
                    </button>

                    {/* Scouted Only Toggle */}
                    <button
                        onClick={() => setShowScoutedOnly(!showScoutedOnly)}
                        className={cn(
                            "px-5 py-3 rounded-xl text-xs font-normal uppercase tracking-widest border transition-all flex items-center gap-2",
                            showScoutedOnly
                                ? "bg-cyan-500/20 border-cyan-500/30 text-cyan-400"
                                : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20"
                        )}
                    >
                        <Target size={14} />
                        Scouted
                    </button>

                    {/* Watchlisted Toggle */}
                    <button
                        onClick={() => setShowWatchlistedOnly(!showWatchlistedOnly)}
                        className={cn(
                            "px-5 py-3 rounded-xl text-xs font-normal uppercase tracking-widest border transition-all flex items-center gap-2",
                            showWatchlistedOnly
                                ? "bg-amber-500/20 border-amber-500/30 text-amber-400"
                                : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20"
                        )}
                    >
                        <Star size={14} />
                        Watchlist
                    </button>
                </div>

                {/* Row 2: Role Filters */}
                <div className="flex flex-wrap gap-2">
                    {roles.map(role => (
                        <button
                            key={role}
                            onClick={() => { setSelectedRole(role); setPage(0) }}
                            className={cn(
                                "px-4 py-2 rounded-xl text-[10px] font-normal uppercase tracking-widest border transition-all tab-button",
                                selectedRole === role
                                    ? "bg-white/10 text-white border-primary/50 ring-1 ring-primary/30"
                                    : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20 hover:bg-white/10"
                            )}
                        >
                            {role}
                        </button>
                    ))}
                </div>

                {/* Advanced Filters Toggle */}
                <Collapsible open={showAdvancedFilters} onOpenChange={setShowAdvancedFilters}>
                    <CollapsibleTrigger asChild>
                        <button className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-white transition-colors">
                            <SlidersHorizontal size={14} />
                            Advanced Filters
                            {activeFilterCount > 0 && (
                                <Badge className="bg-primary/20 text-primary border-primary/20 text-[10px] px-1.5 py-0">
                                    {activeFilterCount}
                                </Badge>
                            )}
                            {showAdvancedFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <div className="mt-4 space-y-5 pt-4 border-t border-white/5">
                            {/* Age Range */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Age Range</span>
                                    <span className="text-xs font-bold text-white">{ageRange[0]} - {ageRange[1]}</span>
                                </div>
                                <Slider
                                    min={16}
                                    max={40}
                                    step={1}
                                    value={ageRange}
                                    onValueChange={(v) => setAgeRange(v as [number, number])}
                                    className="w-full"
                                />
                                <div className="flex gap-2">
                                    {[
                                        { label: "Young", range: [16, 21] as [number, number] },
                                        { label: "Prime", range: [22, 27] as [number, number] },
                                        { label: "Veteran", range: [28, 40] as [number, number] },
                                        { label: "All", range: [16, 40] as [number, number] },
                                    ].map(preset => (
                                        <button
                                            key={preset.label}
                                            onClick={() => setAgeRange(preset.range)}
                                            className={cn(
                                                "px-3 py-1 rounded-lg text-[10px] font-bold uppercase border transition-all",
                                                ageRange[0] === preset.range[0] && ageRange[1] === preset.range[1]
                                                    ? "bg-primary/20 border-primary/30 text-primary"
                                                    : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20"
                                            )}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Price Range */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Price Range</span>
                                    <span className="text-xs font-bold text-white">{formatPrice(priceRange[0])} - {formatPrice(priceRange[1])}</span>
                                </div>
                                <Slider
                                    min={0}
                                    max={10000000}
                                    step={50000}
                                    value={priceRange}
                                    onValueChange={(v) => setPriceRange(v as [number, number])}
                                    className="w-full"
                                />
                            </div>

                            {/* Region Filter */}
                            <div className="space-y-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Region</span>
                                <div className="flex flex-wrap gap-2">
                                    {ALL_REGIONS.map(region => (
                                        <button
                                            key={region}
                                            onClick={() => toggleRegion(region)}
                                            className={cn(
                                                "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase border transition-all",
                                                selectedRegions.includes(region)
                                                    ? "bg-primary/20 border-primary/30 text-primary"
                                                    : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20"
                                            )}
                                        >
                                            <Globe size={10} className="inline mr-1" />
                                            {region}
                                        </button>
                                    ))}
                                    {selectedRegions.length > 0 && (
                                        <button
                                            onClick={() => setSelectedRegions([])}
                                            className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase border border-white/10 text-rose-400 hover:bg-rose-500/10 transition-all"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Synergy + Contract Row */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {/* Min Synergy */}
                                {myRoster.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Min Synergy</span>
                                            <span className="text-xs font-bold text-white">{minSynergy}</span>
                                        </div>
                                        <Slider
                                            min={0}
                                            max={100}
                                            step={5}
                                            value={[minSynergy]}
                                            onValueChange={(v) => setMinSynergy(v[0])}
                                            className="w-full"
                                        />
                                    </div>
                                )}

                                {/* Contract Expiry */}
                                <div className="space-y-2">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Contract Expiry</span>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            { label: "Any", value: "any" },
                                            { label: "< 4 wks", value: "4" },
                                            { label: "< 13 wks", value: "13" },
                                            { label: "< 26 wks", value: "26" },
                                            { label: "Free", value: "free" },
                                        ].map(opt => (
                                            <button
                                                key={opt.value}
                                                onClick={() => setContractExpiryFilter(opt.value)}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase border transition-all",
                                                    contractExpiryFilter === opt.value
                                                        ? "bg-primary/20 border-primary/30 text-primary"
                                                        : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20"
                                                )}
                                            >
                                                <Clock size={10} className="inline mr-1" />
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            </div>

            {/* Roster Need Banner */}
            {missingRoles.length > 0 && (
                <div className="glass-panel p-4 border-amber-500/20 bg-amber-500/5 flex items-center gap-3 flex-wrap">
                    <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                    <span className="text-xs font-bold uppercase tracking-widest text-amber-400">Your team needs:</span>
                    <div className="flex gap-2 flex-wrap">
                        {missingRoles.map(role => (
                            <button
                                key={role}
                                onClick={() => setSelectedRole(role)}
                                className={cn(
                                    "px-3 py-1 rounded-lg text-[10px] font-bold uppercase border transition-all cursor-pointer",
                                    selectedRole === role
                                        ? "bg-amber-500/20 border-amber-500/30 text-amber-400"
                                        : "bg-amber-500/10 border-amber-500/20 text-amber-400/80 hover:bg-amber-500/20"
                                )}
                            >
                                {role}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Player List */}
                <div className="lg:col-span-2">
                    <GlassTable>
                        <GlassTableHeader>
                            <GlassTableRow>
                                <GlassTableHead>
                                    <button onClick={() => handleSort("name")} className="flex items-center hover:text-white active:text-cyan-300 active:opacity-80 transition-colors">
                                        Player <SortIcon field="name" sortField={sortField} sortDirection={sortDirection} />
                                    </button>
                                </GlassTableHead>
                                <GlassTableHead>Team</GlassTableHead>
                                <GlassTableHead className="text-center">Role</GlassTableHead>
                                <GlassTableHead className="text-center">
                                    <button onClick={() => handleSort("age")} className="flex items-center justify-center hover:text-white active:text-cyan-300 active:opacity-80 transition-colors">
                                        Age <SortIcon field="age" sortField={sortField} sortDirection={sortDirection} />
                                    </button>
                                </GlassTableHead>
                                <GlassTableHead className="text-center">
                                    <button onClick={() => handleSort("ovr")} className="flex items-center justify-center hover:text-white active:text-cyan-300 active:opacity-80 transition-colors">
                                        OVR <SortIcon field="ovr" sortField={sortField} sortDirection={sortDirection} />
                                    </button>
                                </GlassTableHead>
                                {myRoster.length > 0 && (
                                    <GlassTableHead className="text-center">
                                        <button onClick={() => handleSort("synergy")} className="flex items-center justify-center hover:text-white active:text-cyan-300 active:opacity-80 transition-colors">
                                            Syn <SortIcon field="synergy" sortField={sortField} sortDirection={sortDirection} />
                                        </button>
                                    </GlassTableHead>
                                )}
                                <GlassTableHead className="text-right">
                                    <button onClick={() => handleSort("value")} className="flex items-center justify-end hover:text-white active:text-cyan-300 active:opacity-80 transition-colors">
                                        Value <SortIcon field="value" sortField={sortField} sortDirection={sortDirection} />
                                    </button>
                                </GlassTableHead>
                                <GlassTableHead className="text-center">Status</GlassTableHead>
                            </GlassTableRow>
                        </GlassTableHeader>
                        <tbody>
                            {filteredPlayers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((player) => {
                                const synScore = synergyMap.get(player.id)
                                const isWatchlisted = isPlayerWatchlisted(player.id)

                                return (
                                    <GlassTableRow
                                        key={player.id}
                                        className={cn(
                                            "cursor-pointer",
                                            selectedPlayer?.id === player.id && "bg-primary/10",
                                            isWatchlisted && "border-l-2 border-l-amber-500/50"
                                        )}
                                        onClick={() => setSelectedPlayer(player)}
                                    >
                                        <GlassTableCell>
                                            <div className="flex items-center gap-3">
                                                {isWatchlisted && (
                                                    <Star size={10} className="text-amber-400 shrink-0 fill-amber-400" />
                                                )}
                                                <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                                                    <PlayerPortrait
                                                        src={player.portraitPath}
                                                        alt={player.nickname}
                                                        size={40}
                                                        variant="card"
                                                    />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-bold text-white truncate max-w-[100px]">{player.nickname}</p>
                                                    <div className="mt-0.5">
                                                        <CountryFlag country={player.nationality} showName={false} size={12} />
                                                    </div>
                                                </div>
                                            </div>
                                        </GlassTableCell>
                                        <GlassTableCell>
                                            <div className="flex items-center gap-2">
                                                {player.team && (
                                                    <div className="w-6 h-6 flex items-center justify-center overflow-hidden shrink-0">
                                                        <TeamLogoImage
                                                            src={(player.team as any).logoPath}
                                                            alt={player.team.name}
                                                            size={20}
                                                            team={player.team as any}
                                                        />
                                                    </div>
                                                )}
                                                <span className="text-xs font-medium text-white/80 truncate max-w-[60px]">
                                                    {player.team?.name || "FA"}
                                                </span>
                                            </div>
                                        </GlassTableCell>
                                        <GlassTableCell className="text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                <Badge className="bg-white/5 text-white/60 border-white/10 text-[10px]">
                                                    {resolvePlayerRole(player).split(",")[0].toUpperCase().replace("ENTRY_FRAGGER", "ENTRY")}
                                                </Badge>
                                                {player.secondaryRole && (
                                                    <Badge className="bg-white/5 text-white/40 border-white/10 text-[9px]">
                                                        +{player.secondaryRole.toUpperCase().replace("ENTRY_FRAGGER", "ENTRY")}
                                                    </Badge>
                                                )}
                                            </div>
                                        </GlassTableCell>
                                        <GlassTableCell className="text-center font-sans">
                                            {player.age}
                                        </GlassTableCell>
                                        <GlassTableCell className="text-center">
                                            {(() => {
                                                const isScouted = isPlayerScouted(player.id)
                                                const ovr = player.evaluation.overallRating

                                                if (isScouted) {
                                                    return (
                                                        <span className={cn(
                                                            "text-lg font-normal",
                                                            ovr >= 80 ? "text-emerald-400" :
                                                                ovr >= 70 ? "text-blue-400" :
                                                                    ovr >= 60 ? "text-amber-400" :
                                                                        "text-white/50"
                                                        )}>
                                                            {ovr}
                                                        </span>
                                                    )
                                                } else {
                                                    // Show a fuzzy range for unscouted players. The band is
                                                    // OFFSET (not centered on the true rating) and deterministic
                                                    // per player — previously it was [ovr-15, ovr+15], whose
                                                    // midpoint leaked the exact OVR.
                                                    const [min, max] = fuzzyBand(ovr, 15, player.id)
                                                    return (
                                                        <span className="text-sm font-sans text-white/40" title="Scout to reveal exact rating">
                                                            {min}-{max}
                                                        </span>
                                                    )
                                                }
                                            })()}
                                        </GlassTableCell>
                                        {myRoster.length > 0 && (
                                            <GlassTableCell className="text-center">
                                                {synScore !== undefined ? (
                                                    <div className="flex items-center justify-center gap-1">
                                                        <div className={cn(
                                                            "w-2 h-2 rounded-full",
                                                            synScore >= 85 ? "bg-emerald-400" :
                                                                synScore >= 70 ? "bg-blue-400" :
                                                                    synScore >= 50 ? "bg-amber-400" :
                                                                        "bg-rose-400"
                                                        )} />
                                                        <span className={cn(
                                                            "text-sm font-sans",
                                                            synScore >= 85 ? "text-emerald-400" :
                                                                synScore >= 70 ? "text-blue-400" :
                                                                    synScore >= 50 ? "text-amber-400" :
                                                                        "text-rose-400"
                                                        )}>
                                                            {synScore}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-white/20">-</span>
                                                )}
                                            </GlassTableCell>
                                        )}
                                        <GlassTableCell className="text-right">
                                            <span className="font-sans font-bold text-emerald-400">
                                                {formatPrice(player.evaluation.transferValue)}
                                            </span>
                                        </GlassTableCell>
                                        <GlassTableCell className="text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                {isPlayerScouted(player.id) && (
                                                    <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-[8px]">
                                                        SCOUTED
                                                    </Badge>
                                                )}
                                                {player.forSale ? (
                                                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                                                        Available
                                                    </Badge>
                                                ) : !player.team ? (
                                                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">
                                                        Free Agent
                                                    </Badge>
                                                ) : (
                                                    <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30 text-[10px]">
                                                        Not For Sale
                                                    </Badge>
                                                )}
                                            </div>
                                        </GlassTableCell>
                                    </GlassTableRow>
                                )
                            })}
                        </tbody>
                    </GlassTable>

                    {filteredPlayers.length === 0 && (
                        <EmptyState
                            icon={Search}
                            title="No Matches"
                            description="No players match your current filters. Try widening the search, lowering the rating bar, or scouting more regions to surface fresh talent."
                            framed
                            className="mt-4"
                        />
                    )}

                    {filteredPlayers.length > PAGE_SIZE && (() => {
                        const totalPages = Math.ceil(filteredPlayers.length / PAGE_SIZE)
                        const safePage = Math.min(page, totalPages - 1)
                        return (
                            <div className="flex items-center justify-between mt-4">
                                <span className="text-xs text-muted-foreground uppercase tracking-widest">
                                    Showing {safePage * PAGE_SIZE + 1}-{Math.min((safePage + 1) * PAGE_SIZE, filteredPlayers.length)} of {filteredPlayers.length}
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        disabled={safePage === 0}
                                        onClick={() => setPage(p => Math.max(0, p - 1))}
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase border border-white/10 bg-white/5 text-white hover:bg-white/10 disabled:opacity-30 transition-all"
                                    >
                                        Prev
                                    </button>
                                    <span className="text-xs text-white font-bold px-2">
                                        {safePage + 1} / {totalPages}
                                    </span>
                                    <button
                                        disabled={safePage >= totalPages - 1}
                                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase border border-white/10 bg-white/5 text-white hover:bg-white/10 disabled:opacity-30 transition-all"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )
                    })()}
                </div>

                {/* Player Detail Panel */}
                <div className="lg:col-span-1">
                    <AnimatePresence mode="wait">
                        {selectedPlayer ? (
                            <motion.div
                                key={selectedPlayer.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="glass-panel p-6 sticky top-8 border-primary/20"
                            >
                                {/* Header */}
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden">
                                            <PlayerPortrait
                                                src={selectedPlayer.portraitPath}
                                                alt={selectedPlayer.nickname}
                                                size={64}
                                            />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-normal text-white">{selectedPlayer.nickname}</h2>
                                            <p className="text-sm text-muted-foreground">{selectedPlayer.name}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                toggleWatchlistPlayer(selectedPlayer.id)
                                            }}
                                            className={cn(
                                                "p-2 rounded-lg transition-all",
                                                isPlayerWatchlisted(selectedPlayer.id)
                                                    ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                                                    : "hover:bg-white/5 text-muted-foreground hover:text-amber-400"
                                            )}
                                            title={isPlayerWatchlisted(selectedPlayer.id) ? "Remove from watchlist" : "Add to watchlist"}
                                        >
                                            <Star size={18} className={isPlayerWatchlisted(selectedPlayer.id) ? "fill-amber-400" : ""} />
                                        </button>
                                        <button
                                            onClick={() => setSelectedPlayer(null)}
                                            className="p-2 hover:bg-white/5 rounded-lg"
                                        >
                                            <X size={18} className="text-muted-foreground" />
                                        </button>
                                    </div>
                                </div>

                                {/* Stats Grid - Fog of War */}
                                {(() => {
                                    const isScouted = isPlayerScouted(selectedPlayer.id)
                                    const ovr = selectedPlayer.evaluation.overallRating
                                    const roleFit = selectedPlayer.evaluation.roleFit
                                    const potential = selectedPlayer.evaluation.futureValue

                                    const isBeingScouted = activeScoutingMission?.playerId === selectedPlayer.id
                                    const cw = useGameStore.getState().currentWeek || 0
                                    const weeksRemaining = isBeingScouted
                                        ? Math.max(0, (activeScoutingMission?.completionWeek || 0) - cw)
                                        : 0
                                    const scoutingComplete = isScouted || (isBeingScouted && weeksRemaining === 0)

                                    if (scoutingComplete) {
                                        return (
                                            <div className="grid grid-cols-3 gap-3 mb-6">
                                                <div className="text-center p-3 bg-white/5 rounded-xl">
                                                    <p className="text-2xl font-normal text-white">{ovr}</p>
                                                    <p className="text-[8px] text-muted-foreground font-bold uppercase">Overall</p>
                                                </div>
                                                <div className="text-center p-3 bg-white/5 rounded-xl">
                                                    <p className="text-2xl font-normal text-blue-400">{roleFit}</p>
                                                    <p className="text-[8px] text-muted-foreground font-bold uppercase">Role Fit</p>
                                                </div>
                                                <div className="text-center p-3 bg-white/5 rounded-xl">
                                                    <p className="text-2xl font-normal text-purple-400">{potential}</p>
                                                    <p className="text-[8px] text-muted-foreground font-bold uppercase">Potential</p>
                                                </div>
                                            </div>
                                        )
                                    } else {
                                        const ovrMin = Math.max(0, ovr - 15)
                                        const ovrMax = Math.min(99, ovr + 15)
                                        return (
                                            <div className="grid grid-cols-3 gap-3 mb-6">
                                                <div className="text-center p-3 bg-white/5 rounded-xl border border-dashed border-white/10">
                                                    <p className="text-lg font-sans text-white/40">{ovrMin}-{ovrMax}</p>
                                                    <p className="text-[8px] text-muted-foreground font-bold uppercase">Overall</p>
                                                </div>
                                                <div className="text-center p-3 bg-white/5 rounded-xl border border-dashed border-white/10">
                                                    <p className="text-lg font-sans text-white/40">??</p>
                                                    <p className="text-[8px] text-muted-foreground font-bold uppercase">Role Fit</p>
                                                </div>
                                                <div className="text-center p-3 bg-white/5 rounded-xl border border-dashed border-white/10">
                                                    <p className="text-lg font-sans text-white/40">??</p>
                                                    <p className="text-[8px] text-muted-foreground font-bold uppercase">Potential</p>
                                                </div>
                                            </div>
                                        )
                                    }
                                })()}

                                {/* Spider Chart */}
                                {(selectedPlayer.firepower || selectedPlayer.sniping) && (
                                    <div className="mb-6">
                                        <PlayerSpiderChart
                                            stats={{
                                                firepower: selectedPlayer.firepower,
                                                entrying: selectedPlayer.entrying,
                                                trading: selectedPlayer.trading,
                                                opening: selectedPlayer.opening,
                                                clutching: selectedPlayer.clutching,
                                                sniping: selectedPlayer.sniping,
                                                utility: selectedPlayer.utility,
                                            }}
                                            size="sm"
                                        />
                                    </div>
                                )}

                                {/* Synergy Breakdown */}
                                {myRoster.length > 0 && (
                                    <div className="mb-6 space-y-2">
                                        <h4 className="text-xs text-muted-foreground font-bold uppercase tracking-widest border-b border-white/5 pb-2 flex items-center gap-2">
                                            <Heart size={12} className="text-primary" />
                                            Team Synergy
                                        </h4>
                                        <div className="space-y-1.5">
                                            {myRoster.map(member => {
                                                const pairSyn = SynergyCalculator.calculatePairSynergy(
                                                    selectedPlayer as any,
                                                    member as any
                                                )
                                                return (
                                                    <div key={member.id} className="flex items-center gap-2">
                                                        <span className="text-[10px] text-white/60 w-16 truncate">{member.nickname}</span>
                                                        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                            <div
                                                                className={cn(
                                                                    "h-full rounded-full transition-all",
                                                                    pairSyn >= 85 ? "bg-emerald-400" :
                                                                        pairSyn >= 70 ? "bg-blue-400" :
                                                                            pairSyn >= 50 ? "bg-amber-400" :
                                                                                "bg-rose-400"
                                                                )}
                                                                style={{ width: `${pairSyn}%` }}
                                                            />
                                                        </div>
                                                        <span className={cn(
                                                            "text-[10px] font-bold w-6 text-right",
                                                            pairSyn >= 85 ? "text-emerald-400" :
                                                                pairSyn >= 70 ? "text-blue-400" :
                                                                    pairSyn >= 50 ? "text-amber-400" :
                                                                        "text-rose-400"
                                                        )}>
                                                            {pairSyn}
                                                        </span>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                        {/* Average */}
                                        {(() => {
                                            const avgSyn = synergyMap.get(selectedPlayer.id)
                                            if (avgSyn === undefined) return null
                                            return (
                                                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                                    <span className="text-[10px] font-bold uppercase text-muted-foreground">Average</span>
                                                    <span className={cn(
                                                        "text-sm font-bold",
                                                        avgSyn >= 85 ? "text-emerald-400" :
                                                            avgSyn >= 70 ? "text-blue-400" :
                                                                avgSyn >= 50 ? "text-amber-400" :
                                                                    "text-rose-400"
                                                    )}>
                                                        {avgSyn}
                                                    </span>
                                                </div>
                                            )
                                        })()}
                                        {/* Synergy factors hint */}
                                        {(() => {
                                            const factors: string[] = []
                                            const code = toCountryCode(selectedPlayer.nationality)
                                            const myNats = myRoster.map(m => toCountryCode(m.nationality))
                                            if (myNats.includes(code)) factors.push("Same Nationality +15")
                                            const region = getPlayerRegion(selectedPlayer.nationality)
                                            const myRegions = myRoster.map(m => getPlayerRegion(m.nationality))
                                            if (region && myRegions.includes(region) && !myNats.includes(code)) factors.push("Same Region +10")
                                            if (factors.length === 0) return null
                                            return (
                                                <div className="flex flex-wrap gap-1 pt-1">
                                                    {factors.map(f => (
                                                        <Badge key={f} className="bg-primary/10 text-primary/80 border-primary/20 text-[8px]">
                                                            {f}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )
                                        })()}
                                    </div>
                                )}

                                {/* Info */}
                                <div className="space-y-3 mb-6">
                                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                                        <span className="text-xs text-muted-foreground font-bold uppercase">Team</span>
                                        <span className="text-sm font-bold text-white">
                                            {selectedPlayer.team?.name || "Free Agent"}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                                        <span className="text-xs text-muted-foreground font-bold uppercase">Role</span>
                                        <span className="text-sm font-bold text-white">
                                            {resolvePlayerRole(selectedPlayer as any).split(",")[0]}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                                        <span className="text-xs text-muted-foreground font-bold uppercase">Age</span>
                                        <span className="text-sm font-bold text-white">{selectedPlayer.age}</span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                                        <span className="text-xs text-muted-foreground font-bold uppercase">Nationality</span>
                                        <CountryFlag country={selectedPlayer.nationality} showName={true} />
                                    </div>

                                    {/* Contract Status */}
                                    {(() => {
                                        const weeks = getContractWeeksRemaining(selectedPlayer.id, contracts || [], currentWeek || 0)
                                        if (weeks === null) {
                                            return (
                                                <div className="flex justify-between items-center py-2 border-b border-white/5">
                                                    <span className="text-xs text-muted-foreground font-bold uppercase">Contract</span>
                                                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">Free Agent</Badge>
                                                </div>
                                            )
                                        }
                                        return (
                                            <div className="flex justify-between items-center py-2 border-b border-white/5">
                                                <span className="text-xs text-muted-foreground font-bold uppercase">Contract</span>
                                                <span className={cn(
                                                    "text-sm font-bold",
                                                    weeks <= 4 ? "text-emerald-400" :
                                                        weeks <= 13 ? "text-amber-400" :
                                                            "text-white"
                                                )}>
                                                    {weeks} weeks
                                                    {weeks <= 4 && <span className="text-[8px] ml-1 text-emerald-400">(EXPIRING)</span>}
                                                </span>
                                            </div>
                                        )
                                    })()}

                                    {/* Market Value + Affordability */}
                                    <div className="flex justify-between items-center py-2">
                                        <span className="text-xs text-muted-foreground font-bold uppercase">Market Value</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg font-normal text-emerald-400">
                                                {formatPrice(selectedPlayer.evaluation.transferValue)}
                                            </span>
                                            {(() => {
                                                const status = getAffordabilityStatus(selectedPlayer.evaluation.transferValue, myTeamBudget)
                                                const styles = {
                                                    affordable: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
                                                    tight: "bg-amber-500/20 text-amber-400 border-amber-500/30",
                                                    over_budget: "bg-rose-500/20 text-rose-400 border-rose-500/30",
                                                }
                                                const labels = {
                                                    affordable: "OK",
                                                    tight: "TIGHT",
                                                    over_budget: "OVER",
                                                }
                                                return (
                                                    <Badge className={cn("text-[8px]", styles[status])}>
                                                        {labels[status]}
                                                    </Badge>
                                                )
                                            })()}
                                        </div>
                                    </div>
                                </div>

                                {/* Transfer History */}
                                {transferHistory && transferHistory.some(t => t.playerId === selectedPlayer.id) && (
                                    <div className="mb-6 space-y-2">
                                        <h4 className="text-xs text-muted-foreground font-bold uppercase tracking-widest border-b border-white/5 pb-2">Career Path</h4>
                                        <div className="space-y-2">
                                            {transferHistory
                                                .filter(t => t.playerId === selectedPlayer.id)
                                                .sort((a, b) => b.week - a.week)
                                                .map(t => (
                                                    <div key={t.id} className="bg-white/5 rounded-xl p-3 flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className={cn(
                                                                "w-1 h-8 rounded-full",
                                                                t.type === "SIGNING" ? "bg-emerald-500" :
                                                                    t.type === "TRANSFER" ? "bg-blue-500" :
                                                                        t.type === "RELEASE" ? "bg-red-500" : "bg-neutral-500"
                                                            )} />
                                                            <div>
                                                                <p className="text-xs font-bold text-white leading-tight">
                                                                    {t.toTeamName}
                                                                </p>
                                                                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                                    {t.fromTeamName ? (
                                                                        <>
                                                                            <span>from</span>
                                                                            <span>{t.fromTeamName}</span>
                                                                        </>
                                                                    ) : "Free Agent"}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-[10px] font-bold text-primary">Week {t.week}</p>
                                                            {t.fee > 0 && <p className="text-[10px] text-white/50">${t.fee.toLocaleString()}</p>}
                                                        </div>
                                                    </div>
                                                ))
                                            }
                                        </div>
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="space-y-3">
                                    {/* Scouting Status / Button */}
                                    {(() => {
                                        const scoutStaff = useGameStore.getState().staff.filter(
                                            s => s.teamId === playerTeamId && s.role === "scout"
                                        )
                                        const hasScoutAgent = scoutStaff.length > 0

                                        const isBeingScouted = activeScoutingMission?.playerId === selectedPlayer.id
                                        const cw = useGameStore.getState().currentWeek || 0
                                        const weeksRemaining = isBeingScouted
                                            ? Math.max(0, (activeScoutingMission?.completionWeek || 0) - cw)
                                            : 0
                                        const isScouted = isPlayerScouted(selectedPlayer.id)

                                        if (isScouted || (isBeingScouted && weeksRemaining === 0)) {
                                            return (
                                                <div className="space-y-2">
                                                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center">
                                                        <p className="text-emerald-400 text-sm font-bold uppercase tracking-wider">Scouting Complete</p>
                                                        <p className="text-white/50 text-xs mt-1">Full stats revealed above</p>
                                                    </div>
                                                    <Link href={`/player/${selectedPlayer.id}`}>
                                                        <Button className="w-full h-10 bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 font-bold rounded-xl text-sm">
                                                            View Full Profile
                                                        </Button>
                                                    </Link>
                                                </div>
                                            )
                                        }

                                        if (isBeingScouted && weeksRemaining > 0) {
                                            return (
                                                <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-blue-400 text-sm font-bold uppercase tracking-wider">Scouting...</span>
                                                        <span className="text-white font-sans text-lg">{weeksRemaining} weeks</span>
                                                    </div>
                                                    <div className="w-full bg-white/10 rounded-full h-2">
                                                        <div
                                                            className="bg-blue-400 h-2 rounded-full transition-all"
                                                            style={{ width: `${((4 - weeksRemaining) / 4) * 100}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )
                                        }

                                        if (!hasScoutAgent) {
                                            return (
                                                <div className="p-4 bg-rose-500/10 border border-rose-500/30 border-dashed rounded-xl text-center">
                                                    <p className="text-rose-400 text-sm font-bold uppercase tracking-wider mb-1">Scout Required</p>
                                                    <p className="text-white/50 text-xs">Hire a Scout from the Staff page to scout players</p>
                                                    <Link href="/staff">
                                                        <Button variant="ghost" className="mt-2 text-xs text-rose-400 hover:text-rose-300">
                                                            Go to Staff →
                                                        </Button>
                                                    </Link>
                                                </div>
                                            )
                                        }

                                        if (activeScoutingMission) {
                                            return (
                                                <Button
                                                    disabled
                                                    className="w-full h-10 font-normal rounded-xl text-sm bg-white/10 text-white/50 cursor-not-allowed"
                                                >
                                                    <Search size={16} className="mr-2" />
                                                    Scout busy - finish current mission first
                                                </Button>
                                            )
                                        }

                                        return (
                                            <Button
                                                onClick={() => startScoutingMission(selectedPlayer.id)}
                                                className="w-full h-10 font-normal rounded-xl text-sm bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30"
                                            >
                                                <Search size={16} className="mr-2" />
                                                Scout Player ($3,000 - 4 weeks)
                                            </Button>
                                        )
                                    })()}

                                    {/* Make Offer Button */}
                                    {(() => {
                                        const hasScout = useGameStore.getState().staff.some(
                                            s => s.teamId === playerTeamId && s.role === "scout"
                                        )

                                        if (!hasScout) {
                                            return (
                                                <Button
                                                    disabled
                                                    className="w-full h-12 bg-white/10 text-white/50 font-normal rounded-xl cursor-not-allowed"
                                                >
                                                    <DollarSign size={18} className="mr-2" />
                                                    Scout Required to Make Offers
                                                </Button>
                                            )
                                        }

                                        if (selectedPlayer.forSale) {
                                            return (
                                                <Button
                                                    onClick={() => setNegotiatingPlayerId(selectedPlayer.id)}
                                                    className="w-full h-12 bg-white text-black hover:bg-white/90 font-normal rounded-xl"
                                                >
                                                    <DollarSign size={18} className="mr-2" />
                                                    Make Offer
                                                </Button>
                                            )
                                        }

                                        return (
                                            <Button
                                                disabled
                                                className="w-full h-12 bg-white/10 text-white/50 font-normal rounded-xl cursor-not-allowed"
                                            >
                                                Not Available
                                            </Button>
                                        )
                                    })()}
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="h-full flex flex-col gap-6"
                            >
                                <div className="glass-panel p-12 text-center border-dashed border-white/10 shrink-0">
                                    <Target size={48} className="mx-auto mb-4 text-white/10" />
                                    <h3 className="font-normal text-white uppercase mb-2">Select a Player</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Click on any player to view their detailed stats
                                    </p>
                                </div>

                                {/* Market Activity Feed */}
                                <div className="flex-1 glass-panel p-6 flex flex-col min-h-0">
                                    <h3 className="font-normal text-white uppercase mb-4 flex items-center gap-2">
                                        <Activity size={18} className="text-emerald-400" />
                                        Recent Market Activity
                                    </h3>
                                    <ScrollArea className="flex-1 pr-4">
                                        <div className="space-y-2">
                                            {transferHistory && transferHistory.length > 0 ? (
                                                [...transferHistory]
                                                    .sort((a, b) => b.week - a.week)
                                                    .slice(0, 50)
                                                    .map(t => {
                                                        const p = players.find(p => p.id === t.playerId)
                                                        const pFlag = p?.nationality || "wo"
                                                        return (
                                                            <div key={t.id} className="bg-white/5 rounded-xl p-3 flex items-center justify-between group hover:bg-white/10 transition-colors">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-black/20 shrink-0 border border-white/10">
                                                                        {p ? (
                                                                            <PlayerPortrait src={p.portraitPath} alt={p.nickname} className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <div className={cn("w-full h-full flex items-center justify-center font-bold text-xs uppercase text-white/50", t.type === "SIGNING" ? "bg-emerald-500/10" : "bg-blue-500/10")}>
                                                                                {t.playerName.substring(0, 1)}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        <div className="flex items-center gap-1.5">
                                                                            <p className="text-xs font-bold text-white group-hover:text-primary transition-colors">{t.playerName}</p>
                                                                            <CountryFlag country={pFlag} className="w-3" />
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase font-normal">
                                                                            <span>{t.fromTeamName || "Free Agent"}</span>
                                                                            <ArrowRight size={8} />
                                                                            <span className="text-white">{t.toTeamName}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className="text-[10px] font-bold text-emerald-400">
                                                                        {t.fee > 0 ? `$${t.fee.toLocaleString()}` : "FREE"}
                                                                    </p>
                                                                    <p className="text-[10px] text-white/30">Week {t.week}</p>
                                                                </div>
                                                            </div>
                                                        )
                                                    })
                                            ) : (
                                                <div className="text-center py-10 text-muted-foreground text-xs uppercase font-bold">
                                                    No activity recorded yet
                                                </div>
                                            )}
                                        </div>
                                    </ScrollArea>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {negotiatingPlayerId && (
                <NegotiationModal
                    playerId={negotiatingPlayerId}
                    isOpen={!!negotiatingPlayerId}
                    onClose={() => setNegotiatingPlayerId(null)}
                />
            )}
        </div>
        </ErrorBoundary>
    )
}
