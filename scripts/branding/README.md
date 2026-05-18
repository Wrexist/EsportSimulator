# Team branding generators

Idempotent Python scripts that populate `branding` metadata and write
logo SVGs into `public/data/snapshot/teams.json` and
`public/assets/teams/*/logo.svg`. Re-running any of them produces the
same output as the last run, so they're safe to invoke after a
snapshot regeneration.

Run order if starting from a fresh snapshot:

```
python3 scripts/branding/apply_top30_branding.py     # branding for top-30 only
python3 scripts/branding/apply_top30_renames.py      # name/shortName tweaks
python3 scripts/branding/generate_top30_logos.py     # hand-crafted SVGs
python3 scripts/branding/extend_branding_all.py      # fills in everyone else
node scripts/validateData.mjs                        # sanity-check
```

Runtime fallback for any team that *still* arrives without a `branding`
record (mod-loaded teams, pre-v7 saves) is handled by
`lib/branding/fallback.ts`, which uses the same FNV-1a hash and palette
as `extend_branding_all.py` — so a team branded offline and a team
branded at runtime land on the same colors.
