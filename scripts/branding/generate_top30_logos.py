#!/usr/bin/env python3
"""Generate distinctive SVG logos for the top-30 teams.

Each logo is a 256x256 SVG using the team's branding colors (primary,
secondary, accent) from teams.json. Designs are original — they evoke
the inspired-by org's visual category (mascot / monogram / emblem /
wordmark) without copying any trademarked mark.

Logos go to public/assets/teams/{folder}/logo.svg, where {folder}
is the existing folder per teamID.logoPath. The script is idempotent:
re-running overwrites cleanly.
"""
import json
from pathlib import Path

ROOT = Path("/home/user/EsportSimulator")
TEAMS_JSON = ROOT / "public/data/snapshot/teams.json"
ASSETS_DIR = ROOT / "public"  # logoPath is "/assets/teams/x/logo.svg"

# ============================================================
# SVG TEMPLATES
# ------------------------------------------------------------
# Each function returns the SVG body (string) for one team.
# `c` is the branding dict: primaryColor, secondaryColor, accentColor.
# `name` is the display name (used for aria-label only).
# `letter` is the monogram letter (1-3 chars) drawn on the mark.
# ============================================================


def hdr(name: str) -> str:
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="{name} logo">'


def hex_shield(c, letter, name):
    # Vitality-style hex with bold letter
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<polygon points="128,16 232,76 232,180 128,240 24,180 24,76" fill="{p}" stroke="{s}" stroke-width="10"/>'
        + f'<polygon points="128,44 208,90 208,166 128,212 48,166 48,90" fill="none" stroke="{s}" stroke-width="3" opacity="0.45"/>'
        + f'<text x="128" y="172" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="900" font-size="140" fill="{s}" letter-spacing="-4">{letter}</text>'
        + "</svg>"
    )


def panther_diamond(c, letter, name):
    # Furia-style: dark diamond with green slash and stylized cat eye
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<polygon points="128,20 236,128 128,236 20,128" fill="{p}" stroke="{a}" stroke-width="6"/>'
        + f'<path d="M64 100 L192 60 L192 80 L84 120 Z" fill="{a}" opacity="0.85"/>'
        + f'<circle cx="98" cy="150" r="14" fill="{a}"/>'
        + f'<circle cx="158" cy="150" r="14" fill="{a}"/>'
        + f'<polygon points="120,180 136,180 128,200" fill="{a}"/>'
        + "</svg>"
    )


def wing_crest(c, letter, name):
    # Falcons-style: outstretched wing on circular ground
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<circle cx="128" cy="128" r="108" fill="{p}" stroke="{s}" stroke-width="8"/>'
        + f'<path d="M40 140 Q80 80 128 96 Q176 80 216 140 Q176 130 128 128 Q80 130 40 140 Z" fill="{s}"/>'
        + f'<path d="M64 154 Q104 120 128 132 Q152 120 192 154" stroke="{s}" stroke-width="6" fill="none" stroke-linecap="round"/>'
        + f'<polygon points="120,170 136,170 128,196" fill="{s}"/>'
        + "</svg>"
    )


def wordmark_block(c, letter, name, tag):
    # MOUZ / 3DMAX / TYLOO style: bold letters on dark slab with primary stripe
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    # Use tag (2-5 chars) shrunk to fit
    size = 100 if len(tag) <= 3 else (78 if len(tag) <= 4 else 60)
    return (
        hdr(name)
        + f'<rect x="20" y="48" width="216" height="160" rx="14" fill="{s}" stroke="{p}" stroke-width="6"/>'
        + f'<rect x="20" y="48" width="216" height="22" fill="{p}"/>'
        + f'<rect x="20" y="186" width="216" height="22" fill="{p}"/>'
        + f'<text x="128" y="158" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="900" font-size="{size}" fill="{p}" letter-spacing="2">{tag}</text>'
        + "</svg>"
    )


def specter_chevron(c, letter, name):
    # Spirit-style: downward chevron with trailing wisp
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<circle cx="128" cy="128" r="108" fill="{s}" stroke="{p}" stroke-width="6"/>'
        + f'<path d="M48 92 L128 192 L208 92 L168 92 L128 144 L88 92 Z" fill="{p}"/>'
        + f'<path d="M88 70 Q128 50 168 70" stroke="{a}" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.7"/>'
        + "</svg>"
    )


