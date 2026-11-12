// List candidate words for a char-aware synonym pass: non-keep words ranked by
// total char contribution across held-out AI texts, with doc frequency.
import { readFileSync } from "fs";
import { score, charGrams, normalize } from "../shared/core";
import keepWords from "../shared/keep.json";

const m = JSON.parse(readFileSync("client/src/data/model.json", "utf8"));
const rows = JSON.parse(readFileSync("handoff/heldout_sample.json", "utf8"));
const ai = rows.filter((r: any) => r.label === 1);
const KEEP = new Set<string>(keepWords as string[]);

function wordCharContrib(text: string): Map<string, number> {
  const t = normalize(text);
  const grams = charGrams(t);
  const counts = new Map<string, number>();
  for (const g of grams) counts.set(g, (counts.get(g) || 0) + 1);
  let norm = 0;
  counts.forEach((c, g) => { const v = m.chars.vocab[g]; if (!v) return; const x = (1 + Math.log(c)) * v[0]; norm += x * x; });
  const denom = Math.sqrt(norm) || 1;
  const perWord = new Map<string, number>();
  for (const raw of t.toLowerCase().replace(/[0-9]/g, "0").split(/\s+/)) {
    if (!raw) continue;
    const w = " " + raw + " ";
    const word = raw.replace(/^[^a-z]+|[^a-z]+$/g, "");
    let contrib = 0;
    for (let n = 3; n <= 5; n++) {
      if (w.length < n) continue;
      for (let i = 0; i + n <= w.length; i++) {
        const g = w.slice(i, i + n);
        const v = m.chars.vocab[g];
        if (!v) continue;
        const c = counts.get(g) || 1;
        contrib += ((1 + Math.log(c)) * v[0] * v[1]) / denom / c;
      }
    }
    perWord.set(word, (perWord.get(word) || 0) + contrib);
  }
  return perWord;
}
const totals = new Map<string, number>();
const docs = new Map<string, number>();
const maxPer = new Map<string, number>();
for (const r of ai) {
  const per = wordCharContrib(r.text);
  per.forEach((v, w) => {
    if (!w || KEEP.has(w)) return;
    totals.set(w, (totals.get(w) || 0) + v);
    docs.set(w, (docs.get(w) || 0) + 1);
    maxPer.set(w, Math.max(maxPer.get(w) || -99, v));
  });
}
console.log("Top 80 non-keep words by total char contribution:");
[...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80)
  .forEach(([w, v]) => console.log(`  ${w.padEnd(16)} total ${v.toFixed(2)}  docs ${docs.get(w)}  max-in-one-text ${maxPer.get(w)!.toFixed(2)}`));
