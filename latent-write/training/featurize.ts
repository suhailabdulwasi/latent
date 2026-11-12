// Compute features with the exact same code the browser uses.
import { createReadStream, createWriteStream } from "fs";
import { createInterface } from "readline";
import { normalize, tokens, ngrams, styleFeatures, charGramsMasked } from "../shared/core";

const [inp, outp] = process.argv.slice(2);
const out = createWriteStream(outp);
const rl = createInterface({ input: createReadStream(inp) });
let n = 0;
rl.on("line", (line) => {
  const r = JSON.parse(line);
  const t = normalize(r.text);
  r.text = t;
  r.grams = ngrams(tokens(t)).join("\t");
  r.style = styleFeatures(t);
  // Topic-blind char grams: non-keep words are shape-masked before the char
  // featurizer, the same treatment the n-gram model already gets. This is the
  // retrain side of the char-model fix (see handoff/RETRAIN.md). The live
  // model.json in client/src/data was trained on raw char grams, so after
  // re-featurizing you MUST re-run training/train.py and copy the new
  // model.json into client/src/data/ — the old model and masked features do
  // not mix. score() in shared/core.ts still uses raw charGrams() until a
  // retrained model ships.
  r.cgrams = charGramsMasked(t).join("\t");
  out.write(JSON.stringify(r) + "\n");
  n++;
});
rl.on("close", () => { out.end(); console.error("featurized", n); });
