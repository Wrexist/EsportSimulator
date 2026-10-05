/**
 * L24.1 / L24.2 — shared modal keyboard/focus contract and reduced-motion
 * wiring. The jest environment is `node` (no jsdom), so the focus contract is
 * exercised against a minimal fake DOM that implements exactly the surface
 * `lib/modal-focus.ts` touches.
 */
import fs from 'fs'
import path from 'path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { attachModalFocus, openModalCount } from '@/lib/modal-focus'
import { pressable } from '@/lib/accessibility'
import { isReducedMotionActive, resolveReducedMotion } from '@/lib/reduced-motion'
import { useSettingsStore } from '@/lib/settings-store'
import { ActivityPickerModal } from '@/components/schedule/ActivityPickerModal'
import { MapRadarPanel } from '@/components/match/MapRadarPanel'
import { MapId } from '@/types'

// ---------------------------------------------------------------- fake DOM
type Listener = (event: any) => void

class FakeDocument {
    activeElement: FakeElement | null = null
    body: FakeElement
    private listeners: Record<string, Listener[]> = {}
    private byId = new Map<string, FakeElement>()
    constructor() { this.body = new FakeElement(this, 'body') }
    addEventListener(type: string, fn: Listener) { (this.listeners[type] ||= []).push(fn) }
    removeEventListener(type: string, fn: Listener) { this.listeners[type] = (this.listeners[type] || []).filter(l => l !== fn) }
    listenerCount(type: string) { return (this.listeners[type] || []).length }
    dispatch(type: string, event: any) { for (const l of [...(this.listeners[type] || [])]) l(event) }
    register(el: FakeElement) { if (el.id) this.byId.set(el.id, el) }
    getElementById(id: string) { return this.byId.get(id) ?? null }
    keydown(key: string, shiftKey = false) {
        const event = { key, shiftKey, preventDefault: jest.fn(), stopPropagation: jest.fn() }
        this.dispatch('keydown', event)
        return event
    }
}

class FakeElement {
    children: FakeElement[] = []
    parent: FakeElement | null = null
    disabled = false
    hidden = false
    isConnected = true
    constructor(public doc: FakeDocument, public name: string, public tabIndex = -1, public id = '', public focusable = false) {
        doc.register(this)
    }
    append(...kids: FakeElement[]) { for (const k of kids) { k.parent = this; this.children.push(k) } return this }
    contains(node: any): boolean { return node === this || this.children.some(c => c.contains(node)) }
    querySelectorAll() {
        const out: FakeElement[] = []
        const walk = (el: FakeElement) => { for (const c of el.children) { if (c.focusable) out.push(c); walk(c) } }
        walk(this)
        return out
    }
    matches() { return this.disabled }
    closest() { let el: FakeElement | null = this; while (el) { if (el.hidden) return el; el = el.parent } return null }
    getClientRects() { return this.hidden ? [] : [{}] }
    focus() {
        this.doc.activeElement = this
        this.doc.dispatch('focusin', { target: this })
    }
}

function button(doc: FakeDocument, name: string) { return new FakeElement(doc, name, 0, '', true) }

function setup() {
    const doc = new FakeDocument()
    const main = new FakeElement(doc, 'main', -1, 'main-content')
    const trigger = button(doc, 'trigger')
    const dialog = new FakeElement(doc, 'dialog', -1)
    const first = button(doc, 'close')
    const middle = button(doc, 'disabled-mid'); middle.disabled = true
    const last = button(doc, 'confirm')
    dialog.append(first, middle, last)
    doc.body.append(main.append(trigger), dialog)
    trigger.focus()
    return { doc, main, trigger, dialog, first, middle, last }
}

const asEl = (x: FakeElement) => x as unknown as HTMLElement
const asDoc = (x: FakeDocument) => x as unknown as Document

