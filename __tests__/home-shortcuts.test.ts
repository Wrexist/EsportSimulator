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
