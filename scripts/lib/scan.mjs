/* Address-shaped string scanner. It never rejects a pattern wholesale:
   a 0x-prefixed literal that is not 40 hex digits (a colour, a mask, a flag)
   passes, and an address-shaped string passes only when the register states it. */
const B58 = /(?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{32,44}(?![1-9A-HJ-NP-Za-km-z])/g;
const EVM = /(?<![0-9a-zA-Z])0x[0-9a-fA-F]{40}(?![0-9a-zA-Z])/g;
const mixed = (s) => /[0-9]/.test(s) && /[A-Za-z]/.test(s);

export function addressShapes(text) {
  const hits = [], spans = [];
  for (const m of text.matchAll(EVM)) { hits.push({ kind: "evm", value: m[0], at: m.index }); spans.push([m.index, m.index + m[0].length]); }
  for (const m of text.matchAll(B58)) {
    const inside = spans.some(([a, b]) => m.index >= a && m.index < b);
    if (mixed(m[0]) && !inside) hits.push({ kind: "base58", value: m[0], at: m.index });
  }
  return hits;
}

/* stripCaSlot: the CA slot is exempt, everything else is held to the registry */
export function scan(text, stated, { stripCaSlot = true } = {}) {
  let t = text;
  if (stripCaSlot) t = t.replace(/<section[^>]*data-ca-slot[\s\S]*?<\/section>/g, "");
  return addressShapes(t).filter((h) => !stated.has(h.value));
}

const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function randomAddress(len = 44) {
  let s;
  do { s = Array.from({ length: len }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join(""); } while (!mixed(s));
  return s;
}
