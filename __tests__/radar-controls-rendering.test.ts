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
        expect(markup).toContain('aria-label="Reset radar view"')
    })

    it("draws into one canvas with an accessible summary (snapshot mode)", () => {
        const markup = renderToStaticMarkup(React.createElement(MapRadarPanel, {
            currentMapId: MapId.MIRAGE, mapName: 'Mirage', currentTime: 10,
            radarDots: [{ playerId: 'p', nickname: 'Edge', side: 'ct', isAlive: true, x: 0, y: 100, angle: 0 }],
        }))
        expect(markup.match(/<canvas\b/g)).toHaveLength(1)
        expect(markup).toMatch(/<canvas[^>]*role="img"[^>]*aria-label="Mirage radar: CT 1 alive, T 0 alive, live"/)
        expect(markup).toContain('data-radar-source="snapshot"')
        // No script: no round scrubber.
        expect(markup).not.toContain('role="slider"')
    })

    it("shows a clutch banner only while the round is live", () => {
        const dots = [
            { playerId: 'c1', nickname: 'Last', side: 'ct' as const, isAlive: true, x: 30, y: 30, angle: 0 },
            { playerId: 'c2', nickname: 'Gone', side: 'ct' as const, isAlive: false, deathTime: 5, x: 40, y: 40, angle: 0 },
            ...[1, 2, 3].map(i => ({ playerId: `t${i}`, nickname: `T${i}`, side: 't' as const, isAlive: true, x: 60 + i * 5, y: 60, angle: 0 })),
        ]
        const render = (roundOver: boolean) => renderToStaticMarkup(React.createElement(MapRadarPanel, { currentMapId: MapId.MIRAGE, mapName: 'Mirage', currentTime: 40, radarDots: dots, roundOver }))
        const live = render(false)
        expect(live).toContain('1v3 CLUTCH')
        expect(live).toMatch(/CT 1<\/span>/)
        const over = render(true)
        expect(over).not.toContain('CLUTCH')
        expect(over).toContain('ROUND OVER')
    })

    it("omits floor switching on a single-level map", () => {
        const markup = renderToStaticMarkup(React.createElement(MapRadarPanel, { currentMapId: MapId.MIRAGE, mapName: "Mirage" }))
        expect(markup).not.toContain('aria-label="Radar floor"')
        expect(markup).toContain("Mirage")
    })
})
