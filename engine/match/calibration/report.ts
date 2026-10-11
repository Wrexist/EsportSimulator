/**
 * Text renderings of a calibration report: console table, markdown and a
 * side-by-side comparison of two saved reports. Pure string builders; the
 * CLI (scripts/calibrate-engine.ts) does the I/O.
 */

import type { CalibrationReport, MetricResult } from './run'
import { GROUP_LABELS, type MetricGroup, type Status } from './targets'

const GROUP_ORDER = Object.keys(GROUP_LABELS) as MetricGroup[]
const STATUS_LABEL: Record<Status, string> = { pass: 'PASS', warn: 'warn', fail: 'FAIL', 'n/a': 'n/a', info: 'info' }

export function formatValue(m: Pick<MetricResult, 'value' | 'unit' | 'ci'>): string {
    if (m.value === null) return '—'
    const v = m.value
    switch (m.unit) {
        case '%': return `${v.toFixed(1)}%`
        case 'pts': return `${v > 0 ? '+' : ''}${v.toFixed(1)}${m.ci !== undefined ? ` ±${m.ci.toFixed(1)}` : ''}`
        case 'x': return `${v.toFixed(2)}×`
        case 'ms': return `${v.toFixed(2)} ms`
        case 'rating': return v.toFixed(3)
        case 'count': return Number.isInteger(v) ? String(v) : v.toFixed(1)
        default: return v.toFixed(2)
    }
}

export function summaryLine(r: Pick<CalibrationReport, 'summary'>): string {
    const s = r.summary
    const parts = [`${s.pass} pass`, `${s.warn} warn`, `${s.fail} fail`]
    if (s['n/a']) parts.push(`${s['n/a']} n/a`)
    return parts.join(' · ')
}

function grouped(metrics: readonly MetricResult[]): [MetricGroup, MetricResult[]][] {
    return GROUP_ORDER.map(g => [g, metrics.filter(m => m.group === g)] as [MetricGroup, MetricResult[]]).filter(([, ms]) => ms.length > 0)
}

function header(r: CalibrationReport): string {
    const secs = (r.durationMs / 1000).toFixed(1)
    return `Engine calibration · ${r.engine} · samples ${r.samples} · seed ${r.seed} · ${r.mapsSimulated.toLocaleString('en-US')} maps in ${secs} s`
}

const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length))

/** Fixed-width console table: metric | value | target | status, grouped by section. */
export function formatTable(r: CalibrationReport): string {
    if (!r.available) return `Engine calibration · ${r.engine}: not available — ${r.reason ?? 'engine not runnable'}`
    const lines = [header(r), '']
    const w = { id: 27, label: 46, value: 16, target: 40 }
    lines.push(`  ${pad('metric', w.id)} ${pad('', w.label)} ${pad('value', w.value)} ${pad('target', w.target)} status`)
    for (const [group, ms] of grouped(r.metrics)) {
        lines.push('', GROUP_LABELS[group])
        for (const m of ms) {
            const label = m.label.length > w.label ? m.label.slice(0, w.label - 1) + '…' : m.label
            const extra = m.detail ? `  (${m.detail})` : ''
            lines.push(`  ${pad(m.id, w.id)} ${pad(label, w.label)} ${pad(formatValue(m), w.value)} ${pad(m.target, w.target)} ${STATUS_LABEL[m.status]}${extra}`)
        }
    }
    if (r.skillCurve.length) {
        lines.push('', 'Skill curve (favourite map win %: pooled · managed · AI)')
        for (const c of r.skillCurve) lines.push(`  +${String(c.gap).padEnd(3)} ${fmtPct(c.favWin)} · ${fmtPct(c.managed)} · ${fmtPct(c.ai)}  (n=${c.n})`)
    }
    const violations = Object.entries(r.violations)
    if (violations.length) {
        lines.push('', 'Impossible states')
        for (const [what, n] of violations) lines.push(`  ${String(n).padStart(6)}  ${what}`)
    }
    lines.push('', `Summary: ${summaryLine(r)}`)
    return lines.join('\n')
}

