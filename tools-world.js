/**
 * Draws the world: sky ramps, cloud banks, three depths of ridgeline, the
 * water, the treeline and the ground the walker actually stands on.
 *
 * Everything is one art pixel per array cell and gets multiplied up by an
 * integer in the browser, so what is drawn here is what appears on screen.
 *
 * The road is divided into zones, one per checkpoint, and every strip is cut
 * to the same proportions as the stages along the road — so zone N is on
 * screen at checkpoint N whatever the viewport. Parallax comes from the
 * strips being different widths: the far ridges have a short run and crawl,
 * the treeline has a long one and races.
 *
 * Depth is sold three ways, all of them borrowed from how the eye actually
 * works rather than from what is cheap to draw:
 *
 *   1. Contrast collapses with distance. Each layer's palette is mixed toward
 *      the haze colour, so far ridges are a narrow band of mauve while the
 *      treeline still has near-black in it.
 *   2. The base of every layer dissolves into a dither instead of ending on a
 *      hard line. That is the fog the next layer back shows through, and it
 *      is what separates six overlapping silhouettes into six distances.
 *   3. Light comes from one place — the west, low, where this world's sun
 *      sets — so every slope, trunk and rock face is lit on the same side.
 *
 * Run: node tools-world.js
 */

const { Sheet, save, rgba, mix, recede, seeded, fbm, hash, pick, threshold, threshold4 } = require("./tools-pixel");

/* ── The world's palette ───────────────────── */

/* One list, so nothing in the world is a colour nothing else is. The ridge
   ramps are derived from rock and haze rather than picked by hand, which is
   what keeps three depths of mountain in agreement. */

const HAZE = rgba("#6f5f7a"); // the colour distance pulls everything toward

const rock = {
  lit: rgba("#8a7d9c"),
  mid: rgba("#6f6584"),
  dark: rgba("#584f6b"),
  deep: rgba("#443c55"),
};

const snow = {
  lit: rgba("#f0f3fb"),
  mid: rgba("#d3dbec"),
  dark: rgba("#a9b5cd"),
};

const needle = {
  lit: rgba("#4e7c63"),
  mid: rgba("#36584b"),
  dark: rgba("#244038"),
  deep: rgba("#182b25"),
};

const leaf = {
  lit: rgba("#66854f"),
  mid: rgba("#48613c"),
  dark: rgba("#32472d"),
  deep: rgba("#20301f"),
};

const bark = {
  lit: rgba("#5f4838"),
  mid: rgba("#41322a"),
  dark: rgba("#2a201d"),
};

const water = {
  lit: rgba("#7ba3b8"),
  mid: rgba("#4d7288"),
  dark: rgba("#35526a"),
  deep: rgba("#263d52"),
};

const soil = {
  lit: rgba("#4e3d36"),
  mid: rgba("#382b2a"),
  dark: rgba("#251d20"),
  deep: rgba("#181318"),
};

const grass = {
  lit: rgba("#658a58"),
  mid: rgba("#476542"),
  dark: rgba("#2f4a33"),
  deep: rgba("#1f3325"),
};

/* Distance ramps. `recede` mixes toward the haze, so a peak eleven miles out
   and a peak two miles out are the same rock under different amounts of air. */
const shade = (base, amount) => ({
  lit: recede(base.lit, HAZE, amount),
  mid: recede(base.mid, HAZE, amount),
  dark: recede(base.dark, HAZE, amount),
  deep: recede(base.deep || base.dark, HAZE, amount),
});

const FAR = shade(rock, 0.5);
const MID = shade(rock, 0.22);
const HILL = { lit: rgba("#423d52"), mid: rgba("#332f42"), dark: rgba("#262333"), deep: rgba("#1b1926") };

/* How far up each strip the haze starts eating it, and where the silhouette
   has gone entirely. No fog colour: the sky itself is the fog, showing
   through a dither, which is the only way one strip can haze correctly
   against seven different skies. Contrast collapse is handled up front
   instead, by mixing each depth's palette toward HAZE with `shade`. */
const AIR = {
  far: { from: 0.44, to: 0.88 },
  mid: { from: 0.52, to: 0.92 },
  hill: { from: 0.6, to: 0.97 },
  near: { from: 0.34, to: 0.99 },
};

/* ── The regions of the road ───────────────── */

/* `stages` is how many screens the group occupies, which is what sets each
   zone's share of every strip.

   crest/floor are the height band a ridgeline works in, as a fraction of the
   strip: 0 is the top of the strip, 1 the bottom. `wave` is the wavelength of
   the range in art pixels — short is jagged, long is rolling. `rough` folds
   the noise into sharp crests, so 0 is downland and 1 is the crags. */

