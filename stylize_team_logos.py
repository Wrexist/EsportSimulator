"""
Team Logo Stylizer (heavy / "derivative artwork" variant)
---------------------------------------------------------
Companion to modify_team_logos.py. Where the modifier applies subtle pixel-level
tweaks (defeats hash matching, keeps the logo visually identical), this script
applies aggressive transformations meant to produce a clearly *derived* but
visibly *different* artwork:

    original ── strong hue rotation
              ── palette posterization
              ── geometric frame overlay (circle/hex/diamond/shield/rounded sq)
              = stylized variant

NOTE ON LEGAL POSITIONING
This script reduces risk vs. using the original logo, but it does NOT make the
result trademark-proof. Recognition is still the failure mode under trademark
law (likelihood of confusion test). For a commercial release, the safest path
is generic shield templates + team-name text labels, not derivatives.

Idempotent + reversible (same pattern as modify_team_logos.py):
  - Backs up the source to logo.original.webp on first touch.
  - Always re-reads from the backup, so --force iterates without compounding.
  - Drops a .logo_stylized marker so re-runs skip already-done teams.

Usage:
  python stylize_team_logos.py --preview parivision faze g2 vitality
        # writes logo.stylized_preview.webp next to logo.webp for inspection,
        # leaves logo.webp untouched
  python stylize_team_logos.py --team parivision           # apply to one team
  python stylize_team_logos.py                              # apply to all teams
  python stylize_team_logos.py --force                      # reprocess from backup
  python stylize_team_logos.py --restore                    # restore from backup
"""

import argparse
import hashlib
import math
import random
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

TEAMS_DIR = Path(__file__).parent / "public" / "assets" / "teams"
LOGO_NAME = "logo.webp"
BACKUP_NAME = "logo.original.webp"
MARKER_NAME = ".logo_stylized"
PREVIEW_NAME = "logo.stylized_preview.webp"

# Transformation envelopes — much wider than the subtle variant.
HUE_SHIFT_DEG = (75.0, 135.0)       # large rotation; sign randomized per team
SATURATION_FACTOR = (0.80, 1.15)
VALUE_FACTOR = (0.88, 1.12)
POSTERIZE_LEVELS = 6                # quantize each RGB channel to N levels
INNER_LOGO_RATIO = 0.72             # original occupies this fraction of canvas
FRAME_INSET_RATIO = 0.04            # frame stroke sits this far from the edge
FRAME_STROKE_RATIO = 0.025          # stroke width as fraction of canvas
FRAME_SHAPES = ["circle", "hexagon", "diamond", "shield", "rounded_square"]


# ----------------------------------------------------------------------------- helpers

def seeded_rng(team_folder: str) -> random.Random:
    digest = hashlib.sha256(team_folder.encode("utf-8")).digest()
    seed = int.from_bytes(digest[:8], "big")
    return random.Random(seed)


def signed_uniform(rng: random.Random, lo: float, hi: float) -> float:
    magnitude = rng.uniform(lo, hi)
    return magnitude if rng.random() < 0.5 else -magnitude


def hsv_shift(rgb: np.ndarray, hue_deg: float, sat_mul: float, val_mul: float) -> np.ndarray:
    """Hue/sat/val transform on RGB uint8 array. Returns uint8 RGB."""
    pil = Image.fromarray(rgb, mode="RGB")
    hsv = np.asarray(pil.convert("HSV"), dtype=np.int32)
    hue_units = int(round((hue_deg / 360.0) * 256.0))
    hsv[..., 0] = (hsv[..., 0] + hue_units) % 256
    hsv[..., 1] = np.clip(np.round(hsv[..., 1] * sat_mul), 0, 255)
    hsv[..., 2] = np.clip(np.round(hsv[..., 2] * val_mul), 0, 255)
    return np.asarray(Image.fromarray(hsv.astype(np.uint8), mode="HSV").convert("RGB"), dtype=np.uint8)


def posterize_rgb(rgb: np.ndarray, levels: int) -> np.ndarray:
    """Reduce each channel to `levels` discrete values, snapping to bin centers."""
    step = 256 / levels
    binned = np.floor(rgb.astype(np.float32) / step) * step + (step / 2)
    return np.clip(binned, 0, 255).astype(np.uint8)


