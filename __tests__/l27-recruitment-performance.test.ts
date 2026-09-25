import { createLaunchFixture } from '../scripts/launch/fixtures'
import { manageRoster, signFreeAgent } from '@/engine/ai/roster-management'
import * as recruitment from '@/engine/recruitment'

function fixture() {
    const save = createLaunchFixture('first-week', 27001)
    const team = save.teams[0]
    team.rosterIds = []
    team.budget = 5_000_000
    save.contracts = save.contracts.filter(c => c.teamId !== team.id)
    const template=save.players[0]
    for(let i=0;i<40;i++) save.players.push({...template,id:`l27_free_${i}`,nickname:`Candidate ${i}`,skill:30+i,rifle:30+i,role:i%2 ? 'RIFLER':'AWPER'})
    return save
}
test('batched vacancy filling preserves fresh-quote choices, order, contracts and state', () => {
    const original=fixture(), reference=structuredClone(original), candidate=structuredClone(original)
    while(reference.teams[0].rosterIds.length<5) {
        const before=reference.teams[0].rosterIds.length
        signFreeAgent(reference.teams[0],reference,true)
        if(before===reference.teams[0].rosterIds.length) break
    }
    manageRoster(candidate.teams[0],candidate)
    expect(candidate.teams[0].rosterIds).toHaveLength(5)
    expect(candidate).toEqual(reference)
})
test('quotes are reused only within a roster fill and recomputed after player changes', () => {
    const save=fixture(), team=save.teams[0]
    const spy=jest.spyOn(recruitment,'recruitmentSalary')
    try {
        manageRoster(team,save)
        const calls=spy.mock.calls.map(([player])=>player.id)
        expect(new Set(calls).size).toBe(calls.length)
        const remaining=save.players.find(p=>p.id.startsWith('l27_free_')&&!team.rosterIds.includes(p.id))!
        remaining.rifle=99; remaining.skill=99
        team.rosterIds=[]
        save.contracts=save.contracts.filter(c=>c.teamId!==team.id)
        spy.mockClear()
        manageRoster(team,save)
        expect(spy.mock.calls.some(([player])=>player.id===remaining.id)).toBe(true)
        expect(Object.keys(save).some(key=>/quote|salaryCache/i.test(key))).toBe(false)
    } finally { spy.mockRestore() }
})
