import {
    Home,
    Users,
    UserPlus,
    BarChart3,
    Dumbbell,
    Building2,
    Calendar,
    Globe,
    Trophy,
    Search,
    DollarSign,
    Settings,
    ClipboardList,
    Crown,
    Package,
    Award,
    Inbox,
    Swords,
    Handshake,
    GraduationCap,
    UserRound,
    type LucideIcon
} from "lucide-react"

export interface MenuItem {
    icon: LucideIcon
    label: string
    href: string
}

export interface MenuGroup {
    label: string
    items: MenuItem[]
}

/**
 * Top-level navigation: six hubs in the top bar, each with a row of
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

export const navHubs: NavHub[] = [
    {
        id: "home",
        label: "Home",
        icon: Home,
        items: [
            { icon: Home, label: "Overview", href: "/" },
            { icon: Inbox, label: "Inbox", href: "/desktop?app=mail" },
            { icon: Calendar, label: "Schedule", href: "/schedule" },
        ],
        prefixes: ["/schedule/", "/desktop"],
    },
    {
        id: "squad",
        label: "Squad",
        icon: Users,
        items: [
            { icon: Users, label: "Roster", href: "/squad" },
            { icon: Dumbbell, label: "Training", href: "/training" },
            { icon: ClipboardList, label: "Staff", href: "/staff" },
            { icon: GraduationCap, label: "Academy", href: "/academy" },
            { icon: BarChart3, label: "Statistics", href: "/stats" },
        ],
        prefixes: ["/player/"],
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
        id: "competition",
        label: "Competition",
        icon: Trophy,
        items: [
            { icon: Trophy, label: "Tournaments", href: "/tournaments" },
            { icon: Globe, label: "Rankings", href: "/rankings" },
            { icon: Swords, label: "FPL", href: "/fpl" },
        ],
        prefixes: ["/tournaments/", "/match/"],
    },
    {
        id: "club",
        label: "Club",
        icon: Building2,
        items: [
            { icon: DollarSign, label: "Finances", href: "/finances" },
            { icon: Handshake, label: "Sponsors", href: "/sponsorships" },
            { icon: Building2, label: "Facilities", href: "/basecamp" },
            { icon: Package, label: "Equipment", href: "/equipment" },
            { icon: UserRound, label: "Manager", href: "/career" },
        ],
    },
    {
        id: "legacy",
        label: "Legacy",
        icon: Crown,
        items: [
            { icon: Award, label: "Trophies", href: "/trophies" },
            { icon: Crown, label: "Hall of Fame", href: "/hall-of-fame" },
        ],
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
