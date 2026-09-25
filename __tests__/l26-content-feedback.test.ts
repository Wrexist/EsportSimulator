import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { formatCurrency, formatPercentage } from '@/lib/utils-extended'
import { AudioFeedbackGate, toastSoundFor } from '@/lib/audio-feedback'
import { IncomeBreakdown } from '@/components/finance/IncomeBreakdown'
import { getEventTitle } from '@/lib/event-format'
import type { GameEventSaveData } from '@/engine/save-types'
import { helpTopics } from '@/components/ui/help-system'
import { WEEKLY_ACTIVITIES, WeeklyActivityType, weeklyActivityXpBonus } from '@/types/activities'

test('exact money preserves cents and uses one negative sign before currency', () => {
    expect(formatCurrency(-1234567.5, '$', false)).toBe('-$1,234,567.5')
    expect(formatCurrency(1000049, '$', false)).toBe('$1,000,049')
    expect(formatCurrency(-0, '$', false)).toBe('$0')
    expect(formatCurrency(-0.001, '$', false)).toBe('$0')
    expect(formatCurrency(NaN)).toBe('—')
    expect(formatCurrency(Infinity, '$', false)).toBe('—')
    expect(formatCurrency(-1250000)).toBe('-$1.3M')
})
test('percentage formatting retains fraction semantics and rejects missing numbers', () => {
    expect(formatPercentage(.4167, 1)).toBe('41.7%')
    expect(formatPercentage(-.25)).toBe('-25%')
    expect(formatPercentage(Infinity)).toBe('—')
    expect(formatPercentage(.4, -2)).toBe('40%')
})
test.each([0, undefined])('zero or absent league share does not invent income (%s)', leagueShare => {
    const html = renderToStaticMarkup(React.createElement(IncomeBreakdown, { income: { sponsors: 300, fanbaseBonus: 100, leagueShare, total: 400 } }))
    expect(html).toContain('$300')
    expect(html).toContain('$100')
    expect(html).toContain('$0')
    expect(html).not.toContain('$15,000')
    expect(html).toContain('aria-valuenow="75"')
    expect(html).toContain('aria-valuenow="25"')
    expect(html).toContain('aria-valuenow="0"')
})
test('no income yields three zero shares without invalid percentages', () => {
    const html = renderToStaticMarkup(React.createElement(IncomeBreakdown, { income: { sponsors: 0, fanbaseBonus: 0, leagueShare: 0, total: 0 } }))
    expect(html.match(/aria-valuenow="0"/g)).toHaveLength(3)
    expect(html).not.toMatch(/NaN|Infinity/)
})
test('a toast burst produces one cue while errors can still interrupt', () => {
    const gate = new AudioFeedbackGate()
    expect(gate.allow('contractSign', 10)).toBe(true)
    expect(gate.allow('success', 10)).toBe(false)
    expect(gate.allow('notification', 10.2)).toBe(false)
    expect(gate.allow('error', 10.2)).toBe(true)
    expect(gate.allow('error', 10.3)).toBe(false)
    expect(gate.allow('success', 10.7)).toBe(true)
    expect(gate.allow('notification', 1)).toBe(true) // recreated context clock
})
test('routine information and XP are silent; warnings use a gentler cue', () => {
    expect(toastSoundFor('info')).toBeNull()
    expect(toastSoundFor('xp_gain')).toBeNull()
    expect(toastSoundFor('warning')).toBe('notification')
    expect(toastSoundFor('error')).toBe('error')
    expect(toastSoundFor('achievement')).toBe('success')
})
test('old inbox entries without data retain a readable title', () => {
    expect(getEventTitle({type: 'INJURY'} as GameEventSaveData)).toBe('Medical Report')
    expect(getEventTitle({type: 'MEDIA', data: null} as unknown as GameEventSaveData)).toBe('Media Update')
})

test('weekly focus guide displays the flat bootcamp award rather than a training multiplier', () => {
    const amount = weeklyActivityXpBonus(WEEKLY_ACTIVITIES[WeeklyActivityType.BOOTCAMP])
    const content = helpTopics.find(topic => topic.id === 'weekly-focus')!.content
    const text = renderToStaticMarkup(React.createElement('div', null, content)).replace(/<[^>]+>/g, '')
    expect(amount).toBe(50)
    expect(text).toContain(`+${amount} XP per roster player`)
    expect(text).not.toContain('double XP')
    expect(text).toContain('weekly settlement')
    expect(weeklyActivityXpBonus(WEEKLY_ACTIVITIES[WeeklyActivityType.TRAINING_ONLY])).toBe(0)
})
