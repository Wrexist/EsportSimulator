/**
 * Per-map layout schema authored via /dev/map-builder and consumed by
 * lib/map-radar-data.ts + lib/radar-position-engine.ts.
 *
 * Coordinates are radar-normalized (0–100, top-left origin) — same space the
 * runtime uses for player dots. This lets the builder render directly over
 * the radar image at 1:1 and the JSON drop straight into the engine.
 */

export interface LayoutPoint {
    x: number
    y: number
}

export interface LayoutWall {
    from: LayoutPoint
    to: LayoutPoint
}

/** Polygon vertices, in order. The renderer auto-closes from last → first. */
export type LayoutPolygon = LayoutPoint[]

export interface MapLayoutJson {
    /** MapId enum value, e.g. "Sandstone", "Mirage". */
    mapId: string
    /** Display name for the builder UI. */
    displayName: string
    /** Asset filenames (without /maps/ prefix and without .png). */
    radarImage: {
        upper: string
        lower?: string
    }
    /** Schema version — bump when the shape changes. */
    schemaVersion: 1
    /** Set if B-site is on the lower level (Nuke, Vertigo). */
    bSiteLevel?: "lower"

    // ───────── Spawn / hold positions (5 each) ─────────
    /** CT actual spawn cluster — players start here and walk to ctHolds. */
    ctSpawn: LayoutPoint[]
    /** T actual spawn cluster. */
    tSpawn: LayoutPoint[]
    /** Per-CT-player assigned hold position. */
    ctHolds: LayoutPoint[]

    // ───────── Site anchors ─────────
    aSite: LayoutPoint
    bSite: LayoutPoint

    // ───────── Path waypoints ─────────
    tToA: LayoutPoint[]
    tToB: LayoutPoint[]
    ctRotateA: LayoutPoint[]
    ctRotateB: LayoutPoint[]

    // ───────── Engagement / mid ─────────
    engageA: LayoutPoint
    engageB: LayoutPoint
    mid: LayoutPoint

    // ───────── Optional geometry (Phase 7 additions) ─────────
    /** Walkable boundary or solid walls — used for kill-line plausibility. */
    walls?: LayoutWall[]
    /** Polygon outlines of named regions — A site, B site, mid, banana, long, etc. */
    namedRegions?: Record<string, LayoutPolygon>
    /** Optional A-site polygon shorthand (renderer prefers namedRegions["A site"] if both set). */
    aSitePolygon?: LayoutPolygon
    /** Optional B-site polygon shorthand. */
    bSitePolygon?: LayoutPolygon
}
