"use client"

import { useLayoutEffect, useRef } from "react"
import { routeViewCache } from "@/lib/route-view-cache"
import { createRouteScrollRestoration } from "@/lib/route-scroll"

/** Next manages window scroll; the game scrolls inside main instead. */
export function useRouteScroll(career: string | null | undefined, pathname: string | null, enabled: boolean) {
    const ref = useRef<HTMLElement>(null)
    useLayoutEffect(() => {
        const main = ref.current
        if (!main || !enabled) return
        const field = `scroll:${pathname}`
        const target = routeViewCache.get(career, field, 0)
        const { remember, restore, interrupt } = createRouteScrollRestoration(target, {
            read: () => main.scrollTop,
            write: position => { main.scrollTop = position },
            remember: position => routeViewCache.set(career, field, position),
        })
        // A returning list can render a loading placeholder before its content arrives.
        const observer = new ResizeObserver(restore)
        if (main.firstElementChild) observer.observe(main.firstElementChild)
        main.addEventListener("scroll", remember, { passive: true })
        main.addEventListener("wheel", interrupt, { passive: true })
        main.addEventListener("touchstart", interrupt, { passive: true })
        main.addEventListener("pointerdown", interrupt, { passive: true })
        main.addEventListener("keydown", interrupt)
        restore()
        const timeout = window.setTimeout(() => { interrupt(); observer.disconnect() }, 3000)
        return () => {
            // Do not read layout here: the next route may already have shortened main.
            window.clearTimeout(timeout)
            observer.disconnect()
            main.removeEventListener("scroll", remember)
            main.removeEventListener("wheel", interrupt)
            main.removeEventListener("touchstart", interrupt)
            main.removeEventListener("pointerdown", interrupt)
            main.removeEventListener("keydown", interrupt)
        }
    }, [career, pathname, enabled])
    return ref
}
