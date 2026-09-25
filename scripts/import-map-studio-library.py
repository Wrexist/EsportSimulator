"""Import public lineup facts and derive editable radar outlines. No remote code is executed.

Requires numpy and opencv-python-headless. Sources are cached in the OS temp folder.
Run with PYTHONPATH pointing to an isolated dependency directory if desired.
"""
import hashlib
import json
import math
import re
import tempfile
import urllib.request
from collections import Counter
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path(tempfile.gettempdir()) / "esim-lineup-import"
CACHE.mkdir(exist_ok=True)
SOURCE = "https://cs2nades.gg"
MAPS = {"sandstone": "dust2", "mirage": "mirage", "inferno": "inferno", "anubis": "anubis", "ancient": "ancient", "overpass": "overpass", "nuke": "nuke", "vertigo": "vertigo"}
KINDS = {"Smoke": "smoke", "Flash": "flash", "Flashbang": "flash", "Molotov": "fire", "Incendiary": "fire", "HE": "he", "HE Grenade": "he", "Decoy": "decoy"}


def fetch(url, path):
    if not path.exists():
        with urllib.request.urlopen(url, timeout=30) as response:
            path.write_bytes(response.read())
    return path


def decode_page(path):
    html = path.read_text(encoding="utf-8")
    match = re.search(r'streamController.enqueue\(("(?:[^"\\]|\\.)*")\)', html)
    if not match:
        raise ValueError("Source page no longer exposes the expected public data.")
    refs = json.loads(json.loads(match.group(1)).strip())

    def decode(index):
        if index == -5:
            return None
        if not isinstance(index, int) or index < 0 or index >= len(refs):
            raise ValueError("Unsupported reference in public page data")
        value = refs[index]
        if isinstance(value, dict):
            return {refs[int(key[1:])]: decode(item) for key, item in value.items()}
        if isinstance(value, list):
            return [decode(item) for item in value]
        return value

    return decode(0)["loaderData"]["routes/en/map-page"]


def register(source, target):
    detector = cv2.SIFT_create(contrastThreshold=0.01)
    first, desc1 = detector.detectAndCompute(source, None)
    second, desc2 = detector.detectAndCompute(target, None)
    matches = [a for a, b in cv2.BFMatcher().knnMatch(desc1, desc2, k=2) if a.distance < 0.8 * b.distance]
    if len(matches) < 15:
        raise ValueError("Insufficient map registration matches")
    a = np.float32([first[m.queryIdx].pt for m in matches])
    b = np.float32([second[m.trainIdx].pt for m in matches])
    matrix, mask = cv2.estimateAffinePartial2D(a, b, method=cv2.RANSAC, ransacReprojThreshold=3)
    if matrix is None:
        raise ValueError("Map alignment failed")
    errors = np.linalg.norm(cv2.transform(a.reshape(-1, 1, 2), matrix).reshape(-1, 2) - b, axis=1)
    inliers = int(mask.sum())
    median = float(np.median(errors[mask.ravel() == 1]))
    if inliers < 15 or median > 2:
        raise ValueError(f"Unreliable alignment: {inliers} matches, {median} px error")
    return matrix, {"inliers": inliers, "medianErrorPx": round(median, 3), "matrix": matrix.tolist()}


def transform(x, y, alignment):
    matrix, width, height, target_width, target_height = alignment
    if not all(isinstance(n, (int, float)) and math.isfinite(n) and 0 <= n <= 100 for n in [x, y]):
        raise ValueError("Missing or invalid source coordinates")
    point = matrix @ np.array([x * width / 100, y * height / 100, 1])
    result = {"x": round(float(point[0]) / target_width * 100, 3), "y": round(float(point[1]) / target_height * 100, 3)}
    if not all(0 <= n <= 100 for n in result.values()):
        raise ValueError("Transformed point outside the local radar")
    return result


def outlines(path, map_id, floor):
    image = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    # Radar alpha separates the map silhouette from the empty image; no internal-wall inference.
    mask = np.uint8((image[:, :, 3] >= 160) & (np.max(image[:, :, :3], axis=2) > 32)) * 255
    # Some radar exports have an opaque black background and a thin image-frame border.
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    for index in range(1, count):
        x, y, width, height, area = stats[index]
        if area < 400 or (width > image.shape[1] * .95 and height > image.shape[0] * .95 and area < image.shape[0] * image.shape[1] * .05):
            mask[labels == index] = 0
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    result = []
    for contour in sorted(contours, key=cv2.contourArea, reverse=True):
        if cv2.contourArea(contour) < 400:
            continue
        simplified = cv2.approxPolyDP(contour, 1.5, True).reshape(-1, 2)
        points = [{"x": round(float(x) / image.shape[1] * 100, 3), "y": round(float(y) / image.shape[0] * 100, 3)} for x, y in simplified]
        if len(points) < 3:
            continue
        points.append(points[0].copy())
        # Keep the established per-mark point cap; chunks share an endpoint.
        for start in range(0, len(points) - 1, 255):
            result.append({"id": f"outline:{map_id}:{floor}:{len(result)}", "kind": "wall", "points": points[start:start + 256], "label": "", "note": "Outer radar boundary. Traced from this map image; review ledges, height and openings separately.", "status": "draft", "locked": True, "source": {"provider": "radar-outline", "id": f"{map_id}:{floor}:{len(result)}"}})
    if not result:
        raise ValueError(f"No outline for {path}")
    return result


