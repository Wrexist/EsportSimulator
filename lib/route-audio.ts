/** The shell owns music; studio routes are quiet workspaces. */
export function routeMusicScene(pathname: string | null): "silent" | "match" | "menu" {
    if (pathname === "/map-editor" || pathname?.startsWith("/map-editor/")) return "silent"
    return pathname?.includes("/match/") && pathname.includes("/live") ? "match" : "menu"
}
