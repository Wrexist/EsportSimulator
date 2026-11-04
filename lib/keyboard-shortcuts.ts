// Single source of truth for the shortcuts surfaced to users (modal, settings
// panel, docs/shortcuts.md). The handler lives in components/layout/GameShell;
// this file is display-only so the three surfaces never drift apart.

export interface Shortcut {
    keys: string[]
    /** Translation key (locales/en/settings.ts); show it with t(). */
    description: string
}

export interface ShortcutGroup {
    /** Translation key; show it with t(). */
    label: string
    shortcuts: Shortcut[]
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
    {
        label: "shortcuts.group.general",
        shortcuts: [
            { keys: ["Ctrl", "S"], description: "shortcuts.saveGame" },
            { keys: ["Ctrl", "L"], description: "shortcuts.openLoad" },
            { keys: ["F2"], description: "shortcuts.quickSave" },
            { keys: ["F3"], description: "shortcuts.openLoad" },
            { keys: ["F10"], description: "shortcuts.openSettings" },
            { keys: ["F11"], description: "shortcuts.fullscreen" },
            { keys: ["F1"], description: "shortcuts.showShortcuts" },
            { keys: ["?"], description: "shortcuts.showShortcuts" },
        ],
    },
    {
        label: "shortcuts.group.navigation",
        shortcuts: [
            { keys: ["1"], description: "shortcuts.home" },
            { keys: ["2"], description: "shortcuts.openInbox" },
            { keys: ["I"], description: "shortcuts.toggleInbox" },
            { keys: ["3"], description: "shortcuts.squad" },
            { keys: ["4"], description: "shortcuts.weekPlan" },
            { keys: ["5"], description: "shortcuts.matchCentre" },
            { keys: ["6"], description: "shortcuts.recruitment" },
            { keys: ["7"], description: "shortcuts.competition" },
            { keys: ["8"], description: "shortcuts.club" },
            { keys: ["9"], description: "shortcuts.settings" },
            { keys: ["Esc"], description: "shortcuts.back" },
        ],
    },
    {
        label: "shortcuts.group.gameplay",
        shortcuts: [
            // Space runs Continue (to the next decision), not one day or week (HOME-20).
            { keys: ["Space"], description: "advance.continueTitle" },
            { keys: ["Space"], description: "shortcuts.pauseLive" },
        ],
    },
    {
        label: "shortcuts.group.modals",
        shortcuts: [
            { keys: ["Ctrl", "Enter"], description: "shortcuts.confirm" },
            { keys: ["Esc"], description: "shortcuts.cancel" },
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
