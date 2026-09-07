/**
 * A small pixel-art press.
 *
 * Everything in the world is drawn here at its true resolution — one array
 * cell is one art pixel — and blown up by the browser with
 * `image-rendering: pixelated`. That is the whole reason this file exists:
 * an SVG scaled to 42vh has to invent the pixels in between, so its edges
 * come out soft and its gradients come out smooth, and smooth is the one
 * thing pixel art cannot be. Drawing at 88 rows and letting CSS multiply by
 * an integer means every edge lands on a pixel boundary and stays there.
 *
 * The other half of the look is dithering. A 24-bit gradient is banded mud
 * at this scale, so shading is done the way it was done on hardware that
 * only had a handful of colours: two flat tones interleaved on an ordered
 * Bayer threshold, so the eye mixes them into a third. `ramp` and `fog`
 * below are the two places that matters most — sky bands and the haze that
 * separates one ridge from the next.
 *
 * Used by tools-world.js and tools-sets.js. Not shipped to the browser.
 */

const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

/* ── PNG container ─────────────────────────── */

/* Hand-rolled so the art pipeline stays dependency-free. RGBA8, no
   interlace, one filter-0 scanline per row: the least clever encoding, which
   is what we want when the payload is already flat colour and zlib is doing
   the compressing. */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);

  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }

  return table;
})();

const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
};

const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");

  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);

  return Buffer.concat([head, data, tail]);
};

const encodePNG = (w, h, rgba) => {
  const raw = Buffer.alloc((w * 4 + 1) * h);

  for (let y = 0; y < h; y += 1) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

/* ── Colour ────────────────────────────────── */

/* Colours are [r,g,b,a]. Written as hex in the art files because that is how
   a palette is read at a glance, parsed once here, and never interpolated at
   draw time — mixing two palette entries into a new RGB value is exactly the
   habit that turns pixel art back into a gradient. `mix` exists only for
   building palette ramps up front, before any drawing happens. */

const CLEAR = [0, 0, 0, 0];

const rgba = (hex, alpha) => {
  const s = hex.replace("#", "");
  const n = parseInt(s.length === 3 ? s.replace(/./g, "$&$&") : s, 16);

  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha === undefined ? 255 : Math.round(alpha * 255)];
};

const mix = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
  Math.round(a[3] + (b[3] - a[3]) * t),
];

/* Push a colour toward the haze the way distance does: wash out the
   saturation and pull it toward the sky. One call per depth layer keeps the
   whole horizon consistent instead of six hand-picked greys that don't
   quite agree with each other. */
const recede = (color, haze, amount) => mix(color, haze, amount);

/* Steps a palette ramp between two ends. Building the in-between tones once,
   up front, is what keeps the art to a countable number of colours. */
const ramp = (from, to, steps) => {
  const out = [];
  for (let i = 0; i < steps; i += 1) {
    out.push(mix(from, to, steps === 1 ? 0 : i / (steps - 1)));
  }
  return out;
};

/* ── Ordered dither ────────────────────────── */

/* The classic 8x8 Bayer matrix. Ordered rather than random because a still
   image made of noise crawls the moment it parallaxes past — an ordered
   threshold gives a stable weave that reads as a texture, not as grain. */

const BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

/* Where this pixel sits in the weave, 0–1. */
const threshold = (x, y) => (BAYER[((y % 8) + 8) % 8][((x % 8) + 8) % 8] + 0.5) / 64;

/* Chooses between two flat tones so that `t` of the area lands on `b`. This
   one function is the whole shading model. */
const pick = (x, y, t, a, b) => (threshold(x, y) < t ? b : a);

/* A coarser weave for large soft fields like fog banks, where an 8x8 pattern
   is fine enough to disappear into grey. 4x4 keeps the texture legible. */
const threshold4 = (x, y) => (BAYER[(((y % 4) + 4) % 4) * 2][(((x % 4) + 4) % 4) * 2] / 4 + 0.5) / 16;

const pick4 = (x, y, t, a, b) => (threshold4(x, y) < t ? b : a);

/* ── Noise ─────────────────────────────────── */

/* Deterministic, so the art is reproducible: re-running the generator has to
   produce the same world or every regeneration is a visual diff. */

