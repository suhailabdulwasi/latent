// Detector-only eval on the held-out sample (modern AI texts + human texts).
// Usage: npx tsx handoff/eval_detector.ts <model.json path>
import { readFileSync } from "fs";
import { score } from "../shared/core";
const path = process.argv[2] || "client/src/data/model.json";
const m = JSON.parse(readFileSync(path, "utf8"));
const rows = JSON.parse(readFileSync("handoff/heldout_sample.json", "utf8"));
const ai = rows.filter((r: any) => r.label === 1);
const hu = rows.filter((r: any) => r.label === 0);
let caught = 0, meanP = 0;
for (const r of ai) { const s = score(m, r.text); caught += +(s.p >= s.threshold); meanP += s.p; }
let ff = 0, huP = 0;
for (const r of hu) { const s = score(m, r.text); ff += +(s.p >= s.threshold); huP += s.p; }
console.log(`model: ${path}`);
console.log(`AI caught: ${caught}/${ai.length} = ${(100 * caught / ai.length).toFixed(1)}%  mean p ${(meanP / ai.length).toFixed(3)}`);
console.log(`human false-flag: ${ff}/${hu.length} = ${(100 * ff / hu.length).toFixed(2)}%  mean p ${(huP / hu.length).toFixed(3)}`);
// per AI model
const byModel: Record<string, { n: number; c: number }> = {};
for (const r of ai) { const s = score(m, r.text); byModel[r.model] ??= { n: 0, c: 0 }; byModel[r.model].n++; byModel[r.model].c += +(s.p >= s.threshold); }
for (const [k, v] of Object.entries(byModel)) console.log(`  AI ${k}: ${v.c}/${v.n} = ${(100 * v.c / v.n).toFixed(1)}%`);
// per human source
const bySrc: Record<string, { n: number; f: number }> = {};
for (const r of hu) { const s = score(m, r.text); bySrc[r.source] ??= { n: 0, f: 0 }; bySrc[r.source].n++; bySrc[r.source].f += +(s.p >= s.threshold); }
for (const [k, v] of Object.entries(bySrc)) console.log(`  human ${k}: ${v.f}/${v.n} false-flagged`);
// mean component logits, AI vs human
const comp = (rs: any[]) => { const a = { n: 0, s: 0, c: 0 }; for (const r of rs) { const x = score(m, r.text); a.n += x.ngramLogit; a.s += x.styleLogit; a.c += x.charLogit; } return { ngram: +(a.n / rs.length).toFixed(2), style: +(a.s / rs.length).toFixed(2), chars: +(a.c / rs.length).toFixed(2) }; };
console.log("mean logits AI:", JSON.stringify(comp(ai)));
console.log("mean logits human:", JSON.stringify(comp(hu)));
