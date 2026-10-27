"""Palette extraction: k-means over real pixels, each centre snapped to the
nearest real pixel coordinate. Output: scripts/data/palette-samples.json.
Run: python -I scripts/palette.py   (needs Pillow, numpy, scikit-learn)"""
import json, sys
import numpy as np
from PIL import Image
from sklearn.cluster import KMeans

SOURCES = [
    ("brand/LOGO PUMPMARKET PNG...png", 12),
    ("reference/PUMPMARKET 1.jpg.jpeg", 14),
    ("reference/SAMPUL PUMPMARKET JPG.jpg.jpeg", 12),
]
# direct pixel reads (x, y, role) taken from the banner art
POINTS = [
    ("reference/PUMPMARKET 1.jpg.jpeg", 935, 408, "mint-square"),
    ("reference/PUMPMARKET 1.jpg.jpeg", 338, 158, "cyan-square"),
    ("reference/PUMPMARKET 1.jpg.jpeg", 104, 868, "solana-mark-violet"),
    ("reference/PUMPMARKET 1.jpg.jpeg", 100, 848, "solana-mark-mint"),
]
out = []
rs = np.random.RandomState(7)
for path, k in SOURCES:
    a = np.array(Image.open(path).convert("RGBA"))
    h, w = a.shape[:2]
    ys, xs = np.nonzero(a[..., 3] > 250)
    idx = rs.choice(len(xs), min(60000, len(xs)), replace=False)
    pts = np.stack([xs[idx], ys[idx]], 1)
    rgb = a[pts[:, 1], pts[:, 0], :3].astype(float)
    km = KMeans(k, n_init=3, random_state=7).fit(rgb)
    cnt = np.bincount(km.labels_)
    for i in np.argsort(-cnt):
        d = ((rgb - km.cluster_centers_[i]) ** 2).sum(1)
        j = int(d.argmin())
        x, y = int(pts[j, 0]), int(pts[j, 1])
        r, g, b = [int(v) for v in a[y, x, :3]]
        out.append({"hex": "#%02x%02x%02x" % (r, g, b), "file": path, "x": x, "y": y,
                    "method": "kmeans-k%d" % k, "share": round(float(cnt[i]) / len(rgb), 4)})
for path, x, y, role in POINTS:
    a = np.array(Image.open(path).convert("RGB"))
    r, g, b = [int(v) for v in a[y, x]]
    out.append({"hex": "#%02x%02x%02x" % (r, g, b), "file": path, "x": x, "y": y,
                "method": "pixel", "role": role})
json.dump(out, open("scripts/data/palette-samples.json", "w"), indent=1)
for o in out: print(o["hex"], o["file"][:28], o["x"], o["y"], o["method"], o.get("share", o.get("role")))