def pain_monogram(c, letter, name):
    # paiN-style: black background with pink "1" and dot
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<rect x="20" y="20" width="216" height="216" rx="20" fill="{s}"/>'
        + f'<rect x="106" y="72" width="44" height="124" fill="{p}"/>'
        + f'<polygon points="80,72 128,52 128,112 80,112" fill="{p}"/>'
        + f'<circle cx="194" cy="78" r="14" fill="{p}"/>'
        + "</svg>"
    )


def phaze_arrow(c, letter, name):
    # FaZe-style: bold red arrow on black slab
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<rect x="20" y="20" width="216" height="216" rx="18" fill="{s}"/>'
        + f'<polygon points="48,128 168,48 168,96 232,96 232,160 168,160 168,208" fill="{p}"/>'
        + f'<text x="38" y="222" font-family="Inter, Arial, sans-serif" font-weight="900" font-size="36" fill="{p}" letter-spacing="2">PHAZE</text>'
        + "</svg>"
    )


def navee_star(c, letter, name):
    # NaVi-style: yellow geometric mark on black
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<rect x="20" y="20" width="216" height="216" rx="18" fill="{s}"/>'
        + f'<polygon points="128,40 156,108 228,108 170,150 192,220 128,176 64,220 86,150 28,108 100,108" fill="{p}"/>'
        + "</svg>"
    )


def g2_monogram(c, letter, name):
    # G2-style: charcoal slab with white G2 and red triangle accent
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<rect x="20" y="20" width="216" height="216" rx="18" fill="{s}"/>'
        + f'<polygon points="216,20 236,20 236,56" fill="{a}"/>'
        + f'<text x="128" y="172" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="900" font-size="140" fill="{p}" letter-spacing="-6">G2</text>'
        + "</svg>"
    )


def crown_crest(c, letter, name):
    # Heroic / MongolZ style: crown on circular crest
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<circle cx="128" cy="128" r="108" fill="{s}" stroke="{p}" stroke-width="6"/>'
        + f'<path d="M64 152 L80 96 L104 128 L128 80 L152 128 L176 96 L192 152 L64 152 Z" fill="{p}"/>'
        + f'<rect x="64" y="160" width="128" height="14" fill="{p}"/>'
        + f'<circle cx="80" cy="96" r="6" fill="{a}"/>'
        + f'<circle cx="128" cy="78" r="6" fill="{a}"/>'
        + f'<circle cx="176" cy="96" r="6" fill="{a}"/>'
        + "</svg>"
    )


def aurora_diamond(c, letter, name):
    # Aurora-style: gradient diamond with bands
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<defs><linearGradient id="aurg" x1="0" y1="0" x2="1" y2="1">'
        + f'<stop offset="0%" stop-color="{p}"/><stop offset="55%" stop-color="{s}"/><stop offset="100%" stop-color="{a}"/>'
        + f"</linearGradient></defs>"
        + f'<polygon points="128,20 236,128 128,236 20,128" fill="url(#aurg)" stroke="#0B1220" stroke-width="6"/>'
        + f'<polyline points="60,128 100,108 128,140 156,108 196,128" stroke="#FFFFFF" stroke-width="4" fill="none" stroke-linejoin="round" opacity="0.9"/>'
        + "</svg>"
    )


def astralis_star(c, letter, name):
    # Astralis-style: 5-pointed star on dark hex
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<polygon points="128,16 232,76 232,180 128,240 24,180 24,76" fill="{s}" stroke="{p}" stroke-width="6"/>'
        + f'<polygon points="128,52 152,118 222,118 166,158 188,224 128,184 68,224 90,158 34,118 104,118" fill="{p}"/>'
        + "</svg>"
    )


def cube_3d(c, letter, name):
    # 3DMAX-style: isometric cube
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<rect x="20" y="20" width="216" height="216" rx="16" fill="{s}"/>'
        + f'<polygon points="128,48 208,90 208,170 128,212 48,170 48,90" fill="{p}"/>'
        + f'<polygon points="128,48 208,90 128,132 48,90" fill="#FFFFFF" opacity="0.18"/>'
        + f'<polygon points="48,90 128,132 128,212 48,170" fill="#000000" opacity="0.22"/>'
        + f'<text x="128" y="200" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="900" font-size="34" fill="{p}" letter-spacing="2">3DMAX</text>'
        + "</svg>"
    )


