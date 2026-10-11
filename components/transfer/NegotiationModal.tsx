"use client"

import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { useFocusTrap } from "@/lib/accessibility"
import { getVisibleStats } from "@/engine/scouting-system"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/utils-extended"
import { useNegotiation } from "./useNegotiation"
import { DealTerms } from "./DealTerms"
import { ScoutedRating, REPORT_LABEL } from "./ScoutedRating"

interface NegotiationModalProps {
    playerId: string
    isOpen: boolean
    onClose: () => void
    className?: string
}

/** Modal form of the transfer deal (player profile, desktop market). Transfers and Scouting dock the same terms inline. */
export function NegotiationModal({ playerId, isOpen, onClose, className }: NegotiationModalProps) {
    const n = useNegotiation(playerId, isOpen)
    const { scoutedPlayers, currentWeek } = useGameStore(useShallow(state => ({
        scoutedPlayers: state.scoutedPlayers,
        currentWeek: state.currentWeek,
    })))
    const dialogRef = useFocusTrap(isOpen && n.ready, onClose)
    if (!isOpen || !n.ready || !n.playerSave || !n.evaluation || typeof document === "undefined") return null

    const player = n.playerSave
    const knowledge = getVisibleStats(player, scoutedPlayers, n.myTeam?.rosterIds || [], currentWeek)
    const title = n.stage === "BUYOUT" ? `Fee talks with ${n.currentTeam?.name ?? "the club"}` : n.currentTeam ? "Contract offer" : "Sign free agent"

    return createPortal(
        <div className={cn(className, "fixed inset-0 z-modal flex items-center justify-center bg-ink/80 p-4")}>
            <div
                ref={dialogRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title-negotiation"
                className="flex max-h-[calc(100dvh-3rem)] w-full max-w-3xl overflow-hidden rounded-[10px] border border-line-strong bg-panel"
            >
                <aside className="hidden w-64 shrink-0 flex-col gap-4 border-r border-line bg-shell p-5 sm:flex">
                    <div className="h-20 w-20 overflow-hidden rounded bg-raised">
                        <PlayerPortrait key={player.id} src={player.portraitPath} seed={player.id} alt={player.nickname} size={80} />
                    </div>
                    <div className="min-w-0">
                        <p className="truncate font-display text-2xl font-bold uppercase leading-none text-ink-1">{player.nickname}</p>
                        {player.name && player.name !== player.nickname && <p className="mt-1 truncate text-xs text-ink-3">{player.name}</p>}
                        <div className="mt-2 flex items-center gap-2"><RoleTag role={player.role} /><span className="text-xs tabular-nums text-ink-3">Age {player.age}</span></div>
                    </div>
                    <dl className="space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-2"><dt className="text-ink-3">Rating</dt><dd><ScoutedRating knowledge={knowledge} size="sm" /></dd></div>
                        <div className="flex items-center justify-between gap-2"><dt className="text-ink-3">Report</dt><dd className="text-ink-2">{REPORT_LABEL[knowledge.scoutingLevel]}</dd></div>
                        <div className="flex items-center justify-between gap-2"><dt className="text-ink-3">Country</dt><dd><CountryFlag country={player.nationality} showName size={14} /></dd></div>
                        <div className="flex items-center justify-between gap-2"><dt className="text-ink-3">Club</dt><dd className="max-w-[120px] truncate text-ink-2">{n.currentTeam?.name ?? "Free agent"}</dd></div>
                        <div className="flex items-center justify-between gap-2"><dt className="text-ink-3">Value</dt><dd className="tabular-nums text-ink-1">{formatCurrency(n.evaluation.transferValue, "$", false)}</dd></div>
                    </dl>
                </aside>
                <div className="flex min-w-0 flex-1 flex-col">
                    <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
                        <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gold">Negotiation</p>
                            <h2 id="modal-title-negotiation" className="truncate font-display text-2xl font-bold uppercase text-ink-1">{title}</h2>
                        </div>
                        <button onClick={onClose} className="rounded p-2 text-ink-3 transition-colors hover:bg-hover hover:text-ink-1" aria-label="Close dialog">
                            <X size={18} />
                        </button>
                    </header>
                    <div className="min-h-0 flex-1 overflow-y-auto p-5">
                        <DealTerms n={n} onDone={onClose} />
                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
}
