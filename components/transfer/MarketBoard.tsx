"use client"

import { memo, useEffect, useMemo, useState, type KeyboardEvent } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, Bell, BellOff, Bookmark, ChevronLeft, ChevronRight, Search, SlidersHorizontal, Star, X } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { useDebounce } from "@/hooks/useDebounce"
import { useRouteViewState } from "@/hooks/use-route-view-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PlayerPortrait, TeamLogoImage } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { LoadingState } from "@/components/ui/loading"
import { Panel } from "@/src/components/ui/Panel"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { getVisibleStats, scoutedRatingSortValue, type VisibleStats } from "@/engine/scouting-system"
import { academyHeldPlayerIds, employedScout, recruitmentSalary } from "@/engine/recruitment"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { getBoardSanctionedFee } from "@/engine/board-expectations"
import { ALL_REGIONS } from "@/engine/scouting-helpers"
import type { PlayerSaveData, TeamSaveData } from "@/engine/save-types"
import { SENIOR_ROSTER_MAX } from "@/engine/roster-rules"
import { cn } from "@/lib/utils"
import { formatCurrency, formatRole } from "@/lib/utils-extended"
import { ScoutedRating } from "./ScoutedRating"
import { DealPanel } from "./DealPanel"
import { TeamLink } from "@/components/ui/EntityLink"
import { describeCriteria, isNarrowing, matchesMarketSearch, MAX_SAVED_SEARCHES, type MarketCriteria } from "@/engine/market-search"
import { toast } from "@/lib/toast"

type Mode = "transfers" | "scouting"
type SortField = "ovr" | "age" | "value" | "name"
type StatusFilter = "all" | "listed" | "free" | "scouted" | "watchlist"

const PAGE_SIZE = 25
const ROLES = [
    { value: "ALL", label: "All roles" },
    { value: "AWPER", label: "AWPer" },
    { value: "RIFLER", label: "Rifler" },
    { value: "ENTRY_FRAGGER", label: "Entry" },
    { value: "SUPPORT", label: "Support" },
    { value: "IGL", label: "IGL" },
] as const
const STATUSES: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "listed", label: "Listed" },
    { value: "free", label: "Free agents" },
    { value: "scouted", label: "Scouted" },
    { value: "watchlist", label: "Watchlist" },
]
// Age bands themselves live in AGE_BANDS (engine/market-search.ts), shared with the alerts.
const AGES = [
    { value: "all", label: "Any age" },
    { value: "young", label: "≤ 21" },
    { value: "prime", label: "22–27" },
    { value: "veteran", label: "28+" },
] as const
const FEES = [
    { value: 0, label: "Any fee" },
    { value: 100_000, label: "≤ $100k" },
    { value: 500_000, label: "≤ $500k" },
    { value: 1_000_000, label: "≤ $1M" },
    { value: 5_000_000, label: "≤ $5M" },
] as const
const CONTRACTS = [
    { value: 0, label: "Any contract" },
    { value: 13, label: "≤ 13 wks left" },
    { value: 26, label: "≤ 26 wks left" },
    { value: 52, label: "≤ 1 year left" },
] as const
const PRIMARY_ROLES = ["IGL", "AWPER", "ENTRY_FRAGGER", "SUPPORT", "RIFLER"] as const

interface Row {
    player: PlayerSaveData
    team: TeamSaveData | undefined
    knowledge: VisibleStats
    value: number
}