def fut_monogram(c, letter, name):
    # Purple slab with cut "F"
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<rect x="20" y="20" width="216" height="216" rx="18" fill="{s}"/>'
        + f'<rect x="20" y="20" width="216" height="22" fill="{p}"/>'
        + f'<text x="128" y="180" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="900" font-size="140" fill="{p}" letter-spacing="-6">FUT</text>'
        + "</svg>"
    )


def rogue_skull(c, letter, name):
    # 100T-style: bold "100" wordmark with diagonal slash
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<rect x="20" y="20" width="216" height="216" rx="18" fill="{s}"/>'
        + f'<line x1="40" y1="200" x2="216" y2="40" stroke="{p}" stroke-width="10" stroke-linecap="round"/>'
        + f'<text x="128" y="172" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="900" font-size="100" fill="{p}" letter-spacing="-2">100</text>'
        + "</svg>"
    )


def horse_silhouette(c, letter, name):
    # Liquid-style: stylized horse head silhouette on blue
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<circle cx="128" cy="128" r="108" fill="{p}" stroke="{s}" stroke-width="8"/>'
        + f'<path d="M88 92 L96 64 L128 76 L156 56 L172 92 L188 132 L172 196 L132 196 L132 156 L116 156 L116 196 L84 196 L80 144 Z" fill="{a}"/>'
        + f'<circle cx="148" cy="108" r="4" fill="{s}"/>'
        + "</svg>"
    )


def octagon_mono(c, letter, name):
    # Octagon with tag
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<polygon points="80,20 176,20 236,80 236,176 176,236 80,236 20,176 20,80" fill="{p}" stroke="{s}" stroke-width="8"/>'
        + f'<text x="128" y="174" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="900" font-size="130" fill="{s}" letter-spacing="-4">{letter}</text>'
        + "</svg>"
    )


def crown_wordmark(c, letter, name, tag):
    # Crown above team tag
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    size = 70 if len(tag) <= 4 else 52
    return (
        hdr(name)
        + f'<rect x="20" y="20" width="216" height="216" rx="18" fill="{s}"/>'
        + f'<path d="M56 96 L72 56 L100 84 L128 44 L156 84 L184 56 L200 96 L188 116 L68 116 Z" fill="{p}"/>'
        + f'<rect x="56" y="124" width="144" height="10" fill="{p}"/>'
        + f'<text x="128" y="200" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="900" font-size="{size}" fill="{a}" letter-spacing="2">{tag}</text>'
        + "</svg>"
    )


def stinger_dart(c, letter, name):
    # Spirit-adjacent: vertical dart/stinger
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<rect x="20" y="20" width="216" height="216" rx="18" fill="{s}"/>'
        + f'<polygon points="128,32 168,128 144,128 144,224 112,224 112,128 88,128" fill="{p}"/>'
        + f'<polygon points="128,32 156,72 100,72" fill="{a}"/>'
        + "</svg>"
    )


def gamerleg_sword(c, letter, name):
    # GamerLegion-style: vertical sword crest
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<circle cx="128" cy="128" r="108" fill="{s}" stroke="{p}" stroke-width="6"/>'
        + f'<rect x="118" y="40" width="20" height="160" fill="{p}"/>'
        + f'<polygon points="128,32 138,52 118,52" fill="{p}"/>'
        + f'<rect x="84" y="76" width="88" height="14" fill="{p}"/>'
        + f'<rect x="118" y="200" width="20" height="20" fill="{p}"/>'
        + "</svg>"
    )


def ninja_star(c, letter, name):
    # NIP-style: shuriken / star on dark
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<rect x="20" y="20" width="216" height="216" rx="18" fill="{s}"/>'
        + f'<polygon points="128,40 152,104 216,128 152,152 128,216 104,152 40,128 104,104" fill="{p}"/>'
        + f'<circle cx="128" cy="128" r="14" fill="{s}"/>'
        + "</svg>"
    )


def crossed_swords(c, letter, name):
    # Heroic/Valiant: crossed sabres on shield
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<path d="M40 56 L40 144 Q40 216 128 236 Q216 216 216 144 L216 56 Z" fill="{s}" stroke="{p}" stroke-width="6"/>'
        + f'<line x1="68" y1="84" x2="188" y2="196" stroke="{p}" stroke-width="10" stroke-linecap="round"/>'
        + f'<line x1="188" y1="84" x2="68" y2="196" stroke="{p}" stroke-width="10" stroke-linecap="round"/>'
        + f'<circle cx="128" cy="140" r="14" fill="{p}"/>'
        + "</svg>"
    )


