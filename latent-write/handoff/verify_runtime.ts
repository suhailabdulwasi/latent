import { readFileSync } from "node:fs";
import { score, normalize, words, charGramsMasked, rawWordCount, thresholdFor } from "../shared/core";
const model = JSON.parse(readFileSync("client/src/data/model.json", "utf8"));
function maskedScore(raw: string) {
  const s = score(model, raw);
  const counts = new Map<string, number>();
  for (const g of charGramsMasked(normalize(raw))) counts.set(g, (counts.get(g) || 0) + 1);
  let dot = 0, norm = 0;
  for (const [g, n] of counts) {
    const v = model.chars.vocab[g];
    if (!v) continue;
    const x = (1 + Math.log(n)) * v[0];
    dot += x * v[1]; norm += x * x;
  }
  const c = (norm ? dot / Math.sqrt(norm) : 0) + model.chars.bias;
  const z = model.stack.a * s.ngram + model.stack.b * s.style + model.stack.e * c
    + model.stack.d * Math.log(Math.max(words(normalize(raw)).length, 1)) + model.stack.c;
  return { p: 1 / (1 + Math.exp(-z)), threshold: thresholdFor(model, rawWordCount(normalize(raw))) };
}
for (const file of ["/home/user/data/test_rows.jsonl", "/home/user/data/unseen_rows.jsonl"]) {
  const rows = readFileSync(file, "utf8").trim().split("\n").map(l => JSON.parse(l));
  for (const [name, fn] of [["runtime_raw", (t: string) => score(model, t)], ["training_masked", maskedScore]] as const) {
    let ai = 0, human = 0, caught = 0, ff = 0;
    for (const r of rows) {
      const s = fn(r.text), flagged = +(s.p >= s.threshold);
      if (r.label) { ai++; caught += flagged; } else { human++; ff += flagged; }
    }
    console.log(JSON.stringify({ file, mode: name, ai, human, caught, ff, catchRate: caught / ai, falseFlag: ff / human }));
  }
}
