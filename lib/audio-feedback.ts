export type SoundType = 'click' | 'hover' | 'success' | 'notification' | 'error' | 'start' | 'victory' | 'defeat' | 'matchStart' | 'roundWin' | 'roundLose' | 'weekAdvance' | 'transfer' | 'achievement' | 'contractSign' | 'facilityUpgrade' | 'tournamentAdvance'

/** Presentation-only rate limit: never suppress the underlying action or visual message. */
export class AudioFeedbackGate {
    private last = new Map<string, number>()
    allow(type: SoundType, now: number): boolean {
        const group = type === 'error' ? 'error' : type === 'click' || type === 'hover' ? 'input'
            : type === 'victory' || type === 'defeat' || type === 'matchStart' ? 'match' : 'feedback'
        const interval = group === 'input' ? 0.09 : group === 'match' ? 1.2 : group === 'error' ? 0.65 : 0.6
        const previous = this.last.get(group)
        if (previous !== undefined && now >= previous && now - previous < interval) return false
        this.last.set(group, now)
        return true
    }
}

export function toastSoundFor(type: string): SoundType | null {
    if (type === 'error') return 'error'
    if (type === 'warning') return 'notification'
    if (type === 'level_up') return 'achievement'
    if (type === 'achievement') return 'success'
    return null // Routine information and XP remain visual, without repeated chimes.
}
