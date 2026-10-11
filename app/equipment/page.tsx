import { redirect } from "next/navigation"
import { GEAR_HREF } from "@/lib/navigation"

/** Equipment folded into Facilities → Gear (Phase 4.2 cuts). */
export default function EquipmentRedirect() {
    redirect(GEAR_HREF)
}