def up_arrow(c, letter, name):
    # VP-style: bold upward arrow
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<rect x="20" y="20" width="216" height="216" rx="18" fill="{s}"/>'
        + f'<polygon points="128,40 224,144 176,144 176,216 80,216 80,144 32,144" fill="{p}"/>'
        + "</svg>"
    )


def imperial_crown(c, letter, name):
    # Imperial-style: ornate crown
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<circle cx="128" cy="128" r="108" fill="{s}" stroke="{p}" stroke-width="6"/>'
        + f'<path d="M52 100 L88 60 L128 92 L168 60 L204 100 L188 156 L68 156 Z" fill="{p}"/>'
        + f'<rect x="68" y="162" width="120" height="10" fill="{p}"/>'
        + f'<circle cx="88" cy="68" r="6" fill="{a}"/>'
        + f'<circle cx="128" cy="100" r="8" fill="{a}"/>'
        + f'<circle cx="168" cy="68" r="6" fill="{a}"/>'
        + f'<rect x="100" y="180" width="56" height="32" fill="{p}"/>'
        + "</svg>"
    )


def nz_chevron(c, letter, name):
    # 9z-adjacent: 9Z monogram in gold
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<rect x="20" y="20" width="216" height="216" rx="18" fill="{s}"/>'
        + f'<text x="128" y="180" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="900" font-size="140" fill="{p}" letter-spacing="-6">9Z</text>'
        + f'<polygon points="20,216 60,216 20,176" fill="{p}"/>'
        + "</svg>"
    )


def lattice_emblem(c, letter, name):
    # Legacy-style: interlocking lattice/L
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<rect x="20" y="20" width="216" height="216" rx="18" fill="{s}"/>'
        + f'<rect x="56" y="56" width="56" height="56" fill="{p}"/>'
        + f'<rect x="144" y="56" width="56" height="56" fill="{a}"/>'
        + f'<rect x="56" y="144" width="56" height="56" fill="{a}"/>'
        + f'<rect x="144" y="144" width="56" height="56" fill="{p}"/>'
        + "</svg>"
    )


def flame_torch(c, letter, name):
    # Eternal Fire-style: stylized flame
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<circle cx="128" cy="128" r="108" fill="{s}" stroke="{p}" stroke-width="6"/>'
        + f'<path d="M128 44 Q88 96 100 144 Q108 168 128 184 Q148 168 156 144 Q168 96 128 44 Z" fill="{p}"/>'
        + f'<path d="M128 88 Q112 116 120 144 Q124 156 128 164 Q132 156 136 144 Q144 116 128 88 Z" fill="{a}"/>'
        + "</svg>"
    )


def shield_brz(c, letter, name):
    # MIBR-style: green shield with diagonal band
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<path d="M40 56 L40 144 Q40 216 128 236 Q216 216 216 144 L216 56 Z" fill="{p}" stroke="{s}" stroke-width="6"/>'
        + f'<polygon points="40,140 216,80 216,108 40,168" fill="{a}"/>'
        + f'<text x="128" y="220" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="900" font-size="24" fill="{s}" letter-spacing="3">MB</text>'
        + "</svg>"
    )


def fly_wing(c, letter, name):
    # FlyQuest-style: stylized wing on cyan
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    return (
        hdr(name)
        + f'<circle cx="128" cy="128" r="108" fill="{s}" stroke="{p}" stroke-width="6"/>'
        + f'<path d="M40 168 Q88 88 152 100 Q200 96 224 132 Q172 124 132 144 Q88 152 40 168 Z" fill="{p}"/>'
        + f'<path d="M80 160 Q112 132 152 132" stroke="{a}" stroke-width="4" fill="none" stroke-linecap="round"/>'
        + "</svg>"
    )


# ============================================================
# TEAM -> DESIGN MAPPING
# ============================================================

