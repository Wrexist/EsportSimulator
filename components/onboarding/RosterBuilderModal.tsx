"use client"

import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { RatingChip } from "@/src/components/ui/RatingChip"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { Search, UserPlus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { PlayerSaveData } from "@/engine/save-types"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { toast } from "@/lib/toast"
import { GameDifficulty } from "@/types/team-creator"
import { PlayerRole } from "@/types/enums"
import { useFocusTrap } from "@/lib/accessibility"
import { formatCurrency } from "@/lib/utils-extended"

// Weekly wage limit for the starting roster, by difficulty.
const WEEKLY_SALARY_CAPS: Record<GameDifficulty, number> = {
    story: 25000,
    normal: 15000,
    hard: 8000,
    impossible: 5000
}

interface RosterBuilderModalProps {
    isOpen: boolean
    onComplete: () => void
    /** Kept for API compatibility; the crest already carries the club colours. */
    teamColors: {
        primary: string
        secondary: string
    }
}

// Helper type for players with team info
interface PlayerWithTeamInfo extends PlayerSaveData {
    currentTeamId: string | null
    currentTeamName: string | null
    existingContract: { salaryPerWeek: number; buyout: number } | null
    isFreeAgent: boolean
    ovr: number
}

type RoleFilter = "ALL" | PlayerRole
const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
    { value: "ALL", label: "All" },
    { value: PlayerRole.IGL, label: "IGL" },
    { value: PlayerRole.AWPER, label: "AWPer" },
    { value: PlayerRole.ENTRY_FRAGGER, label: "Entry" },
    { value: PlayerRole.SUPPORT, label: "Support" },
    { value: PlayerRole.RIFLER, label: "Rifler" },
]

type SortKey = "rating" | "potential" | "salary" | "age"
const SORTS: { value: SortKey; label: string }[] = [
    { value: "rating", label: "Rating" },
    { value: "potential", label: "Potential" },
    { value: "salary", label: "Wage (low first)" },
    { value: "age", label: "Age (young first)" },
]

/** Realistic weekly wage for a free agent: skill bands, a potential premium, an age modifier. */
function autoContract(player: PlayerWithTeamInfo, currentWeek: number) {
    const skill = player.skill || 50
    const potential = player.potential || 60
    let baseSalary: number
    if (skill >= 95) baseSalary = 18000 + (skill - 95) * 2000
    else if (skill >= 90) baseSalary = 10000 + (skill - 90) * 1600
    else if (skill >= 80) baseSalary = 4000 + (skill - 80) * 600
    else if (skill >= 70) baseSalary = 1500 + (skill - 70) * 250
    else if (skill >= 60) baseSalary = 700 + (skill - 60) * 80
    else baseSalary = 300 + skill * 8
    const potentialBonus = potential > 80 ? (potential - 80) * 100 : 0
    const age = player.age || 25
    const ageModifier = age < 22 ? 1.15 : age > 28 ? 0.85 : 1.0
    const salaryPerWeek = Math.round((baseSalary + potentialBonus) * ageModifier)
    // Buyout: existing contract's buyout, otherwise derived from the wage.
    const buyout = player.existingContract?.buyout || (player.isFreeAgent ? 0 : salaryPerWeek * 52 * 1.5)
    return {
        salaryPerWeek,
        startWeek: currentWeek,
        endWeek: currentWeek + 52, // 1 year contract
        buyout,
        transferFee: player.isFreeAgent ? 0 : buyout,
    }
}

// Role coverage exactly as the match engine scores it (engine/match/team-strength.ts):
// each primary role missing from the five costs 4% team strength; two riflers count once.
const COVERAGE_ROLES = [PlayerRole.IGL, PlayerRole.AWPER, PlayerRole.ENTRY_FRAGGER, PlayerRole.SUPPORT, PlayerRole.RIFLER]

