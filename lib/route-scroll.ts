export function createRouteScrollRestoration(target: number, viewport: {
    read: () => number
    write: (position: number) => void
    remember: (position: number) => void
}) {
    let restoring = true
    return {
        restore() {
            if (!restoring) return
            viewport.write(target)
            if (Math.abs(viewport.read() - target) < 1) restoring = false
        },
        remember() { if (!restoring) viewport.remember(viewport.read()) },
        interrupt() { restoring = false },
    }
}
