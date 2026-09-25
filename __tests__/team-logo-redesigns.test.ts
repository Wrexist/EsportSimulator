import React from "react"
import fs from "node:fs"
import path from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { getTeamLogoRedesign } from "@/lib/team-logo-redesigns"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"

const team = { id: "team_3_falconry", name: "Ironspire", logoPath: "/assets/teams/falconry/logo.svg" }

it("renders the authored mark for an existing club without changing its save record", () => {
    const markup = renderToStaticMarkup(React.createElement(TeamLogoDisplay, { team }))
    expect(markup).toContain("logo.redesign.svg")
    expect(fs.existsSync(path.join(process.cwd(), "public", getTeamLogoRedesign(team.id, team.logoPath)!))).toBe(true)
})

it("preserves replacement logos and unknown club identities", () => {
    expect(getTeamLogoRedesign(team.id, "/mods/my-logo.svg")).toBeUndefined()
    expect(getTeamLogoRedesign("mod-team", team.logoPath)).toBeUndefined()
    const markup = renderToStaticMarkup(React.createElement(TeamLogoDisplay, { team: { ...team, customTeamData: { logoData: "data:image/png;base64,TEST", primaryColor: "#fff", secondaryColor: "#000", logoIndex: 0 } } }))
    expect(markup).toContain("data:image/png;base64,TEST")
    expect(markup).not.toContain("logo.redesign.svg")
})
