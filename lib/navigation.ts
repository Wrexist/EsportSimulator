import {
    Home,
    Users,
    UserPlus,
    BarChart3,
    Dumbbell,
    Building2,
    Calendar,
    CalendarCheck,
    Globe,
    Trophy,
    Search,
    DollarSign,
    Settings,
    ClipboardList,
    Crown,
    Award,
    Inbox,
    Swords,
    Handshake,
    GraduationCap,
    UserRound,
    ListOrdered,
    Landmark,
    type LucideIcon
} from "lucide-react"
import { t } from "@/lib/i18n"

export interface MenuItem {
    icon: LucideIcon
    /** Translation key (locales/en.ts); `label` is its English text. */
    key: string
    label: string
    href: string
    /** Extra search-palette terms (old screen names, synonyms). */
    keywords?: string
}

export interface MenuGroup {
    key: string
    label: string
    items: MenuItem[]
}

/**
 * Top-level navigation: seven hubs in the top bar, each with a row of
 * sub-tabs (Football Manager style). `prefixes` claim detail routes
 * (a player profile belongs to Squad, a tournament page to Competition).
 */
export interface NavHub {
    id: string
    key: string
    label: string
    icon: LucideIcon
    items: MenuItem[]
    prefixes?: string[]
}

/**
 * Inbox drawer (Phase 4.3). The inbox is a drawer over the current screen,
 * not a page: `?inbox=<tab>` on any route opens it (InboxUrlBridge strips the
 * param again), so nav links, the search palette and old deep links can all
 * reach it with a plain href.
 */
export const INBOX_TABS = ["all", "decisions", "messages", "news"] as const
export type InboxTab = typeof INBOX_TABS[number]
export const INBOX_QUERY_PARAM = "inbox"

/** Relative href: keeps the current screen and opens the drawer on `tab`. */
export function inboxHref(tab: InboxTab = "all"): string {
    return `?${INBOX_QUERY_PARAM}=${tab}`
}

/** `?inbox=` value → tab; unknown values open the All tab, absent → null. */
export function parseInboxTab(value: string | null | undefined): InboxTab | null {
    if (value == null) return null
    return (INBOX_TABS as readonly string[]).includes(value) ? value as InboxTab : "all"
}

/** Facilities page tab that holds the equipment catalog (was `/equipment`). */
export const GEAR_HREF = "/basecamp?tab=gear"

/**
 * Week plan with the staff-meeting booking open (was `/schedule/staff-meeting`).
 * Keeps the booked day when the old link carried one.
 */
export function staffMeetingHref(week?: number | null, day?: number | null): string {
    const params = new URLSearchParams({ book: "meeting" })
    if (week != null && Number.isFinite(week)) params.set("week", String(week))
    if (day != null && Number.isFinite(day)) params.set("day", String(day))
    return `/week?${params.toString()}`
}

/**
 * The retired desktop OS (`/desktop?app=…`) → where each "app" lives now.
 * Mail/News/Social fold into the inbox drawer; the rest were thin copies of
 * real screens.
 */
const DESKTOP_APP_REDIRECTS: Record<string, string> = {
    mail: `/${inboxHref("all")}`,
    news: `/${inboxHref("news")}`,
    social: `/${inboxHref("news")}`,
    finance: "/finances",
    market: "/transfers",
    academy: "/academy",
    facilities: "/basecamp",
    calendar: "/schedule",
    shop: GEAR_HREF,
}

/** `/desktop?app=<app>` → its new home; no app or an unknown one → Home + inbox. */
export function desktopRedirectHref(app: string | null | undefined): string {
    if (app && Object.prototype.hasOwnProperty.call(DESKTOP_APP_REDIRECTS, app)) return DESKTOP_APP_REDIRECTS[app]
    return DESKTOP_APP_REDIRECTS.mail
}