export function RosterBuilderModal({ isOpen, onComplete }: RosterBuilderModalProps) {
    const {
        players,
        teams,
        contracts,
        getPlayerTeam,
        transferPlayer,
        currentWeek
    } = useGameStore(useShallow(state => ({
        players: state.players,
        teams: state.teams,
        contracts: state.contracts,
        getPlayerTeam: state.getPlayerTeam,
        transferPlayer: state.transferPlayer,
        currentWeek: state.currentWeek,
    })))

    const playerTeam = getPlayerTeam()
    const [signedPlayers, setSignedPlayers] = useState<string[]>([])
    // Actual buyout fees paid per signing. transferPlayer deducts the budget
    // live, so "spent" must be recorded at sign time — re-deriving it from the
    // signed players' contracts is wrong: after signing, their contract is the
    // NEW one whose buyout is salary×52, not what was paid.
    const [feesPaid, setFeesPaid] = useState<Record<string, number>>({})
    const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL")
    const [sortBy, setSortBy] = useState<SortKey>("rating")
    const [searchTerm, setSearchTerm] = useState("")

    // Players with their team info from contracts (and their rating, once).
    const playersWithTeamInfo = useMemo((): PlayerWithTeamInfo[] => {
        const contractByPlayer = new Map(contracts.map(c => [c.playerId, c]))
        const teamById = new Map(teams.map(t => [t.id, t]))
        return players.map(player => {
            const contract = contractByPlayer.get(player.id)
            const team = contract ? teamById.get(contract.teamId) : null
            return {
                ...player,
                currentTeamId: contract?.teamId || null,
                currentTeamName: team?.name || null,
                existingContract: contract ? { salaryPerWeek: contract.salaryPerWeek, buyout: contract.buyout || 0 } : null,
                isFreeAgent: !contract || !contract.teamId,
                ovr: 0,
            }
        })
    }, [players, contracts, teams])

    // Real free agents only (no FPL/prospect placeholders), rated once.
    const freeAgents = useMemo(() => {
        if (!playerTeam) return []
        return playersWithTeamInfo
            .filter(p => p.currentTeamId !== playerTeam.id)
            .filter(p => !p.id.startsWith("fpl_nonpro_") && !p.id.startsWith("prospect_"))
            .filter(p => p.isFreeAgent)
            .filter(p => !p.isRetired && !p.isLegendary)
            .map(p => ({ ...p, ovr: evaluatePlayer(p).overallRating }))
    }, [playersWithTeamInfo, playerTeam])

    const availablePlayers = useMemo(() => {
        let pool = freeAgents.filter(p => !signedPlayers.includes(p.id))
        if (roleFilter !== "ALL") pool = pool.filter(p => (p.role || PlayerRole.RIFLER) === roleFilter)
        const term = searchTerm.trim().toLowerCase()
        if (term) {
            pool = pool.filter(p =>
                p.nickname?.toLowerCase().includes(term) ||
                p.name?.toLowerCase().includes(term) ||
                p.nationality?.toLowerCase().includes(term)
            )
        }
        const wage = (p: PlayerWithTeamInfo) => autoContract(p, currentWeek).salaryPerWeek
        pool = [...pool].sort((a, b) => {
            switch (sortBy) {
                case "potential": return (b.potential || 0) - (a.potential || 0)
                case "age": return (a.age || 25) - (b.age || 25)
                case "salary": return wage(a) - wage(b)
                default: return b.ovr - a.ovr
            }
        })
        return pool.slice(0, 50)
    }, [freeAgents, signedPlayers, roleFilter, sortBy, searchTerm, currentWeek])

    const signedCount = signedPlayers.length
    const targetCount = 5

    const difficulty = (playerTeam?.customTeamData?.difficulty as GameDifficulty) || "normal"
    const salaryCap = WEEKLY_SALARY_CAPS[difficulty]

    const signedPlayerDetails = useMemo(() => {
        const byId = new Map(freeAgents.map(p => [p.id, p]))
        const fallback = new Map(playersWithTeamInfo.map(p => [p.id, p]))
        return signedPlayers
            .map(id => byId.get(id) ?? fallback.get(id))
            .filter((p): p is PlayerWithTeamInfo => !!p)
    }, [signedPlayers, freeAgents, playersWithTeamInfo])

    const weeklyCommitment = useMemo(
        () => signedPlayerDetails.reduce((total, p) => total + autoContract(p, currentWeek).salaryPerWeek, 0),
        [signedPlayerDetails, currentWeek],
    )

    // Total buyout fees actually paid (recorded at sign time, see feesPaid).
    const transferFeesSpent = useMemo(() => Object.values(feesPaid).reduce((sum, fee) => sum + fee, 0), [feesPaid])

    // Only the first five (the starting lineup) play.
    const coveredRoles = COVERAGE_ROLES.filter(r => signedPlayerDetails.slice(0, 5).some(p => p.role === r)).length

    // playerTeam.budget is LIVE — transferPlayer already deducted earlier fees.
    const affordability = (player: PlayerWithTeamInfo): "ok" | "wage" | "funds" => {
        const contract = autoContract(player, currentWeek)
        if (weeklyCommitment + contract.salaryPerWeek > salaryCap) return "wage"
        if (playerTeam && contract.transferFee > playerTeam.budget) return "funds"
        return "ok"
    }

    const handleSign = (player: PlayerWithTeamInfo) => {
        if (!playerTeam) return
        const contract = autoContract(player, currentWeek)
        if (weeklyCommitment + contract.salaryPerWeek > salaryCap) {
            toast.error("Over the wage limit", { description: "This wage would take the roster past its weekly limit." })
            return
        }
        if (!player.isFreeAgent && contract.transferFee > playerTeam.budget) {
            toast.error("Not enough funds", { description: `You need ${formatCurrency(contract.transferFee, "$", false)} to buy out this contract.` })
            return
        }

        const fromTeamId = player.isFreeAgent ? "FA" : (player.currentTeamId || "FA")
        const result = transferPlayer(player.id, fromTeamId, playerTeam.id, contract.transferFee, {
            salaryPerWeek: contract.salaryPerWeek,
            startWeek: contract.startWeek,
            endWeek: contract.endWeek,
            buyout: contract.salaryPerWeek * 52, // New buyout based on annual salary
        })

        if (result.success) {
            setSignedPlayers(prev => [...prev, player.id])
            if (contract.transferFee > 0) setFeesPaid(prev => ({ ...prev, [player.id]: contract.transferFee }))
            toast.success(`Signed ${player.nickname}`, {
                description: `${formatCurrency(contract.salaryPerWeek, "$", false)} / week for 1 year${contract.transferFee > 0 ? ` · ${formatCurrency(contract.transferFee, "$", false)} buyout` : ""}`,
            })
        } else {
            toast.error("Failed to sign player", { description: result.message || "Unknown error" })
        }
    }

    // Release a player back to free agency
    const handleUnsign = (playerId: string) => {
        if (!playerTeam) return
        const player = players.find(p => p.id === playerId)
        if (!player) return
        const result = transferPlayer(playerId, playerTeam.id, "FA", 0)
        if (result.success) {
            setSignedPlayers(prev => prev.filter(id => id !== playerId))
            // Releasing does not refund a paid buyout.
            const paid = feesPaid[playerId]
            setFeesPaid(prev => {
                const next = { ...prev }
                delete next[playerId]
                return next
            })
            toast.success(`Released ${player.nickname}`, paid
                ? { description: `The ${formatCurrency(paid, "$", false)} buyout is not refunded.` }
                : undefined)
        }
    }

    // Required onboarding step: focus is trapped, Escape does not dismiss.
    const dialogRef = useFocusTrap(isOpen && !!playerTeam)

    if (!isOpen || !playerTeam) return null

    const canComplete = signedCount >= targetCount
    const wageShare = Math.min(100, (weeklyCommitment / salaryCap) * 100)

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-modal flex items-center justify-center bg-ink/85 p-4"
        >
            <div
                ref={dialogRef} tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title-roster-builder"
                className="flex h-[min(920px,calc(100dvh-2rem))] w-full max-w-5xl flex-col overflow-hidden rounded-[10px] border border-line-strong bg-panel outline-none"
            >
                {/* Header */}
                <header className="flex shrink-0 items-start justify-between gap-6 border-b border-line px-6 py-4">
                    <div className="flex items-center gap-4">
                        <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-line bg-raised">
                            <TeamLogoDisplay team={playerTeam} size={44} />
                        </span>
                        <div>
                            <h2 id="modal-title-roster-builder" className="font-display text-[28px] font-bold uppercase leading-none tracking-[0.01em] text-ink-1">Build your roster</h2>
                            <p className="mt-1.5 text-sm text-ink-3">Sign five free agents to play matches. You can skip and use Transfers later.</p>
                        </div>
                    </div>
                    <dl className="flex shrink-0 divide-x divide-line text-right">
                        <div className="pr-5">
                            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Funds</dt>
                            <dd className="mt-1 font-display text-2xl font-bold leading-none tabular-nums text-ink-1">{formatCurrency(playerTeam.budget)}</dd>
                            {transferFeesSpent > 0 && <dd className="mt-1 text-xs text-ink-3">{formatCurrency(transferFeesSpent)} on buyouts</dd>}
                        </div>
                        <div className="pl-5">
                            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Wages / week</dt>
                            <dd className={cn("mt-1 font-display text-2xl font-bold leading-none tabular-nums", weeklyCommitment >= salaryCap ? "text-caution" : "text-ink-1")}>
                                {formatCurrency(weeklyCommitment, "$", false)}
                                <span className="text-base text-ink-3"> / {formatCurrency(salaryCap, "$", false)}</span>
                            </dd>
                            <dd className="mt-1.5 ml-auto h-1 w-40 overflow-hidden rounded-full bg-hover">
                                <span className={cn("block h-full rounded-full", weeklyCommitment >= salaryCap ? "bg-caution" : "bg-ink-2")} style={{ width: `${wageShare}%` }} />
                            </dd>
                        </div>
                    </dl>
                </header>

                {/* Signed slots + role coverage */}
                <section aria-label="Your roster" className="shrink-0 border-b border-line px-6 py-4">
                    <div className="mb-3 flex items-baseline justify-between gap-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Roster <span className="ml-1 tabular-nums text-ink-2">{signedCount} / {targetCount} needed</span></p>
                        <p className="text-xs text-ink-3">
                            Role coverage <span className="font-semibold tabular-nums text-ink-1">{coveredRoles}/5</span>
                            {signedCount > 0 && (coveredRoles < 5
                                ? <span className="text-caution"> · −{(5 - coveredRoles) * 4}% team strength</span>
                                : <span className="text-positive"> · no penalty</span>)}
                        </p>
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                        {Array.from({ length: Math.max(targetCount, signedCount) }).map((_, i) => {
                            const player = signedPlayerDetails[i]
                            return player ? (
                                <div key={player.id} className="flex items-center gap-2.5 rounded-md border border-line bg-raised px-2.5 py-2">
                                    <span className="h-9 w-9 shrink-0 overflow-hidden rounded bg-shell">
                                        <PlayerPortrait src={player.portraitPath} seed={player.id} alt={player.nickname} size={36} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-semibold text-ink-1">{player.nickname}</span>
                                        <RoleTag role={player.role} className="mt-0.5" />
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => handleUnsign(player.id)}
                                        aria-label={`Release ${player.nickname}`}
                                        className="shrink-0 rounded-sm p-1 text-ink-3 transition-colors hover:bg-hover hover:text-ink-1"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ) : (
                                <div key={`empty-${i}`} className="flex h-[58px] items-center justify-center gap-2 rounded-md border border-dashed border-line-strong text-xs text-ink-3">
                                    <UserPlus size={14} /> Open slot
                                </div>
                            )
                        })}
                    </div>
                </section>

                {/* Toolbar */}
                <div className="flex shrink-0 flex-wrap items-end gap-x-4 border-b border-line px-6 pt-2">
                    <div className="relative mb-2 w-56">
                        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
                        <Input
                            placeholder="Search players"
                            aria-label="Search players"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="h-9 pl-9 text-sm"
                        />
                    </div>
                    <Tabs value={roleFilter} onValueChange={(v) => setRoleFilter(v as RoleFilter)}>
                        <TabsList aria-label="Filter by role" className="border-b-0!">
                            {ROLE_FILTERS.map(r => <TabsTrigger key={r.value} value={r.value}>{r.label}</TabsTrigger>)}
                        </TabsList>
                    </Tabs>
                    <label className="mb-2 ml-auto flex items-center gap-2 text-xs text-ink-3">
                        Sort
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as SortKey)}
                            className="h-9 rounded-md border border-line bg-shell px-2 text-sm! text-ink-1 outline-none focus-visible:border-gold"
                        >
                            {SORTS.map(s => <option key={s.value} value={s.value} className="bg-panel">{s.label}</option>)}
                        </select>
                    </label>
                </div>

                {/* Free agents */}
                <div className="min-h-0 flex-1 overflow-y-auto">
                    {availablePlayers.length === 0 ? (
                        <p className="px-6 py-6 text-sm text-ink-3">No free agents match. Clear the filters, or find more players in Transfers later.</p>
                    ) : (
                        <table data-slot="table" className="w-full border-collapse text-left">
                            <thead data-slot="table-header" className="sticky top-0 z-10">
                                <tr className="border-b border-line">
                                    <th data-slot="table-head" className="pl-6">Free agent</th>
                                    <th data-slot="table-head" className="px-3">Role</th>
                                    <th data-slot="table-head" className="px-3 text-center">OVR</th>
                                    <th data-slot="table-head" className="px-3 text-center">Potential</th>
                                    <th data-slot="table-head" className="px-3 text-right">Wage / wk</th>
                                    <th data-slot="table-head" className="pr-6"><span className="sr-only">Sign</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {availablePlayers.map(player => {
                                    const contract = autoContract(player, currentWeek)
                                    const afford = affordability(player)
                                    return (
                                        <tr key={player.id} data-slot="table-row" className="h-14 border-b border-line">
                                            <td className="py-2 pl-6 pr-3">
                                                <div className="flex min-w-0 items-center gap-3">
                                                    <span className="h-9 w-9 shrink-0 overflow-hidden rounded bg-raised">
                                                        <PlayerPortrait src={player.portraitPath} seed={player.id} alt={player.nickname} size={36} />
                                                    </span>
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-semibold text-ink-1">{player.nickname}</p>
                                                        <div className="flex items-center gap-1.5 text-xs text-ink-3">
                                                            <CountryFlag country={player.nationality} size={12} />
                                                            <span className="truncate">{player.name && player.name !== player.nickname ? `${player.name} · ` : ""}{player.age || 20}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3"><RoleTag role={player.role} /></td>
                                            <td className="px-3 text-center"><RatingChip value={player.ovr} size="sm" /></td>
                                            <td className="px-3 text-center text-sm tabular-nums text-ink-2">{player.potential || 60}</td>
                                            <td className="px-3 text-right text-sm tabular-nums text-ink-1">
                                                {formatCurrency(contract.salaryPerWeek, "$", false)}
                                                {contract.transferFee > 0 && <span className="block text-xs text-ink-3">+{formatCurrency(contract.transferFee)} buyout</span>}
                                            </td>
                                            <td className="w-40 pr-6 text-right">
                                                {afford === "ok" ? (
                                                    <Button size="sm" variant="outline" onClick={() => handleSign(player)}>Sign</Button>
                                                ) : (
                                                    <span className="text-xs text-ink-3">{afford === "wage" ? "Over wage limit" : "Not enough funds"}</span>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer */}
                <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-line px-6 py-4">
                    <Button variant="ghost" onClick={onComplete}>Skip for now</Button>
                    <div className="flex items-center gap-3">
                        {!canComplete && <span className="text-xs text-ink-3">Sign {targetCount - signedCount} more to field a team</span>}
                        <Button onClick={onComplete} disabled={!canComplete}>Enter headquarters</Button>
                    </div>
                </footer>
            </div>
        </motion.div>
    )
}
