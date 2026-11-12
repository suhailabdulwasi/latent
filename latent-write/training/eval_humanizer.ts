import { readFileSync, writeFileSync } from "fs";
import { score, ModelFile } from "../shared/core";
import { humanize, Tone } from "../shared/humanize";
const D = "/home/user/data";
const m: ModelFile = JSON.parse(readFileSync(`${D}/model.json`, "utf8"));
const load = (f: string) => readFileSync(`${D}/${f}`, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const test = load("test_rows.jsonl"), unseen = load("unseen_rows.jsonl");
// parity check vs python
let maxd = 0;
for (const r of test.slice(0, 600)) maxd = Math.max(maxd, Math.abs(score(m, r.text).p - r.p));
console.log("max |p_js - p_py| over 600 rows:", maxd.toFixed(6));
const modern = [...test.filter((r) => r.label === 1 && r.source.startsWith("Latent-gen")), ...unseen];
const older = test.filter((r) => r.label === 1 && !r.source.startsWith("Latent-gen")).slice(0, 300);
const out: any[] = [];
const summary: any = {};
for (const [name, set] of [["modern", modern], ["older", older]] as const) {
  for (const tone of ["casual", "standard", "academic"] as Tone[]) {
    for (const strength of [2, 3] as const) {
      let before = 0, after = 0, flagB = 0, flagA = 0, wordsB = 0, wordsA = 0;
      for (const r of set) {
        const h = humanize(r.text, { tone, strength, seed: 11 });
        const sa = score(m, r.text), sb = score(m, h.text), a = sa.p, b = sb.p;
        before += a; after += b; flagB += +(a >= sa.threshold); flagA += +(b >= sb.threshold);
        wordsB += r.text.split(/\s+/).length; wordsA += h.text.split(/\s+/).length;
        if (name === "modern" && strength === 3) out.push({ i: out.length, tone, model: r.model, orig: r.text, hum: h.text, p0: a, p1: b });
      }
      const k = `${name}/${tone}/s${strength}`;
      summary[k] = { n: set.length, avg_before: before / set.length, avg_after: after / set.length, flagged_before: flagB / set.length, flagged_after: flagA / set.length, length_ratio: wordsA / wordsB };
      console.log(k, Object.fromEntries(Object.entries(summary[k]).map(([a, b]: any) => [a, +b.toFixed(3)])));
    }
  }
}
writeFileSync(`${D}/humanized_samples.json`, JSON.stringify(out));
writeFileSync(`${D}/humanizer_report.json`, JSON.stringify(summary, null, 1));
