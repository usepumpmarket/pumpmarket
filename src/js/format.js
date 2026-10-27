export const DASH = "\u2014";
export const usd = (n) => !Number.isFinite(n) ? DASH
  : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B`
  : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M`
  : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K`
  : `$${n.toFixed(0)}`;
export const price = (n) => {
  if (!Number.isFinite(n)) return DASH;
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  if (n === 0) return "$0";
  const digits = Math.min(12, Math.max(4, 3 - Math.floor(Math.log10(n))));
  return `$${n.toFixed(digits)}`;
};
export const change = (n) => !Number.isFinite(n) ? DASH : `${n >= 0 ? "\u25B2" : "\u25BC"} ${Math.abs(n).toFixed(2)}%`;
export const count = (n) => Number.isFinite(n) ? String(Math.round(n)) : DASH;
export const short = (a) => (a.length > 12 ? `${a.slice(0, 4)}\u2026${a.slice(-4)}` : a);
