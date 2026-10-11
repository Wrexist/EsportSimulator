import React, { useMemo, memo } from "react"
import { PlayerRole } from "@/types"
import { PlayerSaveData } from "@/engine/save-types"
import { cn } from "@/lib/utils"
import { Crosshair, Shield, Brain, Zap, Swords, Check } from "lucide-react"
import { Panel } from "@/src/components/ui/Panel"
import { ROLE_MISSING_EDGE } from "@/engine/match/round-sim/team-edge"

interface SystemBonusesProps {
    players: PlayerSaveData[]
    className?: string
}

/**
 * Role coverage, exactly as the match engine scores it
 * (engine/match/round-sim/team-edge.ts ROLE_MISSING_EDGE): each role missing
 * from the starting five costs 4% team strength (non-player edge). Only each
 * starter's PRIMARY role counts. Roles also have jobs in every round
 * (round-sim/simulate.ts): the entry opens sites, the AWPer takes the AWP and
 * long angles, the support buys and throws the most utility, the IGL's
 * tactics/leadership decide reads.
 */
const ROLES = [
    { role: PlayerRole.IGL, label: "IGL", icon: Brain, note: "Reads their plan" },
    { role: PlayerRole.AWPER, label: "AWPer", icon: Crosshair, note: "Holds angles with the AWP" },
    { role: PlayerRole.ENTRY_FRAGGER, label: "Entry", icon: Swords, note: "Takes the first duel" },
    { role: PlayerRole.SUPPORT, label: "Support", icon: Shield, note: "Utility and trades" },
    { role: PlayerRole.RIFLER, label: "Rifler", icon: Zap, note: "Core firepower" },
] as const

const PER_MISSING_ROLE = Math.round(ROLE_MISSING_EDGE * 100)

const SystemBonusesInner: React.FC<SystemBonusesProps> = ({ players, className }) => {
    const counts = useMemo(() => {
        const c = new Map<string, number>()
        for (const p of players) c.set(p.role, (c.get(p.role) ?? 0) + 1)
        return c
    }, [players])

    const covered = ROLES.filter(r => (counts.get(r.role) ?? 0) > 0).length
    const penalty = (ROLES.length - covered) * PER_MISSING_ROLE

    return (
        <Panel
            className={className}
            title="Role coverage"
            actions={
                <span className="text-xs text-ink-3">
                    <span className="font-semibold tabular-nums text-ink-1">{covered}/5</span> roles · {penalty > 0
                        ? <span className="font-semibold tabular-nums text-caution">-{penalty}% team strength</span>
                        : <span className="font-semibold text-positive">no penalty</span>}
                </span>
            }
        >
            <p className="mb-3 text-xs text-ink-3">
                Each role missing from the starting five costs {PER_MISSING_ROLE}% team strength. Only primary roles count, and two riflers count once.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {ROLES.map(r => {
                    const n = counts.get(r.role) ?? 0
                    const on = n > 0
                    return (
                        <div
                            key={r.role}
                            className={cn(
                                "flex flex-col gap-1 rounded-md border px-3 py-2.5",
                                on ? "border-line-strong bg-raised" : "border-dashed border-line bg-transparent",
                            )}
                        >
                            <div className="flex items-center justify-between">
                                <r.icon size={16} className={on ? "text-ink-1" : "text-ink-3"} />
                                {on
                                    ? <span className="flex items-center gap-1 text-[11px] font-semibold text-positive"><Check size={12} />{n > 1 ? `×${n}` : "Covered"}</span>
                                    : <span className="text-[11px] font-semibold text-ink-3">Missing</span>}
                            </div>
                            <span className={cn("text-sm font-semibold", on ? "text-ink-1" : "text-ink-3")}>{r.label}</span>
                            <span className="text-[11px] text-ink-3">{r.note}</span>
                        </div>
                    )
                })}
            </div>
        </Panel>
    )
}

export const SystemBonuses = memo(SystemBonusesInner)
