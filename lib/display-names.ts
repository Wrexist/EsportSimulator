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
    if ((m = /^Round of (\d+) Match (\d+)$/.exec(s))) return roundOfName(Number(m[1]), Number(m[2]))
    if ((m = /^Round of (\d+)$/.exec(s))) return roundOfName(Number(m[1]))
    if ((m = /^Round (\d+)$/.exec(s))) return t("stage.roundN", { n: Number(m[1]) })
    if ((m = /^Group ([A-Z])$/.exec(s))) return t("stage.group", { letter: m[1] })
    if ((m = /^Swiss Round (\d+) \(([^)]+)\)$/.exec(s))) return t("stage.swiss", { n: Number(m[1]), record: m[2] })
    if ((m = /^(Group(?: ([A-Z]))?) (Opening|Upper Semi|Upper Final|Lower Round 1|Lower R2|Lower Semi|Lower Final)$/.exec(s))) {
        const group = m[2] ? t("stage.group", { letter: m[2] }) : t("stage.groupStage")
        return t("stage.groupPhase", { group, phase: t(`stage.phase.${m[3]}`) })
    }
    return divisionName(stored)
}

/** Rounds with their own name in some languages ("1/8 финала", "Achtelfinale"). */
const NAMED_ROUNDS_OF = new Set([16, 32, 64])

/** "Round of 16" (and "· match 3") in the active language. */
export function roundOfName(size: number, match?: number): string {
    if (NAMED_ROUNDS_OF.has(size)) return match == null ? t(`stage.ro${size}`) : t(`stage.ro${size}Match`, { n: match })
    return match == null ? t("stage.roundOf", { size }) : t("stage.roundOfMatch", { size, n: match })
}

const FIXED_STAGES: Record<string, string> = {
    "Grand Final": "stage.grandFinal",
    "Quarter-final": "stage.quarterfinals",
    "Semi-final": "stage.semifinals",
    "Quarterfinals": "stage.quarterfinals",
    "Semifinals": "stage.semifinals",
    "Quarter-Finals": "stage.quarterfinals",
    "Semi-Finals": "stage.semifinals",
    "Tournament Match": "tm.match",
    "3rd Place Decider": "stage.thirdPlace",
    // The bracket's column for the decider (TournamentBracket normalizeRound, I18N-06).
    "3rd Place": "stage.thirdPlace",
    "Group Stage": "stage.groupStage",
    "Practice": "stage.practice",
    "Preseason Friendly": "stage.preseasonFriendly",
    "League Match": "stage.leagueMatch",
    "League Play": "stage.leaguePlay",
    "Bracket": "stage.bracket",
    "Swiss Stage": "stage.swissStage",
    "Playoffs": "stage.playoffs",
    "Registration": "stage.registration",
    "Qualifiers": "stage.qualifiers",
}

const EVENT_REGIONS = ["INTERNATIONAL", "EU", "NA", "SA", "ASIA", "CIS", "OCEANIA", "MENA"]
/** Club region codes that name an event region differently (START-29). */
const REGION_ALIASES: Record<string, string> = { BR: "SA", OCE: "OCEANIA" }
/**
 * A tournament's or club's region code (EU, NA, BR, OCE, INTERNATIONAL, …)
 * as a name. Every screen that shows a club's region uses this one, so a
 * club reads the same in the picker, its detail pane, the pro setup and
 * the job offers.
 */
export function eventRegionName(region: string | null | undefined): string {
    if (!region) return ""
    const code = REGION_ALIASES[region] ?? region
    return EVENT_REGIONS.includes(code) ? t(`tm.region.${code}`) : region
}
/** A club's region code as a name (same names as event regions). */
export const clubRegionName = eventRegionName

const EVENT_FORMATS = ["bracket", "double_elim", "swiss", "league"]
/** A tournament format; `long` gives "Single elimination" instead of "Single elim". */
export function eventFormatName(format: string | null | undefined, long = false): string {
    const f = (format || "").toLowerCase()
    if (!EVENT_FORMATS.includes(f)) return format || t("common.tbd")
    return t(`tm.format${long ? "Long" : ""}.${f}`)
}
