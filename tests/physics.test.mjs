import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BODIES,
  MOON,
  EARTH_GM,
  add,
  lunarPhase,
  phaseOutline,
  AU_KM,
  DAY_SECONDS,
  MIN_JD,
  MAX_JD,
  TAU,
  interpolate,
  elements,
  ellipsePoint,
  displayPosition,
  rotate,
  worldline,
  timeViewBounds,
  norm,
  dot,
  cross,
  jdFromDate,
  dateFromJD,
  parseEpoch,
} from "../src/physics.js";
const json = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const metadata = json("../public/ephemeris/manifest.json");
const cache = new Map(
  [...BODIES, MOON].map((b) => {
    const buf = readFileSync(new URL(`../public/ephemeris/${b.id}.bin`, import.meta.url));
    return [
      b.id,
      new Float64Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
    ];
  }),
);
const at = (id, jd) => interpolate(metadata[id], cache.get(id), jd);
const dist = (a, b) => norm(a.map((v, i) => v - b[i]));
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("all ten datasets cover the product range, retain Float64 values, and contain only finite states", () => {
  for (const body of [...BODIES, MOON]) {
    const m = metadata[body.id],
      d = cache.get(body.id);
    assert.equal(d.length, m.count * 6);
    assert.ok(m.startJD <= MIN_JD && m.stopJD >= MAX_JD);
    assert.ok(d.every(Number.isFinite));
    assert.equal(m.timeScale, "UT");
    for (const jd of [MIN_JD, MAX_JD]) assert.ok(at(body.id, jd).p.every(Number.isFinite));
  }
});
test("Hermite reproduces all checked sample positions and endpoint derivatives exactly", () => {
  for (const body of [...BODIES, MOON]) {
    const m = metadata[body.id],
      d = cache.get(body.id);
    for (const i of [0, 1, 123, Math.floor(m.count / 2), m.count - 1]) {
      const s = at(body.id, m.startJD + i * m.stepDays);
      for (let k = 0; k < 3; k++) {
        near(s.p[k], d[i * 6 + k]);
        near(s.v[k], d[i * 6 + k + 3]);
      }
    }
  }
});
test("interpolated velocity is the derivative of the position polynomial", () => {
  for (const b of BODIES) {
    const m = metadata[b.id],
      jd = m.startJD + 121.37 * m.stepDays,
      e = 0.001,
      s = at(b.id, jd),
      a = at(b.id, jd - e),
      z = at(b.id, jd + e);
    s.v.forEach((v, i) => near(v, (z.p[i] - a.p[i]) / (2 * e), 2e-8));
  }
});
for (const body of BODIES)
  test(`${body.name}: 60 independent off-grid JPL references remain within measured interpolation tolerances`, () => {
    const fixture = json(`./${body.id}-fixtures.json`);
    let maxP = 0,
      maxV = 0;
    for (const sample of fixture.samples) {
      const s = at(body.id, sample.jd);
      maxP = Math.max(maxP, dist(s.p, sample.expected.slice(0, 3)) * AU_KM);
      maxV = Math.max(maxV, ((dist(s.v, sample.expected.slice(3)) * AU_KM) / DAY_SECONDS) * 1000);
    }
    assert.equal(fixture.samples.length, 60);
    assert.ok(maxP < fixture.summary.all.maxPositionKm * 1.002 + 0.001);
    assert.ok(maxV < fixture.summary.all.maxVelocityMps * 1.002 + 0.001);
  });