const ZONES = [
  {
    key: "start", // harvest downs
    stages: 1,
    wind: 0.12,
    far: { crest: 0.24, floor: 0.56, wave: 190, rough: 0.15, snow: 0, flat: 0 },
    mid: { crest: 0.28, floor: 0.62, wave: 150, rough: 0.2, pines: 0.5, scree: 0 },
    hill: { crest: 0.3, floor: 0.66, wave: 130, rough: 0.1, scrub: 0.6 },
    water: { rate: 0.14, width: 150 },
    near: { density: 0.62, scale: 1, snowy: 0, mix: { pine: 0.2, broad: 0.46, bare: 0.02, bush: 0.28, rock: 0.02, reed: 0.02 } },
  },
  {
    key: "profile", // autumn woodland
    stages: 1,
    wind: 0.22,
    far: { crest: 0.18, floor: 0.52, wave: 170, rough: 0.24, snow: 0, flat: 0 },
    mid: { crest: 0.22, floor: 0.6, wave: 135, rough: 0.3, pines: 0.66, scree: 0 },
    hill: { crest: 0.26, floor: 0.64, wave: 115, rough: 0.16, scrub: 0.8 },
    water: { rate: 0.3, width: 190 },
    near: { density: 0.82, scale: 1.04, snowy: 0, mix: { pine: 0.24, broad: 0.48, bare: 0.08, bush: 0.16, rock: 0.02, reed: 0.02 } },
  },
  {
    key: "loadout", // monsoon wetland
    stages: 6,
    wind: 0.3,
    far: { crest: 0.3, floor: 0.6, wave: 210, rough: 0.18, snow: 0, flat: 0 },
    mid: { crest: 0.34, floor: 0.66, wave: 175, rough: 0.22, pines: 0.85, scree: 0 },
    hill: { crest: 0.34, floor: 0.7, wave: 150, rough: 0.12, scrub: 0.9 },
    water: { rate: 0.86, width: 520 },
    near: { density: 0.92, scale: 1.12, snowy: 0, mix: { pine: 0.42, broad: 0.2, bare: 0.02, bush: 0.16, rock: 0.02, reed: 0.18 } },
  },
  {
    key: "skills", // storm crags
    stages: 2,
    wind: 0.95,
    far: { crest: 0.03, floor: 0.5, wave: 105, rough: 0.9, snow: 0.22, flat: 0 },
    mid: { crest: 0.06, floor: 0.56, wave: 88, rough: 0.95, pines: 0.06, scree: 0.7 },
    hill: { crest: 0.12, floor: 0.6, wave: 78, rough: 0.8, scrub: 0.2 },
    water: { rate: 0, width: 120 },
    near: { density: 0.46, scale: 1.08, snowy: 0, mix: { pine: 0.04, broad: 0, bare: 0.62, bush: 0.06, rock: 0.28, reed: 0 } },
  },
  {
    key: "xp", // winter peaks
    stages: 4,
    wind: 0.4,
    far: { crest: 0.02, floor: 0.52, wave: 165, rough: 0.62, snow: 1, flat: 0 },
    mid: { crest: 0.1, floor: 0.58, wave: 140, rough: 0.5, pines: 0.34, scree: 0.25 },
    hill: { crest: 0.18, floor: 0.62, wave: 120, rough: 0.34, scrub: 0.4 },
    water: { rate: 0.44, width: 400 },
    near: { density: 0.4, scale: 0.96, snowy: 1, mix: { pine: 0.46, broad: 0, bare: 0.34, bush: 0.08, rock: 0.12, reed: 0 } },
  },
  {
    key: "builds", // quarried mesa
    stages: 3,
    wind: 0.3,
    far: { crest: 0.2, floor: 0.54, wave: 200, rough: 0.4, snow: 0, flat: 0.9 },
    mid: { crest: 0.26, floor: 0.6, wave: 165, rough: 0.34, pines: 0.1, scree: 0.5 },
    hill: { crest: 0.28, floor: 0.64, wave: 140, rough: 0.24, scrub: 0.3 },
    water: { rate: 0, width: 120 },
    near: { density: 0.42, scale: 0.92, snowy: 0, mix: { pine: 0.06, broad: 0.02, bare: 0.12, bush: 0.34, rock: 0.46, reed: 0 } },
  },
  {
    key: "save", // hearth vale
    stages: 1,
    wind: 0.14,
    far: { crest: 0.26, floor: 0.58, wave: 185, rough: 0.2, snow: 0, flat: 0 },
    mid: { crest: 0.28, floor: 0.64, wave: 150, rough: 0.24, pines: 0.82, scree: 0 },
    hill: { crest: 0.28, floor: 0.66, wave: 125, rough: 0.14, scrub: 0.85 },
    water: { rate: 0.48, width: 320 },
    near: { density: 0.86, scale: 1.16, snowy: 0, mix: { pine: 0.66, broad: 0.1, bare: 0.02, bush: 0.18, rock: 0.02, reed: 0.02 } },
  },
];

const TOTAL_STAGES = ZONES.reduce((sum, z) => sum + z.stages, 0);
{
  let at = 0;
  for (const zone of ZONES) {
    zone.from = at / TOTAL_STAGES;
    at += zone.stages;
    zone.to = at / TOTAL_STAGES;
  }
}

const BLEND = 0.04; // share of the strip spent growing one biome into the next
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* Parameters anywhere along a strip, eased across zone boundaries so the
   crags grow out of the wetland instead of being cut in beside it. */
