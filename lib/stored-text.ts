/**
 * Display-time translation for English text that older code wrote into the
 * save: weekly report labels and causes, ledger lines, injury names. The save
 * keeps the English so reports and ledgers stay stable across languages; this
 * maps it to the active language when it is shown.
 *
 * Lookup order for each " · " segment:
 *  1. an exact entry in locales/en/stored.ts (svd.*),
 *  2. any other interface string with exactly the same English text
 *     (attribute names, archetypes, focus labels...),
 *  3. a known pattern ("Recovered from X", "Drill: X", "Leader +10%"),
 *     whose parts are translated the same way,
 *  4. the English as written.
 */

import { EN } from "@/locales/en"
import { getLocale, ordinalLabel, setStoredTextResolver, t, tn } from "@/lib/i18n"
import { divisionName } from "@/lib/display-names"

type Rule = [RegExp, (m: RegExpMatchArray) => string]

let reverse: Map<string, string> | null = null

function reverseIndex(): Map<string, string> {
    if (reverse) return reverse
    const map = new Map<string, string>()
    const entries = Object.entries(EN as Record<string, string>)
    // svd.* first so the stored-text table wins over a same-text key elsewhere.
    for (const [k, v] of entries) if (k.startsWith("svd.") && !k.startsWith("svd.p.")) map.set(v, k)
    for (const [k, v] of entries) {
        if (map.has(v) || v.includes("{{") || /\.(one|few|many|other)$/.test(k) || k.startsWith("svd.p.")) continue
        map.set(v, k)
    }
    reverse = map
    return map
}

const plural = (n: number, key: string, params: Record<string, string | number> = {}) => tn(key, n, params)

