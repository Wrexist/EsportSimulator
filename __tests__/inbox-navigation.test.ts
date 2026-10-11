/**
 * Phase 4.3: the desktop OS is gone. `/desktop?app=` lands on the screen that
 * replaced each app, the Inbox nav entry / search palette / number key open
 * the drawer, and nothing navigates to /desktop any more.
 */
import fs from "fs"
import path from "path"
import {
    desktopRedirectHref, hubForPath, inboxHref, isNavItemActive, menuGroups, navHubs, parseInboxTab,
} from "@/lib/navigation"
import { INBOX_OPEN_KEY, INBOX_TOGGLE_KEY, NUMBER_KEY_ROUTES, SHORTCUT_GROUPS } from "@/lib/keyboard-shortcuts"
import { useInboxDrawer } from "@/components/inbox/inbox-drawer-store"

const redirect = jest.fn((href: string) => { throw new Error(`NEXT_REDIRECT ${href}`) })
jest.mock("next/navigation", () => ({ redirect: (href: string) => redirect(href) }))

describe("/desktop redirect map", () => {
    test.each([
        ["mail", "/?inbox=all"],
        ["news", "/?inbox=news"],
        ["social", "/?inbox=news"],
        ["finance", "/finances"],
        ["market", "/transfers"],
        ["academy", "/academy"],
        ["facilities", "/basecamp"],
        ["calendar", "/schedule"],
        // Phase 4.2: Equipment folded into Facilities → Gear.
        ["shop", "/basecamp?tab=gear"],
    ])("?app=%s → %s", (app, href) => {
        expect(desktopRedirectHref(app)).toBe(href)
    })

    test("no app, or an unknown one, opens the inbox over Home", () => {
        expect(desktopRedirectHref(null)).toBe("/?inbox=all")
        expect(desktopRedirectHref("toString")).toBe("/?inbox=all")
        expect(desktopRedirectHref("solitaire")).toBe("/?inbox=all")
    })

    test("the /desktop page redirects server-side with the mapped target", async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { default: DesktopRedirect } = require("@/app/desktop/page") as { default: (p: { searchParams: Promise<Record<string, string>> }) => Promise<void> }
        await expect(DesktopRedirect({ searchParams: Promise.resolve({ app: "finance" }) })).rejects.toThrow("NEXT_REDIRECT /finances")
        await expect(DesktopRedirect({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT /?inbox=all")
    })
})

describe("inbox entry points", () => {
    test("the Inbox nav item opens the drawer on the current screen and never counts as the active tab", () => {
        const inbox = navHubs.flatMap(h => h.items).find(i => i.label === "Inbox")
        expect(inbox?.href).toBe(inboxHref("all"))
        expect(inbox?.href.startsWith("?inbox=")).toBe(true)
        expect(isNavItemActive(inbox!, "/")).toBe(false)
        // The search palette is built from the same hubs.
        expect(menuGroups.flatMap(g => g.items).some(i => i.href === inboxHref("all"))).toBe(true)
    })

    test("parseInboxTab accepts the four tabs and falls back to All", () => {
        expect(parseInboxTab("decisions")).toBe("decisions")
        expect(parseInboxTab("news")).toBe("news")
        expect(parseInboxTab("bogus")).toBe("all")
        expect(parseInboxTab(null)).toBeNull()
    })

    test("number key 2 is the inbox (not a route) and I toggles it", () => {
        expect(INBOX_OPEN_KEY).toBe("2")
        expect(INBOX_TOGGLE_KEY).toBe("i")
        expect(NUMBER_KEY_ROUTES["2"]).toBeUndefined()
        const nav = SHORTCUT_GROUPS.find(g => g.label === "Navigation")!.shortcuts
        expect(nav.find(s => s.keys[0] === "2")?.description).toMatch(/inbox/i)
        expect(nav.find(s => s.keys[0] === "I")?.description).toMatch(/inbox/i)
    })

    test("drawer store: open on a tab, toggle, switching tab clears the selection", () => {
        const s = useInboxDrawer.getState()
        s.openInbox("decisions", "evt_1")
        expect(useInboxDrawer.getState()).toMatchObject({ open: true, tab: "decisions", selectedKey: "evt_1" })
        s.setTab("news")
        expect(useInboxDrawer.getState()).toMatchObject({ tab: "news", selectedKey: null })
        s.toggle()
        expect(useInboxDrawer.getState().open).toBe(false)
        s.toggle()
        expect(useInboxDrawer.getState().open).toBe(true)
        s.close()
        expect(useInboxDrawer.getState().open).toBe(false)
    })

    test("/desktop no longer belongs to a hub", () => {
        expect(hubForPath("/desktop")).toBeNull()
    })
})

test("no screen links to /desktop and the desktop OS components are gone", () => {
    const root = path.resolve(__dirname, "..")
    const offenders: string[] = []
    const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) { walk(full); continue }
            if (!/\.(ts|tsx)$/.test(entry.name)) continue
            const rel = path.relative(root, full).split(path.sep).join("/")
            if (rel === "app/desktop/page.tsx") continue
            const src = fs.readFileSync(full, "utf8")
            // String literals only (comments may still mention the old route in backticks).
            if (/["']\/desktop[?"'/]/.test(src) || /["']@\/components\/desktop(-apps)?\//.test(src)) offenders.push(rel)
        }
    }
    for (const dir of ["app", "components", "lib", "hooks", "store"]) walk(path.join(root, dir))
    expect(offenders).toEqual([])
    expect(fs.existsSync(path.join(root, "components/desktop-apps"))).toBe(false)
    expect(fs.existsSync(path.join(root, "components/desktop"))).toBe(false)
})
