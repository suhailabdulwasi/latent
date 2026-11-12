// Experiments for the char-model wall: which global edits actually move the char logit?
// Run from repo root:  npx tsx handoff/exp_char.ts
import { readFileSync } from "fs";
import { score, charGrams, normalize } from "../shared/core";
import { humanize } from "../shared/humanize";

const m = JSON.parse(readFileSync("client/src/data/model.json", "utf8"));
const rows = JSON.parse(readFileSync("handoff/heldout_sample.json", "utf8"));
const ai = rows.filter((r: any) => r.label === 1);
const hu = rows.filter((r: any) => r.label === 0);

// Word rates per 100 words, AI vs human
function rate(texts: any[], w: string) {
  let n = 0, tot = 0;
  for (const r of texts) {
    const ws = r.text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || [];
    tot += ws.length; n += ws.filter((x: string) => x === w).length;
  }
  return (100 * n / tot).toFixed(2);
}
for (const w of ["that", "and", "to", "the", "of", "a", "it", "is", "in", "you", "i"]) {
  console.log(`${w.padEnd(5)} AI ${rate(ai, w)} /100w   human ${rate(hu, w)} /100w`);
}

// Oracle edits on the failure sample + a few AI texts
const samples = JSON.parse(readFileSync("client/src/data/samples.json", "utf8"));
const texts = [samples.ai.text, ...ai.slice(0, 4).map((r: any) => r.text)];
function report(name: string, t: string) {
  const s = score(m, t);
  console.log(`${name.padEnd(28)} p ${s.p.toFixed(3)}  ngram ${s.ngram.toFixed(2)}  style ${s.style.toFixed(2)}  chars ${s.chars.toFixed(2)}`);
}
const delThat = (t: string) => t.replace(/\bthat\s+(?=(?:i|you|he|she|we|they|it|there|this|the|a|an|my|his|her|our|their)\b)/gi, "");
const delThatAll = (t: string) => t.replace(/\bthat\b\s*/gi, "");
for (let i = 0; i < texts.length; i++) {
  const t = texts[i];
  console.log(`--- text ${i} (${t.split(/\s+/).length} words)`);
  report("orig", t);
  report("humanized s3 seed7", humanize(t, { tone: "standard", strength: 3, seed: 7 }).text);
  report("humanized + del-that(safe)", delThat(humanize(t, { tone: "standard", strength: 3, seed: 7 }).text));
  report("humanized + del-that(all)", delThatAll(humanize(t, { tone: "standard", strength: 3, seed: 7 }).text));
  report("orig + del-that(all)", delThatAll(t));
}

// What if the char model only saw keep words + punctuation (masked-char experiment)?
// Rebuild char grams with non-keep words replaced by their shape token, scored with
// the EXISTING char vocab (most shape grams won't match -> logit collapses toward bias).
import keepWords from "../shared/keep.json";
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
  counts.forEach((c, g) => {
    const v = m.chars.vocab[g];
    if (!v) return;
    const x = (1 + Math.log(c)) * v[0];
    norm += x * x; dot += x * v[1];
  });
  return norm === 0 ? m.chars.bias : dot / Math.sqrt(norm) + m.chars.bias;
}
const aiMasked = ai.map((r: any) => maskedCharLogit(r.text));
const huMasked = hu.map((r: any) => maskedCharLogit(r.text));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log(`\nmasked-char logit (existing vocab): AI mean ${mean(aiMasked).toFixed(2)}  human mean ${mean(huMasked).toFixed(2)}  (raw char logit: AI ${mean(ai.map((r: any) => score(m, r.text).chars)).toFixed(2)}  human ${mean(hu.map((r: any) => score(m, r.text).chars)).toFixed(2)})`);
