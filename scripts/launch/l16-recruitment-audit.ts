import fs from "node:fs"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { createLaunchFixture, FixtureStorage } from "./fixtures"
import { SaveManager } from "../../engine/save-manager"
import { canonicalWeekState } from "../../engine/worker/week-replay"
import { AIManager } from "../../engine/ai-manager"
import { SeededRNG } from "../../engine/rng"
import { FinanceProcessor } from "../../engine/processors/finance-processor"
import { processWeeklySponsorGoals } from "../../engine/processors/sponsor-goals-processor"
import { buildSaveSnapshot, type SaveSnapshotState } from "../../store/utils/build-save-snapshot"
import type { StaffSaveData } from "../../engine/save-types"

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const manager = new SaveManager(new FixtureStorage())
const browser = createLaunchFixture("first-week", 3416)
browser.saveId = "qa_l16_recruitment_3416"
browser.saveName = "L16 Recruitment QA"
browser.teams[0].name = "L16 Aurora"
browser.managerDetails = { ...browser.managerDetails, name: "L16 Recruitment QA" }
browser.staff = [{ id: "l16_scout", name: "Alex Scout", teamId: browser.playerTeamId, role: "scout", level: 4, specialization: "General", yearsRemaining: 2,
    xp: 0, xpToNextLevel: 1000, talentPoints: 0, unlockedTalentIds: [], contractEndWeek: 104,
    salaryPerWeek: 1000, stats: { accuracy: 90, scoutingSpeed: 70 } } as StaffSaveData]
browser.teams[0].staffIds = ["l16_scout"]
browser.scheduledMatches = browser.scheduledMatches.map(m => ({ ...m, week: 3, day: 6 }))
browser.watchlistedPlayerIds = ["qa_free_agent"]
const bytes = manager.exportSave(browser)
assert.ok(manager.importSave(bytes).save)
fs.mkdirSync("tmp/l16", { recursive: true })
fs.writeFileSync("tmp/l16/recruitment-ui.json", bytes)

function run(seed: number) {
    let save = createLaunchFixture("first-week", seed)
    save.scheduledMatches = []
    const template = save.players.find(p => p.id === "qa_free_agent")!
    save.players.push(...Array.from({ length: 40 }, (_, i) => ({ ...template, id: `l16_pool_${i}`, nickname: `QA Recruit ${i}`,
        role: ["RIFLER", "AWPER", "IGL", "ENTRY", "SUPPORT"][i % 5] as typeof template.role,
        age: 18 + i % 16, skill: 40 + i % 35, potential: 50 + i % 40 })))
    for (const team of save.teams.slice(1)) {
        const missing = team.rosterIds.pop()
        save.contracts = save.contracts.filter(c => c.playerId !== missing)
        team.budget = 500000
    }
    const weeks: object[] = []
    let ownershipChecks = 0
    for (let i = 0; i < 104; i++) {
        save.currentWeek++
        FinanceProcessor.processContractExpiry(save, save.playerTeamId)
        FinanceProcessor.processFinance(save, save.playerTeamId)
        const rng = new SeededRNG(save.lastRngSeed)
        AIManager.processWeeklyAI(save, save.playerTeamId, rng, true)
        AIManager.processAIToAITransfers(save, save.playerTeamId, rng)
        save.lastRngSeed = rng.getState()
        processWeeklySponsorGoals(save)
        const rosterIds = save.teams.flatMap(t => t.rosterIds)
        assert.equal(new Set(rosterIds).size, rosterIds.length, "A player has two owners")
        for (const team of save.teams) {
            assert.ok(Number.isFinite(team.budget))
            assert.ok(team.rosterIds.length <= 7)
            for (const id of team.rosterIds) {
                const contracts = save.contracts.filter(c => c.playerId === id && c.teamId === team.id && c.endWeek > save.currentWeek)
                assert.equal(contracts.length, 1, "A rostered player needs exactly one active contract")
                assert.ok(contracts[0].salaryPerWeek > 0 && Number.isInteger(contracts[0].salaryPerWeek))
                ownershipChecks++
            }
        }
        weeks.push({ week: save.currentWeek, clubs: save.teams.slice(1).map(t => ({ id: t.id, roster: t.rosterIds.length, budget: t.budget })) })
        save = JSON.parse(JSON.stringify(buildSaveSnapshot(save as unknown as SaveSnapshotState)))
    }
    const serialized = manager.exportSave(save)
    const loaded = manager.importSave(serialized).save!
    assert.ok(loaded)
    assert.deepEqual(loaded.teams.map(t => t.rosterIds), save.teams.map(t => t.rosterIds))
    const trades = save.financeLedger.filter(e => e.id.startsWith("fin_ai_transfer_"))
    assert.equal(trades.reduce((sum, row) => sum + (row.type === "INCOME" ? row.amount : -row.amount), 0), 0)
    return { seed, weeks, ownershipChecks, transferCount: save.transferHistory.length, aiTradeLedgerRows: trades.length,
        stateSha256: hash(canonicalWeekState(save)), reportSha256: hash(JSON.stringify(weeks)) }
}

const auditSeed = Number(process.argv[3] ?? 3416)
assert.ok(Number.isSafeInteger(auditSeed))
const first = run(auditSeed)
const repeat = run(auditSeed)
assert.deepEqual(first, repeat)
const financialViabilityPassed = first.weeks.every((w: any) => w.clubs.every((t: any) => t.budget >= 0 && t.roster >= 5))
const report = { passed: true, financialViabilityPassed, limitations: ["Invariants passed; financial viability remains open if any club enters debt. This is not a full-career balance acceptance."], node: process.version, platform: process.platform, scope: "104 synthetic weekly finance/expiry/AI recruitment cycles with canonical snapshot after every cycle; repeated same seed. No matches, training, full-world season calendar or packaged Steam acceptance.",
    browserFixture: { file: "tmp/l16/recruitment-ui.json", sha256: hash(bytes), seed: 3416 }, repeatedExactly: true, ...first,
    ownerMaps: ["mirage-user-v12-2026-09-13.json", "mirage-user-areas-2026-09-13.json"].map(file => ({ file, sha256: createHash("sha256").update(fs.readFileSync(`public/map-studio/drafts/${file}`)).digest("hex") })) }
fs.writeFileSync((process.argv[2] || "docs/launch-readiness/evidence/L16-recruitment-runtime.json"), JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify({ passed: true, repeatedExactly: true, weeks: first.weeks.length, ownershipChecks: first.ownershipChecks, final: first.weeks.at(-1), fixture: report.browserFixture }))