const paramsAt = (frac, layer) => {
  let i = ZONES.findIndex((z) => frac < z.to);
  if (i < 0) i = ZONES.length - 1;

  const zone = ZONES[i];
  const here = zone[layer];
  const edge = Math.min(BLEND, (zone.to - zone.from) / 2);

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

/* Two octaves of value noise, folded. The fold — 1 - |2v - 1| — is what turns
   soft hills into a mountain: it creases the noise at its midline, so crests
   come out sharp and valleys come out wide, which is the shape erosion
   actually leaves. `rough` decides how much of that fold gets used. */

const ridgeAt = (x, w, h, layer, seed) => {
  const p = paramsAt(x / w, layer);
  const range = fbm(x / p.wave, seed, 4, 0.52);
  const peaks = fbm(x / (p.wave * 0.26), seed + 61, 3, 0.5);

  const v = range * 0.68 + peaks * 0.32;
  const folded = 1 - Math.abs(2 * v - 1);
  const alt = lerp(v, folded, p.rough);

  let y = lerp(p.floor, p.crest, alt) * h;

  // Mesa country: quantise the skyline into terraces so the peaks come off
  // flat-topped and stratified, the way a quarried plateau does.
  if (p.flat) {
    const step = 5;
    y = lerp(y, Math.round(y / step) * step, p.flat);
  }

  return y;
};

const windAt = (frac) => {
  let i = ZONES.findIndex((z) => frac < z.to);
  if (i < 0) i = ZONES.length - 1;

  const zone = ZONES[i];
  const edge = Math.min(BLEND, (zone.to - zone.from) / 2);

  if (frac < zone.from + edge && i > 0) {
    return lerp(zone.wind, ZONES[i - 1].wind, (1 - (frac - zone.from) / edge) / 2);
  }
  if (frac > zone.to - edge && i < ZONES.length - 1) {
    return lerp(zone.wind, ZONES[i + 1].wind, (1 - (zone.to - frac) / edge) / 2);
  }
  return zone.wind;
};

/* Fills a ridge body with light from the west, using the local gradient of
   the skyline: a slope falling away to the west catches the sun, a slope
   falling east is in its own shadow. Three tones and a dither is enough to
   read as rock.
 *
 * Haze is done here, in the same pass, and that matters. Shading a strip
 * solid and then fading it out afterwards leaves a rule across the picture
 * where the second pass starts, because two dithers stacked on the same
 * pixels beat against each other. Doing it once means a column of rock gets
 * lighter and thinner together, the way a ridge eleven miles out actually
 * goes: it is not a faded mountain, it is a mountain with air in front of it.
 */
const paintRidge = (sheet, edge, pal, opts) => {
  const w = sheet.w;
  const h = sheet.h;
  const relief = opts.relief === undefined ? 8 : opts.relief;
  const haze = opts.haze || { from: 0.5, to: 0.9, tone: HAZE, tint: 0.85 };

  // How much air is in front of this row: 0 at the crest, 1 where the ridge
  // has dissolved completely and the next layer back takes over.
  const airAt = (y) => clamp01((y / h - haze.from) / Math.max(0.001, haze.to - haze.from));

  for (let x = 0; x < w; x += 1) {
    const top = Math.round(edge(x));
    // Slope over a few pixels rather than one, so a single jagged pixel does
    // not flip a whole column into shadow.
    const slope = (edge(Math.min(w - 1, x + 3)) - edge(Math.max(0, x - 3))) / 6;
    const west = clamp01(0.5 - slope * 1.6); // 1 when the face drops westward

    for (let y = Math.max(0, top); y < h; y += 1) {
      const air = airAt(y);

      // Fully hazed: the rock simply isn't there any more.
      if (air >= 1) {
        continue;
      }
      // Partly hazed: punch the silhouette full of holes on a coarse weave,
      // so the sky reads through it as mist rather than as translucency.
      if (air > 0 && threshold4(x, y) < air) {
        continue;
      }

      const below = y - top; // depth into the rock from the skyline

      // Rock lightens toward the skyline and sinks toward the valley floor.
      const lit = clamp01(1 - below / relief) * west;
      const deep = clamp01((below - relief) / (h * 0.55));

      let c;
      if (lit > 0.05) {
        c = pick(x, y, lit, pal.mid, pal.lit);
      } else {
        c = pick(x, y, deep, pal.mid, pal.deep);
      }

      // A darker seam a little under the skyline reads as the shoulder of the
      // ridge turning away, which is what stops a filled shape looking flat.
      if (below > relief * 0.6 && below < relief * 1.7 && west < 0.42) {
        c = pick(x, y, 0.55, c, pal.dark);
      }

      // Aerial perspective: contrast collapses toward the haze before the
      // silhouette does, so the base of the ridge is pale as well as thin.
      if (air > 0) {
        c = pick(x, y, air * (haze.tint === undefined ? 0.85 : haze.tint), c, haze.tone);
      }

      sheet.set(x, y, c);
    }
  }

  /* Snow. Sits above a wandering snowline rather than capping each peak, so a
     whole range goes white together and the line itself has weather in it. */
  if (opts.snowline) {
    for (let x = 0; x < w; x += 1) {
      const p = paramsAt(x / w, opts.layer);
      if (!p.snow) continue;

      const top = Math.round(edge(x));
      const line = top + 2 + fbm(x / 30, opts.seed + 909, 3, 0.5) * 11;
      const slope = (edge(Math.min(w - 1, x + 2)) - edge(Math.max(0, x - 2))) / 4;
      const west = clamp01(0.5 - slope * 1.6);

      for (let y = Math.max(0, top); y < Math.min(h, Math.ceil(line) + 5); y += 1) {
        if (!sheet.filled(x, y)) continue;

        // Dither out along the bottom of the snowfield so it melts into rock
        // instead of ending on a contour line.
        const t = clamp01((line - y) / 5) * p.snow;
        if (t <= 0 || threshold(x, y) >= t) continue;

        const air = airAt(y);
        const cap = west > 0.45 ? snow.lit : snow.mid;
        sheet.set(x, y, air > 0 ? pick(x, y, air * 0.7, cap, haze.tone) : cap);
      }
    }
  }
};

/* Scree: loose stone spilling off the foot of a slope, drawn as scattered
   pixels thinning downward. Cheap, and the thing that keeps a crag from
   ending on a clean line. */
const scree = (sheet, edge, pal, layer, seed, haze) => {
  const h = sheet.h;

  for (let x = 0; x < sheet.w; x += 1) {
    const p = paramsAt(x / sheet.w, layer);
    if (!p.scree) continue;

    const top = Math.round(edge(x));
    const reach = 10 + fbm(x / 20, seed + 33, 2, 0.5) * 16;

    for (let i = 0; i < reach; i += 1) {
      const y = Math.round(top + reach * 0.45 + i);
      if (y >= h) break;

      const air = clamp01((y / h - haze.from) / Math.max(0.001, haze.to - haze.from));
      if (air >= 0.9) continue;

      // Thins out as the slope runs out of stone to shed.
      const t = clamp01(1 - i / reach) * p.scree * 0.4;
      if (hash(x * 977 + y * 31, seed) > t) continue;

      const c = hash(x + y, seed + 5) > 0.5 ? pal.dark : pal.deep;
      sheet.set(x, y, air > 0 ? pick(x, y, air * 0.8, c, haze.tone) : c);
    }
  }
};

/* ── Vegetation ────────────────────────────── */

/* A conifer, built as a silhouette rather than as stacked triangles.
 *
 * Walking down the trunk, the half-width grows with height but is modulated
 * by a sawtooth, so the outline steps in and out once per branch tier — which
 * is what a spruce actually looks like from a distance, and what three
 * nested triangles never manage. Then the same tier phase is reused for
 * shading, so each tier is lit along its upper west edge and shadowed
 * underneath where the tier above it hangs over.
 */
const pine = (sheet, cx, base, height, halfWidth, pal, seed, opts) => {
  const tiers = Math.max(3, Math.round(height / 7));
  const laden = (opts && opts.snow) || 0;
  const trunk = Math.max(1, Math.round(halfWidth * 0.22));

  // Trunk first, so the needles close over it and only the bare foot shows.
  for (let y = base - Math.round(height * 0.18); y < base; y += 1) {
    for (let i = 0; i < trunk; i += 1) {
      sheet.set(cx - (trunk >> 1) + i, y, i === trunk - 1 ? bark.mid : bark.dark);
    }
  }

  for (let y = base - height; y < base; y += 1) {
    const f = clamp01((y - (base - height)) / height); // 0 at the tip
    const phase = f * tiers;
    const saw = phase - Math.floor(phase); // 0 at a tier's shoulder, 1 at its skirt

    // Tiers hang: each starts narrow at the trunk and sweeps out and down.
    const spread = Math.pow(f, 0.72) * halfWidth;
    const tier = 0.52 + 0.48 * Math.pow(saw, 0.6);
    let hw = spread * tier;

    // Ragged by a pixel or two, so no two tiers end on the same silhouette.
    hw += (hash(y * 13, seed) - 0.5) * 1.6;
    if (f < 0.06) hw = Math.min(hw, 1.2);
    if (hw < 0.5) continue;

    const left = Math.round(cx - hw);
    const right = Math.round(cx + hw);

    for (let x = left; x <= right; x += 1) {
      const across = (x - cx) / Math.max(1, hw); // -1 west edge, +1 east edge

      // Light from the west: the western half of every tier catches it.
      let c;
      const litness = clamp01(-across * 0.9 + 0.32) * clamp01(1 - saw * 0.8);
      const shadow = clamp01(across * 0.8 + 0.1) + clamp01(saw - 0.55) * 0.8;

      if (litness > 0.12) {
        c = pick(x, y, litness, pal.mid, pal.lit);
      } else {
        c = pick(x, y, clamp01(shadow), pal.mid, pal.dark);
      }

      // The underside of each skirt sits against the tier below it.
      if (saw > 0.86) {
        c = pick(x, y, 0.7, c, pal.deep);
      }

      sheet.set(x, y, c);
    }

    // Snow loads the shoulder of each tier, where it would actually settle.
    if (laden && saw < 0.3) {
      const cap = Math.round(hw * 0.8);
      for (let x = cx - cap; x <= cx + cap; x += 1) {
        const t = laden * clamp01(1 - saw / 0.3) * clamp01(1 - Math.abs(x - cx) / Math.max(1, cap));
        if (t > 0.15 && threshold(x, y) < t) {
          sheet.set(x, y, (x - cx) / Math.max(1, cap) < 0.1 ? snow.lit : snow.mid);
        }
      }
    }
  }
};

/* A broadleaf: overlapping lobes of crown with a bitten edge, over a trunk
   that forks. The lobes are placed on a ring rather than in a row, so the
   crown reads as a mass with depth instead of as a hedge. */
const broadleaf = (sheet, cx, base, height, pal, seed) => {
  const crownR = height * 0.3;
  const crownY = base - height + crownR * 0.9;

  // Trunk and two boughs into the crown.
  const trunkH = height * 0.46;
  for (let y = base; y > base - trunkH; y -= 1) {
    const f = (base - y) / trunkH;
    const wide = Math.max(1, Math.round((1 - f) * height * 0.055 + 1));
    for (let i = 0; i < wide; i += 1) {
      sheet.set(cx - (wide >> 1) + i, y, i === wide - 1 ? bark.mid : bark.dark);
    }
  }
  sheet.line(cx, base - trunkH * 0.7, cx - crownR * 0.7, base - trunkH * 1.1, bark.dark);
  sheet.line(cx, base - trunkH * 0.8, cx + crownR * 0.6, base - trunkH * 1.2, bark.dark);

  const lobes = 5 + Math.floor(hash(seed, 3) * 3);
  const spots = [];
  for (let i = 0; i < lobes; i += 1) {
    const a = (i / lobes) * Math.PI * 2 + hash(seed + i, 11) * 0.7;
    spots.push([
      cx + Math.cos(a) * crownR * (0.5 + hash(seed + i, 21) * 0.4),
      crownY + Math.sin(a) * crownR * (0.34 + hash(seed + i, 31) * 0.3),
      crownR * (0.44 + hash(seed + i, 41) * 0.3),
    ]);
  }
  spots.push([cx, crownY, crownR * 0.72]);

  for (let y = Math.floor(crownY - crownR * 1.4); y <= Math.ceil(crownY + crownR * 1.2); y += 1) {
    for (let x = Math.floor(cx - crownR * 1.7); x <= Math.ceil(cx + crownR * 1.7); x += 1) {
      let inside = false;
      let best = 0;

      for (const [sx, sy, sr] of spots) {
        const dx = (x - sx) / sr;
        const dy = (y - sy) / (sr * 0.86);
        const d = dx * dx + dy * dy;
        // Bite the rim with noise so the crown is foliage, not balloons.
        const edge = 1 + (hash(x * 7 + y * 131, seed) - 0.5) * 0.34;
        if (d < edge) {
          inside = true;
          best = Math.max(best, 1 - d);
        }
      }

      if (!inside) continue;

      // Sun from the upper west: the crown's north-west shoulder is lit, the
      // south-east underside falls away.
      const lit = clamp01((cx - x) / (crownR * 1.5) + (crownY - y) / (crownR * 1.3)) * 0.9;
      const dark = clamp01((y - crownY) / (crownR * 1.1) + (x - cx) / (crownR * 2));

      let c = pick(x, y, lit, pal.mid, pal.lit);
      if (dark > 0.2) c = pick(x, y, dark, c, pal.dark);
      if (dark > 0.75) c = pick(x, y, dark - 0.6, c, pal.deep);

      sheet.set(x, y, c);
    }
  }
};

/* A bare tree, grown recursively. Branches inherit their parent's direction
   and lean into the wind, so a whole stand of them leans the same way and
   the storm reads as a storm. */
const branch = (sheet, x, y, angle, len, wind, depth, seed) => {
  if (len < 1.6 || depth > 5) return;

  const ex = x + Math.cos(angle) * len;
  const ey = y + Math.sin(angle) * len;

  sheet.line(x, y, ex, ey, depth < 2 ? bark.mid : bark.dark);
  if (depth < 2) {
    sheet.line(x - 1, y, ex - 1, ey, bark.dark); // thicker at the base
  }

  const spread = 0.5 + hash(seed + depth, 7) * 0.4;
  const shrink = 0.66 + hash(seed + depth, 17) * 0.12;

  branch(sheet, ex, ey, angle - spread + wind * 0.3, len * shrink, wind, depth + 1, seed * 3 + 1);
  branch(sheet, ex, ey, angle + spread * 0.8 + wind * 0.3, len * shrink * 0.92, wind, depth + 1, seed * 3 + 2);
  if (hash(seed + depth * 31, 5) > 0.55) {
    branch(sheet, ex, ey, angle + wind * 0.4, len * shrink * 0.8, wind, depth + 1, seed * 3 + 3);
  }
};

const bareTree = (sheet, cx, base, height, wind, seed) => {
  branch(sheet, cx, base, -Math.PI / 2 + wind * 0.22, height * 0.42, wind, 0, seed);
};

/* Scrub: a mound of small lobes with a lit crown and a dark skirt. */
const bush = (sheet, cx, base, size, pal, seed) => {
  for (let y = base - Math.round(size * 1.1); y <= base; y += 1) {
    for (let x = cx - size; x <= cx + size; x += 1) {
      const dx = (x - cx) / size;
      const dy = (y - base) / (size * 1.05);
      const d = dx * dx + dy * dy;
      const edge = 1 + (hash(x * 17 + y * 53, seed) - 0.5) * 0.4;
      if (d > edge) continue;

      const lit = clamp01(-dx * 0.7 - dy * 0.8 - 0.1);
      let c = pick(x, y, lit, pal.mid, pal.lit);
      if (dy > -0.35) c = pick(x, y, clamp01(dy + 0.5), c, pal.dark);
      sheet.set(x, y, c);
    }
  }
};

/* A boulder: flat-ish lit top, one shadowed face, and a hard dark bed where
   it meets the ground. Faceted rather than round — round rocks read as balls. */
const boulder = (sheet, cx, base, size, pal, seed) => {
  const top = base - size;
  const face = size * (0.7 + hash(seed, 9) * 0.5);

  const shape = [
    [cx - face, base],
    [cx - face * 0.82, top + size * 0.42],
    [cx - face * 0.34, top],
    [cx + face * 0.3, top + size * 0.1],
    [cx + face * 0.9, top + size * 0.5],
    [cx + face, base],
  ];

  sheet.poly(shape, pal.mid);

  for (let y = top; y <= base; y += 1) {
    for (let x = Math.floor(cx - face); x <= Math.ceil(cx + face); x += 1) {
      if (!sheet.filled(x, y)) continue;
      const f = (y - top) / Math.max(1, size);
      const across = (x - cx) / Math.max(1, face);
      const lit = clamp01(1 - f * 2.4) * clamp01(0.6 - across);
      const dark = clamp01(f * 1.3 - 0.25) + clamp01(across * 0.7);
      let c = pick(x, y, lit, pal.mid, pal.lit);
      if (dark > 0.15) c = pick(x, y, clamp01(dark), c, pal.dark);
      if (f > 0.82) c = pal.deep;
      sheet.set(x, y, c);
    }
  }
};

/* Reeds, for the flooded zone: single-pixel stems with a seed head, leaning
   apart so a clump doesn't look like a comb. */
const reeds = (sheet, cx, base, size, seed) => {
  const stems = 3 + Math.floor(hash(seed, 13) * 4);

  for (let i = 0; i < stems; i += 1) {
    const x = cx + Math.round((i - stems / 2) * 1.8);
    const h = size * (0.55 + hash(seed + i, 23) * 0.65);
    const lean = (hash(seed + i, 37) - 0.5) * size * 0.3;

    sheet.line(x, base, x + lean, base - h, i % 2 ? needle.dark : needle.mid);

    if (hash(seed + i, 47) > 0.4) {
      const hx = Math.round(x + lean);
      const hy = Math.round(base - h);
      for (let k = 0; k < 3; k += 1) {
        sheet.set(hx, hy + k, bark.mid);
      }
    }
  }
};

/* ── Sky ───────────────────────────────────── */

/* One narrow dithered ramp per season, tiled across and pinned to the ground
   line. The bands are the point: a browser gradient over 800px is 800 unique
   colours, which no amount of pixel art in front of it can survive. */

const SKIES = {
  harvest: ["#241d33", "#2f2542", "#463654", "#6a4c5e", "#946163", "#bd7a68", "#d99a72", "#8a6560", "#4a3a44"],
  autumn: ["#2a1c26", "#3e2530", "#5c3230", "#8a4a32", "#b4602f", "#d4823c", "#8e5a3a", "#4a3128"],
  rain: ["#141620", "#1d2029", "#282d38", "#353c48", "#454d59", "#525a64", "#3a4048"],
  storm: ["#0d0f16", "#14171f", "#1c2029", "#262c37", "#333a46", "#3f4753", "#232830"],
  winter: ["#5f6f83", "#7d8d9e", "#9cabb8", "#bcc8d2", "#d8e0e7", "#eaeff3", "#aab6c0"],
  forge: ["#22110f", "#3c1a14", "#5e2617", "#8c3a1c", "#b85526", "#d9782f", "#a55a2a", "#4a2418"],
  hearth: ["#080711", "#0f0c1a", "#181327", "#241b33", "#33243c", "#432d42", "#2a1d2c", "#130e18"],
};

const skyRamp = (name, colors) => {
  const w = 48;
  const h = 200;
  const sheet = new Sheet(w, h);
  sheet.wrapX = true;

  const stops = colors.map((c, i) => ({ at: i / (colors.length - 1), color: rgba(c) }));
  // Bands hold flat through their middles and only dither where they meet.
  // Spending the whole band on the weave — which is the obvious thing to do —
  // turns the sky into one field of even noise, and an even field of noise is
  // just a texture: it reads as fabric behind the world rather than as air.
  sheet.ramp(0, 0, w, h, stops, { soft: 0.44 });

  return save("sky-" + name + ".png", sheet);
};

/* Stratus: long thin cloud banks lying flat near the horizon. Drawn as a
   separate drifting strip because the reference look leans on them heavily —
   they are what gives a flat sky its perspective. Perfectly periodic, from a
   sum of whole-number harmonics, so the strip tiles without a seam. */
const stratus = () => {
  const w = 1024;
  const h = 120;
  const sheet = new Sheet(w, h);
  sheet.wrapX = true;

  const wave = (x, harmonics, seed) => {
    let v = 0;
    let total = 0;
    for (const [k, amp] of harmonics) {
      v += Math.sin((2 * Math.PI * k * x) / w + hash(k, seed) * 6.283) * amp;
      total += amp;
    }
    return v / total;
  };

  const light = rgba("#c9b4c4");
  const mid = rgba("#a08fa6");
  const dark = rgba("#7d6f88");

  // Six banks at their own heights, thicknesses and drifts.
  for (let b = 0; b < 7; b += 1) {
    const rnd = seeded(4400 + b * 97);
    const lane = 12 + b * 14 + rnd() * 6;
    const thick = 4 + rnd() * 9;
    const harmonics = [[1 + b, 1], [3 + b * 2, 0.5], [7 + b, 0.28], [13 + b * 3, 0.14]];
    const alpha = 0.3 + rnd() * 0.4;

    for (let x = 0; x < w; x += 1) {
      const v = wave(x, harmonics, 900 + b);
      // Only the crests of the wave become cloud, so banks come in lengths
      // with clear sky between them instead of running the whole strip.
      const mass = clamp01((v - 0.08) * 2.4);
      if (mass <= 0) continue;

      const top = lane - mass * thick;
      const bottom = lane + mass * thick * 0.42;

      for (let y = Math.round(top); y <= Math.round(bottom); y += 1) {
        const f = clamp01((y - top) / Math.max(1, bottom - top));
        // Cloud is lit on top, shaded underneath, and its edges dissolve.
        const solid = clamp01(mass * 1.5) * (1 - Math.abs(f - 0.42) * 1.1);
        if (solid <= 0 || threshold4(x, y) > solid * alpha * 2.2) continue;
        sheet.set(x, y, f < 0.34 ? light : f < 0.72 ? mid : dark);
      }
    }
  }

  return save("layer-stratus.png", sheet);
};

/* Cumulus. Four sprites of increasing size, each a mass of lobes with a flat
   base, lit from the west, with a dithered rim so the edge is vapour rather
   than a cut-out. */
const cumulus = (index, w, h, seed) => {
  const sheet = new Sheet(w, h);
  const rnd = seeded(seed);

  const light = rgba("#efe0d4");
  const mid = rgba("#d2bcbe");
  const dark = rgba("#a8929f");
  const under = rgba("#82708a");

  const baseY = h * 0.76;
  const lobes = [];
  const count = 5 + Math.floor(rnd() * 4);

  for (let i = 0; i < count; i += 1) {
    const f = i / (count - 1);
    // Tallest lobes toward the west shoulder, tapering east — cumulus are
    // asymmetric, and a symmetrical one reads as a cartoon.
    const bulk = Math.sin(Math.pow(f, 0.8) * Math.PI) * (0.7 + rnd() * 0.3);
    lobes.push([
      w * (0.1 + f * 0.8),
      baseY - h * 0.3 * bulk,
      h * (0.16 + bulk * 0.3),
    ]);
  }

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let mass = 0;
      for (const [lx, ly, lr] of lobes) {
        const dx = (x - lx) / lr;
        const dy = (y - ly) / lr;
        mass = Math.max(mass, 1 - (dx * dx + dy * dy));
      }
      if (y > baseY) {
        // Flat bottom: cumulus sit on the condensation line.
        mass -= (y - baseY) / (h * 0.1);
      }
      if (mass <= 0) continue;

      const rim = clamp01(mass * 4.5);
      if (threshold(x, y) > rim) continue;

      const lit = clamp01((baseY - y) / (h * 0.5) + (w * 0.5 - x) / (w * 0.9));
      let c = pick(x, y, lit, mid, light);
      if (y > baseY - h * 0.14) c = pick(x, y, clamp01((y - baseY + h * 0.14) / (h * 0.16)), c, dark);
      if (y > baseY - h * 0.04) c = under;
      sheet.set(x, y, c);
    }
  }

  return save("cloud-" + index + ".png", sheet.trimmed());
};

