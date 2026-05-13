// Streaming skeleton for the sponsorships page.

export default function SponsorshipsLoading() {
    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            <div className="h-8 w-44 rounded-lg bg-white/[0.04] animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div
                        key={i}
                        className="h-48 rounded-2xl bg-white/[0.02] border border-white/5 animate-pulse"
                        style={{ animationDelay: `${i * 40}ms` }}
                    />
                ))}
            </div>
            <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div
                        key={i}
                        className="h-24 rounded-xl bg-white/[0.02] border border-white/5 animate-pulse"
                        style={{ animationDelay: `${i * 30}ms` }}
                    />
                ))}
            </div>
        </div>
    )
}
