// Streaming skeleton for the community database page.
export default function Loading() {
    return (
        <div className="mx-auto max-w-[960px] space-y-4" aria-busy="true">
            <div className="h-10 w-64 animate-pulse rounded-md bg-panel" />
            <div className="h-40 rounded-lg border border-line bg-panel" />
            <div className="h-64 rounded-lg border border-line bg-panel" />
        </div>
    )
}
