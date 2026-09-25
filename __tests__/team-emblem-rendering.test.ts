import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { TeamEmblem } from "@/components/ui/TeamEmblem"

const branding = { primaryColor: "#0EA5E9", secondaryColor: "#082F49", accentColor: "#FFFFFF", logoStyle: "emblem" as const }
const emblem = (size: number) => React.createElement(TeamEmblem, { name: "Pulsar", shortName: "PUL", seed: "pulsar", branding, size })

describe("team crest rendering", () => {
    it("keeps logos free of letter labels at both table and presentation sizes", () => {
        expect(renderToStaticMarkup(emblem(24))).not.toContain("<text")
        expect(renderToStaticMarkup(emblem(72))).not.toContain("<text")
    })

    it("gives repeated instances separate gradient IDs with local references", () => {
        const markup = renderToStaticMarkup(React.createElement("div", null, emblem(36), emblem(36)))
        const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])
        expect(ids.length).toBeGreaterThan(0)
        expect(new Set(ids).size).toBe(ids.length)
        for (const [, reference] of markup.matchAll(/url\(#([^)]*)\)/g)) expect(ids).toContain(reference)
    })

    it("retains a spoken club identity without decorative drop-shadow filters", () => {
        const markup = renderToStaticMarkup(emblem(24))
        expect(markup).toContain('aria-label="Pulsar logo"')
        expect(markup).not.toContain("drop-shadow")
    })
})


describe("distinct club identities", () => {
    it("gives monogram-only clubs a proper illustrated mark instead of a letter tile", () => {
        const html = renderToStaticMarkup(React.createElement(TeamEmblem, { name: "QWINTRY", shortName: "QWI", seed: "qwi", branding: { ...branding, logoStyle: "monogram" }, size: 32 }))
        expect(html).not.toContain("<text")
        expect(html.match(/<path/g)?.length).toBeGreaterThanOrEqual(4)
        expect(html).toContain('aria-label="QWINTRY logo"')
    })
    it("keeps hostile brand values out of SVG and uses distinct named club art", () => {
        const render = (name: string) => renderToStaticMarkup(React.createElement(TeamEmblem, { name, seed: "same-id", branding: { ...branding, primaryColor: 'url(https://untrusted.example/tracker)' }, size: 32 }))
        expect(render("WETERMELON")).not.toContain("untrusted.example")
        expect(render("WETERMELON")).not.toBe(render("QWINTRY"))
    })
})
