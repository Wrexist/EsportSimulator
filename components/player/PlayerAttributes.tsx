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
 * honest reach of each number in the script-v1 match engine
 * (engine/match/round-sim: profile.ts aim and weapon attributes, simulate.ts
 * situations, tuning.ts weights), the map veto (map-veto.ts) and training
 * (types/events.ts). Loyalty and health do not reach matches.
 */
const GROUPS: { title: string; attrs: AttrDef[] }[] = [
    {
        title: "Firepower",
        attrs: [
            { key: "skill", label: "Aim", use: { tag: "Duels", detail: "The base of every duel this player takes; better players also take more of them." } },
            { key: "rifle", label: "Rifle", use: { tag: "Duels", detail: "Adjusts aim with rifles and SMGs (up to ±3 duel rating)." } },
            { key: "awp", label: "AWP", use: { tag: "Duels", detail: "Adjusts aim with the AWP (a low AWP rating costs up to 9 duel rating)." } },
            { key: "pistol", label: "Pistol", use: { tag: "Duels", detail: "Adjusts aim on pistol rounds, ecos and Deagles (up to ±3)." } },
        ],
    },
    {
        title: "Tactical",
        attrs: [
            { key: "tactic", label: "Tactics", use: { tag: "Reads", detail: "The IGL's tactics (60%) and leadership (40%) decide how often the team reads the opponent's plan; team tactics also steer the map veto." } },
            { key: "grenades", label: "Utility", use: { tag: "Utility", detail: "How often this player's flashes blind and smokes take an angle away." } },
            { key: "teamwork", label: "Teamwork", use: { tag: "Trades", detail: "How often this player is in position to trade a teammate." } },
            { key: "leader", label: "Leadership", use: { tag: "Reads", detail: "With tactics, the IGL's read of the opponent's plan." } },
            { key: "creativity", label: "Creativity", use: { tag: "Lurks", detail: "Lurk picks on rotating CTs and aggressive CT pushes." } },
        ],
    },
    {
        title: "Mental",
        attrs: [
            { key: "clutch", label: "Clutch", use: { tag: "Clutch", detail: "Last alive: +0.08 duel rating per point above 60." } },
            { key: "stressResistance", label: "Composure", use: { tag: "Pressure", detail: "In high-pressure matches each point below 60 costs duel rating (most in a final); also helps when last alive." } },
            { key: "productivity", label: "Work rate", use: { tag: "Training", detail: "Scales weekly training gains." } },
            { key: "loyalty", label: "Loyalty" },
        ],
    },
    {
        title: "Physical",
        attrs: [
            { key: "reaction", label: "Reaction", use: { tag: "Openings", detail: "The round's first duel, peeking or holding." } },
            { key: "eyesight", label: "Vision", use: { tag: "Holds", detail: "Holding an angle, more with the AWP." } },
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
