"use client"

import type { LeagueDivision, LeagueRegion } from "@/engine/save-types"
import { cn } from "@/lib/utils"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { regionName } from "./league-view"

export interface DivisionSwitcherProps {
    groups: Array<{ region: LeagueRegion; divisions: LeagueDivision[] }>
    selectedId: string
    /** The managed club's division (marked with a gold dot). */
    ownId?: string
    onSelect: (divisionId: string) => void
}

/** Region tabs, then one chip per division of the selected region. */
export function DivisionSwitcher({ groups, selectedId, ownId, onSelect }: DivisionSwitcherProps) {
    const selectedRegion = groups.find(g => g.divisions.some(d => d.id === selectedId))?.region ?? groups[0]?.region
    const current = groups.find(g => g.region === selectedRegion)
    const ownRegion = groups.find(g => g.divisions.some(d => d.id === ownId))?.region

    return (
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <Tabs
                value={selectedRegion}
                onValueChange={region => {
                    const group = groups.find(g => g.region === region)
                    if (!group) return
                    const own = group.divisions.find(d => d.id === ownId)
                    onSelect((own ?? group.divisions[0]).id)
                }}
            >
                <TabsList aria-label="League region">
                    {groups.map(g => (
                        <TabsTrigger key={g.region} value={g.region}>
                            {regionName(g.region)}
                            {g.region === ownRegion && <span aria-label="your region" className="h-1.5 w-1.5 rounded-full bg-gold" />}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>
            {current && current.divisions.length > 1 && (
                <div role="group" aria-label={`${regionName(current.region)} divisions`} className="flex flex-wrap items-center gap-1">
                    {current.divisions.map(d => {
                        const active = d.id === selectedId
                        return (
                            <button
                                key={d.id}
                                type="button"
                                aria-pressed={active}
                                onClick={() => onSelect(d.id)}
                                className={cn(
                                    "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors",
                                    active ? "border-line-strong bg-hover text-ink-1" : "border-line text-ink-2 hover:bg-raised hover:text-ink-1",
                                )}
                            >
                                Division {d.level}
                                {d.id === ownId && <span aria-label="your division" className="h-1.5 w-1.5 rounded-full bg-gold" />}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