test("Moon: 232 independent JPL states validate Earth-centered interpolation", () => {
  const f = json("./moon-fixtures.json");
  let maxP = 0,
    maxV = 0;
  for (const row of f.samples) {
    const s = at("moon", row.jd);
    maxP = Math.max(maxP, dist(s.p, row.expected.slice(0, 3)) * AU_KM);
    maxV = Math.max(maxV, ((dist(s.v, row.expected.slice(3)) * AU_KM) / DAY_SECONDS) * 1000);
  }
  assert.equal(f.samples.length, 232);
  assert.ok(maxP < 0.92);
  assert.ok(maxV < 0.076);
});
test("Moon guide uses Earth gravity and retains the true relative position", () => {
  for (const jd of [MIN_JD, 2451545, 2461315.5, MAX_JD]) {
    const s = at("moon", jd),
      el = elements(s, MOON, EARTH_GM);
    assert.ok(el.period > 26 && el.period < 29);
    assert.ok(el.inclination > 4 && el.inclination < 7);
    assert.ok(el.e > 0.02 && el.e < 0.09);
    const E = Math.atan2(
      dot(s.p, el.qAxis) / (el.a * Math.sqrt(1 - el.e ** 2)),
      dot(s.p, el.pAxis) / el.a + el.e,
    );
    near(dist(s.p, ellipsePoint(el, E)), 0, 1e-12);
    const solar = add(at("earth", jd).p, s.p);
    near(dist(solar, at("earth", jd).p) * AU_KM, norm(s.p) * AU_KM, 1e-7);
  }
});
test("Geometric Moon phase agrees with 12 independently published USNO phase events", () => {
  const checks = json("./moon-phase-checks.json");
  assert.equal(checks.examples.length, 12);
  for (const event of checks.examples) {
    const phase = lunarPhase(at("earth", event.jd).p, at("moon", event.jd).p);
    assert.equal(phase.name, event.phase);
    near(phase.illumination, event.illumination, 2e-5);
    near(phase.longitudeDeg, event.longitudeDifferenceDeg, 0.015);
    if (event.phase === "Full Moon") assert.ok(phase.illumination > 0.997);
    if (event.phase === "New Moon") assert.ok(phase.illumination < 0.003);
  }
});
test("Phase disk lit area matches spherical illumination on both halves of the cycle", () => {
  for (const waxing of [true, false])
    for (const c of [-1, -0.75, -0.2, 0, 0.2, 0.75, 1]) {
      const points = phaseOutline(c, waxing);
      const area =
        Math.abs(
          points.reduce((sum, p, i) => {
            const q = points[(i + 1) % points.length];
            return sum + p[0] * q[1] - q[0] * p[1];
          }, 0),
        ) / 2;
      near(area / Math.PI, (1 + c) / 2, 0.0002);
      for (const p of points) assert.ok(norm(p) <= 1.0000001);
    }
});
test("Lunar phase is continuous, bounded and follows the shared timeline", () => {
  for (let jd = 2461315.5; jd < 2461350.5; jd += 0.25) {
    const a = lunarPhase(at("earth", jd).p, at("moon", jd).p);
    const b = lunarPhase(at("earth", jd + 0.001).p, at("moon", jd + 0.001).p);
    assert.ok(a.illumination >= 0 && a.illumination <= 1);
    assert.ok(Math.abs(a.illumination - b.illumination) < 0.001);
    assert.ok(a.distanceKm > 350000 && a.distanceKm < 410000);
    assert.ok(a.elongationDeg >= 0 && a.elongationDeg <= 180);
  }
});
test("osculating guides retain focus, eccentricity, inclination and current ephemeris position", () => {
  for (const b of BODIES)
    for (const jd of [MIN_JD, 2451545, 2461315.5, MAX_JD]) {
      const s = at(b.id, jd),
        el = elements(s, b);
      assert.ok(el.a > 0 && el.e > 0 && el.e < 1);
      near(norm(el.pAxis), 1);
      near(norm(el.qAxis), 1);
      near(dot(el.pAxis, el.qAxis), 0);
      near(norm(ellipsePoint(el, 0)), el.perihelion);
      near(norm(ellipsePoint(el, Math.PI)), el.aphelion);
      const E = Math.atan2(
        dot(s.p, el.qAxis) / (el.a * Math.sqrt(1 - el.e ** 2)),
        dot(s.p, el.pAxis) / el.a + el.e,
      );
      near(dist(s.p, ellipsePoint(el, E)), 0, 1e-8);
      near(dist(ellipsePoint(el, 0), ellipsePoint(el, TAU)), 0);
    }
});
test("display spacing does not mutate physical coordinates or phase, and True AU uses one common scale", () => {
  for (const b of BODIES) {
    const s = at(b.id, 2451545),
      before = JSON.stringify(s),
      el = elements(s, b),
      atlas = displayPosition(s.p, b, el, "atlas"),
      trueAU = displayPosition(s.p, b, el, "true");
    near(norm(cross(atlas, s.p)), 0, 1e-8);
    near(norm(trueAU) / norm(s.p), 7 / 45);
    assert.equal(JSON.stringify(s), before);
  }
});
test("camera rotations preserve lengths and every time lens remains finite at its endpoints", () => {
  for (const b of BODIES) {
    const s = at(b.id, 2451545),
      el = elements(s, b),
      p = displayPosition(s.p, b, el, "atlas");
    for (const yaw of [-720, -90, 0, 135, 370])
      for (const pitch of [-85, 0, 48, 85]) near(norm(rotate(p, yaw, pitch)), norm(p));
    for (const lens of ["4d", "cylinder", "torus"])
      for (const t of [-1, 0, 1]) assert.ok(worldline(p, t, lens).every(Number.isFinite));
  }
});
test("date parsing rejects invalid calendar dates and unsupported dates instead of inventing positions", () => {
  for (const date of [
    "1900-01-01T00:00Z",
    "2000-02-29T12:17:30Z",
    "2026-10-02T21:42Z",
    "2100-12-31T23:59:59Z",
  ])
    near(parseEpoch(date), jdFromDate(date));
  for (const date of [
    "1899-12-31T23:59Z",
    "2101-01-01T00:00Z",
    "1900-02-29T00:00Z",
    "2026-02-30T00:00Z",
    "2026-13-01T00:00Z",
    "bad",
  ])
    assert.throws(() => parseEpoch(date), RangeError);
  near(jdFromDate("2000-01-01T12:00:00Z"), 2451545);
  assert.equal(dateFromJD(MIN_JD).toISOString(), "1900-01-01T00:00:00.000Z");
  assert.throws(() => at("earth", MIN_JD - 1), RangeError);
  assert.throws(() => at("earth", NaN), RangeError);
});
test("time-lens framing encloses rotated trajectories at extreme tilts and both window ends", () => {
  for (const lens of ["4d", "cylinder", "torus"])
    for (let yaw = -180; yaw < 180; yaw += 30)
      for (const pitch of [-85, -25, 0, 48, 85]) {
        const bounds = timeViewBounds(lens, yaw, pitch);
        for (const body of BODIES)
          for (const jd of [2451545, 2461315.5, 2474034.21927726]) {
            const el = elements(at(body.id, jd), body);
            for (const dt of [-14610, -2000, 0, 2000, 14610]) {
              const t = Math.max(MIN_JD, Math.min(MAX_JD, jd + dt)),
                spatial = displayPosition(at(body.id, t).p, body, el, "atlas"),
                v = rotate(worldline(spatial, dt / 14610, lens), yaw, pitch);
              assert.ok(Math.abs(v[0]) <= bounds[0] + 1e-6, `${body.id} ${lens} x`);
              assert.ok(Math.abs(v[1]) <= bounds[1] + 1e-6, `${body.id} ${lens} y`);
            }
          }
      }
});
