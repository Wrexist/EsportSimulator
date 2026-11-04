"use client"
import { isTextRef, t, tRef, type TextRef } from "@/lib/i18n"

/**
 * G6: what the staff handles for the manager. Each switch is one area; the
 * staff acts before each week and reports in the inbox.
 */

import { useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { DELEGATION_AREAS, RENEW_MAX_AGE, RENEW_WITHIN_WEEKS } from "@/engine/delegation"
import { employedScout } from "@/engine/recruitment"
import { Switch } from "@/components/ui/switch"
import { Panel } from "@/src/components/ui/Panel"

export function DelegationPanel() {
    const { delegation, setDelegation, staff, teams, playerTeamId, currentWeek, watchlist, eventsLog } = useGameStore(useShallow(s => ({
        delegation: s.delegation, setDelegation: s.setDelegation, staff: s.staff, teams: s.teams, playerTeamId: s.playerTeamId,
        currentWeek: s.currentWeek, watchlist: s.watchlistedPlayerIds, eventsLog: s.eventsLog,
    })))
    const team = teams.find(t => t.id === playerTeamId)
    const hasScout = !!employedScout(staff, team, currentWeek)
    const lastReport = useMemo(() => [...eventsLog].reverse().find(e => e.type === "STAFF_REPORT"), [eventsLog])
    const note = (area: (typeof DELEGATION_AREAS)[number]): string | null => {
        if (area === "scouting" && !hasScout) return t("deleg.needScout")
        if (area === "scouting" && !(watchlist ?? []).length) return t("deleg.emptyList")
        return null
    }

    return (
        <Panel title={t("deleg.title")} actions={<span className="text-xs text-ink-3">{t("deleg.sub")}</span>} padded={false}>
            <ul className="divide-y divide-line">
                {DELEGATION_AREAS.map(area => {
                    const id = `delegate-${area}`
                    const extra = note(area)
                    return (
                        <li key={area} className="flex items-start gap-3 px-4 py-3">
                            <Switch id={id} className="mt-0.5" checked={!!delegation?.[area]} onCheckedChange={on => setDelegation(area, on)} />
                            <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                                <span className="block text-sm font-semibold text-ink-1">{t(`deleg.${area}`)}</span>
                                <span className="block text-xs leading-relaxed text-ink-3">{t(`deleg.${area}.hint`, { age: RENEW_MAX_AGE, weeks: RENEW_WITHIN_WEEKS })}</span>
                                {extra && <span className="mt-0.5 block text-xs text-caution">{extra}</span>}
                            </label>
                        </li>
                    )
                })}
            </ul>
            {lastReport && (
                <div className="border-t border-line px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("deleg.lastReport", { n: lastReport.week })}</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-ink-2">
                        {reportLines(lastReport.data).map((line, i) => <li key={i}>{line}</li>)}
                    </ul>
                </div>
            )}
        </Panel>
    )
}

/** The staff report's lines in the active language (older saves keep English text only). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- event data shape varies by type
function reportLines(data: any): string[] {
    if (Array.isArray(data?.linesRef) && data.linesRef.every(isTextRef)) return data.linesRef.map((r: TextRef) => tRef(r))
    return String(data?.text ?? "").split("\n").filter(Boolean)
}
