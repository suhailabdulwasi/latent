// Recompute the Latent Write row of the Accuracy page's external table
// from ext_sample.json (680 texts) with the current client/src/data/model.json.
// Same methodology as training/build_eval.py: per-text length-bucket threshold.
import { readFileSync } from "fs";
import { score } from "../shared/core";
const m = JSON.parse(readFileSync("client/src/data/model.json", "utf8"));
const sample = JSON.parse(readFileSync("/home/user/data/ext_sample.json", "utf8"));
const rows = sample.map((r: any) => ({ ...r, s: score(m, r.text) }));
const y = rows.map((r: any) => r.label);
const p = rows.map((r: any) => r.s.p);
const flagged = rows.map((r: any) => r.s.p >= r.s.threshold);
// AUC (Mann-Whitney)
const ai = p.filter((_: any, i: number) => y[i] === 1), hu = p.filter((_: any, i: number) => y[i] === 0);
let wins = 0, ties = 0;
for (const a of ai) for (const h of hu) { if (a > h) wins++; else if (a === h) ties++; }
const auc = (wins + 0.5 * ties) / (ai.length * hu.length);
const modern = rows.filter((r: any) => r.label === 1 && (r.source.startsWith("Latent-gen") || r.unseen));
const nonhc3 = rows.filter((r: any) => r.source !== "HC3");
const y2 = nonhc3.map((r: any) => r.label), p2 = nonhc3.map((r: any) => r.s.p);
const ai2 = p2.filter((_: any, i: number) => y2[i] === 1), hu2 = p2.filter((_: any, i: number) => y2[i] === 0);
let w2 = 0, t2 = 0;
for (const a of ai2) for (const h of hu2) { if (a > h) w2++; else if (a === h) t2++; }
console.log(JSON.stringify({
  n: rows.length,
  auc: +auc.toFixed(4),
  auc_no_hc3: +((w2 + 0.5 * t2) / (ai2.length * hu2.length)).toFixed(4),
  caught: +(flagged.filter((f: boolean, i: number) => y[i] === 1).filter(Boolean).length / ai.length).toFixed(4),
  caught_modern: +(modern.filter((r: any) => r.s.p >= r.s.threshold).length / modern.length).toFixed(4),
  false_flag: +(flagged.filter((f: boolean, i: number) => y[i] === 0).filter(Boolean).length / hu.length).toFixed(4),
  n_modern: modern.length,
}, null, 1));
