"use client"

import { forwardRef } from "react"
import { cn } from "@/lib/utils"

/**
 * Liquid Glass material scale. One prop selects the tier instead of callers
 * memorising which legacy class (`glass-card`, `glass-panel`, `liquid-panel`,
 * `liquid-chrome`) maps to which depth:
 *
 *   ultrathin → chips, hover layers, inline pills
 *   thin      → cards, table rows, dense dashboards
 *   regular   → panels, content sections
 *   thick     → shell chrome (sidebar / top bar / taskbar)
 *   modal     → dialogs and elevated overlays
 *
 * The underlying classes live in app/globals.css; both theme variants
 * (crystal / onyx) share them and only re-tint via CSS variables.
 */
export type GlassMaterial = "ultrathin" | "thin" | "regular" | "thick" | "modal"

const MATERIAL_CLASS: Record<GlassMaterial, string> = {
    ultrathin: "glass-ultrathin",
    thin: "glass-card",
    regular: "glass-panel",
    thick: "liquid-chrome",
    modal: "liquid-panel",
}

export interface GlassSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
    material?: GlassMaterial
    /** Render with a continuous-curvature radius. Defaults to `rounded-2xl`. */
    radius?: "lg" | "xl" | "2xl" | "3xl" | "none"
}

const RADIUS_CLASS: Record<NonNullable<GlassSurfaceProps["radius"]>, string> = {
    none: "",
    lg: "rounded-lg",
    xl: "rounded-xl",
    "2xl": "rounded-2xl",
    "3xl": "rounded-3xl",
}

/**
 * The single Liquid Glass surface primitive. Prefer this over reaching for the
 * raw `glass-*` / `liquid-*` classes so material usage stays consistent as the
 * app is migrated screen by screen.
 */
export const GlassSurface = forwardRef<HTMLDivElement, GlassSurfaceProps>(
    function GlassSurface({ material = "regular", radius = "2xl", className, ...rest }, ref) {
        return (
            <div
                ref={ref}
                className={cn(MATERIAL_CLASS[material], RADIUS_CLASS[radius], className)}
                {...rest}
            />
        )
    }
)
