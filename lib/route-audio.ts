export type RouteMusic = "silent" | "menu" | "career" | "match"

const MENU_ROUTES = ["/main-menu", "/new-game", "/load-game", "/credits"]
const LIVE_MATCH = /^\/match\/[^/]+\/live\/?$/
const under = (pathname: string, route: string) => pathname === route || pathname.startsWith(`${route}/`)

/**
 * The shell owns music. Studio routes are quiet workspaces, the live match
 * has its own bed, the front-end screens use the menu theme and everything
 * inside a career uses the career bed. Settings follows where the player
 * came from (no career → menu).
 */
export function routeMusicScene(pathname: string | null, inCareer = true): RouteMusic {
    if (pathname && under(pathname, "/map-editor")) return "silent"
    if (pathname && LIVE_MATCH.test(pathname)) return "match"
    if (pathname && MENU_ROUTES.some(route => under(pathname, route))) return "menu"
    return inCareer ? "career" : "menu"
}
