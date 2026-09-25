import { DIFFICULTY_SETTINGS, REGION_INFO, type CustomTeamData } from '@/types/team-creator'

const KEY = 'esim_new_career_draft_v1'
export interface NewCareerDraft { version: 1; managerName: string; teamId?: string; sandbox?: boolean; custom?: CustomTeamData }
export function normalizeCareerDraft(raw: unknown): NewCareerDraft | null {
    if (!raw || typeof raw !== 'object') return null
    const v = raw as Partial<NewCareerDraft>
    if (v.version !== 1 || typeof v.managerName !== 'string') return null
    const result: NewCareerDraft = { version: 1, managerName: v.managerName.slice(0, 40), sandbox: v.sandbox === true }
    if (typeof v.teamId === 'string' && v.teamId.length < 120) result.teamId = v.teamId
    const c = v.custom
    if (c && typeof c.name === 'string' && typeof c.shortName === 'string' && Object.hasOwn(DIFFICULTY_SETTINGS, c.difficulty) && Object.hasOwn(REGION_INFO, c.region)) {
        const color = (s: unknown) => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s) ? s : '#3B82F6'
        result.custom = { name: c.name.slice(0, 40), shortName: c.shortName.slice(0, 5), difficulty: c.difficulty, region: c.region,
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
