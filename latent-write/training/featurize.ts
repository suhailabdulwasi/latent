// Compute features with the exact same code the browser uses.
import { createReadStream, createWriteStream } from "fs";
import { createInterface } from "readline";
import { normalize, tokens, ngrams, styleFeatures, charGrams } from "../shared/core";

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
  r.cgrams = charGrams(t).join("\t");
  out.write(JSON.stringify(r) + "\n");
  n++;
});
rl.on("close", () => { out.end(); console.error("featurized", n); });
