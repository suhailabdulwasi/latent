import { readFileSync, writeFileSync } from "fs";
import { score, ModelFile } from "../shared/core";
import { humanize, Tone } from "../shared/humanize";
const D = "/home/user/data";
const m: ModelFile = JSON.parse(readFileSync(`${D}/model.json`, "utf8"));
const load = (f: string) => readFileSync(`${D}/${f}`, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const test = load("test_rows.jsonl"), unseen = load("unseen_rows.jsonl");
const thr = m.calibration.threshold;
const modern = [...test.filter((r) => r.label === 1 && r.source.startsWith("Latent-gen")), ...unseen];
const tone: Tone = (process.argv[2] as Tone) || "standard";
let fb = 0, fa = 0, sb = 0, sa = 0; const t0 = Date.now(); const samples: any[] = [];
for (const r of modern) {
  const p0 = score(m, r.text).p;
  let best = { p: 2, text: r.text };
  for (let seed = 1; seed <= 6; seed++) for (const strength of [2, 3] as const) {
    const h = humanize(r.text, { tone, strength, seed }); const p = score(m, h.text).p;
    if (p < best.p) best = { p, text: h.text };
  }
  fb += +(p0 >= thr); fa += +(best.p >= thr); sb += p0; sa += best.p;
  samples.push({ model: r.model, orig: r.text, hum: best.text, p0, p1: best.p });
}
console.log(tone, "n", modern.length, "flag", (fb / modern.length).toFixed(3), "->", (fa / modern.length).toFixed(3), "avg", (sb / modern.length).toFixed(3), "->", (sa / modern.length).toFixed(3), "ms/text", ((Date.now() - t0) / modern.length).toFixed(0));
writeFileSync(`${D}/auto_${tone}.json`, JSON.stringify(samples));
