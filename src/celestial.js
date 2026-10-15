import { MIN_JD, MAX_JD, TAU, scale, norm, jdFromDate, clamp } from "./physics.js";
import { toDateEcliptic, lahiriAyanamsa } from "./zodiac-math.js";
export const wrap = (degrees) => ((degrees % 360) + 360) % 360;
export const ZODIAC = [
  ["Aries", "Mesha", "♈︎"],
  ["Taurus", "Vrishabha", "♉︎"],
  ["Gemini", "Mithuna", "♊︎"],
  ["Cancer", "Karka", "♋︎"],
  ["Leo", "Simha", "♌︎"],
  ["Virgo", "Kanya", "♍︎"],
  ["Libra", "Tula", "♎︎"],
  ["Scorpio", "Vrishchika", "♏︎"],
  ["Sagittarius", "Dhanu", "♐︎"],
  ["Capricorn", "Makara", "♑︎"],
  ["Aquarius", "Kumbha", "♒︎"],
  ["Pisces", "Mina", "♓︎"],
];
export const NAKSHATRAS = [
  "Ashvini",
  "Bharani",
  "Krittika",
  "Rohini",
  "Mrigashirsha",
  "Ardra",
  "Punarvasu",
  "Pushya",
  "Ashlesha",
  "Magha",
  "Purva Phalguni",
  "Uttara Phalguni",
  "Hasta",
  "Chitra",
  "Svati",
  "Vishakha",
  "Anuradha",
  "Jyeshtha",
  "Mula",
  "Purva Ashadha",
  "Uttara Ashadha",
  "Shravana",
  "Dhanishtha",
  "Shatabhisha",
  "Purva Bhadrapada",
  "Uttara Bhadrapada",
  "Revati",
];
export const TITHIS = [
  "Pratipada",
  "Dvitiya",
  "Tritiya",
  "Chaturthi",
  "Panchami",
  "Shashthi",
  "Saptami",
  "Ashtami",
  "Navami",
  "Dashami",
  "Ekadashi",
  "Dvadashi",
  "Trayodashi",
  "Chaturdashi",
];
export const PEOPLE = [
  { id: "sample-a", name: "Sample A", date: "2000-01-01", offset: "+05:30", color: "#7fffd4" },
  { id: "sample-b", name: "Sample B", date: "2001-07-01", offset: "-06:00", color: "#ff9fc6" },
];
export function longitude(vector, jd, system = "tropical") {
  const v = toDateEcliptic(vector, jd);
  return wrap(
    (Math.atan2(v[1], v[0]) * 180) / Math.PI - (system === "sidereal" ? lahiriAyanamsa(jd) : 0),
  );
}
export function signAt(degrees) {
  const value = wrap(degrees),
    index = Math.floor(value / 30);
  return {
    index,
    name: ZODIAC[index][0],
    rashi: ZODIAC[index][1],
    symbol: ZODIAC[index][2],
    degrees: value % 30,
  };
}
export function signLabel(degrees, sidereal = false) {
  const sign = signAt(degrees);
  return `${sign.symbol} ${sidereal ? sign.rashi : sign.name} ${sign.degrees.toFixed(1)}°`;
}
export function calendarAt(ephemeris, jd) {
  const earth = ephemeris.at("earth", jd),
    moon = ephemeris.at("moon", jd),
    sunTropical = longitude(scale(earth.p, -1), jd),
    moonTropical = longitude(moon.p, jd),
    ayanamsa = lahiriAyanamsa(jd),
    sunSidereal = wrap(sunTropical - ayanamsa),
    moonSidereal = wrap(moonTropical - ayanamsa),
    elongation = wrap(moonTropical - sunTropical),
    tithi = Math.floor(elongation / 12) + 1,
    nakshatra = Math.floor(moonSidereal / (360 / 27)),
    pada = Math.floor((moonSidereal % (360 / 27)) / (360 / 108)) + 1,
    paksha = tithi <= 15 ? "Shukla" : "Krishna",
    day = (tithi - 1) % 15,
    tithiName = tithi === 15 ? "Purnima" : tithi === 30 ? "Amavasya" : TITHIS[day];
  return {
    sunTropical,
    moonTropical,
    sunSidereal,
    moonSidereal,
    elongation,
    ayanamsa,
    tithi,
    paksha,
    tithiName,
    tithiLabel: `${paksha} ${tithiName}`,
    nakshatra,
    nakshatraName: NAKSHATRAS[nakshatra],
    pada,
  };
}
export function birthJD(person, time) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new RangeError("Enter a valid local birth time.");
  return jdFromDate(`${person.date}T${time}:00${person.offset}`);
}
export function birthAnchor(person, time, ephemeris) {
  const jd = birthJD(person, time),
    p = scale(ephemeris.at("earth", jd).p, -1);
  return { ...person, jd, position: scale(p, 8.35 / norm(p)) };
}
export function birthUncertainty(person, ephemeris) {
  const jd = birthJD(person, "00:00"),
    moonSigns = new Set(),
    mansions = new Set();
  for (let i = 0; i < 49; i++) {
    const sky = calendarAt(ephemeris, jd + Math.min(i / 48, 1 - 1 / 86400));
    moonSigns.add(signAt(sky.moonSidereal).rashi);
    mansions.add(sky.nakshatraName);
  }
  return { moonSigns: [...moonSigns], nakshatras: [...mansions] };
}
/** Solve a forward-moving angular crossing; geometric mean events, not apparent almanac instants. */
export function findEvent(ephemeris, jd, kind, direction = 1, system = "sidereal") {
  if (!["new", "full", "ingress"].includes(kind) || ![1, -1].includes(direction))
    throw new RangeError("Unknown cycle event.");
  const angleAt = (date) => {
    const sky = calendarAt(ephemeris, date);
    return kind === "ingress"
      ? system === "sidereal"
        ? sky.sunSidereal
        : sky.sunTropical
      : sky.elongation;
  };
  const initial = angleAt(jd),
    step = kind === "ingress" ? 1 : 0.5,
    target =
      kind === "ingress"
        ? wrap((direction > 0 ? Math.floor(initial / 30) + 1 : Math.ceil(initial / 30) - 1) * 30)
        : kind === "full"
          ? 180
          : 0;
  let remaining = direction > 0 ? wrap(target - initial) : wrap(initial - target);
  if (remaining < 1e-7) remaining = kind === "ingress" ? 30 : 360;
  let previousJD = jd,
    previousAngle = initial,
    traveled = 0;
  for (let i = 0; i < 80; i++) {
    const nextJD = clamp(previousJD + direction * step, MIN_JD, MAX_JD);
    if (nextJD === previousJD) return null;
    const angle = angleAt(nextJD),
      arc = direction > 0 ? wrap(angle - previousAngle) : wrap(previousAngle - angle);
    if (traveled + arc >= remaining) {
      let low = previousJD,
        high = nextJD;
      const needed = remaining - traveled;
      for (let k = 0; k < 35; k++) {
        const mid = (low + high) / 2,
          midAngle = angleAt(mid),
          delta = direction > 0 ? wrap(midAngle - previousAngle) : wrap(previousAngle - midAngle);
        if (delta < needed) low = mid;
        else high = mid;
      }
      return (low + high) / 2;
    }
    traveled += arc;
    previousJD = nextJD;
    previousAngle = angle;
  }
  return null;
}
export const KALI_EPOCH_JD = 588465.2708333334;
export const COSMIC_YEAR_DAYS = 365.25;
export const YUGAS = [
  { id: "satya", name: "Satya Yuga", start: -3888000, duration: 1728000, color: "#6c79b8" },
  { id: "treta", name: "Treta Yuga", start: -2160000, duration: 1296000, color: "#886bab" },
  { id: "dvapara", name: "Dvapara Yuga", start: -864000, duration: 864000, color: "#a267a2" },
  { id: "kali", name: "Kali Yuga", start: 0, duration: 432000, color: "#b56c86" },
];
export const CYCLES = [
  ...YUGAS,
  {
    id: "mahayuga",
    name: "Current Mahayuga",
    start: -3888000,
    duration: 4320000,
    color: "#795794",
  },
  {
    id: "manvantara",
    name: "Vaivasvata Manvantara",
    start: -120528000,
    duration: 306720000,
    color: "#725c91",
  },
  {
    id: "kalpa",
    name: "Current Kalpa",
    start: -1972944000,
    duration: 4320000000,
    color: "#70568f",
  },
];
export const cosmicYearsAt = (jd) => (jd - KALI_EPOCH_JD) / COSMIC_YEAR_DAYS;
export function cosmicYearLabel(offset) {
  const year = Math.floor(-3101 + offset);
  return `≈ ${Math.abs(year <= 0 ? 1 - year : year).toLocaleString("en-US")} ${year <= 0 ? "BCE" : "CE"}`;
}
export function cosmicSegments(cycle) {
  if (YUGAS.some((y) => y.id === cycle.id)) return [{ ...cycle, label: cycle.name }];
  if (cycle.id === "mahayuga") return YUGAS.map((y) => ({ ...y, label: y.name }));
  if (cycle.id === "manvantara")
    return Array.from({ length: 71 }, (_, i) => ({
      duration: 4320000,
      name: `Mahayuga ${i + 1}`,
      label: [0, 13, 27, 41, 55, 70].includes(i) ? String(i + 1) : "",
      color: i === 27 ? "#b48ec2" : i % 2 ? "#4b3a65" : "#69517d",
    }));
  const parts = [{ duration: 1728000, name: "Opening sandhya", label: "", color: "#292a43" }];
  for (let i = 0; i < 14; i++)
    parts.push(
      {
        duration: 306720000,
        name: `Manvantara ${i + 1}`,
        label: String(i + 1),
        color: i === 6 ? "#b08aca" : i % 2 ? "#584474" : "#735889",
      },
      { duration: 1728000, name: "Sandhya", label: "", color: "#292a43" },
    );
  return parts;
}
export function cosmicEraAt(offset) {
  const kalpa = CYCLES.find((c) => c.id === "kalpa"),
    sandhya = 1728000;
  let within = (((offset - kalpa.start) % kalpa.duration) + kalpa.duration) % kalpa.duration;
  if (within < sandhya) return "Opening sandhya";
  within -= sandhya;
  for (let i = 0; i < 14; i++) {
    if (within < 306720000) {
      const phase = within % 4320000;
      const yuga = YUGAS.find((y) => phase < y.start + 3888000 + y.duration);
      return `${yuga.name} · Manvantara ${i + 1}`;
    }
    within -= 306720000;
    if (within < sandhya) return `Sandhya after Manvantara ${i + 1}`;
    within -= sandhya;
  }
  return "Kalpa boundary";
}
