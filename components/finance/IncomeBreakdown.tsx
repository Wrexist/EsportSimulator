import { Progress } from '@/components/ui/progress'
import { formatCurrency } from '@/lib/utils-extended'

export function IncomeBreakdown({ income }: { income: { sponsors: number; fanbaseBonus: number; leagueShare?: number; total: number } }) {
    const rows = [
        ['Sponsorship payments', income.sponsors],
        ['Fan income', income.fanbaseBonus],
        ['League revenue share', income.leagueShare ?? 0],
    ] as const
    return <div className="space-y-4">
        {rows.map(([label, amount]) => <div key={label} className="space-y-2">
            <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-bold text-green-400">{formatCurrency(amount, '$', false)}</span>
            </div>
            <Progress aria-label={`${label} as a share of projected income`} value={income.total > 0 ? Math.max(0, Math.min(100, amount / income.total * 100)) : 0} className="h-1 bg-green-500/10" />
        </div>)}
    </div>
}
