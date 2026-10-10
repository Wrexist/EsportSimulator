// Streaming skeleton for the staff meeting page.
export default function Loading() {
    return (
        <div className="mx-auto max-w-[1280px] space-y-5" aria-busy="true">
            <div className="h-10 w-56 animate-pulse rounded-md bg-panel" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                <div className="h-72 rounded-lg border border-line bg-panel" />
                <div className="h-96 rounded-lg border border-line bg-panel" />
            </div>
        </div>
    )
}