/* ── The strips ────────────────────────────── */

/* Native heights. These are the numbers the CSS multiplies by --px, so they
   are the real vertical budget of the world: 200 rows from the ground line to
   the top of the viewport, and 22 of those are the walkable band. */
const H = { far: 96, mid: 80, hill: 58, water: 28, near: 66, ground: 48 };

const farRidges = () => {
  const w = 1250;
  const sheet = new Sheet(w, H.far);
  const seed = 20260906;
  const edge = (x) => ridgeAt(x, w, H.far, "far", seed);

  paintRidge(sheet, edge, FAR, {
    relief: 11,
    snowline: true,
    layer: "far",
    seed: seed,
    haze: { from: 0.42, to: 0.86, tone: HAZE_TONE.far, tint: 0.9 },
  });

  return save("layer-far.png", sheet);
};

const midRidges = () => {
  const w = 1900;
  const sheet = new Sheet(w, H.mid);
  const seed = 77123;
  const edge = (x) => ridgeAt(x, w, H.mid, "mid", seed);
  const haze = { from: 0.5, to: 0.9, tone: HAZE_TONE.mid, tint: 0.8 };

  paintRidge(sheet, edge, MID, { relief: 9, snowline: true, layer: "mid", seed: seed, haze: haze });
  scree(sheet, edge, MID, "mid", seed, haze);

  // A treeline following the crest. Short, crowded and flat: at this distance
  // a forest is a texture on the rock, not a row of trees, and drawing it as
  // individual trees is what makes cheap parallax art look like a comb.
  const pineDark = recede(needle.dark, HAZE_TONE.mid, 0.42);
  const pineLit = recede(needle.mid, HAZE_TONE.mid, 0.36);

  for (let x = 0; x < w; x += 1) {
    const p = paramsAt(x / w, "mid");
    if (hash(x, seed + 7) > p.pines * 0.8) continue;

    const top = Math.round(edge(x));
    const height = 2 + hash(x, seed + 19) * 4;

    for (let y = Math.round(top - height); y < top + 1; y += 1) {
      const f = clamp01((y - (top - height)) / height);
      const hw = Math.pow(f, 0.7) * (0.4 + hash(x, seed + 23) * 1.1);

      for (let i = -Math.round(hw); i <= Math.round(hw); i += 1) {
        const air = clamp01((y / H.mid - haze.from) / (haze.to - haze.from));
        if (air > 0.85) continue;
        const c = i < 0 ? pineLit : pineDark;
        sheet.set(x + i, y, air > 0 ? pick(x + i, y, air * 0.8, c, haze.tone) : c);
      }
    }
  }

  return save("layer-mid.png", sheet);
};

