import React, { useMemo, memo } from "react"
import { PlayerRole } from "@/types"
import { PlayerSaveData } from "@/engine/save-types"
import { cn } from "@/lib/utils"
import { Crosshair, Shield, Brain, Zap, Swords, Check } from "lucide-react"
import { Panel } from "@/src/components/ui/Panel"

interface SystemBonusesProps {
    players: PlayerSaveData[]
    className?: string
}

/**
 * Role coverage, exactly as the match engine scores it
 * (engine/match/team-strength.ts): roleCoverage = 0.8 + distinctRoles / 5 × 0.2.
 * Only each starter's PRIMARY role counts. Full coverage is neutral; each
 * role missing from the starting five costs 4% team strength.
 */
const ROLES = [
    { role: PlayerRole.IGL, label: "IGL", icon: Brain, note: "Calls the strats" },
    { role: PlayerRole.AWPER, label: "AWPer", icon: Crosshair, note: "Holds angles with the AWP" },
    { role: PlayerRole.ENTRY_FRAGGER, label: "Entry", icon: Swords, note: "Opens sites" },
    { role: PlayerRole.SUPPORT, label: "Support", icon: Shield, note: "Utility and trades" },
    { role: PlayerRole.RIFLER, label: "Rifler", icon: Zap, note: "Core firepower" },
] as const

const PER_MISSING_ROLE = 4

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
