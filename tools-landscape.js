/**
 * Generates the parallax scenery as wide SVG strips, one per depth.
 *
 * Each strip is divided into zones, one per checkpoint of the road, and every
 * zone gets its own terrain: rolling downs at the start, monsoon wetland
 * through the loadout, black crags under the storm, snow peaks in the cold
 * snap, quarried mesa at the forge, pine vale at the campfire. Parameters are
 * blended across zone boundaries so the biomes grow into each other instead
 * of cutting.
 *
 * The strips map 1:1 onto the road: px-app.js positions them by scroll
 * progress rather than by a pixel multiple, so zone N is always on screen at
 * checkpoint N no matter the viewport. Parallax then comes from the strips
 * having different widths, so a narrow far strip crawls while the wide near
 * strip races.
 *
 * Colour is deliberately flat here. The per-season filters in px-style.css
 * already tint each region, so this file only shapes the land.
 *
 * Run: node tools-landscape.js
 */

const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "art");

const seeded = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const n = (v) => Math.round(v * 10) / 10;
const lerp = (a, b, t) => a + (b - a) * t;

/* ── The regions of the road ───────────────── */

/* `stages` is how many screens the group occupies, which is what sets each
   zone's share of the strip. crest/floor are the height band the ridges work
   in, seg is how far apart the peaks sit (small = jagged, large = rolling). */
const ZONES = [
  {
    key: "start", // harvest downs
    stages: 1,
    far: { crest: 120, floor: 248, seg: 150, snow: 0, flat: 0 },
    mid: { crest: 150, floor: 256, seg: 210, pines: 0.55 },
    near: { density: 0.78, scale: 1.15, snowy: 0, mix: { pine: 0.42, broad: 0.4, bare: 0, bush: 0.18, rock: 0 } },
    water: { rate: 0.15, width: 420 },
  },
  {
    key: "profile", // autumn woodland
    stages: 1,
    far: { crest: 96, floor: 246, seg: 130, snow: 0, flat: 0 },
    mid: { crest: 132, floor: 252, seg: 190, pines: 0.7 },
    near: { density: 0.72, scale: 1.05, snowy: 0, mix: { pine: 0.25, broad: 0.5, bare: 0.1, bush: 0.15, rock: 0 } },
    water: { rate: 0.3, width: 520 },
  },
  {
    key: "loadout", // monsoon wetland
    stages: 6,
    far: { crest: 150, floor: 258, seg: 170, snow: 0, flat: 0 },
    mid: { crest: 168, floor: 258, seg: 250, pines: 0.9 },
    near: { density: 1, scale: 1.3, snowy: 0, mix: { pine: 0.46, broad: 0.32, bare: 0, bush: 0.22, rock: 0 } },
    water: { rate: 0.85, width: 1500 },
  },
  {
    key: "skills", // storm crags
    stages: 2,
    far: { crest: 16, floor: 244, seg: 70, snow: 0.15, flat: 0 },
    mid: { crest: 54, floor: 250, seg: 116, pines: 0.08 },
    near: { density: 0.42, scale: 1.1, snowy: 0, mix: { pine: 0.05, broad: 0, bare: 0.7, bush: 0.05, rock: 0.2 } },
    water: { rate: 0, width: 300 },
  },
  {
    key: "xp", // winter peaks
    stages: 4,
    far: { crest: 12, floor: 246, seg: 115, snow: 1, flat: 0 },
    mid: { crest: 70, floor: 252, seg: 200, pines: 0.4 },
    near: { density: 0.34, scale: 0.95, snowy: 1, mix: { pine: 0.45, broad: 0, bare: 0.45, bush: 0.1, rock: 0 } },
    water: { rate: 0.45, width: 1100 },
  },
  {
    key: "builds", // quarried mesa
    stages: 3,
    far: { crest: 108, floor: 250, seg: 165, snow: 0, flat: 0.85 },
    mid: { crest: 150, floor: 254, seg: 240, pines: 0.12 },
    near: { density: 0.36, scale: 0.9, snowy: 0, mix: { pine: 0.08, broad: 0, bare: 0.14, bush: 0.4, rock: 0.38 } },
    water: { rate: 0, width: 300 },
  },
  {
    key: "save", // hearth vale
    stages: 1,
    far: { crest: 138, floor: 252, seg: 150, snow: 0, flat: 0 },
    mid: { crest: 156, floor: 256, seg: 200, pines: 0.85 },
    near: { density: 0.95, scale: 1.35, snowy: 0, mix: { pine: 0.72, broad: 0.1, bare: 0, bush: 0.18, rock: 0 } },
    water: { rate: 0.5, width: 900 },
  },
];

