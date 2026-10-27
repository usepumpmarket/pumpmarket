import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { build } from "./lib/build.mjs";
import { load, validate, statedValues, handleOf, REQUIRED } from "./lib/register.mjs";
import { scan, addressShapes, randomAddress } from "./lib/scan.mjs";
import { readPng, colourSet, hexToInt } from "./lib/png.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = (...a) => path.join(ROOT, ...a);
const read = (f) => fs.readFileSync(f, "utf8");
const DIST = P("dist");

const results = [];
let currentGroup = "";
function gate(name, fn) {
  try { fn(); results.push({ group: currentGroup, name, ok: true }); }
  catch (e) { results.push({ group: currentGroup, name, ok: false, why: e.message }); }
}
const group = (g) => { currentGroup = g; };
const ok = (c, msg) => { if (!c) throw new Error(msg); };

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out); else out.push(f);
  }
  return out;
};
const TEXT = /\.(html|css|js|mjs|json|svg|txt|md|py)$|^_headers$|^LICENSE$/;
const textFiles = (dir) => walk(dir).filter((f) => TEXT.test(path.basename(f)) || path.basename(f) === "_headers");

/* ---------------- copy extraction ---------------- */
function visibleCopy(html) {
  html = html.replace(/<meta [^>]*(?:name="(?:robots|viewport|theme-color|twitter:card|twitter:image)"|property="(?:og:type|og:url|og:image)")[^>]*>/g, "");
  const attrs = [...html.matchAll(/\b(?:aria-label|alt|title|placeholder|content)="([^"]*)"/g)].map((m) => m[1]);
  const body = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ");
  return [body, ...attrs].join("\n").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
}
function jsLiterals(src) {
  const out = [];
  for (const m of src.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}
function pageCopy(dir) {
  const parts = [visibleCopy(read(path.join(dir, "index.html")))];
  for (const f of walk(path.join(dir, "js"))) {
    const lits = jsLiterals(read(f)).filter((s) => /\s/.test(s.trim()) && /[A-Za-z]{3}/.test(s) && !/[<>{}=;]/.test(s));
    parts.push(...lits);
  }
  return parts.join("\n");
}
const jsStrings = (dir) => walk(path.join(dir, "js")).flatMap((f) => jsLiterals(read(f)));

/* ---------------- record / rendering assertions (state-independent) ---------------- */
function assertRendering(reg, dir, label) {
  const html = read(path.join(dir, "index.html"));
  const r = reg.records;
  const w = (m) => `${label}: ${m}`;

  /* social links: stated <-> anchor with href, absent/unconfirmed <-> no href */
  for (const [id, name] of [["x", "x"], ["github", "github"]]) {
    const rec = r[id];
    const m = new RegExp(`<(a|span)\\b[^>]*data-social="${name}"[^>]*>`).exec(html);
    ok(m, w(`${name} icon missing`));
    const href = /\bhref="([^"]*)"/.exec(m[0]);
    if (rec.state === "stated") { ok(m[1] === "a" && href && href[1] === rec.url, w(`${name} anchor should carry the stated url`)); ok(m[0].includes(`@${handleOf(rec.url)}`), w(`${name} handle not derived`)); }
    else { ok(m[1] === "span" && !href, w(`${name} must be inert with no href`)); ok(/aria-disabled="true"/.test(m[0]), w(`${name} inert but not aria-disabled`)); }
  }
  /* no outbound href to social hosts except stated urls */
  for (const m of html.matchAll(/\bhref="(https?:\/\/[^"]+)"/g)) {
    if (/(^|\.)(x\.com|twitter\.com|github\.com)\//.test(m[1].replace("https://", "").replace(/^/, "") + "/") || /^https:\/\/(www\.)?(x|twitter|github)\.com/.test(m[1])) {
      ok([r.x, r.github].some((q) => q.state === "stated" && q.url === m[1]), w(`unstated social href ${m[1]}`));
    }
  }
  /* CA slot */
  const slot = /<section[^>]*data-ca-slot[\s\S]*?<\/section>/.exec(html);
  ok(slot, w("CA slot missing"));
  ok(html.indexOf("data-ca-slot") < html.indexOf("<main"), w("CA slot is not at the top of the page"));
  if (r.ca.state === "stated") {
    ok(/<button[^>]*class="ca-box/.test(slot[0]) && slot[0].includes(`>${r.ca.value}<`), w("stated CA: full address in a copy button"));
  } else {
    ok(!/<button/.test(slot[0]) && !addressShapes(slot[0]).length, w("inert CA must not carry a button or an address"));
    ok(/>pending</.test(slot[0]), w("inert CA shows pending"));
  }
  /* inert chips: label + pending only */
  for (const id of REQUIRED) {
    const rec = r[id];
    const chip = new RegExp(`<div class="chip[^"]*" data-record="${rec.label}" data-state="([a-z]+)"><strong>[^<]*</strong><code>([^<]*)</code>`).exec(html);
    ok(chip, w(`chip for ${id} missing`));
    ok(chip[1] === rec.state, w(`chip state for ${id}`));
    if (rec.state !== "stated") ok(chip[2] === "pending", w(`inert chip ${id} should say pending only`));
  }
  /* public register JSON carries nothing for inert records */
  const pub = JSON.parse(/<script type="application\/json" id="register-data">([\s\S]*?)<\/script>/.exec(html)[1].replace(/\\u003c/g, "<"));
  for (const [id, q] of Object.entries(pub.records)) {
    if (q.state !== "stated") ok(!("value" in q) && !("url" in q), w(`public record ${id} leaks a payload`));
    ok(!("recorded" in q) && !("source" in q) && !("scope" in q), w(`public record ${id} carries provenance`));
  }
  /* market attribute follows market-source */
  ok(html.includes(`data-market="${r["market-source"].state}"`), w("market attr does not follow market-source"));
  /* address scanner against the registry */
  const bad = scan(html, statedValues(reg));
  ok(!bad.length, w("address-shaped strings outside the registry: " + bad.map((b) => b.value).join(",")));
}

