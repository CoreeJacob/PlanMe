# Draws the app icon (build/icon.png, 1024x1024): two sticky notes joined by an arrow,
# one of them ticked off, on a blue rounded tile.
import struct, zlib, os

N = 1024
INSET, RADIUS = 100, 185
BG_TOP, BG_BOTTOM = (92, 120, 255), (46, 62, 170)
YELLOW, YELLOW_FOLD = (255, 214, 77), (222, 172, 40)
GREEN, GREEN_FOLD = (94, 214, 170), (56, 168, 128)
INK = (120, 92, 20)
WHITE = (255, 255, 255)
SHADOW = (20, 26, 80)

def inside_tile(x, y):
    lo, hi = INSET, N - INSET
    if not (lo <= x < hi and lo <= y < hi):
        return False
    cx = min(max(x, lo + RADIUS), hi - RADIUS)
    cy = min(max(y, lo + RADIUS), hi - RADIUS)
    return (x - cx) ** 2 + (y - cy) ** 2 <= RADIUS ** 2

def near_segment(x, y, ax, ay, bx, by, half):
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    px, py = ax + t * dx, ay + t * dy
    return (x - px) ** 2 + (y - py) ** 2 <= half * half

def in_triangle(x, y, a, b, c):
    def side(p, q):
        return (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])
    s1, s2, s3 = side(a, b), side(b, c), side(c, a)
    return (s1 >= 0 and s2 >= 0 and s3 >= 0) or (s1 <= 0 and s2 <= 0 and s3 <= 0)

def note(x, y, left, top, size, face, fold_colour):
    """A square note with its bottom-right corner folded up. Returns a colour or None."""
    fold = size // 5
    if not (left <= x < left + size and top <= y < top + size):
        return None
    rx, ry = x - left, y - top
    if rx + ry > 2 * size - fold:
        return None  # the corner that's folded away
    if rx + ry > 2 * size - 2 * fold and rx > size - fold - 1 and ry > size - fold - 1:
        return fold_colour
    return face

YELLOW_NOTE = (210, 230, 330)
GREEN_NOTE = (520, 500, 290)

def colour_at(x, y):
    """The colour at one sample point, or None outside the tile."""
    if not inside_tile(x, y):
        return None
    for left, top, size, face, fold in ((*YELLOW_NOTE, YELLOW, YELLOW_FOLD), (*GREEN_NOTE, GREEN, GREEN_FOLD)):
        c = note(x, y, left, top, size, face, fold)
        if c:
            if face == YELLOW and any(near_segment(x, y, left + 60, top + yy, left + size - xx, top + yy, 11) for yy, xx in ((90, 60), (150, 90), (210, 130))):
                return INK  # lines of writing
            if face == GREEN and (near_segment(x, y, 600, 650, 650, 705, 22) or near_segment(x, y, 650, 705, 740, 590, 22)):
                return WHITE  # the tick
            return c
    # The arrow from the yellow note round to the green one.
    if near_segment(x, y, 545, 300, 690, 300, 16) or near_segment(x, y, 690, 300, 690, 410, 16):
        return WHITE
    if in_triangle(x, y, (650, 400), (730, 400), (690, 470)):
        return WHITE
    # Soft shadows under the notes.
    t = (y - INSET) / (N - 2 * INSET)
    bg = tuple(int(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3))
    for left, top, size in (YELLOW_NOTE, GREEN_NOTE):
        if note(x - 16, y - 20, left, top, size, 1, 1):
            return tuple(int(bg[i] * 0.6 + SHADOW[i] * 0.4) for i in range(3))
    return bg

SAMPLES = ((0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75))

rows = []
for y in range(N):
    row = bytearray([0])
    for x in range(N):
        hits = [colour_at(x + sx, y + sy) for sx, sy in SAMPLES]
        found = [c for c in hits if c]
        if not found:
            row += bytes(4)
            continue
        # Average the samples so edges are smooth.
        rgb = tuple(sum(c[i] for c in found) // len(found) for i in range(3))
        row += bytes((*rgb, 255 * len(found) // len(SAMPLES)))
    rows.append(bytes(row))

def chunk(tag, data):
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

out = os.path.join(os.path.dirname(__file__), '..', 'build', 'icon.png')
with open(out, 'wb') as f:
    f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', N, N, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b''))
print('wrote', os.path.normpath(out))