def dominant_color(rgba: np.ndarray) -> tuple[int, int, int, int]:
    """Mean color of opaque pixels. Used to tint the frame so it harmonizes."""
    mask = rgba[..., 3] > 32
    if not mask.any():
        return (200, 200, 200, 220)
    rgb = rgba[..., :3][mask]
    r, g, b = (int(np.round(rgb[..., i].mean())) for i in range(3))
    return (r, g, b, 235)


# ----------------------------------------------------------------------------- frame shapes

def _hexagon_points(cx: float, cy: float, r: float) -> list[tuple[float, float]]:
    return [(cx + r * math.cos(math.radians(60 * i - 30)),
             cy + r * math.sin(math.radians(60 * i - 30))) for i in range(6)]


def _shield_points(cx: float, cy: float, w: float, h: float) -> list[tuple[float, float]]:
    """Classic crest shield: flat top, curved bottom approximated by a polygon."""
    top, bottom = cy - h / 2, cy + h / 2
    left, right = cx - w / 2, cx + w / 2
    # Top edge, sides, and a 7-point curved bottom.
    pts = [(left, top), (right, top), (right, cy + h * 0.10)]
    for i in range(1, 8):
        t = i / 8
        x = right - (right - left) * t
        # Quadratic-ish drop toward center bottom.
        y = cy + h * 0.10 + (bottom - cy - h * 0.10) * (1 - (2 * t - 1) ** 2)
        pts.append((x, y))
    pts.append((left, cy + h * 0.10))
    return pts


def draw_frame(size: tuple[int, int], shape: str, color: tuple[int, int, int, int],
               stroke_width: int, inset: int) -> Image.Image:
    """Return an RGBA image with the frame outline drawn, transparent elsewhere."""
    w, h = size
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    box = (inset, inset, w - inset, h - inset)
    cx, cy = w / 2, h / 2
    radius = (min(w, h) - 2 * inset) / 2

    if shape == "circle":
        draw.ellipse(box, outline=color, width=stroke_width)
    elif shape == "hexagon":
        draw.polygon(_hexagon_points(cx, cy, radius), outline=color, width=stroke_width)
    elif shape == "diamond":
        draw.polygon([(cx, box[1]), (box[2], cy), (cx, box[3]), (box[0], cy)],
                     outline=color, width=stroke_width)
    elif shape == "shield":
        draw.polygon(_shield_points(cx, cy, w - 2 * inset, h - 2 * inset),
                     outline=color, width=stroke_width)
    elif shape == "rounded_square":
        corner = int(min(w, h) * 0.12)
        draw.rounded_rectangle(box, radius=corner, outline=color, width=stroke_width)
    else:
        raise ValueError(f"unknown frame shape: {shape}")
    return img


# ----------------------------------------------------------------------------- pipeline

