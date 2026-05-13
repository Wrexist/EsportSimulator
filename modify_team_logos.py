"""
Team Logo Modifier
------------------
Walks every team folder under public/assets/teams/<team>/logo.webp and applies
a small, per-team-deterministic transformation so the modified logo is no longer
a pixel-identical copy of the source while remaining visually almost the same.

Strategy (tuned for graphic-art logos on transparent backgrounds):
  - Hue rotation in HSV space (the dominant fingerprint change).
  - Tiny saturation, brightness and contrast tweaks.
  - Sub-percent rescale with re-centering inside the original canvas.
  - Alpha channel is preserved verbatim — never tinted, never blurred.

Each team's tweak is seeded from its folder name, so:
  - Re-running the script on already-processed logos is a no-op (idempotent
    when the original is restored from backup, otherwise skipped via marker).
  - Two teams never get the exact same shift — the batch does not look like it
    went through one global filter.

Usage:
  python modify_team_logos.py                # process all logos
  python modify_team_logos.py --team faze    # process a single team folder
  python modify_team_logos.py --force        # reprocess from backup originals
  python modify_team_logos.py --restore      # restore all originals from backup
  python modify_team_logos.py --dry-run      # report what would change, no writes
"""

import argparse
import hashlib
import random
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

TEAMS_DIR = Path(__file__).parent / "public" / "assets" / "teams"
LOGO_NAME = "logo.webp"
BACKUP_NAME = "logo.original.webp"
MARKER_NAME = ".logo_modified"

# Transformation envelopes. Each team's RNG (seeded from folder name) draws
# one value per axis from these ranges. Keep them small — the goal is "subtly
# different fingerprint", not "visibly altered logo".
HUE_SHIFT_DEG = (6.0, 14.0)         # absolute degrees; sign is randomized
SATURATION_FACTOR = (0.94, 1.06)    # multiplicative on S channel
VALUE_FACTOR = (0.96, 1.04)         # multiplicative on V channel
CONTRAST_FACTOR = (0.97, 1.03)      # post-HSV linear contrast on RGB
SCALE_FACTOR = (0.985, 1.015)       # rescale then recenter into original canvas


def seeded_rng(team_folder: str) -> random.Random:
    """Stable RNG per team folder name — same team always gets the same tweak."""
    digest = hashlib.sha256(team_folder.encode("utf-8")).digest()
    seed = int.from_bytes(digest[:8], "big")
    return random.Random(seed)


def signed_uniform(rng: random.Random, lo: float, hi: float) -> float:
    """Uniform in [lo, hi] with a random sign — used for hue shift direction."""
    magnitude = rng.uniform(lo, hi)
    return magnitude if rng.random() < 0.5 else -magnitude


def hsv_shift(rgb: np.ndarray, hue_deg: float, sat_mul: float, val_mul: float) -> np.ndarray:
    """Apply hue/sat/val tweaks to an RGB uint8 array (H,W,3). Returns uint8."""
    # Convert to HSV in float [0..1] for H, S, V.
    # PIL's HSV mode uses uint8 where H is in [0..255] mapping to [0..360°).
    pil_rgb = Image.fromarray(rgb, mode="RGB")
    hsv = np.asarray(pil_rgb.convert("HSV"), dtype=np.int32)

    # Hue: wrap-around in 0..255.
    hue_shift_units = int(round((hue_deg / 360.0) * 256.0))
    hsv[..., 0] = (hsv[..., 0] + hue_shift_units) % 256

    # Saturation and Value: multiplicative, clamped.
    hsv[..., 1] = np.clip(np.round(hsv[..., 1] * sat_mul), 0, 255)
    hsv[..., 2] = np.clip(np.round(hsv[..., 2] * val_mul), 0, 255)

    hsv_u8 = hsv.astype(np.uint8)
    return np.asarray(Image.fromarray(hsv_u8, mode="HSV").convert("RGB"), dtype=np.uint8)


def apply_contrast(rgb: np.ndarray, factor: float) -> np.ndarray:
    """Linear contrast around mid-grey on RGB only, alpha handled separately."""
    out = 128.0 + (rgb.astype(np.float32) - 128.0) * factor
    return np.clip(out, 0, 255).astype(np.uint8)


