# Team identity and map presentation

Implemented locally on 2026-09-12, following the shared glass interface pass.

## Audit and changes

| Area | Finding | Implemented change |
|---|---|---|
| Small team crests | Marks, initials, heavy rims and shadows competed at table sizes. | Crests at 40px and below emphasize one larger mark; larger emblems retain initials. Lighter rims and restrained shading keep edges clear. |
| Repeated crests | Identical team/size instances reused SVG gradient IDs. | React instance IDs keep gradient references separate when the same club appears several times. |
| Custom logos | A failed upload had no fallback; image failure state was shared across different sources. | Failed sources are tracked separately, allowing the existing branding/placeholder chain to recover and new sources to render. |
| Radar readability | The default tilted, 192px view made positions and names hard to read. | Default top-down view, responsive map up to 360px, clearer map contrast, larger outlined names and a names toggle. |
| Radar controls | Floor buttons were nested inside the collapse button. | Separate native buttons for disclosure, view, floor and names, with accessible names and selected states. |
| Radar decoration | A rotating sweep distracted from tactical information. | Removed the sweep; bomb pulses stop under the app or system reduced-motion preference. |
| 3D overview | Initial camera framing cropped useful map content; entry animation delayed control and idle rotation moved the map. | Wider, stable overview with immediate orbit controls. Focus interpolation is frame-rate independent and skips smoothing under the system reduced-motion preference. |
| Map selection | Clickable cards lacked keyboard activation and banned cards were excessively dimmed. | Enter/Space activation, accessible map/action labels, quieter borders, smaller corner radii and clearer unavailable states. |
| Map naming | Sandstone still displayed as Dust II through the shared name lookup. | Shared display name now reads Sandstone, with regression coverage. |

## Asset coverage

The snapshot contains **198 teams**, all with branding, and no missing referenced logo files. The map folder contains **18 PNGs**: eight map images and ten radar floor images. Dimensions, file sizes and reference checks are recorded in [asset-inventory.json](asset-evidence/asset-inventory.json).

Existing map artwork and coordinate geometry are retained. Some stored SVG identities predate the current fictional team names; promoting those files above live branding would reintroduce incorrect initials. The renderer continues to prefer custom uploads and raster logos, followed by current team branding.

The gated development preview now includes all eight active maps and twelve current clubs at 24px, 36px and 72px. It uses a fabricated round through the real position engine and does not advance a career.

## Verification

- **1,213 tests across 123 suites passed**, including six new assertions/tests covering crest rendering, unique SVG IDs, radar control markup and the Sandstone name. The test compiler now emits React JSX so actual components can be server-rendered in regression tests.
- Browser inspection: current team crests at three sizes; Mirage and Nuke radar; manual lower floor and automatic upper floor; names on/off; 2D, 2.5D and WebGL views; Enter collapse/expand; 1024x640 toolbar layout.
- No browser console errors were captured in this preview session.
- Screenshots: [crests](asset-evidence/team-crests.png), [2D radar](asset-evidence/radar-2d.png), [3D radar](asset-evidence/radar-3d.png), [lower floor](asset-evidence/nuke-lower-floor.png), [compact layout](asset-evidence/radar-compact.png).
- Production build, type checking and compiled-worker startup gate passed: [build log](asset-evidence/build.txt). The build reported 155 lint warnings; one newly unused preview import was then removed and that file passed a focused lint check, leaving the 154-warning pre-existing backlog. This import-only cleanup did not require another production build.

## Remaining work, in order

1. Validate the updated radar in a complete live match inside packaged Electron, including dense player overlap, floor transitions, overtime and zoom/orbit on lower-end hardware. The preview and engine regressions do not establish GPU frame-time performance.
2. Exercise map-veto keyboard selection through a complete competitive match flow. This pass implements the keyboard handler but does not claim end-to-end veto acceptance.
3. Create a curated identity set for the most prominent fictional clubs, checking distinct silhouettes at 24px before expanding across the 198-team roster. Reconcile legacy SVGs with current names before switching rendering priority.
4. Review map-selection artwork as a consistent collection: shared crop, contrast and export sizes. Any radar artwork replacement must preserve coordinates or include a separately validated geometry migration.
5. Extend accessibility checks to color-vision differences and all 3D effects. System reduced motion covers the camera; complete parity with app-level motion settings in the optional renderer remains a follow-up.

This pass changes presentation and control semantics. Packaged Electron/Steam acceptance, a bespoke logo collection and the broader audit backlog remain open. No commit, push or release was performed.
