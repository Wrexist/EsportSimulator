/**
 * English, the source language. Every other language is a JSON file with the
 * same keys in public/locales/<code>.json (see locales/README.md).
 *
 * Keys are grouped by screen. Text in {{double braces}} is filled in by the
 * game and must stay as it is in a translation. A key ending in .one/.other
 * (and .few/.many/.two/.zero where a language needs them) is a plural: the
 * game picks the form for the count by the language's plural rules.
 */
export const EN = {
    // Navigation: top-bar hubs and their tabs (lib/navigation.ts)
    "nav.hub.home": "Home",
    "nav.hub.squad": "Squad",
    "nav.hub.week": "Week",
    "nav.hub.match": "Match",
    "nav.hub.recruitment": "Recruitment",
    "nav.hub.competition": "Competition",
    "nav.hub.club": "Club",
    "nav.overview": "Overview",
    "nav.inbox": "Inbox",
    "nav.roster": "Roster",
    "nav.staff": "Staff",
    "nav.academy": "Academy",
    "nav.statistics": "Statistics",
    "nav.weekPlan": "Week plan",
    "nav.training": "Training",
    "nav.calendar": "Calendar",
    "nav.matchCentre": "Match centre",
    "nav.transfers": "Transfers",
    "nav.scouting": "Scouting",
    "nav.league": "League",
    "nav.tournaments": "Tournaments",
    "nav.rankings": "Rankings",
    "nav.trophies": "Trophies",
    "nav.hallOfFame": "Hall of Fame",
    "nav.finances": "Finances",
    "nav.sponsors": "Sponsors",
    "nav.facilities": "Facilities",
    "nav.board": "Board",
    "nav.manager": "Manager",
    "nav.settings": "Settings & Tools",

    // Top bar
    "topbar.clubOverview": "Club overview",
    "topbar.mainNavigation": "Main navigation",
    "topbar.sections": "{{hub}} sections",
    "topbar.funds": "Funds",
    "topbar.settings": "Settings",
    "topbar.managerProfile": "Manager profile",
    "topbar.noTeam": "No Team",
    "common.loading": "Loading...",

    // Screen search (Ctrl K)
    "search.open": "Go to\u2026",
    "search.title": "Go to a game screen",
    "search.description": "Search destinations. Use arrow keys to select and Enter to navigate.",
    "search.inputLabel": "Search game screens",
    "search.placeholder": "Where would you like to go?",
    "search.empty": "No screens found. Try squad, week or finances.",
    "search.preferences": "Preferences",
    "search.footer": "Type to find a screen \u00b7 Enter to open \u00b7 Esc to close",

    // Main menu
    "menu.label": "Main menu",
    "menu.continue": "Continue",
    "menu.newCareer": "New career",
    "menu.draftCup": "Draft Cup",
    "menu.shortRun": "Short run",
    "menu.loadGame": "Load game",
    "menu.noSaves": "No saves",
    "menu.saves.one": "{{count}} save",
    "menu.saves.other": "{{count}} saves",
    "menu.settings": "Settings",
    "menu.quit": "Quit",
    "menu.version": "Version",
    "menu.credits": "Credits",
    "menu.demo": "Free demo",
    "menu.demoWeeks": "First {{count}} weeks of a career",
    "menu.fullGame": "Get the full game",

    // Shared
    "common.save": "Save",
    "match.round": "Round {{n}}",
} as const

export type TranslationKey = keyof typeof EN
