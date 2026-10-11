import { LoadingSplash } from "@/components/brand/LoadingSplash"

// The live match is full-screen (no sidebar or top bar): branded splash while it loads.
export default function Loading() {
    return <LoadingSplash label="Preparing match" className="h-full min-h-0 rounded-lg" />
}
