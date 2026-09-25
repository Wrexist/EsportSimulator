"""Measure existing local radar alignment; never certify geometry or change owner drafts."""
import hashlib
import json
from pathlib import Path
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
cv2.setRNGSeed(3409)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
rows = []
for layout_path in sorted((ROOT / 'data/map-layouts').glob('*.json')):
    layout = json.loads(layout_path.read_text())
    ref = json.loads((ROOT / f"public/map-studio/spatial/{layout['mapId']}.json").read_text())
    for floor, image in layout['radarImage'].items():
        source = ROOT / f'public/maps/{image}.png'
        target = ROOT / ('public' + ref['radars'][floor])
        row = {'coverage': {key: 'unreviewed' for key in ['walls', 'spawnAreas', 'plantZones', 'verticalTraversal']}, 'mapId': layout['mapId'], 'floor': floor, 'release': 'held', 'review': 'not-reviewed', 'reason': 'Requires geometry review and L08 distribution clearance'}
        try:
            a, b = cv2.imread(str(source), 0), cv2.imread(str(target), 0)
            detector = cv2.SIFT_create(contrastThreshold=0.01)
            ka, da = detector.detectAndCompute(a, None)
            kb, db = detector.detectAndCompute(b, None)
            matches = [x for x, y in cv2.BFMatcher().knnMatch(da, db, k=2) if x.distance < 0.75*y.distance]
            pa = np.float32([ka[m.queryIdx].pt for m in matches]); pb = np.float32([kb[m.trainIdx].pt for m in matches])
            matrix, mask = cv2.estimateAffinePartial2D(pa, pb, method=cv2.RANSAC, ransacReprojThreshold=2)
            good = mask.ravel() == 1
            error = np.linalg.norm(cv2.transform(pa.reshape(-1, 1, 2), matrix).reshape(-1, 2) - pb, axis=1)[good]
            if int(good.sum()) < 20 or float(np.median(error)) > 1.5: raise ValueError('Insufficient registration evidence')
            normalized = matrix.copy()
            normalized[:, 0] *= a.shape[1]/100; normalized[:, 1] *= a.shape[0]/100
            normalized[0, :] *= 100/b.shape[1]; normalized[1, :] *= 100/b.shape[0]
            row['registration'] = {'version': 1, 'sourceRadar': f'/maps/{image}.png', 'sourceSha256': sha(source), 'targetSha256': sha(target), 'sourceVersion': ref['sourceVersion'], 'meshSha256': ref['meshSha256'], 'matrix': normalized.flatten().tolist(), 'method': 'image-features', 'confidence': 'provisional', 'evidence': f"{int(good.sum())} SIFT/RANSAC inliers; median {np.median(error):.3f}px, p95 {np.percentile(error,95):.3f}px. Image alignment only; floors and walls need review."}
            row['imageMetrics'] = {'inliers': int(good.sum()), 'medianPixels': float(np.median(error)), 'p95Pixels': float(np.percentile(error, 95))}
        except Exception as error:
            row['reason'] = f'Alignment needs manual review: {error}'
        rows.append(row)
out = ROOT / 'public/map-studio/registration.json'
out.write_text(json.dumps({'version': 1, 'maps': rows}, indent=2) + '\n')
print(json.dumps([{k:r[k] for k in ['mapId','floor','reason']} | {'aligned': 'registration' in r} for r in rows], indent=2))
