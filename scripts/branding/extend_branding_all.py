#!/usr/bin/env python3
"""Add deterministic branding + templated logos to every team that doesn't
already have a hand-crafted brand (i.e., everything outside the top 30).

Deterministic = a stable FNV-1a hash of the team ID drives both color and
shape choice, so re-running is idempotent and the same team always looks
the same. The top-30 entries already have `branding` populated, so we
SKIP them here and leave their hand-designed SVGs alone.
"""
import json
from collections import OrderedDict
from pathlib import Path

ROOT = Path("/home/user/EsportSimulator")
TEAMS_JSON = ROOT / "public/data/snapshot/teams.json"
PUBLIC_DIR = ROOT / "public"

# ============================================================
# Palette — 16 distinct color triples, picked to look good on the dark UI
# ============================================================
PALETTE = [
    {"primaryColor": "#3B82F6", "secondaryColor": "#1E3A8A", "accentColor": "#FFFFFF"},  # blue
    {"primaryColor": "#EF4444", "secondaryColor": "#7F1D1D", "accentColor": "#FFFFFF"},  # red
    {"primaryColor": "#10B981", "secondaryColor": "#064E3B", "accentColor": "#FFFFFF"},  # emerald
    {"primaryColor": "#F59E0B", "secondaryColor": "#78350F", "accentColor": "#0B0B0B"},  # amber
    {"primaryColor": "#8B5CF6", "secondaryColor": "#3B0764", "accentColor": "#FFFFFF"},  # violet
    {"primaryColor": "#EC4899", "secondaryColor": "#831843", "accentColor": "#FFFFFF"},  # pink
    {"primaryColor": "#06B6D4", "secondaryColor": "#164E63", "accentColor": "#FFFFFF"},  # cyan
    {"primaryColor": "#F97316", "secondaryColor": "#7C2D12", "accentColor": "#FFFFFF"},  # orange
    {"primaryColor": "#84CC16", "secondaryColor": "#365314", "accentColor": "#0B0B0B"},  # lime
    {"primaryColor": "#14B8A6", "secondaryColor": "#134E4A", "accentColor": "#FFFFFF"},  # teal
    {"primaryColor": "#A855F7", "secondaryColor": "#581C87", "accentColor": "#FFFFFF"},  # purple
    {"primaryColor": "#FACC15", "secondaryColor": "#1F2937", "accentColor": "#0B0B0B"},  # yellow/dark
    {"primaryColor": "#22D3EE", "secondaryColor": "#0E7490", "accentColor": "#FFFFFF"},  # sky cyan
    {"primaryColor": "#DB2777", "secondaryColor": "#500724", "accentColor": "#FFFFFF"},  # rose
    {"primaryColor": "#DC2626", "secondaryColor": "#0B0B0B", "accentColor": "#FFFFFF"},  # crimson
    {"primaryColor": "#0EA5E9", "secondaryColor": "#0C4A6E", "accentColor": "#FFFFFF"},  # bright blue
]

# Logo style distribution (sums to 12 for clean modulo distribution)
STYLE_BUCKETS = (
    ["octagon_mono"] * 4   # 33% — bold letter in octagon
    + ["hex_shield"]   * 3 # 25% — letter in hexagon shield
    + ["wordmark_block"] * 3  # 25% — team tag on slab
    + ["disc_mono"] * 2    # 17% — letter on circular disc
)


# ============================================================
# FNV-1a 32-bit hash — same algorithm as lib/safe-branding/name-transform.ts
# ============================================================
def fnv1a(s: str) -> int:
    h = 2166136261
    for ch in s.encode("utf-8"):
        h ^= ch
        h = (h * 16777619) & 0xFFFFFFFF
    return h


# ============================================================
# Header
# ============================================================
def hdr(name: str) -> str:
    safe = name.replace('"', "'")
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="{safe} logo">'


# ============================================================
# Templates
# ============================================================
def octagon_mono(c, letter, name):
    p, s, _ = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    size = 130 if len(letter) <= 1 else (96 if len(letter) <= 2 else 72)
    return (
        hdr(name)
        + f'<polygon points="80,20 176,20 236,80 236,176 176,236 80,236 20,176 20,80" fill="{p}" stroke="{s}" stroke-width="8"/>'
        + f'<text x="128" y="174" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="900" font-size="{size}" fill="{s}" letter-spacing="-4">{letter}</text>'
        + "</svg>"
    )


def hex_shield(c, letter, name):
    p, s, _ = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    size = 130 if len(letter) <= 1 else (96 if len(letter) <= 2 else 72)
    return (
        hdr(name)
        + f'<polygon points="128,16 232,76 232,180 128,240 24,180 24,76" fill="{p}" stroke="{s}" stroke-width="8"/>'
        + f'<polygon points="128,44 208,90 208,166 128,212 48,166 48,90" fill="none" stroke="{s}" stroke-width="3" opacity="0.4"/>'
        + f'<text x="128" y="172" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="900" font-size="{size}" fill="{s}" letter-spacing="-4">{letter}</text>'
        + "</svg>"
    )


