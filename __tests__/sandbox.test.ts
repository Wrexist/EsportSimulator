import { applySandboxEdit, enableSandbox, type SandboxTarget } from '@/engine/sandbox'
import { steamService } from '@/engine/steam-service'

const target = (): SandboxTarget => ({
    currentWeek: 20,
    teams: [{ id: 't', name: 'Club', shortName: 'CLB', budget: 1000 } as never],
    players: [{ id: 'p', nickname: 'ace', name: 'A Person', age: 22, skill: 60, rifle: 60 } as never],
    contracts: [{ playerId: 'p', teamId: 't', salaryPerWeek: 500, startWeek: 1, endWeek: 60, buyout: 0 }],
})

describe('C9: sandbox editor', () => {
    it('refuses edits until it is turned on', () => {
        const t = target()
        expect(applySandboxEdit(t, { kind: 'money', teamId: 't', budget: 5 }).ok).toBe(false)
        expect(t.teams[0].budget).toBe(1000)
    })

    it('edits money, players, contracts and names with clamps and a log', () => {
        const t = target()
        enableSandbox(t)
        expect(applySandboxEdit(t, { kind: 'money', teamId: 't', budget: 2e12 }).ok).toBe(true)
        expect(t.teams[0].budget).toBe(1_000_000_000)
        expect(applySandboxEdit(t, { kind: 'player', playerId: 'p', attributes: { skill: 150, rifle: 70 }, age: 99, nickname: '  zed ' }).ok).toBe(true)
        expect(t.players[0]).toMatchObject({ skill: 100, rifle: 70, age: 45, nickname: 'zed' })
        expect(applySandboxEdit(t, { kind: 'contract', playerId: 'p', salaryPerWeek: 900, endWeek: 5 }).ok).toBe(true)
        expect(t.contracts[0]).toMatchObject({ salaryPerWeek: 900, endWeek: 21 })
        expect(applySandboxEdit(t, { kind: 'team', teamId: 't', name: 'New Name', shortName: 'nn' }).ok).toBe(true)
        expect(t.teams[0]).toMatchObject({ name: 'New Name', shortName: 'NN' })
        expect(t.sandbox?.edits).toBe(4)
        expect(t.sandbox?.log[0].what).toMatch(/New Name/)
        expect(applySandboxEdit(t, { kind: 'team', teamId: 't', name: 'New Name' })).toEqual({ ok: false, reason: 'Nothing changed' })
    })

    it('blocks achievements for a sandbox save', async () => {
        steamService.setSandboxed(true)
        await expect(steamService.unlockAchievement('FIRST_WIN')).resolves.toBe(false)
        steamService.setSandboxed(false)
    })
})
