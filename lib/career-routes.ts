/**
 * Which screens need a loaded career (CROSSCUT-09) and where Escape may go
 * back (START-05). One rule for every route, used by the GameShell.
 */

/** Screens that work without a career: the menus, settings and developer tools. */
const NO_CAREER_ROUTES = ["/main-menu", "/new-game", "/load-game", "/settings", "/credits", "/map-editor", "/dev", "/animations"]

const under = (pathname: string, route: string) => pathname === route || pathname.startsWith(`${route}/`)

/** True for a screen that only makes sense with a career loaded (Home, Squad, a match...). */
export function requiresCareer(pathname: string | null | undefined): boolean {
    if (!pathname) return false
    return !NO_CAREER_ROUTES.some(route => under(pathname, route))
}

/**
 * Escape goes back one screen everywhere except where "back" leaves the game
 * or reopens a finished setup: Home (the previous entry can be the new-career
 * form), the main menu (nothing before it) and the new-career screens.
 */
export function escapeGoesBack(pathname: string | null | undefined): boolean {
    if (!pathname) return false
    return pathname !== "/" && !under(pathname, "/main-menu") && !under(pathname, "/new-game")
}
