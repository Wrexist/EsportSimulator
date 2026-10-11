// Streaming skeleton for the save list — header line, then table rows.

export default function LoadGameLoading() {
    return (
        <div className="mx-auto max-w-[1280px] space-y-5" aria-busy="true">
            <div className="h-10 w-48 animate-pulse rounded-md bg-panel" />
            <div className="overflow-hidden rounded-lg border border-line bg-panel">
                <div className="h-9 border-b border-line bg-raised" />
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-16 border-b border-line last:border-b-0" />
                ))}
            </div>
        </div>
    )
}
