// Rule-humanizer test set: 120 held-out modern-chatbot texts, Standard tone, Strong strength,
// same best-of-ten-variants selection the site uses.
import { readFileSync, writeFileSync } from "fs";
import { score } from "../shared/core";
import { humanize } from "../shared/humanize";
const D = "/home/user/data";
const m = JSON.parse(readFileSync(`${D}/model.json`, "utf8"));
const s = JSON.parse(readFileSync(`${D}/ext_sample.json`, "utf8")).filter((r: any) => r.label === 1 && r.source.startsWith("Latent-gen") && !r.unseen);
const out = s.map((r: any) => {
  let bp = 1, bt = "";
  for (let i = 0; i < 10; i++) { const h = humanize(r.text, { tone: "standard", strength: 3, seed: 1 + i }).text; const p = score(m, h).p; if (p < bp) { bp = p; bt = h; } }
  return { orig: r.text, hum: bt, model: r.model };
});
writeFileSync(`${D}/ext_plain.json`, JSON.stringify(out));
writeFileSync(`${D}/ext_texts6.json`, JSON.stringify(out.map((x: any) => x.hum)));
console.log(out.length);
