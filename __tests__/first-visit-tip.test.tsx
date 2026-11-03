import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FirstVisitTip, SCREEN_TIPS } from '@/components/ui/FirstVisitTip'
import { useSettingsStore } from '@/lib/settings-store'

test('a screen tip shows until it is dismissed, then stays dismissed', () => {
    useSettingsStore.setState({ seenTips: [] })
    expect(renderToStaticMarkup(<FirstVisitTip tip={SCREEN_TIPS.live} />)).toContain('Coaching the live match')
    useSettingsStore.getState().markTipSeen(SCREEN_TIPS.live.id)
    useSettingsStore.getState().markTipSeen(SCREEN_TIPS.live.id)
    expect(useSettingsStore.getState().seenTips).toEqual([SCREEN_TIPS.live.id])
    // Server rendering reads the initial state.
    Object.assign(useSettingsStore.getInitialState(), useSettingsStore.getState())
    expect(renderToStaticMarkup(<FirstVisitTip tip={SCREEN_TIPS.live} />)).toBe('')
    expect(renderToStaticMarkup(<FirstVisitTip tip={SCREEN_TIPS.tactics} />)).toContain('Match prep')
})
