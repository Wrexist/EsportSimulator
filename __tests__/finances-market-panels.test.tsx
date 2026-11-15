/**
 * /finances fixes from the 2026-11-15 market audit:
 *   MARKET-18 the Sponsors card shows what a deal pays (base × reputation factor), base second
 *   MARKET-19 the merch upgrade states its weekly gain and payback before the button
 *   MARKET-26 staff payroll rows match player rows (h-12, portrait, link to /staff)
 *   MARKET-27 week labels on one fixed stride, anchored on "now"
 *   MARKET-28 net bars plot the weekly settlement; transfers only move the balance
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useGameStore } from '@/store/game-store'
import { createLaunchFixture } from '@/scripts/launch/fixtures'
import { EconomyEngine } from '@/engine/economy-engine'
import { CashChart, type CashPoint } from '@/components/finance/CashChart'
import FinancesPage from '@/app/finances/page'
import type { GameSave, SponsorSaveData, StaffSaveData } from '@/engine/save-types'

jest.mock('@/engine/worker/week-processor-bridge', () => ({ weekProcessorBridge: { processWeek: jest.fn() } }))
jest.mock('@/engine/manager-career-profile', () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }), usePathname: () => '/finances', useParams: () => ({}) }))

const initial = { ...useGameStore.getState() }
afterEach(() => { Object.assign(useGameStore.getInitialState(), initial); useGameStore.setState(initial as never) })

function load(save: GameSave) {
    useGameStore.setState({ ...initial, ...structuredClone(save), isLoading: false, isInitialized: true, _hasHydrated: true } as never)
    Object.assign(useGameStore.getInitialState(), useGameStore.getState())
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const dollars = (n: number) => '$' + n.toLocaleString('en-US')

function careerSave() {
    const save = createLaunchFixture('first-week')
    const team = save.teams.find(t => t.id === save.playerTeamId)!
    team.sponsors = [{ id: 'sp_w', name: 'Wagerway Esports', tier: 'STANDARD', weeklyPayout: 1752, remainingWeeks: 10, requirements: '' } as SponsorSaveData]
    team.merchStoreLevel = 1
    team.activeMerchItems = ['JERSEY']
    team.followers = 17_200
    save.financeLedger = []
    save.staff = [...save.staff, { id: 'st_coach', name: 'Mara Lind', role: 'coach', level: 2, salaryPerWeek: 900, contractEndWeek: 60, portraitPath: '/assets/staff/coach_01.webp', stats: {} } as unknown as StaffSaveData]
    team.staffIds = [...(team.staffIds ?? []), 'st_coach']
    return { save, team }
}

describe('/finances page panels', () => {
    test('MARKET-18: the sponsor card shows the paid amount, with the base second', () => {
        const { save, team } = careerSave()
        load(save)
        const html = text(renderToStaticMarkup(<FinancesPage />))
        const paid = Math.floor(1752 * EconomyEngine.sponsorReputationFactor(team.reputation))
        expect(paid).not.toBe(1752)
        expect(html).toContain(`Wagerway Esports`)
        expect(html).toContain(`${dollars(paid)} / wk`)
        expect(html).toContain(`base ${dollars(1752)}`)
    })

    test('MARKET-19: the store upgrade states its weekly gain and a payback in years when it is slow', () => {
        const { save } = careerSave()
        load(save)
        const html = text(renderToStaticMarkup(<FinancesPage />))
        const m = html.match(/Level 2 adds about \$([\d,]+)\/wk with its new line on sale: it pays for itself in ([\d.]+)y\./)
        expect(m).not.toBeNull()
        const gain = Number(m![1].replace(/,/g, ''))
        expect(gain).toBeGreaterThan(0)
        // $50,000 at a few dollars a week: decades, not weeks.
        expect(Number(m![2])).toBeCloseTo(Math.ceil(50_000 / gain) / 52, 1)
        expect(renderToStaticMarkup(<FinancesPage />)).toMatch(/text-caution[^"]*">Level 2 adds about/)
    })

    test('MARKET-26: staff payroll rows have the player row height, a portrait and a link to /staff', () => {
        const { save, team } = careerSave()
        const s = save.staff.find(x => x.id === 'st_coach' && team.staffIds?.includes(x.id))
        load(save)
        const html = renderToStaticMarkup(<FinancesPage />)
        const row = html.split('<tr').find(r => r.includes(`>${s!.name}<`))!
        expect(row).toContain('h-12')
        expect(row).toContain('href="/staff"')
        expect(row).toMatch(/<img[^>]*alt="[^"]*"/)
    })

    test('MARKET-28: a transfer week does not set the net bar; the tooltip names the one-off amount', () => {
        const { save, team } = careerSave()
        save.currentWeek = 5
        const row = (id: string, week: number, type: 'INCOME' | 'EXPENSE', category: string, amount: number, balance: number) =>
            ({ id, week, teamId: team.id, type, category, amount, description: id, balance })
        save.financeLedger = [
            row('inc_spon_3_x', 3, 'INCOME', 'SPONSOR', 3000, 103_000),
            row('exp_wage_p_3_x', 3, 'EXPENSE', 'WAGES_PLAYER', 2600, 100_400),
            row('fin_transfer_buy_sweyu', 3, 'EXPENSE', 'TRANSFER_OUT', 76_398, 24_002),
            row('inc_spon_4_x', 4, 'INCOME', 'SPONSOR', 3000, 27_002),
            row('exp_wage_p_4_x', 4, 'EXPENSE', 'WAGES_PLAYER', 2600, 24_402),
        ] as GameSave['financeLedger']
        load(save)
        const html = renderToStaticMarkup(<FinancesPage />)
        expect(html).toContain('Week 3: net $400 from the weekly settlement; -$76,398 from transfers and one-off items')
        expect(html).toContain('Week 4: net $400')
    })
})

describe('CashChart week labels (MARKET-27)', () => {
    const points = (n: number, now: number): CashPoint[] =>
        Array.from({ length: n }, (_, i) => ({ week: i + 1, balance: 50_000 + i * 100, net: 300, projected: i > now }))
    const labels = (html: string) => [...html.matchAll(/>W(\d+)</g)].map(m => Number(m[1]))

    test.each([[25, 12], [25, 13], [25, 10], [14, 5], [14, 6]])('%i points, now at index %i: one even stride through now', (n, now) => {
        const ws = labels(renderToStaticMarkup(<CashChart points={points(n, now)} nowWeek={now + 1} />))
        expect(ws).toContain(now + 1)
        const gaps = new Set(ws.slice(1).map((w, i) => w - ws[i]))
        expect(gaps.size).toBe(1)
        expect([...gaps][0]).toBe(n > 16 ? 4 : 2)
    })
})
