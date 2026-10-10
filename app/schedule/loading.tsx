// Streaming skeleton for the schedule: header line, then the week grid.

export default function ScheduleLoading() {
    return (
        <div className="space-y-4" aria-busy="true">
            <div className="h-10 w-56 animate-pulse rounded-md bg-panel" />
            <div className="overflow-hidden rounded-lg border border-line bg-panel">
                <div className="h-11 border-b border-line bg-raised" />
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="grid h-[104px] grid-cols-[200px_repeat(7,minmax(0,1fr))] border-b border-line last:border-b-0">
                        {Array.from({ length: 8 }).map((__, j) => (
                            <div key={j} className="border-l border-line first:border-l-0" />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    )
}
