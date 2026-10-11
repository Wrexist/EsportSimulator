/**
 * Every sound the game can play. Each id needs an entry in
 * public/audio/manifest.json (checked by __tests__/audio-pack.test.ts).
 * Keep one id per line: other streams add ids in parallel.
 */
export type SoundType =
    | 'click'
    | 'hover'
    | 'tab'
    | 'toggle'
    | 'back'
    | 'success'
    | 'notification'
    | 'decision'
    | 'error'
    | 'money'
    | 'weekAdvance'
    | 'transfer'
    | 'contractSign'
    | 'start'
    | 'matchStart'
    | 'matchIntro'
    | 'countdown'
    | 'roundWin'
    | 'roundLose'
    | 'bombPlant'
    | 'bombDefuse'
    | 'bombExplode'
    | 'clutch'
    | 'victory'
    | 'defeat'
    | 'titleWin'
    | 'titleWinMajor'
    | 'promotion'
    | 'relegation'
    | 'signing'
    | 'sale'
    | 'seasonReview'
    | 'award'
    | 'welcome'
    | 'achievement'
    | 'tournamentAdvance'
    | 'facilityUpgrade'

export type SoundCategory = 'ui' | 'match' | 'moment'
export type MusicScene = 'menu' | 'career' | 'match' | 'celebration'

// A Record forces this list to stay in step with the union at compile time.
const SOUND_ID_CHECK: Record<SoundType, true> = {
    click: true, hover: true, tab: true, toggle: true, back: true, success: true, notification: true, decision: true,
    error: true, money: true, weekAdvance: true, transfer: true, contractSign: true, start: true, matchStart: true,
    matchIntro: true, countdown: true, roundWin: true, roundLose: true, bombPlant: true, bombDefuse: true, bombExplode: true,
    clutch: true, victory: true, defeat: true, titleWin: true, titleWinMajor: true, promotion: true, relegation: true,
    signing: true, sale: true, seasonReview: true, award: true, welcome: true, achievement: true, tournamentAdvance: true,
    facilityUpgrade: true,
}
export const SOUND_IDS = Object.keys(SOUND_ID_CHECK) as SoundType[]

/** Rate-limit group and minimum spacing (seconds) per id. */
function gateGroup(type: SoundType): [string, number] {
    switch (type) {
        case 'click': case 'tab': case 'toggle': case 'back': return ['input', 0.06]
        case 'hover': return ['hover', 0.05]
        case 'error': return ['error', 0.65]
        case 'victory': case 'defeat': return ['outcome', 1.2]
        // One countdown per kickoff even if the intro and the first round both ask for it.
        case 'start': case 'matchStart': case 'countdown': return ['countdown', 20]
        case 'roundWin': case 'roundLose': return ['round', 0.4]
        case 'bombPlant': case 'bombDefuse': case 'bombExplode': return [type, 0.5]
        case 'success': case 'notification': case 'decision': case 'money': case 'weekAdvance':
        case 'transfer': case 'contractSign': case 'achievement': return ['feedback', 0.6]
        // Moments and stingers: the same moment never stacks on itself.
        default: return [type, 1.5]
    }
}

/** Presentation-only rate limit: never suppress the underlying action or visual message. */
export class AudioFeedbackGate {
    private last = new Map<string, number>()
    allow(type: SoundType, now: number): boolean {
        const [group, interval] = gateGroup(type)
        const previous = this.last.get(group)
        if (previous !== undefined && now >= previous && now - previous < interval) return false
        this.last.set(group, now)
        return true
    }
}

/** The single toast → sound mapping (toasts play from the store, never from the component). */
export function toastSoundFor(type: string): SoundType | null {
    if (type === 'error') return 'error'
    if (type === 'warning') return 'notification'
    if (type === 'level_up') return 'success'
    if (type === 'achievement') return 'achievement'
    return null // Routine information and XP remain visual, without repeated chimes.
}
