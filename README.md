# shovandhara.github.io

My portfolio, served straight from GitHub Pages. The current site is a
side-scrolling pixel-art world: the page scrolls horizontally and you walk east
past each section.

| Route     | What it is                                          | Source              |
| --------- | --------------------------------------------------- | ------------------- |
| `/`       | Current site — horizontal side-scroller, pixel art   | `index.html`        |
| `/legacy` | The previous version, kept intact and still deployed | `legacy/index.html` |

## Layout

```
index.html        the road and every stage along it
px-style.css      world, parallax layers, HUD chrome, panels
px-app.js         horizontal scrolling, parallax, checkpoints, the walker
art/              pixel art: parallax layers, props, item sprites, build scenes
tools-dealpha.py  one-off: turns generated sprites into real RGBA PNGs
legacy/           the previous site, self-contained apart from the shared files below
resume.pdf        shared by both routes
favicon*          shared by both routes
```

## How the road works

`.road` is a horizontally scrolling flex container pinned to the viewport, and
each `.stage` is one screen wide. Scenery layers sit behind it and shift their
`background-position-x` by a fraction of the scroll distance, so distant
mountains drift slowly and the ground keeps pace with you.

Input is deliberately forgiving: vertical wheel and trackpad gestures are
translated into eastward travel, the world can be dragged, arrow keys and
`PageUp`/`PageDown` walk, and `Tab` skips between stages. Below 900px the road
stands up and becomes an ordinary vertical page, which keeps the long resume
sections readable on a phone.

## Art

The pixel art was generated, then post-processed. The generator returns flat
JPEGs with a transparency checkerboard painted into them, so `tools-dealpha.py`
floods in from the borders, clears the checkerboard, and rewrites each sprite as
a real RGBA PNG. Re-run it after regenerating any sprite:

```sh
python3 -m venv .venv && .venv/bin/pip install pillow
.venv/bin/python tools-dealpha.py
```

## Running it

No build step. Serve the folder and open it:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000` and `http://localhost:8000/legacy/`.
