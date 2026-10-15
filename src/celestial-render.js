import { TAU, scale, clamp } from "./physics.js";
import { zodiacDirection } from "./zodiac-math.js";
import { ZODIAC, PEOPLE, birthAnchor, calendarAt, signAt } from "./celestial.js";

export function createCelestialLayer() {
  let birthKey = "",
    anchors = [];
  return (p, store, ephemeris, { screen, path, temporal, lens }) => {
    const ctx = p.drawingContext;
    // The zodiac compass and eternal markers stay in space across every time lens.
    const transform = (v) => v;
    const sky = calendarAt(ephemeris, store.jd);
    const ray = (angle, radius) =>
      scale(zodiacDirection(angle, store.jd, store.zodiacSystem), radius);
    const drawPath = (vs, ...style) => path(vs.map(transform), ...style);
    if (store.sacredGeometry !== "off") {
      if (store.sacredGeometry === "seed") {
        for (let k = -1; k < 6; k++) {
          const a = (k * TAU) / 6,
            center = k < 0 ? [0, 0] : [2.35 * Math.cos(a), 2.35 * Math.sin(a)];
          drawPath(
            Array.from({ length: 97 }, (_, i) => [
              center[0] + 2.35 * Math.cos((i / 96) * TAU),
              center[1] + 2.35 * Math.sin((i / 96) * TAU),
              0,
            ]),
            "#a78ddd24",
            0.8,
          );
        }
      } else {
        for (const offset of [0, Math.PI / 12])
          drawPath(
            Array.from({ length: 361 }, (_, i) => {
              const a = (i / 360) * TAU,
                r = 5.7 * (0.76 + 0.24 * Math.cos(12 * (a + offset)));
              return [r * Math.cos(a), r * Math.sin(a), 0];
            }),
            "#a89afa24",
            0.8,
          );
      }
    }
    if (store.showZodiac) {
      drawPath(
        Array.from({ length: 241 }, (_, i) => ray((i / 240) * 360, 9.15)),
        "#9b8bcc55",
        1,
      );
      drawPath(
        Array.from({ length: 241 }, (_, i) => ray((i / 240) * 360, 8.7)),
        "#9086b923",
        0.7,
      );
      const sunSign = signAt(
        store.zodiacSystem === "sidereal" ? sky.sunSidereal : sky.sunTropical,
      ).index;
      for (let i = 0; i < 12; i++) {
        drawPath([ray(i * 30, 8.7), ray(i * 30, 9.15)], "#b09bd966", 0.8);
        const pt = screen(transform(ray(i * 30 + 15, 9.5))),
          active = i === sunSign;
        if (pt[0] < 12 || pt[0] > p.width - 12 || pt[1] < 38 || pt[1] > p.height - 28) continue;
        p.noStroke();
        p.fill(active ? "#e1ccff" : "#a395bb");
        p.textAlign(p.CENTER);
        p.textFont("Arial");
        p.textSize(p.width < 500 ? 16 : 20);
        if (active) {
          ctx.shadowBlur = 10;
          ctx.shadowColor = "#bba1ff";
        }
        p.text(ZODIAC[i][2], pt[0], pt[1] + 6);
        ctx.shadowBlur = 0;
      }
      p.textAlign(p.LEFT);
    }
    const key = JSON.stringify(store.birthTimes);
    if (key !== birthKey) {
      birthKey = key;
      anchors = PEOPLE.map((person) => birthAnchor(person, store.birthTimes[person.id], ephemeris));
    }
    const projected = anchors.map((anchor) => {
      const raw = screen(transform(anchor.position));
      return {
        ...anchor,
        point: [clamp(raw[0], 28, p.width - 28), clamp(raw[1], 58, p.height - 65)],
        offscreen: raw[0] < 28 || raw[0] > p.width - 28 || raw[1] < 58 || raw[1] > p.height - 65,
      };
    });
    const [a, b] = projected.map((node) => node.point),
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      len = Math.max(1, Math.hypot(dx, dy)),
      bend = Math.min(45, len * 0.3) + 8,
      c1 = [a[0] + dx / 3 - (dy / len) * bend, a[1] + dy / 3 + (dx / len) * bend],
      c2 = [a[0] + (dx * 2) / 3 - (dy / len) * bend, a[1] + (dy * 2) / 3 + (dx / len) * bend];
    const gradient = ctx.createLinearGradient(a[0], a[1], b[0] + 0.01, b[1] + 0.01);
    gradient.addColorStop(0, "#7fffd4");
    gradient.addColorStop(0.5, "#afa5ff");
    gradient.addColorStop(1, "#ff9fc6");
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.bezierCurveTo(...c1, ...c2, ...b);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = "#bcb0ff";
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();
    for (let i = 0; i < projected.length; i++) {
      const node = projected[i],
        [x, y] = node.point;
      p.noStroke();
      p.fill(node.color);
      ctx.shadowColor = node.color;
      ctx.shadowBlur = 15;
      p.circle(x, y, 9);
      ctx.shadowBlur = 0;
      p.noFill();
      p.stroke(node.color + "80");
      p.strokeWeight(1);
      p.circle(x, y, 18);
      const text = node.name + (node.offscreen ? " · edge" : "");
      p.textFont("Arial");
      p.textSize(13);
      p.textAlign(p.CENTER);
      const labelY = clamp(y + (i === 0 ? -21 : 30), 42, p.height - 33),
        labelX = clamp(x, 45, p.width - 45),
        width = p.textWidth(text) + 15;
      p.noStroke();
      p.fill("#0b1229e8");
      p.rect(labelX - width / 2, labelY - 14, width, 21, 7);
      p.fill(node.color);
      p.text(text, labelX, labelY);
    }
    p.textAlign(p.LEFT);
  };
}