describe('shared modal focus contract (lib/modal-focus)', () => {
    afterEach(() => expect(openModalCount()).toBe(0))

    it('moves focus onto the dialog surface, never pre-focusing the primary action', () => {
        const { doc, dialog } = setup()
        const detach = attachModalFocus(asEl(dialog), { doc: asDoc(doc) })
        expect(doc.activeElement).toBe(dialog)
        detach()
    })

    it('traps Tab / Shift+Tab inside the dialog and skips disabled controls', () => {
        const { doc, dialog, first, last } = setup()
        const detach = attachModalFocus(asEl(dialog), { doc: asDoc(doc) })
        // From the surface, Tab enters at the first control; Shift+Tab at the last.
        let e = doc.keydown('Tab'); expect(e.preventDefault).toHaveBeenCalled(); expect(doc.activeElement).toBe(first)
        last.focus()
        e = doc.keydown('Tab'); expect(doc.activeElement).toBe(first)
        e = doc.keydown('Tab', true); expect(doc.activeElement).toBe(last)
        detach()
    })

    it('pulls focus back when it escapes to the page behind', () => {
        const { doc, dialog, trigger } = setup()
        const detach = attachModalFocus(asEl(dialog), { doc: asDoc(doc) })
        trigger.focus()
        expect(doc.activeElement).toBe(dialog)
        detach()
    })

    it('closes on Escape, and swallows Escape without closing while an action is in flight', () => {
        const { doc, dialog } = setup()
        const onEscape = jest.fn()
        let busy = false
        const detach = attachModalFocus(asEl(dialog), { doc: asDoc(doc), getOnEscape: () => busy ? undefined : onEscape })
        busy = true
        let e = doc.keydown('Escape')
        expect(onEscape).not.toHaveBeenCalled()
        expect(e.stopPropagation).toHaveBeenCalled() // page shortcuts underneath never see it
        busy = false
        e = doc.keydown('Escape')
        expect(onEscape).toHaveBeenCalledTimes(1)
        detach()
    })

    it('returns focus to the trigger on close and removes its listeners', () => {
        const { doc, dialog, trigger } = setup()
        const detach = attachModalFocus(asEl(dialog), { doc: asDoc(doc) })
        detach()
        expect(doc.activeElement).toBe(trigger)
        expect(doc.listenerCount('keydown')).toBe(0)
        expect(doc.listenerCount('focusin')).toBe(0)
        detach() // idempotent
    })

    it('falls back to #main-content when the trigger was removed while open', () => {
        const { doc, dialog, trigger, main } = setup()
        const detach = attachModalFocus(asEl(dialog), { doc: asDoc(doc) })
        trigger.isConnected = false
        detach()
        expect(doc.activeElement).toBe(main)
    })

    it('only the top-most of nested dialogs reacts, and closing it restores focus inside the lower one', () => {
        const { doc, dialog, last } = setup()
        const outerEscape = jest.fn()
        const innerEscape = jest.fn()
        const detachOuter = attachModalFocus(asEl(dialog), { doc: asDoc(doc), getOnEscape: () => outerEscape })
        last.focus()
        const inner = new FakeElement(doc, 'inner', -1)
        const innerButton = button(doc, 'inner-ok')
        doc.body.append(inner.append(innerButton))
        const detachInner = attachModalFocus(asEl(inner), { doc: asDoc(doc), getOnEscape: () => innerEscape })
        doc.keydown('Escape')
        expect(innerEscape).toHaveBeenCalledTimes(1)
        expect(outerEscape).not.toHaveBeenCalled()
        detachInner()
        expect(doc.activeElement).toBe(last)
        doc.keydown('Escape')
        expect(outerEscape).toHaveBeenCalledTimes(1)
        detachOuter()
    })

    it('focuses the surface when a dialog has no enabled controls', () => {
        const doc = new FakeDocument()
        const dialog = new FakeElement(doc, 'dialog', -1)
        const only = button(doc, 'busy'); only.disabled = true
        doc.body.append(dialog.append(only))
        const detach = attachModalFocus(asEl(dialog), { doc: asDoc(doc) })
        doc.keydown('Tab')
        expect(doc.activeElement).toBe(dialog)
        detach()
    })
})

describe('bespoke modal markup', () => {
    it('renders role=dialog, aria-modal, a resolvable aria-labelledby and a focusable surface', () => {
        const html = renderToStaticMarkup(React.createElement(ActivityPickerModal, { isOpen: true, onClose: jest.fn(), week: 4, onSelectType: jest.fn() }))
        expect(html).toContain('role="dialog"')
        expect(html).toContain('aria-modal="true"')
        expect(html).toContain('tabindex="-1"')
        const labelledBy = html.match(/aria-labelledby="([^"]+)"/)?.[1]
        expect(labelledBy).toBeTruthy()
        expect(html).toContain(`id="${labelledBy}"`)
        expect(html).toContain('aria-label="Close dialog"')
    })

    it('every non-Radix aria-modal surface in app/ and components/ is wired to the shared focus trap', () => {
        const root = path.resolve(__dirname, '..')
        const offenders: string[] = []
        const radix = new Set(['components/ui/dialog.tsx', 'components/ui/alert-dialog.tsx', 'components/ui/sheet.tsx', 'components/ui/drawer.tsx', 'components/ui/command.tsx'])
        const walk = (dir: string) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name)
                const rel = path.relative(root, full).split(path.sep).join('/')
                if (entry.isDirectory()) { if (!/(^|\/)(dev|debug|node_modules)$/.test(rel)) walk(full); continue }
                if (!rel.endsWith('.tsx') || radix.has(rel)) continue
                const src = fs.readFileSync(full, 'utf8')
                if (src.includes('aria-modal="true"') && !src.includes('useFocusTrap(')) offenders.push(rel)
            }
        }
        walk(path.join(root, 'app'))
        walk(path.join(root, 'components'))
        expect(offenders).toEqual([])
    })
})

