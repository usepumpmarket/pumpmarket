import { enter, numberTween, flash, isReduced } from "./motion.js";
import { usd, price, change, count, short, DASH } from "./format.js";
import { wireCopyButton, COPY_SVG } from "./copy.js";

const POLL_MS = 60000;
const TOP_N = 10;
const SORTS = {
  volume: (a, b) => b.vol - a.vol,
  gainers: (a, b) => b.chg - a.chg,
  liquidity: (a, b) => b.liq - a.liq,
};
const PILL = { loading: "Connecting", ok: "Streaming", stale: "Stale", error: "Offline", inert: "Pending" };

const wait = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  signal && signal.addEventListener("abort", () => { clearTimeout(t); rej(new DOMException("aborted", "AbortError")); }, { once: true });
});

async function getJSON(url, signal) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { signal, headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(`http ${r.status}`);
      return await r.json();
    } catch (e) {
      if (e.name === "AbortError") throw e;
      lastErr = e;
      if (attempt < 3) await wait(800 * 2 ** attempt + Math.random() * 250, signal);
    }
  }
  throw lastErr;
}

async function loadBoard(base, signal) {
  const boosts = await getJSON(`${base}/token-boosts/top/v1`, signal);
  const addrs = [...new Set((Array.isArray(boosts) ? boosts : []).filter((b) => b && b.chainId === "solana" && b.tokenAddress).map((b) => b.tokenAddress))];
  if (!addrs.length) throw new Error("no solana entries");
  const chunks = [];
  for (let i = 0; i < addrs.length; i += 30) chunks.push(addrs.slice(i, i + 30));
  const batches = await Promise.all(chunks.map((c) => getJSON(`${base}/tokens/v1/solana/${c.join(",")}`, signal)));
  const wanted = new Set(addrs);
  const best = new Map();
  for (const p of batches.flat()) {
    const a = p && p.baseToken && p.baseToken.address;
    if (!a || !wanted.has(a)) continue;
    const vol = Number(p.volume && p.volume.h24);
    if (!Number.isFinite(vol)) continue;
    const cur = best.get(a);
    if (cur && cur.vol >= vol) continue;
    best.set(a, {
      address: a, name: p.baseToken.name || p.baseToken.symbol || a, symbol: p.baseToken.symbol || "",
      image: (p.info && p.info.imageUrl) || "", price: Number(p.priceUsd), chg: Number(p.priceChange && p.priceChange.h24),
      vol, liq: Number(p.liquidity && p.liquidity.usd),
    });
  }
  const out = [...best.values()].sort(SORTS.volume).slice(0, TOP_N);
  if (!out.length) throw new Error("no priced listings");
  return out;
}

const tileLetter = (it) => ((it.symbol || it.name || "?").trim()[0] || "?").toUpperCase();
function avatar(it, cls) {
  const mk = () => {
    const d = document.createElement("span");
    d.className = "tile-fallback"; d.textContent = tileLetter(it); d.setAttribute("aria-hidden", "true");
    return d;
  };
  if (!it.image) return mk();
  const img = document.createElement("img");
  img.className = cls || "tok-img";
  img.alt = ""; img.width = 30; img.height = 30; img.loading = "lazy"; img.decoding = "async"; img.referrerPolicy = "no-referrer";
  img.addEventListener("error", () => img.replaceWith(mk()), { once: true });
  img.src = it.image;
  return img;
}

