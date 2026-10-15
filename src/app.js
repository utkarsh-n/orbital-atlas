import {
  BODIES,
  AU_KM,
  DAY_SECONDS,
  YEAR_DAYS,
  MIN_JD,
  MAX_JD,
  clamp,
  norm,
  elements,
  jdFromDate,
  dateFromJD,
  parseEpoch,
  loadEphemeris,
  lunarPhase,
  phaseOutline,
  add,
} from "./physics.js";
import { createRenderer } from "./render.js";
import { createLunarRenderer } from "./lunar.js";
import { setupCelestialUI } from "./celestial-ui.js";
import { calendarAt, PEOPLE, birthAnchor } from "./celestial.js";
const $ = (id) => document.getElementById(id);
const store = {
  jd: clamp(jdFromDate(new Date()), MIN_JD, MAX_JD),
  playing: false,
  rate: 60,
  direction: 1,
  mode: "3d",
  lens: "torus",
  spacing: "atlas",
  selected: "earth",
  labels: true,
  grid: true,
  zoom: 1,
  yaw: 0,
  pitch: 48,
  window: 1826.25,
  allWorldlines: true,
  showZodiac: true,
  zodiacSystem: "tropical",
  sacredGeometry: "mandala",
  birthTimes: { "sample-a": "12:00", "sample-b": "12:00" },
  birthEstimated: { "sample-a": true, "sample-b": true },
};
let renderer,
  lunarRenderer,
  celestialUI,
  ephemeris,
  lastUI = 0,
  lastUIKey = "";
