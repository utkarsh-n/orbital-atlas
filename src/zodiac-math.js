/**
 * IAU 2006 ecliptic-of-date transforms for JPL's ICRF/ECLIPTIC J2000 vectors.
 * This work uses routines and computations derived from IAU SOFA under license;
 * it is not software provided by or endorsed by SOFA. See SOFA-LICENSE.txt.
 * Adapted from SOFA 2023-10-11 iauPfw06, iauPmat06, iauEcm06 and iauP06e:
 * rewritten in JavaScript as direct active vector rotations; inverse added;
 * the final obliquity rotations cancel algebraically in the ecliptic transform.
 * JPL's specific IAU76 84381.448 arcsec tilt is removed first.
 *
 * jd is TT in the formal IAU model. For this dashboard's 1900-2100 UT clock,
 * using UT directly changes precession by far below 0.001 arcsec. Nutation,
 * light-time and aberration are intentionally absent: GEOMETRIC MEAN longitudes.
 */
const DEG = Math.PI / 180,
  AS = DEG / 3600;
const JPL_OBLIQUITY = 84381.448 * AS;
const wrap = (x) => ((x % 360) + 360) % 360;
const rx = ([x, y, z], a) => [
  x,
  Math.cos(a) * y - Math.sin(a) * z,
  Math.sin(a) * y + Math.cos(a) * z,
];
const rz = ([x, y, z], a) => [
  Math.cos(a) * x - Math.sin(a) * y,
  Math.sin(a) * x + Math.cos(a) * y,
  z,
];
function fw(jd) {
  const t = (jd - 2451545) / 36525;
  const gamma =
    (-0.052928 +
      (10.556378 + (0.4932044 + (-0.00031238 + (-0.000002788 + 0.000000026 * t) * t) * t) * t) *
        t) *
    AS;
  const phi =
    (84381.412819 +
      (-46.811016 + (0.0511268 + (0.00053289 + (-0.00000044 - 0.0000000176 * t) * t) * t) * t) *
        t) *
    AS;
  const psi =
    (-0.041775 +
      (5038.481484 + (1.5584175 + (-0.00018522 + (-0.000026452 - 0.0000000148 * t) * t) * t) * t) *
        t) *
    AS;
  return { gamma, phi, psi };
}
export function toDateEcliptic(vector, jd) {
  const { gamma, phi, psi } = fw(jd);
  return rz(rx(rz(rx(vector, JPL_OBLIQUITY), -gamma), -phi), psi);
}
export function fromDateEcliptic(vector, jd) {
  const { gamma, phi, psi } = fw(jd);
  return rx(rz(rx(rz(vector, -psi), phi), gamma), -JPL_OBLIQUITY);
}
/** Mean Lahiri-style convention anchored to IMD IAE2026 p419 J2000 value.
 * IAU2006 drift differs by ~0.13 arcsec from IMD's printed 2026.0 mean value.
 * Different ayanamsa traditions exist; no convention is uniquely physical.
 */
export function lahiriAyanamsa(jd) {
  const t = (jd - 2451545) / 36525;
  const p =
    (5028.796195 + (1.1054348 + (0.00007964 + (-0.000023857 - 0.0000000383 * t) * t) * t) * t) * t;
  return 23 + 51 / 60 + 25.53 / 3600 + p / 3600;
}
export function meanLongitude(vector, jd, system = "tropical") {
  const v = toDateEcliptic(vector, jd);
  return wrap(Math.atan2(v[1], v[0]) / DEG - (system === "sidereal" ? lahiriAyanamsa(jd) : 0));
}
/** A ring direction in the existing physical J2000 plot, from sign longitude. */
export function zodiacDirection(longitude, jd, system = "tropical") {
  const a = (longitude + (system === "sidereal" ? lahiriAyanamsa(jd) : 0)) * DEG;
  return fromDateEcliptic([Math.cos(a), Math.sin(a), 0], jd);
}
