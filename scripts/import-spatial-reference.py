"""Build offline spatial references from a pinned Awpy asset release.

Requires .NET 10 for the pinned ValveResourceFormat navigation reader.
No game runtime dependency on Python/.NET. Sources remain separate from user drafts.
"""
import hashlib
import json
import os
import subprocess
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path(tempfile.gettempdir()) / "esim-spatial-import"
VERSION = "2000908"
BASE = f"https://github.com/pnxenopoulos/awpy-data/releases/download/{VERSION}/"
MAPS = {"Mirage": "de_mirage", "Nuke": "de_nuke", "Sandstone": "de_dust2", "Inferno": "de_inferno", "Anubis": "de_anubis", "Ancient": "de_ancient", "Overpass": "de_overpass", "Vertigo": "de_vertigo"}


def main():
    CACHE.mkdir(exist_ok=True)
    for name in ["manifest.json", "map_data.json", "navs.zip", "geometry.zip", "images.zip"]:
        if not (CACHE / name).exists():
            urllib.request.urlretrieve(BASE + name, CACHE / name)
    manifest = json.loads((CACHE / "manifest.json").read_text())
    for name, info in manifest["artifacts"].items():
        assert hashlib.sha256((CACHE / name).read_bytes()).hexdigest() == info["sha256"], f"Checksum mismatch: {name}"
    transforms = json.loads((CACHE / "map_data.json").read_text())
    env = dict(os.environ, DOTNET_CLI_TELEMETRY_OPTOUT="1")
    subprocess.run(["dotnet", "build", str(ROOT / "scripts/map-nav-importer"), "-c", "Release", "--nologo"], check=True, env=env)
    exe = ROOT / "scripts/map-nav-importer/bin/Release/net10.0/MapNavImporter.dll"
    dest = ROOT / "public/map-studio/spatial"
    dest.mkdir(parents=True, exist_ok=True)
    audit = {}
    with zipfile.ZipFile(CACHE / "navs.zip") as navs, zipfile.ZipFile(CACHE / "geometry.zip") as meshes, zipfile.ZipFile(CACHE / "images.zip") as images:
        for map_id, slug in MAPS.items():
            navpath = CACHE / f"{slug}.nav"
            navpath.write_bytes(navs.read(f"{slug}.nav"))
            parsed = CACHE / f"{slug}-parsed.json"
            subprocess.run(["dotnet", str(exe), str(navpath), str(parsed)], check=True, env=env)
            nav = json.loads(parsed.read_text())
            # Hull 0 is the standard player navigation hull. Preserve directed edge portals.
            areas = [a for a in nav["areas"] if a["hull"] == 0 and a["movable"] == 4294967295]
            area_ids = {a["id"] for a in areas}
            missing = sum(e["target"] not in area_ids for a in areas for e in a["edges"])
            for a in areas:
                a["edges"] = [e for e in a["edges"] if e["target"] in area_ids]
            mesh = meshes.read(f"{slug}.mesh")
            (dest / f"{map_id}.mesh").write_bytes(mesh)
            radars = {}
            for floor, suffix in [("upper", ""), ("lower", "_lower")]:
                source = f"radars/{slug}{suffix}.png"
                if source in images.namelist():
                    filename = f"{map_id}-{floor}.png"
                    (dest / filename).write_bytes(images.read(source))
                    radars[floor] = f"/map-studio/spatial/{filename}"
            data = {"format": "esim-spatial-reference", "version": 1, "mapId": map_id, "sourceMap": slug, "sourceVersion": VERSION,
                    "sourceUrl": f"https://github.com/pnxenopoulos/awpy-data/releases/tag/{VERSION}", "transform": transforms[slug],
                    "radars": radars, "areas": areas, "ladders": nav["ladders"], "meshSha256": hashlib.sha256(mesh).hexdigest()}
            (dest / f"{map_id}.json").write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
            audit[map_id] = {"areas": len(areas), "directedEdges": sum(len(a["edges"]) for a in areas), "ladders": len(nav["ladders"]), "excludedEdges": missing,
                             "navSha256": hashlib.sha256(navpath.read_bytes()).hexdigest(), "meshSha256": data["meshSha256"], "radars": list(radars)}
            print(map_id, audit[map_id], flush=True)
    report = ROOT / "docs/audit-2026-09-13"
    report.mkdir(exist_ok=True)
    (report / "spatial-import.json").write_text(json.dumps({"release": manifest, "maps": audit}, indent=2))


if __name__ == "__main__":
    main()
