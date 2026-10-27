/**
 * Demo tour: the headline features a demo player should meet in the twelve
 * demo weeks (lib/edition.ts). Shown on Home in demo builds only
 * (components/demo/DemoTour.tsx). A stop is done once the player has opened
 * its screen (recorded per device in the settings store) or the career shows
 * it was used (a playbook saved, a player signed).
 */

export type DemoTourStop = "live" | "playbook" | "week" | "training" | "market" | "league" | "draftCup"

export interface DemoTourItem {
    id: DemoTourStop
    label: string
    detail: string
    href: string
    /** Screens that count as having tried this stop. */
    routes: RegExp[]
}

export const DEMO_TOUR: readonly DemoTourItem[] = [
    {
        id: "live", label: "Call a match live on the radar",
        detail: "Watch every duel, utility throw and retake, and step in with timeouts and buy calls.",
        href: "/match", routes: [/^\/match\/[^/]+\/live\/?$/],
    },
    {
        id: "playbook", label: "Build your playbook",
        detail: "Pick the calls your side runs on each map, side and buy.",
        href: "/training", routes: [/^\/match\/[^/]+\/tactics\/?$/],
    },
    {
        id: "week", label: "Plan the week",
        detail: "Scrims, bootcamps, rest and media: every week is a trade-off.",
        href: "/week", routes: [/^\/week\/?$/],
    },
    {
        id: "training", label: "Train the squad",
        detail: "Drills, roles and weapon work that shape how your five play.",
        href: "/training", routes: [/^\/training\/?$/],
    },
    {
        id: "market", label: "Scout and sign a player",
        detail: "Hunt the market for the piece your roster is missing.",
        href: "/transfers", routes: [/^\/transfers(\/|$)/, /^\/scouting\/?$/],
    },
    {
        id: "league", label: "Climb the league table",
        detail: "Your division, the promotion race and the world ranking.",
        href: "/league", routes: [/^\/league\/?$/, /^\/rankings\/?$/],
    },
    {
        id: "draftCup", label: "Try a Draft Cup run",
        detail: "Draft five players on a budget and chase the cup in one sitting.",
        href: "/new-game/draft-cup", routes: [/^\/new-game\/draft-cup(\/|$)/],
    },
]

/** The tour stop a screen counts for, if any. */
export function demoTourStopForPath(pathname: string | null | undefined): DemoTourStop | null {
    if (!pathname) return null
    return DEMO_TOUR.find(item => item.routes.some(route => route.test(pathname)))?.id ?? null
}

type TourCareer = {
    playbook?: unknown
    signedPlayer?: boolean
}

/** Stops done: opened on this device, or proven by the career. */
export function demoTourDone(visited: readonly string[], career: TourCareer): Set<DemoTourStop> {
    const done = new Set<DemoTourStop>(DEMO_TOUR.map(item => item.id).filter(id => visited.includes(id)))
    if (career.playbook) done.add("playbook")
    if (career.signedPlayer) done.add("market")
    return done
}
