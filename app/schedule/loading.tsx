// Streaming skeleton for the schedule page. Renders instantly while the
// heavy schedule grid + tournament filters JS chunk hydrates.

export default function ScheduleLoading() {
    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div className="h-8 w-48 rounded-lg bg-white/[0.04] animate-pulse" />
                <div className="h-9 w-32 rounded-lg bg-white/[0.04] animate-pulse" />
            </div>
            <div className="grid grid-cols-7 gap-3">
                {Array.from({ length: 21 }).map((_, i) => (
                    <div
                        key={i}
                        className="h-32 rounded-xl bg-white/[0.02] border border-white/5 animate-pulse"
                        style={{ animationDelay: `${i * 20}ms` }}
                    />
                ))}
            </div>
        </div>
    )
}
