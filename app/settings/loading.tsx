// Streaming skeleton for the settings page — mirrors the section/row layout.

export default function SettingsLoading() {
    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            <div className="h-9 w-32 rounded-lg bg-white/[0.04] animate-pulse" />
            {Array.from({ length: 4 }).map((_, section) => (
                <div
                    key={section}
                    className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 space-y-3"
                    style={{ animationDelay: `${section * 60}ms` }}
                >
                    <div className="h-5 w-40 rounded bg-white/[0.04] animate-pulse" />
                    <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, row) => (
                            <div
                                key={row}
                                className="h-10 rounded-lg bg-white/[0.015] animate-pulse"
                                style={{ animationDelay: `${section * 60 + row * 25}ms` }}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}
