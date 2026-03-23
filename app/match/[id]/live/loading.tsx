import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
    return (
        <div className="flex flex-col h-screen bg-[#0e1217] overflow-hidden">
            {/* Header */}
            <div className="h-16 border-b border-white/5 flex items-center px-6 justify-between">
                <Skeleton className="h-8 w-64 bg-white/5" />
                <Skeleton className="h-10 w-32 bg-white/5 rounded-full" />
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar */}
                <div className="w-80 border-r border-white/5 p-4 space-y-4 hidden lg:block">
                    <Skeleton className="h-48 w-full bg-white/5 rounded-xl" />
                    <Skeleton className="h-32 w-full bg-white/5 rounded-xl" />
                    <div className="space-y-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-12 w-full bg-white/5 rounded-lg" />
                        ))}
                    </div>
                </div>

                {/* Center Stage */}
                <div className="flex-1 p-6 flex flex-col items-center justify-center space-y-8">
                    {/* Scoreboard */}
                    <div className="w-full max-w-4xl h-32 bg-white/5 rounded-2xl animate-pulse flex items-center justify-center">
                        <div className="h-4 w-48 bg-white/10 rounded-full" />
                    </div>

                    {/* Game Viewport */}
                    <div className="w-full max-w-5xl aspect-video bg-white/5 rounded-xl border border-white/10 relative overflow-hidden">
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                                <div className="text-sm font-bold uppercase tracking-widest text-white/50 animate-pulse">
                                    Connecting to Server...
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
