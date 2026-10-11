import { LoadingSplash } from "@/components/brand/LoadingSplash"

// Branded splash while the title screen chunk loads (also the first frame after Electron's boot page).
export default function Loading() {
    return <LoadingSplash />
}
