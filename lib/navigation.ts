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

export const menuGroups: MenuGroup[] = [
    {
        label: "Overview",
        items: [
            { icon: Home, label: "Home", href: "/" },
            { icon: Inbox, label: "Inbox", href: "/desktop?app=mail" },
            { icon: Calendar, label: "Schedule", href: "/schedule" },
        ]
    },
    {
        label: "Team",
        items: [
            { icon: Users, label: "Squad", href: "/squad" },
            { icon: Dumbbell, label: "Training", href: "/training" },
            { icon: ClipboardList, label: "Staff", href: "/staff" },
            { icon: Package, label: "Equipment", href: "/equipment" },
        ]
    },
    {
        label: "Recruitment",
        items: [
            { icon: UserPlus, label: "Transfers", href: "/transfers" },
            { icon: Search, label: "Scouting", href: "/scouting" },
            { icon: Building2, label: "Facilities", href: "/basecamp" },
            { icon: GraduationCap, label: "Academy", href: "/academy" },
        ]
    },
    {
        label: "Competition",
        items: [
            { icon: Trophy, label: "Tournaments", href: "/tournaments" },
            { icon: Globe, label: "Rankings", href: "/rankings" },
            { icon: Swords, label: "FPL", href: "/fpl" },
            { icon: BarChart3, label: "Statistics", href: "/stats" },
        ]
    },
    {
        label: "Business",
        items: [
            { icon: DollarSign, label: "Finances", href: "/finances" },
            { icon: Handshake, label: "Sponsors", href: "/sponsorships" },
        ]
    },
    {
        label: "Legacy",
        items: [
            { icon: Award, label: "Trophies", href: "/trophies" },
            { icon: Crown, label: "Hall of Fame", href: "/hall-of-fame" },
        ]
    },
]

export const settingsItem: MenuItem = { icon: Settings, label: "Settings & Tools", href: "/settings" }

