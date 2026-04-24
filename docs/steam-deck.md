# Steam Deck / Steam Input Readiness

Steam Input maps gamepad (and Deck) inputs onto the keyboard and mouse events
the game already receives. The plan is deliberately keyboard-first: if every
screen is keyboard-navigable with a visible focus ring, the same traversal
works on the Deck and on any controller via the Steam Input overlay.

## What ships in-code

- **Global keyboard shortcuts** — save (`Ctrl+S`/`F2`), load (`Ctrl+L`/`F3`),
  sections `1`–`9`, advance time (`Space`), settings (`F10`), fullscreen
  toggle (`F11`), shortcuts help (`F1`/`?`). See `docs/shortcuts.md`.
- **Focus indicators** — every interactive element gets a 2px cyan-400
  outline with a soft outer glow on `:focus-visible`. The rule covers native
  buttons, links, inputs, and anything marked `role="button" | "link" |
  "menuitem" | "option" | "tab"` or given a `tabindex`. Defined in
  `app/globals.css`.
- **Clickable cards** — the two plain `<div>` action cards (`Mental Reset`
  on the tactics screen and the tournament season card) have `role="button"`,
  `tabIndex={0}`, aria-labels, and Enter/Space handlers, so Deck users can
  activate them via the keyboard-mapped A button.
- **Skip-to-content link** — `app/layout.tsx` renders a visually-hidden
  "Skip to main content" link that appears on first Tab, letting keyboard
  users bypass the sidebar.
- **Minimum window size** — 1024x640 enforced in `electron/main.js`, above
  the Deck's 1280x800 native resolution so the layout never degrades below
  its intended breakpoint.

## Manual pre-submission checklist

Before flipping the Steamworks Deck Verified flag, walk each screen with the
keyboard only. Tab order should follow visual reading order (top-to-bottom,
left-to-right); nothing should be unreachable or skipped.

- [ ] **Main menu** — New Game, Load Game, Settings, Credits all reachable
      and activatable via Tab + Enter.
- [ ] **New game** — all form fields reachable, next/back buttons activatable.
- [ ] **Dashboard (`/`)** — sidebar and all widget actions reachable.
- [ ] **Sidebar nav** — every menu item reachable; Enter activates.
- [ ] **Squad** — player cards focusable; the roster sort / filter controls
      are standard buttons.
- [ ] **Transfers / Scouting / Training** — action buttons focusable; modal
      confirms dismissable with Esc.
- [ ] **Schedule / Tournaments** — season cards (now keyboard-accessible)
      reachable; matchday navigation works with arrow keys in the match view.
- [ ] **Desktop apps** — each window's controls focusable; closing with Esc
      returns focus to the desktop.
- [ ] **Settings** — all toggles, sliders, selects focusable and operable
      with arrow keys + Space.
- [ ] **Exit dialog** — Confirm/Cancel focusable; Esc cancels; Enter/Ctrl+Enter
      confirms.

Run through the list at Deck resolution (1280x800) and in both `Windowed` and
`Fullscreen` modes.

## Steamworks partner portal steps

Once the checklist passes in local testing:

1. In the **partner portal → App → Steam Deck Compatibility**, upload a short
   capture of keyboard-only traversal and the focus ring in the UI.
2. Declare the **default Steam Input configuration** — map:
   - D-pad / left stick → arrow keys (sidebar navigation, arrow-key menus)
   - A → Enter
   - B → Escape
   - X → `Space` (advance time)
   - Y → `?` (shortcuts help)
   - Start → `F10` (settings)
   - Select → `F1` (shortcuts modal)
   - LB/RB → `1`..`9` cycling (optional — bind to specific sections as desired)
3. Set the game rating to **Playable** (or **Verified** if all criteria pass
   including default controller config, readable text at Deck resolution,
   and suspend/resume). Do not self-mark Verified — Valve runs their own
   pass; self-reporting Playable is the ceiling until Valve reviews.
4. Confirm the build boots at `1280x800` windowed and at 60 Hz, and that
   resuming from sleep restores the window at its saved bounds. Both are
   already covered by the window-state persistence and `minWidth`/`minHeight`
   enforcement in `electron/main.js`.

## Known gaps

- Text rendered in `text-[9px]` / `text-[10px]` inside tournament and desktop
  cards may be hard to read on the Deck's screen at arm's length. Not a
  blocker for Playable, but revisit for Verified.
- The in-match live panels use a lot of mouse-hover affordances. Double-check
  that every hover tooltip also has a keyboard-focus equivalent before
  submitting for Verified.