def wordmark_block(c, letter, name, tag):
    p, s, _ = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    size = 100 if len(tag) <= 3 else (78 if len(tag) <= 4 else (60 if len(tag) <= 5 else 46))
    return (
        hdr(name)
        + f'<rect x="20" y="48" width="216" height="160" rx="14" fill="{s}" stroke="{p}" stroke-width="6"/>'
        + f'<rect x="20" y="48" width="216" height="22" fill="{p}"/>'
        + f'<rect x="20" y="186" width="216" height="22" fill="{p}"/>'
        + f'<text x="128" y="158" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="900" font-size="{size}" fill="{p}" letter-spacing="2">{tag}</text>'
        + "</svg>"
    )


def disc_mono(c, letter, name):
    p, s, a = c["primaryColor"], c["secondaryColor"], c["accentColor"]
    size = 140 if len(letter) <= 1 else (104 if len(letter) <= 2 else 76)
    return (
        hdr(name)
        + f'<circle cx="128" cy="128" r="108" fill="{p}" stroke="{s}" stroke-width="8"/>'
        + f'<circle cx="128" cy="128" r="84" fill="none" stroke="{s}" stroke-width="3" opacity="0.4"/>'
        + f'<text x="128" y="174" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="900" font-size="{size}" fill="{s}" letter-spacing="-4">{letter}</text>'
        + "</svg>"
    )


GENERATORS = {
    "octagon_mono": octagon_mono,
    "hex_shield": hex_shield,
    "wordmark_block": wordmark_block,
    "disc_mono": disc_mono,
}


# ============================================================
# Letter / tag derivation
# ============================================================
def derive_letter(name: str, short: str) -> str:
    """1-2 char monogram. Prefer first letter of name, fall back to first
    letter of shortName. Numbers/symbols stripped except digits."""
    if not name:
        return short[:2].upper() if short else "?"
    # First alphanumeric token of name
    cleaned = "".join(ch for ch in name if ch.isalnum())
    if not cleaned:
        return (short or "?")[:2].upper()
    # Try first capital letter (camelCase friendly)
    first = cleaned[0].upper()
    return first


def derive_tag(short: str, name: str) -> str:
    """3-5 char tag for wordmark style."""
    if short:
        s = short.upper()
        if 2 <= len(s) <= 5:
            return s
    # Fallback: first 4 chars of name uppercased
    cleaned = "".join(ch for ch in (name or "") if ch.isalnum())
    return cleaned[:4].upper() or "TEAM"


# ============================================================
# Main
# ============================================================
def main() -> None:
    with TEAMS_JSON.open("r", encoding="utf-8") as f:
        teams = json.load(f, object_pairs_hook=OrderedDict)

    added_branding = 0
    wrote_svgs = 0
    skipped_branded = 0

    for t in teams:
        tid = t.get("id", "")
        if t.get("branding"):
            skipped_branded += 1
            continue

        h = fnv1a(tid)
        palette = PALETTE[h % len(PALETTE)]
        style = STYLE_BUCKETS[(h >> 8) % len(STYLE_BUCKETS)]

        t["branding"] = {
            "primaryColor": palette["primaryColor"],
            "secondaryColor": palette["secondaryColor"],
            "accentColor": palette["accentColor"],
            "logoStyle": {
                "octagon_mono": "monogram",
                "hex_shield": "monogram",
                "wordmark_block": "wordmark",
                "disc_mono": "monogram",
            }[style],
        }
        added_branding += 1

        # Generate SVG
        logo_path = PUBLIC_DIR / t["logoPath"].lstrip("/")
        logo_path.parent.mkdir(parents=True, exist_ok=True)
        letter = derive_letter(t.get("name", ""), t.get("shortName", ""))
        fn = GENERATORS[style]
        if style == "wordmark_block":
            svg = fn(c=t["branding"], letter=letter, name=t.get("name", ""), tag=derive_tag(t.get("shortName", ""), t.get("name", "")))
        else:
            svg = fn(c=t["branding"], letter=letter, name=t.get("name", ""))
        logo_path.write_text(svg + "\n", encoding="utf-8")
        wrote_svgs += 1

    with TEAMS_JSON.open("w", encoding="utf-8") as f:
        json.dump(teams, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Skipped (already branded): {skipped_branded}")
    print(f"Added branding: {added_branding}")
    print(f"Wrote SVGs: {wrote_svgs}")


if __name__ == "__main__":
    main()
