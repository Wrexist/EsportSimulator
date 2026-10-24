"use client"

import { useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { Activity, ArrowRightLeft, Crosshair } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import type { PlayerSaveData, TeamSaveData } from "@/engine/save-types"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { getDisplayPlayerTier, getTierStyle, type TierLevel } from "@/engine/tier-system"
import { getPrestigeLabel } from "@/engine/prestige-system"
import { PLAYER_TALENT_TREE } from "@/engine/talent-trees"
import { getMasteryInfo, WEAPON_DISPLAY, WeaponMasteryManager, type WeaponType } from "@/engine/weapon-mastery-system"
import { playerEnergyPercent } from "@/lib/player-energy"
import { formatCurrency } from "@/lib/utils-extended"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { NegotiationModal } from "@/components/transfer/NegotiationModal"
import { RoleTrainingModal } from "@/components/training/RoleTrainingModal"
import { WeaponTrainingModal } from "@/components/training/WeaponTrainingModal"
import { Panel } from "@/src/components/ui/Panel"
import { RatingChip } from "@/src/components/ui/RatingChip"
import { Meter } from "@/src/components/ui/Meter"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { Kpi, KpiStrip } from "@/src/components/ui/Kpi"
import { Sparkline } from "@/src/components/ui/Sparkline"
import { TalentTree } from "../staff/TalentTree"
import { RenewContractModal } from "./RenewContractModal"
import { TransferListingModal } from "./TransferListingModal"
import { RecruitmentProfile } from "./RecruitmentProfile"
import { PlayerMatchHistory, usePlayerPerformances } from "./PlayerMatchHistory"
import { PlayerSignatureMoments } from "./PlayerSignatureMoments"
import { PlayerCareerRecord } from "./PlayerCareerRecord"
import { PlayerAttributes, ATTRIBUTE_FOOTNOTE } from "./PlayerAttributes"
import { PlayerRadar } from "./PlayerRadar"
import { DevelopmentOutlook } from "./DevelopmentOutlook"
import { PersonalityChips } from "./PersonalityChips"
import { PersonalityPanel } from "./PersonalityPanel"
import { PlayerStorylines } from "@/components/storylines/PlayerStorylines"
import { ARCHETYPE_INFO, captainId, getArchetype, renewalSalary } from "@/engine/personality"
import { releaseSettlement, RELEASE_CHEMISTRY_COST, SENIOR_ROSTER_MAX, SENIOR_ROSTER_MIN } from "@/engine/roster-rules"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface PlayerDetailProps {
    player: PlayerSaveData
}

export function PlayerDetail({ player }: PlayerDetailProps) {
    const known = useGameStore(s => s.teams.find(t => t.id === s.playerTeamId)?.rosterIds.includes(player.id)
        || s.academyPlayers.some(p => p.playerId === player.id) || player.isRetired)
    return known ? <OwnedPlayerDetail player={player} /> : <RecruitmentProfile player={player} />
}

/** Club colour as a quiet tint for the hero portrait panel. */
function clubTint(team: TeamSaveData | undefined, alpha: number): string | undefined {
    const hex = team?.branding?.primaryColor ?? team?.customTeamData?.primaryColor
    if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return undefined
    const n = parseInt(hex.slice(1), 16)
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** Contract weeks left → tone: red inside a month, amber inside a quarter. */
function contractTone(weeksLeft: number): string {
    if (weeksLeft <= 4) return "text-negative"
    if (weeksLeft <= 13) return "text-caution"
    return "text-ink-1"
}

function formatWeeks(weeks: number): string {
    return weeks >= 52 ? `${(weeks / 52).toFixed(1)} yrs` : `${weeks} wks`
}

function Fact({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
    return (
        <div className="bg-panel px-3 py-2.5">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{label}</dt>
            <dd className={cn("mt-1 font-display text-2xl font-bold leading-none tabular-nums text-ink-1", className)}>{children}</dd>
        </div>
    )
}

function Row({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
    return (
        <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            <dt className="text-sm text-ink-3">{label}</dt>
            <dd className={cn("text-right text-sm font-semibold tabular-nums text-ink-1", className)}>{children}</dd>
        </div>
    )
}

function OwnedPlayerDetail({ player }: PlayerDetailProps) {
    const {
        contracts, listPlayerForTransfer, unlistPlayerForTransfer, startRoleTraining, cancelRoleTraining,
        teams, playerTeamId, currentWeek, unlockPlayerTalent, academyPlayers, allPlayers, activeMatchId,
    } = useGameStore(useShallow(state => ({
        allPlayers: state.players,
        contracts: state.contracts,
        listPlayerForTransfer: state.listPlayerForTransfer,
        unlistPlayerForTransfer: state.unlistPlayerForTransfer,
        startRoleTraining: state.startRoleTraining,
        cancelRoleTraining: state.cancelRoleTraining,
        teams: state.teams,
        playerTeamId: state.playerTeamId,
        currentWeek: state.currentWeek,
        unlockPlayerTalent: state.unlockPlayerTalent,
        academyPlayers: state.academyPlayers,
        activeMatchId: state.activeMatchId,
    })))
    const [tab, setTab] = useState("overview")
    const [trainingModalOpen, setTrainingModalOpen] = useState(false)
    const [transferModalOpen, setTransferModalOpen] = useState(false)
    const [weaponModalOpen, setWeaponModalOpen] = useState(false)
    const [negotiationOpen, setNegotiationOpen] = useState(false)

    const ownTeam = teams.find(t => t.id === playerTeamId)
    const viewedTeam = teams.find(t => t.rosterIds?.includes(player.id))
    const isOwnPlayer = !!ownTeam?.rosterIds?.includes(player.id)
    const isAcademy = academyPlayers.some(p => p.playerId === player.id)
    const canOffer = !viewedTeam && !isOwnPlayer && !isAcademy && !player.isRetired
    const activeRoleTraining = ownTeam?.activeRoleTraining?.find(t => t.playerId === player.id)

    const evaluation = evaluatePlayer(player, undefined, undefined, currentWeek)
    const ovr = evaluation.overallRating
    const potential = player.potential || evaluation.futureValue
    const tier = getTierStyle(getDisplayPlayerTier(ovr, viewedTeam?.tier as TierLevel))
    const prestige = getPrestigeLabel(player.prestigeScore || 0)
    const energy = playerEnergyPercent(player)

    const contract = contracts.find(c => c.playerId === player.id)
    const weeksLeft = contract ? Math.max(0, contract.endWeek - currentWeek) : 0
    const canRenew = isOwnPlayer && !!contract && weeksLeft < 52
    const renewedWage = contract ? renewalSalary(player, contract.salaryPerWeek) : 0
    const renewalRaise = contract && contract.salaryPerWeek > 0 ? Math.round((renewedWage / contract.salaryPerWeek - 1) * 100) : 10
    const isCaptain = !!viewedTeam && captainId(viewedTeam, id => allPlayers.find(p => p.id === id)) === player.id

    // Release: the rest of his contract is paid now (engine/roster-rules.ts, the store's rule).
    const squadSize = ownTeam?.rosterIds.length ?? 0
    const release = releaseSettlement(isOwnPlayer ? contracts.find(c => c.playerId === player.id && c.teamId === ownTeam?.id && c.endWeek > currentWeek) : undefined, currentWeek)
    const funds = ownTeam?.budget ?? 0
    const releaseBlock = !isOwnPlayer ? null
        : activeMatchId ? "Finish the match in progress first"
            : squadSize <= SENIOR_ROSTER_MIN ? `You need at least ${SENIOR_ROSTER_MIN} senior players; sign a replacement first`
                : funds < release.amount ? `Costs ${formatCurrency(release.amount, "$", false)}; the club has ${formatCurrency(Math.max(0, funds), "$", false)}`
                    : null
    const releaseText = `${release.weeksLeft} weeks left at ${formatCurrency(release.wage, "$", false)}/wk: the club pays the rest of his contract now, ${formatCurrency(release.amount, "$", false)} (funds after: ${formatCurrency(funds - release.amount, "$", false)}). `
        + `He becomes a free agent any club can sign, team chemistry drops by ${RELEASE_CHEMISTRY_COST} as with any roster change, and your squad goes to ${squadSize - 1}/${SENIOR_ROSTER_MAX}.`

    const performances = usePlayerPerformances(player.id)
    const recentRatings = useMemo(() => performances.slice(0, 10).map(p => p.rating).reverse(), [performances])
    const recentAvg = recentRatings.length ? recentRatings.reduce((s, r) => s + r, 0) / recentRatings.length : null

    const mastery = WeaponMasteryManager.getPlayerMastery(player)
    const realName = player.name && player.name !== player.nickname ? player.name : null
    const tint = clubTint(viewedTeam, 0.18)
    const tintLine = clubTint(viewedTeam, 0.7)

    return (
        <div className="min-w-0 space-y-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
                {/* ── Hero ─────────────────────────────────────────────── */}
                <section aria-label={`${player.nickname} profile`} className="min-w-0 self-start overflow-hidden rounded-[10px] border border-line bg-panel">
                    <div
                        className="relative flex h-[264px] items-end justify-center border-b border-line bg-raised"
                        style={tint ? { backgroundColor: tint, boxShadow: `inset 0 2px 0 ${tintLine}` } : undefined}
                    >
                        <div className="absolute left-4 top-4 flex min-w-0 items-center gap-2">
                            {viewedTeam && <TeamLogoDisplay team={viewedTeam} size={24} />}
                            <span className="truncate text-sm font-semibold text-ink-1">{viewedTeam?.name ?? (isAcademy ? "Academy" : player.isRetired ? "Retired" : "Free agent")}</span>
                        </div>
                        <div className="absolute right-4 top-4 flex flex-col items-end gap-1.5">
                            {player.injury && (
                                <span className="inline-flex items-center gap-1 rounded-sm bg-negative/15 px-1.5 py-0.5 text-[11px] font-semibold text-negative">
                                    <Activity size={11} /> Injured · {player.injury.weeksRemaining}w
                                </span>
                            )}
                            {player.forSale && <span className="rounded-sm border border-line-strong bg-panel px-1.5 py-0.5 text-[11px] font-semibold text-ink-1">Transfer listed</span>}
                            {activeRoleTraining && (
                                <span className="rounded-sm border border-line-strong bg-panel px-1.5 py-0.5 text-[11px] font-semibold text-ink-1">
                                    Retraining · {activeRoleTraining.weeksCompleted}/{activeRoleTraining.totalWeeks} wks
                                </span>
                            )}
                        </div>
                        <div className="h-[200px] w-[200px] overflow-hidden rounded-t-lg">
                            <PlayerPortrait key={player.id} src={player.portraitPath} seed={player.id} alt={player.nickname} size={200} variant="hero" teamColor={tintLine} className="rounded-none border-0" />
                        </div>
                    </div>

                    <div className="space-y-5 p-5">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <h1 className="truncate font-display text-5xl font-bold uppercase leading-none text-ink-1">{player.nickname}</h1>
                                <div className="mt-2 flex min-w-0 items-center gap-2 text-sm text-ink-2">
                                    <CountryFlag country={player.nationality} size={16} />
                                    <span className="truncate">{realName ?? String(player.nationality || "").toUpperCase()}</span>
                                    <span className="text-ink-3">·</span>
                                    <span className="shrink-0 tabular-nums">{player.age} yrs</span>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                    <RoleTag role={player.role} />
                                    {player.secondaryRole && <RoleTag role={player.secondaryRole} className="border-line text-ink-3" />}
                                    <span className="text-xs text-ink-3">{tier.label}{prestige !== "Unknown" ? ` · ${prestige}` : ""}</span>
                                </div>
                            </div>
                            <div className="shrink-0 text-right">
                                <RatingChip value={ovr} size="xl" bare className="min-w-0 px-0" />
                                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Overall</p>
                            </div>
                        </div>

                        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line">
                            <Fact label="Potential"><RatingChip value={potential} size="md" bare className="min-w-0 px-0 text-2xl" /></Fact>
                            <Fact label="Market value">{formatCurrency(evaluation.transferValue)}</Fact>
                            <Fact label="Wage / wk">{contract ? formatCurrency(contract.salaryPerWeek, "$", false) : "—"}</Fact>
                            <Fact label="Contract" className={contract ? contractTone(weeksLeft) : "text-ink-3"}>{contract ? formatWeeks(weeksLeft) : "None"}</Fact>
                        </dl>

                        <div className="space-y-2">
                            {[
                                { label: "Form", value: player.form },
                                { label: "Morale", value: player.morale },
                                { label: "Energy", value: energy },
                            ].map(m => (
                                <div key={m.label} className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3">
                                    <span className="text-xs text-ink-3">{m.label}</span>
                                    <Meter value={m.value} label={m.label} trackClassName="w-full flex-1" />
                                </div>
                            ))}
                            <p className="pt-1 text-xs text-ink-3">Form, morale and energy all feed match strength.</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                            <PersonalityChips player={player} />
                            {isCaptain && <span title="Captain: when he plays, defeats cost the lineup less morale." className="rounded-sm border border-line-strong px-1.5 py-0.5 text-[11px] font-semibold leading-none text-ink-1">Captain</span>}
                        </div>

                        {(isOwnPlayer || canOffer || isAcademy) && (
                            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                                {isOwnPlayer && contract && (
                                    <RenewContractModal
                                        player={player}
                                        currentSalary={contract.salaryPerWeek}
                                        currentEndWeek={contract.endWeek}
                                        currentWeek={currentWeek}
                                        onConfirm={() => useGameStore.getState().renewContract(player.id)}
                                        trigger={
                                            <Button
                                                variant={canRenew ? "default" : "outline"}
                                                disabled={!canRenew}
                                                title={canRenew ? undefined : "Renewal opens in the final year of the contract"}
                                                className="flex-1"
                                            >
                                                Renew contract
                                            </Button>
                                        }
                                    />
                                )}
                                {isOwnPlayer && (
                                    activeRoleTraining ? (
                                        <Button variant="outline" className="flex-1" onClick={() => { cancelRoleTraining(player.id); toast.success("Role training cancelled") }}>
                                            Stop retraining
                                        </Button>
                                    ) : (
                                        <Button variant="outline" className="flex-1" onClick={() => setTrainingModalOpen(true)} disabled={!!player.injury || !!player.secondaryRole}
                                            title={player.secondaryRole ? "Already plays two roles" : undefined}>
                                            Retrain role
                                        </Button>
                                    )
                                )}
                                {isOwnPlayer && (
                                    <Button variant="outline" className="flex-1" onClick={() => setTransferModalOpen(true)}>
                                        {player.forSale ? "Unlist" : "Transfer list"}
                                    </Button>
                                )}
                                {isOwnPlayer && (releaseBlock ? (
                                    <Button variant="ghost" className="flex-1" disabled title={releaseBlock}>Release</Button>
                                ) : (
                                    <ConfirmDialog
                                        title={`Release ${player.nickname}?`}
                                        description={releaseText}
                                        onConfirm={() => {
                                            const r = useGameStore.getState().releasePlayer(player.id)
                                            if (r.success) toast.success(r.message)
                                            else toast.error(r.message)
                                        }}
                                        destructive
                                        confirmText={`Release · ${formatCurrency(release.amount, "$", false)}`}
                                        icon="danger"
                                    >
                                        <Button variant="ghost" className="flex-1">Release</Button>
                                    </ConfirmDialog>
                                ))}
                                {canOffer && <Button className="flex-1" onClick={() => setNegotiationOpen(true)}>Offer contract</Button>}
                                {isAcademy && <Button variant="outline" asChild className="flex-1"><Link href="/academy">Open academy</Link></Button>}
                            </div>
                        )}
                    </div>
                </section>

                {/* ── Detail tabs ──────────────────────────────────────── */}
                <div className="min-w-0">
                    <Tabs value={tab} onValueChange={setTab}>
                        <TabsList>
                            <TabsTrigger value="overview">Overview</TabsTrigger>
                            <TabsTrigger value="stats">Stats</TabsTrigger>
                            <TabsTrigger value="contract">Contract</TabsTrigger>
                            <TabsTrigger value="development">Development</TabsTrigger>
                            <TabsTrigger value="history">History</TabsTrigger>
                        </TabsList>

                        <TabsContent value="overview" className="mt-3 space-y-4">
                            <PersonalityPanel player={player} />
                            <PlayerStorylines playerId={player.id} />
                            <Panel title="Attributes" actions={<span className="text-xs text-ink-3">Hover a row for what it does</span>}>
                                <PlayerAttributes player={player} />
                                <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-3">{ATTRIBUTE_FOOTNOTE}</p>
                            </Panel>

                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                <Panel title="Player DNA" actions={<span className="text-xs text-ink-3">Averages of the attributes above</span>}>
                                    <div className="flex justify-center py-1"><PlayerRadar player={player} /></div>
                                </Panel>
                                <Panel
                                    title="Recent form"
                                    actions={recentAvg != null ? <span className="text-xs text-ink-3">Avg <span className="font-semibold tabular-nums text-ink-1">{recentAvg.toFixed(2)}</span> · last {recentRatings.length}</span> : null}
                                    padded={false}
                                >
                                    {recentRatings.length > 0 ? (
                                        <div className="space-y-3 p-4">
                                            <Sparkline values={recentRatings} baseline={1} width={420} height={64} label={`Last ${recentRatings.length} match ratings`} className="h-16 w-full" />
                                            <ul className="divide-y divide-line rounded-lg border border-line">
                                                {performances.slice(0, 4).map(r => (
                                                    <li key={r.matchId}>
                                                        <Link href={`/match/${r.matchId}/result`} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-hover">
                                                            <span className="w-9 tabular-nums text-ink-3">W{r.week}</span>
                                                            <span className="min-w-0 flex-1 truncate text-ink-2">vs {r.opponentName}</span>
                                                            <span className="tabular-nums text-ink-3">{r.kills}–{r.deaths}</span>
                                                            <span className="w-10 text-right font-semibold tabular-nums text-ink-1">{r.rating.toFixed(2)}</span>
                                                        </Link>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ) : (
                                        <p className="px-4 py-5 text-sm text-ink-3">No recorded matches yet. Ratings appear after his first official match or scrim.</p>
                                    )}
                                </Panel>
                            </div>
                        </TabsContent>

                        <TabsContent value="stats" className="mt-3 space-y-4">
                            <PlayerCareerRecord player={player} />
                            <Panel title="Match history" padded={false}>
                                <PlayerMatchHistory playerId={player.id} limit={15} />
                            </Panel>
                        </TabsContent>

                        <TabsContent value="contract" className="mt-3 space-y-4">
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                <Panel title="Current contract" padded={false}>
                                    {contract ? (
                                        <dl className="divide-y divide-line">
                                            <Row label="Club">{viewedTeam?.name ?? "—"}</Row>
                                            <Row label="Wage">{formatCurrency(contract.salaryPerWeek, "$", false)} / wk</Row>
                                            <Row label="Signed">Week {contract.startWeek}</Row>
                                            <Row label="Expires">Week {contract.endWeek}</Row>
                                            <Row label="Time left" className={contractTone(weeksLeft)}>{formatWeeks(weeksLeft)}</Row>
                                            {contract.buyout > 0 && <Row label="Buyout">{formatCurrency(contract.buyout)}</Row>}
                                            {!!contract.matchWinBonus && <Row label="Match-win bonus">{formatCurrency(contract.matchWinBonus, "$", false)}</Row>}
                                            {!!contract.tournamentWinBonus && <Row label="Title bonus">{formatCurrency(contract.tournamentWinBonus, "$", false)}</Row>}
                                        </dl>
                                    ) : (
                                        <p className="px-4 py-5 text-sm text-ink-3">No senior contract on file.</p>
                                    )}
                                </Panel>
                                <Panel title="Renewal and sale" padded={false}>
                                    <dl className="divide-y divide-line">
                                        <Row label="Renewal terms">{contract ? `+52 wks at ${formatCurrency(renewedWage, "$", false)} / wk` : "—"}</Row>
                                        <Row label="Renewal window" className={canRenew ? "text-ink-1" : "text-ink-3"}>{canRenew ? "Open" : "Final year only"}</Row>
                                        <Row label="Market value">{formatCurrency(evaluation.transferValue)}</Row>
                                        <Row label="Transfer list">{player.forSale ? `Listed at ${formatCurrency(player.transferListingPrice ?? evaluation.transferValue)}` : "Not listed"}</Row>
                                        {isOwnPlayer && <Row label="Release cost">{formatCurrency(release.amount, "$", false)} · rest of contract</Row>}
                                    </dl>
                                    <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-ink-3">
                                        Renewal adds a year at +{renewalRaise}% wage ({ARCHETYPE_INFO[getArchetype(player)].label}; the usual raise is 10%) and needs 26 weeks of the raise in the bank. Clubs bid on listed players each week; offers sit near market value.
                                    </p>
                                </Panel>
                            </div>
                        </TabsContent>

                        <TabsContent value="development" className="mt-3 space-y-4">
                            <KpiStrip className="w-fit max-w-full flex-wrap">
                                <Kpi label="Level" value={player.level || 1} hint={`${Math.floor(player.xp || 0)} / ${player.xpToNextLevel || 1000} XP`} />
                                <Kpi label="Talent points" value={player.talentPoints || 0} hint="One per level" />
                                <Kpi label="Potential" value={potential} hint="Training stops here" />
                            </KpiStrip>

                            {isOwnPlayer && <DevelopmentOutlook player={player} />}

                            {activeRoleTraining && (
                                <Panel title="Role retraining">
                                    <div className="flex flex-wrap items-center justify-between gap-4">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm text-ink-2">
                                                Becoming <span className="font-semibold text-ink-1">{activeRoleTraining.targetRole.toUpperCase()}</span> · week {activeRoleTraining.weeksCompleted} of {activeRoleTraining.totalWeeks}
                                            </p>
                                            <Meter value={(activeRoleTraining.weeksCompleted / activeRoleTraining.totalWeeks) * 100} label="Retraining progress" tone="neutral" showValue={false} className="mt-2" trackClassName="w-full max-w-md" />
                                            <p className="mt-2 text-xs text-ink-3">$5,000 and −10 energy per week. Skips team drills and weekly training until done.</p>
                                        </div>
                                        <Button variant="outline" onClick={() => { cancelRoleTraining(player.id); toast.success("Role training cancelled") }}>Stop retraining</Button>
                                    </div>
                                </Panel>
                            )}

                            <Panel
                                title="Weapon mastery"
                                actions={isOwnPlayer ? <Button size="sm" variant="outline" className="h-8 gap-1.5 px-3 text-xs" onClick={() => setWeaponModalOpen(true)}><Crosshair size={13} /> Weapon drills</Button> : null}
                                padded={false}
                            >
                                <ul className="divide-y divide-line">
                                    {(Object.keys(mastery) as WeaponType[]).map(weapon => {
                                        const info = getMasteryInfo(mastery[weapon])
                                        return (
                                            <li key={weapon} className="grid grid-cols-[120px_minmax(0,1fr)_120px] items-center gap-4 px-4 py-2.5">
                                                <span className="text-sm font-semibold text-ink-1">{WEAPON_DISPLAY[weapon]?.name ?? weapon}</span>
                                                <Meter value={info.progress} label={`${weapon} mastery progress`} tone="neutral" showValue={false} trackClassName="w-full" />
                                                <span className={cn("text-right text-sm", info.isMaster ? "font-semibold text-gold" : "text-ink-2")}>
                                                    {info.name} <span className="text-xs tabular-nums text-ink-3">{mastery[weapon]} XP</span>
                                                </span>
                                            </li>
                                        )
                                    })}
                                </ul>
                                <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3">Mastery adds a small accuracy and damage edge with that weapon class in rounds.</p>
                            </Panel>

                            <Panel title="Talents" actions={<span className="text-xs text-ink-3"><span className="font-semibold tabular-nums text-ink-1">{player.talentPoints || 0}</span> points to spend</span>} padded={false}>
                                <TalentTree
                                    nodes={PLAYER_TALENT_TREE}
                                    unlockedIds={player.unlockedTalentIds || []}
                                    availablePoints={player.talentPoints || 0}
                                    onUnlock={talentId => unlockPlayerTalent(player.id, talentId)}
                                    readonly={!isOwnPlayer}
                                />
                            </Panel>
                        </TabsContent>

                        <TabsContent value="history" className="mt-3 space-y-4">
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                <Panel title="Career" padded={false}>
                                    {player.careerHistory && player.careerHistory.length > 0 ? (
                                        <ul className="divide-y divide-line">
                                            {[...player.careerHistory].reverse().map((c, i) => (
                                                <li key={`${c.teamId}-${c.joinedWeek}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                                                    <span className="flex min-w-0 items-center gap-2 font-semibold text-ink-1">
                                                        <ArrowRightLeft size={13} className="shrink-0 text-ink-3" />
                                                        <span className="truncate">{c.teamName}</span>
                                                    </span>
                                                    <span className="shrink-0 tabular-nums text-ink-3">W{c.joinedWeek}{c.leftWeek != null ? ` – W${c.leftWeek}` : " – now"}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="px-4 py-5 text-sm text-ink-3">{viewedTeam ? `With ${viewedTeam.name} since the save began.` : "No club history recorded."}</p>
                                    )}
                                </Panel>
                                <Panel title="Milestones" padded={false}>
                                    <PlayerSignatureMoments player={player} />
                                </Panel>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            {trainingModalOpen && (
                <RoleTrainingModal
                    player={player}
                    isOpen={trainingModalOpen}
                    onClose={() => setTrainingModalOpen(false)}
                    onStartTraining={role => {
                        const result = startRoleTraining(player.id, role)
                        if (result.success) {
                            setTrainingModalOpen(false)
                            toast.success(`Started ${role} training for ${player.nickname}`)
                        } else {
                            toast.error(result.message)
                        }
                    }}
                    currentBudget={ownTeam?.budget || 0}
                    trainingSlotsUsed={ownTeam?.trainingSlotsUsed || 0}
                    maxTrainingSlots={ownTeam?.maxTrainingSlots || 10}
                />
            )}

            <TransferListingModal
                isOpen={transferModalOpen}
                onClose={() => setTransferModalOpen(false)}
                player={player}
                overall={ovr}
                estimatedValue={evaluation.transferValue}
                isListed={!!player.forSale}
                onConfirm={price => {
                    if (player.forSale) unlistPlayerForTransfer(player.id)
                    else listPlayerForTransfer(player.id, price)
                }}
            />

            <WeaponTrainingModal isOpen={weaponModalOpen} onClose={() => setWeaponModalOpen(false)} player={player} />

            <NegotiationModal playerId={player.id} isOpen={negotiationOpen} onClose={() => setNegotiationOpen(false)} />
        </div>
    )
}
