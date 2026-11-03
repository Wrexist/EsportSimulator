import { readFileSync } from "fs"
import { join } from "path"
import { registerLocale, setLocale } from "@/lib/i18n"
import { countryName, resolveCountryCode } from "@/lib/country"

afterEach(() => setLocale("en"))

describe("country names", () => {
    it("keeps the stored name in English", () => {
        expect(countryName("Russia")).toBe("Russia")
        expect(countryName("se")).toBe("se")
        expect(countryName("")).toBe("")
    })

    it("names a nationality in the active language and leaves regions as stored", () => {
        for (const locale of ["es", "de"]) {
            registerLocale(locale, JSON.parse(readFileSync(join(__dirname, `../public/locales/${locale}.json`), "utf8")))
        }
        setLocale("es")
        expect(countryName("Russia")).toBe("Rusia")
        expect(countryName("Sweden")).toBe("Suecia")
        expect(countryName("NA")).toBe("NA")
        expect(countryName("Europe")).toBe("Europe")
        expect(countryName("Atlantis")).toBe("Atlantis")
        setLocale("de")
        expect(countryName("de")).toBe("Deutschland")
    })

    it("resolves codes and English names for flags", () => {
        expect(resolveCountryCode("uk")).toBe("gb")
        expect(resolveCountryCode("Czech Republic")).toBe("cz")
        expect(resolveCountryCode("")).toBeNull()
    })
})