export function startMarket({ source, root }) {
  const $ = (s) => root.querySelector(s);
  const list = $("#list"), note = $("#note"), ticker = $("#ticker"), track = $("#tickerTrack"), path = $("#winPath");
  const pills = [...root.querySelectorAll(".pill[data-market-pill]")];
  const tabs = [...root.querySelectorAll(".tab")];
  const tiles = { n: $("#tileCount"), v: $("#tileVol"), l: $("#tileLiq"), g: $("#tileGain") };
  const subs = { n: $("#subCount"), v: $("#subVol"), l: $("#subLiq"), g: $("#subGain") };
  const fc = { name: $("#fcName"), sub: $("#fcSub"), val: $("#fcVal"), cap: $("#fcCap") };

  let items = [], sort = "volume", fails = 0, timer = 0, ctrl = null, first = true, sig = "", skels = null;
  const rows = new Map();

  const setStatus = (s) => {
    pills.forEach((p) => { p.dataset.state = s; p.querySelector(".pill-text").textContent = PILL[s]; });
  };

  if (!source || source.state !== "stated" || !source.url) {
    setStatus("inert");
    list.innerHTML = '<div class="state"><strong>pending</strong><span>Market data pending</span></div>';
    Object.values(tiles).forEach((t) => { t.textContent = "pending"; });
    ticker.hidden = true;
    return { stop() {} };
  }
  const base = source.url.replace(/\/+$/, "");

  const skeletonRows = () => {
    const wrap = document.createElement("div");
    wrap.className = "skels";
    for (let i = 0; i < TOP_N; i++) {
      const r = document.createElement("div");
      r.className = "row is-skel";
      r.innerHTML = '<div class="tok"><span class="skel round"></span><span class="skel" style="width:90px"></span></div>'
        + '<span class="skel r" style="width:60px"></span>'
        + '<div class="stats"><span class="skel r" style="width:46px"></span><span class="skel r" style="width:54px"></span><span class="skel r" style="width:54px"></span></div><span></span>';
      wrap.appendChild(r);
    }
    return wrap;
  };
  list.replaceChildren((skels = skeletonRows()));
  setStatus("loading");

  function makeRow(it) {
    const r = document.createElement("div");
    r.className = "row spot"; r.dataset.addr = it.address;
    const tok = document.createElement("div"); tok.className = "tok";
    const rank = document.createElement("span"); rank.className = "rank";
    const txt = document.createElement("div"); txt.className = "tok-text";
    const s = document.createElement("strong"); s.textContent = it.symbol || it.name;
    const sm = document.createElement("small"); sm.textContent = `${it.name} · ${short(it.address)}`;
    txt.append(s, sm); tok.append(rank, avatar(it), txt);
    const cell = (cls, label) => { const c = document.createElement("div"); c.className = `cell ${cls}`; c.dataset.label = label; c._v = 0; return c; };
    const p = cell("price", "Price"), g = cell("chg", "24h"), v = cell("vol", "Volume"), l = cell("liq", "Liquidity");
    const stats = document.createElement("div"); stats.className = "stats"; stats.append(g, v, l);
    const b = document.createElement("button"); b.type = "button"; b.className = "copy"; b.innerHTML = COPY_SVG;
    b.setAttribute("aria-label", `Copy address for ${it.symbol || it.name}`);
    wireCopyButton(b, () => it.address);
    r.append(tok, p, stats, b);
    r._c = { p, g, v, l, rank };
    return r;
  }

  function paint(r, it) {
    const c = r._c;
    const set = (el, val, fmt) => {
      const was = el._v; el._v = val;
      numberTween(el, was, val, fmt);
      if (was !== 0 && Number.isFinite(was) && was !== val) flash(el, Math.sign(val - was));
    };
    set(c.p, it.price, price);
    set(c.g, it.chg, change);
    c.g.classList.toggle("up", it.chg >= 0); c.g.classList.toggle("down", it.chg < 0);
    set(c.v, it.vol, usd);
    set(c.l, it.liq, usd);
  }

  const sorted = () => [...items].sort(SORTS[sort]);

  function render(restagger) {
    const ord = sorted();
    const keep = new Set(ord.map((i) => i.address));
    for (const [a, r] of rows) if (!keep.has(a)) { r.remove(); rows.delete(a); }
    ord.forEach((it, i) => {
      let r = rows.get(it.address);
      const isNew = !r;
      if (isNew) { r = makeRow(it); rows.set(it.address, r); }
      r._c.rank.textContent = String(i + 1).padStart(2, "0");
      paint(r, it);
      list.appendChild(r);
      if (isNew) { if (!isReduced()) r.style.opacity = "0"; enter(r, { delay: i * 45, dy: 10 }); }
      else if (restagger) enter(r, { delay: i * 35, dy: 8 });
    });
  }

  function ticks() {
    const mk = (it) => {
      const t = document.createElement("span"); t.className = "tick"; t.dataset.addr = it.address;
      const b = document.createElement("b"); b.textContent = it.symbol || it.name;
      const pr = document.createElement("span"); pr.dataset.k = "p";
      const ch = document.createElement("span"); ch.dataset.k = "c";
      t.append(avatar(it, "tick-img"), b, pr, ch);
      return t;
    };
    const nsig = items.map((i) => i.address).join();
    if (nsig !== sig) {
      sig = nsig;
      const half = () => { const f = document.createElement("div"); f.className = "tick-set"; f.style.display = "flex"; items.forEach((i) => f.appendChild(mk(i))); return f; };
      const a = half(), b = half();
      b.setAttribute("aria-hidden", "true");
      track.replaceChildren(a, b);
      ticker.classList.remove("is-skel", "is-static");
      requestAnimationFrame(() => ticker.style.setProperty("--marquee-dur", `${Math.max(30, Math.round(a.scrollWidth / 55))}s`));
    }
    const by = new Map(items.map((i) => [i.address, i]));
    track.querySelectorAll(".tick").forEach((t) => {
      const it = by.get(t.dataset.addr);
      if (!it) return;
      t.querySelector('[data-k="p"]').textContent = price(it.price);
      const c = t.querySelector('[data-k="c"]');
      c.textContent = change(it.chg);
      c.style.color = it.chg >= 0 ? "var(--up)" : "var(--down)";
    });
  }

  function summary() {
    const tot = (k) => items.reduce((a, i) => a + (Number.isFinite(i[k]) ? i[k] : 0), 0);
    const top = [...items].sort(SORTS.gainers)[0];
    const put = (el, val, fmt) => {
      const was = el._v; el._v = val;
      numberTween(el, Number.isFinite(was) ? was : 0, val, fmt, { duration: 900 });
      if (was && was !== val) flash(el, Math.sign(val - was));
    };
    put(tiles.n, items.length, count); subs.n.textContent = "ranked by 24h volume";
    put(tiles.v, tot("vol"), usd); subs.v.textContent = "across the ranked set";
    put(tiles.l, tot("liq"), usd); subs.l.textContent = "pooled depth, USD";
    put(tiles.g, top.chg, change); subs.g.textContent = top.symbol || top.name;
    const lead = [...items].sort(SORTS.volume)[0];
    fc.name.textContent = lead.symbol || lead.name; fc.cap.textContent = "Top of the board";
    fc.sub.textContent = `${usd(lead.vol)} volume`;
    put(fc.val, lead.chg, change);
    fc.val.style.color = lead.chg >= 0 ? "var(--up)" : "var(--down)";
  }

  function showError() {
    if (items.length) {
      setStatus("stale");
      note.textContent = "Data provider unreachable. Showing the last good snapshot while retrying.";
      note.classList.add("on");
      return;
    }
    setStatus("error");
    const box = document.createElement("div");
    box.className = "state is-error";
    box.innerHTML = `<strong>${DASH}</strong><span>Data provider unreachable. Retrying with backoff.</span>`;
    list.replaceChildren(box);
    rows.clear(); skels = null; sig = "";
    const tick = document.createElement("span");
    tick.className = "tick"; tick.textContent = `${DASH}  data provider unreachable`;
    track.replaceChildren(tick); ticker.classList.remove("is-skel"); ticker.classList.add("is-static");
    Object.values(tiles).forEach((t) => { t.textContent = DASH; t._v = undefined; });
    Object.values(subs).forEach((t) => { t.textContent = "error"; });
    fc.name.textContent = DASH; fc.val.textContent = DASH; fc.val._v = undefined; fc.sub.textContent = "error"; fc.cap.textContent = "";
    note.classList.remove("on");
  }

  async function cycle() {
    if (document.hidden) return;
    if (ctrl) ctrl.abort();
    const mine = (ctrl = new AbortController());
    try {
      const data = await loadBoard(base, mine.signal);
      items = data; fails = 0; note.classList.remove("on");
      if (skels) {
        const s = skels; skels = null;
        s.style.cssText = "position:absolute;inset:0"; s.classList.add("out");
        setTimeout(() => s.remove(), 320);
      } else if (!rows.size) {
        list.replaceChildren();
      }
      render(false); ticks(); summary(); setStatus("ok"); first = false;
    } catch (e) {
      if (e.name === "AbortError") return;
      fails++; showError();
    }
    if (mine !== ctrl) return;
    clearTimeout(timer);
    timer = setTimeout(cycle, fails ? Math.min(POLL_MS, 4000 * 2 ** (fails - 1)) : POLL_MS);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { clearTimeout(timer); if (ctrl) ctrl.abort(); }
    else cycle();
  });

  function select(t) {
    sort = t.dataset.sort;
    tabs.forEach((x) => { const on = x === t; x.setAttribute("aria-selected", String(on)); x.tabIndex = on ? 0 : -1; });
    path.textContent = `pump-market / board / ${sort}`;
    if (items.length) render(true);
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(t));
    t.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const n = tabs[(i + d + tabs.length) % tabs.length];
      n.focus(); select(n);
    });
  });

  cycle();
  return { stop() { clearTimeout(timer); if (ctrl) ctrl.abort(); }, get first() { return first; } };
}
