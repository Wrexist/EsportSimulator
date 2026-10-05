/**
 * Framework-agnostic modal keyboard/focus contract shared by every bespoke
 * (non-Radix) dialog in the app:
 *
 * - focus moves into the dialog on open (onto the dialog surface itself, so a
 *   potentially irreversible primary action is never pre-focused);
 * - Tab / Shift+Tab wrap inside the dialog, and focus that escapes (mouse
 *   click on the backdrop, programmatic focus) is pulled back in;
 * - Escape calls `onEscape` when one is supplied — pass `undefined` while a
 *   destructive/irreversible action is in flight to keep the dialog open;
 * - only the top-most open dialog reacts (nested dialogs stack);
 * - on close focus returns to the element that had it before opening, or the
 *   next dialog down the stack, or `#main-content`.
 *
 * Radix dialogs (`components/ui/dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`)
 * already implement this contract and do not use this module.
 */
import { focusCycleTarget } from './focus-cycle'

export const MODAL_FOCUSABLE_SELECTOR = 'a[href],button,input,textarea,select,[tabindex]'

export interface ModalFocusOptions {
    /** Read lazily on each keypress so callers can disable Escape mid-action. */
    getOnEscape?: () => (() => void) | undefined
    /** Injected for tests; defaults to the global document. */
    doc?: Document
}

const modalScopes: HTMLElement[] = []

/** Exposed for tests only. */
export function openModalCount(): number {
    return modalScopes.length
}

function isFocusable(element: HTMLElement): boolean {
    return element.tabIndex >= 0
        && !element.matches(':disabled,[aria-disabled="true"]')
        && !element.closest('[hidden],[inert]')
        && element.getClientRects().length > 0
}

export function modalFocusCandidates(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR)).filter(isFocusable)
}

/** Attach the modal contract to `root`; returns the detach function. */
export function attachModalFocus(root: HTMLElement, options: ModalFocusOptions = {}): () => void {
    const doc = options.doc ?? root.ownerDocument ?? document
    const previous = doc.activeElement as HTMLElement | null
    modalScopes.push(root)
    const isTop = () => modalScopes[modalScopes.length - 1] === root
    const focus = (element: HTMLElement) => element.focus({ preventScroll: true })

    const keydown = (event: KeyboardEvent) => {
        if (!isTop()) return
        if (event.key === 'Escape') {
            const onEscape = options.getOnEscape?.()
            // Always swallow Escape while a modal is open so page-level
            // shortcuts underneath (e.g. "Escape leaves the match") cannot fire.
            event.preventDefault(); event.stopPropagation()
            onEscape?.()
            return
        }
        if (event.key !== 'Tab') return
        const elements = modalFocusCandidates(root)
        const index = elements.indexOf(doc.activeElement as HTMLElement)
        const target = focusCycleTarget(elements.length, index, event.shiftKey)
        if (target !== null) { event.preventDefault(); focus(target < 0 ? root : elements[target]) }
    }
    const focusin = (event: FocusEvent) => {
        if (isTop() && !root.contains(event.target as Node)) focus(root)
    }
    doc.addEventListener('keydown', keydown, true)
    doc.addEventListener('focusin', focusin)
    if (!root.contains(doc.activeElement)) focus(root)

    let detached = false
    return () => {
        if (detached) return
        detached = true
        const wasTop = isTop()
        const index = modalScopes.indexOf(root)
        if (index >= 0) modalScopes.splice(index, 1)
        doc.removeEventListener('keydown', keydown, true)
        doc.removeEventListener('focusin', focusin)
        if (wasTop) {
            const target = previous?.isConnected && previous !== doc.body
                ? previous
                : modalScopes[modalScopes.length - 1] || doc.getElementById('main-content')
            if (target) focus(target)
        }
    }
}
