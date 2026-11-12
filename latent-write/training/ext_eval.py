"""Score texts with open-source detectors (cached by text hash). Usage: ext_eval.py texts.json"""
import json, sys, hashlib, os, time, torch
from transformers import pipeline
torch.set_num_threads(2)
D = "/home/user/data"; CACHE = f"{D}/ext_cache.json"
cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
texts = json.load(open(sys.argv[1]))
MODELS = {"fakespot": ("fakespot-ai/roberta-base-ai-text-detection-v1", "AI"), "hc3_roberta": ("Hello-SimpleAI/chatgpt-detector-roberta", "ChatGPT")}
for key, (name, lab) in MODELS.items():
    todo = [t for t in texts if f"{key}:{hashlib.md5(t.encode()).hexdigest()}" not in cache]
    if not todo: continue
    clf = pipeline("text-classification", model=name, truncation=True, max_length=512, top_k=None)
    t0 = time.time()
    for i in range(0, len(todo), 8):
        res = clf(todo[i:i + 8], batch_size=8)
        for t, rr in zip(todo[i:i + 8], res):
            cache[f"{key}:{hashlib.md5(t.encode()).hexdigest()}"] = {x["label"]: x["score"] for x in rr}.get(lab, 0.0)
        if i % 80 == 0:
            json.dump(cache, open(CACHE, "w")); print(key, i, len(todo), round(time.time() - t0), flush=True)
    json.dump(cache, open(CACHE, "w"))
print("done", flush=True)
