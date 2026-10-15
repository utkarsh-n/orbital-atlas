export const AU_KM = 149597870.7,
  DAY_SECONDS = 86400,
  YEAR_DAYS = 365.25;
export const SUN_GM = 132712440041.279419;
export const MIN_JD = 2415020.5,
  MAX_JD = 2488434.5 - 1 / 86400;
export const TAU = Math.PI * 2;
export const BODIES = [
  {
    id: "mercury",
    name: "Mercury",
    symbol: "☿",
    color: "#b4c4e1",
    size: 4,
    gm: 22031.868551,
    type: "Terrestrial planet",
    lane: 1.2,
  },
  {
    id: "venus",
    name: "Venus",
    symbol: "♀",
    color: "#e7c58c",
    size: 5,
    gm: 324858.592,
    type: "Terrestrial planet",
    lane: 1.85,
  },
  {
    id: "earth",
    name: "Earth",
    symbol: "⊕",
    color: "#72bdff",
    size: 5.5,
    gm: 398600.435507,
    type: "Terrestrial planet",
    lane: 2.5,
  },
  {
    id: "mars",
    name: "Mars",
    symbol: "♂",
    color: "#e68d72",
    size: 4.6,
    gm: 42828.375816,
    type: "Terrestrial planet",
    lane: 3.15,
  },
  {
    id: "jupiter",
    name: "Jupiter",
    symbol: "♃",
    color: "#dfa76f",
    size: 8,
    gm: 126712764.1,
    type: "Gas giant · system center",
    lane: 3.95,
  },
  {
    id: "saturn",
    name: "Saturn",
    symbol: "♄",
    color: "#d7cf93",
    size: 7,
    gm: 37940584.8418,
    type: "Gas giant · system center",
    lane: 4.75,
  },
  {
    id: "uranus",
    name: "Uranus",
    symbol: "♅",
    color: "#8ed4cc",
    size: 6,
    gm: 5794556.4,
    type: "Ice giant · system center",
    lane: 5.5,
  },
  {
    id: "neptune",
    name: "Neptune",
    symbol: "♆",
    color: "#929cff",
    size: 6,
    gm: 6836527.10058,
    type: "Ice giant · system center",
    lane: 6.2,
  },
  {
    id: "pluto",
    name: "Pluto",
    symbol: "♇",
    color: "#c79ef1",
    size: 3.6,
    gm: 975.5,
    type: "Dwarf planet · system center",
    lane: 7,
  },
];
export const MOON = { id: "moon", name: "Moon", gm: 4902.800118, color: "#cdd7ff" };
export const EARTH_GM = BODIES.find((b) => b.id === "earth").gm;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const norm = (v) => Math.hypot(...v);
export const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const scale = (a, k) => a.map((v) => v * k);
export const add = (a, b) => a.map((v, i) => v + b[i]);
export const jdFromDate = (date) => new Date(date).getTime() / 86400000 + 2440587.5;
export const dateFromJD = (jd) => new Date(Math.round((jd - 2440587.5) * 86400000));
export function parseEpoch(value) {
  if (
    typeof value !== "string" ||
    !/^(19\d{2}|20\d{2}|2100)-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/.test(value)
  )
    throw new RangeError("Use a valid UT date from 1900 through 2100.");
  const jd = jdFromDate(value),
    expected = value.slice(0, -1);
  if (
    !Number.isFinite(jd) ||
    jd < MIN_JD ||
    jd > MAX_JD ||
    new Date(value).toISOString().slice(0, expected.length) !== expected
  )
    throw new RangeError("Choose a valid date from 1900 through 2100.");
  return jd;
}

