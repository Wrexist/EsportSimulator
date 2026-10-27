"use client"
/** Trophy room collection (C11): the items the club's titles unlocked. */
import { useMemo } from "react"
import { Award, Gem, Image as ImageIcon, Keyboard, Medal, MousePointer2, PartyPopper, Shirt, Trophy } from "lucide-react"
import { Panel } from "@/src/components/ui/Panel"
import { cn } from "@/lib/utils"
import { FULL_TOURNAMENT_CALENDAR } from "@/data/tournament-calendar"
import { RARITY_LABEL, RARITY_ORDER, collectibleCatalogSize, collectionFromTrophies, type ItemKind, type Rarity } from "@/lib/collectibles"

const ICON: Record<ItemKind, typeof Shirt> = {
    jersey: Shirt, poster: ImageIcon, medal: Medal, mousepad: MousePointer2, ring: Gem,
    replica: Trophy, confetti: PartyPopper, signed_jersey: Award, keyboard: Keyboard,
}
const TONE: Record<Rarity, string> = {
    COMMON: "border-line text-ink-2",
    UNCOMMON: "border-positive/40 text-positive",
    RARE: "border-sky-400/50 text-sky-300",
    EPIC: "border-violet-400/50 text-violet-300",
    LEGENDARY: "border-gold/60 text-gold",
}

export function CollectionPanel({ trophies }: { trophies: Parameters<typeof collectionFromTrophies>[0] }) {
    const items = useMemo(() => collectionFromTrophies(trophies), [trophies])
    const calendarIds = useMemo(() => new Set(FULL_TOURNAMENT_CALENDAR.map(c => c.id)), [])
    const total = collectibleCatalogSize()
    const fromCalendar = items.filter(i => calendarIds.has(i.eventId)).length
    const counts = RARITY_ORDER.map(r => [r, items.filter(i => i.rarity === r).length] as const).filter(([, n]) => n > 0)
    return (
        <Panel title="Collection" actions={<span className="text-xs tabular-nums text-ink-3" data-testid="collection-progress">{fromCalendar} of {total} event items</span>}>
            {items.length === 0 ? (
                <p className="text-sm text-ink-3">Titles unlock club items: an event jersey for any title, signed items and medals at bigger events, and at S-tier a champions&apos; ring, the MVP&apos;s signed jersey and a rare match-worn keyboard from the final.</p>
            ) : (
                <>
                    <p className="mb-3 text-xs text-ink-3">{counts.map(([r, n]) => `${n} ${RARITY_LABEL[r].toLowerCase()}`).join(" · ")}</p>
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6" data-testid="collection-items">
                        {items.map(i => {
                            const Icon = ICON[i.kind]
                            return (
                                <li key={i.id} className={cn("flex min-w-0 items-center gap-2.5 rounded border bg-shell px-2.5 py-2", TONE[i.rarity])} title={`${i.label} · ${i.eventName} · ${RARITY_LABEL[i.rarity]}`}>
                                    <Icon size={18} className="shrink-0" />
                                    <span className="min-w-0">
                                        <span className="block truncate text-xs font-semibold text-ink-1">{i.label}</span>
                                        <span className="block truncate text-[11px] text-ink-3">{i.eventName}</span>
                                    </span>
                                </li>
                            )
                        })}
                    </ul>
                </>
            )}
        </Panel>
    )
}
