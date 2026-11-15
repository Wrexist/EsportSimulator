/**
 * Screen search (Ctrl K) matching: every typed word must start a word of the
 * screen's label, its group or its keywords (HOME-10). cmdk's default fuzzy
 * match let a club name such as "Diep" hit "Roster · Training · League".
 * A match on the screen's own label ranks above a match on its group or
 * keywords only. Item values are written "<label> · <group>".
 */
const WORD_SPLIT = /[\s·/,()&-]+/u

function words(text: string): string[] {
    return text.toLocaleLowerCase().split(WORD_SPLIT).filter(Boolean)
}

export function screenSearchFilter(value: string, search: string, keywords?: string[]): number {
    const terms = words(search)
    if (terms.length === 0) return 1
    const label = words(value.split(" · ")[0] ?? "")
    const all = [...words(value), ...(keywords ?? []).flatMap(words)]
    if (!terms.every(term => all.some(w => w.startsWith(term)))) return 0
    return terms.every(term => label.some(w => w.startsWith(term))) ? 1 : 0.5
}
