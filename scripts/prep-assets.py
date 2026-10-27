"""Logo preparation. Source: brand/LOGO PUMPMARKET PNG...png
(IHDR colour type 6, 8-bit RGBA, 2000x2000, 3,316,991 fully transparent
pure-black pixels). Because transparent regions are pure black, every resize
runs on premultiplied alpha (Pillow 'RGBa') so no dark fringe leaks in.
Outputs: src/assets/logo-960.png, logo-128.png, favicon.svg
Run: python -I scripts/prep-assets.py"""
import numpy as np
from PIL import Image
from sklearn.cluster import KMeans

SRC = "brand/LOGO PUMPMARKET PNG...png"
im = Image.open(SRC).convert("RGBA")
a = np.array(im)
ys, xs = np.nonzero(a[..., 3] > 0)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
side = max(x1 - x0, y1 - y0)
cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
box = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)
crop = im.crop(box)
print("bbox", (x0, y0, x1, y1), "square crop", box)

def premul_resize(img, size):
    return img.convert("RGBa").resize((size, size), Image.LANCZOS).convert("RGBA")

premul_resize(crop, 960).save("src/assets/logo-960.png", optimize=True)
premul_resize(crop, 128).save("src/assets/logo-128.png", optimize=True)

# ---- favicon: trace a 30x30 grid (centred in 32x32) from real pixels
G = 30
small = np.array(crop.convert("RGBa").resize((G, G), Image.BOX).convert("RGBA"))
op = small[..., 3] >= 128
src_px = np.array(crop)
vis = src_px[..., 3] >= 224
real = np.unique(src_px[vis][:, :3], axis=0)            # every real opaque colour
samp = src_px[vis][:, :3].astype(float)
samp = samp[np.random.RandomState(3).choice(len(samp), 80000, replace=False)]
km = KMeans(8, n_init=4, random_state=3).fit(samp)
cent = []
for c in km.cluster_centers_:                           # snap to a real pixel colour
    j = ((real.astype(float) - c) ** 2).sum(1).argmin()
    cent.append(tuple(int(v) for v in real[j]))
cent = np.array(cent)
grid = {}
for y in range(G):
    for x in range(G):
        if op[y, x]:
            j = ((cent.astype(float) - small[y, x, :3]) ** 2).sum(1).argmin()
            grid[(x, y)] = int(j)
rects = []
for y in range(G):
    x = 0
    while x < G:
        if (x, y) in grid:
            j, s = grid[(x, y)], x
            while (x + 1, y) in grid and grid[(x + 1, y)] == j: x += 1
            rects.append((j, s, y, x - s + 1))
        x += 1
order = sorted(set(r[0] for r in rects), key=lambda j: -sum(r[3] for r in rects if r[0] == j))
parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" shape-rendering="crispEdges">']
for j in order:
    hx = "#%02x%02x%02x" % tuple(cent[j])
    d = "".join("M%d %dh%dv1h-%dz" % (s + 1, y + 1, w, w) for k, s, y, w in rects if k == j)
    parts.append('<path fill="%s" d="%s"/>' % (hx, d))
parts.append("</svg>")
svg = "".join(parts)
assert "--" not in svg
open("src/assets/favicon.svg", "w").write(svg)
print("favicon bytes", len(svg), "colours", [("#%02x%02x%02x" % tuple(cent[j])) for j in order])
