/** G11: the translation layer, plurals, translators' file checks and the navigation keys. */
import { EN } from "@/locales/en"
import { checkTranslation, getAvailableLocales, getLocaleCompleteness, registerLocale, setLocale, t, tn } from "@/lib/i18n"
import { navHubs, navLabel, settingsItem } from "@/lib/navigation"

afterEach(() => setLocale("en"))

test("every navigation label has its English key", () => {
    for (const entry of [...navHubs, ...navHubs.flatMap(h => h.items), settingsItem]) {
        expect((EN as Record<string, string>)[entry.key]).toBe(entry.label)
        expect(navLabel(entry)).toBe(entry.label)
    }
})

test("English plurals", () => {
    expect(tn("menu.saves", 1)).toBe("1 save")
    expect(tn("menu.saves", 4)).toBe("4 saves")
})

test("a complete translation is offered and used, plural forms by that language's rules", () => {
    // Polish has one, few, many and other.
    const dict: Record<string, string> = {}
    for (const key of Object.keys(EN)) if (!key.startsWith("menu.saves.")) dict[key] = `PL ${(EN as Record<string, string>)[key]}`
    registerLocale("pl", { ...dict, "menu.saves.one": "{{count}} zapis" })
    expect(getLocaleCompleteness("pl").missing.sort()).toEqual(["menu.saves.few", "menu.saves.many", "menu.saves.other"])
    registerLocale("pl", { ...dict, "menu.saves.one": "{{count}} zapis", "menu.saves.few": "{{count}} zapisy", "menu.saves.many": "{{count}} zapisów", "menu.saves.other": "{{count}} zapisu" })
    expect(getAvailableLocales()).toContain("pl")
    setLocale("pl")
    expect(t("nav.roster")).toBe("PL Roster")
    expect(tn("menu.saves", 3)).toBe("3 zapisy")
    expect(tn("menu.saves", 5)).toBe("5 zapisów")
    expect(navLabel(navHubs[0])).toBe("PL Home")
})

test("translators' files: missing, unknown and placeholder mistakes are found", () => {
    const report = checkTranslation("de", { ...EN, "match.round": "Runde", "topbar.sections": "Bereiche: {{hub}}", "menu.saves.one": "ein Spielstand", "extra.key": "x" })
    expect(report.badPlaceholders).toEqual(["match.round"])
    expect(report.unknown).toEqual(["extra.key"])
    expect(report.missing).toEqual([])
})