const hills = () => {
  const w = 2500;
  const sheet = new Sheet(w, H.hill);
  const seed = 55219;
  const edge = (x) => ridgeAt(x, w, H.hill, "hill", seed);
  const haze = { from: 0.58, to: 0.96, tone: HAZE_TONE.hill, tint: 0.6 };

  paintRidge(sheet, edge, HILL, { relief: 7, layer: "hill", seed: seed, haze: haze });

  // Scrub along the skyline — a bitten, uneven crest instead of a clean
  // pencil line. The eye reads that broken edge as vegetation without ever
  // resolving a single plant.
  const scrubDark = mix(needle.deep, HILL.dark, 0.4);
  const scrubMid = mix(needle.dark, HILL.mid, 0.35);

  for (let x = 0; x < w; x += 1) {
    const p = paramsAt(x / w, "hill");
    if (hash(x, seed + 3) > p.scrub * 0.75) continue;

    const top = Math.round(edge(x));
    const height = 1 + hash(x, seed + 11) * 4.5;

    for (let y = top - Math.round(height); y < top + 2; y += 1) {
      sheet.set(x, y, hash(x * 3 + y, seed + 13) > 0.45 ? scrubMid : scrubDark);
    }
  }

  return save("layer-hill.png", sheet);
};

const waters = () => {
  const w = 3000;
  const sheet = new Sheet(w, H.water);
  const rnd = seeded(5150);

  let x = 60;

  while (x < w - 120) {
    const p = paramsAt(x / w, "water");

    // Dry zones never roll a body, so the crags and the quarry stay dry.
    if (p.rate > 0.02 && rnd() < p.rate) {
      const width = Math.round(p.width * (0.7 + rnd() * 0.7));
      const shoreTop = Math.round(H.water * (0.16 + rnd() * 0.2));

      for (let i = 0; i < width; i += 1) {
        const f = i / width;
        // The far bank curves away, so the top edge is an arc rather than a
        // rule, and the ends taper into the land.
        const bank = shoreTop + Math.sin(f * Math.PI) * -3 + fbm(i / 14, 71, 2, 0.5) * 2;
        const taper = clamp01(Math.sin(f * Math.PI) * 3.4);

        for (let y = Math.round(bank); y < H.water; y += 1) {
          if (threshold4(x + i, y) > taper) continue;

          const d = (y - bank) / Math.max(1, H.water - bank);
          // Water darkens with depth away from the near shore.
          let c = pick(x + i, y, clamp01(1 - d * 1.6), water.deep, water.dark);
          if (d > 0.55) c = pick(x + i, y, clamp01((d - 0.55) * 2), c, water.mid);
          sheet.set(x + i, y, c);
        }

        // The far shoreline, where the light gathers. Broken into lengths by
        // noise rather than run as a continuous highlight, because an
        // unbroken lit line across a lake reads as a drawn border.
        const gleam = fbm(i / 9, 313, 2, 0.6);
        const by = Math.round(bank);
        if (gleam > 0.46 && taper > 0.5) {
          sheet.set(x + i, by, pick(x + i, by, clamp01((gleam - 0.46) * 3), water.mid, water.lit));
        }
      }

      // Specular: broken horizontal streaks, longer and brighter where the
      // sun sits low in the west. Nothing else says "water" as quickly.
      for (let k = 0; k < Math.round(width / 7); k += 1) {
        const sx = x + Math.round(rnd() * width);
        const sy = shoreTop + 2 + Math.round(rnd() * (H.water - shoreTop - 3));
        const len = 2 + Math.round(rnd() * 12 * (1 - (sy - shoreTop) / H.water));
        const bright = rnd() > 0.62;

        for (let i = 0; i < len; i += 1) {
          if (threshold(sx + i, sy) > 0.72) continue;
          sheet.set(sx + i, sy, bright ? water.lit : water.mid);
        }
      }

      x += width + 90 + rnd() * 260;
    } else {
      x += 120;
    }
  }

  return save("layer-water.png", sheet);
};