def stylize(src_path: Path, team_name: str) -> Image.Image:
    rng = seeded_rng(team_name)
    original = Image.open(src_path).convert("RGBA")

    # Work on a square canvas so frames stay symmetric regardless of source aspect.
    side = max(original.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(original, ((side - original.width) // 2, (side - original.height) // 2),
                 original)

    rgba = np.asarray(canvas, dtype=np.uint8).copy()
    rgb = rgba[..., :3].copy()
    alpha = rgba[..., 3].copy()

    # Pull dominant brand colour BEFORE shifting — used for the frame so frame
    # color comes from original brand identity, not the shifted variant.
    frame_color = dominant_color(rgba)

    # 1. Strong hue rotation + saturation/value nudge on RGB only.
    hue_deg = signed_uniform(rng, *HUE_SHIFT_DEG)
    sat_mul = rng.uniform(*SATURATION_FACTOR)
    val_mul = rng.uniform(*VALUE_FACTOR)
    rgb = hsv_shift(rgb, hue_deg, sat_mul, val_mul)

    # 2. Posterize to flatten the palette.
    rgb = posterize_rgb(rgb, POSTERIZE_LEVELS)

    # 3. Shrink the recoloured original so it fits inside the frame.
    inner_rgba = np.dstack([rgb, alpha])
    inner_img = Image.fromarray(inner_rgba, mode="RGBA")
    inner_side = int(round(side * INNER_LOGO_RATIO))
    inner_img = inner_img.resize((inner_side, inner_side), Image.LANCZOS)

    composed = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    offset = ((side - inner_side) // 2, (side - inner_side) // 2)
    composed.paste(inner_img, offset, inner_img)

    # 4. Frame overlay — deterministic shape per team.
    shape = FRAME_SHAPES[rng.randrange(len(FRAME_SHAPES))]
    inset = max(2, int(round(side * FRAME_INSET_RATIO)))
    stroke = max(3, int(round(side * FRAME_STROKE_RATIO)))
    frame = draw_frame((side, side), shape, frame_color, stroke, inset)
    composed.alpha_composite(frame)

    return composed


# ----------------------------------------------------------------------------- driver

def ensure_backup(team_dir: Path) -> Path:
    logo = team_dir / LOGO_NAME
    backup = team_dir / BACKUP_NAME
    if not backup.exists() and logo.exists():
        shutil.copy2(logo, backup)
    return backup if backup.exists() else logo


def process_team(team_dir: Path, force: bool, dry_run: bool) -> str:
    logo = team_dir / LOGO_NAME
    marker = team_dir / MARKER_NAME
    if not logo.exists():
        return "missing"
    if marker.exists() and not force:
        return "skipped"
    if dry_run:
        return "would-stylize"

    source = ensure_backup(team_dir)
    result = stylize(source, team_dir.name)
    result.save(logo, format="WEBP", lossless=False, quality=95, method=6)
    marker.write_text("stylized by stylize_team_logos.py\n", encoding="utf-8")
    return "stylized"


def preview_team(team_dir: Path) -> str:
    logo = team_dir / LOGO_NAME
    if not logo.exists():
        return "missing"
    source = ensure_backup(team_dir)
    result = stylize(source, team_dir.name)
    out = team_dir / PREVIEW_NAME
    result.save(out, format="WEBP", lossless=False, quality=95, method=6)
    return "previewed"


def restore_team(team_dir: Path) -> str:
    logo = team_dir / LOGO_NAME
    backup = team_dir / BACKUP_NAME
    marker = team_dir / MARKER_NAME
    if not backup.exists():
        return "no-backup"
    shutil.copy2(backup, logo)
    if marker.exists():
        marker.unlink()
    return "restored"


def main() -> int:
    parser = argparse.ArgumentParser(description="Stylize team logos into derivative artwork.")
    parser.add_argument("--team", help="Process only this single team folder name.")
    parser.add_argument("--preview", nargs="+", help="Write preview files (no overwrite) for these teams.")
    parser.add_argument("--force", action="store_true", help="Reprocess from backup even if marker present.")
    parser.add_argument("--restore", action="store_true", help="Restore originals from backup, remove markers.")
    parser.add_argument("--dry-run", action="store_true", help="Report actions without writing.")
    args = parser.parse_args()

    if not TEAMS_DIR.exists():
        print(f"Teams directory not found: {TEAMS_DIR}", file=sys.stderr)
        return 1

    if args.preview:
        for name in args.preview:
            team_dir = TEAMS_DIR / name
            if not team_dir.is_dir():
                print(f"  missing-team    {name}")
                continue
            print(f"  {preview_team(team_dir):<14} {name}")
        return 0

    if args.team:
        team_dirs = [TEAMS_DIR / args.team]
        if not team_dirs[0].is_dir():
            print(f"Team folder not found: {team_dirs[0]}", file=sys.stderr)
            return 1
    else:
        team_dirs = sorted(p for p in TEAMS_DIR.iterdir() if p.is_dir())

    counts: dict[str, int] = {}
    for team_dir in team_dirs:
        status = restore_team(team_dir) if args.restore else process_team(team_dir, args.force, args.dry_run)
        counts[status] = counts.get(status, 0) + 1
        if status in {"stylized", "restored", "would-stylize"}:
            print(f"  {status:<14} {team_dir.name}")

    print("-" * 50)
    for status, n in sorted(counts.items()):
        print(f"  {status:<14} {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
