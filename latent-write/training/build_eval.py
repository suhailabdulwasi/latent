"""Combine detector scores into client/src/data/eval.json for the Accuracy page."""
import json, hashlib, numpy as np
from sklearn.metrics import roc_auc_score
D = "/home/user/data"
cache = json.load(open(f"{D}/ext_cache.json")) | json.load(open(f"{D}/latent_cache.json"))
thr = json.load(open(f"{D}/model.json"))["calibration"]["threshold"]
H = lambda t: hashlib.md5(t.encode()).hexdigest()
DET = [("latent", "Latent Write", None, None),
       ("fakespot", "Fakespot RoBERTa", "https://huggingface.co/fakespot-ai/roberta-base-ai-text-detection-v1", 0.5),
       ("hc3_roberta", "HC3 ChatGPT RoBERTa", "https://huggingface.co/Hello-SimpleAI/chatgpt-detector-roberta", 0.5)]
sample = json.load(open(f"{D}/ext_sample.json"))
rows = []
for key, name, url, t in DET:
    p = np.array([cache[f"{key}:{H(r['text'])}"] for r in sample])
    tt = np.array([cache[f"latentthr:{H(r['text'])}"] for r in sample]) if t is None else t
    y = np.array([r["label"] for r in sample])
    modern = np.array([r["label"] == 1 and (r["source"].startswith("Latent-gen") or r.get("unseen", False)) for r in sample])
    nonhc3 = np.array([r["source"] != "HC3" for r in sample])
    rows.append({"name": name, "url": url, "auc": float(roc_auc_score(y, p)), "auc_no_hc3": float(roc_auc_score(y[nonhc3], p[nonhc3])),
                 "caught": float((p >= tt)[y == 1].mean()), "caught_modern": float((p >= tt)[modern].mean()), "false_flag": float((p >= tt)[y == 0].mean())})
    if t is not None:  # same false-flag rate as Latent, cutoff picked on this sample (flatters the external model)
        ff = rows[0]["false_flag"]; hp = np.sort(p[y == 0]); ct = hp[max(0, int(np.ceil((1 - ff) * len(hp))) - 1)]
        rows[-1]["caught_at_latent_ff"] = float((p[y == 1] > ct).mean())
    print(rows[-1])
plain = json.load(open(f"{D}/ext_plain.json")); llm = json.load(open(f"{D}/llm_rewrites_v2.json"))
hrows = []
for key, name, url, t in DET:
    f = lambda txt: cache.get(f"{key}:{H(txt)}") >= (cache[f"latentthr:{H(txt)}"] if t is None else t)
    before = np.mean([f(a["orig"]) for a in plain]); after = np.mean([f(a["hum"]) for a in plain])
    lb = np.mean([f(a["orig"]) for a in llm]); la = np.mean([f(a["hum"]) for a in llm])
    hrows.append({"name": name, "before": float(before), "after_rules": float(after), "llm_before": float(lb), "after_llm": float(la)})
    print(hrows[-1])
ev = {"external": {"n": len(sample), "rows": rows},
      "humanizer": {"n": len(plain), "n_llm": len(llm), "rows": hrows,
                    "note": "Humanizer settings: Standard tone, Strong; the site tries ten rewrite variants and keeps the one its own detector scores lowest. All texts are from the held-out test split. The full-rewrite test used a different random set of 60 modern-chatbot texts, so its starting rate differs. Because Latent's detector is tuned to rarely flag people, edited text slides under its cutoff more easily than under a detector that flags aggressively."}}
json.dump(ev, open("/home/user/workspace/latent-write/client/src/data/eval.json", "w"), indent=1)
