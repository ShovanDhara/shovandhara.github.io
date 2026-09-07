(function () {
  "use strict";

  const road = document.getElementById("road");
  const walker = document.querySelector(".walker");
  const layers = Array.from(document.querySelectorAll(".layer"));
  const stages = Array.from(document.querySelectorAll(".stage"));
  const checkpoints = Array.from(document.querySelectorAll("[data-ckpt]"));
  const trackLabel = document.querySelector("[data-track-label]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const sideways = window.matchMedia("(min-width: 901px)");

  if (!road) {
    return;
  }

  /* ── Where along the road are we? ─────────── */

  const distance = () => (sideways.matches ? road.scrollLeft : window.scrollY);

  const behavior = () => (reducedMotion.matches ? "auto" : "smooth");

  const walkTo = (target) => {
    if (!target) {
      return;
    }

    if (sideways.matches) {
      road.scrollTo({ left: target.offsetLeft, behavior: behavior() });
    } else {
      window.scrollTo({ top: target.offsetTop - 20, behavior: behavior() });
    }
  };

  /* ── Parallax: each layer drifts at its own depth ── */

  const clouds = document.querySelector(".layer--clouds");
  const climateLabel = document.querySelector("[data-climate]");
  const storyLine = document.querySelector("[data-story]");
  const flash = document.querySelector(".flash");
  let cloudDrift = 0;
  let cloudSpeed = 0.28;
  let stormy = false;
  let nextFlash = 0;

  /* Each region has its own weather and its own line of narration, so the
     walk reads as one journey rather than seven unrelated screens. The story
     beat is written to match the set piece standing in that stage. */
  const climates = {
    start: {
      season: "harvest",
      label: "Harvest dusk",
      speed: 0.28,
      storm: false,
      story: "The mill still turns. The road east is open.",
    },
    profile: {
      season: "autumn",
      label: "Autumn wind",
      speed: 0.4,
      storm: false,
      story: "He stops at the well and gives his account.",
    },
    loadout: {
      season: "rain",
      label: "Monsoon",
      speed: 0.75,
      storm: false,
      story: "Towers rise in the rain. House colours on the wind.",
    },
    skills: {
      season: "storm",
      label: "Storm front",
      speed: 1.15,
      storm: true,
      story: "Thunder over the forge. Everything he can do was beaten out here.",
    },
    xp: {
      season: "winter",
      label: "Cold snap",
      speed: 0.18,
      storm: false,
      story: "Snow on the watchtower. Four campaigns behind him.",
    },
    builds: {
      season: "forge",
      label: "Forge thaw",
      speed: 0.36,
      storm: false,
      story: "The thaw. In the yard below, the things he built still stand.",
    },
    save: {
      season: "hearth",
      label: "Campfire night",
      speed: 0.14,
      storm: false,
      story: "Fire, tent, and the last of the light. Rest here.",
    },
  };

  const leafColors = ["#c4633c", "#e8a33d", "#8a4a32", "#d4843a"];

  const lerp = (a, b, t) => a + (b - a) * t;
  const px = (n) => Math.round(n) + "px";

  // `depth` runs 0 (far haze) to 1 (right in front of the camera). Every
  // particle reads its size, speed and alpha off it, so the fields get real
  // layering instead of one uniform curtain.
  const recipes = {
    rain: (bit, depth) => {
      bit.style.setProperty("--dur", lerp(1.15, 0.5, depth).toFixed(2) + "s");
      bit.style.setProperty("--len", px(lerp(14, 40, depth)));
      bit.style.setProperty("--w", px(lerp(1, 3, depth)));
      bit.style.setProperty("--alpha", lerp(0.22, 0.85, depth).toFixed(2));
      bit.style.setProperty("--drift", "27vh"); // matches the streak's tilt
    },
    snow: (bit, depth) => {
      bit.style.setProperty("--dur", lerp(16, 7.5, depth).toFixed(2) + "s");
      bit.style.setProperty("--w", px(lerp(2, 6, depth)));
      bit.style.setProperty("--alpha", lerp(0.4, 1, depth).toFixed(2));
      bit.style.setProperty("--sway", px(lerp(10, 34, depth)));
      bit.style.setProperty("--drift", px(Math.random() * 70 - 25));
    },
    leaf: (bit, depth, i) => {
      bit.style.setProperty("--dur", lerp(13, 6.5, depth).toFixed(2) + "s");
      bit.style.setProperty("--w", px(lerp(7, 15, depth)));
      bit.style.setProperty("--alpha", lerp(0.55, 1, depth).toFixed(2));
      bit.style.setProperty("--sway", px(lerp(22, 60, depth)));
      bit.style.setProperty("--spin", Math.round(lerp(280, 640, Math.random())) + "deg");
      bit.style.setProperty("--drift", px(Math.random() * 180 - 40));
      bit.style.setProperty("--leaf", leafColors[i % leafColors.length]);
    },
    ember: (bit, depth) => {
      bit.style.setProperty("--dur", lerp(4.6, 2.1, depth).toFixed(2) + "s");
      bit.style.setProperty("--w", px(lerp(2, 4, depth)));
      bit.style.setProperty("--sway", px(lerp(8, 28, depth)));
      bit.style.setProperty("--drift", px(Math.random() * 70 - 25));
    },
  };

  const fillField = (root, count, kind) => {
    if (!root || root.childElementCount) {
      return;
    }

    const recipe = recipes[kind];
    const bits = document.createDocumentFragment();

    for (let i = 0; i < count; i += 1) {
      const bit = document.createElement("span");
      bit.className = "bit";

      // Embers rise off the campfire, so they start near it rather than
      // anywhere across the sky.
      bit.style.setProperty(
        "--x",
        kind === "ember"
          ? "calc(12% + 78px + " + px(Math.random() * 40 - 20) + ")"
          : (Math.random() * 106 - 3).toFixed(1) + "vw"
      );
      bit.style.setProperty("--delay", "-" + (Math.random() * 9).toFixed(2) + "s");
      recipe(bit, Math.random(), i);

      bits.appendChild(bit);
    }

    root.appendChild(bits);
  };

  fillField(document.querySelector('[data-field="rain"]'), 150, "rain");
  fillField(document.querySelector('[data-field="snow"]'), 80, "snow");
  fillField(document.querySelector('[data-field="leaf"]'), 34, "leaf");
  fillField(document.querySelector('[data-field="ember"]'), 32, "ember");

  const setClimate = (group) => {
    const climate = climates[group] || climates.start;

    document.body.dataset.season = climate.season;
    cloudSpeed = climate.speed;
    stormy = climate.storm;

    if (climateLabel) {
      climateLabel.textContent = climate.label;
    }

    if (storyLine) {
      storyLine.textContent = climate.story;
      storyLine.classList.remove("is-new");
      void storyLine.offsetWidth; // replay the type-on for the new beat
      storyLine.classList.add("is-new");
    }
  };

  /* The scenery strips are zoned: one biome per checkpoint, laid out along the
     strip in the same proportions as the stages along the road. So they are
     panned by scroll progress rather than by a multiple of scroll distance —
     that pins zone N to checkpoint N on any viewport. Parallax still reads,
     because a strip is only as wide as its aspect ratio makes it: the far
     ridges have a short run and crawl, the near treeline has a long one and
     races. The cloud and ground tiles keep repeating on plain depth. */
  const paintScenery = (x, p) => {
    layers.forEach((layer) => {
      let offset;

      if (layer.dataset.aspect) {
        // Centre the viewport on the strip rather than anchoring its left
        // edge, so you stand in the middle of a biome at its checkpoint
        // instead of watching the previous one leave.
        const width = parseFloat(layer.dataset.aspect) * layer.offsetHeight;
        const run = Math.max(0, width - window.innerWidth);
        offset = -Math.min(run, Math.max(0, p * width - window.innerWidth / 2));
      } else {
        offset = -(x * (parseFloat(layer.dataset.depth) || 0));
      }

      if (layer === clouds) {
        offset -= cloudDrift;
      }

      layer.style.backgroundPositionX = offset + "px";
    });
  };

  /* ── The day passes as you walk east ──────── */

  const sun = document.querySelector(".sky__sun");
  const moon = document.querySelector(".sky__moon");
  const wash = document.querySelector(".sky__wash");

  const HORIZON = 80; // vh of the skyline the bodies rise out of
  const ZENITH = 11; // vh at the top of the arc

  // Windows are in scroll progress, 0 at the first stage and 1 at the last.
  // The sun starts a touch above the horizon so the world isn't empty on
  // load, and the moon is still coming down when the road runs out.
  const SUN_WINDOW = [-0.05, 0.62];
  const MOON_WINDOW = [0.5, 1.02];

  const SUN_LOW = [233, 118, 52]; // heavy and orange at the horizon
  const SUN_HIGH = [255, 238, 196]; // small and pale overhead

  const clamp01 = (n) => Math.min(1, Math.max(0, n));

  const progress = () => {
    const span = sideways.matches
      ? road.scrollWidth - road.clientWidth
      : document.documentElement.scrollHeight - window.innerHeight;

    return span > 0 ? clamp01(distance() / span) : 0;
  };

  // Places a body on its arc and hands back where it ended up, or null when
  // it is below the horizon and shouldn't be drawn at all.
  const place = (el, p, window_, riseX, setX, big, small) => {
    if (!el) {
      return null;
    }

    const [from, to] = window_;

    if (p < from || p > to) {
      el.style.setProperty("--vis", "0");
      return null;
    }

    const t = (p - from) / (to - from);
    const alt = Math.sin(t * Math.PI); // 0 on the horizon, 1 overhead
    const x = riseX + (setX - riseX) * t;

    el.style.setProperty("--x", x.toFixed(2) + "vw");
    el.style.setProperty("--y", (HORIZON - alt * (HORIZON - ZENITH)).toFixed(2) + "vh");
    el.style.setProperty("--size", (big - (big - small) * alt).toFixed(1) + "px");
    el.style.setProperty("--vis", clamp01(alt * 7).toFixed(3));
    el.style.setProperty("--halo", (0.18 + (1 - alt) * 0.55).toFixed(3));

    return { alt: alt, x: x };
  };

  // Strongest just after a body clears the horizon and just before it drops
  // back under, which is exactly when a real sky catches fire.
  const washStrength = (body) =>
    body ? Math.pow(1 - body.alt, 1.6) * clamp01(body.alt * 9) : 0;

  const paintSky = (p) => {
    const sunAt = place(sun, p, SUN_WINDOW, 93, 3, 58, 26);
    const moonAt = place(moon, p, MOON_WINDOW, 95, 5, 44, 26);

    if (sun && sunAt) {
      const warmth = Math.pow(1 - sunAt.alt, 1.4);
      const tone = SUN_HIGH.map((v, i) => Math.round(v + (SUN_LOW[i] - v) * warmth));
      sun.style.setProperty("--sun-color", "rgb(" + tone.join(",") + ")");
    }

    if (wash) {
      const golden = washStrength(sunAt);
      const silver = washStrength(moonAt) * 0.55;
      const lit = silver > golden;
      const source = lit ? moonAt : sunAt;

      wash.style.setProperty("--wash", (lit ? silver : golden).toFixed(3));
      wash.style.setProperty("--wash-x", (source ? source.x : 70) + "%");
      wash.style.setProperty(
        "--wash-color",
        lit ? "rgba(146, 174, 226, 0.5)" : "rgba(236, 138, 62, 0.66)"
      );
    }
  };

  /* Loadout towers rise from the pitch as their stage slides under the walker. */
  const pitchStages = Array.from(document.querySelectorAll(".stage--pitch"));

  const paintTowers = () => {
    if (!pitchStages.length) {
      return;
    }

    if (!sideways.matches || reducedMotion.matches) {
      pitchStages.forEach((stage) => {
        stage.style.setProperty("--rise", "1");
      });
      return;
    }

    const view = road.scrollLeft + window.innerWidth * 0.5;
    const span = Math.max(window.innerWidth * 0.7, 1);

    pitchStages.forEach((stage) => {
      const mid = stage.offsetLeft + stage.offsetWidth * 0.5;
      const near = Math.max(0, 1 - Math.abs(mid - view) / span);
      stage.style.setProperty("--rise", near.toFixed(3));
    });
  };

  const keepWorldMoving = (time) => {
    if (!reducedMotion.matches) {
      cloudDrift = (cloudDrift + cloudSpeed) % 1280;

      if (stormy && flash && time > nextFlash) {
        flash.classList.remove("is-on");
        void flash.offsetWidth; // restart the strike animation from frame one
        flash.classList.add("is-on");
        nextFlash = time + 2600 + Math.random() * 5200;
      }
    }

    paintScenery(sideways.matches ? distance() : distance() * 0.35, progress());
    paintSky(progress());
    paintTowers();
    window.requestAnimationFrame(keepWorldMoving);
  };

  /* ── Checkpoints follow the walker ────────── */

  const groupOrder = [];
  stages.forEach((stage) => {
    const group = stage.dataset.group;
    if (group && groupOrder.indexOf(group) === -1) {
      groupOrder.push(group);
    }
  });

  let activeGroup = "";

  const markCheckpoints = () => {
    const edge = sideways.matches ? road.scrollLeft + window.innerWidth * 0.4 : window.scrollY + window.innerHeight * 0.4;

    let current = stages[0];

    stages.forEach((stage) => {
      const start = sideways.matches ? stage.offsetLeft : stage.offsetTop;
      if (start <= edge) {
        current = stage;
      }
    });

    const group = current ? current.dataset.group : "";

    if (group === activeGroup) {
      return;
    }

    activeGroup = group;
    setClimate(group);
    const reached = groupOrder.indexOf(group);

    checkpoints.forEach((ckpt, index) => {
      const isActive = ckpt.dataset.ckpt === group;

      ckpt.classList.toggle("is-active", isActive);
      ckpt.classList.toggle("is-done", index < reached);

      if (isActive) {
        ckpt.setAttribute("aria-current", "true");

        if (trackLabel) {
          const name = ckpt.querySelector(".ckpt__name");
          trackLabel.textContent = name ? name.textContent : "";
        }
      } else {
        ckpt.removeAttribute("aria-current");
      }
    });
  };

  /* ── The walker reacts to travel ──────────── */

  let lastX = distance();
  let stopTimer = 0;

  const stride = (x) => {
    if (!walker) {
      return;
    }

    if (x !== lastX) {
      walker.classList.add("is-walking");
      walker.classList.toggle("is-back", x < lastX);

      window.clearTimeout(stopTimer);
      stopTimer = window.setTimeout(() => walker.classList.remove("is-walking"), 160);
    }

    lastX = x;
  };

  let queued = false;

  const onTravel = () => {
    queued = false;

    const x = distance();

    paintScenery(sideways.matches ? x : x * 0.35, progress());
    paintTowers();
    markCheckpoints();
    stride(x);
  };

  const requestTravel = () => {
    if (!queued) {
      queued = true;
      window.requestAnimationFrame(onTravel);
    }
  };

  road.addEventListener("scroll", requestTravel, { passive: true });
  window.addEventListener("scroll", requestTravel, { passive: true });
  window.addEventListener("resize", requestTravel);

  /* ── A vertical wheel should carry you east ── */

  road.addEventListener(
    "wheel",
    (event) => {
      if (!sideways.matches || event.ctrlKey) {
        return;
      }

      // Leave real horizontal gestures to the browser.
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
        return;
      }

      // A panel that can still scroll on its own keeps the wheel.
      const scrollable = event.target.closest(".panel");
      if (scrollable && scrollable.scrollHeight > scrollable.clientHeight) {
        const atTop = scrollable.scrollTop === 0;
        const atEnd =
          Math.ceil(scrollable.scrollTop + scrollable.clientHeight) >= scrollable.scrollHeight;

        if (!(atTop && event.deltaY < 0) && !(atEnd && event.deltaY > 0)) {
          return;
        }
      }

      event.preventDefault();
      road.scrollLeft += event.deltaY;
    },
    { passive: false },
  );

  /* ── Drag the world past you ──────────────── */

  let dragging = false;
  let dragged = false;
  let originX = 0;
  let originScroll = 0;

  road.addEventListener("pointerdown", (event) => {
    if (!sideways.matches || event.button !== 0 || event.pointerType === "touch") {
      return;
    }

    dragging = true;
    dragged = false;
    originX = event.clientX;
    originScroll = road.scrollLeft;
  });

  road.addEventListener("pointermove", (event) => {
    if (!dragging) {
      return;
    }

    const shift = event.clientX - originX;

    if (!dragged && Math.abs(shift) < 6) {
      return;
    }

    if (!dragged) {
      dragged = true;
      road.classList.add("is-dragging");
      road.setPointerCapture(event.pointerId);
    }

    road.scrollLeft = originScroll - shift;
  });

  const endDrag = () => {
    dragging = false;
    road.classList.remove("is-dragging");
  };

  road.addEventListener("pointerup", endDrag);
  road.addEventListener("pointercancel", endDrag);

  // A drag that ended over a link should not also open it.
  road.addEventListener(
    "click",
    (event) => {
      if (dragged) {
        event.preventDefault();
        event.stopPropagation();
        dragged = false;
      }
    },
    true,
  );

  /* ── Keys ─────────────────────────────────── */

  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") {
      return;
    }

    if (!sideways.matches) {
      return;
    }

    const step = 72;

    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        road.scrollLeft += step;
        break;
      case "ArrowLeft":
        event.preventDefault();
        road.scrollLeft -= step;
        break;
      case "PageDown":
        event.preventDefault();
        road.scrollBy({ left: window.innerWidth, behavior: behavior() });
        break;
      case "PageUp":
        event.preventDefault();
        road.scrollBy({ left: -window.innerWidth, behavior: behavior() });
        break;
      case "Home":
        event.preventDefault();
        walkTo(stages[0]);
        break;
      case "End":
        event.preventDefault();
        walkTo(stages[stages.length - 1]);
        break;
      default:
        break;
    }
  });

  /* ── Checkpoint and in-page links ─────────── */

  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href^="#"]');

    if (!link) {
      return;
    }

    const target = document.querySelector(link.getAttribute("href"));

    if (!target) {
      return;
    }

    event.preventDefault();
    walkTo(target);
    history.replaceState(null, "", link.getAttribute("href"));
  });

  /* ── Reveal stat bars once you reach them ─── */

  const profile = document.querySelector("#profile .profile");

  if (profile) {
    if (!("IntersectionObserver" in window)) {
      profile.classList.add("is-visible");
    } else {
      const watcher = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              watcher.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.25 },
      );

      watcher.observe(profile);
    }
  }

  /* ── The title types itself out ───────────── */

  const typed = document.querySelector("[data-typewriter]");

  if (typed && !reducedMotion.matches) {
    const phrase = typed.getAttribute("data-typewriter");
    let index = 0;

    typed.textContent = "";

    const type = () => {
      typed.textContent = phrase.slice(0, (index += 1));

      if (index < phrase.length) {
        window.setTimeout(type, 50);
      }
    };

    window.setTimeout(type, 420);
  }

  /* ── Arriving with a #hash ────────────────── */

  const landing = window.location.hash && document.querySelector(window.location.hash);

  if (landing) {
    window.requestAnimationFrame(() => {
      if (sideways.matches) {
        road.scrollLeft = landing.offsetLeft;
      } else {
        window.scrollTo(0, landing.offsetTop - 20);
      }
      onTravel();
    });
  } else {
    onTravel();
  }

  window.requestAnimationFrame(keepWorldMoving);
})();
