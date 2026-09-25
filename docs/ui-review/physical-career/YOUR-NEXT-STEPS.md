# Mirage: map review and your next actions

Source: `C:\Users\IsacC\EsportSimulator\public\map-studio\drafts\mirage-user-v12-2026-09-13.json`. SHA-256: `efc599edc2dcfd27d450e734d476ff94426c98bb2ef631e96ca09f63d91a8fe2`. Source drawing unchanged.

Automatic checks found **20 errors and 87 warnings**. These are diagnostic findings, not a legal/content review.

## Do this next

1. Open Map Studio and open the source project above (or export your newer draft and supply that file). Save a new copy before editing.
2. Open Map validation. Compare the reference overlay at both sites, both spawns and mid. Correct alignment before changing heights.
3. Select each unbound red wall from the issue list. Bind its actual floor and vertical span; do not mark everything as a full-height wall. Never auto-approve an uncertain height.
4. Select each green/blue opening. Name it and describe walking/crouching/jumping and whether standing or crouched players can shoot through it. Bind its floor/height. Mark low cover separately from a window.
5. Check CT/T spawn boundaries and A/B plant boundaries. Map validation now reports how many separated player positions it found (target 5/5 for each spawn). Exclude crates and adjacent non-plant ground.
6. Inspect underpass, stairs and ladder connections in Spatial Lab. Author directed connections where required; drawing a green line does not cut a hole in collision geometry.
7. Re-run validation, mark only genuinely reviewed geometry Checked, then Save project and send the exported JSON. Do not move on to every other map yet.

## Checks by zone

- CT spawn area: 85/113 clear samples; 5/5 separated spawn positions; 0 ambiguous floor samples.
- T spawn area: 86/121 clear samples; 5/5 separated spawn positions; 0 ambiguous floor samples.
- A plant zone: 55/88 clear samples; 0 ambiguous floor samples.
- B plant zone: 52/88 clear samples; 0 ambiguous floor samples.

## Mark-specific findings

