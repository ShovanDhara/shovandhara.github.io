/**
 * Draws the roadside objects: set pieces, props, and the figures that work
 * them. Same press as the world — one array cell is one art pixel — so a
 * mill and a mountain share an edge language, a palette and a light.
 *
 * Light is from the west, low, matching tools-world.js. Faces that look
 * left catch it; faces that look right sink. Shading is two flat tones
 * woven on a Bayer threshold, never a third mixed colour.
 *
 * Run: node tools-sets.js
 */

const { Sheet, save, rgba, pick, threshold, seeded, hash } = require("./tools-pixel");

/* ── Palette ───────────────────────────────── */

const INK = rgba("#140f16");

const wood = {
  lit: rgba("#7a5a3c"),
  mid: rgba("#5a3f2c"),
  dark: rgba("#3a281e"),
  deep: rgba("#241810"),
};

const stone = {
  lit: rgba("#7a7388"),
  mid: rgba("#575265"),
  dark: rgba("#3c3848"),
  deep: rgba("#26222e"),
};

const cloth = {
  lit: rgba("#d06a42"),
  mid: rgba("#a44a32"),
  dark: rgba("#6e2e22"),
  deep: rgba("#3e1a14"),
};

const teal = {
  lit: rgba("#6a8f78"),
  mid: rgba("#4a6a58"),
  dark: rgba("#334840"),
  deep: rgba("#1e2c28"),
};

const metal = {
  lit: rgba("#c4c8d0"),
  mid: rgba("#8a909c"),
  dark: rgba("#5a606c"),
  deep: rgba("#343844"),
};

const skin = {
  lit: rgba("#e0a878"),
  mid: rgba("#c48658"),
  dark: rgba("#8a5a38"),
};

const grass = {
  lit: rgba("#6a9258"),
  mid: rgba("#4a6a42"),
  dark: rgba("#2f4a33"),
};

const moss = rgba("#4a6a3c");
const amber = rgba("#e8a33d");
const flame = rgba("#ffd166");
const ember = rgba("#e8632a");
const coal = rgba("#6d1c0e");
const cream = rgba("#f2e8d5");

/* ── Small tools ───────────────────────────── */

const clamp01 = (n) => Math.min(1, Math.max(0, n));

/* Outline sits *outside* the silhouette so the interior colours stay clean. */
const stroke = (sheet, color) => {
  const marks = [];

  for (let y = 0; y < sheet.h; y += 1) {
    for (let x = 0; x < sheet.w; x += 1) {
      if (sheet.filled(x, y)) {
        continue;
      }
      if (
        sheet.filled(x - 1, y) ||
        sheet.filled(x + 1, y) ||
        sheet.filled(x, y - 1) ||
        sheet.filled(x, y + 1)
      ) {
        marks.push([x, y]);
      }
    }
  }

  for (const [x, y] of marks) {
    sheet.set(x, y, color);
  }

  return sheet;
};

/* Soft oval under an object, dithered so it reads as contact not a disc. */
const contact = (sheet, cx, cy, rx, ry) => {
  for (let y = -ry; y <= ry; y += 1) {
    for (let x = -rx; x <= rx; x += 1) {
      const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
      if (d <= 1 && threshold(cx + x, cy + y) < 0.72 - d * 0.45) {
        sheet.set(cx + x, cy + y, INK);
      }
    }
  }
};

const tuft = (sheet, x, base, seed) => {
  const blades = 2 + Math.floor(hash(seed, 11) * 3);

  for (let b = 0; b < blades; b += 1) {
    const height = 3 + Math.round(hash(seed + b, 23) * 5);
    const lean = (hash(seed + b, 31) - 0.5) * 2.2;

    for (let i = 0; i < height; i += 1) {
      const f = i / Math.max(1, height);
      sheet.set(
        Math.round(x + b - 1 + lean * f * f),
        base - i,
        f > 0.6 ? grass.lit : f > 0.28 ? grass.mid : grass.dark
      );
    }
  }
};