/* The treeline. Two passes: a receded back row that the fog eats into, then
   a full-contrast front row. That is what gives a flat strip of trees an
   inside — one row of silhouettes reads as a wall. */
const treeline = () => {
  const w = 3750;
  const sheet = new Sheet(w, H.near);
  const seed = 31337;

  const back = new Sheet(w, H.near);
  const front = sheet;

  const stone = { lit: rgba("#5f5b6d"), mid: rgba("#4a4759"), dark: rgba("#353344"), deep: rgba("#23222e") };

  const plant = (target, x, baseY, needlePal, leafPal, stonePal, scale, p, rnd, snowy, wind) => {
    const roll = rnd();
    const weights = p.mix;
    let acc = weights.pine;

    if (roll < acc) {
      pine(
        target, x, baseY,
        Math.round((26 + rnd() * 30) * scale),
        Math.round((5 + rnd() * 5) * scale),
        needlePal, Math.round(x * 7 + rnd() * 1000),
        { snow: snowy }
      );
    } else if (roll < (acc += weights.broad)) {
      broadleaf(target, x, baseY, Math.round((22 + rnd() * 24) * scale), leafPal, Math.round(x * 3));
    } else if (roll < (acc += weights.bare)) {
      bareTree(target, x, baseY, Math.round((24 + rnd() * 26) * scale), wind, Math.round(x * 11));
    } else if (roll < (acc += weights.bush)) {
      bush(target, x, baseY + 1, Math.round((3 + rnd() * 5) * scale), leafPal, Math.round(x * 5));
    } else if (roll < (acc += weights.rock)) {
      boulder(target, x, baseY + 1, Math.round((3 + rnd() * 6) * scale), stonePal, Math.round(x * 13));
    } else if (weights.reed > 0) {
      reeds(target, x, baseY + 1, Math.round((6 + rnd() * 8) * scale), Math.round(x * 17));
    }
  };

  // Back row: smaller, receded, and standing higher up the strip so its feet
  // are hidden behind the front row rather than lined up with them.
  const backNeedle = shade(needle, 0.4);
  const backLeaf = shade(leaf, 0.4);
  const backStone = shade(stone, 0.4);
  const rndBack = seeded(seed + 1);

  for (let x = -30; x < w + 30; x += 1) {
    const p = paramsAt(clamp01(x / w), "near");
    const swell = 0.6 + 0.4 * Math.sin(x / 190);
    if (rndBack() > p.density * swell * 0.11) continue;
    plant(
      back, x, H.near - 14 - Math.round(rndBack() * 4),
      backNeedle, backLeaf, backStone,
      p.scale * 0.6, p, rndBack, p.snowy * 0.7, windAt(clamp01(x / w)) * 0.6
    );
  }

  back.aerial(0.34, 0.98, HAZE_TONE.hill, 0.85);
  front.blit(back, 0, 0);

  // Front row: full contrast, feet on the ground line at the strip's base.
  const rnd = seeded(seed);
  for (let x = -30; x < w + 30; x += 1) {
    const p = paramsAt(clamp01(x / w), "near");
    // Density swings inside a zone too, so even one biome has thickets and
    // clearings rather than an even hedge.
    const swell = 0.62 + 0.38 * Math.sin(x / 260);
    if (rnd() > p.density * swell * 0.08) continue;
    plant(
      front, x, H.near - 3 - Math.round(rnd() * 3),
      needle, leaf, stone,
      p.scale, p, rnd, p.snowy, windAt(clamp01(x / w))
    );
  }

  return save("layer-near.png", sheet);
};

