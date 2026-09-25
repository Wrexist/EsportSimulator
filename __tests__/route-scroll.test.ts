import { createRouteScrollRestoration } from "@/lib/route-scroll"

function setup(target: number, height = 100) {
    const state = { position: 0, height }
    const remember = jest.fn()
    const restoration = createRouteScrollRestoration(target, {
        read: () => state.position,
        write: position => { state.position = Math.min(position, state.height) },
        remember,
    })
    return { ...restoration, state, saved: remember }
}

describe("inner route scroll restoration", () => {
    it("waits for loaded content without replacing the saved position with a placeholder's clamp", () => {
        const route = setup(600)
        route.restore()
        route.remember()
        expect(route.state.position).toBe(100)
        expect(route.saved).not.toHaveBeenCalled()
        route.state.height = 900
        route.restore()
        route.remember()
        expect(route.state.position).toBe(600)
        expect(route.saved).toHaveBeenLastCalledWith(600)
    })
    it("hands control to the user and does not snap back when content later resizes", () => {
        const route = setup(600)
        route.restore()
        route.interrupt()
        route.state.position = 40
        route.state.height = 900
        route.restore()
        route.remember()
        expect(route.state.position).toBe(40)
        expect(route.saved).toHaveBeenLastCalledWith(40)
    })
    it("starts a new route at the top and then records normal scrolling", () => {
        const route = setup(0)
        route.state.position = 80
        route.restore()
        expect(route.state.position).toBe(0)
        route.state.position = 25
        route.remember()
        expect(route.saved).toHaveBeenLastCalledWith(25)
    })
})
