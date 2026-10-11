import { cn } from "@/lib/utils"
import { ARCHETYPE_INFO, PLAYSTYLE_TRAITS, TRAIT_INFO, getArchetype, type PersonalityArchetype, type PlaystyleTrait } from "@/engine/personality"
import type { PlayerSaveData } from "@/engine/save-types"

/** Archetype chip: label, with the short line and every effect in the tooltip. */
export function ArchetypeChip({ archetype, className }: { archetype: PersonalityArchetype; className?: string }) {
    const info = ARCHETYPE_INFO[archetype]
    return (
        <span
            title={`${info.label}: ${info.short}\n${info.effects.map(e => `• ${e}`).join("\n")}`}
            className={cn("inline-flex items-center rounded-sm border border-gold/40 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-gold", className)}
        >
            {info.label}
        </span>
    )
}

/** Playstyle trait chip with its match effect in the tooltip. */
export function TraitChip({ trait, className }: { trait: PlaystyleTrait; className?: string }) {
    const info = TRAIT_INFO[trait]
    return (
        <span title={`${info.label}: ${info.effect}`} className={cn("inline-flex items-center rounded-sm bg-raised px-1.5 py-0.5 text-[11px] leading-none text-ink-2", className)}>
            {info.label}
        </span>
    )
}

export function playstyleTraits(player: Pick<PlayerSaveData, "traits">): PlaystyleTrait[] {
    return (player.traits ?? []).filter((t): t is PlaystyleTrait => (PLAYSTYLE_TRAITS as readonly string[]).includes(t))
}

/** Archetype + traits in one row (squad table, cards). */
export function PersonalityChips({ player, className }: { player: Pick<PlayerSaveData, "id"> & Partial<PlayerSaveData>; className?: string }) {
    const traits = playstyleTraits(player)
    return (
        <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
            <ArchetypeChip archetype={getArchetype(player)} />
            {traits.map(t => <TraitChip key={t} trait={t} />)}
        </span>
    )
}
