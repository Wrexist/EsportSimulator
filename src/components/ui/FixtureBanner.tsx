import Image from "next/image"
import type { ComponentProps, ReactNode } from "react"
import { cn } from "@/lib/utils"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { RatingChip } from "@/src/components/ui/RatingChip"

export type FormResult = "W" | "L" | "D"

const FORM_CLASS: Record<FormResult, string> = {
    W: "bg-positive/15 text-positive",
    L: "bg-negative/15 text-negative",
    D: "bg-raised text-ink-2",
}

/** FormGuide — last results as W/L/D squares, oldest first. */
export function FormGuide({ results, className, emptyLabel = "No matches yet" }: { results: FormResult[]; className?: string; emptyLabel?: string }) {
    if (results.length === 0) return <span className={cn("text-xs text-ink-3", className)}>{emptyLabel}</span>
    return (
        <span className={cn("inline-flex items-center gap-1", className)} aria-label={`Form: ${results.join(" ")}`}>
            {results.map((r, i) => (
                <span key={i} aria-hidden="true" className={cn("flex h-5 w-5 items-center justify-center rounded-sm text-[11px] font-bold", FORM_CLASS[r])}>{r}</span>
            ))}
        </span>
    )
}

export interface FixtureSide {
    team: ComponentProps<typeof TeamLogoDisplay>["team"]
    name: string
    /** Quiet line under the name, e.g. "World #12". */
    meta?: ReactNode
    form?: FormResult[]
    /** Team rating; omitted when unknown. */
    ovr?: number | null
}

export interface FixtureBannerProps {
    home: FixtureSide
    away: FixtureSide
    /** Top-left: competition, tier, stage. */
    competition?: ReactNode
    /** Top-right: countdown / date. */
    when?: ReactNode
    /** Between the crests (defaults to "VS"). */
    center?: ReactNode
    /** The one action, centred under the matchup. */
    action?: ReactNode
    /** Quiet line beside/under the action. */
    footnote?: ReactNode
    /** Optional key art drawn faintly behind the panel. */
    art?: string
    className?: string
}

function Side({ side, align }: { side: FixtureSide; align: "left" | "right" }) {
    const right = align === "right"
    return (
        <div className={cn("flex min-w-0 items-center gap-5", right && "flex-row-reverse text-right")}>
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-line bg-raised">
                <TeamLogoDisplay team={side.team} size={72} />
            </div>
            <div className="min-w-0">
                <p className="truncate font-display text-[34px] font-bold uppercase leading-none tracking-[0.01em] text-ink-1">{side.name}</p>
                {side.meta != null && <p className="mt-1.5 text-sm text-ink-3">{side.meta}</p>}
                <div className={cn("mt-3 flex items-center gap-4", right && "flex-row-reverse")}>
                    {side.ovr != null && side.ovr > 0 && (
                        <span className={cn("flex items-center gap-2", right && "flex-row-reverse")}>
                            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">OVR</span>
                            <RatingChip value={side.ovr} size="md" />
                        </span>
                    )}
                    {side.form && <FormGuide results={side.form} />}
                </div>
            </div>
        </div>
    )
}

/**
 * FixtureBanner — the next-match hero: both crests, names, rank, form and
 * rating, the competition and the countdown, with a single action.
 */
export function FixtureBanner({ home, away, competition, when, center, action, footnote, art, className }: FixtureBannerProps) {
    return (
        <section className={cn("relative overflow-hidden rounded-[10px] border border-line-strong bg-panel", className)}>
            {art && (
                <>
                    <Image src={art} alt="" fill sizes="100vw" className="pointer-events-none select-none object-cover object-center opacity-25 saturate-50" />
                    <div aria-hidden="true" className="absolute inset-0 bg-linear-to-b from-panel/40 via-panel/80 to-panel" />
                </>
            )}
            <div className="relative">
                {(competition != null || when != null) && (
                    <header className="flex min-h-12 items-center justify-between gap-4 border-b border-line px-6 py-2.5">
                        <div className="min-w-0 text-sm text-ink-2">{competition}</div>
                        <div className="shrink-0 text-right text-sm text-ink-2">{when}</div>
                    </header>
                )}
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-8 px-8 py-7">
                    <Side side={home} align="left" />
                    <div className="flex flex-col items-center gap-1 text-center">
                        {center ?? <span className="font-display text-4xl font-bold uppercase text-ink-3">VS</span>}
                    </div>
                    <Side side={away} align="right" />
                </div>
                {(action != null || footnote != null) && (
                    <footer className="flex flex-col items-center gap-2 px-6 pb-6">
                        {action}
                        {footnote != null && <p className="text-xs text-ink-3">{footnote}</p>}
                    </footer>
                )}
            </div>
        </section>
    )
}
