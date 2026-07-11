#!/usr/bin/env tsx
/**
 * Build a small, 100% clean EXAMPLE / TEMPLATE mod.
 *
 * Purpose:
 *   1. Satisfy Steam's "upload at least 1 public Workshop item" requirement
 *      with an item that contains NO real-world IP.
 *   2. Give modders a working starting point that shows the overlay format.
 *
 * It overlays a few shipped teams with obviously-fictional example names and
 * leaves logoPath empty (the game renders its generated crest), so the folder
 * is safe to commit and safe to publish. Output: examples/mod-template/.
 *
 *   npx tsx scripts/build-example-mod.ts
 */

import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const OUT = path.join(ROOT, "examples", "mod-template")

interface Team { id: string; name: string; shortName?: string; logoPath?: string;[k: string]: unknown }

const EXAMPLES: Array<{ name: string; shortName: string }> = [
    { name: "Aurora Collective", shortName: "AUR" },
    { name: "Nova Example FC", shortName: "NOV" },
    { name: "Vertex Sample", shortName: "VTX" },
]

function main(): void {
    const shipped = JSON.parse(
        fs.readFileSync(path.join(ROOT, "public", "data", "snapshot", "teams.json"), "utf8"),
    ) as Team[]

    // Overlay the first few shipped teams by id (keeps all their valid numeric
    // fields), changing only display name + short + clearing the logo so the
    // generated crest shows. logoPath "" is intentional — no assets shipped.
    const teamsOut = shipped.slice(0, EXAMPLES.length).map((t, i) => ({
        ...t,
        name: EXAMPLES[i].name,
        shortName: EXAMPLES[i].shortName,
        logoPath: "",
    }))

    const manifest = {
        name: "example-mod-template",
        title: "Example / Mod Template",
        author: "",
        version: "1.0.0",
        game: "Esports Manager: FPS",
        schema: 1,
        note: "A minimal, fully fictional example overlay. Copy this folder as a starting point for your own mod. Add assets/teams/<slug>/logo.png and set logoPath to use custom logos. Contains no real-world names, logos or likenesses.",
        teams: teamsOut.length,
        players: 0,
    }

    fs.mkdirSync(OUT, { recursive: true })
    fs.writeFileSync(path.join(OUT, "teams.json"), JSON.stringify(teamsOut, null, 2))
    fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2))

    console.log(`Wrote ${path.relative(ROOT, OUT)} — ${teamsOut.length} example teams:`)
    for (const t of teamsOut) console.log(`  ${t.id}  ->  ${t.name} [${t.shortName}]`)
}

main()
