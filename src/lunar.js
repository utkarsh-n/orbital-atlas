import { MOON, EARTH_GM, TAU, elements, ellipsePoint, norm, scale } from "./physics.js";

/** Earth-local physical inset. This view always looks down from ecliptic north. */
export function createLunarRenderer(host, store, ephemeris) {
  let observer,
    lastKey = "";
  const instance = new window.p5((p) => {
    p.setup = () => {
      p.createCanvas(host.clientWidth, host.clientHeight);
      p.pixelDensity(Math.min(window.devicePixelRatio, 2));
      p.frameRate(20);
      p.describe(
        "Earth-centered Moon orbit at the timeline date. Ecliptic north view; the arrow points toward the Sun. The moving Moon uses JPL data, with exaggerated body sizes.",
      );
      observer = new ResizeObserver(() => p.resizeCanvas(host.clientWidth, host.clientHeight));
      observer.observe(host);
    };
    p.draw = () => {
      const key = `${store.jd}/${p.width}/${p.height}`;
      if (key === lastKey) return;
      lastKey = key;
      const moon = ephemeris.at("moon", store.jd),
        earth = ephemeris.at("earth", store.jd),
        el = elements(moon, MOON, EARTH_GM),
        unit = Math.min(p.width * 0.29, p.height * 0.34) / el.aphelion,
        cx = p.width / 2,
        cy = p.height / 2 + 3;
      const screen = (v) => [cx + v[0] * unit, cy - v[1] * unit];
      p.clear();
      const ctx = p.drawingContext;
      ctx.shadowBlur = 0;
      ctx.setLineDash([2, 5]);
      p.stroke("#4c5d8644");
      p.strokeWeight(0.8);
      p.line(cx - 75, cy, cx + 75, cy);
      p.line(cx, cy - 67, cx, cy + 67);
      ctx.setLineDash([]);
      p.noFill();
      p.stroke("#93a4da88");
      p.strokeWeight(1);
      p.beginShape();
      for (let i = 0; i <= 144; i++) p.vertex(...screen(ellipsePoint(el, (i / 144) * TAU)));
      p.endShape();
      const sun = scale(earth.p, -1 / norm(earth.p)),
        sunAngle = Math.atan2(-sun[1], sun[0]),
        arrow = Math.min(p.width * 0.35, 77),
        ax = cx + Math.cos(sunAngle) * arrow,
        ay = cy + Math.sin(sunAngle) * arrow;
      p.stroke("#ecc48b70");
      p.strokeWeight(1);
      p.line(cx, cy, ax, ay);
      for (const offset of [-0.5, 0.5])
        p.line(ax, ay, ax - 6 * Math.cos(sunAngle + offset), ay - 6 * Math.sin(sunAngle + offset));
      p.noStroke();
      p.fill("#e6c294");
      p.textFont("Arial");
      p.textSize(12);
      p.textAlign(Math.cos(sunAngle) >= 0 ? p.RIGHT : p.LEFT);
      p.text("Sun", ax, ay - 7);
      ctx.shadowBlur = 12;
      ctx.shadowColor = "#69adff";
      p.fill("#79b8ff");
      p.circle(cx, cy, 14);
      ctx.shadowBlur = 0;
      p.fill("#aac6f5");
      p.textAlign(p.CENTER);
      p.text("Earth", cx, cy + 23);
      const q = screen(moon.p);
      ctx.shadowColor = "#c4cfff";
      ctx.shadowBlur = 8;
      p.fill("#dbe3ff");
      p.circle(q[0], q[1], 6);
      ctx.shadowBlur = 0;
      p.fill("#c0cbec");
      p.textAlign(q[0] > cx ? p.LEFT : p.RIGHT);
      p.text("Moon", q[0] + (q[0] > cx ? 8 : -8), q[1] - 8);
      p.textAlign(p.LEFT);
      p.fill("#8c9fc5");
      p.text("Earth-centered orbit", 2, 14);
      p.textAlign(p.RIGHT);
      p.fill("#7d8fad");
      p.text("Bodies enlarged", p.width - 2, p.height - 3);
    };
  }, host);
  return {
    destroy() {
      observer?.disconnect();
      instance.remove();
    },
  };
}
