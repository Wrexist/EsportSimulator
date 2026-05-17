#!/usr/bin/env python3
"""One-shot script to add `branding` metadata to top-30 teams in teams.json.
Idempotent: re-running overwrites the branding field but leaves other fields alone."""
import json
from collections import OrderedDict
from pathlib import Path

TEAMS_PATH = Path("/home/user/EsportSimulator/public/data/snapshot/teams.json")

# id -> branding
# Colors are chosen to evoke the inspired-by org's palette without
# duplicating any trademarked logo. logoStyle drives the SVG redesign in
# Phase 3 (monogram = letter mark, mascot = animal silhouette,
# emblem = abstract shape/crest, wordmark = stylized text).
BRANDING = {
    # ----- ELITE (top 10) -----
    "team_1_vitalis":       {"primaryColor": "#FFEE00", "secondaryColor": "#1A1A1A", "accentColor": "#FFFFFF", "logoStyle": "mascot"},   # Vitality (yellow/black, bee)
    "team_2_foria":         {"primaryColor": "#000000", "secondaryColor": "#1A1A1A", "accentColor": "#00C896", "logoStyle": "mascot"},   # Furia (black, green eye, panther)
    "team_3_falconry":      {"primaryColor": "#FACC15", "secondaryColor": "#1F2937", "accentColor": "#FFFFFF", "logoStyle": "mascot"},   # Falcons (gold, falcon wing)
    "team_4_muxeen":        {"primaryColor": "#E2061B", "secondaryColor": "#0B0B0B", "accentColor": "#FFFFFF", "logoStyle": "wordmark"}, # MOUZ (red wordmark)
    "team_5_phantom":       {"primaryColor": "#8B5CF6", "secondaryColor": "#1F0A2E", "accentColor": "#FFFFFF", "logoStyle": "emblem"},   # Spirit (purple/dark)
    "team_6_perivesion":    {"primaryColor": "#EC4899", "secondaryColor": "#0B0B0B", "accentColor": "#FFFFFF", "logoStyle": "monogram"}, # paiN (pink/black)
    "team_7_phaze":         {"primaryColor": "#DC2626", "secondaryColor": "#0B0B0B", "accentColor": "#FFFFFF", "logoStyle": "wordmark"}, # FaZe (red/black wordmark)
    "team_8_natusvincera":  {"primaryColor": "#FFD700", "secondaryColor": "#0B0B0B", "accentColor": "#FFFFFF", "logoStyle": "wordmark"}, # NaVi (yellow/black)
    "team_9_gtwo":          {"primaryColor": "#FFFFFF", "secondaryColor": "#1F2937", "accentColor": "#DC2626", "logoStyle": "monogram"}, # G2 (white/charcoal/red dot)
    "team_10_thenomads":    {"primaryColor": "#DC2626", "secondaryColor": "#1F2937", "accentColor": "#FFFFFF", "logoStyle": "emblem"},   # MongolZ (red/dark)
    # ----- PRO (11-30) -----
    "team_11_eurora":       {"primaryColor": "#06B6D4", "secondaryColor": "#1E3A8A", "accentColor": "#A855F7", "logoStyle": "emblem"},   # Aurora (cyan/blue/purple)
    "team_12_astraflux":    {"primaryColor": "#1E40AF", "secondaryColor": "#0B0B0B", "accentColor": "#FFFFFF", "logoStyle": "emblem"},   # Astralis (deep blue star)
    "team_13_3dmax":        {"primaryColor": "#F97316", "secondaryColor": "#0B0B0B", "accentColor": "#FFFFFF", "logoStyle": "wordmark"}, # 3DMAX (orange/black)
    "team_14_fut":          {"primaryColor": "#8B5CF6", "secondaryColor": "#1F2937", "accentColor": "#FFFFFF", "logoStyle": "monogram"}, # FUT (purple)
    "team_15_centuryrogues":{"primaryColor": "#DC2626", "secondaryColor": "#0B0B0B", "accentColor": "#FFFFFF", "logoStyle": "emblem"},   # 100T (red/black)
    "team_15_tide":         {"primaryColor": "#0EA5E9", "secondaryColor": "#1E3A8A", "accentColor": "#FFFFFF", "logoStyle": "mascot"},   # Liquid (blue/horse)
    "team_16_b8":           {"primaryColor": "#FACC15", "secondaryColor": "#0B0B0B", "accentColor": "#FFFFFF", "logoStyle": "monogram"}, # B8 (yellow/black)
    "team_17_pazsyonoa":    {"primaryColor": "#FCD34D", "secondaryColor": "#1F2937", "accentColor": "#1E3A8A", "logoStyle": "wordmark"}, # paiN-OA / Passion (yellow/blue)
    "team_18_sting":        {"primaryColor": "#FACC15", "secondaryColor": "#1F2937", "accentColor": "#FFFFFF", "logoStyle": "mascot"},   # Spirit-like (gold)
    "team_19_nrg":          {"primaryColor": "#84CC16", "secondaryColor": "#0B0B0B", "accentColor": "#FFFFFF", "logoStyle": "monogram"}, # NRG (lime/black)
    "team_20_gamerleague":  {"primaryColor": "#FACC15", "secondaryColor": "#1F2937", "accentColor": "#FFFFFF", "logoStyle": "emblem"},   # GamerLegion (gold)
    "team_21_novainvaders": {"primaryColor": "#FACC15", "secondaryColor": "#0B0B0B", "accentColor": "#FFFFFF", "logoStyle": "emblem"},   # NIP (yellow/black ninja)
    "team_22_valiant":      {"primaryColor": "#DC2626", "secondaryColor": "#1F2937", "accentColor": "#FFFFFF", "logoStyle": "emblem"},   # Heroic (red)
    "team_22_virtusnova":   {"primaryColor": "#F97316", "secondaryColor": "#0B0B0B", "accentColor": "#FFFFFF", "logoStyle": "emblem"},   # VP (orange)
    "team_23_imperius":     {"primaryColor": "#14B8A6", "secondaryColor": "#1F2937", "accentColor": "#FFFFFF", "logoStyle": "emblem"},   # Imperial (teal crown)
    "team_24_a81":          {"primaryColor": "#FACC15", "secondaryColor": "#1F2937", "accentColor": "#FFFFFF", "logoStyle": "monogram"}, # M80 / 9z-adjacent
    "team_25_lineage":      {"primaryColor": "#DC2626", "secondaryColor": "#1F2937", "accentColor": "#FCD34D", "logoStyle": "emblem"},   # Legacy (red/gold)
    "team_26_bkkame":       {"primaryColor": "#DC2626", "secondaryColor": "#1F2937", "accentColor": "#FFFFFF", "logoStyle": "wordmark"}, # BetBoom (red)
    "team_27_gantlemotex":  {"primaryColor": "#F97316", "secondaryColor": "#1F2937", "accentColor": "#FACC15", "logoStyle": "emblem"},   # Eternal Fire (orange/gold)
    "team_28_mbesports":    {"primaryColor": "#4ADE80", "secondaryColor": "#1F2937", "accentColor": "#FACC15", "logoStyle": "emblem"},   # MIBR (green/gold)
    "team_29_flycrest":     {"primaryColor": "#06B6D4", "secondaryColor": "#1F2937", "accentColor": "#FFFFFF", "logoStyle": "emblem"},   # FlyQuest (cyan)
    "team_30_taroo":        {"primaryColor": "#DC2626", "secondaryColor": "#1F2937", "accentColor": "#FFFFFF", "logoStyle": "wordmark"}, # TYLOO (red)
}

def main() -> None:
    with TEAMS_PATH.open("r", encoding="utf-8") as f:
        teams = json.load(f, object_pairs_hook=OrderedDict)

    updated = 0
    for t in teams:
        tid = t.get("id")
        if tid in BRANDING:
            t["branding"] = BRANDING[tid]
            updated += 1

    # Ensure every top-30 ID we expected was found
    found_ids = {t["id"] for t in teams if t.get("id") in BRANDING}
    missing = set(BRANDING) - found_ids
    if missing:
        raise SystemExit(f"Missing team IDs in teams.json: {sorted(missing)}")

    with TEAMS_PATH.open("w", encoding="utf-8") as f:
        json.dump(teams, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Updated branding for {updated} teams.")

if __name__ == "__main__":
    main()
