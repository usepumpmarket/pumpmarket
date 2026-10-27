import fs from "node:fs";

export const STATES = ["stated", "absent", "unconfirmed"];
export const REQUIRED = ["chain", "market-source", "ca", "x", "github"];
const PAYLOAD = ["value", "url", "handle"];
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const HOSTS = { x: ["x.com", "twitter.com", "www.x.com", "www.twitter.com"], github: ["github.com", "www.github.com"] };

export function validate(reg) {
  const errs = [];
  if (!reg || typeof reg !== "object" || !reg.records) return ["register has no records"];
  for (const id of REQUIRED) if (!reg.records[id]) errs.push(`missing record: ${id}`);
  for (const [id, r] of Object.entries(reg.records)) {
    if (!STATES.includes(r.state)) { errs.push(`${id}: bad state ${r.state}`); continue; }
    if (!r.label) errs.push(`${id}: no label`);
    if (r.state !== "stated") {
      for (const k of PAYLOAD) if (k in r) errs.push(`${id}: inert record carries ${k}`);
      continue;
    }
    if (!r.source || !r.scope) errs.push(`${id}: stated record needs source and scope`);
    if (id === "ca") {
      if (!r.value || !BASE58.test(r.value)) errs.push("ca: value is not a Solana-shaped address");
      if ("url" in r) errs.push("ca: stores value only");
    }
    if (id === "chain" && !r.value) errs.push("chain: no value");
    if (id === "market-source") {
      try { if (new URL(r.url).protocol !== "https:") errs.push("market-source: url must be https"); } catch { errs.push("market-source: bad url"); }
    }
    if (id === "x" || id === "github") {
      try {
        const u = new URL(r.url);
        if (u.protocol !== "https:" || !HOSTS[id].includes(u.hostname)) errs.push(`${id}: url host not accepted`);
        if (!u.pathname.split("/").filter(Boolean)[0]) errs.push(`${id}: url has no handle`);
      } catch { errs.push(`${id}: bad url`); }
      if ("handle" in r) errs.push(`${id}: handle is derived, never stored`);
    }
  }
  return errs;
}

export function load(file) {
  const reg = JSON.parse(fs.readFileSync(file, "utf8"));
  const errs = validate(reg);
  if (errs.length) throw new Error("register invalid:\n - " + errs.join("\n - "));
  return reg;
}

export const handleOf = (url) => new URL(url).pathname.split("/").filter(Boolean)[0];

/* what the browser may see: no dates, no provenance, nothing on inert records */
export function publicView(reg) {
  const out = { records: {} };
  for (const [id, r] of Object.entries(reg.records)) {
    const o = { state: r.state, label: r.label };
    if (r.state === "stated") { if (r.value) o.value = r.value; if (r.url) o.url = r.url; }
    out.records[id] = o;
  }
  return out;
}

/* every stated string value an address scanner may legitimately meet */
export function statedValues(reg) {
  const s = new Set();
  for (const r of Object.values(reg.records)) if (r.state === "stated") { if (r.value) s.add(r.value); if (r.url) s.add(r.url); }
  return s;
}
