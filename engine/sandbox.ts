/**
 * Sandbox editor for one save (C9).
 *
 * Off by default. Turning it on is permanent for the save: from then on the
 * save earns no Steam achievements, stats or leaderboard scores
 * (SteamService.setSandboxed), and its slot carries a Sandbox badge. With it
 * on, the manager can edit the club's money, any player's attributes, age,
 * names and contract, and any club's name and tag.
 *
 * Every edit is validated and clamped here, and logged on the save. Engine
 * safe: no store, no React.
 */
import type { ContractSaveData, PlayerSaveData, TeamSaveData } from "./save-types"
import { JOIN_REF, NUMBER_REF, tRefEn, type TextRef } from "@/lib/i18n"

export interface SandboxState {
    /** Week the editor was turned on. */
    enabledWeek: number
    /** Edits made so far. */
    edits: number
    /** The most recent edits, newest first (SANDBOX_LOG_LENGTH); `whatRef` shows it in the active language (I18N-08). */
    log: { week: number; what: string; whatRef?: TextRef }[]
}

export const SANDBOX_LOG_LENGTH = 30
export const SANDBOX_MAX_BUDGET = 1_000_000_000
export const SANDBOX_MAX_SALARY = 10_000_000
export const SANDBOX_MAX_CONTRACT_WEEKS = 52 * 10

/** Player attributes the editor offers (0–100), grouped as the player page shows them. */
export const SANDBOX_ATTRIBUTES = [
    ["Aim", ["skill", "rifle", "awp", "pistol", "reaction", "clutch"]],
    ["Mind", ["tactic", "leader", "teamwork", "creativity", "grenades", "stressResistance"]],
    ["Body and condition", ["health", "endurance", "form", "morale", "fatigue", "potential"]],
] as const

export type SandboxAttribute = typeof SANDBOX_ATTRIBUTES[number][1][number]
export const SANDBOX_ATTRIBUTE_KEYS: readonly SandboxAttribute[] = SANDBOX_ATTRIBUTES.flatMap(([, keys]) => [...keys]) as SandboxAttribute[]

export const ATTRIBUTE_LABEL: Record<SandboxAttribute, string> = {
    skill: "Skill", rifle: "Rifle", awp: "AWP", pistol: "Pistol", reaction: "Reaction", clutch: "Clutch",
    tactic: "Tactics", leader: "Leadership", teamwork: "Teamwork", creativity: "Creativity", grenades: "Utility", stressResistance: "Composure",
    health: "Health", endurance: "Endurance", form: "Form", morale: "Morale", fatigue: "Fatigue", potential: "Potential",
}

export interface SandboxTarget {
    currentWeek: number
    sandbox?: SandboxState
    teams: TeamSaveData[]
    players: PlayerSaveData[]
    contracts: ContractSaveData[]
}

export type SandboxEdit =
    | { kind: "money"; teamId: string; budget: number }
    | { kind: "player"; playerId: string; attributes?: Partial<Record<SandboxAttribute, number>>; age?: number; nickname?: string; name?: string }
    | { kind: "contract"; playerId: string; salaryPerWeek?: number; endWeek?: number }
    | { kind: "team"; teamId: string; name?: string; shortName?: string }

/** `what` / `reason` in English (logs, tests); the refs show them in the active language (I18N-08). */
export type SandboxResult = { ok: true; what: string; whatRef: TextRef } | { ok: false; reason: string; reasonRef: TextRef }

/** The translation key of an attribute's name, as the player page names it. */
export function sandboxAttrKey(k: SandboxAttribute): string {
    return k === "form" || k === "morale" || k === "fatigue" || k === "potential" ? `sb.attr.${k}` : `attr.${k}`
}

/** A refusal, in English and as a translation key. */
export function sandboxRefusal(key: string): { ok: false; reason: string; reasonRef: TextRef } {
    const reasonRef: TextRef = { key }
    return { ok: false, reason: tRefEn(reasonRef), reasonRef }
}

const n = (count: number): TextRef => ({ key: NUMBER_REF, count })
/** "a, b, c": the changes of one edit, kept as refs. */
const changeList = (changes: TextRef[]): TextRef => ({ key: JOIN_REF, params: { sep: ", ", ...Object.fromEntries(changes.map((c, i) => [i, c])) } })

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const cleanName = (v: unknown, max: number) => typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, "").trim().slice(0, max) : ""

/** Turn the editor on (idempotent). */
export function enableSandbox(target: Pick<SandboxTarget, "currentWeek" | "sandbox">): SandboxState {
    if (!target.sandbox) target.sandbox = { enabledWeek: target.currentWeek, edits: 0, log: [] }
    return target.sandbox
}

