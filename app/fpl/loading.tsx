// Streaming skeleton for the FPL leaderboard page.

export default function FplLoading() {
    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            <div className="h-8 w-32 rounded-lg bg-white/[0.04] animate-pulse" />
            <div className="rounded-xl bg-white/[0.02] border border-white/5 overflow-hidden">
                {Array.from({ length: 12 }).map((_, i) => (
                    <div
                        key={i}
                        className="h-12 border-b border-white/5 last:border-0 bg-white/[0.01] animate-pulse"
                        style={{ animationDelay: `${i * 25}ms` }}
                    />
                ))}
            </div>
        </div>
    )
}
