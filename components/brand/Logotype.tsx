import { useId } from "react"
import { cn } from "@/lib/utils"
import { inlineLayout, LOGOTYPE_COLORS, stackedLayout, type GlyphRun, type LogotypeLayout } from "./logotype-geometry"

export type LogotypeSize = "hero" | "header" | "compact"

/** Rendered height per size; width follows the lockup's aspect ratio. */
const HEIGHT: Record<LogotypeSize, number> = { hero: 132, header: 40, compact: 26 }

export interface LogotypeProps {
    /** hero: stacked lockup for the title screen and splash; header / compact: one line. */
    size?: LogotypeSize
    /** Optional line at the end of the hero's gold rule (e.g. "FPS"). No third-party marks. */
    subtitle?: string
    /** Overrides the preset height in px. */
    height?: number
    className?: string
    /** Accessible name. Ignored when `decorative`. */
    label?: string
    /** Hide from assistive tech when a visible heading already names the game. */
    decorative?: boolean
}

const FONT = { fontFamily: "var(--font-display)" }

/**
 * The game's logotype: the owner's gold trophy mark with the "ESPORTS MANAGER"
 * wordmark in Barlow Condensed and a gold accent rule. Geometry is shared with
 * the static export in public/key-art/logotype.svg (scripts/key-art/render-key-art.ts).
 */
export function Logotype({ size = "header", subtitle, height, className, label = "Esports Manager", decorative = false }: LogotypeProps) {
    const id = useId().replace(/:/g, "")
    const layout: LogotypeLayout = size === "hero" ? stackedLayout(subtitle) : inlineLayout(size === "header")
    const h = height ?? HEIGHT[size]
    const { viewBox: vb } = layout
    const w = Math.round((h * vb.width) / vb.height)
    const fill = (run: Pick<GlyphRun, "tone">) =>
        run.tone === "primary" ? `url(#${id}-primary)` : run.tone === "gold" ? LOGOTYPE_COLORS.gold : LOGOTYPE_COLORS.kicker
    const primary = layout.primary.find(run => run.tone === "primary") ?? layout.primary[0]

    return (
        <svg
            viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
            width={w}
            height={h}
            className={cn("shrink-0 select-none overflow-visible", className)}
            role={decorative ? undefined : "img"}
            aria-label={decorative ? undefined : label}
            aria-hidden={decorative ? true : undefined}
            focusable="false"
        >
            <defs>
                <linearGradient id={`${id}-primary`} gradientUnits="userSpaceOnUse" x1="0" y1={primary.y - primary.size * 0.71} x2="0" y2={primary.y}>
                    <stop offset="0" stopColor={LOGOTYPE_COLORS.primaryTop} />
                    <stop offset="1" stopColor={LOGOTYPE_COLORS.primaryBottom} />
                </linearGradient>
                <linearGradient id={`${id}-hairline`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor={LOGOTYPE_COLORS.gold} stopOpacity="0.7" />
                    <stop offset="1" stopColor={LOGOTYPE_COLORS.gold} stopOpacity="0.12" />
                </linearGradient>
                <linearGradient id={`${id}-bar`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor={LOGOTYPE_COLORS.gold} />
                    <stop offset="1" stopColor={LOGOTYPE_COLORS.goldDeep} />
                </linearGradient>
            </defs>

            <image
                href="/logo.png"
                x={layout.trophyImage.x}
                y={layout.trophyImage.y}
                width={layout.trophyImage.width}
                height={layout.trophyImage.height}
                preserveAspectRatio="xMidYMid meet"
            />

            {layout.kicker && (
                <text
                    x={layout.kicker.glyphs.map(g => g.x).join(" ")}
                    y={layout.kicker.y}
                    fontSize={layout.kicker.size}
                    fontWeight={layout.kicker.weight}
                    fill={LOGOTYPE_COLORS.kicker}
                    style={FONT}
                >
                    {layout.kicker.glyphs.map(g => g.ch).join("")}
                </text>
            )}

            {layout.primary.map(run => (
                <text key={run.text} x={run.x} y={run.y} fontSize={run.size} fontWeight={run.weight} fill={fill(run)} style={FONT}>
                    {run.text}
                </text>
            ))}

            {layout.rule && (
                <>
                    <rect {...layout.rule.bar} fill={`url(#${id}-bar)`} />
                    {layout.rule.hairline.width > 0 && <rect {...layout.rule.hairline} fill={`url(#${id}-hairline)`} />}
                </>
            )}

            {layout.subtitle && (
                <text
                    x={layout.subtitle.x}
                    y={layout.subtitle.y}
                    fontSize={layout.subtitle.size}
                    fontWeight={layout.subtitle.weight}
                    letterSpacing={layout.subtitle.letterSpacing}
                    fill={fill(layout.subtitle)}
                    style={FONT}
                >
                    {layout.subtitle.text}
                </text>
            )}
        </svg>
    )
}
