import { CLUB_NAME_MAX, DIFFICULTY_SETTINGS, REGION_INFO, type CustomTeamData } from '@/types/team-creator'
import { CAREER_DIFFICULTY, type CareerDifficulty } from '@/lib/balance-tuning'

const KEY = 'esim_new_career_draft_v1'
export interface NewCareerDraft {
    version: 1; managerName: string; teamId?: string; sandbox?: boolean; custom?: CustomTeamData
    /** Existing-club start options (START-06): kept so a reload starts the career the player set up. */
    difficulty?: CareerDifficulty; randomWorld?: boolean
    /** The new-game step the player was on (START-07): only 'team-select' reopens the club list. */
    step?: 'welcome' | 'team-select'
    /** The Create team wizard step (START-68): a reload reopens it once the earlier steps check out. */
    ctStep?: CreateTeamStep
    /** SMOKE-B-17: the career Create team just started; a reload reopens its roster builder instead of the wizard. */
    createdSaveId?: string
}
export const CREATE_TEAM_STEPS = ['name', 'region', 'colors', 'difficulty', 'review'] as const
export type CreateTeamStep = typeof CREATE_TEAM_STEPS[number]
export function normalizeCareerDraft(raw: unknown): NewCareerDraft | null {
    if (!raw || typeof raw !== 'object') return null
    const v = raw as Partial<NewCareerDraft>
    if (v.version !== 1 || typeof v.managerName !== 'string') return null
    const result: NewCareerDraft = { version: 1, managerName: v.managerName.slice(0, 40), sandbox: v.sandbox === true }
    if (typeof v.teamId === 'string' && v.teamId.length < 120) result.teamId = v.teamId
    if (typeof v.difficulty === 'string' && Object.hasOwn(CAREER_DIFFICULTY, v.difficulty)) result.difficulty = v.difficulty
    // NEWPLAYER-09: the switch starts on, so a player's "off" has to be kept too.
    if (typeof v.randomWorld === 'boolean') result.randomWorld = v.randomWorld
    if (v.step === 'welcome' || v.step === 'team-select') result.step = v.step
    if (typeof v.ctStep === 'string' && (CREATE_TEAM_STEPS as readonly string[]).includes(v.ctStep)) result.ctStep = v.ctStep
    if (typeof v.createdSaveId === 'string' && v.createdSaveId.length > 0 && v.createdSaveId.length < 200) result.createdSaveId = v.createdSaveId
    const c = v.custom
    if (c && typeof c.name === 'string' && typeof c.shortName === 'string' && Object.hasOwn(DIFFICULTY_SETTINGS, c.difficulty) && Object.hasOwn(REGION_INFO, c.region)) {
        const color = (s: unknown) => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s) ? s : '#3B82F6'
        result.custom = { name: c.name.slice(0, CLUB_NAME_MAX), shortName: c.shortName.slice(0, 5), difficulty: c.difficulty, region: c.region,
            logoIndex: Number.isInteger(c.logoIndex) && c.logoIndex >= 0 && c.logoIndex < 20 ? c.logoIndex : 0, primaryColor: color(c.primaryColor), secondaryColor: color(c.secondaryColor) }
        if (typeof c.logoData === 'string' && c.logoData.length <= 500000 && /^data:image\/(png|webp|jpeg);base64,/.test(c.logoData)) result.custom.logoData = c.logoData
    }
    return result
}
export function loadCareerDraft(): NewCareerDraft | null {
    try { return normalizeCareerDraft(JSON.parse(window.localStorage.getItem(KEY) || 'null')) } catch { return null }
}
export function saveCareerDraft(patch: Partial<NewCareerDraft>): boolean {
    try { const draft = normalizeCareerDraft({ version: 1, managerName: '', ...loadCareerDraft(), ...patch }); window.localStorage.setItem(KEY, JSON.stringify(draft)); return true } catch { return false }
}
export function clearCareerDraft(): void { try { window.localStorage.removeItem(KEY); window.localStorage.removeItem('pending_manager_name') } catch { /* Application saves are independent. */ } }
/**
 * START-68: the Create team step a reload may reopen. Later steps need a
 * complete name step (manager name, club name, a 2–5 character tag); else
 * the wizard starts at the name step.
 */
export function restorableCreateTeamStep(draft: Pick<NewCareerDraft, 'managerName' | 'custom' | 'ctStep'> | null): CreateTeamStep {
    const step = draft?.ctStep ?? 'name'
    const c = draft?.custom
    const nameStepDone = !!c && draft!.managerName.trim().length >= 2 && c.name.trim().length >= 2 && c.shortName.length >= 2 && c.shortName.length <= 5
    return nameStepDone ? step : 'name'
}
