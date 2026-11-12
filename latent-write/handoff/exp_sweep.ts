// Threshold sweep for the masked-char detector on the held-out set (experiment only:
// thresholds tuned here would be fit on the eval set, so this sizes the trade-off,
// it does not produce shippable thresholds).
import { readFileSync } from "fs";
import { score, charGrams, normalize, ngramLogit, styleLogit, words, rawWordCount, thresholdFor } from "../shared/core";
import keepWords from "../shared/keep.json";

const m = JSON.parse(readFileSync("client/src/data/model.json", "utf8"));
const rows = JSON.parse(readFileSync("handoff/heldout_sample.json", "utf8"));
const ai = rows.filter((r: any) => r.label === 1);
const hu = rows.filter((r: any) => r.label === 0);
const KEEP = new Set<string>(keepWords as string[]);
function shape(w: string): string {
  if (w.includes("'")) return "<w-'>";
  for (const s of ["ing", "ed", "ly", "tion", "ment", "ness", "ity", "ous", "ive", "al", "er", "est", "s"]) if (w.length > s.length + 2 && w.endsWith(s)) return "<w-" + s + ">";
  return w.length > 7 ? "<w-long>" : "<w>";
}
function maskedCharLogit(text: string): number {
  const t = normalize(text);
  const masked = t.split(/(\s+)/).map((tok) => {
    if (/^\s+$/.test(tok) || !tok) return tok;
    return tok.replace(/[a-z]+(?:'[a-z]+)?/g, (w) => KEEP.has(w.toLowerCase()) ? w : shape(w.toLowerCase()));
  }).join("");
  const grams = charGrams(masked);
  const counts = new Map<string, number>();
  for (const g of grams) counts.set(g, (counts.get(g) || 0) + 1);
  let dot = 0, norm = 0;
  counts.forEach((c, g) => { const v = m.chars.vocab[g]; if (!v) return; const x = (1 + Math.log(c)) * v[0]; norm += x * x; dot += x * v[1]; });
  return norm === 0 ? m.chars.bias : dot / Math.sqrt(norm) + m.chars.bias;
}
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
function pMasked(text: string) {
  const t = normalize(text);
  const z = m.stack.a * ngramLogit(m, t) + m.stack.b * styleLogit(m, t) + m.stack.e * maskedCharLogit(text) + m.stack.d * Math.log(Math.max(words(t).length, 1)) + m.stack.c;
  return sigmoid(z);
}
const huP = hu.map((r: any) => pMasked(r.text)).sort((a, b) => b - a);
console.log("Top human p under masked chars:", huP.slice(0, 6).map((x) => x.toFixed(3)).join(" "));
const aiP = ai.map((r: any) => pMasked(r.text));
for (const thr of [0.78, 0.85, 0.88, 0.90, 0.92, 0.94, 0.96]) {
  const ff = huP.filter((p) => p >= thr).length;
  const caught = aiP.filter((p) => p >= thr).length;
  console.log(`thr ${thr}: human false-flag ${ff}/150 (${(100 * ff / 150).toFixed(2)}%), AI caught ${caught}/186 (${(100 * caught / 186).toFixed(1)}%)`);
}
// Which humans flip from unflagged (raw) to flagged (masked) at shipped thresholds?
for (const r of hu) {
  const s = score(m, r.text);
  const pm = pMasked(r.text);
  if (s.p < s.threshold && pm >= s.threshold) {
    console.log(`\nFLIPPED human (raw p ${s.p.toFixed(3)} < thr ${s.threshold.toFixed(3)}; masked p ${pm.toFixed(3)}): ${r.text.slice(0, 160).replace(/\n/g, " ")}...`);
  }
}
