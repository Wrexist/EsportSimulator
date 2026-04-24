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
            { keys: ["2"], description: "Desktop" },
            { keys: ["3"], description: "Squad" },
            { keys: ["4"], description: "Training" },
            { keys: ["5"], description: "Schedule" },
            { keys: ["6"], description: "Transfers" },
            { keys: ["7"], description: "Tournaments" },
            { keys: ["8"], description: "Finances" },
            { keys: ["9"], description: "Settings" },
            { keys: ["Esc"], description: "Go back / Close modal" },
        ],
    },
    {
        label: "Gameplay",
        shortcuts: [
            { keys: ["Space"], description: "Advance time (day or week)" },
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

// Sidebar-aligned number-key routes. Mirrors the 1-9 entries above.
export const NUMBER_KEY_ROUTES: Record<string, string> = {
    "1": "/",
    "2": "/desktop",
    "3": "/squad",
    "4": "/training",
    "5": "/schedule",
    "6": "/transfers",
    "7": "/tournaments",
    "8": "/finances",
    "9": "/settings",
}