/* The ground. This is the one strip the walker touches, so it carries the
   most detail: strata below, a trodden path along the top, a lit verge, and
   tufts of grass breaking the surface line. Tiles seamlessly, because unlike
   the ridges it repeats on plain depth. */
const ground = () => {
  const w = 640;
  const sheet = new Sheet(w, H.ground);
  sheet.wrapX = true;
  const seed = 9182;

  const surface = H.ground - 22; // the walkable line, 22 rows up from the base

  // The surface undulates by a pixel or two. A ruled line reads as a shelf
  // the walker has been placed on; a broken one reads as ground.
  const lift = (x) => Math.round(fbm(x / 44, seed, 3, 0.5) * 3.4 - 1.7);

  for (let x = 0; x < w; x += 1) {
    const top = surface + lift(x);

    /* Strata. Flat bands with dithered seams, darkening downward, so the cut
       face of the ground has geology in it rather than one flat brown. Drawn
       per column from the local surface, so the bands follow the undulation
       instead of running through it. */
    const cut = H.ground - top;
    sheet.ramp(x, top, 1, cut, [
      { at: 0, color: soil.lit },
      { at: 0.16, color: soil.mid },
      { at: 0.46, color: soil.dark },
      { at: 1, color: soil.deep },
    ], { soft: 0.7 });

    // A trodden path along the top: drier, paler soil worn through the turf
    // where the road runs. This is the band the walker's feet are on, so it
    // gets the strongest value contrast in the whole strip.
    for (let y = top + 1; y < top + 6; y += 1) {
      const wear = clamp01(1 - (y - top - 1) / 5);
      sheet.set(x, y, pick(x, y, wear * 0.8, soil.mid, soil.lit));
    }

    // Turf lip: the very edge catches the low west light.
    sheet.set(x, top, pick(x, top, 0.78, grass.mid, grass.lit));
    sheet.set(x, top + 1, pick(x, top + 1, 0.45, grass.dark, grass.mid));

    // Vertical grain in the cut face, so the soil has structure and doesn't
    // read as a dithered gradient.
    if (hash(x, seed + 41) > 0.72) {
      const depth = 4 + Math.round(hash(x, seed + 43) * 12);
      for (let y = top + 7; y < Math.min(H.ground, top + 7 + depth); y += 1) {
        sheet.set(x, y, hash(x + y, seed + 47) > 0.5 ? soil.dark : soil.deep);
      }
    }

    // Pebbles and root ends in the strata.
    for (let y = top + 6; y < H.ground; y += 1) {
      const n = hash(x * 131 + y * 977, seed);
      if (n > 0.988) sheet.set(x, y, soil.lit);
      else if (n > 0.968) sheet.set(x, y, soil.deep);
    }
  }

  // Stones set into the verge, half-buried, with a lit crown and a dark bed.
  for (let x = 4; x < w - 4; x += 1) {
    if (hash(x, seed + 61) < 0.988) continue;

    const top = surface + lift(x);
    const size = 1 + Math.round(hash(x, seed + 67) * 2);

    for (let j = -size; j <= size; j += 1) {
      for (let i = -size - 1; i <= size + 1; i += 1) {
        if (i * i * 0.6 + j * j > (size + 0.4) * (size + 0.4)) continue;
        sheet.set(x + i, top + j, j < 0 ? soil.lit : j === 0 ? soil.mid : soil.dark);
      }
    }
  }

  // Tufts of grass breaking the surface line. Clumped by a slow noise so the
  // verge has bald patches and thickets, and drawn blade by blade so the
  // silhouette is spiky rather than furry.
  for (let x = 0; x < w; x += 1) {
    const clump = fbm(x / 26, seed + 5, 2, 0.5);
    if (hash(x, seed + 71) > clump * 0.85) continue;

    const top = surface + lift(x);
    const blades = 1 + Math.floor(hash(x, seed + 13) * 3);

    for (let b = 0; b < blades; b += 1) {
      const bx = x + b - 1;
      const height = 2 + Math.round(hash(x * 7 + b, seed + 23) * 6 * clump);
      const lean = (hash(x + b, seed + 31) - 0.5) * 2.2;

      for (let i = 0; i < height; i += 1) {
        const f = i / Math.max(1, height);
        sheet.set(
          Math.round(bx + lean * f * f),
          top - i,
          f > 0.62 ? grass.lit : f > 0.3 ? grass.mid : grass.dark
        );
      }
    }
  }

  return save("layer-ground.png", sheet);
};

