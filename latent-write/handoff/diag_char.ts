// Diagnosis for the humanizer plateau: quantify the char-model wall.
// Run from repo root:  npx tsx handoff/diag_char.ts
// - per-component logits before/after humanizing (AI) vs human reference
// - per-word char contributions, aggregated over held-out AI texts
// - top char contributors on the "learning from failure" site sample
import { readFileSync } from "fs";
import { score, charGrams, normalize, words } from "../shared/core";
import { humanize } from "../shared/humanize";
import keepWords from "../shared/keep.json";

const m = JSON.parse(readFileSync("client/src/data/model.json", "utf8"));
const rows = JSON.parse(readFileSync("handoff/heldout_sample.json", "utf8"));
const ai = rows.filter((r: any) => r.label === 1);
const hu = rows.filter((r: any) => r.label === 0);
const KEEP = new Set<string>(keepWords as string[]);

function mean(xs: number[]) { return xs.reduce((a, b) => a + b, 0) / xs.length; }

// 1. Component logits before/after (best-of-10, standard/strong) vs human reference
const before = ai.map((r: any) => score(m, r.text));
const after = ai.map((r: any) => {
  let best: any = null;
  for (let i = 1; i <= 10; i++) {
    const s = score(m, humanize(r.text, { tone: "standard", strength: 3, seed: i }).text);
    if (!best || s.p < best.p) best = s;
  }
  return best;
});
const href = hu.map((r: any) => score(m, r.text));
console.log("mean logits  ngram  style  chars   p");
console.log(`AI before   ${mean(before.map((s: any) => s.ngram)).toFixed(2)}  ${mean(before.map((s: any) => s.style)).toFixed(2)}  ${mean(before.map((s: any) => s.chars)).toFixed(2)}  ${mean(before.map((s: any) => s.p)).toFixed(3)}`);
console.log(`AI after    ${mean(after.map((s: any) => s.ngram)).toFixed(2)}  ${mean(after.map((s: any) => s.style)).toFixed(2)}  ${mean(after.map((s: any) => s.chars)).toFixed(2)}  ${mean(after.map((s: any) => s.p)).toFixed(3)}`);
console.log(`Human       ${mean(href.map((s: any) => s.ngram)).toFixed(2)}  ${mean(href.map((s: any) => s.style)).toFixed(2)}  ${mean(href.map((s: any) => s.chars)).toFixed(2)}  ${mean(href.map((s: any) => s.p)).toFixed(3)}`);
const stillFlagged = after.filter((s: any, i: number) => s.p >= score(m, ai[i].text).threshold);
console.log(`still flagged after humanizing: ${stillFlagged.length}/${ai.length}`);
console.log(`mean char logit of still-flagged: ${mean(stillFlagged.map((s: any) => s.chars)).toFixed(2)} (human: ${mean(href.map((s: any) => s.chars)).toFixed(2)})`);

// 2. Per-word char contributions.
// partLogit: x = (1+log c) * idf, logit = sum(x*w)/sqrt(sum x^2) + bias.
// Attribute each gram's x*w/sqrt(norm) to the word whose padded form produced it.
function wordCharContrib(text: string): Map<string, number> {
  const t = normalize(text);
  const grams = charGrams(t);
  const counts = new Map<string, number>();
  for (const g of grams) counts.set(g, (counts.get(g) || 0) + 1);
  let norm = 0;
  counts.forEach((c, g) => {
    const v = m.chars.vocab[g];
    if (!v) return;
    const x = (1 + Math.log(c)) * v[0];
    norm += x * x;
  });
  const denom = Math.sqrt(norm) || 1;
  const perWord = new Map<string, number>();
  const perWordKeep = new Map<string, number>(); // contribution from grams inside keep vs non-keep words
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
        const x = (1 + Math.log(c)) * v[0];
        // split this gram's contribution evenly across its occurrences is
        // approximated by dividing by the gram's total count in the text
        contrib += (x * v[1]) / denom / c;
      }
    }
    perWord.set(word, (perWord.get(word) || 0) + contrib);
    perWordKeep.set(KEEP.has(word) ? "keep" : "nonkeep", (perWordKeep.get(KEEP.has(word) ? "keep" : "nonkeep") || 0) + contrib);
  }
  return perWord;
}

