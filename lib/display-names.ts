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
    const s = stored.trim()
    const fixed = FIXED_STAGES[s]
    if (fixed) return t(fixed)
    let m: RegExpExecArray | null
    if ((m = /^Semi-final (\d+)$/.exec(s))) return t("stage.semiN", { n: Number(m[1]) })
    if ((m = /^Quarter-final (\d+)$/.exec(s))) return t("stage.quarterN", { n: Number(m[1]) })
    if ((m = /^Round of (\d+) Match (\d+)$/.exec(s))) return t("stage.roundOfMatch", { size: Number(m[1]), n: Number(m[2]) })
    if ((m = /^Round of (\d+)$/.exec(s))) return t("stage.roundOf", { size: Number(m[1]) })
    if ((m = /^Round (\d+)$/.exec(s))) return t("stage.roundN", { n: Number(m[1]) })
    if ((m = /^Swiss Round (\d+) \(([^)]+)\)$/.exec(s))) return t("stage.swiss", { n: Number(m[1]), record: m[2] })
    if ((m = /^(Group(?: ([A-Z]))?) (Opening|Upper Semi|Upper Final|Lower Round 1|Lower R2|Lower Semi|Lower Final)$/.exec(s))) {
        const group = m[2] ? t("stage.group", { letter: m[2] }) : t("stage.groupStage")
        return t("stage.groupPhase", { group, phase: t(`stage.phase.${m[3]}`) })
    }
    return divisionName(stored)
}

const FIXED_STAGES: Record<string, string> = {
    "Grand Final": "stage.grandFinal",
    "Quarter-final": "stage.quarterfinals",
    "Semi-final": "stage.semifinals",
    "Quarterfinals": "stage.quarterfinals",
    "Semifinals": "stage.semifinals",
    "3rd Place Decider": "stage.thirdPlace",
    "Group Stage": "stage.groupStage",
    "Practice": "stage.practice",
    "Preseason Friendly": "stage.preseasonFriendly",
    "League Match": "stage.leagueMatch",
}
