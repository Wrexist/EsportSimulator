import { readFileSync } from "fs"
import { join } from "path"
import { registerLocale, setLocale } from "@/lib/i18n"
import { stageName } from "@/lib/display-names"

const de = JSON.parse(readFileSync(join(__dirname, "../public/locales/de.json"), "utf8"))

afterEach(() => setLocale("en"))

describe("stage names stored in English", () => {
    it("reads every stage shape the engine writes", () => {
        expect(stageName("Europe Division 3 · Round 5")).toBe("Europe Division 3 · Round 5")
        expect(stageName("Grand Final")).toBe("Grand final")
        expect(stageName("Semi-final 2")).toBe("Semi-final 2")
        expect(stageName("Quarter-final 1")).toBe("Quarter-final 1")
        expect(stageName("Round of 16 Match 3")).toBe("Round of 16 · match 3")
        expect(stageName("Round 1")).toBe("Round 1")
        expect(stageName("Swiss Round 2 (1-0)")).toBe("Swiss round 2 (1-0)")
        expect(stageName("Group A Upper Final")).toBe("Group A · Upper final")
        expect(stageName("Group Lower R2")).toBe("Group stage · Lower round 2")
        expect(stageName("3rd Place Decider")).toBe("3rd place decider")
    })

    it("shows them in the active language and leaves unknown names as stored", () => {
        registerLocale("de", de)
        setLocale("de")
        expect(stageName("Grand Final")).not.toBe("Grand final")
        expect(stageName("Group A Upper Final")).toContain("A")
        expect(stageName("IEM Katowice Playoffs")).toBe("IEM Katowice Playoffs")
        expect(stageName("")).toBe("")
    })
})
