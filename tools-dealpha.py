"""One-off: the image generator baked a transparency checkerboard into flat JPEGs.

This floods in from the borders, clears the checkerboard, and rewrites each
sprite as a real RGBA PNG so the parallax layers and props can sit on the sky.
"""

import os
import sys
from collections import deque

from PIL import Image

SPRITES = [
    "layer-clouds.png",
    "layer-mountains-far.png",
    "layer-mountains-mid.png",
    "layer-trees.png",
    "layer-ground.png",
    "sprite-hero.png",
    "prop-signpost.png",
    "prop-campfire.png",
    "prop-banner.png",
    "item-ally.png",
    "item-js.png",
    "item-practices.png",
    "item-ownership.png",
    "item-ui.png",
    "item-ideas.png",
]

# The checkerboard is light and colourless; real art in this palette is not.
FILL_MIN_VALUE = 168
FILL_MAX_CHROMA = 22

# A second, stricter pass that nibbles the JPEG halo left around hard edges.
HALO_MIN_VALUE = 196
HALO_MAX_CHROMA = 30
HALO_PASSES = 2


def is_checker(px, value_min, chroma_max):
    r, g, b = px[0], px[1], px[2]
    hi = max(r, g, b)
    lo = min(r, g, b)
    return hi >= value_min and (hi - lo) <= chroma_max


def strip(path):
    img = Image.open(path).convert("RGB")
    w, h = img.size
    px = img.load()

    clear = bytearray(w * h)
    queue = deque()

    def consider(x, y):
        i = y * w + x
        if clear[i]:
            return
        if is_checker(px[x, y], FILL_MIN_VALUE, FILL_MAX_CHROMA):
            clear[i] = 1
            queue.append((x, y))

    for x in range(w):
        consider(x, 0)
        consider(x, h - 1)
    for y in range(h):
        consider(0, y)
        consider(w - 1, y)

    while queue:
        x, y = queue.popleft()
        if x > 0:
            consider(x - 1, y)
        if x < w - 1:
            consider(x + 1, y)
        if y > 0:
            consider(x, y - 1)
        if y < h - 1:
            consider(x, y + 1)

    for _ in range(HALO_PASSES):
        edge = []
        for y in range(h):
            row = y * w
            for x in range(w):
                if clear[row + x]:
                    continue
                touching = (
                    (x > 0 and clear[row + x - 1])
                    or (x < w - 1 and clear[row + x + 1])
                    or (y > 0 and clear[row - w + x])
                    or (y < h - 1 and clear[row + w + x])
                )
                if touching and is_checker(px[x, y], HALO_MIN_VALUE, HALO_MAX_CHROMA):
                    edge.append(row + x)
        if not edge:
            break
        for i in edge:
            clear[i] = 1

    alpha = Image.frombytes("L", (w, h), bytes(0 if c else 255 for c in clear))
    out = img.convert("RGBA")
    out.putalpha(alpha)
    out.save(path, "PNG", optimize=True)

    cleared = sum(clear)
    return cleared / float(w * h)


def main():
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "art")

    for name in SPRITES:
        path = os.path.join(root, name)
        if not os.path.exists(path):
            print("missing", name)
            continue
        share = strip(path)
        print("%-30s %5.1f%% cleared" % (name, share * 100))

    return 0


if __name__ == "__main__":
    sys.exit(main())
