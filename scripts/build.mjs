import { build } from "./lib/build.mjs";

const { outDir } = build();
console.log(`built -> ${outDir}`);