function Segmented<T extends string | number>({ options, value, onChange, label }: { options: readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
    return (
        <div role="group" aria-label={label} className="inline-flex shrink-0 rounded border border-line bg-shell p-0.5">
            {options.map(o => (
                <button
                    key={String(o.value)}
                    type="button"
                    aria-pressed={value === o.value}
                    onClick={() => onChange(o.value)}
                    className={cn(
                        "h-7 whitespace-nowrap rounded-sm px-2.5 text-xs font-semibold transition-colors",
                        value === o.value ? "bg-raised text-ink-1 shadow-[inset_0_-2px_0_var(--gold)]" : "text-ink-3 hover:text-ink-1",
                    )}
                >
                    {o.label}
                </button>
            ))}
        </div>
    )
}

function SortHead({ field, label, sort, dir, onSort, className }: { field: SortField; label: string; sort: SortField; dir: "asc" | "desc"; onSort: (f: SortField) => void; className?: string }) {
    const active = sort === field
    return (
        <th data-slot="table-head" className={cn("px-3", className)} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
            <button type="button" onClick={() => onSort(field)} className={cn("inline-flex items-center gap-1 uppercase hover:text-ink-1", active && "text-ink-1")}>
                {label}
                {active && (dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
            </button>
        </th>
    )
}

const MarketRow = memo(function MarketRow({ row, selected, wage, watchlisted, scouting, onSelect }: {
    row: Row; selected: boolean; wage: number; watchlisted: boolean; scouting: boolean; onSelect: (id: string) => void
}) {
    const { player, team, knowledge, value } = row
    const status = !team ? "Free agent" : player.forSale ? "Listed" : "Contracted"
    const onKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
        if (e.target !== e.currentTarget) return
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(player.id) }
    }
    return (
        <tr
            data-slot="table-row"
            data-state={selected ? "selected" : undefined}
            tabIndex={0}
            aria-label={`${player.nickname}, show deal`}
            onClick={() => onSelect(player.id)}
            onKeyDown={onKeyDown}
            className="group h-12 cursor-pointer border-b border-line outline-none transition-colors focus-visible:bg-hover"
        >
            <td className="py-1.5 pl-4 pr-3">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded bg-raised">
                        <PlayerPortrait src={player.portraitPath} seed={player.id} alt={player.nickname} size={36} />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                            <span className={cn("truncate text-sm font-semibold", selected ? "text-gold" : "text-ink-1 group-hover:text-gold")}>{player.nickname}</span>
                            {watchlisted && <Star size={11} className="shrink-0 fill-current text-ink-3" aria-label="On watchlist" />}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
                            <CountryFlag country={player.nationality} size={12} />
                            <span className="truncate">{player.name && player.name !== player.nickname ? player.name : String(player.nationality || "").toUpperCase()}</span>
                        </div>
                    </div>
                </div>
            </td>
            <td className="px-3">
                {team ? (
                    <span className="flex min-w-0 items-center gap-2 text-sm text-ink-2">
                        <TeamLogoImage src={(team as { logoPath?: string }).logoPath} alt={team.name} team={team as never} size={18} />
                        <TeamLink id={team.id} className="max-w-[140px] truncate">{team.name}</TeamLink>
                    </span>
                ) : <span className="text-sm text-ink-3">—</span>}
            </td>
            <td className="px-3"><RoleTag role={player.role} /></td>
            <td className="px-3 text-center text-sm tabular-nums text-ink-2">{player.age}</td>
            <td className="px-3 text-center"><ScoutedRating knowledge={knowledge} size="sm" /></td>
            <td className="px-3 text-right text-sm tabular-nums text-ink-1">{team ? formatCurrency(value, "$", true) : <span className="text-ink-3">Free</span>}</td>
            <td className="px-3 text-right text-sm tabular-nums text-ink-2">{formatCurrency(wage, "$", true)}</td>
            <td className="pl-3 pr-4 text-xs text-ink-3">
                {scouting ? <span className="text-ink-2">Scouting…</span> : <span className={cn(status === "Listed" && "text-ink-2")}>{status}</span>}
            </td>
        </tr>
    )
})

/**
 * The player market: one table for Transfers and Scouting, filters in a
 * toolbar, and a docked deal panel for the selected player.
 */
export function MarketBoard({ mode }: { mode: Mode }) {
    const {
        players, teams, playerTeamId, scoutedPlayers, academyPlayers, academyPendingProspects, contracts,
        currentWeek, watchlistedPlayerIds, activeScoutingMission, staff, boardState, saveId, transferHistory,
        savedSearches, saveMarketSearch, deleteMarketSearch, toggleMarketSearchAlerts,
    } = useGameStore(useShallow(state => ({
        players: state.players,
        teams: state.teams,
        playerTeamId: state.playerTeamId,
        scoutedPlayers: state.scoutedPlayers,
        academyPlayers: state.academyPlayers,
        academyPendingProspects: state.academyPendingProspects,
        contracts: state.contracts,
        currentWeek: state.currentWeek,
        watchlistedPlayerIds: state.watchlistedPlayerIds,
        activeScoutingMission: state.activeScoutingMission,
        staff: state.staff,
        boardState: state.boardState,
        saveId: state.saveId,
        transferHistory: state.transferHistory,
        savedSearches: state.savedSearches,
        saveMarketSearch: state.saveMarketSearch,
        deleteMarketSearch: state.deleteMarketSearch,
        toggleMarketSearchAlerts: state.toggleMarketSearchAlerts,
    })))

    // The server renders without a career; match it on the first client render.
    const [isMounted, setIsMounted] = useState(false)
    useEffect(() => { setIsMounted(true) }, [])

    const prefix = mode === "scouting" ? "scouting" : "transfers"
    const [searchTerm, setSearchTerm] = useRouteViewState(saveId, `${prefix}:search`, "")
    const debouncedSearch = useDebounce(searchTerm, 250)
    const [role, setRole] = useRouteViewState<string>(saveId, `${prefix}:role`, "ALL")
    const [status, setStatus] = useRouteViewState<StatusFilter>(saveId, `${prefix}:status`, "all")
    const [age, setAge] = useRouteViewState<string>(saveId, `${prefix}:age`, "all")
    const [maxFee, setMaxFee] = useRouteViewState<number>(saveId, `${prefix}:fee`, 0)
    const [contractMax, setContractMax] = useRouteViewState<number>(saveId, `${prefix}:contract`, 0)
    const [region, setRegion] = useRouteViewState<string>(saveId, `${prefix}:region`, "ALL")
    const [sort, setSort] = useRouteViewState<SortField>(saveId, `${prefix}:sort`, mode === "scouting" ? "ovr" : "value")
    const [dir, setDir] = useRouteViewState<"asc" | "desc">(saveId, `${prefix}:dir`, "desc")
    const [page, setPage] = useRouteViewState(saveId, `${prefix}:page`, 0)
    const [showFilters, setShowFilters] = useState(false)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [naming, setNaming] = useState(false)
    const [searchName, setSearchName] = useState("")

    const criteria: MarketCriteria = { query: searchTerm, role, status, age, maxFee, contractMax, region }
    const applyCriteria = (c: MarketCriteria) => {
        setSearchTerm(c.query); setRole(c.role); setStatus(c.status); setAge(c.age); setMaxFee(c.maxFee); setContractMax(c.contractMax); setRegion(c.region)
        setShowFilters(c.age !== "all" || c.maxFee > 0 || c.contractMax > 0 || c.region !== "ALL")
        setPage(0)
    }
    // An inbox market alert opens the board with its saved search (?search=<id>).
    useEffect(() => {
        if (!isMounted) return
        const id = new URLSearchParams(window.location.search).get("search")
        const saved = id ? (savedSearches || []).find(x => x.id === id) : undefined
        if (saved) applyCriteria(saved.criteria)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMounted])

    const myTeam = useMemo(() => teams.find(t => t.id === playerTeamId), [teams, playerTeamId])
    const teamByPlayer = useMemo(() => {
        const m = new Map<string, TeamSaveData>()
        for (const t of teams) for (const id of t.rosterIds) m.set(id, t)
        return m
    }, [teams])
    const academyIds = useMemo(() => academyHeldPlayerIds({ teams, academyPlayers, academyPendingProspects }), [teams, academyPlayers, academyPendingProspects])
    const contractWeeks = useMemo(() => {
        const m = new Map<string, number>()
        for (const c of contracts) m.set(c.playerId, Math.max(0, c.endWeek - currentWeek))
        return m
    }, [contracts, currentWeek])

    // Everyone on the market, evaluated once per relevant change.
    const market = useMemo<Row[]>(() => {
        if (!myTeam) return []
        const own = new Set(myTeam.rosterIds)
        const rows: Row[] = []
        for (const p of players) {
            if (own.has(p.id) || academyIds.has(p.id) || p.isRetired) continue
            rows.push({
                player: p,
                team: teamByPlayer.get(p.id),
                knowledge: getVisibleStats(p, scoutedPlayers, myTeam.rosterIds, currentWeek),
                value: evaluatePlayer(p, undefined, undefined, currentWeek).transferValue,
            })
        }
        return rows
    }, [players, myTeam, academyIds, teamByPlayer, scoutedPlayers, currentWeek])

    const watchSet = useMemo(() => new Set(watchlistedPlayerIds), [watchlistedPlayerIds])

    const filtered = useMemo(() => {
        const list = market.filter(({ player, team, knowledge, value }) => matchesMarketSearch({
            player, team, value,
            scouted: knowledge.scoutingLevel !== "NONE",
            watchlisted: watchSet.has(player.id),
            contractWeeksLeft: contractWeeks.get(player.id),
        }, { query: debouncedSearch, role, status, age, maxFee, contractMax, region }))
        const sign = dir === "asc" ? 1 : -1
        list.sort((a, b) => {
            let cmp = 0
            if (sort === "ovr") cmp = scoutedRatingSortValue(a.knowledge.ovrRange) - scoutedRatingSortValue(b.knowledge.ovrRange)
            else if (sort === "age") cmp = a.player.age - b.player.age
            else if (sort === "value") cmp = (a.team ? a.value : 0) - (b.team ? b.value : 0)
            else cmp = a.player.nickname.localeCompare(b.player.nickname)
            return cmp * sign
        })
        return list
    }, [market, debouncedSearch, role, status, age, maxFee, contractMax, region, sort, dir, watchSet, contractWeeks])

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
    const safePage = Math.min(page, totalPages - 1)
    const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
    // Docked panel follows the selection; before any click it shows the top row.
    const activeId = (selectedId && market.some(r => r.player.id === selectedId)) ? selectedId : pageRows[0]?.player.id ?? null

    const missingRoles = useMemo(() => {
        if (!myTeam) return []
        const byId = new Map(players.map(p => [p.id, p]))
        const starters = myTeam.rosterIds.slice(0, 5).map(id => byId.get(id)?.role).filter(Boolean) as string[]
        return PRIMARY_ROLES.filter(r => !starters.includes(r))
    }, [players, myTeam])

    if (!isMounted || !myTeam) {
        return <LoadingState message="Loading market…" size="lg" className="min-h-[50vh]" />
    }

    const resetPage = () => setPage(0)
    const onSort = (field: SortField) => {
        if (sort === field) setDir(d => (d === "asc" ? "desc" : "asc"))
        else { setSort(field); setDir(field === "name" ? "asc" : "desc") }
        resetPage()
    }
    const activeFilterCount = [age !== "all", maxFee > 0, contractMax > 0, region !== "ALL"].filter(Boolean).length
    const clearAll = () => { setSearchTerm(""); setRole("ALL"); setStatus("all"); setAge("all"); setMaxFee(0); setContractMax(0); setRegion("ALL"); resetPage() }

    const sanction = getBoardSanctionedFee(boardState, myTeam.budget)
    const scout = employedScout(staff, myTeam, currentWeek)
    const missionPlayer = activeScoutingMission ? players.find(p => p.id === activeScoutingMission.playerId) : undefined
    const reportCount = scoutedPlayers.length
    const recent = [...(transferHistory || [])].sort((a, b) => b.week - a.week).slice(0, 6)

    return (
        <div className="mx-auto max-w-[1600px] space-y-5 pb-16">
            <ScreenHeader
                eyebrow={mode === "scouting" ? "Recruitment · Scouting" : "Recruitment · Transfers"}
                title={mode === "scouting" ? "Scouting" : "Transfer market"}
                subtitle={mode === "scouting"
                    ? "Ratings stay hidden until a scout reports. Pick a player, send your scout, then open talks from the panel."
                    : "Every contracted player can be bought at the right fee. Pick a player to see their terms on the right."}
                aside={mode === "scouting" ? (
                    <KpiStrip>
                        <Kpi label="Scout" value={<span className="text-xl">{scout ? scout.name.split(" ").slice(-1)[0] : "None"}</span>} hint={scout ? undefined : <Link href="/staff" className="underline underline-offset-2 hover:text-ink-1">Hire on Staff</Link>} />
                        <Kpi label="Mission" value={<span className="text-xl">{missionPlayer ? missionPlayer.nickname : "Idle"}</span>} hint={activeScoutingMission ? `Due week ${activeScoutingMission.completionWeek}` : undefined} />
                        <Kpi label="Reports" value={reportCount} />
                        <Kpi label="Watchlist" value={watchlistedPlayerIds.length} />
                    </KpiStrip>
                ) : (
                    <KpiStrip>
                        <Kpi label="Funds" value={formatCurrency(myTeam.budget, "$", true)} />
                        <Kpi label="Max fee" value={formatCurrency(sanction.maxFee, "$", true)} hint={sanction.fraction < 1 ? `Board allows ${Math.round(sanction.fraction * 100)}%` : "Board allows all funds"} />
                        <Kpi
                            label="Squad"
                            value={<span>{myTeam.rosterIds.length}<span className="text-ink-3">/{SENIOR_ROSTER_MAX}</span></span>}
                            valueClassName={myTeam.rosterIds.length >= SENIOR_ROSTER_MAX ? "text-caution" : undefined}
                            hint={myTeam.rosterIds.length >= SENIOR_ROSTER_MAX ? <Link href="/squad" className="underline underline-offset-2 hover:text-ink-1">Full: release or sell to sign</Link> : undefined}
                        />
                        <Kpi label="Listed" value={market.filter(r => r.team && r.player.forSale).length} />
                    </KpiStrip>
                )}
            />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="min-w-0 space-y-3">
                    {/* Toolbar */}
                    <Panel padded={false}>
                        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                            <div className="relative w-56 min-w-[180px]">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                                <Input
                                    placeholder="Player or club"
                                    aria-label="Search players or clubs"
                                    value={searchTerm}
                                    onChange={e => { setSearchTerm(e.target.value); resetPage() }}
                                    className="h-8 pl-8 text-sm"
                                />
                            </div>
                            <Segmented label="Role" options={ROLES} value={role} onChange={v => { setRole(v); resetPage() }} />
                            <Segmented label="Status" options={STATUSES} value={status} onChange={v => { setStatus(v); resetPage() }} />
                            <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5 text-xs" aria-expanded={showFilters} onClick={() => setShowFilters(s => !s)}>
                                <SlidersHorizontal size={13} /> Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
                            </Button>
                            <span className="ml-auto text-xs tabular-nums text-ink-3">{filtered.length.toLocaleString("en-US")} players</span>
                        </div>
                        {showFilters && (
                            <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2.5">
                                <Segmented label="Age" options={AGES} value={age} onChange={v => { setAge(v); resetPage() }} />
                                <Segmented label="Fee" options={FEES} value={maxFee} onChange={v => { setMaxFee(v); resetPage() }} />
                                <Segmented label="Contract" options={CONTRACTS} value={contractMax} onChange={v => { setContractMax(v); resetPage() }} />
                                <select
                                    aria-label="Region"
                                    value={region}
                                    onChange={e => { setRegion(e.target.value); resetPage() }}
                                    className="h-8 rounded border border-line bg-shell px-2 text-[12px]! font-semibold text-ink-2"
                                >
                                    <option value="ALL">Any region</option>
                                    {ALL_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                                {activeFilterCount > 0 && <button className="text-xs text-ink-3 underline-offset-2 hover:text-ink-1 hover:underline" onClick={() => { setAge("all"); setMaxFee(0); setContractMax(0); setRegion("ALL"); resetPage() }}>Reset</button>}
                            </div>
                        )}
                        {missingRoles.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2 text-xs text-ink-3">
                                <span>Your starting five has no</span>
                                {missingRoles.map(r => (
                                    <button key={r} onClick={() => { setRole(r); resetPage() }} className="rounded-sm border border-line-strong px-1.5 py-0.5 font-semibold uppercase tracking-[0.06em] text-ink-2 hover:border-gold hover:text-ink-1">
                                        {formatRole(r)}
                                    </button>
                                ))}
                                <span>· each missing role costs 4% team strength.</span>
                            </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2 text-xs">
                            <Bookmark size={13} className="shrink-0 text-ink-3" aria-hidden="true" />
                            {(savedSearches || []).length === 0 && !naming && <span className="text-ink-3">Save a search to get an inbox alert when new players match it.</span>}
                            {(savedSearches || []).map(sv => (
                                <span key={sv.id} className="inline-flex items-center rounded-sm border border-line-strong">
                                    <button type="button" onClick={() => applyCriteria(sv.criteria)} title={describeCriteria(sv.criteria, { role: formatRole })} className="max-w-[180px] truncate px-2 py-1 font-semibold text-ink-2 hover:text-ink-1">{sv.name}</button>
                                    <button type="button" onClick={() => toggleMarketSearchAlerts(sv.id)} aria-label={sv.alerts ? `Turn off alerts for ${sv.name}` : `Turn on alerts for ${sv.name}`} aria-pressed={sv.alerts} className={cn("border-l border-line px-1.5 py-1", sv.alerts ? "text-gold" : "text-ink-3 hover:text-ink-1")}>
                                        {sv.alerts ? <Bell size={12} /> : <BellOff size={12} />}
                                    </button>
                                    <button type="button" onClick={() => deleteMarketSearch(sv.id)} aria-label={`Delete saved search ${sv.name}`} className="border-l border-line px-1.5 py-1 text-ink-3 hover:text-negative"><X size={12} /></button>
                                </span>
                            ))}
                            {naming ? (
                                <form className="flex items-center gap-1.5" onSubmit={e => {
                                    e.preventDefault()
                                    if (saveMarketSearch(searchName || describeCriteria(criteria, { role: formatRole }), criteria)) { toast.success("Search saved. New matches will reach your inbox."); setNaming(false); setSearchName("") }
                                    else toast.error(`Up to ${MAX_SAVED_SEARCHES} saved searches.`)
                                }}>
                                    <Input id="saved-search-name" autoFocus value={searchName} onChange={e => setSearchName(e.target.value)} placeholder={describeCriteria(criteria, { role: formatRole })} aria-label="Saved search name" className="h-7 w-52 text-xs" maxLength={40} />
                                    <Button type="submit" size="sm" className="h-7 px-2.5 text-xs">Save</Button>
                                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setNaming(false)}>Cancel</Button>
                                </form>
                            ) : isNarrowing(criteria) && (savedSearches || []).length < MAX_SAVED_SEARCHES && (
                                <button type="button" onClick={() => setNaming(true)} className="ml-auto font-semibold text-ink-2 underline-offset-2 hover:text-ink-1 hover:underline">Save this search</button>
                            )}
                        </div>
                    </Panel>

                    {/* Market table */}
                    <Panel padded={false} className="overflow-hidden">
                        <div className="overflow-x-auto">
                            <table data-slot="table" className="w-full min-w-[920px] border-collapse text-left">
                                <thead data-slot="table-header">
                                    <tr className="border-b border-line">
                                        <SortHead field="name" label="Player" sort={sort} dir={dir} onSort={onSort} className="pl-4" />
                                        <th data-slot="table-head" className="px-3">Club</th>
                                        <th data-slot="table-head" className="px-3">Role</th>
                                        <SortHead field="age" label="Age" sort={sort} dir={dir} onSort={onSort} className="text-center" />
                                        <SortHead field="ovr" label="OVR" sort={sort} dir={dir} onSort={onSort} className="text-center" />
                                        <SortHead field="value" label="Value" sort={sort} dir={dir} onSort={onSort} className="text-right" />
                                        <th data-slot="table-head" className="px-3 text-right">Wage ask</th>
                                        <th data-slot="table-head" className="pl-3 pr-4">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pageRows.map(row => (
                                        <MarketRow
                                            key={row.player.id}
                                            row={row}
                                            selected={row.player.id === activeId}
                                            wage={recruitmentSalary(row.player, currentWeek, myTeam)}
                                            watchlisted={watchSet.has(row.player.id)}
                                            scouting={activeScoutingMission?.playerId === row.player.id}
                                            onSelect={setSelectedId}
                                        />
                                    ))}
                                    {pageRows.length === 0 && (
                                        <tr><td colSpan={8} className="px-4 py-10 text-center">
                                            <p className="text-sm text-ink-3">No players match these filters.</p>
                                            <Button variant="outline" size="sm" className="mt-3" onClick={clearAll}>Clear filters</Button>
                                        </td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {filtered.length > PAGE_SIZE && (
                            <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
                                <span className="text-xs tabular-nums text-ink-3">
                                    {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString("en-US")}
                                </span>
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" className="h-8 px-2.5" disabled={safePage === 0} onClick={() => setPage(p => Math.max(0, p - 1))} aria-label="Previous page"><ChevronLeft size={14} /></Button>
                                    <span className="text-xs tabular-nums text-ink-2">{safePage + 1} / {totalPages}</span>
                                    <Button variant="outline" size="sm" className="h-8 px-2.5" disabled={safePage >= totalPages - 1} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} aria-label="Next page"><ChevronRight size={14} /></Button>
                                </div>
                            </div>
                        )}
                    </Panel>
                </div>

                <aside className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start">
                    {activeId ? <DealPanel key={activeId} playerId={activeId} mode={mode} /> : (
                        <Panel><p className="text-sm text-ink-3">Pick a player to see their terms.</p></Panel>
                    )}
                    {recent.length > 0 && (
                        <Panel title="Recent moves" padded={false}>
                            <ul className="divide-y divide-line">
                                {recent.map(t => (
                                    <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2 text-xs">
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold text-ink-1">{t.playerName}</p>
                                            <p className="truncate text-ink-3">{t.fromTeamName || "Free agent"} → {t.toTeamName || "Released"}</p>
                                        </div>
                                        <div className="shrink-0 text-right tabular-nums">
                                            <p className="text-ink-2">{t.fee > 0 ? formatCurrency(t.fee, "$", true) : "Free"}</p>
                                            <p className="text-ink-3">Wk {t.week}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </Panel>
                    )}
                </aside>
            </div>
        </div>
    )
}
