import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { interpolate, jdFromDate, MIN_JD, MAX_JD, norm } from "../src/physics.js";
import {
  toDateEcliptic,
  fromDateEcliptic,
  lahiriAyanamsa,
  zodiacDirection,
} from "../src/zodiac-math.js";
import {
  calendarAt,
  longitude,
  signAt,
  findEvent,
  PEOPLE,
  birthJD,
  birthAnchor,
  birthUncertainty,
  CYCLES,
  cosmicSegments,
  KALI_EPOCH_JD,
  cosmicYearsAt,
  cosmicYearLabel,
  cosmicEraAt,
} from "../src/celestial.js";
const json = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const meta = json("../public/ephemeris/manifest.json"),
  cache = new Map(
    ["earth", "moon"].map((id) => {
      const b = readFileSync(new URL(`../public/ephemeris/${id}.bin`, import.meta.url));
      return [id, new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))];
    }),
  );
const eph = { at: (id, jd) => interpolate(meta[id], cache.get(id), jd) };
const near = (a, b, e = 1e-8) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);
const refs = json("./zodiac-references.json"),
  hindu = json("./hindu-references.json");
test("IAU2006 transforms match independent official SOFA C vectors and invert", () => {
  for (const row of refs.frameSamples) {
    const actual = toDateEcliptic(row.input, row.jd);
    actual.forEach((v, i) => near(v, row.output[i], 1e-14));
    fromDateEcliptic(actual, row.jd).forEach((v, i) => near(v, row.input[i], 1e-14));
  }
  near(lahiriAyanamsa(2451545), 23 + 51 / 60 + 25.53 / 3600, 1e-12);
  near(lahiriAyanamsa(jdFromDate("2026-01-01T00:00:00Z")), 24 + 13 / 60 + 12.96 / 3600, 0.2 / 3600);
});
test("Zodiac ring directions retain their selected geocentric angular labels across centuries", () => {
  for (const jd of [MIN_JD, 2451545, MAX_JD])
    for (const system of ["tropical", "sidereal"])
      for (let angle = 15; angle < 360; angle += 30) {
        const v = zodiacDirection(angle, jd, system);
        near(norm(v), 1, 1e-12);
        near(longitude(v, jd, system), angle, 1e-10);
      }
});
test("Birth time zones, solar signs and unknown-time lunar ranges are explicit", () => {
  assert.equal(birthJD(PEOPLE[0], "12:00"), jdFromDate("2000-01-01T06:30:00Z"));
  assert.equal(birthJD(PEOPLE[1], "12:00"), jdFromDate("2001-07-01T18:00:00Z"));
  for (const [i, person] of PEOPLE.entries()) {
    const c = calendarAt(eph, birthJD(person, "12:00"));
    assert.equal(signAt(c.sunTropical).name, i === 0 ? "Capricorn" : "Cancer");
    assert.ok(birthAnchor(person, "12:00", eph).position.every(Number.isFinite));
    const uncertainty = birthUncertainty(person, eph);
    assert.ok(uncertainty.moonSigns.length >= 1 && uncertainty.moonSigns.length <= 2);
    assert.ok(uncertainty.nakshatras.length >= 1 && uncertainty.nakshatras.length <= 3);
  }
  assert.throws(() => birthJD(PEOPLE[0], "25:00"), RangeError);
});
test("Tithi and solar ingress events agree with government almanac examples within the documented geometric convention", () => {
  for (const event of hindu.events) {
    const target = jdFromDate(event.dateUT),
      kind = event.kind === "fullMoon" ? "full" : event.kind === "newMoon" ? "new" : "ingress";
    const result = findEvent(eph, target - 1, kind, 1, "sidereal");
    assert.ok(result !== null);
    near(result, target, 15 / 1440);
    const c = calendarAt(eph, result),
      angle = kind === "ingress" ? c.sunSidereal : c.elongation;
    near(
      Math.abs(
        Math.sin(((angle - (event.expectedElongationDeg ?? event.longitudeDeg)) * Math.PI) / 180),
      ),
      0,
      1e-6,
    );
  }
});
test("Lunar event navigation is strictly directional and never extrapolates beyond the ephemeris", () => {
  const jd = jdFromDate("2026-10-02T12:00:00Z"),
    a = findEvent(eph, jd, "new", -1),
    b = findEvent(eph, jd, "new", 1);
  assert.ok(a < jd && b > jd && b - a > 28 && b - a < 31);
  assert.equal(findEvent(eph, MIN_JD, "new", -1), null);
  assert.equal(findEvent(eph, MAX_JD, "ingress", 1), null);
  for (const t of [MIN_JD, jd, MAX_JD]) {
    const c = calendarAt(eph, t);
    assert.ok(c.tithi >= 1 && c.tithi <= 30);
    assert.ok(c.nakshatra >= 0 && c.nakshatra < 27);
    assert.ok(c.pada >= 1 && c.pada <= 4);
  }
});
test("Traditional cycle bands include sandhyas and close to their declared periods", () => {
  for (const cycle of CYCLES) {
    assert.equal(
      cosmicSegments(cycle).reduce((sum, p) => sum + p.duration, 0),
      cycle.duration,
    );
  }
  assert.equal(cosmicEraAt(-1972944000), "Opening sandhya");
  assert.equal(cosmicEraAt(0), "Kali Yuga · Manvantara 7");
  near(KALI_EPOCH_JD, hindu.kaliEpoch.julianDayUT, 1e-12);
  near(cosmicYearsAt(KALI_EPOCH_JD), 0);
  assert.equal(cosmicYearLabel(0), "≈ 3,102 BCE");
  assert.equal(cosmicYearLabel(432000), "≈ 428,899 CE");
});
