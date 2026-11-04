/**
 * A news item's title and body written with translation keys: the save keeps
 * the English text (title, content) next to the keys (titleRef, contentRef),
 * and the feed shows the active language (lib/news-text.ts). Engine safe.
 */
import { tRefEn, type TextRef } from "./i18n"

export function newsText(title: TextRef, content: TextRef): { title: string; content: string; titleRef: TextRef; contentRef: TextRef } {
    return { title: tRefEn(title), content: tRefEn(content), titleRef: title, contentRef: content }
}

const REGION_ID: Record<string, string> = { Europe: "EUROPE", CIS: "CIS", Americas: "AMERICAS", "Asia-Pacific": "ASIA_PACIFIC" }
/** A stored division name ("Europe Division 2") as a translatable value; anything else as stored. */
export function divisionRef(name: string): TextRef | string {
    const m = /^(Europe|CIS|Americas|Asia-Pacific) Division (\d+)$/.exec(name.trim())
    return m ? { key: "league.divisionName", params: { region: { key: `region.${REGION_ID[m[1]]}` }, level: Number(m[2]) } } : name
}
