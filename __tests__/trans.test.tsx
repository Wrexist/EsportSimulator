/** Styled parts inside a translated sentence (lib/trans.tsx). */
import { renderToStaticMarkup } from "react-dom/server"
import { Trans } from "@/lib/trans"
import { registerLocale, setLocale } from "@/lib/i18n"
import { EN } from "@/locales/en"

afterEach(() => setLocale("en"))

test("tags render through their function, the rest stays text", () => {
    const html = renderToStaticMarkup(<Trans k="shortcuts.macNote" tags={{ kbd: key => <kbd>{key}</kbd> }} />)
    expect(html).toBe("macOS users: use <kbd>⌘</kbd> in place of <kbd>Ctrl</kbd>")
})

test("a translation may move the styled part", () => {
    registerLocale("de", { ...(EN as Record<string, string>), "shortcuts.escNote": "<kbd>Esc</kbd> zum Schließen" })
    setLocale("de")
    expect(renderToStaticMarkup(<Trans k="shortcuts.escNote" tags={{ kbd: key => <kbd>{key}</kbd> }} />)).toBe("<kbd>Esc</kbd> zum Schließen")
})