/* West-lit vertical face. Left third catches, right third sinks, seams dither. */
const face = (sheet, x0, y0, w, h, pal, opts) => {
  const grain = opts && opts.grain;
  const mortar = opts && opts.mortar;
  const cap = opts && opts.cap;

  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const across = w === 1 ? 0.5 : i / (w - 1);
      let c = pal.mid;

      if (across < 0.28) {
        c = pick(x0 + i, y0 + j, clamp01(across / 0.28), pal.lit, pal.mid);
      } else if (across > 0.68) {
        c = pick(x0 + i, y0 + j, clamp01((across - 0.68) / 0.32), pal.mid, pal.dark);
      }

      if (j === 0 && cap) {
        c = pal.lit;
      }
      if (j === h - 1) {
        c = pal.deep || pal.dark;
      }

      if (mortar && (j % mortar.row === 0 || (i + Math.floor(j / mortar.row) * mortar.shift) % mortar.col === 0)) {
        c = pal.deep || pal.dark;
      }

      if (grain && hash(x0 + i * 13 + (y0 + j) * 7, 41) > 0.86) {
        c = pal.dark;
      }

      sheet.set(x0 + i, y0 + j, c);
    }
  }
};

/* Trapezoid tower: wide at the base, narrow at the top. */
const taper = (sheet, cx, base, top, topW, baseW, pal, opts) => {
  const h = base - top;

  for (let y = top; y < base; y += 1) {
    const f = (y - top) / Math.max(1, h);
    const half = (topW + (baseW - topW) * f) / 2;
    const x0 = Math.round(cx - half);
    const w = Math.round(half * 2);

    face(sheet, x0, y, w, 1, pal, opts);
  }
};

const roof = (sheet, cx, peak, width, height, pal) => {
  const left = cx - Math.round(width / 2);
  const right = left + width;

  for (let y = 0; y < height; y += 1) {
    const f = y / Math.max(1, height - 1);
    const inset = Math.round((1 - f) * (width / 2 - 1));
    const x0 = left + inset;
    const x1 = right - inset;

    for (let x = x0; x < x1; x += 1) {
      const across = (x - x0) / Math.max(1, x1 - x0);
      let c = pal.mid;
      if (across < 0.42) {
        c = pick(x, peak + y, across / 0.42, pal.lit, pal.mid);
      } else {
        c = pick(x, peak + y, (across - 0.42) / 0.58, pal.mid, pal.dark);
      }
      if (y < 2) {
        c = pal.lit;
      }
      sheet.set(x, peak + y, c);
    }
  }
};

const door = (sheet, cx, base, w, h) => {
  const x0 = cx - Math.floor(w / 2);

  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const arch = j < 3 ? Math.abs(i - (w - 1) / 2) > w / 2 - (3 - j) : false;
      if (arch) {
        continue;
      }
      const across = i / Math.max(1, w - 1);
      let c = pick(x0 + i, base - h + j, across, wood.mid, wood.dark);
      if (i === 0 || i === w - 1 || j === h - 1) {
        c = wood.deep;
      }
      sheet.set(x0 + i, base - h + j, c);
    }
  }

  sheet.set(cx + Math.floor(w / 2) - 2, base - Math.round(h * 0.45), metal.lit);
};

const windowLite = (sheet, cx, cy, w, h, glow) => {
  const x0 = cx - Math.floor(w / 2);
  const y0 = cy - Math.floor(h / 2);

  sheet.rect(x0 - 1, y0 - 1, w + 2, h + 2, wood.deep);
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      sheet.set(x0 + i, y0 + j, glow ? pick(x0 + i, y0 + j, 0.35, amber, flame) : stone.deep);
    }
  }
  if (w > 3) {
    sheet.rect(cx, y0, 1, h, wood.dark);
  }
  if (h > 3) {
    sheet.rect(x0, cy, w, 1, wood.dark);
  }
};

const barrel = (sheet, cx, base, h) => {
  const w = Math.round(h * 0.72);

  contact(sheet, cx, base + 1, Math.round(w * 0.55), 2);

  for (let j = 0; j < h; j += 1) {
    const f = j / Math.max(1, h - 1);
    const bulge = 1 - Math.abs(f - 0.5) * 0.28;
    const half = (w * bulge) / 2;
    const x0 = Math.round(cx - half);
    const span = Math.round(half * 2);

    for (let i = 0; i < span; i += 1) {
      const across = span === 1 ? 0.5 : i / (span - 1);
      let c = wood.mid;
      if (across < 0.3) {
        c = pick(x0 + i, base - h + j, across / 0.3, wood.lit, wood.mid);
      } else if (across > 0.7) {
        c = pick(x0 + i, base - h + j, (across - 0.7) / 0.3, wood.mid, wood.dark);
      }
      if (i === 0 || i === span - 1) {
        c = wood.deep;
      }
      sheet.set(x0 + i, base - h + j, c);
    }
  }

  // Hoops — the thing that makes a barrel a barrel, not a stump.
  [0.22, 0.78].forEach((at) => {
    const y = base - h + Math.round(h * at);
    const f = at;
    const bulge = 1 - Math.abs(f - 0.5) * 0.28;
    const half = (w * bulge) / 2;
    sheet.rect(Math.round(cx - half), y, Math.round(half * 2), 2, metal.dark);
    sheet.set(Math.round(cx - half * 0.55), y, metal.mid);
  });

  // Oval lid.
  const lidW = Math.round(w * 0.72);
  for (let x = -Math.floor(lidW / 2); x <= Math.floor(lidW / 2); x += 1) {
    const t = 1 - Math.abs(x) / Math.max(1, lidW / 2);
    const rise = Math.round(t * 2);
    for (let k = 0; k <= rise; k += 1) {
      sheet.set(cx + x, base - h - k, k === rise ? wood.lit : wood.mid);
    }
  }
};

