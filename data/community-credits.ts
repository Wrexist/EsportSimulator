/**
 * Players credited for shaping the game: community poll winners, bug
 * reports that led to a fix, and suggestions that shipped. Add a name only
 * with the player's permission, using the name they asked for.
 * The Community section on the credits screen shows once this list has entries.
 */
export interface CommunityCredit {
    name: string
    /** Short reason, e.g. "Poll winner: seasonal map pool". */
    for: string
}

export const COMMUNITY_CREDITS: CommunityCredit[] = []
