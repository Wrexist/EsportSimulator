import { captureWeekReplay, canonicalWeekState } from '@/engine/worker/week-replay'
import { createLaunchFixture } from '@/scripts/launch/fixtures'

test('replay inputs capture seed zero and detach caller-owned data', () => {
    const save = createLaunchFixture('strong-club')
    const replay = captureWeekReplay(save, { playerTeamId: save.playerTeamId, trainingFocus: new Map() }, 0)
    save.currentWeek = 900
    expect(replay.version).toBe(1)
    expect(replay.rngState).toBe(0)
    expect(replay.save.currentWeek).not.toBe(900)
})

test('canonical equality excludes only top-level commit metadata, retaining game data', () => {
    const a = createLaunchFixture('strong-club')
    const b = structuredClone(a)
    b.updatedAt = '2030-01-01T00:00:00Z'; b.lastPlayedAt = b.updatedAt; b.integrityHash = 'different'
    expect(canonicalWeekState(a)).toBe(canonicalWeekState(b))
    b.teams[0].budget++
    expect(canonicalWeekState(a)).not.toBe(canonicalWeekState(b))
    b.teams[0].budget--
    b.lastRngSeed++
    expect(canonicalWeekState(a)).not.toBe(canonicalWeekState(b))
})