const crate = (sheet, cx, base, size) => {
  const x0 = cx - Math.floor(size / 2);

  contact(sheet, cx, base + 1, Math.round(size * 0.48), 2);
  face(sheet, x0, base - size, size, size, wood, { grain: true, cap: true });
  sheet.rect(x0, base - size, size, 1, wood.lit);
  sheet.rect(x0, base - 1, size, 1, wood.deep);

  // Cross brace.
  for (let k = 2; k < size - 2; k += 1) {
    sheet.set(x0 + k, base - size + k, wood.lit);
    sheet.set(x0 + size - 1 - k, base - size + k, wood.dark);
  }
};

const flag = (sheet, x, y, w, h, pal) => {
  for (let j = 0; j < h; j += 1) {
    const bite = j > h * 0.35 && j < h * 0.65 ? 2 : 0;
    for (let i = 0; i < w - bite; i += 1) {
      const across = i / Math.max(1, w - 1);
      let c = pick(x + i, y + j, across * 0.45, pal.lit, pal.mid);
      if (j === 0 || j === h - 1) {
        c = pal.dark;
      }
      sheet.set(x + i, y + j, c);
    }
  }
};

const lantern = (sheet, cx, cy) => {
  sheet.rect(cx - 1, cy - 6, 3, 2, metal.dark);
  sheet.rect(cx, cy - 8, 1, 2, metal.mid);
  sheet.rect(cx - 2, cy - 4, 5, 6, metal.dark);

  for (let j = 0; j < 4; j += 1) {
    for (let i = 0; i < 3; i += 1) {
      sheet.set(cx - 1 + i, cy - 3 + j, pick(cx + i, cy + j, 0.4, flame, amber));
    }
  }

  sheet.rect(cx - 2, cy + 2, 5, 2, metal.mid);
  sheet.set(cx - 3, cy - 1, metal.deep);
  sheet.set(cx + 3, cy - 1, metal.deep);

  // Warm spill — dithered so it is light, not a painted disc.
  for (let y = -10; y <= 8; y += 1) {
    for (let x = -8; x <= 8; x += 1) {
      const d = (x * x) / 64 + (y * y) / 80;
      if (d < 1 && !sheet.filled(cx + x, cy + y) && threshold(cx + x, cy + y) < (1 - d) * 0.28) {
        sheet.set(cx + x, cy + y, rgba("#e8a33d", 0.22));
      }
    }
  }
};

const mossPatch = (sheet, x0, y0, w) => {
  for (let i = 0; i < w; i += 1) {
    if (hash(x0 + i, 77) > 0.4) {
      sheet.set(x0 + i, y0, moss);
    }
    if (hash(x0 + i, 89) > 0.7) {
      sheet.set(x0 + i, y0 - 1, grass.dark);
    }
  }
};

/* A small standing figure. Hooded cloak, west-lit, lantern optional.
   Drawn at true pixel scale so the set pieces and the walker share a body. */
