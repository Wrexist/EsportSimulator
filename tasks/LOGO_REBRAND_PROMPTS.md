# Game Logo / App Icon — rebrand prompts (copy-paste ready)

For the main **Esports Manager: FPS** logo & Steam app icon. Each block is a
complete prompt — paste into **Ideogram** or **Flux** (best for the lettering) or
**Midjourney** (best for the emblem-only options). Generate **1024×1024,
transparent or dark background**, square, then export. Steam capsule/library-logo
art works best with a clear silhouette that reads at small sizes.

Shared brand cues to keep across directions: deep charcoal `#0e1217`, electric
cyan `#38bdf8`, premium gold `#f5c451`, heavy condensed type, AAA esports feel.

> Generate 4 variations of each, then we pick a direction and refine.

---

## 1 — Refined trophy emblem (evolves the current icon)
```
Premium esports game app icon, 1024x1024, rounded-square badge, a sleek modern championship trophy rendered in brushed gold and chrome with subtle cyan rim-light, set on a dark charcoal #0e1217 gradient with a soft radial glow and faint stadium-light bokeh behind it, glossy 3D depth, clean minimal composition, AAA esports branding, no text, crisp edges, high contrast
```

## 2 — "EM" monogram shield (clean & scalable)
```
Modern esports team-style logo, 1024x1024, a bold interlocking monogram of the letters "EM" forming a sharp angular shield, brushed-metal and electric-cyan #38bdf8 two-tone with a thin gold #f5c451 accent edge, glossy 3D bevel, deep charcoal background, premium pro-gaming identity, ultra clean, reads well as a small icon, no extra text
```

## 3 — Crosshair × trophy fusion (manager + FPS concept)
```
Esports game logo concept, 1024x1024, a precision FPS crosshair reticle integrated into the silhouette of a championship trophy cup, cyan #38bdf8 targeting lines over warm gold #f5c451 metal, dark charcoal #0e1217 backdrop with a subtle tactical grid and soft glow, sharp geometric 3D emblem, clever dual-meaning mark (shooting + management), no text, premium and minimal
```

## 4 — Mascot crest (animal + trophy)
```
Aggressive esports mascot logo, 1024x1024, a fierce stylized eagle (or wolf) head crest gripping a small golden trophy, sharp angular vector shapes with 3D metallic shading, electric cyan and gold on deep charcoal #0e1217, bold pro-gaming team-badge energy, clean silhouette that reads at icon size, no text
```

## 5 — Tactical HUD / scoreboard style (CS2 vibe)
```
Tactical FPS-inspired esports logo, 1024x1024, a minimalist scoreboard / HUD bracket motif forming a strong abstract emblem, neon cyan #38bdf8 lines, subtle gold accent, dark charcoal #0e1217 with faint scanline texture and glow, sleek futuristic 3D look, competitive shooter aesthetic, clean and iconic, no text
```

## 6 — Modern wordmark + mark lockup (for the capsule/header)
```
Esports brand logo lockup, 1024x512, a compact geometric icon mark (angular "E/M" + crosshair) on the left and bold condensed uppercase wordmark "ESPORTS MANAGER" with a smaller "FPS" tag on the right, white type with a cyan #38bdf8 underline accent and gold detail, deep charcoal #0e1217 background, premium AAA esports branding, crisp kerning, flat with subtle 3D depth
```

## 7 — Ultra-minimal flat icon (alt, very legible small)
```
Minimal flat esports app icon, 1024x1024, a single bold geometric trophy-or-"M" glyph in electric cyan #38bdf8 with a gold #f5c451 highlight, centered on a flat dark charcoal #0e1217 rounded square, no gradients banding, ultra clean, extremely legible at 32px, modern tech-brand simplicity, no text
```

---

### Install (whichever you pick)
- App/runtime icon → replace `public/logo.png` (keep 512×512+; also export `public/logo.ico` multi-size for the installer).
- Steam: re-run `trailer/steam/render.ts` after swapping `trailer/steam/assets/logo.png` so all capsules/hero use the new mark.
- Trailer: drop the new `logo.png` into `trailer/remotion/public/logo.png` and re-render.
