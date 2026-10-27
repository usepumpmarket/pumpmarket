import { reveal, spotlight, progressBar, parallax, tracer } from "./motion.js";
import { startMarket } from "./market.js";
import { bindToast, wireCopyButton } from "./copy.js";

document.documentElement.classList.add("js");

let reg = { records: {} };
try { reg = JSON.parse(document.getElementById("register-data").textContent); } catch { /* page still renders inert */ }
const rec = (id) => reg.records[id] || { state: "absent" };

bindToast(document.getElementById("toast"), document.getElementById("live"));

/* contract address: inert until the register states it */
const ca = rec("ca");
const caBtn = document.querySelector("button.ca-box");
if (ca.state === "stated" && ca.value && caBtn) {
  const hint = caBtn.querySelector(".ca-hint-text");
  wireCopyButton(caBtn, () => ca.value, (done) => {
    hint.textContent = done ? "Copied" : "Blocked";
    setTimeout(() => { hint.textContent = "Copy"; }, 1400);
  });
}

progressBar(document.getElementById("progress"));
spotlight(document);
reveal(document);
const hero = document.getElementById("hero");
if (hero) { parallax(hero); const svg = hero.querySelector(".art-chart"); if (svg) tracer(svg); }

/* the market follows the market-source record and nothing else */
startMarket({ source: rec("market-source"), root: document });