/* Zone bounds as fractions of the strip, weighted by how many screens each
   group occupies, so the strip lines up with the road. */
const TOTAL_STAGES = ZONES.reduce((sum, z) => sum + z.stages, 0);
{
  let at = 0;
  for (const zone of ZONES) {
    zone.from = at / TOTAL_STAGES;
    at += zone.stages;
    zone.to = at / TOTAL_STAGES;
  }
}

const BLEND = 0.035; // fraction of the strip spent growing from one biome into the next

/* Parameters at any point along the strip, eased across zone boundaries. */
const paramsAt = (frac, layer) => {
  let i = ZONES.findIndex((z) => frac < z.to);
  if (i < 0) i = ZONES.length - 1;

  const zone = ZONES[i];
  const here = zone[layer];
  const span = zone.to - zone.from;
  const edge = Math.min(BLEND, span / 2);

  let other = null;
  let t = 0;

  if (frac < zone.from + edge && i > 0) {
    other = ZONES[i - 1][layer];
    t = (1 - (frac - zone.from) / edge) / 2;
  } else if (frac > zone.to - edge && i < ZONES.length - 1) {
    other = ZONES[i + 1][layer];
    t = (1 - (zone.to - frac) / edge) / 2;
  }

  if (!other) return here;

  const out = {};
  for (const k of Object.keys(here)) {
    if (k === "mix") {
      out.mix = {};
      for (const m of Object.keys(here.mix)) out.mix[m] = lerp(here.mix[m], other.mix[m], t);
    } else {
      out[k] = lerp(here[k], other[k], t);
    }
  }
  return out;
};

/* ── Ridgelines ────────────────────────────── */

const ridgePoints = (w, layer, rnd) => {
  const pts = [];
  let x = 0;
  let peak = false;

  while (x < w) {
    const p = paramsAt(x / w, layer);
    const tall = peak && rnd() > 0.74;
    const y = peak
      ? lerp(p.crest, p.floor, rnd() * (tall ? 0.12 : 0.5))
      : p.floor - rnd() * (p.floor - p.crest) * 0.22;

    // Mesa country: peaks come off flat-topped rather than pointed.
    if (peak && p.flat && rnd() < p.flat) {
      pts.push([x - p.seg * 0.3, y], [x + p.seg * 0.3, y]);
    } else {
      pts.push([x, y]);
    }

    x += p.seg * (0.72 + rnd() * 0.56);
    peak = !peak;
  }

  pts.push([w, pts[0][1]]);
  return pts;
};

const ridgePath = (pts, h) =>
  `M0,${h} L` + pts.map((p) => `${n(p[0])},${n(p[1])}`).join(" L") + ` L${n(pts[pts.length - 1][0])},${h} Z`;

const snowCap = (left, peak, right, rnd) => {
  const t = 0.3 + rnd() * 0.16;
  const a = [peak[0] + (left[0] - peak[0]) * t, peak[1] + (left[1] - peak[1]) * t];
  const b = [peak[0] + (right[0] - peak[0]) * t, peak[1] + (right[1] - peak[1]) * t];
  const under = [];

  for (let i = 1; i < 5; i += 1) {
    const f = i / 5;
    under.push([b[0] + (a[0] - b[0]) * f, b[1] + (a[1] - b[1]) * f - rnd() * 7 + 2]);
  }

  return (
    `M${n(a[0])},${n(a[1])} L${n(peak[0])},${n(peak[1])} L${n(b[0])},${n(b[1])} ` +
    under.map((p) => `L${n(p[0])},${n(p[1])}`).join(" ") +
    " Z"
  );
};

/* ── Vegetation ────────────────────────────── */

/* Geometric flora, after the Flöra / Kerthin language: thin rods, perfect
   circles, and stacked teardrop crowns. Each tree is a designed object, not a
   chewed blob. See https://dev.to/kerthin/11-geometric-objects-trees-pure-css-p8l */

const emptyTree = () => ({ crowns: "", stems: "", nodes: "", snow: "", arcs: "" });