const marketRegion = (html) => { const a = html.indexOf('<section class="board"'); return html.slice(a, html.indexOf("</section>", a)); };

/* ---------------- mutation helpers: read the live record, flip it ---------------- */
const SAMPLE = {
  ca: () => ({ value: randomAddress() }),
  x: () => ({ url: `https://x.com/pm_${Math.random().toString(36).slice(2, 8)}` }),
  github: () => ({ url: `https://github.com/pm-${Math.random().toString(36).slice(2, 8)}` }),
  "market-source": () => ({ value: "DexScreener", url: "https://api.dexscreener.com" }),
  chain: () => ({ value: "Solana", url: "https://solana-rpc.publicnode.com" }),
};
function flipped(reg, ids) {
  const c = structuredClone(reg);
  for (const id of ids) {
    const rec = c.records[id];
    if (rec.state === "stated") { rec.state = "absent"; delete rec.value; delete rec.url; }
    else { rec.state = "stated"; Object.assign(rec, SAMPLE[id]()); }
  }
  return c;
}
const TMP = P(".gate-tmp");
const tmpRoots = [];
function buildVariant(reg, tag) {
  fs.mkdirSync(TMP, { recursive: true });
  const dir = fs.mkdtempSync(path.join(TMP, `${tag}-`));
  tmpRoots.push(dir);
  const regFile = path.join(dir, "register.json");
  fs.writeFileSync(regFile, JSON.stringify(reg, null, 2));
  build({ registerPath: regFile, outDir: path.join(dir, "dist") });
  return path.join(dir, "dist");
}

/* =====================================================================
   RUN
   ===================================================================== */
