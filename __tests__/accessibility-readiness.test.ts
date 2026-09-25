import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { focusCycleTarget } from '@/lib/focus-cycle'
import { parseMapCoordinates } from '@/lib/map-coordinate-input'
import { MapCoordinateInput } from '@/components/maps/MapCoordinateInput'
import { COLOR_VISION_MODES, normalizeColorVision } from '@/lib/accessibility-preferences'
import { useSettingsStore } from '@/lib/settings-store'
import { getAvailableLocales, getLocale, getLocaleCompleteness, registerLocale, setLocale, t } from '@/lib/i18n'
import { fireConfetti, shouldReduceConfetti } from '@/lib/confetti-lazy'
import { Slider } from '@/components/ui/slider'
import { MapPointEditor } from '@/components/maps/MapPointEditor'

describe('keyboard focus boundaries', () => {
    it('wraps both ends and enters from the dialog summary', () => {
        expect(focusCycleTarget(3, 2, false)).toBe(0)
        expect(focusCycleTarget(3, 0, true)).toBe(2)
        expect(focusCycleTarget(3, -1, true)).toBe(2)
        expect(focusCycleTarget(3, -1, false)).toBe(0)
        expect(focusCycleTarget(3, 1, false)).toBeNull()
    })
    it('handles controls disappearing and dialogs with no available actions', () => {
        expect(focusCycleTarget(0, -1, false)).toBe(-1)
        expect(focusCycleTarget(1, 0, false)).toBe(0)
        expect(focusCycleTarget(1, 0, true)).toBe(0)
    })
})

describe('map coordinate input', () => {
    it.each([['', '0'], [' ', '50'], ['NaN', '50'], ['Infinity', '1'], ['-1', '20'], ['20', '101']])('rejects invalid coordinates %s / %s', (x, y) => {
        expect(parseMapCoordinates(x, y)).toBeNull()
    })
    it('accepts boundary and fractional points without changing the project', () => {
        expect(parseMapCoordinates('0', '100')).toEqual({ x: 0, y: 100 })
        expect(parseMapCoordinates('22.5', ' 45.1 ')).toEqual({ x: 22.5, y: 45.1 })
    })
    it('exposes named inputs and disables the whole editor during recovery', () => {
        const html = renderToStaticMarkup(React.createElement(MapCoordinateInput, { label: 'Actor A', action: 'Place A', disabled: true, onApply: jest.fn() }))
        expect(html).toContain('<fieldset disabled=""')
        expect(html).toContain('aria-label="Actor A X"')
        expect(html).toContain('aria-label="Actor A Y"')
        expect(html).toContain('Place A')
    })
    it('starts point editing at the saved coordinates and keeps locked marks read-only', () => {
        const html = renderToStaticMarkup(React.createElement(MapPointEditor, { mark: { id: 'wall', kind: 'wall', points: [{ x: 12.5, y: 70 }, { x: 15, y: 72 }], label: 'Wall', note: '', locked: true, status: 'checked' }, disabled: false, onChange: jest.fn() }))
        expect(html).toContain('value="12.5"')
        expect(html).toContain('value="70"')
        expect(html).toContain('<fieldset disabled=""')
        expect(html).toContain('aria-label="Point to edit"')
    })
})

it('puts a slider label and meaningful units on the keyboard-operable thumb', () => {
    const html = renderToStaticMarkup(React.createElement(Slider, { value: [52], min: 12, max: 156, 'aria-label': 'Contract duration', 'aria-valuetext': '52 weeks' }))
    expect(html).toMatch(/role="slider"/)
    expect(html.match(/aria-label="Contract duration"/g)?.length).toBeGreaterThanOrEqual(2)
    expect(html).toContain('aria-valuetext="52 weeks"')
})

describe('display and language preferences', () => {
    const initial = useSettingsStore.getState()
    afterEach(() => { useSettingsStore.setState(initial); setLocale('en') })
    it('normalizes unknown modes and adopts the old contrast setting only once', () => {
        for (const mode of COLOR_VISION_MODES) expect(normalizeColorVision(mode)).toBe(mode)
        expect(normalizeColorVision('untrusted-class')).toBe('off')
        useSettingsStore.setState({ colorVisionPreferenceSet: false })
        useSettingsStore.getState().adoptLegacyColorVision('high-contrast')
        expect(useSettingsStore.getState().colorVisionMode).toBe('high-contrast')
        useSettingsStore.getState().setColorVisionMode('off')
        useSettingsStore.getState().adoptLegacyColorVision('high-contrast')
        expect(useSettingsStore.getState().colorVisionMode).toBe('off')
    })
    it('normalizes stored language claims and keeps partial dictionaries unavailable', () => {
        useSettingsStore.getState().setLanguage('sv')
        expect(useSettingsStore.getState().language).toBe('en')
        registerLocale('sv', { 'common.save': 'Spara' })
        expect(getLocaleCompleteness('sv').complete).toBe(false)
        expect(getAvailableLocales()).not.toContain('sv')
        setLocale('sv')
        expect(getLocale()).toBe('en')
        expect(t('common.save')).toBe('Save')
    })
    it('rehydrates validated display preferences and normalizes an unsupported saved language', () => {
        const previous = (global as { localStorage?: unknown }).localStorage
        const stored = { state: { colorVisionMode: 'high-contrast', language: 'sv', uiScale: 999 }, version: 0 }
        ;(global as { localStorage?: unknown }).localStorage = { getItem: () => JSON.stringify(stored), setItem: jest.fn(), removeItem: jest.fn() }
        try {
            jest.isolateModules(() => {
                const isolated = require('@/lib/settings-store').useSettingsStore
                const state = isolated.getState()
                expect(state.colorVisionMode).toBe('high-contrast')
                expect(state.colorVisionPreferenceSet).toBe(true)
                expect(state.language).toBe('en')
                expect(state.uiScale).toBe(120)
                const merge = isolated.persist.getOptions().merge
                expect(merge({ colorVisionMode: 'untrusted-class' }, state).colorVisionMode).toBe('off')
            })
        } finally { (global as { localStorage?: unknown }).localStorage = previous }
    })
    it('interpolates user text literally without replacement-token or recursive substitution', () => {
        expect(t('match.round', { n: '$& {{other}}', other: 'changed' })).toBe('Round $& {{other}}')
        expect(t('match.round')).toBe('Round {{n}}')
    })
    it('suppresses decorative canvas bursts when the in-game preference is on', async () => {
        useSettingsStore.setState({ reducedMotion: true })
        expect(shouldReduceConfetti()).toBe(true)
        await expect(fireConfetti({ particleCount: 500 })).resolves.toBeUndefined()
    })
    it('also honors the OS motion preference', () => {
        const previous = (global as { window?: unknown }).window
        ;(global as { window?: unknown }).window = { matchMedia: () => ({ matches: true }) }
        try { useSettingsStore.setState({ reducedMotion: false }); expect(shouldReduceConfetti()).toBe(true) }
        finally { (global as { window?: unknown }).window = previous }
    })
})
