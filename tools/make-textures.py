# Builds the photographic textures used by the 3D pool scene (js/scene.js).
#   python tools/make-textures.py      (needs Pillow, numpy, opencv-python)
# Pale paver colour is derived from the CC0 Poly Haven concrete scan in tools/src/concrete-scan.jpg;
# the stacked stone, red soil and charcoal coping tiles are generated here.
import numpy as np, cv2
from PIL import Image

OUT = 'assets/3d/'
rng = np.random.default_rng(7)


def save(arr, name, q=88):
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(OUT + name, quality=q, optimize=True, progressive=True)


def fbm(size, octaves=6, seed=0, base=4):
    r = np.random.default_rng(seed)
    out = np.zeros((size, size), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        n = base * 2 ** o
        g = r.random((n, n)).astype(np.float32)
        g = np.tile(g, (3, 3))
        up = cv2.resize(g, (size * 3, size * 3), interpolation=cv2.INTER_CUBIC)[size:2 * size, size:2 * size]
        out += up * amp
        tot += amp
        amp *= 0.5
    return out / tot


def normal_from_height(h, strength):
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.dstack([-gx, gy, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return (n * 0.5 + 0.5) * 255


# ---------- pale grey large-format paver (like the Graphite Pools job photos) ----------
src = np.asarray(Image.open('tools/src/concrete-scan.jpg').convert('L')).astype(np.float32)
lum = (src - src.mean()) / src.std()
cloud = fbm(1024, 5, 3, 3) - 0.5
pav = 148 + lum * 8 + cloud * 22
paver = np.dstack([pav * 0.985, pav * 0.99, pav * 1.0])
save(paver, 'paver-color.jpg')

# ---------- charcoal coping tile ----------
S = 1024
cloud = fbm(S, 6, 11, 4)
speck = rng.random((S, S)).astype(np.float32)
c = 46 + (cloud - 0.5) * 18 + (speck > 0.985) * 22
save(np.dstack([c * 0.97, c, c * 1.04]), 'charcoal-color.jpg')
h = cloud * 0.6 + speck * 0.08
save(normal_from_height(cv2.GaussianBlur(h, (0, 0), 1.2), 6), 'charcoal-normal.jpg')

# ---------- Gauteng red soil ----------
n1 = fbm(S, 7, 21, 12)
n2 = fbm(S, 5, 22, 12)
grit = rng.random((S, S)).astype(np.float32)
base = np.array([124, 66, 42], np.float32)
dark = np.array([98, 52, 34], np.float32)
light = np.array([150, 96, 66], np.float32)
t = np.clip((n1 - 0.35) * 2.2, 0, 1)[..., None]
soil = dark * (1 - t) + base * t
soil = soil * (1 - np.clip((n2 - 0.62) * 3, 0, 1)[..., None] * 0.0) + (light - soil) * np.clip((n2 - 0.6) * 2.5, 0, 1)[..., None] * 0.6
soil += (grit[..., None] - 0.5) * 34
pebbles = (grit > 0.9965)
soil[pebbles] = soil[pebbles] * 0.5 + np.array([200, 190, 170]) * 0.5
save(soil, 'soil-color.jpg')
hs = n1 * 0.7 + cv2.GaussianBlur(grit, (0, 0), 0.8) * 0.3
save(normal_from_height(hs, 9), 'soil-normal.jpg')

# ---------- stacked stone cladding (thin ledgestone strips) ----------
W, H = 1024, 1024
col = np.zeros((H, W, 3), np.float32)
hgt = np.zeros((H, W), np.float32)
palette = np.array([[118, 112, 104], [142, 134, 122], [96, 92, 88], [160, 150, 134], [84, 80, 78], [130, 118, 100], [108, 104, 100]], np.float32)
noise = fbm(1024, 6, 31, 8)
fine = rng.random((H, W)).astype(np.float32)
y = 0
while y < H:
    rh = int(rng.integers(22, 58))
    x = -int(rng.integers(0, 200))
    while x < W:
        pw = int(rng.integers(90, 340))
        x0, x1 = max(x, 0), min(x + pw, W)
        y1 = min(y + rh, H)
        if x1 > x0:
            p = palette[rng.integers(len(palette))] * rng.uniform(0.85, 1.12)
            sub = noise[y:y1, x0:x1][..., None]
            col[y:y1, x0:x1] = p * (0.8 + sub * 0.45)
            # each strip is a rough slab: higher in the middle, chipped edges
            yy = np.linspace(-1, 1, y1 - y)[:, None]
            xx = np.linspace(-1, 1, x1 - x0)[None, :]
            bulge = (1 - yy ** 6) * (1 - xx ** 12)
            hgt[y:y1, x0:x1] = 0.55 + bulge * 0.35 + rng.uniform(-0.15, 0.15) + noise[y:y1, x0:x1] * 0.4
        x += pw + int(rng.integers(2, 6))
    y += rh + int(rng.integers(2, 5))
gaps = hgt == 0
col[gaps] = 28
col += (fine[..., None] - 0.5) * 18
# soft ambient occlusion into the joints
ao = cv2.GaussianBlur((~gaps).astype(np.float32), (0, 0), 3)
col *= (0.55 + 0.45 * ao)[..., None]
save(col, 'stone-color.jpg')
hgt = cv2.GaussianBlur(hgt + fine * 0.05, (0, 0), 1.0)
save(normal_from_height(hgt, 7), 'stone-normal.jpg')

print('textures written to', OUT)
