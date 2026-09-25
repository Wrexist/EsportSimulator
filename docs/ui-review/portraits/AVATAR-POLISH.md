## Avatar bulk completed: all approved personal-photo sources

1,170 records exported and synced: 1,156 unique avatars and fourteen verified historical aliases. The final 809-job built-in image queue completed with zero failures. All 947 entries in approved batch manifests are delivered; earlier approved inputs are also retained. Every reviewed snapshot portrait mapping matches its destination. Alpha validation passed; dark/light contact sheets were inspected through the final exports (`jersey-bulk-final-1170.png` and `jersey-bulk-final-1170-light.png`).

Final validation: all 15 portrait regression tests passed and TypeScript passed at 1,170 records. Isolated in-game team-selection capture at the earlier 846 checkpoint loaded twelve polished portraits at both 1920x1080 and 1280x720 with zero page errors and no career created. This is focused portrait validation, not a full-game release test. Content reconciliation reports zero non-portrait gameplay changes. First ten original-photo jersey corrections are integrated as versioned v3 masters; original photos and older masters are retained. No API, Git push or Steam packaging performed.

198 of the 1,368 audited player records do not have a verified personal photo: 191 have only unsuitable/placeholder candidates, six have no local source, and one has an unresolved alternate-source identity. These are not pending approved generation jobs. See `production-progress.json` and `source-review-exceptions.json`; do not substitute someone else's face. New portraits use navy esports jerseys; 26 previously approved hoodie portraits remain from the earlier style.

The first ten Vitalis/Foria portraits were compared with original photos in `top-ten-likeness-comparison.png`. Their original-photo jersey replacements are now integrated and reviewed on dark/light backgrounds in `top-ten-original-photo-v3.png` and `top-ten-original-photo-v3-light.png`. Invented headphones and inaccurate hair from the older stylized sources were removed. `data/player-portrait-replacements.json` records exact replacement sources and versioned masters; earlier artwork is preserved.

The sections below record earlier checkpoints and prompt history; current counts and status are above and in `production-progress.json`.

# Avatar polish — 2026-09-25

## User direction
Use each player's own portrait as the identity reference, including players outside the top 25. Randomized fallback is only the final choice for players genuinely lacking a portrait. Source existence alone is not evidence of a unique portrait: duplicates, placeholders and ambiguous nicknames need review.

## Completed
Bulk workflow trial: submit 15 distinct built-in image requests together, then inspect and integrate once per group. Export now verifies existing source/master/output hashes and reuses unchanged exports instead of decoding/resizing all prior images. This reduces local processing; image service throughput is not guaranteed to increase. Source-review exceptions are recorded in `source-review-exceptions.json`.

Progress and remaining queue are recorded in `production-progress.json`, generated from the delivered manifest rather than a hard-coded total. **Built-in imagegen only**, explicitly selected by the user; no API runner. Groups use distinct per-player generation requests, followed by shared export/validation. Source images and earlier outputs remain unchanged. Reviewed masters are in `masters/`; 512px alpha-preserving exports are in `public/branding/portraits/polished-*.png`. Exact mappings and hashes are in `data/player-portrait-reviewed.json`. Synchronization prioritizes these over old tight face crops. Stock save hydration and shared portrait rendering retain the permanent player identity.

## Prompt set
From the Natoz batch onward, the user requested esports jerseys instead of hoodies. Use a professional midnight-navy short-sleeve athletic jersey, tonal shoulder panels, restrained silver piping and a small crewneck; no hood, drawstrings, sponsors, logos or text. Original photo remains the sole identity reference and the reviewed master is style/framing only. Earlier 36 approved hoodie portraits are retained, not silently replaced.

For each corresponding source: identity-preserving production cleanup of the exact stylized 3D esports avatar; retain face, hair, expression, skin tone, facial hair and individual glasses/headphones. Centered straight-on head/upper chest with both shoulders visible, complete hair and small headroom; head around 42% canvas width, chin around 56% height. Plain unbranded navy hoodie, soft studio lighting, original 3D rendering style. Remove pale matte contamination and rough silhouette pixels. Genuine transparent alpha, no checkerboard, halo, background, text or logos. For apexx explicitly remove the chest swoosh; for Zywou explicitly remove the bluegray backdrop. These are visual targets, not claims of exact landmark positions.

