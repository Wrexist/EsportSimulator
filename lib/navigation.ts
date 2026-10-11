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

export interface MenuItem {
    icon: LucideIcon
    label: string
    href: string
    /** Extra search-palette terms (old screen names, synonyms). */
    keywords?: string
}

export interface MenuGroup {
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
        label: "Home",
        icon: Home,
        items: [
            { icon: Home, label: "Overview", href: "/" },
            { icon: Inbox, label: "Inbox", href: inboxHref(), keywords: "mail messages news decisions offers" },
        ],
    },
    {
        id: "squad",
        label: "Squad",
        icon: Users,
        items: [
            { icon: Users, label: "Roster", href: "/squad", keywords: "lineup players" },
            { icon: ClipboardList, label: "Staff", href: "/staff", keywords: "coach analyst psychologist scout" },
            { icon: GraduationCap, label: "Academy", href: "/academy", keywords: "prospects youth" },
            { icon: BarChart3, label: "Statistics", href: "/stats" },
        ],
        prefixes: ["/player/"],
    },
    {
        // Phase 4.2: one place for the coming week. Training and the season
        // calendar are tabs of the same hub; a staff meeting is a booking.
        id: "week",
        label: "Week",
        icon: CalendarCheck,
        items: [
            { icon: CalendarCheck, label: "Week plan", href: "/week", keywords: "weekly focus bookings scrim bootcamp marketing staff meeting" },
            { icon: Dumbbell, label: "Training", href: "/training", keywords: "drills retraining weapons loadouts" },
            { icon: Calendar, label: "Calendar", href: "/schedule", keywords: "schedule season fixtures" },
        ],
        prefixes: ["/week/", "/schedule/"],
    },
    {
        // `/match` redirects to the playable match's prep, else the latest
        // result, else the calendar (app/match/page.tsx).
        id: "match",
        label: "Match",
        icon: Swords,
        items: [
            { icon: Swords, label: "Match centre", href: "/match", keywords: "next match tactics veto lineup result" },
        ],
        prefixes: ["/match/"],
    },
    {
        id: "recruitment",
        label: "Recruitment",
        icon: UserPlus,
        items: [
            { icon: UserPlus, label: "Transfers", href: "/transfers" },
            { icon: Search, label: "Scouting", href: "/scouting" },
        ],
    },
    {
        // The regional league (Phase 4.4) is the weekly competition every club
        // plays, so it opens the hub. Trophies and the Hall of Fame are the
        // scene's record (every title on the calendar, players who defined
        // eras), so they sit with tournaments.
        id: "competition",
        label: "Competition",
        icon: Trophy,
        items: [
            { icon: ListOrdered, label: "League", href: "/league", keywords: "division table standings promotion relegation split" },
            { icon: Trophy, label: "Tournaments", href: "/tournaments" },
            { icon: Globe, label: "Rankings", href: "/rankings" },
            { icon: Award, label: "Trophies", href: "/trophies", keywords: "cabinet titles legacy" },
            { icon: Crown, label: "Hall of Fame", href: "/hall-of-fame", keywords: "legends legacy" },
        ],
        prefixes: ["/tournaments/"],
    },
    {
        id: "club",
        label: "Club",
        icon: Building2,
        items: [
            { icon: DollarSign, label: "Finances", href: "/finances", keywords: "money budget ledger" },
            { icon: Handshake, label: "Sponsors", href: "/sponsorships" },
            { icon: Building2, label: "Facilities", href: "/basecamp", keywords: "gear equipment basecamp" },
            // The board employs the manager: objectives, confidence, warnings.
            { icon: Landmark, label: "Board", href: "/career/board", keywords: "objectives confidence expectations warning notice dismissal job security" },
            { icon: UserRound, label: "Manager", href: "/career", keywords: "career profile saves" },
        ],
        // `/equipment` redirects into Facilities → Gear.
        prefixes: ["/equipment"],
    },
]

/** Hub-grouped destinations (search palette). */
export const menuGroups: MenuGroup[] = navHubs.map(hub => ({ label: hub.label, items: hub.items }))

export const settingsItem: MenuItem = { icon: Settings, label: "Settings & Tools", href: "/settings" }

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
