// Streaming skeleton for the equipment page.

export default function EquipmentLoading() {
    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            <div className="h-8 w-40 rounded-lg bg-white/[0.04] animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 9 }).map((_, i) => (
                    <div
                        key={i}
                        className="h-[380px] rounded-3xl bg-white/[0.02] border border-white/5 animate-pulse"
                        style={{ animationDelay: `${i * 30}ms` }}
                    />
                ))}
            </div>
        </div>
    )
}
