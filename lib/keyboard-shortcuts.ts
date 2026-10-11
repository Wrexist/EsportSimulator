// Single source of truth for the shortcuts surfaced to users (modal, settings
// panel, docs/shortcuts.md). The handler lives in components/layout/GameShell;
// this file is display-only so the three surfaces never drift apart.

export interface Shortcut {
    keys: string[]
    description: string
}

export interface ShortcutGroup {
    label: string
    shortcuts: Shortcut[]
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
    {
        label: "General",
        shortcuts: [
            { keys: ["Ctrl", "S"], description: "Save game" },
            { keys: ["Ctrl", "L"], description: "Open load game screen" },
            { keys: ["F2"], description: "Quick save" },
            { keys: ["F3"], description: "Open load game screen" },
            { keys: ["F10"], description: "Open settings" },
            { keys: ["F11"], description: "Toggle fullscreen" },
            { keys: ["F1"], description: "Show keyboard shortcuts" },
            { keys: ["?"], description: "Show keyboard shortcuts" },
        ],
    },
    {
        label: "Navigation",
        shortcuts: [
            { keys: ["1"], description: "Home (dashboard)" },
            { keys: ["2"], description: "Open inbox" },
            { keys: ["I"], description: "Open / close inbox" },
            { keys: ["3"], description: "Squad" },
            { keys: ["4"], description: "Week plan" },
            { keys: ["5"], description: "Match centre (next match)" },
            { keys: ["6"], description: "Recruitment (transfers)" },
            { keys: ["7"], description: "Competition (league)" },
            { keys: ["8"], description: "Club (finances)" },
            { keys: ["9"], description: "Settings" },
            { keys: ["Esc"], description: "Go back / Close modal" },
        ],
    },
    {
        label: "Gameplay",
        shortcuts: [
            { keys: ["Space"], description: "Advance time (day or week)" },
            { keys: ["Space"], description: "Pause / resume a live match" },
        ],
    },
    {
        label: "Modals",
        shortcuts: [
            { keys: ["Ctrl", "Enter"], description: "Confirm action" },
            { keys: ["Esc"], description: "Cancel / Close" },
        ],
    },
]

// Hub-aligned number-key routes: 1 and 3–8 open the seven top-bar hubs in
// order (Home, Squad, Week, Match, Recruitment, Competition, Club), 9 is
// Settings. Mirrors the entries above; "2" is the inbox drawer
// (INBOX_OPEN_KEY), which overlays the current screen.
export const NUMBER_KEY_ROUTES: Record<string, string> = {
    "1": "/",
    "3": "/squad",
    "4": "/week",
    "5": "/match",
    "6": "/transfers",
    "7": "/league",
    "8": "/finances",
    "9": "/settings",
}

/** Opens the inbox drawer (was the `/desktop` route). */
export const INBOX_OPEN_KEY = "2"
/** Toggles the inbox drawer (case-insensitive, no modifiers). */
export const INBOX_TOGGLE_KEY = "i"
