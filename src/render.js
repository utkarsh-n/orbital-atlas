import { createCelestialLayer } from "./celestial-render.js";
import {
  BODIES,
  MOON,
  EARTH_GM,
  AU_KM,
  add,
  scale,
  MIN_JD,
  MAX_JD,
  TAU,
  clamp,
  elements,
  ellipsePoint,
  displayPosition,
  rotate,
  worldline,
  timeViewBounds,
} from "./physics.js";

export function createRenderer(host, store, ephemeris, onFrame, onSelect) {
  const celestialLayer = createCelestialLayer();
  let instance,
    observer,
    drag = null,
    hits = [],
    moved = false,
    lastDrawKey = "",
    lastStates,
    lastElements;
  const reset = () => {
    store.yaw = store.lens === "cylinder" && store.mode === "5d" ? 16 : 0;
    store.pitch =
      store.mode === "2d" ? 0 : store.lens === "cylinder" && store.mode === "5d" ? 28 : 48;
    store.zoom = 1;
  };
  const selectAt = (x, y) => {
    const match = hits
      .filter((h) => Math.hypot(h.x - x, h.y - y) < Math.max(15, h.r + 7))
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
    if (match) onSelect(match.id);
  };
  host.addEventListener("pointerdown", (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    host.focus({ preventScroll: true });
    host.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, yaw: store.yaw, pitch: store.pitch };
    moved = false;
  });
  host.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) moved = true;
    if (moved) {
      store.yaw = drag.yaw + dx * 0.42;
      store.pitch = clamp(drag.pitch + dy * 0.42, -85, 85);
    }
  });
  host.addEventListener("pointerup", (e) => {
    if (drag && !moved) {
      const r = host.getBoundingClientRect();
      selectAt(e.clientX - r.left, e.clientY - r.top);
    }
    drag = null;
  });
  for (const event of ["pointercancel", "lostpointercapture"])
    host.addEventListener(event, () => (drag = null));
  host.addEventListener("keydown", (e) => {
    const dirs = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] };
    if (dirs[e.key]) {
      e.preventDefault();
      store.yaw += dirs[e.key][0];
      store.pitch = clamp(store.pitch + dirs[e.key][1], -85, 85);
    }
    if (e.key === "Home") {
      e.preventDefault();
      reset();
    }
    if (["+", "=", "-"].includes(e.key)) {
      e.preventDefault();
      store.zoom = clamp(store.zoom * (e.key === "-" ? 0.85 : 1.15), 0.5, 20);
    }
  });
  host.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        store.zoom = clamp(store.zoom * Math.exp(-e.deltaY * 0.005), 0.5, 20);
      }
    },
    { passive: false },
  );
  instance = new window.p5((p) => {
    p.setup = () => {
      p.createCanvas(host.clientWidth, host.clientHeight);
      p.pixelDensity(Math.min(window.devicePixelRatio, 2));
      p.frameRate(30);
      p.describe(
        "Date-locked planetary orbital positions. Colored dots represent eight planets, Pluto, and Earth’s Moon. Body selection and precise coordinates are available beside this visualization.",
      );
      observer = new ResizeObserver(() => p.resizeCanvas(host.clientWidth, host.clientHeight));
      observer.observe(host);
    };
    p.draw = () => {
      if (store.playing) {
        const next = store.jd + Math.min(p.deltaTime / 1000, 0.15) * store.rate * store.direction;
        store.jd = clamp(next, MIN_JD, MAX_JD);
        if (next <= MIN_JD || next >= MAX_JD) store.playing = false;
      }
      const drawKey = JSON.stringify([store, p.width, p.height]);
      if (drawKey === lastDrawKey && lastStates) {
        onFrame(lastStates, lastElements, p.frameRate());
        return;
      }
      lastDrawKey = drawKey;
      const bodies = BODIES,
        states = new Map(bodies.map((b) => [b.id, ephemeris.at(b.id, store.jd)])),
        els = new Map(bodies.map((b) => [b.id, elements(states.get(b.id), b)]));
      const lens = store.mode === "4d" ? "4d" : store.mode === "5d" ? store.lens : "orbits",
        temporal = ["4d", "cylinder", "torus"].includes(lens);
      const data = bodies.map((body) => ({
        body,
        state: states.get(body.id),
        el: els.get(body.id),
      }));
      const spatial = (v, b, el) => displayPosition(v, b, el, store.spacing);
      const phase = (d, a) =>
        d.el.pAxis.map((v, i) => d.body.lane * (v * Math.cos(a) + d.el.qAxis[i] * Math.sin(a)));
      const reference = [];
      if (temporal) {
        for (let i = 0; i < 96; i++) {
          const t = (i / 95) * 2 - 1;
          reference.push(worldline([8, 8, 0], t, lens), worldline([-8, -8, 0], t, lens));
        }
      } else
        for (const d of data)
          for (let i = 0; i < 72; i++)
            reference.push(
              lens === "tracks"
                ? phase(d, (i / 72) * TAU)
                : spatial(ellipsePoint(d.el, (i / 72) * TAU), d.body, d.el),
            );
      for (let i = 0; i < 96; i++) {
        const a = (i / 96) * TAU;
        reference.push([9.8 * Math.cos(a), 9.8 * Math.sin(a), 0]);
      }
      const project = (v) =>
        rotate(store.mode === "2d" ? [v[0], v[1], 0] : v, store.yaw, store.pitch);
      const rotated = reference.map(project),
        bounds = temporal
          ? timeViewBounds(lens, store.yaw, store.pitch)
          : [
              Math.max(1, ...rotated.map((v) => Math.abs(v[0]))),
              Math.max(2.1, ...rotated.map((v) => Math.abs(v[1]))),
            ],
        bx = Math.max(bounds[0], ...rotated.map((v) => Math.abs(v[0]))),
        by = Math.max(bounds[1], ...rotated.map((v) => Math.abs(v[1])));
      const unit = Math.min((p.width - 90) / (2 * bx), (p.height - 105) / (2 * by)) * store.zoom,
        cx = p.width / 2,
        cy = p.height / 2 + 1;
      const screen = (v) => {
        const r = project(v);
        return [cx + r[0] * unit, cy - r[1] * unit, r[2]];
      };
      const ctx = p.drawingContext;
      p.background("#080d1b");
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);
      p.noFill();
      p.stroke(58, 81, 133, 44);
      p.strokeWeight(0.6);
      for (let x = cx % 32; x < p.width; x += 32) p.line(x, 0, x, p.height);
      for (let y = cy % 32; y < p.height; y += 32) p.line(0, y, p.width, y);
      const path = (vs, color, width = 1, dash = [], glow = 0) => {
        ctx.setLineDash(dash);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.shadowBlur = glow;
        ctx.shadowColor = color;
        ctx.beginPath();
        for (let i = 0; i < vs.length; i++) {
          const q = screen(vs[i]);
          if (i === 0) ctx.moveTo(q[0], q[1]);
          else ctx.lineTo(q[0], q[1]);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.setLineDash([]);
      };
      if (store.grid && !temporal) {
        for (const radius of [2, 4, 6, 8])
          path(
            Array.from({ length: 97 }, (_, i) => [
              radius * Math.cos((i / 96) * TAU),
              radius * Math.sin((i / 96) * TAU),
              0,
            ]),
            "#526daa35",
            0.7,
            [2, 5],
          );
        path(
          [
            [-9, 0, 0],
            [9, 0, 0],
          ],
          "#526daa55",
          0.8,
          [3, 6],
        );
        path(
          [
            [0, -9, 0],
            [0, 9, 0],
          ],
          "#526daa55",
          0.8,
          [3, 6],
        );
        if (store.mode !== "2d")
          path(
            [
              [0, 0, -4],
              [0, 0, 4],
            ],
            "#526daa55",
            0.8,
            [3, 6],
          );
      }
      if (temporal && store.grid) {
        if (lens === "torus") {
          for (let k = 0; k < 12; k++) {
            const t = (k / 12) * 2 - 1;
            path(
              Array.from({ length: 49 }, (_, i) => {
                const a = (i / 48) * TAU,
                  theta = Math.PI / 2 - t * Math.PI,
                  rad = 4.7 + 1.3 * Math.cos(a);
                return [rad * Math.cos(theta), rad * Math.sin(theta), 1.5 * Math.sin(a)];
              }),
              "#7069bd3d",
              0.7,
            );
          }
          for (let j = 0; j < 5; j++) {
            const a = (j / 5) * TAU;
            path(
              Array.from({ length: 121 }, (_, i) => {
                const q = (i / 120) * TAU,
                  r = 4.7 + 1.3 * Math.cos(a);
                return [r * Math.cos(q), r * Math.sin(q), 1.5 * Math.sin(a)];
              }),
              "#7069bd38",
              0.7,
            );
          }
        } else if (lens === "cylinder") {
          for (let j = 0; j <= 8; j++) {
            const x = -7 + j * 1.75;
            path(
              Array.from({ length: 73 }, (_, i) => [
                x,
                3.1 * Math.cos((i / 72) * TAU),
                3.1 * Math.sin((i / 72) * TAU),
              ]),
              j === 4 ? "#b0a6fb88" : "#7069bd44",
              j === 4 ? 1.2 : 0.7,
            );
          }
          for (let j = 0; j < 8; j++) {
            const a = (j / 8) * TAU;
            path(
              [
                [-7, 3.1 * Math.cos(a), 3.1 * Math.sin(a)],
                [7, 3.1 * Math.cos(a), 3.1 * Math.sin(a)],
              ],
              "#7069bd33",
              0.7,
            );
          }
        } else {
          path(
            [
              [-7, 0, 7],
              [7, 0, -7],
            ],
            "#a4b4df77",
            1,
            [3, 4],
          );
          for (const t of [-1, -0.5, 0, 0.5, 1])
            path(
              Array.from({ length: 73 }, (_, i) =>
                worldline([7 * Math.cos((i / 72) * TAU), 7 * Math.sin((i / 72) * TAU), 0], t, lens),
              ),
              "#7069bd36",
              0.7,
            );
        }
      }
      if (!temporal) {
        for (const d of data) {
          const selected = d.body.id === store.selected;
          const vs = Array.from({ length: 241 }, (_, i) =>
            lens === "tracks"
              ? phase(d, (i / 240) * TAU)
              : spatial(ellipsePoint(d.el, (i / 240) * TAU), d.body, d.el),
          );
          path(
            vs,
            d.body.color + (selected ? "a8" : "51"),
            selected ? 1.4 : 0.85,
            [],
            selected ? 4 : 0,
          );
        }
      }
      const labels = [];
      const label = (name, pt, color) => {
        p.textFont("monospace");
        p.textSize(12);
        const w = p.textWidth(name);
        const choices = [
          [pt[0] + 11, pt[1] - 9],
          [pt[0] + 11, pt[1] + 17],
          [pt[0] - w - 11, pt[1] - 9],
          [pt[0] - w - 11, pt[1] + 17],
        ];
        const fits = (q) =>
          q[0] > 8 &&
          q[0] + w < p.width - 8 &&
          q[1] > 35 &&
          q[1] < p.height - 30 &&
          !labels.some(
            (r) => q[0] < r.x + r.w + 3 && q[0] + w > r.x - 3 && q[1] > r.y - 12 && q[1] < r.y + 14,
          );
        const q = choices.find(fits);
        if (q) {
          p.noStroke();
          p.fill(color);
          p.text(name, ...q);
          labels.push({ x: q[0], y: q[1], w });
        }
      };
      if (temporal) {
        const start = Math.max(MIN_JD, store.jd - store.window),
          end = Math.min(MAX_JD, store.jd + store.window);
        for (const d of data) {
          if (!store.allWorldlines && d.body.id !== store.selected) continue;
          const n = Math.round(clamp(((end - start) / d.el.period) * 64, 160, 24000));
          const trace = (a, b) => {
            const c = Math.max(2, Math.ceil((n * (b - a)) / Math.max(1, end - start)) + 1);
            return Array.from({ length: c }, (_, i) => {
              const t = a + ((b - a) * i) / (c - 1);
              return worldline(
                spatial(ephemeris.at(d.body.id, t).p, d.body, d.el),
                (t - store.jd) / store.window,
                lens,
              );
            });
          };
          const past = trace(start, store.jd),
            future = trace(store.jd, end),
            selected = d.body.id === store.selected;
          path(
            past,
            d.body.color + (selected ? "e0" : "65"),
            selected ? 1.55 : 1,
            [],
            selected ? 5 : 0,
          );
          path(
            future,
            d.body.color + (selected ? "c0" : "50"),
            selected ? 1.3 : 0.85,
            [4, 4],
            selected ? 3 : 0,
          );
          if (lens === "torus" && start > MIN_JD && end < MAX_JD) {
            const a = future.at(-1),
              b = past[0],
              radA = Math.hypot(a[0], a[1]),
              radB = Math.hypot(b[0], b[1]);
            path(
              Array.from({ length: 21 }, (_, i) => {
                const t = i / 20,
                  theta = -Math.PI / 2 + 0.11 - 0.22 * t,
                  r = radA + (radB - radA) * t;
                return [r * Math.cos(theta), r * Math.sin(theta), a[2] + (b[2] - a[2]) * t];
              }),
              d.body.color + "66",
              0.8,
              [2, 4],
            );
          }
        }
        const tags =
          lens === "torus"
            ? [
                [[0, -6.3, 0], "DISPLAY JOIN"],
                [[0, 6.4, 0], "NOW"],
              ]
            : lens === "cylinder"
              ? [
                  [[-7, 0, 0], "PAST"],
                  [[7, 0, 0], "FUTURE"],
                ]
              : [
                  [worldline([0, 0, 0], -1, lens), "PAST"],
                  [worldline([0, 0, 0], 1, lens), "FUTURE"],
                ];
        for (const [pos, name] of tags) {
          const q = screen(pos);
          p.noStroke();
          p.fill("#899bc5");
          p.textFont("monospace");
          p.textSize(12);
          p.textAlign(p.CENTER);
          p.text(name, q[0], clamp(q[1] + 18, 40, p.height - 36));
          p.textAlign(p.LEFT);
        }
      }
      hits = [];
      if (!temporal) {
        const sun = screen([0, 0, 0]);
        ctx.shadowBlur = 22;
        ctx.shadowColor = "#efb86f";
        p.noStroke();
        p.fill("#e8be7b");
        p.circle(sun[0], sun[1], 21);
        ctx.shadowBlur = 0;
        p.noFill();
        p.stroke("#e7be6a66");
        p.strokeWeight(0.7);
        p.circle(sun[0], sun[1], 31);
        if (store.labels) label("SUN", sun, "#bdab78");
      }
      const earthBody = BODIES.find((b) => b.id === "earth"),
        earthState = states.get("earth"),
        earthElements = els.get("earth"),
        moonState = ephemeris.at("moon", store.jd),
        moonElements = elements(moonState, MOON, EARTH_GM),
        moonScale = store.spacing === "atlas" ? 0.42 / (384400 / AU_KM) : 7 / 45,
        earthDisplay = spatial(earthState.p, earthBody, earthElements),
        lunarPosition = (relative) => add(earthDisplay, scale(relative, moonScale));
      if (lens === "orbits" && store.selected === "earth") {
        path(
          Array.from({ length: 145 }, (_, i) =>
            lunarPosition(ellipsePoint(moonElements, (i / 144) * TAU)),
          ),
          "#b0bfff66",
          0.8,
          [2, 3],
        );
      }
      const nodes = data
        .filter((d) => !temporal || store.allWorldlines || d.body.id === store.selected)
        .map((d) => {
          const pos = temporal
            ? worldline(spatial(d.state.p, d.body, d.el), 0, lens)
            : lens === "tracks"
              ? phase(d, d.el.anomaly)
              : spatial(d.state.p, d.body, d.el);
          return { ...d, point: screen(pos) };
        })
        .sort((a, b) => a.point[2] - b.point[2]);
      if (lens === "orbits") {
        nodes.push({ body: { ...MOON, size: 2.6 }, point: screen(lunarPosition(moonState.p)) });
        nodes.sort((a, b) => a.point[2] - b.point[2]);
      }
      for (const d of nodes) {
        const [x, y] = d.point,
          selected = d.body.id === store.selected,
          r = d.body.size;
        ctx.shadowColor = d.body.color;
        ctx.shadowBlur = selected ? 13 : 6;
        p.noStroke();
        p.fill(d.body.color);
        p.circle(x, y, r * 2);
        ctx.shadowBlur = 0;
        if (d.body.id === "saturn") {
          p.noFill();
          p.stroke(d.body.color + "b0");
          p.strokeWeight(1);
          p.ellipse(x, y, r * 3.5, r * 1.2);
        }
        if (selected) {
          p.noFill();
          p.stroke("#d3e1ffb0");
          p.strokeWeight(0.8);
          p.circle(x, y, r * 2 + 9);
        }
        hits.push({ x, y, r, id: d.body.id === "moon" ? "earth" : d.body.id });
        if (store.labels || selected) label(d.body.name.toUpperCase(), d.point, d.body.color);
      }
      celestialLayer(p, store, ephemeris, { screen, path, temporal, lens });
      lastStates = states;
      lastElements = els;
      onFrame(states, els, p.frameRate());
    };
  }, host);
  return {
    reset,
    destroy() {
      observer?.disconnect();
      instance?.remove();
    },
  };
}
