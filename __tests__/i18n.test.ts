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
    // Other plural groups get all four Polish forms; only menu.saves is under test.
    for (const key of Object.keys(EN)) {
        const m = /^(.*)\.other$/.exec(key)
        if (m && m[1] !== "menu.saves") for (const form of ["one", "few", "many", "other"]) dict[`${m[1]}.${form}`] = dict[key] ?? "x"
    }
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

describe("shipped languages", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs") as typeof import("fs")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { UI_LANGUAGES, normalizeUiLanguage } = require("@/lib/ui-languages") as typeof import("@/lib/ui-languages")

    test.each(UI_LANGUAGES.filter(l => l.code !== "en").map(l => l.code))("%s: file is complete, placeholders and tags intact", code => {
        const dict = JSON.parse(fs.readFileSync(`public/locales/${code}.json`, "utf8")) as Record<string, string>
        const report = checkTranslation(code, dict)
        expect(report.missing).toEqual([])
        expect(report.unknown).toEqual([])
        expect(report.badPlaceholders).toEqual([])
    })

    test("a picked or stored language the game does not ship falls back to English", () => {
        expect(normalizeUiLanguage("de")).toBe("de")
        expect(normalizeUiLanguage("pt-BR")).toBe("pt-BR")
        expect(normalizeUiLanguage("sv")).toBe("en")
        expect(normalizeUiLanguage(42)).toBe("en")
    })

    test("a translation that drops a styled tag is caught", () => {
        const report = checkTranslation("de", { ...EN, "shortcuts.escNote": "Esc zum Schließen" })
        expect(report.badPlaceholders).toContain("shortcuts.escNote")
    })

    test("German file in use: plurals and placeholders", () => {
        registerLocale("de", JSON.parse(fs.readFileSync("public/locales/de.json", "utf8")))
        setLocale("de")
        expect(tn("menu.saves", 1)).toBe("1 Spielstand")
        expect(tn("menu.saves", 3)).toBe("3 Spielstände")
        expect(t("match.round", { n: 7 })).toBe("Runde 7")
    })
})
