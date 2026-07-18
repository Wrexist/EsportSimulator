#!/usr/bin/env tsx
/* Faithful render of the live <TeamEmblem> to a static HTML gallery for QA. */
import fs from "node:fs"
import path from "node:path"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { TeamEmblem } from "../components/ui/TeamEmblem"

const OUT = path.join(process.cwd(), "scripts", "_emblem-preview.html")
const teams = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "public", "data", "snapshot", "teams.json"), "utf8"),
) as Array<{ id: string; name: string; shortName?: string; branding: any }>

// First 40 rebranded teams + a forced sweep of all four logoStyles.
const styleSweep = ["monogram", "mascot", "emblem", "wordmark"] as const
const cards: string[] = []

function card(name: string, sub: string, svg: string): string {
    return `<div class="card"><div class="badge">${svg}</div><div class="nm">${name}</div><div class="sub">${sub}</div></div>`
}

for (const t of teams.slice(0, 40)) {
    const svg = renderToStaticMarkup(
        React.createElement(TeamEmblem, {
            name: t.name, shortName: t.shortName, branding: t.branding, seed: t.id, size: 96,
        }),
    )
    cards.push(card(t.name, `${t.branding.logoStyle} · ${t.shortName}`, svg))
}

// Style sweep on a fixed vivid team so you can see each treatment.
const swatch = { primaryColor: "#7C3AED", secondaryColor: "#1E1B4B", accentColor: "#FDE047" }
const lightSwatch = { primaryColor: "#FFEE00", secondaryColor: "#1A1A1A", accentColor: "#111111" }
for (const s of styleSweep) {
    for (const [label, colors] of [["dark", swatch], ["light", lightSwatch]] as const) {
        const svg = renderToStaticMarkup(
            React.createElement(TeamEmblem, {
                name: "Obsidian Vanguard", shortName: "OBV",
                branding: { ...colors, logoStyle: s }, seed: `sweep_${s}_${label}`, size: 96,
            }),
        )
        cards.push(card(`${s}/${label}`, "sweep", svg))
    }
}

const html = `<!doctype html><meta charset=utf8><title>Emblem preview</title>
<style>
 body{background:#0b0f14;color:#cbd5e1;font:14px system-ui;margin:0;padding:24px}
 h1{font-size:16px;color:#94a3b8}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px;margin-top:16px}
 .card{background:#111826;border:1px solid #1f2937;border-radius:12px;padding:14px;text-align:center}
 .badge{display:flex;justify-content:center;align-items:center;height:100px}
 .nm{margin-top:8px;font-weight:600;color:#e2e8f0;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .sub{color:#64748b;font-size:11px}
</style>
<h1>TeamEmblem — 40 rebranded teams + logoStyle sweep (dark & light bodies)</h1>
<div class="grid">${cards.join("")}</div>`

fs.writeFileSync(OUT, html)
console.log("Wrote", path.relative(process.cwd(), OUT), `(${cards.length} emblems)`)
