import { formatCurrency } from "@/lib/utils-extended"

export interface CashPoint {
    week: number
    /** Closing balance that week. */
    balance: number
    /** Income minus expenses that week. */
    net: number
    projected: boolean
}

const W = 760
const LINE_H = 150
const BAR_H = 64
const GAP = 22
const PAD_L = 56
const PAD_R = 12
const PAD_T = 10
const H = PAD_T + LINE_H + GAP + BAR_H + 22

const short = (v: number) => formatCurrency(v, "$", true)

/**
 * Balance (gold line) over weekly net (neutral bars), history solid and
 * projection dashed/lighter, sharing one week axis. Plain SVG: no chart lib.
 */
export function CashChart({ points, nowWeek }: { points: CashPoint[]; nowWeek: number }) {
    if (points.length < 2) return <p className="py-10 text-center text-sm text-ink-3">Not enough weeks to chart yet.</p>

    const n = points.length
    const plotW = W - PAD_L - PAD_R
    const step = plotW / n
    const x = (i: number) => PAD_L + step * i + step / 2

    const balances = points.map(p => p.balance)
    const minB = Math.min(...balances)
    const maxB = Math.max(...balances)
    // Zero stays on the axis when the balance gets near or below it; otherwise
    // the axis frames the actual range so the trend is readable.
    const includeZero = minB <= 0 || minB < maxB * 0.25
    const dataLo = includeZero ? Math.min(0, minB) : minB
    const dataHi = Math.max(dataLo + 1, maxB)
    const pad = (dataHi - dataLo) * 0.1
    const hi = dataHi + pad
    const lo = includeZero && dataLo === 0 ? 0 : dataLo - pad
    const yB = (v: number) => PAD_T + LINE_H - ((v - lo) / (hi - lo)) * LINE_H

    const maxNet = Math.max(1, ...points.map(p => Math.abs(p.net)))
    const barTop = PAD_T + LINE_H + GAP
    const barMid = barTop + BAR_H / 2
    const yN = (v: number) => barMid - (v / maxNet) * (BAR_H / 2)

    const firstProjected = points.findIndex(p => p.projected)
    const historyEnd = firstProjected === -1 ? n : firstProjected
    const pathFrom = (from: number, to: number) => points.slice(from, to)
        .map((p, i) => `${i === 0 ? "M" : "L"}${x(i + from).toFixed(1)},${yB(p.balance).toFixed(1)}`).join(" ")

    const ticks = [dataHi, (dataHi + dataLo) / 2, dataLo].map(v => Math.round(v))
    const nowIndex = points.findIndex(p => p.week === nowWeek)
    const labelEvery = n > 16 ? 4 : 2

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Club balance by week, with weekly net below; projected weeks are dashed">
            {ticks.map((t, i) => (
                <g key={i}>
                    <line x1={PAD_L} x2={W - PAD_R} y1={yB(t)} y2={yB(t)} className="stroke-line" />
                    <text x={PAD_L - 8} y={yB(t) + 4} textAnchor="end" fontSize="11" className="fill-ink-3">{short(t)}</text>
                </g>
            ))}
            {dataLo < 0 && <line x1={PAD_L} x2={W - PAD_R} y1={yB(0)} y2={yB(0)} className="stroke-negative" strokeOpacity="0.5" strokeDasharray="3 3" />}

            {nowIndex >= 0 && (
                <g>
                    <line x1={x(nowIndex)} x2={x(nowIndex)} y1={PAD_T} y2={barTop + BAR_H} className="stroke-line-strong" />
                    <text x={x(nowIndex) + 5} y={PAD_T + 10} fontSize="11" className="fill-ink-2">Now</text>
                </g>
            )}

            {historyEnd > 1 && <path d={pathFrom(0, historyEnd)} fill="none" className="stroke-gold" strokeWidth="2" strokeLinejoin="round" />}
            {firstProjected !== -1 && <path d={pathFrom(Math.max(0, firstProjected - 1), n)} fill="none" className="stroke-gold" strokeWidth="2" strokeDasharray="5 4" strokeOpacity="0.8" />}
            {points.map((p, i) => (
                <circle key={i} cx={x(i)} cy={yB(p.balance)} r={i === nowIndex ? 3.5 : 2.2} strokeWidth="1.5" className={p.projected ? "fill-panel stroke-gold" : "fill-gold stroke-gold"}>
                    <title>{`Week ${p.week}${p.projected ? " (projected)" : ""}: ${formatCurrency(p.balance, "$", false)}`}</title>
                </circle>
            ))}

            <text x={PAD_L - 8} y={barMid + 4} textAnchor="end" fontSize="11" className="fill-ink-3">Net</text>
            <line x1={PAD_L} x2={W - PAD_R} y1={barMid} y2={barMid} className="stroke-line-strong" />
            {points.map((p, i) => {
                const top = Math.min(yN(p.net), barMid)
                const h = Math.max(1, Math.abs(yN(p.net) - barMid))
                return (
                    <rect
                        key={i}
                        x={x(i) - step * 0.22}
                        y={top}
                        width={step * 0.44}
                        height={h}
                        rx="1.5"
                        className={p.net < 0 ? "fill-negative" : "fill-ink-2"}
                        fillOpacity={p.projected ? 0.2 : 0.55}
                    >
                        <title>{`Week ${p.week}${p.projected ? " (projected)" : ""}: net ${formatCurrency(p.net, "$", false)}`}</title>
                    </rect>
                )
            })}

            {points.map((p, i) => (i % labelEvery === 0 || i === nowIndex) && (
                <text key={i} x={x(i)} y={H - 4} textAnchor="middle" fontSize="11" className={i === nowIndex ? "fill-ink-2" : "fill-ink-3"}>W{p.week}</text>
            ))}
        </svg>
    )
}