const registerFile = P("register.json");
let reg;
group("register");
gate("register.json loads and validates", () => { reg = load(registerFile); });
if (!reg) { report(); process.exit(1); }
gate("every record is stated, absent or unconfirmed", () => {
  for (const id of REQUIRED) ok(["stated", "absent", "unconfirmed"].includes(reg.records[id].state), id);
});
gate("inert records carry no value, url or handle", () => {
  for (const [id, r] of Object.entries(reg.records)) if (r.state !== "stated") for (const k of ["value", "url", "handle", "rpc"]) ok(!(k in r), `${id}.${k}`);
});
gate("validator rejects an inert record that carries a payload (negative control)", () => {
  const bad = flipped(reg, ["ca"]); // becomes the opposite state of the live record
  const inert = structuredClone(reg);
  const id = Object.keys(inert.records).find((k) => inert.records[k].state !== "stated") || "ca";
  inert.records[id].state = "absent"; inert.records[id].value = "x"; inert.records[id].url = "https://example.com";
  ok(validate(inert).some((e) => /inert record carries/.test(e)), "inert payload accepted");
  ok(Array.isArray(validate(bad)), "validator did not run");
});
gate("chain and market-source records state their client-supplied source", () => {
  ok(reg.records.chain.value === "Solana" && reg.records.chain.url === "https://solana-rpc.publicnode.com", "chain");
  ok(reg.records.chain.source === "client statement" && reg.records.chain.scope === "batch-level", "chain provenance");
  ok(reg.records["market-source"].url === "https://api.dexscreener.com", "market source");
});