const figure = (sheet, cx, base, opts) => {
  const cloak = (opts && opts.cloak) || teal;
  const hat = opts && opts.hat;
  const hold = opts && opts.hold;
  const facing = opts && opts.facing === "left" ? -1 : 1;

  // Legs
  sheet.rect(cx - 2, base - 8, 2, 8, wood.dark);
  sheet.rect(cx + 1, base - 8, 2, 8, wood.deep);
  sheet.rect(cx - 3, base - 1, 3, 2, wood.deep);
  sheet.rect(cx + 1, base - 1, 3, 2, wood.deep);

  // Body
  face(sheet, cx - 4, base - 20, 9, 12, cloak, { cap: true });
  sheet.rect(cx - 3, base - 10, 7, 3, wood.dark);

  // Head
  sheet.rect(cx - 2, base - 26, 5, 6, skin.mid);
  sheet.set(cx - 2, base - 26, skin.dark);
  sheet.set(cx + 2, base - 23, INK);
  sheet.set(cx + 1, base - 23, skin.lit);

  if (hat === "brim") {
    sheet.rect(cx - 4, base - 27, 9, 2, wood.deep);
    sheet.rect(cx - 2, base - 30, 5, 3, wood.dark);
  } else if (hat === "hood") {
    for (let j = 0; j < 8; j += 1) {
      sheet.rect(cx - 3, base - 28 + j, 7 - Math.floor(j / 5), 1, cloak.dark);
    }
    sheet.set(cx + 2, base - 24, cloak.mid);
  } else if (hat === "helm") {
    sheet.rect(cx - 3, base - 29, 7, 4, metal.mid);
    sheet.rect(cx - 4, base - 26, 9, 2, metal.dark);
    sheet.set(cx, base - 30, metal.lit);
  }

  // Arms
  sheet.rect(cx - 6, base - 19, 2, 8, cloak.dark);
  sheet.rect(cx + 5, base - 19, 2, 7, skin.mid);

  if (hold === "lantern") {
    lantern(sheet, cx + 8 * facing, base - 14);
  } else if (hold === "hammer") {
    sheet.rect(cx + 6, base - 28, 2, 10, wood.mid);
    sheet.rect(cx + 4, base - 30, 6, 4, metal.lit);
  } else if (hold === "crate") {
    crate(sheet, cx + 10, base - 14, 10);
  }

  return sheet;
};

/* ── Sets ──────────────────────────────────── */

const setMill = () => {
  const sheet = new Sheet(160, 124);
  const ground = 118;
  const cx = 78;

  contact(sheet, cx, ground, 28, 3);
  tuft(sheet, 22, ground, 11);
  tuft(sheet, 38, ground, 19);
  tuft(sheet, 124, ground, 29);
  tuft(sheet, 142, ground, 41);

  taper(sheet, cx, ground, 38, 28, 52, stone, { mortar: { row: 7, col: 9, shift: 4 } });
  mossPatch(sheet, cx - 22, ground - 2, 40);

  roof(sheet, cx, 18, 40, 22, cloth);
  sheet.rect(cx - 3, 14, 6, 6, wood.deep); // cap
  sheet.rect(cx - 1, 12, 2, 3, metal.dark);

  door(sheet, cx, ground, 14, 22);
  windowLite(sheet, cx, 58, 8, 8, true);

  // Hub pin the sails rotate on.
  sheet.disc(cx, 36, 3, metal.mid);
  sheet.disc(cx, 36, 1, metal.lit);

  return save("set-mill.png", stroke(sheet, INK));
};

const setMillSails = () => {
  const sheet = new Sheet(88, 88);
  const cx = 44;
  const cy = 44;

  const sail = (angle) => {
    const rad = (angle * Math.PI) / 180;
    const tx = Math.cos(rad);
    const ty = Math.sin(rad);
    const nx = -ty;
    const ny = tx;

    for (let k = 6; k < 40; k += 1) {
      const px = cx + tx * k;
      const py = cy + ty * k;
      const spread = k < 12 ? 2 : 4;

      for (let s = -spread; s <= spread; s += 1) {
        const x = Math.round(px + nx * s);
        const y = Math.round(py + ny * s);
        const rib = s === 0 || k % 5 === 0;
        sheet.set(x, y, rib ? wood.deep : pick(x, y, 0.35, wood.lit, wood.mid));
      }
    }
  };

  sail(0);
  sail(90);
  sail(180);
  sail(270);
  sheet.disc(cx, cy, 4, metal.mid);
  sheet.disc(cx, cy, 2, metal.lit);

  return save("set-mill-sails.png", stroke(sheet, INK));
};

