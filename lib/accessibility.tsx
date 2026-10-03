"use client"

/**
 * Accessibility Utilities
 * ARIA labels, keyboard navigation, and screen reader support
 */

import { attachModalFocus } from './modal-focus'
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
 * Focus trap for modals. Attach the returned ref to the element carrying
 * role="dialog" (give it tabIndex={-1}). See lib/modal-focus.ts for the
 * contract. Pass `onEscape = undefined` while a destructive action is in
 * progress to keep the dialog open on Escape.
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(enabled: boolean, onEscape?: () => void) {
    const ref = useRef<T>(null)
    const escapeRef = useRef(onEscape)
    escapeRef.current = onEscape
    useEffect(() => {
        const root = ref.current
        if (!enabled || !root) return
        return attachModalFocus(root, { getOnEscape: () => escapeRef.current })
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
 * Keyboard parity for a clickable non-button element (card, row, tile) that
 * cannot become a <button> because it contains other interactive controls or
 * block layout. Spread onto the element in place of `onClick`:
 *
 *   <div {...pressable(() => select(id), { pressed: isSelected })}>
 *
 * Enter/Space activate only when the element itself has focus, so keys on a
 * nested button never double-fire the parent action.
 */
export function pressable(
    onActivate: () => void,
    options: { disabled?: boolean; pressed?: boolean; expanded?: boolean; label?: string } = {},
) {
    const { disabled = false, pressed, expanded, label } = options
    return {
        role: 'button' as const,
        tabIndex: disabled ? -1 : 0,
        'aria-disabled': disabled || undefined,
        'aria-pressed': pressed,
        'aria-expanded': expanded,
        'aria-label': label,
        onClick: () => { if (!disabled) onActivate() },
        onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
            if (event.target !== event.currentTarget || disabled) return
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onActivate() }
        },
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