## Validation and remaining scope
All delivered images pass alpha validation, not a painted checkerboard. Originals and generated masters retained. New portraits visually inspected at full size and as a dark-background grid; actual UI review remains pending. `polished-progress.html` provides names and IDs; `polished-progress.png` is the image-only review grid.

The full 1,368-player audit is `all-player-source-audit.json`: after searching `raw-data/teams` as well as public sources, 1,362 possible own sources and six missing local sources. This supersedes the earlier public-only count. This is a candidate inventory, not 1,362 finished or identity-verified avatars. Remaining sources must be visually checked, their own portraits edited/generated individually and approved results added to the reviewed manifest. Do not label the existing shared fallback as a completed personal avatar. Existing production fallbacks remain until a reviewed replacement exists.

## Original-photo conversion prompt
G Two and Tha batches use `masters/aleczib-v2.png` as the style/jersey reference. Prompt: Image 1 is the sole facial identity reference; preserve face shape, body build, hair, facial hair and existing glasses. Image 2 supplies style, jersey and framing only, never facial identity. Polished stylized 3D animated character, gently enlarged expressive eyes, centered front-facing head and upper chest, full hair, small headroom, both shoulders, hands out of frame. Matching navy athletic jersey with tonal shoulders, silver piping and crewneck; no sponsor/team graphics or hood. Neutral studio light, genuine transparent alpha and clean edges.

Image 1 is the sole identity reference; image 2 (reviewed apexx master) is style/framing only. Create a polished stylized 3D animated-game character, not a photograph: preserve the first image's face shape, skin tone, hairstyle, facial hair, glasses and body type. Do not inherit invented accessories from old avatars. Centered front-facing upper-chest portrait, complete head, both shoulders, consistent scale, unbranded midnight navy hoodie replacing all sponsor/team graphics, neutral studio lighting and genuine clean alpha. Per-player descriptions specify the visible features. Falconry, Muxeen, Phantom and subsequent groups use original photos; Vitalis/Foria initially used their existing stylized sources and still need original-photo likeness comparison. Original photos stay excluded from the shipped asset set; generation evidence alone does not establish reference/likeness clearance.

Next: finish source/placeholder review, normalize remaining cropped top-team portraits, then proceed through players outside the top 25; inspect all delivered portraits on both light and dark surfaces at roster/profile sizes. No background API job is running.

## Expanded batch and source audit
Batch 07 delivers 40 additional original-photo jersey avatars. All passed alpha checks and were inspected together on dark and light contact sheets; snapshot mapping matched every reviewed player ID. Batch 08 contains 42 visually inspected original portrait sources (teams 31 through 38); its generation and integration status is tracked separately.

Batch 06 submits 31 distinct built-in image requests using visually inspected original photos. Larger submission groups reduce orchestration overhead but do not imply parallel service throughput. Exact duplicate source hashing identified 165 additional placeholder records. Their alternate files were audited separately; exceptions retain alternate candidates where identity review is needed. No random replacement is generated from a faceless placeholder.

## Avatar bulk recovery checkpoint

347 avatars exported; 316-to-347 integration complete. Real portrait sources across the remaining main queue have now been visually reviewed in numbered contact sheets. Approved batch manifests 11-19 preserve exact player IDs and source paths. Large unbounded submission reset the tool host; recovery uses six concurrent built-in image calls and one durable result record per completed player. Do not use API fallback. Never infer a source for faceless placeholders.

Portrait sync now includes reviewed players outside active club rosters; all 316 mappings passed after the repair. Targeted tests: 18/18; TypeScript passed. Top-team selection screenshots at 1920x1080 and 1280x720 were captured after image decoding. No career save was created. No Steam package or Git push performed.
