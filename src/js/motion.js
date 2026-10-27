export const reduced = matchMedia("(prefers-reduced-motion: reduce)");
export const isReduced = () => reduced.matches;
if (isReduced()) document.documentElement.classList.add("rm");
reduced.addEventListener("change", () => document.documentElement.classList.toggle("rm", isReduced()));

/* damped spring, fixed-step semi-implicit Euler, 240 Hz substeps */
export function spring(from, to, onUpdate, { k = 170, c = 20, m = 1, delay = 0, done } = {}) {
  if (isReduced()) { onUpdate(to); done && done(); return () => {}; }
  let x = from, v = 0, last = 0, alive = true;
  const h = 1 / 240;
  let acc = 0;
  const start = performance.now() + delay;
  const frame = (t) => {
    if (!alive) return;
    if (t < start) return requestAnimationFrame(frame);
    if (!last) last = t;
    acc += Math.min(0.05, (t - last) / 1000); last = t;
    while (acc >= h) {
      const a = (-k * (x - to) - c * v) / m;
      v += a * h; x += v * h; acc -= h;
    }
    const settled = Math.abs(x - to) < 0.0008 && Math.abs(v) < 0.0008;
    onUpdate(settled ? to : x);
    if (settled) { alive = false; done && done(); return; }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return () => { alive = false; };
}

export function enter(el, { delay = 0, dy = 26 } = {}) {
  if (isReduced()) { el.style.opacity = "1"; el.style.transform = "none"; return; }
  spring(0, 1, (p) => {
    el.style.opacity = String(Math.max(0, Math.min(1, p)));
    el.style.transform = `translate3d(0, ${(1 - p) * dy}px, 0)`;
  }, { delay, done: () => { el.style.transform = "none"; el.style.willChange = "auto"; } });
}

export function reveal(root = document) {
  const items = [...root.querySelectorAll("[data-reveal]")];
  if (isReduced() || !("IntersectionObserver" in window)) {
    items.forEach((el) => { el.style.opacity = "1"; });
    return;
  }
  const groups = new Map();
  items.forEach((el) => {
    const g = el.dataset.reveal || el.parentElement;
    groups.set(g, (groups.get(g) || 0));
  });
  const io = new IntersectionObserver((entries) => {
    const batch = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
    batch.forEach((e, i) => { io.unobserve(e.target); enter(e.target, { delay: i * 70 }); });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  items.forEach((el) => io.observe(el));
}

export function numberTween(el, from, to, format, { duration = 700 } = {}) {
  if (isReduced() || !Number.isFinite(from) || from === to) { el.textContent = format(to); return; }
  const t0 = performance.now();
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const step = (t) => {
    const p = Math.min(1, (t - t0) / duration);
    el.textContent = format(from + (to - from) * ease(p));
    if (p < 1) requestAnimationFrame(step); else el.textContent = format(to);
  };
  requestAnimationFrame(step);
}

export function flash(el, dir) {
  if (isReduced() || !dir) return;
  const cls = dir > 0 ? "flash-up" : "flash-down";
  el.classList.remove("flash-up", "flash-down");
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 950);
}

export function spotlight(root = document) {
  if (isReduced()) return;
  let raf = 0, pending = null;
  root.addEventListener("pointermove", (e) => {
    const el = e.target.closest && e.target.closest(".spot");
    if (!el) return;
    pending = [el, e.clientX, e.clientY];
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const [t, x, y] = pending; const r = t.getBoundingClientRect();
      t.style.setProperty("--mx", `${x - r.left}px`);
      t.style.setProperty("--my", `${y - r.top}px`);
    });
  }, { passive: true });
}

export function progressBar(bar) {
  const set = () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`;
  };
  addEventListener("scroll", set, { passive: true });
  addEventListener("resize", set);
  set();
}

export function parallax(scope) {
  const layers = [...scope.querySelectorAll("[data-depth]")];
  if (!layers.length) return;
  const cur = layers.map(() => [0, 0]);
  let px = 0, py = 0, running = false;
  const target = () => {
    const r = scope.getBoundingClientRect();
    const sy = Math.max(-1, Math.min(1, (r.top + r.height / 2 - innerHeight / 2) / innerHeight));
    return sy;
  };
  const tick = () => {
    if (isReduced()) { running = false; return; }
    const sy = target();
    let moving = false;
    layers.forEach((el, i) => {
      const d = parseFloat(el.dataset.depth);
      const tx = px * d * 22, ty = py * d * 16 + sy * d * 46;
      cur[i][0] += (tx - cur[i][0]) * 0.09;
      cur[i][1] += (ty - cur[i][1]) * 0.09;
      if (Math.abs(tx - cur[i][0]) > 0.05 || Math.abs(ty - cur[i][1]) > 0.05) moving = true;
      el.style.transform = `translate3d(${cur[i][0].toFixed(2)}px, ${cur[i][1].toFixed(2)}px, 0)`;
    });
    if (moving) requestAnimationFrame(tick); else running = false;
  };
  const kick = () => { if (!running && !isReduced()) { running = true; requestAnimationFrame(tick); } };
  scope.addEventListener("pointermove", (e) => {
    const r = scope.getBoundingClientRect();
    px = ((e.clientX - r.left) / r.width - 0.5) * 2;
    py = ((e.clientY - r.top) / r.height - 0.5) * 2;
    kick();
  }, { passive: true });
  scope.addEventListener("pointerleave", () => { px = 0; py = 0; kick(); });
  addEventListener("scroll", kick, { passive: true });
  kick();
}

export function tracer(svg) {
  const path = svg.querySelector(".chart-line"), dot = svg.querySelector(".chart-tracer");
  if (!path || !dot) return;
  const len = path.getTotalLength();
  const put = (p) => { const pt = path.getPointAtLength(len * p); dot.setAttribute("cx", pt.x); dot.setAttribute("cy", pt.y); };
  if (isReduced()) { put(0.78); return; }
  const t0 = performance.now();
  const loop = (t) => { put(((t - t0) / 14000) % 1); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
