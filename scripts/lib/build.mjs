import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load, publicView, handleOf } from "./register.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const X_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
const GH_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';
const COPY_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-1a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1"/></svg>';

const shortAddr = (a) => `${a.slice(0, 4)}…${a.slice(-4)}`;

function social(rec, icon, name) {
  if (rec.state === "stated") {
    const h = handleOf(rec.url);
    return `<a class="social" data-social="${name}" href="${esc(rec.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(rec.label)} (@${esc(h)})">${icon}</a>`;
  }
  return `<span class="social is-inert" data-social="${name}" role="link" aria-disabled="true" aria-label="${esc(rec.label)}, pending">${icon}</span>`;
}

export function fragments(reg) {
  const r = reg.records;
  const socials = `<nav class="socials" aria-label="Social links" data-socials>${social(r.x, X_ICON, "x")}${social(r.github, GH_ICON, "github")}</nav>`;

  const ca = r.ca.state === "stated"
    ? `<section class="ca" id="ca" data-ca-slot data-state="stated" aria-label="Contract address"><div class="ca-inner"><div class="eyebrow">Contract address</div><button class="ca-box spot" type="button" aria-label="Copy contract address"><span class="ca-value">${esc(r.ca.value)}</span><span class="ca-hint">${COPY_ICON}<span class="ca-hint-text">Copy</span></span></button></div></section>`
    : `<section class="ca" id="ca" data-ca-slot data-state="${r.ca.state}" aria-label="Contract address"><div class="ca-inner"><div class="eyebrow">Contract address</div><div class="ca-box is-inert" aria-disabled="true"><span class="ca-value">pending</span></div></div></section>`;

  const chip = (rec, shown) => `<div class="chip spot${rec.state === "stated" ? "" : " is-inert"}" data-record="${esc(rec.label)}" data-state="${rec.state}"><strong>${esc(rec.label)}</strong><code>${rec.state === "stated" ? esc(shown) : "pending"}</code></div>`;
  const chips = [
    chip(r.chain, r.chain.value),
    chip(r["market-source"], r["market-source"].value),
    r.ca.state === "stated" ? chip(r.ca, shortAddr(r.ca.value)) : chip(r.ca),
    r.x.state === "stated" ? chip(r.x, "@" + handleOf(r.x.url)) : chip(r.x),
    r.github.state === "stated" ? chip(r.github, handleOf(r.github.url)) : chip(r.github),
  ].join("");

  const ms = r["market-source"];
  const marketAttrs = `data-market="${ms.state}"`;
  let footSource = "";
  if (ms.state === "stated") {
    const host = new URL(ms.url).hostname.replace(/^api\./, "");
    footSource = `<a href="https://${esc(host)}" target="_blank" rel="noopener noreferrer">Data by ${esc(ms.value || host)}</a>`;
  }
  return { socials, ca, chips, marketAttrs, footSource };
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

export function build({ registerPath = path.join(ROOT, "register.json"), outDir = path.join(ROOT, "dist") } = {}) {
  const reg = load(registerPath);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, "assets"), { recursive: true });

  /* logo and favicon are copied by name, so a missing file fails the build */
  for (const f of ["logo-960.png", "logo-128.png"]) fs.copyFileSync(path.join(ROOT, "src", "assets", f), path.join(outDir, "assets", f));
  fs.copyFileSync(path.join(ROOT, "src", "assets", "favicon.svg"), path.join(outDir, "favicon.svg"));
  for (const f of ["tokens.css", "styles.css"]) fs.copyFileSync(path.join(ROOT, "src", f), path.join(outDir, "assets", f));
  copyDir(path.join(ROOT, "src", "js"), path.join(outDir, "js"));

  const tokens = fs.readFileSync(path.join(ROOT, "src", "tokens.css"), "utf8");
  const theme = /--bg:\s*(#[0-9a-fA-F]{6})/.exec(tokens)[1];
  const f = fragments(reg);
  const json = JSON.stringify(publicView(reg)).replace(/</g, "\\u003c");
  const html = fs.readFileSync(path.join(ROOT, "src", "index.html"), "utf8")
    .replace("{{THEME}}", () => theme).replace("{{SOCIALS}}", () => f.socials).replace("{{CA_SLOT}}", () => f.ca)
    .replace("{{CHIPS}}", () => f.chips).replace("{{MARKET_ATTRS}}", () => f.marketAttrs).replace("{{FOOT_SOURCE}}", () => f.footSource)
    .replace("{{REGISTER_JSON}}", () => json);
  if (/\{\{[A-Z_]+\}\}/.test(html)) throw new Error("unfilled template slot");
  fs.writeFileSync(path.join(outDir, "index.html"), html);

  const ms = reg.records["market-source"];
  const connect = ["'self'"].concat(ms.state === "stated" ? [new URL(ms.url).origin] : []).join(" ");
  fs.writeFileSync(path.join(outDir, "_headers"), [
    "/*",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    `  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src ${connect}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(outDir, "robots.txt"), "User-agent: *\nAllow: /\n");
  return { outDir, reg, html };
}
