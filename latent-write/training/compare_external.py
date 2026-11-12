"""Run open-source detectors on the exact same held-out test set."""
import json, sys, numpy as np, torch
from transformers import pipeline
from sklearn.metrics import roc_auc_score
torch.set_num_threads(2)
D = "/home/user/data"
rows = [json.loads(l) for l in open(f"{D}/test_rows.jsonl")] + [json.loads(l) | {"unseen": True} for l in open(f"{D}/unseen_rows.jsonl")]
MODELS = {"fakespot": ("fakespot-ai/roberta-base-ai-text-detection-v1", "AI"),
          "hc3_roberta": ("Hello-SimpleAI/chatgpt-detector-roberta", "ChatGPT")}
out = {}
for key, (name, ai_label) in MODELS.items():
    clf = pipeline("text-classification", model=name, truncation=True, max_length=512, top_k=None)
    ps = []
    for i in range(0, len(rows), 16):
        res = clf([r["text"] for r in rows[i:i + 16]], batch_size=16)
        for rr in res:
            d = {x["label"]: x["score"] for x in rr}
            ps.append(d.get(ai_label, 0.0))
        if i % 320 == 0: print(key, i, flush=True)
    out[key] = ps
    json.dump(out, open(f"{D}/external_scores.json", "w"))
print("done")
