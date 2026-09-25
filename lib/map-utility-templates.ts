import type { MarkSide, UtilityKind } from "./map-annotations"

// Names and purposes only: the author supplies all coordinates on the actual radar.
export const MIRAGE_UTILITY_SOURCE = "https://getreplay.gg/en/articles/cs2-mirage-lineups"
export const MIRAGE_UTILITY_TEMPLATES: { label: string; kind: UtilityKind; side: MarkSide; note: string }[] = [
    { label: "Mid window smoke", kind: "smoke", side: "T", note: "Mid control: mark your throw position and the window landing. Confirm the lineup for your spawn." },
    { label: "CT / Ticket smoke", kind: "smoke", side: "T", note: "A entry: obscure the Ticket angle. Check for gaps after the smoke settles." },
    { label: "Stairs smoke", kind: "smoke", side: "T", note: "A entry: cover the Stairs position." },
    { label: "Jungle / Connector smoke", kind: "smoke", side: "T", note: "A entry: cover the Jungle angle and check the Connector edge." },
    { label: "Market window smoke", kind: "smoke", side: "T", note: "B entry: cover Market window." },
    { label: "Market door smoke", kind: "smoke", side: "T", note: "B entry: cover the Market doorway." },
    { label: "B short smoke", kind: "smoke", side: "T", note: "B entry: cover the Short approach." },
    { label: "Top mid smoke", kind: "smoke", side: "T", note: "Mid control: mark the specific angle you want to block." },
    { label: "B entry popflash", kind: "flash", side: "T", note: "B entry: mark the airburst point. Note timing and where teammates should look." },
    { label: "Balcony retake flash", kind: "flash", side: "CT", note: "A retake: mark the burst point above the balcony and the intended peek timing." },
    { label: "Under balcony fire", kind: "fire", side: "T", note: "A entry: mark the intended fire under the balcony. Check actual spread in game." },
    { label: "Default plant denial fire", kind: "fire", side: "CT", note: "A defense: cover the default plant position." },
    { label: "Default HE grenade", kind: "he", side: "CT", note: "A defense: mark the detonation point near the default plant position." },
]