- **warning / opening-description** — Window / cover 145 (mark 145, ID `f103aabe-6d13-4012-9ccf-54c689aefef2`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Window / cover 145 (mark 145, ID `f103aabe-6d13-4012-9ccf-54c689aefef2`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-description** — Window / cover 146 (mark 146, ID `0da8dd31-ef0a-4857-98a2-d11cb217069c`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Window / cover 146 (mark 146, ID `0da8dd31-ef0a-4857-98a2-d11cb217069c`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-length** — Window / cover 146 (mark 146, ID `0da8dd31-ef0a-4857-98a2-d11cb217069c`): This opening spans more than 5% of the radar. Check that it marks one opening or cover edge, rather than a whole corridor.
- **warning / opening-description** — Window / cover 147 (mark 147, ID `bf5debe6-6f5b-47d3-af0d-7ad0c6d746a8`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Window / cover 147 (mark 147, ID `bf5debe6-6f5b-47d3-af0d-7ad0c6d746a8`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-description** — Window / cover 148 (mark 148, ID `a3bebe3e-7770-477f-9610-fef4a4b35ee8`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Window / cover 148 (mark 148, ID `a3bebe3e-7770-477f-9610-fef4a4b35ee8`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-overlap** — Window / cover 148 (mark 148, ID `a3bebe3e-7770-477f-9610-fef4a4b35ee8`): A blue marking and a green passage share these endpoints. Clarify whether walking and shooting use different heights, or keep the single intended type.
- **warning / opening-wall-overlap** — Window / cover 148 (mark 148, ID `a3bebe3e-7770-477f-9610-fef4a4b35ee8`): This opening overlaps a red segment in 2D. Review their heights and leave the intended opening clear; green/blue markings do not erase walls.
- **warning / opening-description** — Window / cover 149 (mark 149, ID `f46362e8-cfb6-43a4-997c-abdc805b0afd`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Window / cover 149 (mark 149, ID `f46362e8-cfb6-43a4-997c-abdc805b0afd`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-wall-overlap** — Window / cover 149 (mark 149, ID `f46362e8-cfb6-43a4-997c-abdc805b0afd`): This opening overlaps a red segment in 2D. Review their heights and leave the intended opening clear; green/blue markings do not erase walls.
- **warning / opening-description** — Window / cover 150 (mark 150, ID `2f856572-c483-4fb4-8c95-713eb8600dcc`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Window / cover 150 (mark 150, ID `2f856572-c483-4fb4-8c95-713eb8600dcc`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-description** — Window / cover 151 (mark 151, ID `5fd6942b-1c61-4e07-9a64-4b1cb129b6a8`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Window / cover 151 (mark 151, ID `5fd6942b-1c61-4e07-9a64-4b1cb129b6a8`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-overlap** — Window / cover 151 (mark 151, ID `5fd6942b-1c61-4e07-9a64-4b1cb129b6a8`): A blue marking and a green passage share these endpoints. Clarify whether walking and shooting use different heights, or keep the single intended type.
- **warning / opening-description** — Passage 152 (mark 152, ID `3cb0bb2a-0d74-476a-b2dc-8a06db07126e`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Passage 152 (mark 152, ID `3cb0bb2a-0d74-476a-b2dc-8a06db07126e`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-overlap** — Passage 152 (mark 152, ID `3cb0bb2a-0d74-476a-b2dc-8a06db07126e`): A blue marking and a green passage share these endpoints. Clarify whether walking and shooting use different heights, or keep the single intended type.
- **warning / opening-description** — Passage 153 (mark 153, ID `c8e94615-8e0d-4ffa-802c-e267e8f82aee`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Passage 153 (mark 153, ID `c8e94615-8e0d-4ffa-802c-e267e8f82aee`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-wall-overlap** — Passage 153 (mark 153, ID `c8e94615-8e0d-4ffa-802c-e267e8f82aee`): This opening overlaps a red segment in 2D. Review their heights and leave the intended opening clear; green/blue markings do not erase walls.
- **warning / opening-description** — Passage 154 (mark 154, ID `99cb29f0-9a83-447d-852b-64614bfb83b2`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Passage 154 (mark 154, ID `99cb29f0-9a83-447d-852b-64614bfb83b2`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-description** — Passage 155 (mark 155, ID `0f714a84-bf2d-4212-a2c8-e60f174b1269`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Passage 155 (mark 155, ID `0f714a84-bf2d-4212-a2c8-e60f174b1269`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-description** — Passage 156 (mark 156, ID `fbc0a38d-d702-48d9-a1d8-d34c58fded46`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Passage 156 (mark 156, ID `fbc0a38d-d702-48d9-a1d8-d34c58fded46`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-overlap** — Passage 156 (mark 156, ID `fbc0a38d-d702-48d9-a1d8-d34c58fded46`): A blue marking and a green passage share these endpoints. Clarify whether walking and shooting use different heights, or keep the single intended type.
- **warning / opening-wall-overlap** — Passage 156 (mark 156, ID `fbc0a38d-d702-48d9-a1d8-d34c58fded46`): This opening overlaps a red segment in 2D. Review their heights and leave the intended opening clear; green/blue markings do not erase walls.
- **warning / opening-description** — Passage 157 (mark 157, ID `ddfea598-400f-45f5-bcbd-488adae30d6e`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Passage 157 (mark 157, ID `ddfea598-400f-45f5-bcbd-488adae30d6e`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-wall-overlap** — Passage 157 (mark 157, ID `ddfea598-400f-45f5-bcbd-488adae30d6e`): This opening overlaps a red segment in 2D. Review their heights and leave the intended opening clear; green/blue markings do not erase walls.
- **warning / opening-description** — Passage 158 (mark 158, ID `f122aa94-2dcc-4b7e-9bf3-46578d1f1a40`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Passage 158 (mark 158, ID `f122aa94-2dcc-4b7e-9bf3-46578d1f1a40`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-description** — Passage 159 (mark 159, ID `562b484b-f81b-4670-bae1-05d260f4e178`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Passage 159 (mark 159, ID `562b484b-f81b-4670-bae1-05d260f4e178`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-description** — Passage 160 (mark 160, ID `cf451d24-d59c-4818-b4dd-dc3a741db62b`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Passage 160 (mark 160, ID `cf451d24-d59c-4818-b4dd-dc3a741db62b`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-description** — Passage 161 (mark 161, ID `32665513-5010-41df-bb93-dcf38f108df6`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Passage 161 (mark 161, ID `32665513-5010-41df-bb93-dcf38f108df6`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-description** — Passage 162 (mark 162, ID `950ac9ae-8d63-422e-88fb-690687226a2d`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Passage 162 (mark 162, ID `950ac9ae-8d63-422e-88fb-690687226a2d`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-description** — Passage 163 (mark 163, ID `461a3100-5da8-494c-9c8c-801be89a7118`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Passage 163 (mark 163, ID `461a3100-5da8-494c-9c8c-801be89a7118`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-description** — Passage 164 (mark 164, ID `89c7eb72-e4b9-4962-8c58-801f2b341efc`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Passage 164 (mark 164, ID `89c7eb72-e4b9-4962-8c58-801f2b341efc`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-description** — Passage 165 (mark 165, ID `f1598fea-a05e-40e9-9a5a-97d7c2b8ef01`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Passage 165 (mark 165, ID `f1598fea-a05e-40e9-9a5a-97d7c2b8ef01`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-description** — Passage 166 (mark 166, ID `570d443f-73ac-4397-a7a9-b83cb21ebe28`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Passage 166 (mark 166, ID `570d443f-73ac-4397-a7a9-b83cb21ebe28`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-description** — Passage 167 (mark 167, ID `94420399-119a-4a08-86af-d9232ff4797e`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Passage 167 (mark 167, ID `94420399-119a-4a08-86af-d9232ff4797e`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-description** — Passage 168 (mark 168, ID `464426c3-0319-459d-bc2f-76dfbb89f51a`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Passage 168 (mark 168, ID `464426c3-0319-459d-bc2f-76dfbb89f51a`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / opening-description** — Passage 169 (mark 169, ID `afe5f9f8-a07a-4660-8b8d-238b72816b4b`): Name this opening and describe walking, crouching, jumping and shooting. Blue defaults to Window; choose Low cover or Jump / climb when appropriate.
- **warning / opening-height** — Passage 169 (mark 169, ID `afe5f9f8-a07a-4660-8b8d-238b72816b4b`): This opening has no floor / height binding. Its drawing does not create a walkable or shootable opening.
- **warning / alignment-review**: Image alignment is provisional. Compare landmarks before marking it reviewed.
- **warning / draft** — Wall 1 (mark 1, ID `outline:Mirage:upper:0`): This geometry has not been checked by its author.
- **error / unbound-height** — Wall 1 (mark 1, ID `outline:Mirage:upper:0`): Choose the floor and height range for this marking.
- **warning / draft** — Wall 2 (mark 2, ID `9e031950-9176-465d-b858-55629a85fc52`): This geometry has not been checked by its author.
- **error / unbound-height** — Wall 2 (mark 2, ID `9e031950-9176-465d-b858-55629a85fc52`): Choose the floor and height range for this marking.
- **warning / draft** — Wall 3 (mark 3, ID `7a9570ca-72d4-49f9-98c4-8ca869ad0c98`): This geometry has not been checked by its author.
- **error / unbound-height** — Wall 3 (mark 3, ID `7a9570ca-72d4-49f9-98c4-8ca869ad0c98`): Choose the floor and height range for this marking.
- **warning / draft** — Wall 4 (mark 4, ID `3ab9374d-0b4a-4e35-80c1-279a00cef173`): This geometry has not been checked by its author.
- **error / unbound-height** — Wall 4 (mark 4, ID `3ab9374d-0b4a-4e35-80c1-279a00cef173`): Choose the floor and height range for this marking.
- **warning / draft** — Wall 5 (mark 5, ID `6e167c55-b797-4513-b72e-d65a35f84d32`): This geometry has not been checked by its author.
- **error / unbound-height** — Wall 5 (mark 5, ID `6e167c55-b797-4513-b72e-d65a35f84d32`): Choose the floor and height range for this marking.
- **warning / draft** — Wall 6 (mark 6, ID `bde215a4-480e-49c4-b9ea-344115a521ce`): This geometry has not been checked by its author.
- **error / unbound-height** — Wall 6 (mark 6, ID `bde215a4-480e-49c4-b9ea-344115a521ce`): Choose the floor and height range for this marking.
- **warning / draft** — Wall 7 (mark 7, ID `e7000224-c560-4b93-9d64-2459cf57d157`): This geometry has not been checked by its author.
- **error / unbound-height** — Wall 7 (mark 7, ID `e7000224-c560-4b93-9d64-2459cf57d157`): Choose the floor and height range for this marking.
- **warning / draft** — Wall 8 (mark 8, ID `bed28f21-6d3f-474a-afb6-3de54088e521`): This geometry has not been checked by its author.
- **error / unbound-height** — Wall 8 (mark 8, ID `bed28f21-6d3f-474a-afb6-3de54088e521`): Choose the floor and height range for this marking.
- **warning / draft** — Wall 9 (mark 9, ID `47e5c5ae-b0a1-4379-8d68-1510dbb78871`): This geometry has not been checked by its author.
- **error / unbound-height** — Wall 9 (mark 9, ID `47e5c5ae-b0a1-4379-8d68-1510dbb78871`): Choose the floor and height range for this marking.
- **warning / draft** — Wall 10 (mark 10, ID `f0791d45-7988-4d66-ad67-80f641a525a9`): This geometry has not been checked by its author.
- **error / unbound-height** — Wall 10 (mark 10, ID `f0791d45-7988-4d66-ad67-80f641a525a9`): Choose the floor and height range for this marking.
- **warning / draft** — Wall 11 (mark 11, ID `26cb7ff5-1aac-460d-8138-752576c0c9be`): This geometry has not been checked by its author.
- **error / unbound-height** — Wall 11 (mark 11, ID `26cb7ff5-1aac-460d-8138-752576c0c9be`): Choose the floor and height range for this marking.
- **warning / draft** — Wall 12 (mark 12, ID `2737add1-48bd-49f3-8f71-aefdf52320c9`): This geometry has not been checked by its author.
- **error / unbound-height** — Wall 12 (mark 12, ID `2737add1-48bd-49f3-8f71-aefdf52320c9`): Choose the floor and height range for this marking.
- **warning / draft** — Wall 13 (mark 13, ID `ed36e494-8758-4206-b04c-8d64288dc70f`): This geometry has not been checked by its author.
- **error / unbound-height** — Wall 13 (mark 13, ID `ed36e494-8758-4206-b04c-8d64288dc70f`): Choose the floor and height range for this marking.
- **warning / draft** — Wall 14 (mark 14, ID `908e3b2c-f94e-429f-a788-7b68853a6491`): This geometry has not been checked by its author.
- **error / unbound-height** — Wall 14 (mark 14, ID `908e3b2c-f94e-429f-a788-7b68853a6491`): Choose the floor and height range for this marking.
- **warning / draft** — Wall 15 (mark 15, ID `9c0839c2-2f6d-447c-aed2-837a36b163de`): This geometry has not been checked by its author.
- **error / unbound-height** — Wall 15 (mark 15, ID `9c0839c2-2f6d-447c-aed2-837a36b163de`): Choose the floor and height range for this marking.
- **warning / draft** — CT spawn area (mark 139, ID `039da054-317d-4865-909e-bf938f08281f`): This geometry has not been checked by its author.
- **error / floor-coverage** — CT spawn area (mark 139, ID `039da054-317d-4865-909e-bf938f08281f`): 18 samples lack this floor; 0 overlap different floors. Refine the polygon or height range.
- **warning / body-clearance** — CT spawn area (mark 139, ID `039da054-317d-4865-909e-bf938f08281f`): 10 samples are too close to an edge or obstruction. Only clear inset points can be used.
- **warning / draft** — T spawn area (mark 140, ID `d279ad51-a4b3-4d81-8860-067c3ad072c0`): This geometry has not been checked by its author.
- **warning / body-clearance** — T spawn area (mark 140, ID `d279ad51-a4b3-4d81-8860-067c3ad072c0`): 35 samples are too close to an edge or obstruction. Only clear inset points can be used.
- **warning / draft** — A plant zone (mark 141, ID `64aa2728-d3ba-4306-8287-83a0b7052483`): This geometry has not been checked by its author.
- **error / floor-coverage** — A plant zone (mark 141, ID `64aa2728-d3ba-4306-8287-83a0b7052483`): 22 samples lack this floor; 0 overlap different floors. Refine the polygon or height range.
- **warning / body-clearance** — A plant zone (mark 141, ID `64aa2728-d3ba-4306-8287-83a0b7052483`): 11 samples are too close to an edge or obstruction. Only clear inset points can be used.
- **warning / draft** — B plant zone (mark 142, ID `5bbc7ff9-1edc-41da-80d2-0dcdfd14d30d`): This geometry has not been checked by its author.
- **error / floor-coverage** — B plant zone (mark 142, ID `5bbc7ff9-1edc-41da-80d2-0dcdfd14d30d`): 25 samples lack this floor; 0 overlap different floors. Refine the polygon or height range.
- **warning / body-clearance** — B plant zone (mark 142, ID `5bbc7ff9-1edc-41da-80d2-0dcdfd14d30d`): 11 samples are too close to an edge or obstruction. Only clear inset points can be used.
- **warning / draft** — Wall 143 (mark 143, ID `8c9791f2-b3d0-4c10-89a1-250c3e76fb28`): This geometry has not been checked by its author.
- **error / unbound-height** — Wall 143 (mark 143, ID `8c9791f2-b3d0-4c10-89a1-250c3e76fb28`): Choose the floor and height range for this marking.
- **warning / draft** — Wall 144 (mark 144, ID `e4b4df85-f252-435c-934c-c11e2a97d2db`): This geometry has not been checked by its author.
- **error / unbound-height** — Wall 144 (mark 144, ID `e4b4df85-f252-435c-934c-c11e2a97d2db`): Choose the floor and height range for this marking.
- **warning / reference-limits**: Sampled static reference checks are not full collision certification. Release inclusion remains held for review and content clearance.

## Work handled in development

- Bind physical events to career player IDs, round results, scoreboard and replay; preserve old-save compatibility.
- Model purchased loadouts, player attributes, objective polygons and traversal before enabling the physical engine in careers.
- Finish worker ownership, exactly-once payouts, real-browser resume-to-results checks and packaged Windows/Steam testing.
- A separate 5v5 lab review file was generated from clear spawn samples. It uses provisional lab rules and unreviewed drawings; it is not a validated career match.
