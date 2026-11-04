/**
 * Hall of Fame plaque reasons are stored in English in the save (founding
 * legends from data, inductions from the engine). This shows them in the
 * active language; anything unrecognised is shown as stored.
 */
import { t, tn } from "./i18n"

const TAGS: Record<string, string> = {
    "AWP Meta Definer": "hof.tag.awp_meta_definer",
    "Best Entry Fragger": "hof.tag.best_entry_fragger",
    "Best Support Ever": "hof.tag.best_support_ever",
    "Clutch Master": "hof.tag.clutch_master",
    "Clutch Specialist": "hof.tag.clutch_specialist",
    "Cultural Icon": "hof.tag.cultural_icon",
    "Eastern AWP Legend": "hof.tag.eastern_awp_legend",
    "Eastern Architect": "hof.tag.eastern_architect",
    "Era-Defining Lurker": "hof.tag.era_defining_lurker",
    "Franchise Icon": "hof.tag.franchise_icon",
    "Franchise Legend": "hof.tag.franchise_legend",
    "Generational Talent": "hof.tag.generational_talent",
    "Grand Slam Winner": "hof.tag.grand_slam_winner",
    "Leadership Icon": "hof.tag.leadership_icon",
    "Legendary IGL": "hof.tag.legendary_igl",
    "Major MVP": "hof.tag.major_mvp",
    "Mechanical Legend": "hof.tag.mechanical_legend",
    "Most Consistent AWPer": "hof.tag.most_consistent_awper",
    "Multi-Year Top 3": "hof.tag.multi_year_top_3",
    "Northern Core": "hof.tag.northern_core",
    "Polish Dynasty Core": "hof.tag.polish_dynasty_core",
    "Pure-Aim Legend": "hof.tag.pure_aim_legend",
    "Shadow-Play Pioneer": "hof.tag.shadow_play_pioneer",
    "Signature Mid-Air Kill": "hof.tag.signature_mid_air_kill",
    "Southern Scene Godfather": "hof.tag.southern_scene_godfather",
    "Style Icon": "hof.tag.style_icon",
    "Superstar": "hof.tag.superstar",
    "Top 5 Multiple Years": "hof.tag.top_5_multiple_years",
    "Two-Decade Career": "hof.tag.two_decade_career",
    "Versatility King": "hof.tag.versatility_king",
    "Western Legend": "hof.tag.western_legend",
}

const COUNTED: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
    [/^(\d+)x Major [Cc]hampion$/, m => tn("hof.r.majors", Number(m[1]))],
    [/^Major [Cc]hampion$/, () => tn("hof.r.majors", 1)],
    [/^(\d+)x Player of the Year$/, m => tn("hof.r.poty", Number(m[1]))],
    [/^Player of the Year$/, () => tn("hof.r.poty", 1)],
    [/^(\d+)x Season MVP$/, m => tn("hof.r.mvp", Number(m[1]))],
    [/^Season MVP$/, () => tn("hof.r.mvp", 1)],
    [/^(\d+) titles$/, m => tn("hof.r.titles", Number(m[1]))],
    [/^(\d+)x Top 20$/, m => tn("hof.r.top20", Number(m[1]))],
    [/^([\d.]+) rating over (\d+) maps$/, m => t("hof.r.rating", { rating: m[1], maps: m[2] })],
    [/^(\d+) official kills$/, m => tn("hof.r.kills", Number(m[1]))],
    [/^(\d+) career matches$/, m => tn("hof.r.matches", Number(m[1]))],
    [/^Career achievement$/, () => t("hof.r.career")],
]

export function hofReasonLabel(stored: string): string {
    const tag = TAGS[stored]
    if (tag) return t(tag)
    for (const [re, label] of COUNTED) {
        const m = stored.match(re)
        if (m) return label(m)
    }
    return stored
}