/* ── Go ────────────────────────────────────── */

console.log("Sky:");
Object.keys(SKIES).forEach((k) => skyRamp(k, SKIES[k]));
stratus();
[
  [110, 46, 1201],
  [150, 58, 1307],
  [200, 74, 1451],
  [260, 92, 1583],
].forEach((spec, i) => cumulus(i + 1, spec[0], spec[1], spec[2]));

console.log("\nWorld:");
const sheets = {
  far: farRidges(),
  mid: midRidges(),
  hill: hills(),
  water: waters(),
  near: treeline(),
  ground: ground(),
};

console.log("\nAspect ratios for the CSS (width / height):");
for (const key of Object.keys(sheets)) {
  const s = sheets[key];
  console.log("  " + key.padEnd(8) + (s.w / s.h).toFixed(3).padStart(9) + "   h=" + s.h);
}

/* ── Proof sheets ──────────────────────────── */

/* `node tools-world.js --preview` composites the strips into one screen per
   zone, at the offsets the browser would use, and blows the result up so the
   pixels are visible. Checking the art at 1:1 in a 3750-wide strip is how
   you ship a treeline with a seam in it. */

if (process.argv.includes("--preview")) {
  const VW = 320; // a viewport's worth of art pixels across
  const VH = 200; // ...and down, which is the world's vertical budget
  const GROUND = 22;

  /* Where each strip sits, in rows up from the bottom of the viewport, and
     how far it has run by a given point along the road. Mirrors px-style.css
     exactly — if these disagree, the preview is a lie. */
  const PLAN = [
    { key: "far", bottom: GROUND + 26 },
    { key: "mid", bottom: GROUND + 16 },
    { key: "hill", bottom: GROUND + 12 },
    { key: "water", bottom: GROUND - 1 },
    { key: "near", bottom: GROUND - 4 },
    { key: "ground", bottom: 0, repeat: true },
  ];

  ZONES.forEach((zone) => {
    const p = (zone.from + zone.to) / 2;
    const top = 0;
    const shots = new Sheet(VW, VH);

    // Sky, so the fog in the strips has something to dissolve into.
    const colors = SKIES[
      { start: "harvest", profile: "autumn", loadout: "rain", skills: "storm", xp: "winter", builds: "forge", save: "hearth" }[zone.key]
    ];
    shots.ramp(0, top, VW, VH, colors.map((c, k) => ({ at: k / (colors.length - 1), color: rgba(c) })), { soft: 0.95 });

    for (const { key, bottom, repeat } of PLAN) {
      const s = sheets[key];
      const y = top + VH - bottom - s.h;
      const run = repeat ? 0 : Math.max(0, s.w - VW);
      const offset = Math.round(p * run);

      for (let x = 0; x < VW; x += 1) {
        for (let j = 0; j < s.h; j += 1) {
          const c = s.get(repeat ? (x + offset) % s.w : x + offset, j);
          if (c[3] > 0) shots.set(x, y + j, c);
        }
      }
    }

    // The line the walker's feet sit on, so the ground band is easy to judge.
    shots.rect(0, top + VH - GROUND, VW, 1, rgba("#ff00ff"));

    save("_preview-" + zone.key + ".png", shots.scaled(3));
  });
}

console.log("\nSky band tops (for --sky-top):");
for (const k of Object.keys(SKIES)) {
  console.log("  " + k.padEnd(10) + SKIES[k][0]);
}

console.log("\nZones along the road:");
for (const z of ZONES) {
  console.log(
    "  " + z.key.padEnd(9),
    (z.from * 100).toFixed(1).padStart(5) + "% – " + (z.to * 100).toFixed(1).padStart(5) + "%"
  );
}