const seeded = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const hash = (i, seed) => {
  let h = (i * 374761393 + seed * 668265263) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const smooth = (t) => t * t * (3 - 2 * t);

/* Value noise in one dimension. Ridgelines want this rather than a random
   walk: noise gives ranges that rise and fall over a wavelength, so peaks
   come in groups with valleys between them, which is how mountains look. */
const noise1 = (x, seed) => {
  const i = Math.floor(x);
  const f = x - i;
  return hash(i, seed) + (hash(i + 1, seed) - hash(i, seed)) * smooth(f);
};

/* Octaves: one long wavelength for the range, shorter ones for the peaks and
   the broken rock on top of them. */
const fbm = (x, seed, octaves, gain) => {
  let sum = 0;
  let amp = 1;
  let total = 0;
  let freq = 1;

  for (let o = 0; o < (octaves || 4); o += 1) {
    sum += noise1(x * freq, seed + o * 101) * amp;
    total += amp;
    amp *= gain || 0.5;
    freq *= 2;
  }

  return sum / total;
};

/* ── The canvas ────────────────────────────── */

class Sheet {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint8Array(w * h * 4);
    /* Strips that repeat — the sky ramp, the cloud bank, the ground — have to
       tile without a seam, so on those sheets x wraps and a tuft of grass
       drawn off the right edge comes back on the left. The terrain strips
       don't repeat, so they leave this off and simply clip. */
    this.wrapX = false;
  }

  col(x) {
    return this.wrapX ? ((x % this.w) + this.w) % this.w : x;
  }

  /* Bounds-checked, because nearly every shape below is happy to be drawn
     half off the edge of a strip and it should simply clip. */
  set(x, y, c) {
    x = this.col(x | 0);
    y |= 0;

    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c || c[3] === 0) {
      return;
    }

    const i = (y * this.w + x) * 4;

    // Source-over, so a translucent glaze can be laid over finished pixels.
    if (c[3] === 255) {
      this.d[i] = c[0];
      this.d[i + 1] = c[1];
      this.d[i + 2] = c[2];
      this.d[i + 3] = 255;
      return;
    }

    const sa = c[3] / 255;
    const da = this.d[i + 3] / 255;
    const oa = sa + da * (1 - sa);

    if (oa === 0) {
      return;
    }

    for (let k = 0; k < 3; k += 1) {
      this.d[i + k] = Math.round((c[k] * sa + this.d[i + k] * da * (1 - sa)) / oa);
    }
    this.d[i + 3] = Math.round(oa * 255);
  }

  get(x, y) {
    x = this.col(x | 0);
    y |= 0;

    if (x < 0 || y < 0 || x >= this.w || y >= this.h) {
      return CLEAR;
    }
    const i = (y * this.w + x) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  }

  /* Replaces rather than composites — for stamping transparency back into a
     sheet, which source-over cannot do. */
  poke(x, y, c) {
    x = this.col(x | 0);
    y |= 0;

    if (x < 0 || y < 0 || x >= this.w || y >= this.h) {
      return;
    }
    const i = (y * this.w + x) * 4;
    this.d[i] = c[0];
    this.d[i + 1] = c[1];
    this.d[i + 2] = c[2];
    this.d[i + 3] = c[3];
  }

  filled(x, y) {
    return this.get(x, y)[3] > 0;
  }

  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j += 1) {
      for (let i = 0; i < w; i += 1) {
        this.set(x + i, y + j, c);
      }
    }
    return this;
  }

  /* Two tones woven across a box. `t` may be a number or a function of the
     local coordinates, which is how everything from a flat 50% weave to a
     radial falloff gets drawn with one call. */
  weave(x, y, w, h, a, b, t) {
    const at = typeof t === "function" ? t : () => t;

    for (let j = 0; j < h; j += 1) {
      for (let i = 0; i < w; i += 1) {
        const v = at(i, j);
        if (v <= 0) {
          this.set(x + i, y + j, a);
        } else if (v >= 1) {
          this.set(x + i, y + j, b);
        } else {
          this.set(x + i, y + j, pick(x + i, y + j, v, a, b));
        }
      }
    }
    return this;
  }

  /* A vertical gradient made of flat bands with dithered seams — the sky, and
     every large shaded face in the world. `stops` is [{ at, color }] in 0–1
     of the box height; between two stops the seam is woven so the bands
     blend without a third colour being invented. */
  ramp(x, y, w, h, stops, opts) {
    const soft = (opts && opts.soft) !== undefined ? opts.soft : 0.5; // share of a band spent dithering
    const coarse = opts && opts.coarse;

    for (let j = 0; j < h; j += 1) {
      const p = h === 1 ? 0 : j / (h - 1);

      let hi = stops.findIndex((s) => s.at >= p);
      if (hi <= 0) {
        hi = stops[0].at >= p ? 0 : stops.length - 1;
      }
      const lo = Math.max(0, hi - 1);

      if (lo === hi) {
        this.rect(x, y + j, w, 1, stops[hi].color);
        continue;
      }

      const span = stops[hi].at - stops[lo].at || 1;
      const local = (p - stops[lo].at) / span;

      // Hold each band flat through its middle and spend only the tail of it
      // crossing over, so the result reads as bands rather than as one long
      // smear of noise.
      const edge = (1 - soft) / 2;
      const t =
        local <= edge ? 0 : local >= 1 - edge ? 1 : (local - edge) / Math.max(1e-6, 1 - edge * 2);

      for (let i = 0; i < w; i += 1) {
        const chooser = coarse ? pick4 : pick;
        this.set(
          x + i,
          y + j,
          t <= 0
            ? stops[lo].color
            : t >= 1
              ? stops[hi].color
              : chooser(x + i, y + j, t, stops[lo].color, stops[hi].color)
        );
      }
    }
    return this;
  }

  /* Dissolves what is already drawn into transparency, starting at `from` and
     gone by `to`.
   *
     This is the haze that separates one ridge from the next, and it works by
     removing pixels rather than by painting fog over them. That is the whole
     trick: the sky behind shows through the weave, so one strip fogs
     correctly against a harvest dusk, a white winter overcast and a near
     black campfire night without being redrawn. Painting a fog colour instead
     means picking one that is lighter than some of those skies, and a fog
     lighter than the sky behind it reads as a bright rule across the world. */
  fog(x, y, w, h, from, to, strength) {
    for (let j = 0; j < h; j += 1) {
      const p = h === 1 ? 0 : j / (h - 1);
      const t = (from < to ? (p - from) / (to - from) : (from - p) / (from - to)) * (strength === undefined ? 1 : strength);
      const cut = Math.max(0, Math.min(1, t));

      if (cut <= 0) {
        continue;
      }

      for (let i = 0; i < w; i += 1) {
        if (this.filled(x + i, y + j) && threshold4(x + i, y + j) < cut) {
          this.poke(x + i, y + j, CLEAR);
        }
      }
    }
    return this;
  }

  /* Lays a colour over only the pixels already drawn, on a dither, so a
     ridge can catch light or sink into shadow without its silhouette
     changing. */
  glaze(x, y, w, h, color, t) {
    const at = typeof t === "function" ? t : () => t;

    for (let j = 0; j < h; j += 1) {
      for (let i = 0; i < w; i += 1) {
        const v = at(i, j);
        if (v > 0 && this.filled(x + i, y + j) && threshold(x + i, y + j) < v) {
          this.set(x + i, y + j, color);
        }
      }
    }
    return this;
  }

  /* Fills between a top edge and a bottom edge, both given as a function of
     x. Terrain is all built from this: a ridgeline is a top edge and the
     bottom of the strip. */
  band(topAt, bottomAt, paint) {
    for (let x = 0; x < this.w; x += 1) {
      const top = Math.round(topAt(x));
      const bottom = Math.round(typeof bottomAt === "function" ? bottomAt(x) : bottomAt);

      for (let y = Math.max(0, top); y < Math.min(this.h, bottom); y += 1) {
        const c = paint(x, y, top, bottom);
        if (c) {
          this.set(x, y, c);
        }
      }
    }
    return this;
  }

  /* Even-odd scanline fill, sampled at pixel centres so two polygons sharing
     an edge meet exactly once. */
  poly(points, c) {
    let top = Infinity;
    let bottom = -Infinity;

    for (const p of points) {
      top = Math.min(top, p[1]);
      bottom = Math.max(bottom, p[1]);
    }

    for (let y = Math.max(0, Math.floor(top)); y <= Math.min(this.h - 1, Math.ceil(bottom)); y += 1) {
      const sy = y + 0.5;
      const cuts = [];

      for (let i = 0; i < points.length; i += 1) {
        const a = points[i];
        const b = points[(i + 1) % points.length];

        if (a[1] === b[1]) {
          continue;
        }
        if (sy >= Math.min(a[1], b[1]) && sy < Math.max(a[1], b[1])) {
          cuts.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }

      cuts.sort((m, n) => m - n);

      for (let i = 0; i + 1 < cuts.length; i += 2) {
        for (let x = Math.round(cuts[i]); x < Math.round(cuts[i + 1]); x += 1) {
          this.set(x, y, c);
        }
      }
    }
    return this;
  }

  line(x0, y0, x1, y1, c) {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const ex = Math.round(x1);
    const ey = Math.round(y1);
    const dx = Math.abs(ex - x);
    const dy = Math.abs(ey - y);
    const sx = x < ex ? 1 : -1;
    const sy = y < ey ? 1 : -1;
    let err = dx - dy;

    for (;;) {
      this.set(x, y, c);
      if (x === ex && y === ey) {
        break;
      }
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
    return this;
  }

  disc(cx, cy, r, c) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y += 1) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r * r) {
          this.set(x, y, c);
        }
      }
    }
    return this;
  }

  /* Traces the drawn silhouette. A one-pixel lit rim along the top and a dark
     one underneath is what makes a flat shape read as solid. */
  rim(color, dy, only) {
    const edge = [];

    for (let y = 0; y < this.h; y += 1) {
      for (let x = 0; x < this.w; x += 1) {
        if (!this.filled(x, y)) {
          continue;
        }
        const behind = this.filled(x, y - dy);
        if (!behind) {
          if (!only || only(x, y)) {
            edge.push([x, y]);
          }
        }
      }
    }

    for (const [x, y] of edge) {
      this.set(x, y, color);
    }
    return this;
  }

  blit(src, x, y, opts) {
    const flip = opts && opts.flip;

    for (let j = 0; j < src.h; j += 1) {
      for (let i = 0; i < src.w; i += 1) {
        const c = src.get(flip ? src.w - 1 - i : i, j);
        if (c[3] > 0) {
          this.set(x + i, y + j, c);
        }
      }
    }
    return this;
  }

  /* Nearest-neighbour, so a sprite drawn small and stamped larger keeps hard
     edges. Used where one shape repeats at several depths. */
  scaled(n) {
    const out = new Sheet(this.w * n, this.h * n);

    for (let y = 0; y < out.h; y += 1) {
      for (let x = 0; x < out.w; x += 1) {
        out.poke(x, y, this.get(Math.floor(x / n), Math.floor(y / n)));
      }
    }
    return out;
  }

  /* Trims fully transparent margins, so a sprite's box is its artwork and
     the CSS can position it by its real edges. */
  trimmed() {
    let x0 = this.w;
    let y0 = this.h;
    let x1 = -1;
    let y1 = -1;

    for (let y = 0; y < this.h; y += 1) {
      for (let x = 0; x < this.w; x += 1) {
        if (this.filled(x, y)) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
      }
    }

    if (x1 < 0) {
      return new Sheet(1, 1);
    }

    const out = new Sheet(x1 - x0 + 1, y1 - y0 + 1);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        out.poke(x - x0, y - y0, this.get(x, y));
      }
    }
    return out;
  }

  png() {
    return encodePNG(this.w, this.h, this.d);
  }
}

/* ── Output ────────────────────────────────── */

const OUT = path.join(__dirname, "art");

const save = (name, sheet) => {
  const png = sheet.png();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), png);
  console.log(
    "  " + name.padEnd(28) + String(sheet.w).padStart(5) + "x" + String(sheet.h).padEnd(5) +
      (png.length / 1024).toFixed(1).padStart(8) + " KB"
  );
  return sheet; // handed back so a caller can go on to composite a proof sheet
};

module.exports = {
  Sheet,
  save,
  OUT,
  rgba,
  mix,
  ramp,
  recede,
  CLEAR,
  pick,
  pick4,
  threshold,
  threshold4,
  seeded,
  noise1,
  fbm,
  hash,
};
