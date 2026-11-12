// Latent scores for every text sent to the external detectors, keyed the same way (md5).
import { readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { score } from "../shared/core";
const D = "/home/user/data";
const m = JSON.parse(readFileSync(`${D}/model.json`, "utf8"));
const out: Record<string, number> = {};
for (const f of ["ext_texts.json", "ext_texts2.json", "ext_texts4.json", "ext_texts5.json", "ext_texts6.json", "ext_texts7.json"]) for (const t of JSON.parse(readFileSync(`${D}/${f}`, "utf8"))) {
  const h = createHash("md5").update(t).digest("hex"), r = score(m, t);
  out["latent:" + h] = r.p; out["latentthr:" + h] = r.threshold;
}
writeFileSync(`${D}/latent_cache.json`, JSON.stringify(out));
console.log(Object.keys(out).length);
