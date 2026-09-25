"""Trace missing Anubis interior boundaries without flattening its navigation.

Run after native extraction. Local research only; no downloaded code is executed.
python scripts/launch/import-anubis-interiors.py
Requires numpy/OpenCV (existing isolated tmp/l09-python installation is supported).
"""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tmp/l09-python'))
import cv2
import numpy as np


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8'))


def sha(path):
    with (ROOT / path).open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def write(path, data):
    dest = ROOT / path
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')


def safe_contours(hole, protected):
    # Two source pixels of inset keep tracing/registration uncertainty inside the
    # void. Protect navigation on EVERY height, including routes below bridges.
    safe = cv2.erode(hole, np.ones((5, 5), np.uint8))
    safe[protected > 0] = 0
    contours, _ = cv2.findContours(safe, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contour in sorted(contours, key=cv2.contourArea, reverse=True):
        if cv2.contourArea(contour) < 64:
            continue
        candidate = cv2.approxPolyDP(contour, 0.75, True)
        line = np.zeros_like(safe)
        cv2.polylines(line, [candidate], True, 255, 1)
        if np.any(line & protected):
            candidate = contour
            line[:] = 0
            cv2.polylines(line, [candidate], True, 255, 1)
        if np.any(line & protected):
            raise ValueError('Boundary crosses protected navigation')
        yield candidate.reshape(-1, 2)


def main():
    radar_path = 'public/maps/de_anubis_radar_psd.png'
    ref = read('public/map-studio/spatial/Anubis.json')
    registration = next(row['registration'] for row in read('public/map-studio/registration.json')['maps'] if row['mapId'] == 'Anubis')
    if sha(radar_path) != registration['sourceSha256']:
        raise ValueError('Radar changed: re-register before tracing')
    native = read('tmp/native-maps/Anubis/nav.json')
    areas = [area for area in native['areas'] if area['hull'] == 0 and area['movable'] == 4294967295]
    ids = {area['id'] for area in areas}
    for area in areas:
        area['edges'] = [edge for edge in area['edges'] if edge['target'] in ids]
    if areas != ref['areas']:
        raise ValueError('Installed navigation changed: review alignment before tracing')
    physics = read('tmp/native-maps/Anubis/world-detailed.json')
    if not physics.get('collisionAttributes') or not physics['meshes'][0].get('vertices'):
        raise ValueError('Export native physics with --geometry first')
    image = cv2.imread(str(ROOT / radar_path), cv2.IMREAD_UNCHANGED)
    height, width = image.shape[:2]
    inv = cv2.invertAffineTransform(np.array(registration['matrix']).reshape(2, 3))

    def project(points):
        p = np.array(points, dtype=np.float64)
        xy = np.column_stack(((p[:, 0] - ref['transform']['pos_x']) / (ref['transform']['scale'] * 10.24),
                              (ref['transform']['pos_y'] - p[:, 1]) / (ref['transform']['scale'] * 10.24), np.ones(len(p))))
        return np.rint((xy @ inv.T) * np.array([width, height]) / 100).astype(np.int32)

    nav = np.zeros((height, width), np.uint8)
    for area in areas:
        cv2.fillPoly(nav, [project(area['corners'])], 255)
    protected = cv2.dilate(nav, np.ones((5, 5), np.uint8))
    opaque = np.uint8((image[:, :, 3] >= 160) & (image[:, :, :3].max(axis=2) > 32)) * 255
    contours, hierarchy = cv2.findContours(opaque, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    holes = []
    for index, contour in enumerate(contours):
        parent, depth = int(hierarchy[0][index][3]), 0
        while parent >= 0:
            depth += 1
            parent = int(hierarchy[0][parent][3])
        if depth % 2 == 1 and cv2.contourArea(contour) >= 200:
            holes.append(contour)
    holes.sort(key=lambda c: (cv2.boundingRect(c)[1], cv2.boundingRect(c)[0]))

    # This is corroborating geometry, not a runtime collision mask: include only
    # default solid meshes that do not exclude players, and ignore sky/clip-only
    # meshes. Project near-vertical faces; no invented infinite wall heights.
    vertical = np.zeros_like(nav)
    for mesh in physics['meshes']:
        attr = physics['collisionAttributes'][mesh['collisionAttributeIndex']]
        if attr['group'].lower() != 'default' or 'player' in attr['interactExclude']:
            continue
        vertices = np.array(mesh['vertices'])
        triangles = np.array(mesh['triangles'])
        v = vertices[triangles]
        normals = np.cross(v[:, 1] - v[:, 0], v[:, 2] - v[:, 0])
        valid = np.linalg.norm(normals, axis=1) > 0.001
        valid &= np.abs(normals[:, 2]) <= 0.5 * np.linalg.norm(normals, axis=1)
        xy = project(vertices)
        cv2.polylines(vertical, [xy[t] for t in triangles[valid]], True, 255, 1)
    nearby_vertical = cv2.dilate(vertical, np.ones((17, 17), np.uint8))
    marks, audit_holes = [], []
    for number, contour in enumerate(holes, 1):
        hole = np.zeros_like(nav)
        cv2.drawContours(hole, [contour], -1, 255, -1)
        edge = np.zeros_like(nav)
        cv2.drawContours(edge, [contour], -1, 255, 1)
        evidence = cv2.countNonZero(edge & nearby_vertical) / max(1, cv2.countNonZero(edge))
        # Never silently promote radar pixels to verified collision geometry.
        for segment, points in enumerate(safe_contours(hole, protected)):
            points = [{'x': round(float(x) / width * 100, 4), 'y': round(float(y) / height * 100, 4)} for x, y in points]
            points.append(points[0].copy())
            for start in range(0, len(points) - 1, 255):
                mark_id = f'interior:Anubis:upper:{number}:{segment}:{start // 255}'
                marks.append({'id': mark_id, 'kind': 'wall', 'points': points[start:start + 256],
                              'label': f'Interior boundary {number}', 'status': 'draft', 'locked': False,
                              'note': 'Interior radar void boundary, inset 2 pixels. Native navigation at every height is protected, including bridge/canal paths. Nearby native vertical faces were inspected. This is an editable 2D guide; wall/cover height, penetrability and collision category are not certified. Do not extrude as an infinite wall.',
                              'source': {'provider': 'radar-outline', 'id': mark_id}})
        audit_holes.append({'number': number, 'boundsPx': list(cv2.boundingRect(contour)), 'areaPx': cv2.countNonZero(hole),
                            'nativeNavOverlapPx': cv2.countNonZero(hole & nav), 'nearNativeVerticalEdgeFraction': round(evidence, 4)})
    if len(holes) != 18 or not marks:
        raise ValueError('Unexpected Anubis silhouette; review before replacing the snapshot')
    write('data/map-interior-boundaries.json', {'version': 'anubis-interiors-2026-09-22.1', 'maps': {'Anubis': {'upper': marks}}})
    write('public/map-studio/reviews/native/Anubis/interior-audit.json', {
        'version': 1, 'mapId': 'Anubis', 'floor': 'upper', 'sourceRadarSha256': sha(radar_path),
        'sourcePhysicsSha256': sha('tmp/native-maps/Anubis/maps/de_anubis/world_physics.vmdl_c'),
        'sourceNavSha256': sha('tmp/native-maps/Anubis/maps/de_anubis.nav'), 'nativeNavMatches': True,
        'navAreas': len(areas), 'physicsHulls': len(physics['hulls']), 'physicsMeshes': len(physics['meshes']),
        'collisionAttributes': physics['collisionAttributes'], 'holeCount': len(holes), 'markCount': len(marks),
        'protectedNavCrossings': 0, 'holes': audit_holes,
        'limits': ['Provisional radar registration; outlines inset two source pixels.', 'Draft 2D boundaries, not height-bound gameplay walls.', 'Vertical-face proximity is corroboration only, not a proof of solid volume or wall height.']})
    print(json.dumps({'holes': len(holes), 'marks': len(marks), 'protectedNavCrossings': 0, 'nativeVerticalEvidence': [h['nearNativeVerticalEdgeFraction'] for h in audit_holes]}))


if __name__ == '__main__':
    main()