const bodyById = (id) => BODIES.find((b) => b.id === id);
const formatDate = (jd) => dateFromJD(jd).toISOString().slice(0, 16);
const format = (n) => (n < 10 ? n.toFixed(3) : n.toFixed(2));
$("epoch-slider").max = String(MAX_JD - MIN_JD);
$("epoch-slider").step = String(1 / 86400);
$("date-input").max = "2100-12-31T23:59:59";
$("all-worldlines").checked = true;
const quickPlay = document.createElement("button");
quickPlay.id = "quick-play";
quickPlay.textContent = "▶ RUN";
quickPlay.setAttribute("aria-label", "Run orbital animation");
document.querySelector(".display-module .module-heading").append(quickPlay);
const controls = [...document.querySelectorAll("button,input,select")];
controls.forEach((el) => (el.disabled = true));
for (const body of BODIES) {
  const button = document.createElement("button");
  button.className = "body-button" + (body.id === "earth" ? " active" : "");
  button.style.setProperty("--body-color", body.color);
  button.dataset.body = body.id;
  button.setAttribute("aria-label", `Select ${body.name}`);
  button.setAttribute("aria-pressed", String(body.id === "earth"));
  const dot = document.createElement("span");
  dot.className = "body-dot";
  const name = document.createElement("span");
  name.textContent = body.name;
  const value = document.createElement("output");
  value.id = `distance-${body.id}`;
  value.textContent = "— AU";
  button.append(dot, name, value);
  button.disabled = true;
  button.addEventListener("click", () => selectBody(body.id));
  $("body-list").append(button);
}
function selectBody(id) {
  store.selected = id;

  const body = bodyById(id);
  document.querySelectorAll("[data-body]").forEach((el) => {
    const selected = el.dataset.body === id;
    el.classList.toggle("active", selected);
    el.setAttribute("aria-pressed", String(selected));
  });
  $("selected-name").textContent = body.name;
  $("selected-type").textContent = body.type;
  $("selected-symbol").textContent = body.symbol;
  $("body-readout").style.setProperty("--body-color", body.color);
  $("body-readout").classList.remove("revised");
  void $("body-readout").offsetWidth;
  $("body-readout").classList.add("revised");
  lastUI = 0;
  updateView();
}
function updateView() {
  const temporal = store.mode === "4d" || (store.mode === "5d" && store.lens !== "tracks");
  $("lens-toolbar").hidden = store.mode !== "5d";
  $("time-projection-controls").hidden = !temporal;
  const descriptions = {
    "2d": ["ECLIPTIC PROJECTION", "HELIOCENTRIC ORBITAL MAP"],
    "3d": ["THREE-DIMENSIONAL ORBITS", "HELIOCENTRIC ORBITAL MAP"],
    "4d": ["SPACE + TIME / WORLDLINES", "X · Y · Z · TIME → PROJECTED"],
    cylinder: ["UNROLLED TIME", "SPATIAL CROSS-SECTION × TIME"],
    torus: ["WRAPPED TIME", "PAST + PRESENT + PREDICTED FUTURE"],
    tracks: ["ORBITAL PHASE TRACKS", "TRUE ANOMALY / FIXED CIRCULAR LANES"],
  };
  const key = store.mode === "5d" ? store.lens : store.mode;
  $("view-label").textContent = descriptions[key][0];
  $("plot-title").textContent = descriptions[key][1];
  const descriptionsText = {
    "2d":
      store.spacing === "atlas"
        ? "Each orbit is uniformly scaled for legibility. True AU restores a common distance scale."
        : "A shared AU scale preserves distances. Use zoom or select a body to inspect the inner system.",
    "3d":
      store.spacing === "atlas"
        ? "Orbital distances are individually scaled for legibility. Switch to True AU for a common distance scale."
        : "Actual orbital inclinations and a common distance scale. Body markers remain exaggerated.",
    "4d": "Past and future positions form a worldline in x, y, z and time. This view projects four coordinates onto the screen.",
    cylinder:
      "Time runs along the cylinder. Its cross-section projects the three spatial coordinates. Solid past, dashed predicted future.",
    torus:
      "Time wraps around the torus. The dotted rear join closes the display only; the physical trajectory does not repeat.",
    tracks:
      "Each body rides a fixed circular phase lane at its real true anomaly. These circles show orbital phase, not spatial distance.",
  };
  $("view-explanation").textContent = descriptionsText[key];
  $("plot-scale").textContent =
    key === "tracks"
      ? "PHASE LAYOUT / POSITION READOUTS IN AU"
      : temporal
        ? store.spacing === "atlas"
          ? "ATLAS-SCALED SPACE / PHYSICAL TIME"
          : "COMMON AU SCALE / PHYSICAL TIME"
        : store.spacing === "atlas"
          ? "ELLIPSE SHAPES & PHASES PRESERVED"
          : "TRUE DISTANCES / GLYPHS NOT TO SCALE";
  updateWindowNote();
  document.querySelector('[aria-label="Orbit spacing"]').style.opacity =
    key === "tracks" ? ".5" : "1";
  document.querySelectorAll("[data-spacing]").forEach((el) => (el.disabled = key === "tracks"));
}
function updateWindowNote() {
  const edge = store.jd - store.window < MIN_JD || store.jd + store.window > MAX_JD;
  $("time-range-note").textContent = edge
    ? "Window clipped at ephemeris boundary"
    : `${store.allWorldlines ? "All bodies" : "Focused on " + bodyById(store.selected).name} · past solid / future dashed`;
}
function setEpoch(jd) {
  if (!Number.isFinite(jd) || jd < MIN_JD || jd > MAX_JD)
    throw new RangeError("Choose a date from 1900 through 2100.");
  store.jd = jd;
  store.playing = false;
  $("date-error").textContent = "";
  lastUI = 0;
  updateView();
  updateClock();
}
function updateClock() {
  if (document.activeElement !== $("date-input")) $("date-input").value = formatDate(store.jd);
  $("frame-date").textContent = formatDate(store.jd).replace("T", " ") + " UT";
  $("epoch-slider").value = String(store.jd - MIN_JD);
  const text = store.playing ? "PAUSE" : "PLAY";
  if ($("play-text").textContent !== text) {
    $("play-text").textContent = text;
    $("play-icon").textContent = store.playing ? "Ⅱ" : "▶";
  }
  $("play").setAttribute("aria-label", store.playing ? "Pause simulation" : "Play simulation");
  $("time-state").textContent = store.playing ? "RUN" : "HOLD";
  quickPlay.textContent = store.playing ? "Ⅱ HOLD" : "▶ RUN";
  quickPlay.setAttribute(
    "aria-label",
    store.playing ? "Hold orbital animation" : "Run orbital animation",
  );
  updateWindowNote();
  $("zoom-value").textContent = Math.round(store.zoom * 100) + "%";
  $("camera-output").textContent =
    `AZ ${(((store.yaw % 360) + 360) % 360) | 0}° / EL ${Math.round(store.pitch)}°`;
}
function updateReadouts(states, els) {
  const now = performance.now();
  if (now - lastUI < 140) return;
  lastUI = now;
  const key = JSON.stringify(store);
  if (key === lastUIKey) return;
  lastUIKey = key;
  updateClock();
  celestialUI?.update();
  for (const body of BODIES) {
    const state = states.get(body.id);
    $(`distance-${body.id}`).textContent = state ? format(norm(state.p)) + " AU" : "OFF";
  }
  const body = bodyById(store.selected),
    state = states.get(body.id) || ephemeris.at(body.id, store.jd),
    el = els.get(body.id) || elements(state, body);
  $("body-distance").textContent = norm(state.p).toFixed(5);
  $("body-speed").textContent = ((norm(state.v) * AU_KM) / DAY_SECONDS).toFixed(3);
  $("body-ecc").textContent = el.e.toFixed(4);
  $("body-inc").textContent = el.inclination.toFixed(2);
  $("body-phase").textContent = ((el.anomaly * 180) / Math.PI).toFixed(2);
  $("body-period").textContent =
    el.period < YEAR_DAYS ? el.period.toFixed(1) : (el.period / YEAR_DAYS).toFixed(2);
  $("period-unit").textContent = el.period < YEAR_DAYS ? "days" : "yr";
  $("body-coordinates").textContent = state.p
    .map((n) => (n >= 0 ? "+" : "") + n.toFixed(6))
    .join(" / ");
  $("body-note").textContent =
    "Position follows the dated ephemeris. The faint ellipse is an instantaneous orbital guide.";
  const moon = ephemeris.at("moon", store.jd),
    earth = states.get("earth") || ephemeris.at("earth", store.jd),
    phase = lunarPhase(earth.p, moon.p);
  $("moon-phase").textContent = phase.name;
  $("moon-illumination").textContent = (phase.illumination * 100).toFixed(1) + "%";
  $("moon-trend").textContent = phase.waxing
    ? "Waxing · light increasing"
    : "Waning · light decreasing";
  $("moon-distance").textContent = Math.round(phase.distanceKm).toLocaleString("en-US") + " km";
  $("moon-elongation").textContent = phase.elongationDeg.toFixed(1) + "°";
  $("moon-lit").setAttribute(
    "d",
    phaseOutline(phase.cosPhase, phase.waxing)
      .map((v, i) => `${i ? "L" : "M"}${v[0].toFixed(5)},${v[1].toFixed(5)}`)
      .join(" ") + " Z",
  );
  $("moon-disc").setAttribute(
    "aria-label",
    `${phase.name}, ${(phase.illumination * 100).toFixed(1)} percent illuminated. Geometric phase schematic.`,
  );
  $("moon-caption").textContent =
    "Earth-centered inset · north of the ecliptic · geometric phase, no eclipse shadow. " +
    (store.spacing === "atlas" && ["2d", "3d"].includes(store.mode)
      ? "Moon separation is enlarged in the main map."
      : "Same time as the planetary map.");
}
document.querySelectorAll("[data-mode]").forEach((button) =>
  button.addEventListener("click", () => {
    store.mode = button.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach((el) => {
      el.classList.toggle("active", el === button);
      el.setAttribute("aria-pressed", String(el === button));
    });
    renderer?.reset();
    updateView();
    lastUI = 0;
  }),
);
document.querySelectorAll("[data-lens]").forEach((button) =>
  button.addEventListener("click", () => {
    store.lens = button.dataset.lens;
    document.querySelectorAll("[data-lens]").forEach((el) => {
      el.classList.toggle("active", el === button);
      el.setAttribute("aria-pressed", String(el === button));
    });
    renderer?.reset();
    updateView();
  }),
);
document.querySelectorAll("[data-spacing]").forEach((button) =>
  button.addEventListener("click", () => {
    store.spacing = button.dataset.spacing;
    document.querySelectorAll("[data-spacing]").forEach((el) => {
      el.classList.toggle("active", el === button);
      el.setAttribute("aria-pressed", String(el === button));
    });
    store.zoom = 1;
    updateView();
  }),
);
for (const [id, key] of [
  ["show-labels", "labels"],
  ["show-grid", "grid"],
  ["all-worldlines", "allWorldlines"],
])
  $(id).addEventListener("change", (e) => {
    store[key] = e.target.checked;
    updateView();
  });
