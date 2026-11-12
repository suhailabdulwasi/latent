"""Pick topic-neutral words: ones that show up regularly across most data sources.
Everything else is replaced by a word-shape token so the detector learns style, not subject."""
import json, re, collections
D = "/home/user/data"
df = collections.defaultdict(collections.Counter); n = collections.Counter()
for l in open(f"{D}/corpus.jsonl"):
    r = json.loads(l); s = r["source"].split("/")[0] if not r["source"].startswith("Latent-gen") else "Latent-gen"
    n[s] += 1
    for w in set(re.findall(r"[a-z]+(?:'[a-z]+)?", r["text"].lower().replace("\u2019", "'"))): df[s][w] += 1
srcs = list(n)
print(n)
allw = set().union(*[set(c) for c in df.values()])
keep = sorted(w for w in allw if sum(df[s][w] / n[s] >= 0.004 for s in srcs) >= len(srcs) - 2)
json.dump(keep, open("shared/keep.json", "w"))
print(len(keep)); print([w for w in ["professor","resume","election","journey","delve","crucial","additionally","furthermore","pretty","probably","got","enron","patients","score","social","media","tapestry","landscape","overall","however"] if w in keep])
