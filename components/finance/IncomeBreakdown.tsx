import { t } from "@/lib/i18n"
import { Meter } from '@/src/components/ui/Meter'
import { formatCurrency } from '@/lib/utils-extended'
import { cn } from '@/lib/utils'

export interface BreakdownRow {
    label: string
    amount: number
    /** One quiet line on where the number comes from. */
    note?: string
}

/** Rows of money with their share of the group total — the settlement breakdown. */
export function MoneyBreakdown({ rows, total, tone }: { rows: BreakdownRow[]; total: number; tone: 'income' | 'expense' }) {
    return (
        <dl className="divide-y divide-line">
            {rows.map(({ label, amount, note }) => {
                const share = total > 0 ? Math.max(0, Math.min(100, amount / total * 100)) : 0
                return (
                    <div key={label} className="grid grid-cols-[minmax(0,1fr)_64px_92px] items-center gap-3 py-2">
                        <dt className="min-w-0">
                            <span className="block truncate text-sm text-ink-1">{label}</span>
                            {/* MARKET-18: the note wraps; the reputation factor sat past the cut. */}
                            {note && <span className="block text-xs leading-snug text-ink-3 [overflow-wrap:anywhere]">{note}</span>}
                        </dt>
                        <Meter value={share} label={t(tone === "income" ? "fin.shareIncome" : "fin.shareExpense", { label })} tone="neutral" showValue={false} trackClassName="w-16" />
                        <dd className={cn('text-right text-sm tabular-nums', tone === 'income' && amount > 0 ? 'text-positive' : 'text-ink-1')}>
                            {formatCurrency(amount, '$', false)}
                        </dd>
                    </div>
                )
            })}
        </dl>
    )
}

export function IncomeBreakdown({ income }: { income: { sponsors: number; fanbaseBonus: number; leagueShare?: number; total: number } }) {
    return (
        <MoneyBreakdown
            tone="income"
            total={income.total}
            rows={[
                { label: t("fin.sponsorPayments"), amount: income.sponsors },
                { label: t("fin.fanIncome"), amount: income.fanbaseBonus },
                { label: t("fin.in.league"), amount: income.leagueShare ?? 0 },
            ]}
        />
    )
}