const setWell = () => {
  const sheet = new Sheet(140, 120);
  const ground = 114;
  const cx = 70;

  contact(sheet, cx, ground, 30, 3);
  tuft(sheet, 16, ground, 7);
  tuft(sheet, 118, ground, 17);

  // Cistern
  face(sheet, cx - 28, ground - 28, 56, 28, stone, { mortar: { row: 7, col: 10, shift: 5 }, cap: true });
  sheet.rect(cx - 22, ground - 30, 44, 4, stone.lit);
  // Dark water
  sheet.rect(cx - 16, ground - 26, 32, 6, rgba("#243848"));
  for (let i = 0; i < 32; i += 1) {
    if (threshold(cx - 16 + i, ground - 24) < 0.22) {
      sheet.set(cx - 16 + i, ground - 24, rgba("#3a5a68"));
    }
  }
  mossPatch(sheet, cx - 26, ground - 2, 50);

  // Posts and beam
  face(sheet, cx - 26, ground - 72, 6, 44, wood, { grain: true });
  face(sheet, cx + 20, ground - 72, 6, 44, wood, { grain: true });
  face(sheet, cx - 30, ground - 78, 60, 8, wood, { grain: true, cap: true });

  roof(sheet, cx, 18, 78, 20, cloth);

  // Crank
  sheet.disc(cx, ground - 68, 5, wood.lit);
  sheet.disc(cx, ground - 68, 2, wood.deep);
  sheet.rect(cx + 5, ground - 70, 8, 2, wood.mid);

  return save("set-well.png", stroke(sheet, INK));
};

const setWellBucket = () => {
  const sheet = new Sheet(22, 20);
  const pal = wood;

  for (let j = 4; j < 18; j += 1) {
    const f = (j - 4) / 13;
    const half = 7 - f * 1.5;
    for (let x = Math.round(11 - half); x <= Math.round(11 + half); x += 1) {
      const across = (x - (11 - half)) / (half * 2);
      sheet.set(x, j, across < 0.3 ? pal.lit : across > 0.7 ? pal.dark : pal.mid);
    }
  }
  sheet.rect(8, 2, 6, 3, metal.dark);
  sheet.rect(10, 0, 2, 3, metal.mid);
  sheet.rect(6, 4, 10, 1, pal.lit);

  return save("set-well-bucket.png", stroke(sheet, INK));
};

const setFort = () => {
  const sheet = new Sheet(200, 130);
  const ground = 124;
  const wallY = ground - 52;

  contact(sheet, 90, ground, 70, 3);
  tuft(sheet, 8, ground, 3);
  tuft(sheet, 186, ground, 13);

  // Palisade — each stake is its own post, pointed, west-lit.
  for (let i = 0; i < 14; i += 1) {
    const x = 6 + i * 10;
    const h = 48 + (i % 3 === 0 ? 4 : 0);
    face(sheet, x, ground - h, 8, h, wood, { grain: true });
    sheet.poly(
      [
        [x, ground - h],
        [x + 4, ground - h - 7],
        [x + 8, ground - h],
      ],
      i % 2 ? wood.mid : wood.lit
    );
  }

  // Keep
  face(sheet, 148, ground - 92, 42, 92, wood, { grain: true, cap: true });
  windowLite(sheet, 168, ground - 70, 8, 8, true);
  windowLite(sheet, 168, ground - 48, 8, 8, false);
  door(sheet, 168, ground, 12, 20);
  mossPatch(sheet, 150, ground - 2, 38);

  // Awning over the counter
  for (let i = 0; i < 11; i += 1) {
    const x = 10 + i * 10;
    const stripe = i % 2 ? cloth.lit : cream;
    sheet.rect(x, wallY - 14, 10, 12, stripe);
    sheet.rect(x + 1, wallY - 2, 8, 4, stripe);
  }
  face(sheet, 12, wallY + 8, 108, 6, wood, { cap: true });

  crate(sheet, 28, ground, 16);
  crate(sheet, 48, ground, 13);
  barrel(sheet, 72, ground, 22);

  // Pole and pennant on the keep
  sheet.rect(180, ground - 108, 2, 16, wood.mid);
  flag(sheet, 182, ground - 108, 16, 9, cloth);

  return save("set-fort.png", stroke(sheet, INK));
};