DESIGNS = {
    "team_1_vitalis":        ("hex_shield",      {"letter": "V"}),
    "team_2_foria":          ("panther_diamond", {}),
    "team_3_falconry":       ("wing_crest",      {}),
    "team_4_muxeen":         ("wordmark_block",  {"tag": "MOUZ"}),
    "team_5_phantom":        ("specter_chevron", {}),
    "team_6_perivesion":     ("pain_monogram",   {}),
    "team_7_phaze":          ("phaze_arrow",     {}),
    "team_8_natusvincera":   ("navee_star",      {}),
    "team_9_gtwo":           ("g2_monogram",     {}),
    "team_10_thenomads":     ("crown_crest",     {}),
    "team_11_eurora":        ("aurora_diamond",  {}),
    "team_12_astraflux":     ("astralis_star",   {}),
    "team_13_3dmax":         ("cube_3d",         {}),
    "team_14_fut":           ("fut_monogram",    {}),
    "team_15_centuryrogues": ("rogue_skull",     {}),
    "team_15_tide":          ("horse_silhouette",{}),
    "team_16_b8":            ("octagon_mono",    {"letter": "B8"}),
    "team_17_pazsyonoa":     ("crown_wordmark",  {"tag": "POA"}),
    "team_18_sting":         ("stinger_dart",    {}),
    "team_19_nrg":           ("octagon_mono",    {"letter": "NRG"}),
    "team_20_gamerleague":   ("gamerleg_sword",  {}),
    "team_21_novainvaders":  ("ninja_star",      {}),
    "team_22_valiant":       ("crossed_swords",  {}),
    "team_22_virtusnova":    ("up_arrow",        {}),
    "team_23_imperius":      ("imperial_crown",  {}),
    "team_24_a81":           ("nz_chevron",      {}),
    "team_25_lineage":       ("lattice_emblem",  {}),
    "team_26_bkkame":        ("wordmark_block",  {"tag": "BK"}),
    "team_27_gantlemotex":   ("flame_torch",     {}),
    "team_28_mbesports":     ("shield_brz",      {}),
    "team_29_flycrest":      ("fly_wing",        {}),
    "team_30_taroo":         ("wordmark_block",  {"tag": "TAROO"}),
}

GENERATORS = {
    "hex_shield":       hex_shield,
    "panther_diamond":  panther_diamond,
    "wing_crest":       wing_crest,
    "wordmark_block":   wordmark_block,
    "specter_chevron":  specter_chevron,
    "pain_monogram":    pain_monogram,
    "phaze_arrow":      phaze_arrow,
    "navee_star":       navee_star,
    "g2_monogram":      g2_monogram,
    "crown_crest":      crown_crest,
    "aurora_diamond":   aurora_diamond,
    "astralis_star":    astralis_star,
    "cube_3d":          cube_3d,
    "fut_monogram":     fut_monogram,
    "rogue_skull":      rogue_skull,
    "horse_silhouette": horse_silhouette,
    "octagon_mono":     octagon_mono,
    "crown_wordmark":   crown_wordmark,
    "stinger_dart":     stinger_dart,
    "gamerleg_sword":   gamerleg_sword,
    "ninja_star":       ninja_star,
    "crossed_swords":   crossed_swords,
    "up_arrow":         up_arrow,
    "imperial_crown":   imperial_crown,
    "nz_chevron":       nz_chevron,
    "lattice_emblem":   lattice_emblem,
    "flame_torch":      flame_torch,
    "shield_brz":       shield_brz,
    "fly_wing":         fly_wing,
}


def main() -> None:
    teams = json.loads(TEAMS_JSON.read_text(encoding="utf-8"))
    by_id = {t["id"]: t for t in teams}

    written = 0
    for team_id, (style, extra) in DESIGNS.items():
        team = by_id.get(team_id)
        if not team:
            print(f"WARN: team {team_id} not found in teams.json")
            continue
        branding = team.get("branding")
        if not branding:
            print(f"WARN: team {team_id} missing branding")
            continue

        logo_path = ASSETS_DIR / team["logoPath"].lstrip("/")
        logo_path.parent.mkdir(parents=True, exist_ok=True)

        fn = GENERATORS[style]
        kwargs = {"c": branding, "letter": extra.get("letter", ""), "name": team["name"]}
        if "tag" in extra:
            kwargs["tag"] = extra["tag"]
        # Some generators accept tag, others don't — filter by signature
        import inspect
        sig = inspect.signature(fn)
        kwargs = {k: v for k, v in kwargs.items() if k in sig.parameters}

        svg = fn(**kwargs)
        logo_path.write_text(svg + "\n", encoding="utf-8")
        written += 1

    print(f"Wrote {written} logo SVGs.")


if __name__ == "__main__":
    main()