describe('keyboard parity for clickable cards (pressable)', () => {
    const key = (k: string, self = true) => {
        const ev: any = { key: k, preventDefault: jest.fn() }
        ev.target = {}; ev.currentTarget = self ? ev.target : {}
        return ev
    }
    it('exposes button semantics and activates on Enter/Space only when the card itself is focused', () => {
        const fn = jest.fn()
        const props = pressable(fn, { pressed: true })
        expect(props).toMatchObject({ role: 'button', tabIndex: 0, 'aria-pressed': true })
        props.onKeyDown(key('Enter')); props.onKeyDown(key(' '))
        props.onKeyDown(key('a'))
        props.onKeyDown(key('Enter', false)) // bubbled from a nested button
        expect(fn).toHaveBeenCalledTimes(2)
        props.onClick()
        expect(fn).toHaveBeenCalledTimes(3)
    })
    it('is removed from the tab order and inert when disabled', () => {
        const fn = jest.fn()
        const props = pressable(fn, { disabled: true })
        expect(props.tabIndex).toBe(-1)
        expect(props['aria-disabled']).toBe(true)
        props.onClick(); props.onKeyDown(key('Enter'))
        expect(fn).not.toHaveBeenCalled()
    })
})

describe('reduced motion (in-game setting OR OS preference)', () => {
    const initial = useSettingsStore.getState().reducedMotion
    const g = globalThis as any
    afterEach(() => {
        useSettingsStore.setState({ reducedMotion: initial })
        delete g.window
        delete g.document
    })

    it('combines both signals', () => {
        expect(resolveReducedMotion(false, false)).toBe(false)
        expect(resolveReducedMotion(true, false)).toBe(true)
        expect(resolveReducedMotion(false, true)).toBe(true)
        expect(resolveReducedMotion(undefined, null)).toBe(false)
    })

    it('imperative check honors the in-game toggle even when the OS does not request it', () => {
        g.window = { matchMedia: () => ({ matches: false }) }
        expect(isReducedMotionActive()).toBe(false)
        useSettingsStore.setState({ reducedMotion: true })
        expect(isReducedMotionActive()).toBe(true)
    })

    it('imperative check honors the OS media query and the <html class="reduce-motion"> mirror', () => {
        g.window = { matchMedia: (q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)' }) }
        expect(isReducedMotionActive()).toBe(true)
        g.window = { matchMedia: () => ({ matches: false }) }
        g.document = { documentElement: { classList: { contains: (c: string) => c === 'reduce-motion' } } }
        expect(isReducedMotionActive()).toBe(true)
    })

    it('is false during server rendering', () => {
        useSettingsStore.setState({ reducedMotion: true })
        expect(isReducedMotionActive()).toBe(false)
    })

    it('no component branches on framer-motion useReducedMotion (OS-only) instead of the app hook', () => {
        const root = path.resolve(__dirname, '..')
        const offenders: string[] = []
        const walk = (dir: string) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name)
                if (entry.isDirectory()) { if (!/^(dev|debug|node_modules)$/.test(entry.name)) walk(full); continue }
                if (!/\.tsx?$/.test(entry.name)) continue
                const rel = path.relative(root, full).split(path.sep).join('/')
                if (rel === 'lib/reduced-motion.ts') continue
                const src = fs.readFileSync(full, 'utf8')
                if (/\buseReducedMotion\s*\(/.test(src) || /matchMedia\([^)]*prefers-reduced-motion[^)]*\)/.test(src) && !src.includes('isReducedMotionActive') && !src.includes('useAppReducedMotion')) offenders.push(rel)
            }
        }
        for (const d of ['app', 'components', 'hooks']) walk(path.join(root, d))
        expect(offenders).toEqual([])
    })

    it('the app root skips every framer-motion animation when reduced motion is active', () => {
        const shell = fs.readFileSync(path.resolve(__dirname, '../components/layout/GameShell.tsx'), 'utf8')
        expect(shell).toMatch(/<MotionConfig[^>]*skipAnimations=\{motionReduced\}/)
        expect(shell).toContain('useAppReducedMotion()')
    })

    it('count-ups and radar playback consult the combined signal', () => {
        const count = fs.readFileSync(path.resolve(__dirname, '../components/ui/animated-number.tsx'), 'utf8')
        expect(count).toContain('isReducedMotionActive()')
        const radar = fs.readFileSync(path.resolve(__dirname, '../components/match/MapRadarPanel.tsx'), 'utf8')
        expect(radar).toContain('isAnimating && !staticEffects')
    })
})

describe('colour-independent side signals (L24.2)', () => {
    it('draws CT players as circles and T players as diamonds, with a shape legend', () => {
        const html = renderToStaticMarkup(React.createElement(MapRadarPanel, {
            currentMapId: MapId.MIRAGE, mapName: 'Mirage', currentTime: 0,
            radarDots: [
                { playerId: 'c', nickname: 'Def', side: 'ct', isAlive: true, x: 20, y: 20, angle: 0 },
                { playerId: 't', nickname: 'Att', side: 't', isAlive: true, x: 60, y: 60, angle: 0 },
            ],
        } as any))
        expect(html).toContain('data-side-shape="ct-circle"')
        expect(html).toContain('data-side-shape="t-diamond"')
        expect(html).toMatch(/●[^<]*<\/span>CT/)
        expect(html).toMatch(/◆[^<]*<\/span>T/)
    })
})