$("zoom-in").addEventListener("click", () => (store.zoom = clamp(store.zoom * 1.25, 0.5, 20)));
$("zoom-out").addEventListener("click", () => (store.zoom = clamp(store.zoom / 1.25, 0.5, 20)));
$("home-view").addEventListener("click", () => renderer?.reset());
$("play").addEventListener("click", () => {
  store.playing = !store.playing;
  updateClock();
});
quickPlay.addEventListener("click", () => {
  store.playing = !store.playing;
  updateClock();
});
$("step-back").addEventListener("click", () => setEpoch(clamp(store.jd - 1, MIN_JD, MAX_JD)));
$("step-next").addEventListener("click", () => setEpoch(clamp(store.jd + 1, MIN_JD, MAX_JD)));
$("speed").addEventListener("change", (e) => (store.rate = Number(e.target.value)));
$("direction").addEventListener("click", () => {
  store.direction *= -1;
  $("direction").textContent = store.direction < 0 ? "←" : "→";
  $("direction").setAttribute("aria-pressed", String(store.direction < 0));
  $("direction").setAttribute(
    "aria-label",
    store.direction < 0 ? "Use forward time" : "Reverse time direction",
  );
});
$("today").addEventListener("click", () => setEpoch(clamp(jdFromDate(new Date()), MIN_JD, MAX_JD)));
$("epoch-slider").addEventListener("input", (e) => setEpoch(MIN_JD + Number(e.target.value)));
$("date-input").addEventListener("change", (e) => {
  try {
    setEpoch(parseEpoch(e.target.value + "Z"));
  } catch (error) {
    $("date-error").textContent = error.message;
  }
});
$("date-input").addEventListener("blur", () => {
  if ($("date-error").textContent) return;
  updateClock();
});
$("time-window").addEventListener("change", (e) => {
  store.window = Number(e.target.value);
  updateView();
});
document.addEventListener("keydown", (e) => {
  if (
    e.code === "Space" &&
    !e.repeat &&
    !["INPUT", "SELECT", "TEXTAREA", "BUTTON", "SUMMARY"].includes(
      document.activeElement.tagName,
    ) &&
    ephemeris
  ) {
    e.preventDefault();
    store.playing = !store.playing;
    updateClock();
  }
});
document.addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button || button.disabled || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  button.classList.remove("flash");
  void button.offsetWidth;
  button.classList.add("flash");
});
function registerAgentTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const tools = [
    {
      name: "read_orbital_state",
      description:
        "Read the selected epoch, nine planetary heliocentric states, and the Moon’s geocentric state, heliocentric state, and geometric phase.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute() {
        return {
          epochUT: formatDate(store.jd),
          frame: "J2000 ecliptic, Sun-centered",
          calendar: calendarAt(ephemeris, store.jd),
          birthNodes: PEOPLE.map((person) => ({
            ...birthAnchor(person, store.birthTimes[person.id], ephemeris),
            estimatedTime: store.birthEstimated[person.id],
            symbolic: true,
          })),
          bodies: BODIES.map((b) => ({ id: b.id, ...ephemeris.at(b.id, store.jd) })),
          moon: (() => {
            const earth = ephemeris.at("earth", store.jd),
              moon = ephemeris.at("moon", store.jd);
            return {
              geocentric: moon,
              heliocentric: { p: add(earth.p, moon.p), v: add(earth.v, moon.v) },
              phase: lunarPhase(earth.p, moon.p),
            };
          })(),
        };
      },
    },
    {
      name: "set_orbital_epoch",
      description: "Pause and move the visible orbital dashboard to a UT date within 1900–2100.",
      inputSchema: {
        type: "object",
        properties: { dateUT: { type: "string" } },
        required: ["dateUT"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute(input) {
        if (!input || typeof input.dateUT !== "string")
          throw new Error("Use an ISO UT timestamp ending in Z.");
        setEpoch(parseEpoch(input.dateUT));
        return { epochUT: formatDate(store.jd), playing: store.playing };
      },
    },
  ];
  for (const tool of tools) {
    try {
      Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});
    } catch {}
  }
  window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
}
updateClock();
try {
  ephemeris = await loadEphemeris((progress) => ($("load-progress").value = progress));
  if (!window.p5) throw new Error("The local p5 renderer did not load.");
  celestialUI = setupCelestialUI(store, ephemeris, setEpoch);
  renderer = createRenderer($("scope"), store, ephemeris, updateReadouts, selectBody);
  lunarRenderer = createLunarRenderer($("lunar-orbit"), store, ephemeris);
  $("load-state").hidden = true;
  $("data-status").textContent = "EPHEMERIS ONLINE";
  document.querySelectorAll("button,input,select").forEach((el) => (el.disabled = false));
  updateView();
  registerAgentTools();
  const validation = await fetch("/ephemeris/validation.json")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  if (validation)
    $("validation-note").textContent =
      `Checked against ${validation.samples} independent JPL states. Largest observed interpolation residual: ${validation.maxPositionKm.toFixed(1)} km. Moon: ${validation.moonSamples} checks, up to ${validation.moonMaxPositionKm.toFixed(2)} km. These measure interpolation error, not total prediction uncertainty.`;
} catch (error) {
  $("load-state").replaceChildren();
  const message = document.createElement("p");
  message.textContent = error.message;
  const retry = document.createElement("button");
  retry.textContent = "RETRY LOADING";
  retry.onclick = () => location.reload();
  $("load-state").append(message, retry);
  $("data-status").textContent = "DATA UNAVAILABLE";
}
const source = new EventSource("/__events");
source.onmessage = () => location.reload();
window.addEventListener(
  "pagehide",
  () => {
    source.close();
    renderer?.destroy();
    lunarRenderer?.destroy();
  },
  { once: true },
);
