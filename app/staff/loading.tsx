// Streaming skeleton for the staff page: header, then two table panels.

export default function StaffLoading() {
    return (
        <div role="status" aria-label="Loading staff" className="mx-auto max-w-[1600px] space-y-6">
            <div className="h-10 w-48 animate-pulse rounded bg-raised" />
            <div className="h-40 animate-pulse rounded-lg border border-line bg-panel" />
            <div className="h-96 animate-pulse rounded-lg border border-line bg-panel" />
        </div>
    )
}