/** Hermite reconstruction of JPL states. Velocity is the derivative of this same curve. */
export function interpolate(meta, data, jd) {
  if (!Number.isFinite(jd) || jd < meta.startJD - 1e-9 || jd > meta.stopJD + 1e-9)
    throw new RangeError("Date outside this ephemeris.");
  const h = meta.stepDays,
    index = clamp(Math.floor((jd - meta.startJD) / h), 0, meta.count - 2),
    u = clamp((jd - meta.startJD - index * h) / h, 0, 1);
  const u2 = u * u,
    u3 = u2 * u,
    p = [],
    v = [];
  for (let k = 0; k < 3; k++) {
    const a = data[index * 6 + k],
      b = data[(index + 1) * 6 + k],
      va = data[index * 6 + k + 3],
      vb = data[(index + 1) * 6 + k + 3];
    p[k] =
      (2 * u3 - 3 * u2 + 1) * a +
      (u3 - 2 * u2 + u) * h * va +
      (-2 * u3 + 3 * u2) * b +
      (u3 - u2) * h * vb;
    v[k] =
      ((6 * u2 - 6 * u) * a +
        (3 * u2 - 4 * u + 1) * h * va +
        (-6 * u2 + 6 * u) * b +
        (3 * u2 - 2 * u) * h * vb) /
      h;
  }
  return { p, v };
}

