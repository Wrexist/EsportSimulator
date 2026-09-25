import { cn } from "@/lib/utils"

/** Original code-built side marks; no raster backdrop or external faction insignia. */
export function SideEmblem({ side, className }: { side: "CT" | "T"; className?: string }) {
    return <svg viewBox="0 0 64 64" role="img" aria-label={side === "CT" ? "Defending side" : "Attacking side"}
        className={cn("shrink-0", side === "CT" ? "text-sky-200" : "text-amber-200", className)}>
        <path d="M32 4 55 16v29L32 60 9 45V16Z" fill="currentColor" fillOpacity=".08" stroke="currentColor" strokeOpacity=".45" strokeWidth="1.5" />
        {side === "CT" ? <>
            <path d="M20 20h24v16c0 7-12 13-12 13s-12-6-12-13Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
            <path d="M26 30h12M32 24v18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </> : <>
            <path d="m21 42 11-24 11 24-11-6Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
            <path d="M32 36v11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </>}
    </svg>
}