/** Apply one edit. Changes nothing and says why when it cannot. */
export function applySandboxEdit(target: SandboxTarget, edit: SandboxEdit): SandboxResult {
    if (!target.sandbox) return sandboxRefusal("sb.off")
    let whatRef: TextRef
    switch (edit.kind) {
        case "money": {
            const team = target.teams.find(t => t.id === edit.teamId)
            if (!team) return sandboxRefusal("svd.msg.noTeamFound")
            if (!num(edit.budget)) return sandboxRefusal("sb.err.amount")
            const budget = Math.round(clamp(edit.budget, -SANDBOX_MAX_BUDGET, SANDBOX_MAX_BUDGET))
            whatRef = { key: "sb.log.money", params: { club: team.name, from: n(Math.round(team.budget)), to: n(budget) } }
            team.budget = budget
            break
        }
        case "player": {
            const p = target.players.find(x => x.id === edit.playerId)
            if (!p) return sandboxRefusal("svd.msg.noPlayer")
            const changes: TextRef[] = []
            for (const [key, value] of Object.entries(edit.attributes ?? {})) {
                if (!SANDBOX_ATTRIBUTE_KEYS.includes(key as SandboxAttribute) || !num(value)) continue
                const v = Math.round(clamp(value, 0, 100))
                const rec = p as unknown as Record<string, number>
                if (rec[key] === v) continue
                changes.push({ key: "sb.log.attr", params: { attr: { key: sandboxAttrKey(key as SandboxAttribute) }, from: Math.round(rec[key] ?? 0), to: v } })
                rec[key] = v
            }
            if (num(edit.age)) {
                const age = Math.round(clamp(edit.age, 15, 45))
                if (age !== p.age) { changes.push({ key: "sb.log.age", params: { from: p.age, to: age } }); p.age = age }
            }
            const nick = cleanName(edit.nickname, 24)
            if (edit.nickname !== undefined && nick && nick !== p.nickname) { changes.push({ key: "sb.log.nickname", params: { name: nick } }); p.nickname = nick }
            const name = cleanName(edit.name, 48)
            if (edit.name !== undefined && name && name !== p.name) { changes.push({ key: "sb.log.name", params: { name } }); p.name = name }
            if (!changes.length) return sandboxRefusal("sb.err.nothing")
            whatRef = { key: "sb.log.player", params: { name: p.nickname, changes: changeList(changes) } }
            break
        }
        case "contract": {
            const p = target.players.find(x => x.id === edit.playerId)
            const c = target.contracts.find(x => x.playerId === edit.playerId && x.endWeek > target.currentWeek)
            if (!p || !c) return sandboxRefusal("sb.noContract")
            const changes: TextRef[] = []
            if (num(edit.salaryPerWeek)) {
                const wage = Math.round(clamp(edit.salaryPerWeek, 0, SANDBOX_MAX_SALARY))
                if (wage !== c.salaryPerWeek) { changes.push({ key: "sb.log.wage", params: { from: n(c.salaryPerWeek), to: n(wage) } }); c.salaryPerWeek = wage }
            }
            if (num(edit.endWeek)) {
                const end = Math.round(clamp(edit.endWeek, target.currentWeek + 1, target.currentWeek + SANDBOX_MAX_CONTRACT_WEEKS))
                if (end !== c.endWeek) { changes.push({ key: "sb.log.ends", params: { from: c.endWeek, to: end } }); c.endWeek = end }
            }
            if (!changes.length) return sandboxRefusal("sb.err.nothing")
            whatRef = { key: "sb.log.contract", params: { name: p.nickname, changes: changeList(changes) } }
            break
        }
        case "team": {
            const team = target.teams.find(t => t.id === edit.teamId)
            if (!team) return sandboxRefusal("svd.msg.noTeamFound")
            const changes: TextRef[] = []
            const name = cleanName(edit.name, 40)
            if (edit.name !== undefined && name && name !== team.name) { changes.push({ key: "sb.log.clubName", params: { from: team.name, to: name } }); team.name = name }
            const tag = cleanName(edit.shortName, 5).toUpperCase()
            if (edit.shortName !== undefined && tag && tag !== team.shortName) { changes.push({ key: "sb.log.tag", params: { tag } }); team.shortName = tag }
            if (!changes.length) return sandboxRefusal("sb.err.nothing")
            whatRef = { key: "sb.log.club", params: { changes: changeList(changes) } }
            break
        }
        default:
            return sandboxRefusal("svd.msg.unknownError")
    }
    const what = tRefEn(whatRef)
    const s = target.sandbox
    s.edits++
    s.log = [{ week: target.currentWeek, what, whatRef }, ...s.log].slice(0, SANDBOX_LOG_LENGTH)
    return { ok: true, what, whatRef }
}
