import { MatchCardSkeleton } from "@/components/ui/skeletons"

export default function Loading() {
    return (
        <div className="container mx-auto p-4 md:p-8 space-y-6">
            <div className="flex justify-between items-center">
                <div className="h-10 w-48 bg-white/5 animate-pulse rounded-lg" />
                <div className="h-10 w-32 bg-white/5 animate-pulse rounded-lg" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="col-span-full">
                    <div className="glass-panel p-8 flex flex-col items-center justify-center min-h-[40vh] space-y-8">
                        <div className="flex items-center gap-12 w-full max-w-2xl justify-center">
                            <div className="w-24 h-24 rounded-2xl bg-white/5 animate-pulse" />
                            <div className="text-3xl font-bold text-white/20 animate-pulse">VS</div>
                            <div className="w-24 h-24 rounded-2xl bg-white/5 animate-pulse" />
                        </div>
                        <div className="h-4 w-64 bg-white/5 animate-pulse rounded-full" />
                    </div>
                </div>
            </div>
        </div>
    )
}
