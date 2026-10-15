import { dateFromJD, clamp } from "./physics.js";
import {
  PEOPLE,
  calendarAt,
  signLabel,
  birthJD,
  birthUncertainty,
  findEvent,
  CYCLES,
  cosmicYearsAt,
  cosmicYearLabel,
  cosmicSegments,
  cosmicEraAt,
} from "./celestial.js";
const $ = (id) => document.getElementById(id);
const formatDate = (jd) => dateFromJD(jd).toISOString().slice(0, 16).replace("T", " ") + " UT";
const svgNS = "http://www.w3.org/2000/svg";
function arc(radius, degrees) {
  const angle = (Math.min(359.999, Math.max(0.001, degrees)) * Math.PI) / 180,
    x = 160 + radius * Math.sin(angle),
    y = 160 - radius * Math.cos(angle);
  return {
    x,
    y,
    path: `M 160 ${160 - radius} A ${radius} ${radius} 0 ${degrees > 180 ? 1 : 0} 1 ${x} ${y}`,
  };
}
export function setupCelestialUI(store, ephemeris, setEpoch) {
  let lastBirthKey = "",
    currentCycle = CYCLES.find((c) => c.id === "kali"),
    linked = true,
    offset = cosmicYearsAt(store.jd);
  const uncertainties = new Map(PEOPLE.map((p) => [p.id, birthUncertainty(p, ephemeris)]));
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2,
      line = document.createElementNS(svgNS, "line");
    for (const [key, value] of Object.entries({
      x1: 160 + Math.sin(a) * 125,
      y1: 160 - Math.cos(a) * 125,
      x2: 160 + Math.sin(a) * 133,
      y2: 160 - Math.cos(a) * 133,
      stroke: i % 5 === 0 ? "#a698c6" : "#465574",
      "stroke-width": i % 5 === 0 ? 2 : 1,
    }))
      line.setAttribute(key, String(value));
    $("cycle-ticks").append(line);
  }
  function showTab(id) {
    document.querySelectorAll("[data-cosmic-tab]").forEach((button) => {
      const active = button.dataset.cosmicTab === id;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      $("panel-" + button.dataset.cosmicTab).hidden = !active;
    });
  }
  const tabs = [...document.querySelectorAll("[data-cosmic-tab]")];
  tabs.forEach((button, index) => {
    button.addEventListener("click", () => showTab(button.dataset.cosmicTab));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      showTab(tabs[next].dataset.cosmicTab);
      tabs[next].focus();
    });
  });
  $("show-zodiac").addEventListener("change", (e) => (store.showZodiac = e.target.checked));
  $("zodiac-system").addEventListener("change", (e) => (store.zodiacSystem = e.target.value));
  $("sacred-geometry").addEventListener("change", (e) => (store.sacredGeometry = e.target.value));
  for (const person of PEOPLE) {
    $("birth-" + person.id).addEventListener("click", () =>
      setEpoch(birthJD(person, store.birthTimes[person.id])),
    );
    $("time-" + person.id).addEventListener("change", (e) => {
      try {
        birthJD(person, e.target.value);
        store.birthTimes[person.id] = e.target.value;
        store.birthEstimated[person.id] = false;
      } catch (error) {
        $("precision-" + person.id).textContent = error.message;
      }
    });
  }
  for (const [id, kind, direction] of [
    ["previous-new", "new", -1],
    ["next-new", "new", 1],
    ["next-full", "full", 1],
    ["next-ingress", "ingress", 1],
  ]) {
    $(id).addEventListener("click", () => {
      const jd = findEvent(ephemeris, store.jd, kind, direction, store.zodiacSystem);
      if (jd === null) {
        $("calendar-event-note").textContent =
          "No event remains in this direction within the 1900–2100 ephemeris.";
        return;
      }
      setEpoch(jd);
      $("calendar-event-note").textContent =
        `${kind === "ingress" ? (store.zodiacSystem === "sidereal" ? "Lahiri" : "Tropical") + " solar ingress" : kind === "new" ? "New Moon" : "Full Moon"} · ${formatDate(jd)} · geometric estimate`;
    });
  }
  function drawBands() {
    $("yuga-bands").replaceChildren();
    for (const segment of cosmicSegments(currentCycle)) {
      const band = document.createElement("div");
      band.className = "yuga-band";
      band.style.flex = String(segment.duration);
      band.style.background = segment.color;
      band.style.padding = segment.label ? "5px" : "0";
      band.title = `${segment.name}: ${segment.duration.toLocaleString("en-US")} years`;
      band.textContent = currentCycle.id === "manvantara" ? "" : segment.label;
      $("yuga-bands").append(band);
    }
  }
  function updateCosmic() {
    if (linked) offset = cosmicYearsAt(store.jd);
    const fraction = clamp((offset - currentCycle.start) / currentCycle.duration, 0, 1),
      inCycle =
        offset >= currentCycle.start && offset <= currentCycle.start + currentCycle.duration;
    $("cosmic-cycle-name").textContent = currentCycle.name;
    $("cosmic-duration").textContent =
      currentCycle.duration.toLocaleString("en-US") +
      " traditional years" +
      (currentCycle.id === "manvantara"
        ? " · 71 Mahayugas; 28th highlighted"
        : currentCycle.id === "kalpa"
          ? " · 14 Manvantaras + 15 sandhyas"
          : "");
    $("cosmic-slider").value = String(Math.round(fraction * 100000));
    $("cosmic-start").textContent =
      currentCycle.id === "kali" ? "18 Feb 3102 BCE · Julian" : cosmicYearLabel(currentCycle.start);
    $("cosmic-end").textContent = cosmicYearLabel(currentCycle.start + currentCycle.duration);
    $("cosmic-date").textContent = linked ? formatDate(store.jd) : cosmicYearLabel(offset);
    $("cosmic-progress").textContent = inCycle
      ? `${(fraction * 100).toFixed(4)}% of selected cycle · ${Math.max(0, offset - currentCycle.start).toLocaleString("en-US", { maximumFractionDigits: 1 })} years elapsed`
      : "Timeline date is outside this selected age";
    $("cosmic-era").textContent = linked
      ? "Aligned with orbital timeline · " + cosmicEraAt(offset)
      : "Symbolic exploration · " + cosmicEraAt(offset);
    $("cosmic-method").textContent =
      "Adopted Kali epoch: 18 February 3102 BCE, 00:00 IST, proleptic Julian (PAC). Approximate BCE/CE labels use year arithmetic and a 365.25-day display year. Current nesting: 28th Mahayuga of the 7th Manvantara. A Kalpa includes the intervening sandhyas. Exploring this scale does not move the 1900–2100 planetary clock.";
  }
  document.querySelectorAll("[data-cycle]").forEach((button) =>
    button.addEventListener("click", () => {
      currentCycle = CYCLES.find((c) => c.id === button.dataset.cycle);
      document.querySelectorAll("[data-cycle]").forEach((el) => {
        const active = el === button;
        el.classList.toggle("active", active);
        el.setAttribute("aria-pressed", String(active));
      });
      linked = false;
      offset = currentCycle.start;
      drawBands();
      updateCosmic();
    }),
  );
  $("cosmic-slider").addEventListener("input", (e) => {
    linked = false;
    offset = currentCycle.start + (Number(e.target.value) / 100000) * currentCycle.duration;
    updateCosmic();
  });
  $("cosmic-now").addEventListener("click", () => {
    linked = true;
    updateCosmic();
  });
  drawBands();
  return {
    update() {
      const sky = calendarAt(ephemeris, store.jd),
        sidereal = store.zodiacSystem === "sidereal",
        sun = sidereal ? sky.sunSidereal : sky.sunTropical,
        moon = sidereal ? sky.moonSidereal : sky.moonTropical;
      $("timeline-tithi").textContent = sky.tithiLabel;
      $("timeline-nakshatra").textContent = sky.nakshatraName + " · pada " + sky.pada;
      $("timeline-solar").textContent = signLabel(sky.sunSidereal, true);
      $("calendar-tithi").textContent = sky.tithiLabel + ` · ${sky.tithi}/30`;
      $("calendar-nakshatra").textContent = sky.nakshatraName + " · pada " + sky.pada;
      $("calendar-sun").textContent = signLabel(sun, sidereal);
      $("calendar-moon").textContent = signLabel(moon, sidereal);
      $("calendar-rashi").textContent = signLabel(sky.sunSidereal, true);
      $("calendar-ayanamsa").textContent = sky.ayanamsa.toFixed(4) + "° · mean";
      $("cosmic-epoch").textContent = formatDate(store.jd);
      const solar = arc(112, sky.sunTropical),
        lunar = arc(78, sky.elongation);
      $("solar-arc").setAttribute("d", solar.path);
      $("lunar-arc").setAttribute("d", lunar.path);
      for (const [id, q] of [
        ["solar-cycle-dot", solar],
        ["lunar-cycle-dot", lunar],
      ]) {
        $(id).setAttribute("cx", q.x);
        $(id).setAttribute("cy", q.y);
      }
      $("cycle-center").textContent = sky.paksha;
      $("cycle-center-sub").textContent = sky.tithiName;
      $("cycle-wheel").setAttribute(
        "aria-label",
        `Solar tropical longitude ${sky.sunTropical.toFixed(1)} degrees; lunar elongation ${sky.elongation.toFixed(1)} degrees; ${sky.tithiLabel}.`,
      );
      const key = JSON.stringify([store.birthTimes, store.birthEstimated]);
      if (key !== lastBirthKey) {
        lastBirthKey = key;
        for (const person of PEOPLE) {
          const birth = calendarAt(ephemeris, birthJD(person, store.birthTimes[person.id]));
          $(person.id + "-sun").textContent = signLabel(birth.sunTropical);
          $(person.id + "-moon").textContent = signLabel(birth.moonSidereal, true);
          $(person.id + "-nakshatra").textContent = birth.nakshatraName + " · pada " + birth.pada;
          const uncertainty = uncertainties.get(person.id);
          $("precision-" + person.id).textContent = store.birthEstimated[person.id]
            ? `Noon estimate. Across this birth date: Moon ${uncertainty.moonSigns.join(" / ")}; nakshatra ${uncertainty.nakshatras.join(" / ")}.`
            : `Using ${store.birthTimes[person.id]} local time. Geometric mean birth positions.`;
        }
      }
      updateCosmic();
    },
  };
}
