"use client"

import { useEffect, useState } from 'react'

type Breakpoint = 'mobile' | 'tablet' | 'desktop'

interface BreakpointConfig {
    mobile: number
    tablet: number
    desktop: number
}

const BREAKPOINTS: BreakpointConfig = {
    mobile: 640,   // sm
    tablet: 1024,  // lg
    desktop: 1280  // xl
}

/**
 * Hook to detect current breakpoint
 * @returns current breakpoint
 */
export function useBreakpoint(): Breakpoint {
    const [breakpoint, setBreakpoint] = useState<Breakpoint>('desktop')

    useEffect(() => {
        const checkBreakpoint = () => {
            const width = window.innerWidth

            if (width < BREAKPOINTS.mobile) {
                setBreakpoint('mobile')
            } else if (width < BREAKPOINTS.desktop) {
                setBreakpoint('tablet')
            } else {
                setBreakpoint('desktop')
            }
        }

        // Check on mount
        checkBreakpoint()

        // Listen for resize
        window.addEventListener('resize', checkBreakpoint)
        return () => window.removeEventListener('resize', checkBreakpoint)
    }, [])

    return breakpoint
}

/**
 * Hook to detect if viewport is mobile
 */
export function useIsMobile(): boolean {
    const breakpoint = useBreakpoint()
    return breakpoint === 'mobile'
}

/**
 * Hook for media queries
 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(false)

    useEffect(() => {
        const media = window.matchMedia(query)

        if (media.matches !== matches) {
            setMatches(media.matches)
        }

        const listener = () => setMatches(media.matches)
        media.addEventListener('change', listener)

        return () => media.removeEventListener('change', listener)
    }, [matches, query])

    return matches
}

/**
 * Responsive component wrapper
 * Shows children only at specified breakpoints
 */
export function Responsive({
    breakpoints,
    children
}: {
    breakpoints: Breakpoint[]
    children: React.ReactNode
}) {
    const current = useBreakpoint()

    if (!breakpoints.includes(current)) {
        return null
    }

    return <>{ children } </>
}

/**
 * Mobile-only component
 */
export function MobileOnly({ children }: { children: React.ReactNode }) {
    return <Responsive breakpoints={ ['mobile'] }> { children } </Responsive>
}

/**
 * Desktop-only component
 */
export function DesktopOnly({ children }: { children: React.ReactNode }) {
    return <Responsive breakpoints={ ['desktop'] }> { children } </Responsive>
}

/**
 * Get responsive class helper
 */
export function useResponsiveClass() {
    const breakpoint = useBreakpoint()

    return (classes: Partial<Record<Breakpoint, string>>) => {
        return classes[breakpoint] || classes.desktop || ''
    }
}