const fmtPct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}%`)

/** Human-readable markdown report (docs/revamp/calibration/<engine>.md). */
export function formatMarkdown(r: CalibrationReport, opts: { command?: string; date?: string } = {}): string {
    const out: string[] = [`# Engine calibration — ${r.engine}`, '']
    if (!r.available) {
        out.push(`Not available: ${r.reason ?? 'engine not runnable'}.`, '')
        return out.join('\n')
    }
    const meta = [
        opts.date ? `Run ${opts.date}` : undefined,
        `harness v${r.harnessVersion}`,
        `seed ${r.seed}`,
        `${r.mapsSimulated.toLocaleString('en-US')} BO1 maps through the production series paths (managed + AI)`,
        `${(r.durationMs / 1000).toFixed(1)} s`,
    ].filter(Boolean).join(' · ')
    out.push(meta + '.', '')
    if (opts.command) out.push(`Reproduce: \`${opts.command}\``, '')
    out.push(
        'Targets and bands: `engine/match/calibration/targets.ts`. Reference values are approximate',
        '(audit 2026-10-09 benchmarks where available, otherwise estimates or design intent — see Source).',
        'Agency rows are paired map-win deltas in points (±95% CI) against an even 70 v 70 baseline;',
        'they must be non-zero, point the expected way and stay bounded.',
        '',
        `Sample: ${describeSuites(r.suites)}.`,
        '',
        `**Summary:** ${summaryLine(r)}`,
    )
    const off = r.metrics.filter(m => m.status === 'fail' || m.status === 'warn')
    if (off.length) {
        out.push('', '**Outside the pass band:**', '')
        for (const status of ['fail', 'warn'] as const) {
            const ms = off.filter(m => m.status === status)
            if (ms.length) out.push(`- ${STATUS_LABEL[status]}: ${ms.map(m => `\`${m.id}\` ${formatValue(m)}`).join(', ')}`)
        }
    }
    for (const [group, ms] of grouped(r.metrics)) {
        out.push('', `## ${GROUP_LABELS[group]}`, '', '| Metric | Value | Target | Status | Source |', '|---|---|---|---|---|')
        for (const m of ms) {
            const value = formatValue(m) + (m.detail ? `<br><sub>${m.detail}</sub>` : '')
            out.push(`| ${cell(m.label)} \`${m.id}\` | ${cell(value)} | ${cell(m.target)} | ${STATUS_LABEL[m.status]} | ${shortSource(m.source)} |`)
        }
    }
    if (r.skillCurve.length) {
        out.push('', '## Skill curve detail', '', '| Gap | Favourite map win | Managed path | AI path | n |', '|---|---|---|---|---|')
        for (const c of r.skillCurve) out.push(`| +${c.gap} | ${fmtPct(c.favWin)} | ${fmtPct(c.managed)} | ${fmtPct(c.ai)} | ${c.n} |`)
    }
    const violations = Object.entries(r.violations)
    out.push('', '## Impossible states', '')
    if (!violations.length) out.push('None.')
    else for (const [what, n] of violations) out.push(`- ${n} × ${what}`)
    out.push('')
    return out.join('\n')
}

const cell = (s: string) => s.replace(/\|/g, '\\|')

function describeSuites(suites: CalibrationReport['suites']): string {
    const parts: string[] = []
    if (suites.realism) parts.push(`realism ${suites.realism} maps (equal teams, managed/AI alternating)`)
    if (suites.skill) parts.push(`skill ${suites.skill} seeds per gap, each on both paths`)
    if (suites.star) parts.push(`star ${suites.star} maps`)
    if (suites.agency) parts.push(`agency ${suites.agency} paired seeds per decision`)
    if (suites.cap) parts.push(`cap ${suites.cap} paired seeds per path`)
    return parts.join('; ')
}

function shortSource(source: string): string {
    if (source.startsWith('Audit')) return 'audit'
    if (source.startsWith('Estimate')) return 'estimate'
    if (source.startsWith('Design')) return 'design'
    if (source.startsWith('Hard')) return 'rule'
    if (source.startsWith('HLTV')) return 'HLTV'
    if (source.startsWith('Derived')) return 'derived'
    return 'measured'
}

/** Side-by-side comparison of two reports (e.g. legacy-v2 vs script-v1). */
export function formatComparison(a: CalibrationReport, b: CalibrationReport): string {
    const lines = [`Compare  A = ${a.engine} (samples ${a.samples}, seed ${a.seed})  ·  B = ${b.engine} (samples ${b.samples}, seed ${b.seed})`, '']
    if (!a.available || !b.available) lines.push(`Note: ${!a.available ? 'A' : 'B'} was not available.`, '')
    const byId = new Map(b.metrics.map(m => [m.id, m]))
    const w = { id: 27, value: 16 }
    lines.push(`  ${pad('metric', w.id)} ${pad('A', w.value)} ${pad('B', w.value)} ${pad('Δ', 10)} status A → B`)
    let better = 0, worse = 0
    const rank: Record<Status, number> = { pass: 2, warn: 1, fail: 0, 'n/a': -1, info: -1 }
    for (const [group, ms] of grouped(a.metrics)) {
        lines.push('', GROUP_LABELS[group])
        for (const ma of ms) {
            const mb = byId.get(ma.id)
            const delta = mb && ma.value !== null && mb.value !== null ? mb.value - ma.value : null
            const d = delta === null ? '—' : `${delta > 0 ? '+' : ''}${Math.abs(delta) >= 10 ? delta.toFixed(1) : delta.toFixed(2)}`
            const sb = mb?.status ?? 'n/a'
            if (rank[sb] >= 0 && rank[ma.status] >= 0) { if (rank[sb] > rank[ma.status]) better++; if (rank[sb] < rank[ma.status]) worse++ }
            const moved = sb !== ma.status ? '  *' : ''
            lines.push(`  ${pad(ma.id, w.id)} ${pad(formatValue(ma), w.value)} ${pad(mb ? formatValue(mb) : '—', w.value)} ${pad(d, 10)} ${STATUS_LABEL[ma.status]} → ${STATUS_LABEL[sb]}${moved}`)
        }
    }
    lines.push('', `A: ${summaryLine(a)}`, `B: ${summaryLine(b)}`, `Status changes: ${better} better, ${worse} worse`)
    return lines.join('\n')
}
