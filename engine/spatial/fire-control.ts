/** Original burst discipline, in degrees and 64 Hz ticks. Recovery runs even
 * during reloads, blindness or lost sight; those are not frozen weapon states. */
export const RECOIL_RECOVERY_PER_SECOND = 1.8
export const recoverRecoil = (recoil: number) => Math.max(0, recoil - RECOIL_RECOVERY_PER_SECOND / 64)
export const settledBurstDelay = (recoil: number, shotTicks: number, pauseTicks: number) =>
    Math.max(shotTicks + pauseTicks, Math.ceil(recoil / RECOIL_RECOVERY_PER_SECOND * 64))