const setForge = () => {
  const sheet = new Sheet(180, 124);
  const ground = 118;
  const cx = 52;

  contact(sheet, 70, ground, 50, 3);
  tuft(sheet, 8, ground, 5);
  tuft(sheet, 164, ground, 15);

  face(sheet, 14, ground - 64, 78, 64, stone, { mortar: { row: 8, col: 11, shift: 5 }, cap: true });
  roof(sheet, cx, 22, 96, 28, wood);
  mossPatch(sheet, 16, ground - 2, 74);

  // Chimney
  face(sheet, 22, 8, 16, 28, stone, { mortar: { row: 6, col: 8, shift: 3 } });
  sheet.rect(20, 6, 20, 5, stone.dark);

  // Furnace mouth — the heat is the whole point of this set.
  sheet.rect(34, ground - 36, 36, 26, stone.deep);
  for (let j = 0; j < 22; j += 1) {
    for (let i = 0; i < 30; i += 1) {
      const dx = (i - 15) / 15;
      const dy = (j - 16) / 16;
      const d = dx * dx + dy * dy;
      if (d > 1) {
        continue;
      }
      let c = coal;
      if (d < 0.18) {
        c = cream;
      } else if (d < 0.4) {
        c = flame;
      } else if (d < 0.7) {
        c = amber;
      } else {
        c = ember;
      }
      sheet.set(38 + i, ground - 34 + j, c);
    }
  }

  // Anvil
  sheet.poly(
    [
      [108, ground - 22],
      [156, ground - 22],
      [148, ground - 14],
      [136, ground - 14],
      [136, ground - 6],
      [146, ground],
      [118, ground],
      [128, ground - 6],
      [128, ground - 14],
      [116, ground - 14],
    ],
    metal.mid
  );
  sheet.rect(110, ground - 22, 44, 3, metal.lit);
  sheet.rect(128, ground - 6, 8, 6, metal.dark);

  return save("set-forge.png", stroke(sheet, INK));
};

const setTower = () => {
  const sheet = new Sheet(150, 140);
  const ground = 134;
  const cx = 75;

  contact(sheet, cx, ground, 28, 3);
  tuft(sheet, 14, ground, 9);
  tuft(sheet, 128, ground, 21);

  // Splayed legs
  for (let k = 0; k < 18; k += 1) {
    const f = k / 17;
    sheet.rect(Math.round(cx - 22 + f * 8), ground - 78 + Math.round(f * 78), 6, 5, wood.mid);
    sheet.rect(Math.round(cx + 16 - f * 8), ground - 78 + Math.round(f * 78), 6, 5, wood.dark);
  }

  // Cross braces
  sheet.line(cx - 16, ground - 28, cx + 16, ground - 54, wood.deep);
  sheet.line(cx + 16, ground - 28, cx - 16, ground - 54, wood.deep);
  sheet.line(cx - 14, ground - 20, cx + 14, ground - 20, wood.dark);

  face(sheet, cx - 28, ground - 88, 56, 10, wood, { grain: true, cap: true });

  // Rail
  for (let i = 0; i < 7; i += 1) {
    sheet.rect(cx - 24 + i * 8, ground - 100, 3, 12, wood.mid);
  }
  sheet.rect(cx - 26, ground - 100, 52, 3, wood.lit);

  roof(sheet, cx, 12, 64, 20, cloth);
  sheet.rect(cx - 1, 8, 2, 8, wood.mid);

  // Beacon
  sheet.disc(cx, ground - 94, 5, amber);
  sheet.disc(cx, ground - 94, 2, cream);
  for (let y = -8; y <= 6; y += 1) {
    for (let x = -8; x <= 8; x += 1) {
      const d = (x * x + y * y) / 70;
      if (d < 1 && !sheet.filled(cx + x, ground - 94 + y) && threshold(cx + x, ground - 94 + y) < (1 - d) * 0.3) {
        sheet.set(cx + x, ground - 94 + y, rgba("#e8c88a", 0.28));
      }
    }
  }

  return save("set-tower.png", stroke(sheet, INK));
};

const setYard = () => {
  const sheet = new Sheet(190, 130);
  const ground = 124;

  contact(sheet, 100, ground, 60, 3);
  tuft(sheet, 10, ground, 4);
  tuft(sheet, 172, ground, 18);

  // Scaffold
  for (let col = 0; col < 4; col += 1) {
    face(sheet, 118 + col * 16, ground - 70, 5, 70, wood, { grain: true });
  }
  for (let row = 0; row < 3; row += 1) {
    sheet.rect(118, ground - 22 - row * 24, 54, 4, wood.mid);
  }

  // Mast and jib
  face(sheet, 42, ground - 108, 10, 108, metal, { cap: true });
  for (let k = 0; k < 10; k += 1) {
    sheet.rect(42, ground - 10 - k * 11, 10, 2, metal.lit);
  }
  face(sheet, 48, ground - 112, 86, 7, metal, { cap: true });
  sheet.rect(46, ground - 114, 4, 10, metal.dark);

  crate(sheet, 30, ground, 16);
  barrel(sheet, 70, ground, 20);

  return save("set-yard.png", stroke(sheet, INK));
};

