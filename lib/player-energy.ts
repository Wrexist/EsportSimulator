/** Training energy and fatigue are independent simulation values. */
export function playerEnergyPercent(player: { energy?: number | null }): number {
    const energy = player.energy
    return typeof energy === 'number' && Number.isFinite(energy)
        ? Math.round(Math.max(0, Math.min(100, energy)))
        : 100
}
