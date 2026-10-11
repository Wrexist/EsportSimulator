// Streaming skeleton for the tournament-detail page — mirrors the header +
// stage-overview + standings/bracket layout the page renders once data is in.

export default function TournamentDetailLoading() {
    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            {/* Header: logo + title + meta */}
            <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-xl bg-raised animate-pulse" />
                <div className="space-y-2 flex-1">
                    <div className="h-8 w-72 rounded-lg bg-raised animate-pulse" />
                    <div className="h-4 w-48 rounded bg-raised animate-pulse" />
                </div>
                <div className="h-10 w-28 rounded-xl bg-raised animate-pulse" />
            </div>

            {/* Stage strip */}
            <div className="rounded-xl bg-raised border border-line p-4 flex gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div
                        key={i}
                        className="h-12 flex-1 rounded-lg bg-raised animate-pulse"
                        style={{ animationDelay: `${i * 40}ms` }}
                    />
                ))}
            </div>

            {/* Standings table */}
            <div className="rounded-xl bg-raised border border-line overflow-hidden">
                <div className="h-10 border-b border-line bg-raised animate-pulse" />
                {Array.from({ length: 8 }).map((_, i) => (
                    <div
                        key={i}
                        className="h-12 border-b border-line last:border-0 bg-raised animate-pulse"
                        style={{ animationDelay: `${i * 30}ms` }}
                    />
                ))}
            </div>
        </div>
    )
}
