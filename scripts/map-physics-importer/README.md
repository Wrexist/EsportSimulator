# Source 2 physics inspection importer

Build: `dotnet build -c Release` (.NET 10).
Run: `dotnet bin/Release/net10.0/MapPhysicsImporter.dll input.vmdl_c output.json`.

Reads the PHYS block with ValveResourceFormat 20.0.6980. Exports hull vertex positions and bounds with collision/surface indices; triangle meshes are summarized, not converted into runtime geometry. Collision indices are local to each source resource. The output must not be treated as a single collision mesh or as a license grant. Keep original resources and their hashes alongside a local inspection.

Collision records include interact-as tags, exclusions and the collision group (with the older physics-tag fallback). Add `--geometry` as the final argument to include mesh vertices and triangle indices for local inspection. This does not activate native geometry in the game. The Anubis interior-boundary audit uses these records to distinguish default-solid vertical faces from player-excluded, sky and clip-only geometry. Detailed exports belong under `tmp`, not in public assets.

`../launch/import-mirage-native.ts` consumes the local A/B trigger inspection, entity DATA text and installed nav export. It checks that navigation exactly matches the existing registered reference and refuses transformed/complex bomb triggers instead of silently producing incorrect coordinates. It preserves owner walls, openings, spawn polygons and utilities. Imported spawn pins and site projections are drafts.
