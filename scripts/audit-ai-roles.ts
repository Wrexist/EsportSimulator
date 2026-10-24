/**
 * G5 audit: do AI clubs field a balanced five over a long campaign?
 *
 * Runs the real world from the snapshot (player club = lowest ranked, left
 * alone) and reports, at the start and every 26 weeks, for the top-10 AI
 * clubs and for all AI clubs: role labels in the starting five (the first
 * five on the roster), players in the five who fit the AWPer profile, and
 * whether the club's AWPer / IGL is in the five or on the bench.
 *
 *   npx tsx scripts/audit-ai-roles.ts [--weeks 104]
 */
import path from "node:path"
import { SnapshotLoader } from "../data/snapshot-loader"
import { AtomicWeekProcessor } from "../engine/atomic-week-processor"
import { SaveManager } from "../engine/save-manager"
import { SeededRNG } from "../engine/rng"
import { TournamentManager } from "../engine/tournament-manager"
import { AIManager } from "../engine/ai-manager"
import { missingRoles } from "../engine/match/round-sim/team-edge"
import type { AsyncStorage } from "../engine/storage-adapter"
import type { GameSave, PlayerSaveData } from "../engine/save-types"

class InMemoryStorage implements AsyncStorage {
    private data = new Map<string, string>()
    async getItem(key: string) { return this.data.get(key) ?? null }
    async setItem(key: string, value: string) { this.data.set(key, value) }
    async removeItem(key: string) { this.data.delete(key) }
    async clear() { this.data.clear() }
    async getAllKeys() { return [...this.data.keys()] }
}

const arg = (name: string, fallback: number) => {
    const i = process.argv.indexOf(`--${name}`)
    return i >= 0 ? Number(process.argv[i + 1]) : fallback
}

/** The reconciler's AWPer profile: AWP over 70 and above the player's rifle firepower. */
const awpProfile = (p: PlayerSaveData) => (p.awp || 0) > 70 && (p.awp || 0) > ((p.skill || 0) + (p.rifle || 0)) / 2

function report(save: GameSave, label: string) {
    const byId = new Map(save.players.map(p => [p.id, p]))
    const ai = save.teams.filter(t => t.id !== save.playerTeamId && t.rosterIds.length >= 5)
    const top = [...ai].sort((a, b) => (a.worldRanking ?? 999) - (b.worldRanking ?? 999)).slice(0, 10)
    const stats = (teams: typeof ai) => {
        let twoAwpProfiles = 0, awperBenched = 0, iglBenched = 0, noAwper = 0, noIgl = 0, missing = 0
        for (const t of teams) {
            const roster = t.rosterIds.map(id => byId.get(id)).filter((p): p is PlayerSaveData => !!p)
            const five = roster.slice(0, 5)
            if (five.filter(awpProfile).length >= 2) twoAwpProfiles++
            const awper = roster.find(p => p.role === "AWPER"), igl = roster.find(p => p.role === "IGL")
            if (!awper) noAwper++
            else if (!five.includes(awper)) awperBenched++
            if (!igl) noIgl++
            else if (!five.includes(igl)) iglBenched++
            missing += missingRoles(five)
        }
        return { clubs: teams.length, twoAwpProfiles, noAwper, awperBenched, noIgl, iglBenched, avgMissingRoles: +(missing / Math.max(1, teams.length)).toFixed(2) }
    }
    console.log(`\n== ${label} (week ${save.currentWeek})`)
    console.log("top 10:", JSON.stringify(stats(top)))
    console.log("all AI:", JSON.stringify(stats(ai)))
    for (const t of top) {
        const five = t.rosterIds.slice(0, 5).map(id => byId.get(id))
        console.log(`  #${t.worldRanking} ${t.name}: ${five.map(p => `${p?.nickname}(${p?.role}${p && awpProfile(p) ? "*" : ""})`).join(" ")}${t.rosterIds.length > 5 ? ` | bench ${t.rosterIds.slice(5).map(id => `${byId.get(id)?.nickname}(${byId.get(id)?.role})`).join(" ")}` : ""}`)
    }
}

async function main() {
    const weeks = arg("weeks", 104)
    const loader = new SnapshotLoader(path.join(process.cwd(), "public/data/snapshot"))
    if (!(await loader.loadSnapshot()).success) throw new Error("snapshot")
    const teams = loader.getSnapshot()!.teams as unknown as { id: string; reputation: number }[]
    const low = [...teams].sort((a, b) => a.reputation - b.reputation)[0]
    const save = loader.createCareerFromSnapshot("RoleAudit", low.id, 1)!
    AIManager.initializeTeamData(save)
    const processor = new AtomicWeekProcessor(new SaveManager(new InMemoryStorage()))
    report(save, "start")
    const log = console.log, warn = console.warn
    for (let i = 1; i <= weeks; i++) {
        console.log = () => {}; console.warn = () => {}
        const rng = new SeededRNG(save.lastRngSeed)
        TournamentManager.simulateWeeklyRegistrationsV2(save, save.currentWeek, rng)
        const result = await processor.processWeek(save, { playerTeamId: save.playerTeamId, trainingFocus: new Map() as never }, rng)
        console.log = log; console.warn = warn
        if (!result.success) throw new Error(result.error)
        if (i % 26 === 0) report(save, `after ${i} weeks`)
    }
}

main().catch(e => { console.error(e); process.exit(1) })