/** Instantaneous osculating ellipse, used only as a guide, never to propagate the ephemeris. */
export function elements(state, body, centralGM = SUN_GM) {
  const r = norm(state.p),
    v2 = dot(state.v, state.v),
    mu = ((centralGM + body.gm) * DAY_SECONDS ** 2) / AU_KM ** 3;
  const h = cross(state.p, state.v),
    hUnit = scale(h, 1 / norm(h));
  const eVector = add(scale(cross(state.v, h), 1 / mu), scale(state.p, -1 / r));
  const e = norm(eVector),
    a = 1 / (2 / r - v2 / mu),
    pAxis = scale(eVector, 1 / e),
    qAxis = cross(hUnit, pAxis);
  const anomaly = (Math.atan2(dot(state.p, qAxis), dot(state.p, pAxis)) + TAU) % TAU;
  return {
    a,
    e,
    pAxis,
    qAxis,
    inclination: (Math.acos(clamp(hUnit[2], -1, 1)) * 180) / Math.PI,
    period: TAU * Math.sqrt(a ** 3 / mu),
    anomaly,
    perihelion: a * (1 - e),
    aphelion: a * (1 + e),
  };
}
export function ellipsePoint(el, E) {
  return add(
    scale(el.pAxis, el.a * (Math.cos(E) - el.e)),
    scale(el.qAxis, el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E)),
  );
}
export function displayPosition(p, body, el, spacing) {
  return scale(p, spacing === "atlas" ? body.lane / el.a : 7 / 45);
}
/** Geometric, Earth-centered phase. The longitude stage is not an almanac event solver. */
export function lunarPhase(earthPosition, moonRelativePosition) {
  const moonToSun = scale(add(earthPosition, moonRelativePosition), -1),
    moonToEarth = scale(moonRelativePosition, -1),
    cosPhase = clamp(dot(moonToSun, moonToEarth) / (norm(moonToSun) * norm(moonToEarth)), -1, 1),
    sunLongitude = Math.atan2(-earthPosition[1], -earthPosition[0]),
    moonLongitude = Math.atan2(moonRelativePosition[1], moonRelativePosition[0]),
    longitude = (((moonLongitude - sunLongitude) % TAU) + TAU) % TAU,
    degrees = (longitude * 180) / Math.PI,
    waxing = longitude < Math.PI;
  const primary = ["New Moon", "First Quarter", "Full Moon", "Last Quarter"],
    nearest = Math.round(degrees / 90),
    nearPrimary = Math.abs(degrees - nearest * 90) <= 4;
  return {
    illumination: (1 + cosPhase) / 2,
    cosPhase,
    waxing,
    longitudeDeg: degrees,
    elongationDeg:
      (Math.acos(
        clamp(
          dot(scale(earthPosition, -1), moonRelativePosition) /
            (norm(earthPosition) * norm(moonRelativePosition)),
          -1,
          1,
        ),
      ) *
        180) /
      Math.PI,
    distanceKm: norm(moonRelativePosition) * AU_KM,
    name: nearPrimary
      ? primary[nearest % 4]
      : degrees < 90
        ? "Waxing Crescent"
        : degrees < 180
          ? "Waxing Gibbous"
          : degrees < 270
            ? "Waning Gibbous"
            : "Waning Crescent",
  };
}
/** Orthographic spherical terminator; polygon area / pi equals illuminated fraction. */
export function phaseOutline(cosPhase, waxing, steps = 96) {
  const c = clamp(cosPhase, -1, 1),
    points = [];
  for (let i = 0; i <= steps; i++) {
    const angle = -Math.PI / 2 + (i / steps) * Math.PI,
      y = Math.sin(angle),
      q = Math.cos(angle);
    points.push([waxing ? -c * q : -q, y]);
  }
  for (let i = steps; i >= 0; i--) {
    const angle = -Math.PI / 2 + (i / steps) * Math.PI,
      y = Math.sin(angle),
      q = Math.cos(angle);
    points.push([waxing ? q : c * q, y]);
  }
  return points;
}
export function rotate(p, yaw, pitch) {
  const a = (yaw * Math.PI) / 180,
    b = (pitch * Math.PI) / 180,
    x = p[0] * Math.cos(a) - p[1] * Math.sin(a),
    y = p[0] * Math.sin(a) + p[1] * Math.cos(a);
  return [x, y * Math.cos(b) - p[2] * Math.sin(b), y * Math.sin(b) + p[2] * Math.cos(b)];
}
export function worldline(p, t, lens) {
  if (lens === "4d") {
    const a = 0.62;
    return [
      p[0] * Math.cos(a) + t * 7 * Math.sin(a),
      p[1],
      p[2] * Math.cos(a) - t * 7 * Math.sin(a),
    ];
  }
  const u = (p[0] - p[2]) / Math.sqrt(2) / 9,
    v = (p[0] + 2 * p[1] + p[2]) / Math.sqrt(6) / 9;
  if (lens === "cylinder") return [t * 7, u * 3.2, v * 3.2];
  const theta = Math.PI / 2 - t * (Math.PI - 0.11),
    rad = 4.7 + u * 0.9;
  return [rad * Math.cos(theta), rad * Math.sin(theta), v * 1.5];
}
/** Full enclosing-volume support, so camera rotation cannot clip normal-zoom traces. */
export function timeViewBounds(lens, yaw, pitch, radius = 10.5) {
  if (lens === "torus") {
    const r = 4.7 + (radius / 9) * 0.9,
      z = (radius / 9) * 1.5;
    const points = Array.from({ length: 97 }, (_, i) =>
      [-z, z].map((height) =>
        rotate([r * Math.cos((i / 96) * TAU), r * Math.sin((i / 96) * TAU), height], yaw, pitch),
      ),
    ).flat();
    return [
      Math.max(...points.map((p) => Math.abs(p[0]))),
      Math.max(...points.map((p) => Math.abs(p[1]))),
    ];
  }
  const origin = worldline([0, 0, 0], 0, lens),
    t = rotate(worldline([0, 0, 0], 1, lens), yaw, pitch);
  const basis = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ].map((v) =>
    rotate(
      worldline(v, 0, lens).map((n, i) => n - origin[i]),
      yaw,
      pitch,
    ),
  );
  return [0, 1].map((i) => radius * Math.hypot(...basis.map((v) => v[i])) + Math.abs(t[i]));
}
export async function loadEphemeris(progress = () => {}) {
  const response = await fetch("/ephemeris/manifest.json");
  if (!response.ok) throw new Error("Ephemeris manifest unavailable.");
  const metadata = await response.json(),
    cache = new Map();
  let done = 0;
  await Promise.all(
    [...BODIES, MOON].map(async (body) => {
      const meta = metadata[body.id];
      if (!meta) throw new Error(`Missing ${body.name} data.`);
      const r = await fetch(meta.file);
      if (!r.ok) throw new Error(`${body.name} data unavailable.`);
      const buf = await r.arrayBuffer();
      if (buf.byteLength !== meta.count * 48) throw new Error(`${body.name} data incomplete.`);
      cache.set(body.id, { meta, data: new Float64Array(buf) });
      progress(++done / (BODIES.length + 1));
    }),
  );
  return {
    metadata,
    at(id, jd) {
      const c = cache.get(id);
      if (!c) throw new Error("Unknown body.");
      return interpolate(c.meta, c.data, jd);
    },
  };
}
