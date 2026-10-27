import fs from "node:fs";
import zlib from "node:zlib";

/* minimal PNG reader: 8-bit, non-interlaced, colour types 2 and 6 */
export function readPng(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error("not a png: " + file);
  let pos = 8, ihdr = null; const idat = [];
  while (pos < b.length) {
    const len = b.readUInt32BE(pos), type = b.toString("ascii", pos + 4, pos + 8);
    const data = b.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], ctype: data[9], interlace: data[12] };
    if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  if (ihdr.depth !== 8 || ihdr.interlace !== 0 || ![2, 6].includes(ihdr.ctype)) return { ...ihdr, pixels: null };
  const bpp = ihdr.ctype === 6 ? 4 : 3, stride = ihdr.w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(ihdr.h * stride);
  for (let y = 0; y < ihdr.h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0, up = y ? out[dst - stride + x] : 0, c = x >= bpp && y ? out[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      out[dst + x] = v & 255;
    }
  }
  return { ...ihdr, bpp, pixels: out };
}

export function colourSet(png, minAlpha = 224) {
  const s = new Set();
  for (let i = 0; i < png.pixels.length; i += png.bpp) {
    if (png.bpp === 4 && png.pixels[i + 3] < minAlpha) continue;
    s.add((png.pixels[i] << 16) | (png.pixels[i + 1] << 8) | png.pixels[i + 2]);
  }
  return s;
}
export const hexToInt = (h) => parseInt(h.slice(1), 16);
