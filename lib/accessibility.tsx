"use client"

/**
 * Accessibility Utilities
 * ARIA labels, keyboard navigation, and screen reader support
 */

import { focusCycleTarget } from './focus-cycle'
import { useEffect, useRef } from 'react'

/**
 * Screen reader only text
 */
export function ScreenReaderOnly({ children }: { children: React.ReactNode }) {
    return (
        <span className="sr-only">
            {children}
        </span>
    )
}

/**
 * Skip to main content link
 */
export function SkipToContent() {
    return (
        <a
            href="#main-content"
            onClick={event => { const main = document.getElementById("main-content"); if (main) { event.preventDefault(); main.focus(); main.scrollTop = 0 } }}
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[10000] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded"
        >
            Skip to main content
        </a>
    )
}

/**
 * Announce to screen readers
 */
export function useAnnounce() {
    const announce = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
        const announcement = document.createElement('div')
        announcement.setAttribute('role', 'status')
        announcement.setAttribute('aria-live', priority)
        announcement.setAttribute('aria-atomic', 'true')
        announcement.className = 'sr-only'
        announcement.textContent = message

        document.body.appendChild(announcement)

        setTimeout(() => {
            document.body.removeChild(announcement)
        }, 1000)
    }

    return { announce }
}

/**
 * Focus trap for modals
 */
const modalScopes: HTMLElement[] = []
export function useFocusTrap(enabled: boolean, onEscape?: () => void) {
    const ref = useRef<HTMLDivElement>(null)
    const escapeRef = useRef(onEscape)
    escapeRef.current = onEscape
    useEffect(() => {
        const root = ref.current
        if (!enabled || !root) return
        const previous = document.activeElement as HTMLElement | null
        modalScopes.push(root)
        const isTop = () => modalScopes.at(-1) === root
        const candidates = () => Array.from(root.querySelectorAll<HTMLElement>(
            'a[href],button,input,textarea,select,[tabindex]'
        )).filter(element => element.tabIndex >= 0 && !element.matches(':disabled,[aria-disabled="true"]') && !element.closest('[hidden],[inert]') && element.getClientRects().length > 0)
        const focus = (element: HTMLElement) => element.focus({ preventScroll: true })
        const keydown = (event: KeyboardEvent) => {
            if (!isTop()) return
            if (event.key === 'Escape' && escapeRef.current) {
                event.preventDefault(); event.stopPropagation(); escapeRef.current(); return
            }
            if (event.key !== 'Tab') return
            const elements = candidates()
            const index = elements.indexOf(document.activeElement as HTMLElement)
            const target = focusCycleTarget(elements.length, index, event.shiftKey)
            if (target !== null) { event.preventDefault(); focus(target < 0 ? root : elements[target]) }
        }
        const focusin = (event: FocusEvent) => { if (isTop() && !root.contains(event.target as Node)) focus(root) }
        document.addEventListener('keydown', keydown, true)
        document.addEventListener('focusin', focusin)
        // Start on the summary, never on a potentially irreversible primary action.
        focus(root)
        return () => {
            const wasTop = isTop()
            modalScopes.splice(modalScopes.indexOf(root), 1)
            document.removeEventListener('keydown', keydown, true)
            document.removeEventListener('focusin', focusin)
            if (wasTop) {
                const target = previous?.isConnected ? previous : modalScopes.at(-1) || document.getElementById('main-content')
                if (target) focus(target)
            }
        }
    }, [enabled])
    return ref
}

/**
 * Accessible button props
 */
export function getAccessibleButtonProps(label: string, disabled = false) {
    return {
        'aria-label': label,
        'aria-disabled': disabled,
        role: 'button',
        tabIndex: disabled ? -1 : 0
    }
}

/**
 * Accessible link props
 */
export function getAccessibleLinkProps(label: string, external = false) {
    return {
        'aria-label': label,
        ...(external && {
            'aria-label': `${label} (opens in new tab)`,
            target: '_blank',
            rel: 'noopener noreferrer'
        })
    }
}

/**
 * Keyboard navigation helper
 */
export function useKeyboardNavigation(
    items: any[],
    onSelect: (index: number) => void
) {
    useEffect(() => {
        let currentIndex = 0

        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault()
                    currentIndex = Math.min(currentIndex + 1, items.length - 1)
                    break
                case 'ArrowUp':
                    e.preventDefault()
                    currentIndex = Math.max(currentIndex - 1, 0)
                    break
                case 'Enter':
                case ' ':
                    e.preventDefault()
                    onSelect(currentIndex)
                    break
                case 'Home':
                    e.preventDefault()
                    currentIndex = 0
                    break
                case 'End':
                    e.preventDefault()
                    currentIndex = items.length - 1
                    break
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [items, onSelect])
}

/**
 * ARIA live region for dynamic content
 */
export function LiveRegion({
    children,
    priority = 'polite'
}: {
    children: React.ReactNode
    priority?: 'polite' | 'assertive' | 'off'
}) {
    return (
        <div role="status" aria-live={priority} aria-atomic="true">
            {children}
        </div>
    )
}