/* Downward mushroom cap — CSS border-radius: 0 0 50% 50% / 0 0 100% 100%. */
const teardrop = (cx, top, w, h) => {
  const l = cx - w / 2;
  const r = cx + w / 2;
  return `M${n(l)},${n(top)} L${n(r)},${n(top)} A${n(w / 2)},${n(h)} 0 0 1 ${n(l)},${n(top)} Z`;
};

const cup = (cx, bot, w, h) => {
  const l = cx - w / 2;
  const r = cx + w / 2;
  return `M${n(l)},${n(bot)} L${n(r)},${n(bot)} A${n(w / 2)},${n(h)} 0 0 0 ${n(l)},${n(bot)} Z`;
};

const rod = (x1, y1, x2, y2) => `M${n(x1)},${n(y1)} L${n(x2)},${n(y2)}`;

const hook = (x, y, w, h, side) => {
  const s = side < 0 ? -1 : 1;
  const x2 = x + s * w;
  return `M${n(x)},${n(y)} Q${n(x2)},${n(y)} ${n(x2)},${n(y + h)}`;
};

const crescent = (cx, cy, r) =>
  `M${n(cx)},${n(cy - r)} A${n(r)},${n(r)} 0 1 1 ${n(cx)},${n(cy + r)} ` +
  `A${n(r * 0.72)},${n(r * 0.72)} 0 1 0 ${n(cx)},${n(cy - r)} Z`;

