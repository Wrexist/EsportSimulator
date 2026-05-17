#!/usr/bin/env python3
"""Apply conservative, safe-branding-compliant team renames matching the
user's reference mock. Updates teams.json name + shortName only — IDs and
logoPath stay stable so rosters and assets don't break."""
import json
from collections import OrderedDict
from pathlib import Path

TEAMS_PATH = Path("/home/user/EsportSimulator/public/data/snapshot/teams.json")

# id -> (new_name, new_shortName)
# Only renames that match the reference mock and don't trip
# FORBIDDEN_SUBSTRINGS in lib/safe-branding/name-transform.ts.
RENAMES = {
    "team_1_vitalis":     ("Vitals",     "VITL"),
    "team_5_phantom":     ("Specter",    "SPCR"),
    "team_10_thenomads":  ("Nomads",     "NMDS"),
    "team_12_astraflux":  ("Astralians", "ASTR"),
}


def main() -> None:
    with TEAMS_PATH.open("r", encoding="utf-8") as f:
        teams = json.load(f, object_pairs_hook=OrderedDict)

    updated = 0
    for t in teams:
        tid = t.get("id")
        if tid in RENAMES:
            new_name, new_short = RENAMES[tid]
            t["name"] = new_name
            t["shortName"] = new_short
            updated += 1

    found_ids = {t["id"] for t in teams if t.get("id") in RENAMES}
    missing = set(RENAMES) - found_ids
    if missing:
        raise SystemExit(f"Missing team IDs: {sorted(missing)}")

    with TEAMS_PATH.open("w", encoding="utf-8") as f:
        json.dump(teams, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Renamed {updated} teams.")


if __name__ == "__main__":
    main()
