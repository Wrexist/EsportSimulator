import fs from "node:fs"
import path from "node:path"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { createLaunchFixture } from "./fixtures"
import { FinanceProcessor } from "../../engine/processors/finance-processor"
import { forecastFinances } from "../../engine/finance-forecast"
import { processWeeklySponsorGoals } from "../../engine/processors/sponsor-goals-processor"
import { buildSaveSnapshot, type SaveSnapshotState } from "../../store/utils/build-save-snapshot"

const root = process.cwd()
const checks = []
for (const distressed of [false, true]) {
    let save = createLaunchFixture("season-boundary")
    let team = save.teams.find(t => t.id === save.playerTeamId)!
    team.sponsors = [{ id: "l15-sponsor", name: "QA Sponsor", tier: "STANDARD", requirements: "None", weeklyPayout: 80000, remainingWeeks: 2, goals: [] }]
    if (distressed) {
        team.budget = 1000
        for (const c of save.contracts.filter(c => c.teamId === team.id)) c.salaryPerWeek = 100000
    }
    const opening = team.budget
    const projection = forecastFinances(team, save.players, save.contracts, save.staff, save.currentWeek, 12)
    let settled = 0
    for (let i = 0; i < 52 && !save.gameOverReason; i++) {
        save.currentWeek++
        FinanceProcessor.processContractExpiry(save, save.playerTeamId)
        const summary = FinanceProcessor.processFinance(save, save.playerTeamId)
        if (i < projection.length) assert.equal(team.budget, projection[i].budget)
        processWeeklySponsorGoals(save)
        const snapshot = JSON.parse(JSON.stringify(buildSaveSnapshot(save as unknown as SaveSnapshotState)))
        const before = JSON.stringify(snapshot)
        assert.deepEqual(FinanceProcessor.processFinance(snapshot, save.playerTeamId), summary)
        assert.equal(JSON.stringify(snapshot), before)
        save = snapshot
        team = save.teams.find(t => t.id === save.playerTeamId)!
        settled++
    }
    let balance = opening
    const rows = save.financeLedger.filter(e => e.teamId === team.id)
    for (const e of rows) {
        balance += e.type === "INCOME" ? e.amount : -e.amount
        assert.equal(e.balance, balance)
    }
    assert.equal(balance, team.budget)
    assert.equal(new Set(rows.map(e => e.id)).size, rows.length)
    if (distressed) {
        assert.equal(settled, 8)
        assert.equal(save.gameOverReason, "BANKRUPTCY")
        assert.ok(save.eventsLog.some(e => e.type === "BUDGET_WARNING"))
    } else assert.equal(settled, 52)
    checks.push({ scenario: distressed ? "synthetic-distress-500k-weekly-wages" : "synthetic-stable", seed: 3402, startWeek: 52, settledWeeks: settled, opening, closing: team.budget, ledgerRows: rows.length, endWeek: save.currentWeek, gameOver: save.gameOverReason ?? null, ledgerSha256: createHash("sha256").update(JSON.stringify(rows)).digest("hex"), replayAndCanonicalRoundtrip: true })
}
const ownerFiles = ["mirage-user-v12-2026-09-13.json", "mirage-user-areas-2026-09-13.json"].map(file => ({ file, sha256: createHash("sha256").update(fs.readFileSync(path.join(root, "public/map-studio/drafts", file))).digest("hex") }))
const report = { passed: true, node: process.version, platform: process.platform, fixture: "createLaunchFixture season-boundary seed 3402, explicit financial-only scenario", scope: "Recurring finance/expiry/sponsor processing and canonical save replay, not a complete career or packaged acceptance run", checks, ownerFiles }
fs.writeFileSync(path.join(root, "docs/launch-readiness/evidence/L15-finance-runtime.json"), JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify(report, null, 2))