def main():
    bundle = {"version": "2026-09-12.1", "provider": "CS2Nades", "sourceUrl": SOURCE, "maps": {}}
    report = {}
    for local_slug, source_slug in MAPS.items():
        layout = json.loads((ROOT / "data/map-layouts" / f"{local_slug}.json").read_text())
        page_url = f"{SOURCE}/en/map/{source_slug}"
        page = fetch(page_url, CACHE / f"{source_slug}.html")
        data = decode_page(page)
        alignments = {}
        floor_data = {}
        registration = {}
        for floor, filename in layout["radarImage"].items():
            index = 1 if floor == "upper" else 2
            local_path = ROOT / "public/maps" / f"{filename}.png"
            floor_data[floor] = {"outlines": outlines(local_path, layout["mapId"], floor), "lineups": [], "unplaced": []}
            image_url = data["mapData"].get("radar_image_url" if index == 1 else "radar_image_url_2")
            if not image_url:
                continue
            source_path = fetch(image_url, CACHE / f"{source_slug}-{index}.webp")
            source_image = cv2.imread(str(source_path), 0)
            target_image = cv2.imread(str(local_path), 0)
            try:
                matrix, quality = register(source_image, target_image)
            except ValueError:
                if local_slug != "nuke" or floor != "lower" or 1 not in alignments:
                    raise
                upper_matrix, sw, sh, tw, th = alignments[1]
                if (source_image.shape[1], source_image.shape[0], target_image.shape[1], target_image.shape[0]) != (sw, sh, tw, th):
                    raise ValueError("Nuke floors no longer share the inspected coordinate frame")
                # Both pairs retain the same ramp/outside frame. Visually checked against
                # the ramp end, lower-site tank and south stair; SIFT alone is ambiguous
                # on the recoloured lower-floor artwork.
                matrix = upper_matrix.copy()
                quality = {"method": "shared Nuke upper/lower coordinate frame; visual landmark check", "matrix": matrix.tolist()}
            quality.update({"sourceImage": image_url, "localImage": str(local_path.relative_to(ROOT)), "localImageSha256": hashlib.sha256(local_path.read_bytes()).hexdigest()})
            alignments[index] = (matrix, source_image.shape[1], source_image.shape[0], target_image.shape[1], target_image.shape[0])
            registration[floor] = quality
        seen = set()
        for target in data["targets"]:
            for grenade in target["grenades"]:
                key = f"{grenade['id']}:{target['id']}"
                if key in seen:
                    continue
                seen.add(key)
                kind = KINDS.get(grenade["grenade_type"])
                origin_index = grenade.get("radar_index") or 1
                target_index = target.get("radar_index") or 1
                floor = "lower" if target_index == 2 else "upper"
                url_type = grenade["grenade_type"].lower()
                url = f"{page_url}/{url_type}/{grenade['slug']}"
                label = f"{grenade['origin_name']} to {target['name']}"[:80]
                item = {"id": key, "label": label, "url": url, "kind": kind, "reason": ""}
                try:
                    if not kind:
                        raise ValueError(f"Unsupported combination type: {grenade['grenade_type']}")
                    if origin_index not in alignments or target_index not in alignments:
                        raise ValueError("No reliable floor alignment")
                    if grenade.get("x_origin") == 50 and grenade.get("y_origin") == 50:
                        raise ValueError("Source origin is an unconfirmed centre placeholder")
                    origin = transform(grenade.get("x_origin"), grenade.get("y_origin"), alignments[origin_index])
                    landing = transform(target.get("x_coord"), target.get("y_coord"), alignments[target_index])
                    technique = grenade.get("technique") or "Unspecified"
                    note = f"Source: {url}\nTechnique: {technique}. Throw from {'lower' if origin_index == 2 else 'upper'} floor; landing on {floor}. Target marker is a source-authored spot, not a simulated trajectory. Check the source guide before use."
                    mark = {"id": f"cs2nades:{key}", "kind": kind, "points": [origin, landing], "label": label, "note": note[:1000], "side": grenade["side"] if grenade.get("side") in ["CT", "T"] else "both", "radius": 3, "status": "draft", "source": {"provider": "CS2Nades", "id": key, "url": url, "originFloor": "lower" if origin_index == 2 else "upper"}, "aim": (grenade.get("setpos_code") or "")[:1000]}
                    floor_data[floor]["lineups"].append(mark)
                except ValueError as error:
                    item["reason"] = str(error)
                    floor_data.get(floor, floor_data["upper"])["unplaced"].append(item)
        linked_ids = {int(key.split(":")[0]) for key in seen}
        for grenade in data["allGrenades"]:
            if grenade["id"] not in linked_ids:
                floor_data["upper"]["unplaced"].append({"id": f"{grenade['id']}:unassigned", "label": f"{grenade['origin_name']} - target missing", "kind": KINDS.get(grenade["grenade_type"]), "url": f"{page_url}/{grenade['grenade_type'].lower()}/{grenade['slug']}", "reason": "Source record has no linked target coordinate"})
        bundle["maps"][layout["mapId"]] = floor_data
        report[layout["mapId"]] = {"source": page_url, "sourceRecords": len(data["allGrenades"]), "sourceTargetPairs": len(seen), "floors": {floor: {"imported": len(value["lineups"]), "unplaced": len(value["unplaced"]), "outlines": len(value["outlines"]), "kinds": dict(Counter(mark["kind"] for mark in value["lineups"]))} for floor, value in floor_data.items()}, "registration": registration}
        print(layout["mapId"], report[layout["mapId"]]["floors"], flush=True)
    dest = ROOT / "data/map-studio-library.json"
    dest.write_text(json.dumps(bundle, separators=(",", ":")), encoding="utf-8")
    audit = ROOT / "docs/audit-2026-09-12/map-library"
    audit.mkdir(exist_ok=True)
    (audit / "import-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