const totals = new Map<string, number>();
const docFreq = new Map<string, number>();
let keepShare = 0, nonkeepShare = 0;
for (const r of ai) {
  const per = wordCharContrib(r.text);
  const seen = new Set<string>();
  per.forEach((v, w) => {
    if (!w) return;
    totals.set(w, (totals.get(w) || 0) + v);
    if (!seen.has(w)) { docFreq.set(w, (docFreq.get(w) || 0) + 1); seen.add(w); }
  });
  // share split: recompute via keep map
  const t = normalize(r.text);
  const grams = charGrams(t);
  const counts = new Map<string, number>();
  for (const g of grams) counts.set(g, (counts.get(g) || 0) + 1);
  let norm = 0;
  counts.forEach((c, g) => { const v = m.chars.vocab[g]; if (!v) return; const x = (1 + Math.log(c)) * v[0]; norm += x * x; });
  const denom = Math.sqrt(norm) || 1;
  for (const raw of t.toLowerCase().replace(/[0-9]/g, "0").split(/\s+/)) {
    if (!raw) continue;
    const w = " " + raw + " ";
    const word = raw.replace(/^[^a-z]+|[^a-z]+$/g, "");
    const isKeep = KEEP.has(word);
    for (let n = 3; n <= 5; n++) {
      if (w.length < n) continue;
      for (let i = 0; i + n <= w.length; i++) {
        const g = w.slice(i, i + n);
        const v = m.chars.vocab[g];
        if (!v) continue;
        const c = counts.get(g) || 1;
        const x = (1 + Math.log(c)) * v[0];
        const contrib = (x * v[1]) / denom / c;
        if (isKeep) keepShare += contrib; else nonkeepShare += contrib;
      }
    }
  }
}
console.log(`\nchar-logit contribution share across AI texts: keep words ${keepShare.toFixed(1)} vs non-keep (topic) words ${nonkeepShare.toFixed(1)}`);
console.log("\nTop 40 words by total positive char contribution (AI texts):");
[...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)
  .forEach(([w, v]) => console.log(`  ${w.padEnd(16)} total ${v.toFixed(2)}  in ${docFreq.get(w)} texts  keep=${KEEP.has(w)}`));

// 3. The "learning from failure" site sample
const samples = JSON.parse(readFileSync("client/src/data/samples.json", "utf8"));
const sample = samples.ai.text as string;
const s0 = score(m, sample);
const h = humanize(sample, { tone: "standard", strength: 3, seed: 7 });
const s1 = score(m, h.text);
console.log(`\nFailure sample: p ${s0.p.toFixed(3)} (ngram ${s0.ngram.toFixed(2)} style ${s0.style.toFixed(2)} chars ${s0.chars.toFixed(2)}) -> after humanize p ${s1.p.toFixed(3)} (ngram ${s1.ngram.toFixed(2)} style ${s1.style.toFixed(2)} chars ${s1.chars.toFixed(2)})`);
const per = wordCharContrib(sample);
console.log("Top char-contributing words in the failure sample (before humanizing):");
[...per.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
  .forEach(([w, v]) => console.log(`  ${w.padEnd(16)} ${v.toFixed(3)}  keep=${KEEP.has(w)}`));
const per1 = wordCharContrib(h.text);
console.log("Top char-contributing words in the failure sample (after humanizing):");
[...per1.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
  .forEach(([w, v]) => console.log(`  ${w.padEnd(16)} ${v.toFixed(3)}  keep=${KEEP.has(w)}`));
