import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { Table, TableBody, TableRow, TableCell } from "@/components/ui/table"
import { GlassTable } from "@/components/ui/GlassTable"
import { EmptyState } from "@/src/components/ui/EmptyState"
import { LoadingState } from "@/components/ui/loading"

describe("shared interface semantics", () => {
    it.each([Table, GlassTable])("names the keyboard-scrollable table region without losing table semantics", Component => {
        const html = renderToStaticMarkup(React.createElement(Component, { containerLabel: "Candidates", "aria-label": "Player ratings" },
            React.createElement(TableBody, null, React.createElement(TableRow, null, React.createElement(TableCell, null, "Dunk")))))
        expect(html).toMatch(/role="region" aria-label="Candidates"/)
        expect(html).toContain('tabindex="0"')
        expect(html).toContain('aria-label="Player ratings"')
        expect(html).toContain("<tbody")
        expect(html).not.toContain("containerLabel=")
    })

    it("retains recovery action destinations and readable empty-state content", () => {
        const html = renderToStaticMarkup(React.createElement(EmptyState, { title: "No players found", description: "Change your search to see more candidates.", action: { label: "Open squad", href: "/squad" } }))
        expect(html).toContain('href="/squad"')
        expect(html).toContain("No players found")
        expect(html).toContain("Change your search")
    })

    it("announces loading without claiming cloud or server activity", () => {
        for (const flavor of ["save", "match"]) {
            const html = renderToStaticMarkup(React.createElement(LoadingState, { flavor }))
            expect(html).toContain('role="status"')
            expect(html).not.toMatch(/cloud|servers/i)
        }
    })
})
