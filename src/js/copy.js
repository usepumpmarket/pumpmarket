let toastEl, liveEl, timer;
export function bindToast(toast, live) { toastEl = toast; liveEl = live; }
export function say(msg) {
  if (liveEl) liveEl.textContent = msg;
  if (!toastEl) return;
  toastEl.textContent = msg; toastEl.classList.add("on");
  clearTimeout(timer); timer = setTimeout(() => toastEl.classList.remove("on"), 1600);
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove(); return ok;
  }
}
const COPY_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-1a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8.5 3.2 3.2L13 4.8"/></svg>';
export { COPY_SVG, CHECK_SVG };
export function wireCopyButton(btn, getText, onDone) {
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    const ok = await copyText(getText());
    say(ok ? "Address copied" : "Copy blocked by the browser");
    if (onDone) onDone(ok);
    if (!ok) return;
    btn.classList.add("is-copied");
    const swap = btn.classList.contains("copy");
    if (swap) btn.innerHTML = CHECK_SVG;
    setTimeout(() => { btn.classList.remove("is-copied"); if (swap) btn.innerHTML = COPY_SVG; }, 1400);
  });
}