def rescale_recenter(img: Image.Image, scale: float) -> Image.Image:
    """Scale by factor and recenter onto an empty canvas the size of the original.
    Preserves alpha; uses bicubic resampling for the RGB part and the alpha mask
    together because they were merged into one RGBA image."""
    w, h = img.size
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    scaled = img.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    offset = ((w - new_w) // 2, (h - new_h) // 2)
    if scale >= 1.0:
        # Scaled image is bigger — crop the centered region back to original size.
        left = (new_w - w) // 2
        top = (new_h - h) // 2
        scaled = scaled.crop((left, top, left + w, top + h))
        canvas.paste(scaled, (0, 0), scaled)
    else:
        # Scaled image is smaller — paste centered onto transparent canvas.
        canvas.paste(scaled, offset, scaled)
    return canvas


def transform_logo(src_path: Path, rng: random.Random) -> Image.Image:
    """Load src logo, return modified RGBA image."""
    img = Image.open(src_path).convert("RGBA")
    rgba = np.asarray(img, dtype=np.uint8)
    rgb = rgba[..., :3].copy()
    alpha = rgba[..., 3].copy()

    hue_deg = signed_uniform(rng, *HUE_SHIFT_DEG)
    sat_mul = rng.uniform(*SATURATION_FACTOR)
    val_mul = rng.uniform(*VALUE_FACTOR)
    contrast = rng.uniform(*CONTRAST_FACTOR)
    scale = rng.uniform(*SCALE_FACTOR)

    rgb = hsv_shift(rgb, hue_deg, sat_mul, val_mul)
    rgb = apply_contrast(rgb, contrast)

    merged = np.dstack([rgb, alpha])
    result = Image.fromarray(merged, mode="RGBA")
    return rescale_recenter(result, scale)


def process_team(team_dir: Path, force: bool, dry_run: bool) -> str:
    """Process a single team's logo. Returns a one-word status."""
    logo = team_dir / LOGO_NAME
    backup = team_dir / BACKUP_NAME
    marker = team_dir / MARKER_NAME

    if not logo.exists():
        return "missing"

    if marker.exists() and not force:
        return "skipped"

    if dry_run:
        return "would-modify"

    # Backup the original on first run; subsequent --force re-reads it so we
    # never compound the transformation onto an already-modified file.
    if not backup.exists():
        shutil.copy2(logo, backup)
    source_for_transform = backup

    rng = seeded_rng(team_dir.name)
    modified = transform_logo(source_for_transform, rng)
    modified.save(logo, format="WEBP", lossless=False, quality=95, method=6)

    marker.write_text("modified by modify_team_logos.py\n", encoding="utf-8")
    return "modified"


def restore_team(team_dir: Path, dry_run: bool) -> str:
    logo = team_dir / LOGO_NAME
    backup = team_dir / BACKUP_NAME
    marker = team_dir / MARKER_NAME

    if not backup.exists():
        return "no-backup"
    if dry_run:
        return "would-restore"

    shutil.copy2(backup, logo)
    if marker.exists():
        marker.unlink()
    return "restored"


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply subtle per-team modifications to team logos.")
    parser.add_argument("--team", help="Process only this single team folder name.")
    parser.add_argument("--force", action="store_true", help="Reprocess even if already modified (re-reads from backup).")
    parser.add_argument("--restore", action="store_true", help="Restore originals from backup and remove markers.")
    parser.add_argument("--dry-run", action="store_true", help="Show actions without writing files.")
    args = parser.parse_args()

    if not TEAMS_DIR.exists():
        print(f"Teams directory not found: {TEAMS_DIR}", file=sys.stderr)
        return 1

    if args.team:
        team_dirs = [TEAMS_DIR / args.team]
        if not team_dirs[0].is_dir():
            print(f"Team folder not found: {team_dirs[0]}", file=sys.stderr)
            return 1
    else:
        team_dirs = sorted(p for p in TEAMS_DIR.iterdir() if p.is_dir())

    counts: dict[str, int] = {}
    for team_dir in team_dirs:
        if args.restore:
            status = restore_team(team_dir, args.dry_run)
        else:
            status = process_team(team_dir, args.force, args.dry_run)
        counts[status] = counts.get(status, 0) + 1
        if status in {"modified", "restored", "would-modify", "would-restore"}:
            print(f"  {status:<14} {team_dir.name}")

    print("-" * 50)
    for status, n in sorted(counts.items()):
        print(f"  {status:<14} {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