export const navHubs: NavHub[] = [
    {
        id: "home",
        key: "nav.hub.home",
        label: "Home",
        icon: Home,
        items: [
            { icon: Home, key: "nav.overview", label: "Overview", href: "/" },
            { icon: Inbox, key: "nav.inbox", label: "Inbox", href: inboxHref(), keywords: "mail messages news decisions offers" },
        ],
    },
    {
        id: "squad",
        key: "nav.hub.squad",
        label: "Squad",
        icon: Users,
        items: [
            { icon: Users, key: "nav.roster", label: "Roster", href: "/squad", keywords: "lineup players" },
            { icon: ClipboardList, key: "nav.staff", label: "Staff", href: "/staff", keywords: "coach analyst psychologist scout" },
            { icon: GraduationCap, key: "nav.academy", label: "Academy", href: "/academy", keywords: "prospects youth" },
            { icon: BarChart3, key: "nav.statistics", label: "Statistics", href: "/stats" },
        ],
        prefixes: ["/player/"],
    },
    {
        // Phase 4.2: one place for the coming week. Training and the season
        // calendar are tabs of the same hub; a staff meeting is a booking.
        id: "week",
        key: "nav.hub.week",
        label: "Week",
        icon: CalendarCheck,
        items: [
            { icon: CalendarCheck, key: "nav.weekPlan", label: "Week plan", href: "/week", keywords: "weekly focus bookings scrim bootcamp marketing staff meeting" },
            { icon: Dumbbell, key: "nav.training", label: "Training", href: "/training", keywords: "drills retraining weapons loadouts" },
            { icon: Calendar, key: "nav.calendar", label: "Calendar", href: "/schedule", keywords: "schedule season fixtures" },
        ],
        prefixes: ["/week/", "/schedule/"],
    },
    {
        // `/match` redirects to the playable match's prep, else the latest
        // result, else the calendar (app/match/page.tsx).
        id: "match",
        key: "nav.hub.match",
        label: "Match",
        icon: Swords,
        items: [
            { icon: Swords, key: "nav.matchCentre", label: "Match centre", href: "/match", keywords: "next match tactics veto lineup result" },
        ],
        prefixes: ["/match/"],
    },
    {
        id: "recruitment",
        key: "nav.hub.recruitment",
        label: "Recruitment",
        icon: UserPlus,
        items: [
            { icon: UserPlus, key: "nav.transfers", label: "Transfers", href: "/transfers" },
            { icon: Search, key: "nav.scouting", label: "Scouting", href: "/scouting" },
        ],
    },
    {
        // The regional league (Phase 4.4) is the weekly competition every club
        // plays, so it opens the hub. Trophies and the Hall of Fame are the
        // scene's record (every title on the calendar, players who defined
        // eras), so they sit with tournaments.
        id: "competition",
        key: "nav.hub.competition",
        label: "Competition",
        icon: Trophy,
        items: [
            { icon: ListOrdered, key: "nav.league", label: "League", href: "/league", keywords: "division table standings promotion relegation split" },
            { icon: Trophy, key: "nav.tournaments", label: "Tournaments", href: "/tournaments" },
            { icon: Globe, key: "nav.rankings", label: "Rankings", href: "/rankings" },
            { icon: Award, key: "nav.trophies", label: "Trophies", href: "/trophies", keywords: "cabinet titles legacy" },
            { icon: Crown, key: "nav.hallOfFame", label: "Hall of Fame", href: "/hall-of-fame", keywords: "legends legacy" },
        ],
        prefixes: ["/tournaments/", "/team/"],
    },
    {
        id: "club",
        key: "nav.hub.club",
        label: "Club",
        icon: Building2,
        items: [
            { icon: DollarSign, key: "nav.finances", label: "Finances", href: "/finances", keywords: "money budget ledger" },
            { icon: Handshake, key: "nav.sponsors", label: "Sponsors", href: "/sponsorships" },
            { icon: Building2, key: "nav.facilities", label: "Facilities", href: "/basecamp", keywords: "gear equipment basecamp" },
            // The board employs the manager: objectives, confidence, warnings.
            { icon: Landmark, key: "nav.board", label: "Board", href: "/career/board", keywords: "objectives confidence expectations warning notice dismissal job security" },
            { icon: UserRound, key: "nav.manager", label: "Manager", href: "/career", keywords: "career profile saves" },
        ],
        // `/equipment` redirects into Facilities → Gear.
        prefixes: ["/equipment"],
    },
]

/** C10: club-running screens a pro career leaves to the staff. */
export const PRO_HIDDEN_HREFS: ReadonlySet<string> = new Set(["/staff", "/academy", "/transfers", "/scouting", "/finances", "/sponsorships", "/basecamp", "/career/board"])

/** The hubs to show: all of them, or without the club-running screens in a pro career. */
export function navHubsFor(pro: boolean): NavHub[] {
    if (!pro) return navHubs
    return navHubs
        .map(hub => ({ ...hub, items: hub.items.filter(item => !PRO_HIDDEN_HREFS.has(item.href)) }))
        .filter(hub => hub.items.length > 0)
}

/** Hub-grouped destinations (search palette). */
export const menuGroups: MenuGroup[] = navHubs.map(hub => ({ key: hub.key, label: hub.label, items: hub.items }))

export const settingsItem: MenuItem = { icon: Settings, key: "nav.settings", label: "Settings & Tools", href: "/settings" }

/** A hub's or item's label in the current language. */
export function navLabel(entry: { key: string; label: string }): string {
    const text = t(entry.key)
    return text === entry.key ? entry.label : text
}

const pathOf = (href: string) => href.split("?")[0]

/** True when `pathname` is the item's own page. */
export function isNavItemActive(item: MenuItem, pathname: string | null | undefined): boolean {
    return !!pathname && pathname === pathOf(item.href)
}

/** The hub that owns `pathname`, or null (settings, menus, unknown routes). */
export function hubForPath(pathname: string | null | undefined): NavHub | null {
    if (!pathname) return null
    for (const hub of navHubs) {
        if (hub.items.some(item => isNavItemActive(item, pathname))) return hub
    }
    for (const hub of navHubs) {
        if (hub.prefixes?.some(prefix => pathname.startsWith(prefix))) return hub
    }
    return null
}
