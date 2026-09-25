/** Individually authored marks; source images remain untouched. */
const REDESIGNS: Record<string, { legacyPath: string; path: string }> = {
    team_3_falconry: { legacyPath: "/assets/teams/falconry/logo.svg", path: "/assets/teams/falconry/logo.redesign.svg" },
    team_6_perivesion: { legacyPath: "/assets/teams/perivesion/logo.svg", path: "/assets/teams/perivesion/logo.redesign.svg" },
    team_11_eurora: { legacyPath: "/assets/teams/eurora/logo.svg", path: "/assets/teams/eurora/logo.redesign.svg" },
}

export function getTeamLogoRedesign(id?: string, logoPath?: string): string | undefined {
    const entry = id ? REDESIGNS[id] : undefined
    return entry && logoPath === entry.legacyPath ? entry.path : undefined
}
