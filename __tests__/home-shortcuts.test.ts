/**
 * HOME-20: Space runs Continue (advance until something needs a decision),
 * but the shortcut sheet described it as "Advance time (day or week)".
 */
import { SHORTCUT_GROUPS } from "@/lib/keyboard-shortcuts"
import { t } from "@/lib/i18n"

test("the Space shortcut is described as Continue", () => {
    const gameplay = SHORTCUT_GROUPS.find(g => g.label === "shortcuts.group.gameplay")!
    const space = gameplay.shortcuts.filter(s => s.keys.join("+") === "Space").map(s => t(s.description))
    expect(space).toContain(t("advance.continueTitle"))
    expect(space).not.toContain("Advance time (day or week)")
})

// HOME-11 (2026-11-15 audit): no row twice, alternatives on one row, Ctrl+K listed.
test("each shortcut description appears once per group and Ctrl+K is listed", () => {
    for (const group of SHORTCUT_GROUPS) {
        if (group.label === "shortcuts.group.gameplay") continue // Space does two different things
        const descriptions = group.shortcuts.map(s => s.description)
        expect(new Set(descriptions).size).toBe(descriptions.length)
    }
    const general = SHORTCUT_GROUPS.find(g => g.label === "shortcuts.group.general")!.shortcuts
    expect(general.find(s => s.description === "shortcuts.openLoad")).toMatchObject({ keys: ["Ctrl", "L"], alt: ["F3"] })
    expect(general.find(s => s.description === "shortcuts.showShortcuts")).toMatchObject({ keys: ["F1"], alt: ["?"] })
    const nav = SHORTCUT_GROUPS.find(g => g.label === "shortcuts.group.navigation")!.shortcuts
    expect(nav.some(s => s.keys.join("+") === "Ctrl+K")).toBe(true)
})
