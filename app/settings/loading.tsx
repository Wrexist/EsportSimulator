// Streaming skeleton for the settings page: header line, then two columns of panels.

export default function SettingsLoading() {
    return (
        <div className="mx-auto max-w-[1280px] space-y-5" aria-busy="true">
            <div className="h-10 w-48 animate-pulse rounded-md bg-panel" />
            <div className="h-10 border-b border-line" />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {[0, 1].map(col => (
                    <div key={col} className="space-y-4">
                        {[0, 1].map(i => <div key={i} className="h-56 rounded-lg border border-line bg-panel" />)}
                    </div>
                ))}
            </div>
        </div>
    )
}
