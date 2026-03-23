
import { Player } from "@/types/player"

/**
 * Resolves the player's role, inferring it from stats if it is "Unknown" or missing.
 * 
 * Logic:
 * 1. If role is set and not "Unknown", use it.
 * 2. If "Unknown":
 *    - IGL: leader >= 90 OR (leader >= 85 AND tactic >= 85)
 *    - Support: grenades >= 90 OR (grenades >= 85 AND teamwork >= 85)
 *    - AWPer: awp >= 80 AND awp > (skill + rifle) / 2
 *    - Rifler: Default fallback (high skill players who don't fit strict criteria)
 * 
 * @param player The player object (can be full Player or partial from scouting)
 * @returns The resolved role string
 */
export function resolvePlayerRole(player: Partial<Player> | { role?: string; leader?: number; grenades?: number; awp?: number; tactic?: number; teamwork?: number; skill?: number; rifle?: number }): string {
    const rawRole = player.role || "Rifler";

    // If it has a secondary role, we still just return the primary role here.
    // The UI handles displaying secondaryRole separately.

    const isUnknown = !rawRole || rawRole.toLowerCase() === "unknown";

    if (!isUnknown) {
        return rawRole!;
    }

    // Smart inference for Unknown roles (Scouting/Legacy fallback)
    // ... rest of the function ...

    // Smart inference for Unknown roles
    // We treat missing stats as 0 to be safe
    const leader = player.leader ?? 0;
    const grenades = player.grenades ?? 0;
    const awp = player.awp ?? 0;
    const tactic = player.tactic ?? 0;
    const teamwork = player.teamwork ?? 0;

    // Calculate distinct firepower (average of aim + rifle)
    // We use this to compare against specific roles
    const skill = player.skill ?? 0;
    const rifle = player.rifle ?? 0;
    const firepower = (skill + rifle) / 2;

    // Strict IGL Check: Must be a dedicated leader (90+) or a very tactical leader
    // This prevents star players with good leadership (like ropz) from being mislabeled
    if (leader >= 90 || (leader >= 85 && tactic >= 85)) return "IGL";

    // Strict Support Check: Must be a utility god
    if (grenades >= 90 || (grenades >= 85 && teamwork >= 85)) return "Support";

    // AWPer Check: Must be actually good at AWPing (75+) and better at it than rifling
    if (awp >= 75 && awp > firepower) return "AWPer";

    // Default to Rifler for everyone else (including Lurkers, Entry fraggers if not explicitly set)
    return "Rifler";
}
