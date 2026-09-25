import { SeededRNG } from '@/engine/rng'
test('a long uninterrupted random stream agrees with regularly saved and reloaded state', () => {
    const uninterrupted = new SeededRNG(0)
    let reloaded = new SeededRNG(0)
    let same = true
    for (let i = 0; i < 5_000_100; i++) {
        if (i % 10000 === 0) reloaded = new SeededRNG(reloaded.getState())
        if (uninterrupted.next() !== reloaded.next()) { same = false; break }
    }
    expect(same).toBe(true)
    expect(uninterrupted.getState()).toBe(reloaded.getState())
})