const setCamp = () => {
  const sheet = new Sheet(170, 110);
  const ground = 104;
  const cx = 64;

  contact(sheet, 80, ground, 50, 3);
  tuft(sheet, 8, ground, 2);
  tuft(sheet, 20, ground, 8);
  tuft(sheet, 148, ground, 14);
  tuft(sheet, 160, ground, 22);

  // A-frame tent — two faces meeting on a ridge, west face lit.
  const peak = 34;
  const half = 46;

  for (let y = peak; y < ground; y += 1) {
    const f = (y - peak) / (ground - peak);
    const span = Math.round(half * f);
    for (let x = cx - span; x <= cx + span; x += 1) {
      const side = x < cx ? teal.lit : teal.dark;
      const seam = Math.abs(x - cx) < 2;
      const fold = Math.abs(x - (cx - span * 0.45)) < 1 || Math.abs(x - (cx + span * 0.4)) < 1;
      let c = seam ? teal.deep : fold ? teal.mid : side;
      if (y === peak) {
        c = teal.lit;
      }
      sheet.set(x, y, c);
    }
  }

  // Open flap
  sheet.poly(
    [
      [cx - 8, ground - 28],
      [cx, ground - 38],
      [cx + 8, ground - 28],
      [cx + 10, ground],
      [cx - 10, ground],
    ],
    teal.deep
  );
  sheet.rect(cx - 1, 28, 2, ground - 28, wood.mid);

  // Pole and pennant
  sheet.rect(cx, 14, 2, 22, wood.lit);
  flag(sheet, cx + 2, 14, 16, 8, { lit: amber, mid: rgba("#d4843a"), dark: cloth.mid });

  // Guy lines
  sheet.line(cx - 20, peak + 8, cx - 44, ground - 2, wood.deep);
  sheet.line(cx + 20, peak + 8, cx + 44, ground - 2, wood.deep);
  sheet.rect(cx - 46, ground - 4, 3, 4, wood.dark);
  sheet.rect(cx + 44, ground - 4, 3, 4, wood.dark);

  barrel(sheet, 128, ground, 20);

  // Bedroll
  for (let j = 0; j < 8; j += 1) {
    for (let i = 0; i < 22; i += 1) {
      const c = j < 2 ? teal.lit : j > 5 ? teal.dark : teal.mid;
      sheet.set(138 + i, ground - 8 + j, c);
    }
  }
  sheet.disc(138, ground - 4, 4, teal.dark);
  sheet.disc(160, ground - 4, 4, teal.mid);

  return save("set-camp.png", stroke(sheet, INK));
};

/* ── Figures ───────────────────────────────── */

const spriteKeeper = () => {
  const sheet = new Sheet(36, 48);
  figure(sheet, 12, 46, { hat: "brim", cloak: cloth });
  return save("sprite-keeper.png", stroke(sheet, INK).trimmed());
};

const spriteSmith = () => {
  const sheet = new Sheet(40, 50);
  figure(sheet, 14, 48, { hat: "brim", cloak: wood, hold: "hammer" });
  return save("sprite-smith.png", stroke(sheet, INK).trimmed());
};

const spriteSentry = () => {
  const sheet = new Sheet(28, 44);
  figure(sheet, 12, 42, { hat: "hood", cloak: cloth });
  return save("sprite-sentry.png", stroke(sheet, INK).trimmed());
};

const spriteBuilder = () => {
  const sheet = new Sheet(28, 46);
  figure(sheet, 12, 44, { hat: "helm", cloak: metal });
  return save("sprite-builder.png", stroke(sheet, INK).trimmed());
};

/* ── Props ─────────────────────────────────── */

const propSignpost = () => {
  const sheet = new Sheet(70, 110);
  const ground = 106;
  const cx = 28;

  contact(sheet, cx, ground, 10, 2);
  tuft(sheet, 8, ground, 3);
  tuft(sheet, 52, ground, 9);

  face(sheet, cx - 4, ground - 78, 8, 78, wood, { grain: true });
  mossPatch(sheet, cx - 5, ground - 2, 12);

  // Arrow pointing east
  face(sheet, cx + 3, ground - 70, 32, 12, wood, { grain: true, cap: true });
  sheet.poly(
    [
      [cx + 34, ground - 74],
      [cx + 50, ground - 64],
      [cx + 34, ground - 54],
    ],
    wood.mid
  );
  sheet.rect(cx + 6, ground - 67, 22, 2, wood.deep);

  // Shorter west board
  face(sheet, cx - 26, ground - 52, 22, 10, wood, { grain: true });

  lantern(sheet, cx - 18, ground - 38);

  return save("prop-signpost.png", stroke(sheet, INK).trimmed());
};

