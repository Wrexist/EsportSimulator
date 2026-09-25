import type { VisibleStats } from '@/engine/scouting-system'

const LEVELS = ['NONE', 'BASIC', 'ADVANCED', 'EXPERT', 'ELITE'] as const

/** Shows the actual report tier, not an invented confidence percentage. */
export function ReportCoverage({ level }: { level: VisibleStats['scoutingLevel'] }) {
    const tier = LEVELS.indexOf(level)
    return <div className="report-coverage flex items-center gap-3 rounded-xl p-3 mb-4">
        <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" className="shrink-0">
            <circle cx="22" cy="22" r="17" fill="none" stroke="currentColor" strokeOpacity=".14" strokeWidth="3" />
            <circle cx="22" cy="22" r="17" fill="none" stroke="var(--cyan)" strokeWidth="3" pathLength="4" strokeDasharray={`${tier} 4`} transform="rotate(-90 22 22)" />
        </svg>
        <div><p className="text-sm font-semibold text-white">{tier ? `${level.charAt(0)}${level.slice(1).toLowerCase()} report` : 'Unscouted prospect'}</p>
            <p className="text-xs text-muted-foreground">{tier === 4 ? 'Full attribute visibility' : tier ? 'Partial report · ranges remain estimates' : 'Public estimates · scout to reveal attributes'}</p></div>
    </div>
}