const dot = (cx, cy, r) => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/>`;

/* 01 Fir — three columns of growing teardrops on a center rod, moon optional. */
const geoFir = (cx, base, hgt, rnd, snowy) => {
  const top = base - hgt;
  const crowns = [];
  const snow = [];
  const tiers = 8;
  const maxW = hgt * 0.36;

  for (let i = 0; i < tiers; i += 1) {
    const f = i / (tiers - 1);
    const w = lerp(maxW * 0.18, maxW, f);
    const hh = lerp(hgt * 0.045, hgt * 0.085, f);
    const y = top + 6 + f * hgt * 0.72;
    crowns.push(teardrop(cx, y, w, hh));
    if (snowy && i < 3) snow.push(teardrop(cx, y, w * 0.42, hh * 0.55));
  }

  const sideTiers = 6;
  for (let col = -1; col <= 1; col += 2) {
    const ox = col * maxW * 0.52;
    for (let i = 0; i < sideTiers; i += 1) {
      const f = i / (sideTiers - 1);
      const w = lerp(maxW * 0.16, maxW * 0.72, f);
      const hh = lerp(hgt * 0.04, hgt * 0.072, f);
      const y = top + 18 + f * hgt * 0.62 + (col > 0 ? 8 : 0);
      crowns.push(teardrop(cx + ox, y, w, hh));
    }
  }

  const nodes = [dot(cx, base - 5, Math.max(3.2, hgt * 0.028))];
  if (rnd() > 0.55) crowns.push(crescent(cx + maxW * 0.55, top + 10, hgt * 0.08));

  return {
    ...emptyTree(),
    crowns: crowns.map((d) => `<path d="${d}"/>`).join(""),
    stems: `<path d="${rod(cx, base, cx, top + 4)}"/>`,
    nodes: nodes.join(""),
    snow: snow.map((d) => `<path d="${d}"/>`).join(""),
    arcs: `<path d="M${n(cx - hgt * 0.16)},${n(base)} A${n(hgt * 0.16)},${n(hgt * 0.16)} 0 0 1 ${n(cx + hgt * 0.16)},${n(base)}"/>`,
  };
};

/* Compact crest fir — center column only, so the mid ridge stays a designed line. */
const geoFirFar = (cx, base, hgt) => {
  const top = base - hgt;
  const parts = [];
  for (let i = 0; i < 5; i += 1) {
    const f = i / 4;
    parts.push(teardrop(cx, top + 2 + f * hgt * 0.7, lerp(hgt * 0.22, hgt * 0.7, f), lerp(hgt * 0.12, hgt * 0.2, f)));
  }
  return parts.join(" ");
};

/* 04 Pine — stacked teardrops with a smaller kernel inside, plus a hooked bough. */
const geoPine = (cx, base, hgt, rnd, snowy) => {
  const top = base - hgt;
  const crowns = [];
  const snow = [];
  const stems = [rod(cx, base, cx, top + hgt * 0.08)];
  const sizes = [0.22, 0.3, 0.4, 0.5];

  sizes.forEach((s, i) => {
    const y = top + 4 + i * hgt * 0.16;
    const w = hgt * s;
    const hh = hgt * s * 0.55;
    crowns.push(teardrop(cx, y, w, hh));
    crowns.push(teardrop(cx, y + hh * 0.12, w * 0.48, hh * 0.5));
    if (snowy && i < 2) snow.push(teardrop(cx, y, w * 0.38, hh * 0.4));
  });

  const side = rnd() > 0.5 ? -1 : 1;
  const by = base - hgt * 0.38;
  stems.push(hook(cx, by, hgt * 0.22, hgt * 0.1, side));
  const nodes = [dot(cx + side * hgt * 0.22, by + hgt * 0.1, hgt * 0.035), dot(cx, top + 2, hgt * 0.03)];

  return {
    ...emptyTree(),
    crowns: crowns.map((d) => `<path d="${d}"/>`).join(""),
    stems: `<path d="${stems.join(" ")}"/>`,
    nodes: nodes.join(""),
    snow: snow.map((d) => `<path d="${d}"/>`).join(""),
  };
};

/* 03 Linden — a few stadium leaves on forked rods, plus kernel circles. */
const geoLinden = (cx, base, hgt, rnd) => {
  const top = base - hgt * 0.92;
  const stems = [rod(cx, base, cx, top + hgt * 0.28), rod(cx - 5, base, cx - 5, base - hgt * 0.42), rod(cx + 5, base, cx + 5, base - hgt * 0.38)];
  stems.push(hook(cx, base - hgt * 0.55, hgt * 0.16, hgt * 0.08, -1));
  stems.push(hook(cx, base - hgt * 0.48, hgt * 0.14, hgt * 0.07, 1));

  const a = hgt * 0.16;
  const leaves = [
    `<ellipse cx="${n(cx)}" cy="${n(top + a * 1.1)}" rx="${n(a * 0.72)}" ry="${n(a * 1.35)}"/>`,
    `<ellipse cx="${n(cx - a * 0.95)}" cy="${n(top + a * 1.55)}" rx="${n(a * 0.55)}" ry="${n(a * 1.05)}"/>`,
    `<ellipse cx="${n(cx + a * 1.05)}" cy="${n(top + a * 1.7)}" rx="${n(a * 0.85)}" ry="${n(a * 0.48)}"/>`,
  ];
  if (rnd() > 0.4) {
    leaves.push(`<ellipse cx="${n(cx + a * 0.15)}" cy="${n(top + a * 0.35)}" rx="${n(a * 0.42)}" ry="${n(a * 0.78)}"/>`);
  }

  return {
    ...emptyTree(),
    crowns: leaves.join(""),
    stems: `<path d="${stems.join(" ")}"/>`,
    nodes: [dot(cx, top + a * 1.1, a * 0.22), dot(cx - a * 0.95, top + a * 1.55, a * 0.16)].join(""),
  };
};

/* 11 Poplar — two flanking columns of teardrops and a mid-trunk circle. */
const geoPoplar = (cx, base, hgt, rnd) => {
  const top = base - hgt;
  const crowns = [];
  const cols = 7;
  for (let col = -1; col <= 1; col += 2) {
    for (let i = 0; i < cols; i += 1) {
      const f = i / (cols - 1);
      const w = lerp(hgt * 0.16, hgt * 0.28, f);
      const y = top + 10 + f * hgt * 0.42;
      crowns.push(teardrop(cx + col * hgt * 0.12, y, w, hgt * 0.04));
    }
  }
  if (rnd() > 0.5) {
    crowns.push(`M${n(cx - hgt * 0.12)},${n(top + 8)} A${n(hgt * 0.12)},${n(hgt * 0.12)} 0 0 1 ${n(cx + hgt * 0.12)},${n(top + 8)} Z`);
  }

  return {
    ...emptyTree(),
    crowns: crowns.map((d) => (d.startsWith("M") ? `<path d="${d}"/>` : d)).join(""),
    stems: `<path d="${rod(cx, base, cx, top + 6)}"/>`,
    nodes: dot(cx, base - hgt * 0.38, hgt * 0.055),
  };
};

/* 08 Willow — a hanging column of teardrops, cups on the other side. */
const geoWillow = (cx, base, hgt) => {
  const top = base - hgt * 0.55;
  const crowns = [];
  const nTiers = 8;
  for (let i = 0; i < nTiers; i += 1) {
    const f = i / (nTiers - 1);
    const w = lerp(hgt * 0.1, hgt * 0.2, f);
    const y = top + f * hgt * 0.42;
    crowns.push(teardrop(cx - hgt * 0.08, y, w, hgt * 0.032));
    crowns.push(cup(cx + hgt * 0.1, y + hgt * 0.04, w * 0.92, hgt * 0.03));
  }

  return {
    ...emptyTree(),
    crowns: crowns.map((d) => `<path d="${d}"/>`).join(""),
    stems: `<path d="${rod(cx, base, cx, top)} ${rod(cx, top + hgt * 0.12, cx - hgt * 0.08, top + hgt * 0.12)} ${rod(cx, top + 4, cx + hgt * 0.1, top + 4)}"/>`,
    nodes: dot(cx, base - 4, 3.4),
  };
};

/* 02 Sepal — one large teardrop on a rod. The simplest of the set. */
const geoSepal = (cx, base, hgt) => ({
  ...emptyTree(),
  crowns: `<path d="${teardrop(cx, base - hgt * 0.72, hgt * 0.42, hgt * 0.28)}"/>`,
  stems: `<path d="${rod(cx, base, cx, base - hgt * 0.44)}"/>`,
  nodes: dot(cx, base - hgt * 0.44, hgt * 0.04),
});

/* 01 Seedling — a kernel on a short rod, ringed by a ground arc. */
const geoSeedling = (cx, base, hgt) => ({
  ...emptyTree(),
  stems: `<path d="${rod(cx, base, cx, base - hgt * 0.7)}"/>`,
  nodes: [dot(cx, base - hgt * 0.78, hgt * 0.16), dot(cx, base - 3, 2.6)].join(""),
  arcs: `<path d="M${n(cx - hgt * 0.45)},${n(base)} A${n(hgt * 0.45)},${n(hgt * 0.22)} 0 0 1 ${n(cx + hgt * 0.45)},${n(base)}"/>`,
});

/* Storm trees: rods and kernels only — the same grammar, leafless. */
const geoBare = (cx, base, hgt, lean) => {
  const tipX = cx + lean * hgt * 0.22;
  const tipY = base - hgt;
  const stems = [rod(cx, base, tipX, tipY)];
  const nodes = [dot(tipX, tipY, 3.4)];
  const arms = [
    [0.45, -1, 0.28],
    [0.62, 1, 0.22],
    [0.78, -1, 0.16],
  ];
  for (const [f, side, reach] of arms) {
    const ax = cx + (tipX - cx) * f;
    const ay = base + (tipY - base) * f;
    stems.push(hook(ax, ay, hgt * reach, hgt * 0.08, side));
    nodes.push(dot(ax + side * hgt * reach, ay + hgt * 0.08, 2.8));
  }
  return { ...emptyTree(), stems: `<path d="${stems.join(" ")}"/>`, nodes: nodes.join("") };
};

const geoBush = (cx, base, size, rnd) => {
  const crowns = [];
  const count = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < count; i += 1) {
    const dx = (i - (count - 1) / 2) * size * 0.38;
    crowns.push(teardrop(cx + dx, base - size * (0.22 + rnd() * 0.08), size * (0.42 + rnd() * 0.18), size * 0.2));
  }
  return { ...emptyTree(), crowns: crowns.map((d) => `<path d="${d}"/>`).join(""), nodes: dot(cx, base - 3, 2.4) };
};

const boulder = (cx, base, size, rnd) => {
  const r = size * (0.7 + rnd() * 0.25);
  return `<circle cx="${n(cx)}" cy="${n(base - r * 0.35)}" r="${n(r)}"/>`;
};

/* ── Water ─────────────────────────────────── */

const waterBodies = (w, h, rnd) => {
  const out = [];
  let x = 300;

  while (x < w - 500) {
    const p = paramsAt(x / w, "water");

    // Dry zones simply never roll a body, so the crags and the quarry stay dry.
    if (p.rate > 0.02 && rnd() < p.rate) {
      const width = p.width * (0.7 + rnd() * 0.7);
      const top = h * (0.32 + rnd() * 0.18);
      const lip = 8 + rnd() * 6;

      out.push(
        `<path d="M${n(x)},${n(h)} L${n(x + width * 0.12)},${n(top + lip)} ` +
          `L${n(x + width * 0.5)},${n(top)} L${n(x + width * 0.88)},${n(top + lip)} ` +
          `L${n(x + width)},${n(h)} Z" fill="#5c7f96"/>`,
        `<path d="M${n(x + width * 0.12)},${n(top + lip)} L${n(x + width * 0.5)},${n(top)} ` +
          `L${n(x + width * 0.88)},${n(top + lip)}" stroke="#9fc2d4" stroke-width="3" fill="none"/>`
      );

      for (let i = 0; i < 6; i += 1) {
        const sx = x + width * (0.16 + rnd() * 0.68);
        const sy = top + lip + rnd() * (h - top - lip) * 0.6;
        const len = 30 + rnd() * 90;
        out.push(
          `<path d="M${n(sx)},${n(sy)} L${n(sx + len)},${n(sy)}" stroke="#a8cade" ` +
            `stroke-width="2" opacity="${(0.16 + rnd() * 0.24).toFixed(2)}"/>`
        );
      }

      x += width + 320 + rnd() * 700;
    } else {
      x += 380;
    }
  }

  return out.join("\n");
};

