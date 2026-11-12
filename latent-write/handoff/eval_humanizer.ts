// Self-contained benchmark for the humanizer. Run from the repo root:  npx tsx handoff/eval_humanizer.ts
// For every held-out AI text, runs the humanizer 10 times (seeds 1..10, like the site does), keeps the
// variant the detector scores lowest, and reports how many are still flagged "Likely AI".
import { readFileSync } from "fs";
import { score } from "../shared/core";
import { humanize, Tone } from "../shared/humanize";
const m = JSON.parse(readFileSync("client/src/data/model.json", "utf8"));
const rows = JSON.parse(readFileSync("handoff/heldout_sample.json", "utf8"));
const ai = rows.filter((r: any) => r.label === 1);
const tones: Tone[] = ["casual", "standard", "academic"];
console.log(`AI texts: ${ai.length}`);
let base = 0; for (const r of ai) { const s = score(m, r.text); base += +(s.p >= s.threshold); }
console.log(`No humanizing: ${(100 * base / ai.length).toFixed(1)}% flagged`);
for (const tone of tones) for (const strength of [2, 3] as const) {
  let flagged = 0, avg = 0;
  for (const r of ai) {
    let bp = 1;
    for (let i = 1; i <= 10; i++) bp = Math.min(bp, score(m, humanize(r.text, { tone, strength, seed: i }).text).p);
    avg += bp; flagged += +(bp >= score(m, r.text).threshold);
  }
  console.log(`${tone} strength ${strength}: ${(100 * flagged / ai.length).toFixed(1)}% still flagged, mean score ${(avg / ai.length).toFixed(3)}`);
}
