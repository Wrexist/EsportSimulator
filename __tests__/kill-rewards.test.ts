/**
 * MATCHENGINE-09: the legacy economy's weapon table (old checkpoints and
 * saves) pays the same CS2 kill rewards as script-v1.
 */
import { WEAPONS } from "@/engine/economy-manager"
import { killRewardFor } from "@/engine/match/round-sim/weapons"

test("XM1014 pays $600 a kill", () => {
    expect(WEAPONS.XM1014.killReward).toBe(600)
})

test("every legacy weapon pays what script-v1 pays", () => {
    for (const weapon of Object.values(WEAPONS)) {
        expect({ id: weapon.id, reward: weapon.killReward }).toEqual({ id: weapon.id, reward: killRewardFor(weapon.id) })
    }
})