const propCampfire = () => {
  const sheet = new Sheet(64, 56);
  const ground = 50;
  const cx = 32;

  contact(sheet, cx, ground, 16, 3);

  // Stone ring
  const stones = [
    [-14, 0, 5],
    [-8, 2, 4],
    [0, 3, 5],
    [8, 2, 4],
    [14, 0, 5],
    [-12, -4, 4],
    [12, -4, 4],
  ];
  stones.forEach(([dx, dy, r], n) => {
    sheet.disc(cx + dx, ground + dy - 2, r, n % 2 ? stone.mid : stone.dark);
    sheet.set(cx + dx - 1, ground + dy - r, stone.lit);
  });

  // Logs
  sheet.rect(cx - 12, ground - 10, 24, 5, wood.dark);
  sheet.rect(cx - 10, ground - 8, 20, 4, wood.mid);
  sheet.rect(cx - 3, ground - 14, 5, 10, wood.deep);
  sheet.set(cx - 12, ground - 10, wood.lit);

  // Flame
  const flamePts = [
    [0, -28, cream],
    [-2, -22, flame],
    [2, -22, flame],
    [-4, -16, amber],
    [0, -16, flame],
    [4, -16, amber],
    [-5, -10, ember],
    [0, -10, amber],
    [5, -10, ember],
  ];
  flamePts.forEach(([dx, dy, c]) => {
    sheet.disc(cx + dx, ground + dy, dy < -20 ? 2 : 3, c);
  });

  for (let y = -32; y <= 4; y += 1) {
    for (let x = -16; x <= 16; x += 1) {
      const d = (x * x) / 220 + (y * y) / 380;
      if (d < 1 && !sheet.filled(cx + x, ground + y) && threshold(cx + x, ground + y) < (1 - d) * 0.2) {
        sheet.set(cx + x, ground + y, rgba("#e8a33d", 0.2));
      }
    }
  }

  return save("prop-campfire.png", stroke(sheet, INK).trimmed());
};

const propBanner = () => {
  const sheet = new Sheet(56, 120);
  const ground = 116;
  const cx = 12;

  contact(sheet, cx, ground, 8, 2);
  tuft(sheet, 28, ground, 6);

  face(sheet, cx - 3, ground - 100, 6, 100, wood, { grain: true });
  sheet.poly(
    [
      [cx - 2, 8],
      [cx + 3, 2],
      [cx + 8, 8],
      [cx + 3, 16],
    ],
    metal.lit
  );
  sheet.rect(cx - 4, 16, 8, 3, metal.dark);

  // Tattered teal pennant
  for (let j = 0; j < 42; j += 1) {
    const wave = Math.round(Math.sin(j / 7) * 2);
    const fray = j > 30 && j % 5 === 0 ? 3 : 0;
    const w = 28 - Math.floor(j / 8) - fray;
    for (let i = 0; i < w; i += 1) {
      const fold = Math.abs(i - 8) < 1 || Math.abs(i - 16) < 1;
      sheet.set(cx + 3 + i, 22 + j + wave, fold ? teal.dark : i < 6 ? teal.lit : teal.mid);
    }
  }

  return save("prop-banner.png", stroke(sheet, INK).trimmed());
};

const propBarrel = () => {
  const sheet = new Sheet(36, 40);
  barrel(sheet, 18, 36, 26);
  tuft(sheet, 6, 36, 4);
  return save("prop-barrel.png", stroke(sheet, INK).trimmed());
};

const setCrate = () => {
  const sheet = new Sheet(20, 20);
  crate(sheet, 10, 18, 14);
  return save("set-crate.png", stroke(sheet, INK).trimmed());
};

/* ── Go ────────────────────────────────────── */

console.log("Sets:");
setMill();
setMillSails();
setWell();
setWellBucket();
setFort();
setForge();
setTower();
setYard();
setCamp();

console.log("\nProps:");
propSignpost();
propCampfire();
propBanner();
propBarrel();
setCrate();
