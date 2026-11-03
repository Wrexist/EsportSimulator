/**
 * Names the game stores in English inside a save (division names, match
 * stages) shown in the active language. Anything not recognised is shown as
 * stored, so a club or event name is never mangled.
 */
import { t } from "./i18n"

const REGION_KEY: Record<string, string> = {
    Europe: "EUROPE", CIS: "CIS", Americas: "AMERICAS", "Asia-Pacific": "ASIA_PACIFIC",
}

/** A league region id (EUROPE, CIS, …) by its name. */
export function regionName(region: string): string {
    return ["EUROPE", "CIS", "AMERICAS", "ASIA_PACIFIC"].includes(region) ? t(`region.${region}`) : region
}

/** "Division 2" */
export function divisionLevelName(level: number): string {
    return t("league.divisionLevel", { level })
}

/** "Europe Division 3" as stored → the same in the active language. */
export function divisionName(stored: string): string {
    const m = /^(Europe|CIS|Americas|Asia-Pacific) Division (\d+)$/.exec(stored.trim())
    return m ? t("league.divisionName", { region: regionName(REGION_KEY[m[1]]), level: Number(m[2]) }) : stored
}

/** A fixture's stage as stored ("Europe Division 3 · Round 5", "Quarterfinals", …) in the active language. */
export function stageName(stored: string | null | undefined): string {
    if (!stored) return ""
    const league = /^(.+ Division \d+) · Round (\d+)$/.exec(stored.trim())
    if (league) return `${divisionName(league[1])} · ${t("league.roundN", { n: Number(league[2]) })}`
    return divisionName(stored)
}