const RULES: Rule[] = [
    [/^Recovered from (.+)$/, m => t("svd.p.recovered", { injury: segment(m[1]) })],
    [/^Contract extended to week (\d+)$/, m => t("svd.p.extended", { week: m[1] })],
    [/^Contract now ends week (\d+)$/, m => t("svd.p.endsWeek", { week: m[1] })],
    [/^If you don't answer by Week (\d+), the club (.+)\.$/, m => t("dl.note", { week: m[1], consequence: segment(m[2]) })],
    [/^If you don't answer by Week (\d+), you (.+)\.$/, m => t("dl.noteYou", { week: m[1], consequence: segment(m[2]) })],
    [/^Unanswered: (.+)$/, m => t("svd.p.unanswered", { what: segment(m[1]) })],
    [/^Staff answered: (.+)$/, m => t("svd.p.staffAnswered", { what: segment(m[1]) })],
    [/^Drill: (.+)$/, m => t("svd.p.drill", { drill: segment(m[1]) })],
    [/^Match vs (.+)$/, m => t("svd.p.matchVs", { opp: m[1] })],
    [/^Forfeit win vs (.+)$/, m => t("svd.p.forfeitWin", { opp: m[1] })],
    [/^Forfeit loss vs (.+)$/, m => t("svd.p.forfeitLoss", { opp: m[1] })],
    [/^Beat (.+) (\d+[–-]\d+)$/, m => t("svd.p.beat", { opp: m[1], score: m[2] })],
    [/^Lost to (.+) (\d+[–-]\d+)$/, m => t("svd.p.lostTo", { opp: m[1], score: m[2] })],
    [/^(\d+) rest days?$/, m => plural(Number(m[1]), "svd.p.restDays")],
    [/^coach ×([\d.]+)$/, m => t("svd.p.coach", { x: m[1] })],
    [/^training facility L(\d+)$/, m => t("svd.p.trainingFacility", { level: m[1] })],
    [/^recovery room L(\d+)$/, m => t("svd.p.recoveryRoom", { level: m[1] })],
    [/^mentored ([+−-]\d+%)$/, m => t("svd.p.mentored", { pct: m[1] })],
    [/^(.+)'s contract ends in (\d+) weeks?$/, m => plural(Number(m[2]), "svd.p.contractEnds", { name: m[1] })],
    [/^(.+): (.+), (\d+) weeks? out$/, m => plural(Number(m[3]), "svd.p.injuredOut", { name: m[1], injury: segment(m[2]) })],
    [/^(.+) left the club \((.+)\)$/, m => t("svd.p.leftClub", { name: m[1], cause: segment(m[2].charAt(0).toUpperCase() + m[2].slice(1)) })],
    [/^Finances: (.+)$/, m => t("svd.p.finances", { state: t(`svd.fin.${m[1].toUpperCase()}`) })],
    [/^Other clubs' results(.*)$/, m => t("svd.p.otherResults") + (m[1] ? others(m[1]) : "")],
    // Ledger lines
    [/^Transfer Fee: (.+)$/, m => t("svd.p.transferFee", { name: m[1] })],
    [/^Signing Bonus: (.+)$/, m => t("svd.p.signingBonus", { name: m[1] })],
    [/^Transfer Received: (.+)$/, m => t("svd.p.transferReceived", { name: m[1] })],
    [/^Sell-on owed: (.+)$/, m => t("svd.p.sellOnOwed", { name: m[1] })],
    [/^Sell-on: (.+)$/, m => t("svd.p.sellOn", { name: m[1] })],
    [/^Contract settlement: (.+) \((\d+) weeks\)$/, m => t("svd.p.settlement", { name: m[1], weeks: m[2] })],
    [/^Specialist treatment for (.+)$/, m => t("svd.p.treatment", { name: m[1] })],
    [/^Hired (.+) \((\w+)\) - Sign-on Fee$/, m => t("svd.p.hired", { name: m[1], role: known(`staffRole.${m[2].toLowerCase()}`, m[2]) })],
    [/^Legend coach signing — (.+)$/, m => t("svd.p.legendCoach", { name: m[1] })],
    [/^Manager signing bonus - (.+)$/, m => t("svd.p.managerBonus", { club: m[1] })],
    [/^Merch Store Upgrade to Level (\d+)$/, m => t("svd.p.merchUpgrade", { level: m[1] })],
    [/^Youth Academy — Upgrade to Level (\d+)$/, m => t("svd.p.academyUpgrade", { level: m[1] })],
    [/^(\w+) Facility — Upgrade to Level (\d+)$/, m => t("svd.p.facilityUpgrade", { facility: known(`fac.${m[1]}.name`, m[1]), level: m[2] })],
    [/^(\w+) Facility — Construction$/, m => t("svd.p.facilityBuild", { facility: known(`fac.${m[1]}.name`, m[1]) })],
    [/^Activity income: (.+)$/, m => t("svd.p.activityIncome", { name: segment(m[1]) })],
    [/^Activity: (.+)$/, m => t("svd.p.activity", { name: segment(m[1]) })],
    [/^Booked: (.+)$/, m => t("svd.p.booked", { name: segment(m[1]) })],
    [/^Goal Reached: (.+)$/, m => t("svd.p.goalReached", { goal: segment(m[1]) })],
    [/^Match win contract bonus: (.+)$/, m => t("svd.p.winBonus", { name: m[1] })],
    [/^MVP contract bonus: (.+)$/, m => t("svd.p.mvpBonus", { name: m[1] })],
    [/^Appearance contract bonus: (.+)$/, m => t("svd.p.appearanceBonus", { name: m[1] })],
    [/^Title contract bonus \((.+)\): (.+)$/, m => t("svd.p.titleBonus", { tournament: m[1], name: m[2] })],
    [/^Board backing — exceptional season$/, () => t("svd.p.boardBackingExceptional")],
    [/^Board backing — successful season$/, () => t("svd.p.boardBackingSuccessful")],
    [/^Role training: (.+) → (\w+)$/, m => t("svd.p.roleTraining", { name: m[1], role: known(`market.role.${m[2]}`, m[2]) })],
    [/^Role training cancelled — refund: (.+)$/, m => t("svd.p.roleTrainingRefund", { name: m[1] })],
    [/^Equipment purchase: (.+)$/, m => t("svd.p.equipment", { item: m[1] })],
    [/^(.+) - (\d+)(?:st|nd|rd|th) Place$/, m => t("svd.p.placement", { tournament: m[1], place: ordinalLabel(Number(m[2])) })],
    [/^(.+) split (\S+) prize: (\d+)(?:st|nd|rd|th) place$/, m => t("svd.p.splitPrize", { division: m[1], split: m[2], place: ordinalLabel(Number(m[3])) })],
    // Board confidence causes (engine/board-expectations.ts) and objectives
    [/^Results: (\d+) won, (\d+) lost$/, m => t("svd.p.results", { w: m[1], l: m[2] })],
    [/^(On track|Behind target|League objective met|League objective missed): (\d+)\w* in (.+) \(target (\d+)\w*\)$/, m => t(`svd.p.league.${LEAGUE_STATE[m[1]]}`, { pos: ordinalLabel(Number(m[2])), division: divisionName(m[3]), target: ordinalLabel(Number(m[4])) })],
    [/^Finances at risk: (\d+) weeks? of runway$/, m => plural(Number(m[1]), "svd.p.runwayRisk")],
    [/^Financial crisis: (\d+) weeks? of runway$/, m => plural(Number(m[1]), "svd.p.runwayCrisis")],
    [/^Trophy ambition (met|missed): (\d+) won \(target (\d+)\)$/, m => t(`svd.p.trophies.${m[1]}`, { won: m[2], target: m[3] })],
    [/^Budget discipline (on track|missed): (\S+) in the bank \(target (\S+)\)$/, m => t(`svd.p.budget.${m[1] === "missed" ? "missed" : "ok"}`, { amount: m[2], target: m[3] })],
    [/^Season ranking (met|missed): #(\d+)(?:, (\d+) troph(?:y|ies))? \(target #(\d+)\)$/, m => t(`svd.p.rank.${m[1]}`, { rank: m[2], trophies: m[3] ? plural(Number(m[3]), "svd.p.rankTrophies") : "", target: m[4] })],
    [/^Season (\d+) board review: expectations (exceeded|met|missed|failed)$/, m => t("svd.p.seasonReview", { season: m[1], verdict: t(`svd.verdict.${m[2]}`) })],
    [/^Dismissed by (.+)$/, m => t("svd.p.dismissedBy", { club: m[1] })],
    [/^Beat (.+)$/, m => t("svd.p.beatTeam", { opp: m[1] })],
    [/^Lost to (.+)$/, m => t("svd.p.lostToTeam", { opp: m[1] })],
    [/^Won (.+)$/, m => t("svd.p.wonEvent", { event: m[1] })],
    // "Unhappy player (ace)": a label with a name in brackets.
    [/^(.+) \(([^()]+)\)$/, m => `${segment(m[1])} (${m[2]})`],
    // "AWP +0.3", "Leader +10%": a label with a signed number.
    [/^(.+?) ([+−-][\d.]+%?)$/, m => `${segment(m[1])} ${m[2]}`],
]

const LEAGUE_STATE: Record<string, string> = { "On track": "onTrack", "Behind target": "behind", "League objective met": "met", "League objective missed": "missed" }

/** ": passed by X; Y dropped behind" after "Other clubs' results". */
function others(rest: string): string {
    const body = rest.replace(/^: /, "")
    if (body === rest) return rest
    return ": " + body.split("; ").map(bit => {
        const passed = bit.match(/^passed by (.+)$/)
        if (passed) return t("svd.p.passedBy", { names: passed[1] })
        const behind = bit.match(/^(.+) dropped behind$/)
        if (behind) return t("svd.p.droppedBehind", { names: behind[1] })
        return bit
    }).join("; ")
}

/** A key's text when the key exists, else the fallback. */
function known(key: string, fallback: string): string {
    return key in (EN as Record<string, string>) ? t(key) : fallback
}

function segment(s: string): string {
    const text = s.trim()
    if (!text) return s
    const key = reverseIndex().get(text)
    if (key) return t(key)
    for (const [re, fn] of RULES) {
        const m = text.match(re)
        if (m) return fn(m)
    }
    return text
}

/** The stored English label in the active language (unchanged in English). */
export function storedText(s: string | null | undefined): string {
    if (!s) return s ?? ""
    if (getLocale() === "en") return s
    return s.split(" · ").map(segment).join(" · ")
}

// Lets a stored-English value nested in a translation key (STORED_REF) show in the active language.
setStoredTextResolver(storedText)