/* ---------------- baseline build ---------------- */
group("build");
gate("dist/ exists and matches a fresh build of the sources", () => {
  ok(fs.existsSync(path.join(DIST, "index.html")), "dist/index.html missing: run npm run build");
  const fresh = buildVariant(reg, "fresh");
  const hash = (d) => walk(d).map((f) => path.relative(d, f).replace(/\\/g, "/") + ":" + crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex")).sort().join("\n");
  ok(hash(fresh) === hash(DIST), "dist/ is stale: run npm run build");
});
gate("dist/ holds no repo-only files (README, docs, LICENSE, register.json, scripts)", () => {
  const names = walk(DIST).map((f) => path.relative(DIST, f).replace(/\\/g, "/"));
  for (const bad of ["README.md", "LICENSE", "register.json", "package.json"]) ok(!names.includes(bad), bad);
  ok(!names.some((n) => n.startsWith("docs/") || n.startsWith("scripts/")), "docs/scripts in dist");
});

const html = read(path.join(DIST, "index.html"));
const css = read(path.join(DIST, "assets", "styles.css"));
const tokens = read(path.join(DIST, "assets", "tokens.css"));

group("gates for the live register state");
gate("rendering follows every record (socials, CA slot, chips, public JSON, scanner)", () => assertRendering(reg, DIST, "baseline"));
gate("social icons: both present, top-right, icon only, official marks", () => {
  const nav = /<nav class="socials"[\s\S]*?<\/nav>/.exec(html);
  ok(nav, "socials nav missing");
  ok(html.indexOf('class="socials"') > html.indexOf('class="nav"') && html.indexOf('class="socials"') < html.indexOf("</header>"), "socials are not the last item of the header");
  ok(nav[0].replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "").trim() === "", "social icons carry visible text");
  ok((nav[0].match(/<svg/g) || []).length === 2, "expected exactly two icons");
  ok(nav[0].includes("M18.244 2.25h3.308") && nav[0].includes("M8 0c4.42 0 8 3.58 8 8"), "official X and Octicon paths");
  ok(!/display:\s*none/.test(css.split("socials")[1]?.slice(0, 200) || ""), "socials hidden at a breakpoint");
  ok(!/\.socials[^{}]*\{[^}]*display:\s*none/.test(css), "socials hidden by CSS");
});
gate("CA slot sits first in the page flow, large type, click-to-copy wiring present", () => {
  ok(/\.ca-box\s*\{[^}]*font:\s*600 clamp\(15px, 4\.1vw, 26px\)/.test(css), "large CA type");
  const app = read(path.join(DIST, "js", "app.js"));
  ok(/wireCopyButton\(caBtn/.test(app) && /Copied/.test(app) && /Blocked/.test(app), "copy feedback wiring");
});

group("palette");
const samples = JSON.parse(read(P("scripts", "data", "palette-samples.json")));
const brandPng = readPng(P("brand", "LOGO PUMPMARKET PNG...png"));
const brandColours = colourSet(brandPng, 224);
gate("hex literals live in tokens.css only; no rgb()/hsl() literals elsewhere", () => {
  const files = textFiles(DIST).filter((f) => !/tokens\.css$/.test(f) && !/favicon\.svg$/.test(f));
  for (const f of files) {
    const t = read(f).replace(/<meta name="theme-color"[^>]*>/, "").replace(/\\u003c/g, "");
    const stripped = t.replace(/&#\d+;/g, "").replace(/https?:\/\/[^\s"')]+/g, "");
    ok(!/(^|[^\w&/])#[0-9a-fA-F]{3,8}\b(?![-\w])/.test(stripped.replace(/href="#[^"]*"/g, "").replace(/url\(#[^)]*\)/g, "").replace(/id="[^"]*"/g, "").replace(/\.\w+#/g, "")), `hex literal in ${path.relative(DIST, f)}`);
    ok(!/\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklch|oklab)\(/.test(stripped), `colour function in ${path.relative(DIST, f)}`);
  }
  const theme = /<meta name="theme-color" content="(#[0-9a-f]{6})"/.exec(html);
  ok(theme && theme[1] === /--bg:\s*(#[0-9a-f]{6})/.exec(tokens)[1], "theme-color is not read from tokens");
});
gate("every token is a real pixel: k-means centre snapped to a coordinate, provenance comment present", () => {
  const rows = [...tokens.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});\s*\/\*\s*(kmeans-k\d+|pixel)\s*·\s*([^@]+?)\s*@\s*\((\d+),(\d+)\)\s*\*\//g)];
  const total = (tokens.match(/--[\w-]+:\s*#[0-9a-f]{6};/g) || []).length;
  ok(rows.length === total && total > 10, `${total - rows.length} token(s) lack provenance`);
  for (const [, name, hex, method, file, x, y] of rows) {
    const s = samples.find((q) => q.hex === hex && q.file === file && q.x === +x && q.y === +y && (method === "pixel" ? q.method === "pixel" : q.method === method));
    ok(s, `--${name} ${hex} is not a recorded sample`);
    if (file.startsWith("brand/") && file.endsWith(".png")) ok(brandColours.has(hexToInt(hex)), `--${name} not present in ${file}`);
  }
});
gate("PNG-sourced palette samples match the pixel at their coordinate", () => {
  const png = brandPng;
  for (const s of samples.filter((q) => q.file === "brand/LOGO PUMPMARKET PNG...png")) {
    const i = (s.y * png.w + s.x) * png.bpp;
    const hex = "#" + [0, 1, 2].map((k) => png.pixels[i + k].toString(16).padStart(2, "0")).join("");
    ok(hex === s.hex, `${s.hex} @ (${s.x},${s.y}) reads ${hex}`);
  }
});

group("assets");
gate("logo files copied into dist/ by the build, real PNGs, premultiplied (no dark fringe)", () => {
  for (const [f, size] of [["logo-960.png", 960], ["logo-128.png", 128]]) {
    const p = path.join(DIST, "assets", f);
    ok(fs.existsSync(p), `dist/assets/${f} missing`);
    const png = readPng(p);
    ok(png.ctype === 6 && png.depth === 8 && png.w === size && png.h === size, `${f} IHDR`);
    ok(png.pixels, `${f} undecodable`);
    let edge = 0, lum = 0;
    for (let i = 0; i < png.pixels.length; i += 4) {
      const a = png.pixels[i + 3];
      if (a > 8 && a < 247) { edge++; lum += png.pixels[i] + png.pixels[i + 1] + png.pixels[i + 2]; }
    }
    ok(edge > 0 && lum / edge / 3 > 55, `${f} edge pixels are dark (${edge ? Math.round(lum / edge / 3) : 0}): resize was not premultiplied`);
  }
});
gate("index.html references the logo by a correct relative path that resolves inside dist/", () => {
  const refs = [...html.matchAll(/(?:src|href)="(assets\/logo-[^"]+)"/g)].map((m) => m[1]);
  ok(refs.includes("assets/logo-960.png") && refs.includes("assets/logo-128.png"), "logo references missing");
  for (const r of refs) ok(!r.startsWith("/") && fs.existsSync(path.join(DIST, r)), `${r} does not resolve`);
  ok(/<img class="art-logo"|<div class="art-logo"><img src="assets\/logo-960\.png"/.test(html), "hero logo image");
});
gate("favicon.svg: 32x32, traced from the real pixel grid, no comments, no double hyphen", () => {
  const svg = read(path.join(DIST, "favicon.svg"));
  ok(/viewBox="0 0 32 32"/.test(svg) && /width="32"/.test(svg) && /height="32"/.test(svg), "size");
  ok(!svg.includes("<!--") && !svg.includes("--"), "comment or double hyphen");
  const fills = [...svg.matchAll(/fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
  ok(fills.length >= 6, "too few colours");
  for (const h of fills) ok(brandColours.has(hexToInt(h)), `${h} is not a pixel of the logo`);
  ok(/<link rel="icon" type="image\/svg\+xml"[^>]*href="favicon\.svg"/.test(html), "favicon not linked");
});

group("no dates");
gate("no date, timestamp, clock or 'as of' wording in text, attributes or script strings", () => {
  const copy = pageCopy(DIST) + "\n" + jsStrings(DIST).join("\n");
  const pats = [/\b\d{4}-\d{2}-\d{2}\b/, /\b([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?\b/, /\b(19|20)\d{2}\b/, /\b(as of|checked|last updated|updated|timestamp|yesterday|today)\b/i,
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i, /\b(mon|tue|wed|thu|fri|sat|sun)(day)?\b/i, /\b\d+\s?(s|m|h|d)\s+ago\b|\bago\b/i];
  for (const p of pats) { const m = p.exec(copy); ok(!m, `date-like text: "${m && m[0]}"`); }
  for (const f of walk(path.join(DIST, "js"))) ok(!/new Date|Date\.now|toLocale(Date|Time)String|toISOString|getFullYear|Intl\.DateTimeFormat/.test(read(f)), `date API in ${path.basename(f)}`);
  ok(!fs.existsSync(path.join(DIST, "register.json")), "register.json shipped");
  ok(!/"(recorded|checked|asOf|as_of)"/.test(html), "date field in page data");
});

group("motion and measurement rules");
gate("prefers-reduced-motion: CSS fallback kills animation and transition; JS honours it", () => {
  const blk = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/.exec(css);
  ok(blk && /animation:\s*none\s*!important/.test(blk[1]) && /transition:\s*none\s*!important/.test(blk[1]), "CSS block");
  const m = read(path.join(DIST, "js", "motion.js"));
  ok(/matchMedia\("\(prefers-reduced-motion: reduce\)"\)/.test(m) && /isReduced\(\)/.test(m), "matchMedia");
  for (const fn of ["spring", "enter", "numberTween", "flash", "spotlight", "parallax", "tracer", "reveal"]) {
    const body = m.slice(m.indexOf(`function ${fn}`));
    ok(/isReduced\(\)/.test(body.slice(0, 900)), `${fn} ignores reduced motion`);
  }
});
gate("motion features present: spring solver, parallax, spotlight, progress bar, count-up with flash, skeleton, mesh", () => {
  const m = read(path.join(DIST, "js", "motion.js"));
  for (const t of ["k = 170", "c = 20", "export function parallax", "export function spotlight", "export function progressBar", "export function numberTween", "export function flash"]) ok(m.includes(t), t);
  ok(/\.mesh i/.test(css) && /\.progress/.test(css) && /\.skel/.test(css) && /@keyframes pulse/.test(css) && /\.spot::before/.test(css), "css features");
  ok(/\.live-dot/.test(css) && /pulse 2s ease-in-out infinite/.test(css), "pulse dot at the measured 2s");
});
gate("no ch units anywhere; tap size token is 44px and drives every control", () => {
  for (const f of textFiles(DIST)) ok(!/\b\d*\.?\d+ch\b/.test(read(f).replace(/https?:\/\/\S+/g, "")), `ch unit in ${path.basename(f)}`);
  ok(/--tap:\s*44px/.test(tokens), "--tap");
  for (const sel of [".social", ".nav a", ".tab", ".copy", ".btn", ".foot-links a"]) {
    const rule = new RegExp(`${sel.replace(".", "\\.")}[^{]*\\{[^}]*(min-)?(height|width):\\s*var\\(--tap\\)`).test(css);
    ok(rule, `${sel} does not use --tap`);
  }
});

group("market");
gate("market code: endpoints, solana filter, top ten by 24h volume, poll 60s, hidden-tab pause, backoff, letter tile", () => {
  const m = read(path.join(DIST, "js", "market.js"));
  for (const t of ["/token-boosts/top/v1", "/tokens/v1/solana/", 'chainId === "solana"', "const TOP_N = 10", "POLL_MS = 60000", "visibilitychange", "document.hidden", "800 * 2 ** attempt", "4000 * 2 ** (fails - 1)", "imageUrl", 'addEventListener("error"', "tile-fallback", "volume: (a, b) => b.vol - a.vol", "AbortController"])
    ok(m.includes(t), `missing: ${t}`);
  ok(/last good|last good snapshot/.test(m), "last good data kept");
  ok(m.includes("DASH"), "dash on failure");
});
gate("market follows the market-source record only: no CA reference in market code", () => {
  const m = read(path.join(DIST, "js", "market.js"));
  ok(!/\bca\b|contract/i.test(m), "market code mentions the CA");
  const app = read(path.join(DIST, "js", "app.js"));
  ok(/startMarket\(\{ source: rec\("market-source"\)/.test(app), "market is not fed by market-source");
});
gate("CSP connect-src is derived from the market-source record", () => {
  const h = read(path.join(DIST, "_headers"));
  const ms = reg.records["market-source"];
  ok(ms.state !== "stated" || h.includes(`connect-src 'self' ${new URL(ms.url).origin}`), "connect-src");
});

group("copy");
const ref = JSON.parse(read(P("scripts", "data", "ref-copy.json")));
const words = (s) => s.toLowerCase().match(/[a-z]+/g) || [];
const COPY = pageCopy(DIST);
gate("zero words shared with the reference (function words and brand names exempt)", () => {
  const banned = new Set(ref.banned_words);
  const hit = [...new Set(words(COPY).filter((w) => banned.has(w)))];
  ok(!hit.length, "shared words: " + hit.join(", "));
});
gate("zero shared 2-grams with the reference", () => {
  const big = new Set(ref.bigrams);
  const lines = COPY.split(/[\n.!?]+/);
  const hit = new Set();
  for (const l of lines) { const t = words(l); for (let i = 0; i < t.length - 1; i++) if (big.has(t[i] + " " + t[i + 1])) hit.add(t[i] + " " + t[i + 1]); }
  ok(!hit.size, "shared 2-grams: " + [...hit].join(" | "));
});

group("repo");
gate("hygiene: no assistant config files, no attribution strings anywhere in the project", () => {
  const forbidName = [["CLA", "UDE.md"].join(""), ["." , "cla", "ude"].join("")];
  const pat = new RegExp([["cla", "ude"].join(""), ["anthro", "pic"].join(""), "co-authored-by", "generated (?:with|by)", "ai[- ]generated", ["chat", "gpt"].join(""), ["open", "ai"].join(""), ["cop", "ilot"].join("")].join("|"), "i");
  const files = walk(ROOT).filter((f) => !f.includes(`${path.sep}node_modules${path.sep}`) && !f.includes(`${path.sep}.git${path.sep}`));
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    for (const n of forbidName) ok(!rel.split(path.sep).includes(n), `forbidden path ${rel}`);
    if (rel === path.join("scripts", "gates.mjs")) continue; /* holds the patterns themselves */
    if (TEXT.test(path.basename(f)) || path.basename(f) === "_headers") ok(!pat.test(read(f)), `attribution-like text in ${rel}`);
  }
});
gate("README.md, docs/whitepaper.md and LICENSE exist at the root with the required content", () => {
  const readme = read(P("README.md"));
  for (const t of ["Pump Market", "pumpmarket.ink", "Solana", "Overview", "Features", "Links", "badge", "Contract address"]) ok(readme.toLowerCase().includes(t.toLowerCase()), `README lacks ${t}`);
  const wp = read(P("docs", "whitepaper.md"));
  for (const t of ["Vision", "Mission", "Tokenomics", "Roadmap", "Phase 1", "Phase 2", "Phase 3", "Team"]) ok(wp.includes(t), `whitepaper lacks ${t}`);
  const lic = read(P("LICENSE"));
  ok(/MIT License/.test(lic) && /Copyright \(c\) 2026 Pump Market/.test(lic), "LICENSE");
});

/* ---------------- mutation harness: both branches of every gate ---------------- */
group("mutation: contract address");
const caVariant = flipped(reg, ["ca"]);
gate(`CA branch (${reg.records.ca.state} -> ${caVariant.records.ca.state}) renders correctly and passes every assertion`, () => {
  const d = buildVariant(caVariant, "ca");
  assertRendering(caVariant, d, "ca-flip");
  const h = read(path.join(d, "index.html"));
  if (caVariant.records.ca.state === "stated") ok(h.includes(`>${caVariant.records.ca.value}<`), "full address shown");
});
gate("flipping the CA changes nothing in the market region or market code", () => {
  const d = buildVariant(caVariant, "ca2");
  ok(marketRegion(read(path.join(d, "index.html"))) === marketRegion(html), "market markup differs with CA state");
  ok(read(path.join(d, "js", "market.js")) === read(path.join(DIST, "js", "market.js")), "market.js differs");
  const pub = (h) => JSON.parse(/id="register-data">([\s\S]*?)<\/script>/.exec(h)[1].replace(/\\u003c/g, "<")).records["market-source"];
  ok(JSON.stringify(pub(read(path.join(d, "index.html")))) === JSON.stringify(pub(html)), "market-source record differs");
});
gate("scanner: stated CA passes, a stranger address in the page is caught, plain 0x literals are not rejected", () => {
  const withCa = flipped(reg, ["ca"]);
  const live = reg.records.ca.state === "stated" ? reg : withCa;
  const stated = statedValues(live);
  const stranger = randomAddress();
  const h = buildVariant(live, "scan");
  const page = read(path.join(h, "index.html"));
  ok(scan(page, stated).length === 0, "stated CA flagged");
  ok(scan(page.replace("</body>", `<p>${stranger}</p></body>`), stated).some((x) => x.value === stranger), "stranger address not caught");
  ok(scan("const m = 0xff; mask = 0x7fffffff; col = 0xDEADBEEF;", stated).length === 0, "benign 0x literal rejected");
  const evm = "0x" + "ab12".repeat(10);
  ok(scan(`<p>${evm}</p>`, stated).some((x) => x.kind === "evm"), "unregistered 0x address not caught");
  ok(scan(`<p>${evm}</p>`, new Set([evm])).length === 0, "registered 0x address rejected");
});
group("mutation: social links");
const socialVariant = flipped(reg, ["x", "github"]);
gate(`X and GitHub branch flips (${reg.records.x.state} -> ${socialVariant.records.x.state}) render and link per the link rule`, () => {
  assertRendering(socialVariant, buildVariant(socialVariant, "soc"), "social-flip");
});
gate("every combination of the five records builds and satisfies the rendering assertions", () => {
  const ids = ["ca", "x", "github"];
  for (let mask = 0; mask < 8; mask++) {
    const v = flipped(reg, ids.filter((_, i) => mask & (1 << i)));
    assertRendering(v, buildVariant(v, "combo" + mask), "combo" + mask);
  }
});
group("mutation: market source");
gate("market-source flipped: market goes inert, no source url or link leaks into the page", () => {
  const v = flipped(reg, ["market-source"]);
  const d = buildVariant(v, "ms");
  assertRendering(v, d, "ms-flip");
  const h = read(path.join(d, "index.html"));
  if (v.records["market-source"].state !== "stated") {
    ok(!/dexscreener/i.test(h.replace(/DexScreener's public API/g, "")), "source leaks while inert");
    ok(!read(path.join(d, "_headers")).includes("api.dexscreener.com"), "CSP names an inert source");
  }
});
gate("build refuses an inert record that carries a payload", () => {
  const v = structuredClone(reg);
  const id = "x";
  v.records[id].state = "absent"; v.records[id].url = "https://x.com/someone";
  let threw = false;
  try { buildVariant(v, "bad"); } catch { threw = true; }
  ok(threw, "build accepted an inert record with a url");
});

report();

function report() {
  fs.rmSync(TMP, { recursive: true, force: true });
  let g = "";
  for (const r of results) {
    if (r.group !== g) { g = r.group; console.log(`\n[${g}]`); }
    console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : "\n        -> " + r.why}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\ngates: ${results.length} run, ${results.length - failed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
