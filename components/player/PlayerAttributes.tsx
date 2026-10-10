"use client"

import { memo } from "react"
import type { PlayerSaveData } from "@/engine/save-types"
import { cn } from "@/lib/utils"
import { ratingBand, RATING_TEXT, type RatingBand } from "@/src/design/rating"

type AttrKey = keyof Pick<PlayerSaveData,
    "skill" | "rifle" | "awp" | "pistol" | "reaction" | "tactic" | "grenades" | "teamwork" | "leader" |
    "creativity" | "clutch" | "stressResistance" | "productivity" | "loyalty" | "eyesight" | "endurance" | "health">

interface AttrDef {
    key: AttrKey
    label: string
    /** What the game actually does with it, when it reaches results or development. */
    use?: { tag: string; detail: string }
}

/**
 * Attribute groups as the save model stores them. The `use` notes are the
 * honest reach of each number (engine/match/team-strength.ts avg skill,
 * map-veto.ts calculateMapStrengths, match-simulation.ts simulateRound
 * high-pressure check, types/events.ts training formulas). Everything else
 * only shapes who gets the kills.
 */
const GROUPS: { title: string; attrs: AttrDef[] }[] = [
    {
        title: "Firepower",
        attrs: [
            { key: "skill", label: "Aim", use: { tag: "Results", detail: "Aim is the player number in team strength and map strength." } },
            { key: "rifle", label: "Rifle" },
            { key: "awp", label: "AWP" },
            { key: "pistol", label: "Pistol" },
        ],
    },
    {
        title: "Tactical",
        attrs: [
            { key: "tactic", label: "Tactics", use: { tag: "Results", detail: "Team tactics feed map strength (round odds) and steer the map veto." } },
            { key: "grenades", label: "Utility" },
            { key: "teamwork", label: "Teamwork" },
            { key: "leader", label: "Leadership" },
            { key: "creativity", label: "Creativity" },
        ],
    },
    {
        title: "Mental",
        attrs: [
            { key: "clutch", label: "Clutch" },
            { key: "stressResistance", label: "Composure", use: { tag: "Pressure", detail: "In high-pressure matches a team averaging under 40 loses 3–8% round-win chance." } },
            { key: "productivity", label: "Work rate", use: { tag: "Training", detail: "Scales weekly training gains." } },
            { key: "loyalty", label: "Loyalty" },
        ],
    },
    {
        title: "Physical",
        attrs: [
            { key: "reaction", label: "Reaction" },
            { key: "eyesight", label: "Vision" },
            { key: "endurance", label: "Endurance", use: { tag: "Training", detail: "Cuts fatigue from weekly training by up to half." } },
            { key: "health", label: "Health" },
        ],
    },
]

const BAR_FILL: Record<RatingBand, string> = {
    low: "bg-rating-low/60",
    mid: "bg-rating-mid/60",
    good: "bg-rating-good/70",
    high: "bg-rating-high/70",
    elite: "bg-rating-elite",
}

/** Role-specific attributes: low values here are expected, so they read neutrally. */
function isOffRole(key: AttrKey, role: string | undefined): boolean {
    const r = (role || "").toUpperCase()
    if (key === "awp") return r !== "AWPER"
    if (key === "leader") return r !== "IGL"
    return false
}

function AttributeRow({ def, value, offRole }: { def: AttrDef; value: number; offRole: boolean }) {
    const v = Number.isFinite(value) ? Math.round(value) : 0
    const band = ratingBand(v)
    return (
        <div
            className="grid grid-cols-[minmax(0,1fr)_56px_28px] items-center gap-3 py-1.5"
            title={offRole ? `${def.label} is off-role for this player — it only matters when he takes that job.` : def.use?.detail}
        >
            <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-2">
                <span className="truncate">{def.label}</span>
                {def.use && (
                    <span className="shrink-0 rounded-sm border border-line-strong px-1 text-[11px] leading-4 text-ink-3">{def.use.tag}</span>
                )}
            </span>
            <span className="h-1 overflow-hidden rounded-full bg-hover" aria-hidden="true">
                <span
                    className={cn("block h-full rounded-full", offRole ? "bg-ink-3/40" : BAR_FILL[band])}
                    style={{ width: `${Math.max(0, Math.min(100, v))}%` }}
                />
            </span>
            <span className={cn("text-right font-display text-lg font-bold leading-none tabular-nums", offRole ? "text-ink-3" : RATING_TEXT[band])}>
                {Number.isFinite(value) ? v : "?"}
            </span>
        </div>
    )
}

/** PlayerAttributes — grouped attribute columns with a thin bar per number. */
export const PlayerAttributes = memo(function PlayerAttributes({ player, className }: { player: PlayerSaveData; className?: string }) {
    return (
        <div className={cn("grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 2xl:grid-cols-4", className)}>
            {GROUPS.map(group => (
                <section key={group.title} aria-label={group.title} className="min-w-0">
                    <h3 className="mb-1 border-b border-line pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{group.title}</h3>
                    {group.attrs.map(def => (
                        <AttributeRow key={def.key} def={def} value={Number(player[def.key])} offRole={isOffRole(def.key, player.role)} />
                    ))}
                </section>
            ))}
        </div>
    )
})

export const ATTRIBUTE_FOOTNOTE =
    "Match results read Aim and Tactics, plus form, morale, energy and fatigue. Composure counts in high-pressure matches. The other attributes decide who gets the kills, not who wins."
