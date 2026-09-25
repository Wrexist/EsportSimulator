import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MapRadarPanel } from "@/components/match/MapRadarPanel"
import { MapId } from "@/types"

describe("radar controls", () => {
    it("renders independent native buttons and defaults to the readable top-down view", () => {
        const markup = renderToStaticMarkup(React.createElement(MapRadarPanel, { currentMapId: MapId.NUKE, mapName: "Nuke" }))
        let depth = 0
        for (const match of markup.matchAll(/<\/?button\b[^>]*>/g)) {
            depth += match[0].startsWith("</") ? -1 : 1
            expect(depth).toBeLessThanOrEqual(1)
        }
        expect(depth).toBe(0)
        expect(markup).not.toContain("3D radar view")
        expect(markup).not.toContain("2.5D")
        expect(markup).toContain('aria-label="Radar floor"')
        expect(markup).toContain('aria-controls=')
        expect(markup).toContain("Names on")
        expect(markup).toContain('aria-label="Zoom radar in"')
        expect(markup).toContain('aria-label="Zoom radar out"')
    })

    it("keeps edge coordinates exact and hides future shot lines", () => {
        const markup = renderToStaticMarkup(React.createElement(MapRadarPanel, {
            currentMapId: MapId.MIRAGE, mapName: 'Mirage', currentTime: 0,
            radarDots: [{ playerId: 'p', nickname: 'Edge', side: 'ct', isAlive: true, x: 0, y: 100, angle: 0 }],
            killLines: [{ fromX: 20, fromY: 20, toX: 30, toY: 30, time: 4, isHeadshot: false, weapon: 'rifle' }],
        }))
        expect(markup).toContain('cx="0" cy="100"')
        expect(markup).not.toContain('x1="20" y1="20"')
    })

    it("omits floor switching on a single-level map", () => {
        const markup = renderToStaticMarkup(React.createElement(MapRadarPanel, { currentMapId: MapId.MIRAGE, mapName: "Mirage" }))
        expect(markup).not.toContain('aria-label="Radar floor"')
        expect(markup).toContain("Mirage")
    })
})
