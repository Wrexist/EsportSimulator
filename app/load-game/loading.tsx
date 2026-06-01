// Streaming skeleton for the save-game picker — mirrors the list layout.

export default function LoadGameLoading() {
    return (
        <div className="max-w-3xl mx-auto p-6 space-y-6">
            <div className="h-8 w-40 rounded-lg bg-white/[0.04] animate-pulse" />
            <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div
                        key={i}
                        className="h-20 rounded-xl bg-white/[0.02] border border-white/5 animate-pulse"
                        style={{ animationDelay: `${i * 40}ms` }}
                    />
                ))}
            </div>
        </div>
    )
}
