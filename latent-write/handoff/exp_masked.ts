// Full-detector eval with topic-blind (masked) char grams, existing stack + thresholds.
// No fitting on the held-out set: the masking transform is fixed a priori
// (same keep list / shape function the n-gram model already uses).
// Run from repo root:  npx tsx handoff/exp_masked.ts
import { readFileSync } from "fs";
import { score, charGrams, normalize, ngramLogit, styleLogit, words, rawWordCount, thresholdFor } from "../shared/core";
import { humanize } from "../shared/humanize";
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
function maskedText(t: string): string {
  return normalize(t).split(/(\s+)/).map((tok) => {
    if (/^\s+$/.test(tok) || !tok) return tok;
    return tok.replace(/[a-z]+(?:'[a-z]+)?/g, (w) => KEEP.has(w.toLowerCase()) ? w : shape(w.toLowerCase()));
  }).join("");
}
function maskedCharLogit(text: string): number {
  const grams = charGrams(maskedText(text));
  const counts = new Map<string, number>();
  for (const g of grams) counts.set(g, (counts.get(g) || 0) + 1);
  let dot = 0, norm = 0;
  counts.forEach((c, g) => {
    const v = m.chars.vocab[g];
    if (!v) return;
    const x = (1 + Math.log(c)) * v[0];
    norm += x * x; dot += x * v[1];
  });
  return norm === 0 ? m.chars.bias : dot / Math.sqrt(norm) + m.chars.bias;
}
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
function scoreMasked(text: string) {
  const t = normalize(text);
  const a = ngramLogit(m, t), b = styleLogit(m, t), e = maskedCharLogit(text);
  const z = m.stack.a * a + m.stack.b * b + m.stack.e * e + m.stack.d * Math.log(Math.max(words(t).length, 1)) + m.stack.c;
  return { p: sigmoid(z), ngram: a, style: b, chars: e, threshold: thresholdFor(m, rawWordCount(t)) };
}
function summarize(name: string, fn: (t: string) => { p: number; threshold: number }) {
  let aiFlag = 0, huFlag = 0;
  let aiP = 0, huP = 0;
  for (const r of ai) { const s = fn(r.text); aiFlag += +(s.p >= s.threshold); aiP += s.p; }
  for (const r of hu) { const s = fn(r.text); huFlag += +(s.p >= s.threshold); huP += s.p; }
  console.log(`${name}: AI caught ${(100 * aiFlag / ai.length).toFixed(1)}% (mean p ${(aiP / ai.length).toFixed(3)}), human false-flag ${(100 * huFlag / hu.length).toFixed(2)}% (${huFlag}/${hu.length}, mean p ${(huP / hu.length).toFixed(3)})`);
}
summarize("raw chars (shipped)", (t) => score(m, t));
summarize("masked chars (same stack/thr)", scoreMasked);

// Humanizer flagged rate under masked chars, standard/strong best-of-10
let flagged = 0, avg = 0;
for (const r of ai) {
  let bp = 1;
  for (let i = 1; i <= 10; i++) bp = Math.min(bp, scoreMasked(humanize(r.text, { tone: "standard", strength: 3, seed: i }).text).p);
  avg += bp; flagged += +(bp >= score(m, r.text).threshold);
}
console.log(`humanizer standard/strong, masked chars: ${(100 * flagged / ai.length).toFixed(1)}% still flagged, mean best p ${(avg / ai.length).toFixed(3)} (raw chars: 47.8%)`);

// Oracle synonym swap on the failure sample: replace top non-keep contributors
const samples = JSON.parse(readFileSync("client/src/data/samples.json", "utf8"));
const SYN: Record<string, string> = {
  curiosity: "interest", curious: "interested", feedback: "input", failure: "setback",
  failures: "setbacks", classmates: "peers", assignments: "tasks", instructors: "teachers",
  frustration: "annoyance", missteps: "mistakes", highlights: "shows", "risk-taking": "taking risks",
};
function swap(t: string) {
  let out = t;
  for (const [k, v] of Object.entries(SYN)) out = out.replace(new RegExp(`\\b${k}\\b`, "gi"), (mm) => mm[0] === mm[0].toUpperCase() ? v[0].toUpperCase() + v.slice(1) : v);
  return out;
}
const s = samples.ai.text as string;
for (const [name, t] of [["orig", s], ["orig + synonym swap", swap(s)], ["humanized", humanize(s, { tone: "standard", strength: 3, seed: 7 }).text], ["humanized + synonym swap", swap(humanize(s, { tone: "standard", strength: 3, seed: 7 }).text)]] as const) {
  const sc = score(m, t);
  console.log(`${name.padEnd(26)} p ${sc.p.toFixed(3)}  ngram ${sc.ngram.toFixed(2)}  style ${sc.style.toFixed(2)}  chars ${sc.chars.toFixed(2)}`);
}