/* ── Assembly ──────────────────────────────── */

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${body}\n</svg>\n`;

const write = (name, contents) => {
  fs.writeFileSync(path.join(OUT, name), contents);
  console.log("  " + name.padEnd(20), (contents.length / 1024).toFixed(1).padStart(6) + " KB");
};

const ridgeStrip = ({ w, h, layer, rock, shade, snow, rnd }) => {
  const pts = ridgePoints(w, layer, rnd);
  const caps = [];

  for (let i = 1; i < pts.length - 1; i += 1) {
    const p = paramsAt(pts[i][0] / w, layer);
    const isPeak = pts[i][1] < pts[i - 1][1] && pts[i][1] < pts[i + 1][1];
    if (isPeak && p.snow && rnd() < p.snow) caps.push(snowCap(pts[i - 1], pts[i], pts[i + 1], rnd));
  }

  return [
    `<path d="${ridgePath(pts, h)}" fill="${rock}"/>`,
    `<path d="${ridgePath(pts.map((p) => [p[0], p[1] + 26 + rnd() * 10]), h)}" fill="${shade}" opacity="0.55"/>`,
    caps.length ? `<g fill="${snow}">${caps.map((d) => `<path d="${d}"/>`).join("")}</g>` : "",
  ].join("\n");
};

console.log("Generating scenery strips:");

/* Far ridges. Narrowest strip, so it crawls. */
{
  const w = 6400;
  const h = 320;
  const rnd = seeded(20260906);
  write("layer-far.svg", svg(w, h, ridgeStrip({
    w, h, layer: "far", rock: "#7b7490", shade: "#5f596f", snow: "#e9eef6", rnd,
  })));
}

/* Mid ridges, with a pine line following the crest where the zone wants one. */
{
  const w = 9600;
  const h = 300;
  const rnd = seeded(77123);
  const pts = ridgePoints(w, "mid", rnd);
  const trees = [];

  let x = 0;
  let seg = 0;
  while (x < w) {
    const p = paramsAt(x / w, "mid");
    while (seg < pts.length - 2 && pts[seg + 1][0] < x) seg += 1;

    if (rnd() < p.pines) {
      const span = pts[seg + 1][0] - pts[seg][0] || 1;
      const ground = lerp(pts[seg][1], pts[seg + 1][1], (x - pts[seg][0]) / span);
      trees.push(geoFirFar(x, ground + 8, 26 + rnd() * 22));
    }

    x += 36 + rnd() * 28;
  }

  write("layer-mid.svg", svg(w, h, [
    ridgeStrip({ w, h, layer: "mid", rock: "#6a6478", shade: "#514c60", snow: "#dfe6f0", rnd }),
    `<g fill="#46584c"><path d="${trees.join(" ")}"/></g>`,
  ].join("\n")));
}

/* Water: wide marshes through the monsoon, a frozen lake in the cold snap,
   nothing at all across the crags and the quarry. */
{
  const w = 10200;
  const h = 170;
  const rnd = seeded(5150);
  write("layer-water.svg", svg(w, h, waterBodies(w, h, rnd)));
}

/* Near treeline. Widest strip, so it races past. Geometric trees need air —
   pack them and they collapse back into a hedge. */
{
  const w = 19040;
  const h = 280;
  const base = h - 6;
  const rnd = seeded(31337);
  const back = { crowns: [], stems: [], nodes: [], arcs: [] };
  const front = { crowns: [], stems: [], nodes: [], snow: [], arcs: [] };
  const rocks = [];

  const take = (tree, dest) => {
    if (tree.crowns) dest.crowns.push(tree.crowns);
    if (tree.stems) dest.stems.push(tree.stems);
    if (tree.nodes) dest.nodes.push(tree.nodes);
    if (tree.snow && dest.snow) dest.snow.push(tree.snow);
    if (tree.arcs) dest.arcs.push(tree.arcs);
  };

  const pick = (px, ground, hgt, p, wet, dest) => {
    const roll = rnd();
    const mix = p.mix;
    let acc = mix.pine;
    const snowy = p.snowy > 0.5;

    if (roll < acc) {
      take(rnd() > 0.42 ? geoFir(px, ground, hgt, rnd, snowy) : geoPine(px, ground, hgt, rnd, snowy), dest);
    } else if (roll < (acc += mix.broad)) {
      if (wet > 0.55 && rnd() > 0.45) take(geoWillow(px, ground, hgt), dest);
      else if (rnd() > 0.62) take(geoPoplar(px, ground, hgt, rnd), dest);
      else if (rnd() > 0.35) take(geoLinden(px, ground, hgt, rnd), dest);
      else take(geoSepal(px, ground, hgt * 0.85), dest);
    } else if (roll < (acc += mix.bare)) {
      take(geoBare(px, ground, hgt, 0.5), dest);
    } else if (roll < (acc += mix.bush)) {
      if (rnd() > 0.55) take(geoSeedling(px, ground, hgt * 0.45), dest);
      else take(geoBush(px, ground, hgt * 0.28, rnd), dest);
    } else if (mix.rock > 0) {
      rocks.push(boulder(px, ground + 2, (16 + rnd() * 18) * p.scale, rnd));
    }
  };

  let bx = 40;
  while (bx < w) {
    const p = paramsAt(bx / w, "near");
    if (rnd() < p.density * 0.45) {
      pick(bx, base - 12, Math.min(150, (90 + rnd() * 50) * p.scale * 0.7), p, 0, back);
    }
    bx += 70 + rnd() * 80;
  }

  let x = 20;
  while (x < w) {
    const p = paramsAt(x / w, "near");
    const wet = paramsAt(x / w, "water").rate;
    const swell = 0.78 + 0.14 * Math.sin(x / 240);
    if (rnd() < p.density * swell * 0.72) {
      const hgt = Math.min(250, (100 + rnd() * 110) * p.scale);
      pick(x, base, hgt, p, wet, front);
    }
    x += (48 + rnd() * 56) / Math.max(0.65, p.density);
  }

  write("layer-near.svg", svg(w, h, [
    `<g fill="#3a4d40">${back.crowns.join("")}</g>`,
    `<g fill="none" stroke="#2a221c" stroke-width="2" stroke-linecap="round">${back.stems.join("")}${back.arcs.join("")}</g>`,
    `<g fill="#2a221c">${back.nodes.join("")}</g>`,
    `<g fill="none" stroke="#2c241e" stroke-width="2.4" stroke-linecap="round">${front.stems.join("")}${front.arcs.join("")}</g>`,
    `<g fill="#3a2e28">${front.nodes.join("")}</g>`,
    `<g fill="#4a6b52">${front.crowns.join("")}</g>`,
    front.snow.length ? `<g fill="#dde6ef">${front.snow.join("")}</g>` : "",
    rocks.length ? `<g fill="#5d5866">${rocks.join("")}</g>` : "",
  ].join("\n")));
}

console.log("\nZones along the road:");
for (const z of ZONES) {
  console.log(
    "  " + z.key.padEnd(9),
    (z.from * 100).toFixed(1).padStart(5) + "% – " + (z.to * 100).toFixed(1).padStart(5) + "%",
    " (" + z.stages + (z.stages === 1 ? " stage)" : " stages)")
  );
}
