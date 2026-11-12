"""Train the Latent Write detector and produce an honest evaluation report.

Splits
- test_iid: 15% random hold-out from every source
- test_unseen: every sample from a generator the model never sees in training (HOLDOUT_MODEL)
The shipped model is trained only on the training split, so every number in
the report describes exactly the model that runs on the site."""
import os
import json, sys, math, random, collections
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import roc_auc_score

D = "/home/user/data"
HOLDOUT_MODEL = sys.argv[1] if len(sys.argv) > 1 else "grok_4_3"
K = int(sys.argv[2]) if len(sys.argv) > 2 else 20000
C_NG = float(sys.argv[3]) if len(sys.argv) > 3 else 4.0
KC = int(sys.argv[4]) if len(sys.argv) > 4 else 20000
rows = [json.loads(l) for l in open(f"{D}/feats.jsonl")]
# Scope: text written by chat assistants. Base-model continuations of a
# human-written prefix (MAGE machine_continuation, RAID base models, LLaMA-65B,
# GLM, Flan-T5) are a different task and are left out of training and testing.
import re as _re
def _in_scope(r):
    if r["label"] == 0: return True
    m = r.get("model") or ""
    if "continuation" in m: return False
    if _re.search(r"flan_t5|65B|GLM130B", m): return False
    if r["source"] == "RAID" and "chat" not in m: return False
    return True
_n0 = len(rows); rows = [r for r in rows if _in_scope(r)]
print("scope filter", _n0, "->", len(rows))
rng = random.Random(0)

def is_modern(r): return r["source"].startswith("Latent-gen")
unseen = [r for r in rows if is_modern(r) and r["model"] == HOLDOUT_MODEL]
rest = [r for r in rows if not (is_modern(r) and r["model"] == HOLDOUT_MODEL)]
rng.shuffle(rest)
n_test = int(len(rest) * 0.15)
test, val, train = rest[:n_test], rest[n_test:2 * n_test], rest[2 * n_test:]
print("train", len(train), "val", len(val), "test", len(test), "unseen", len(unseen))

y = np.array([r["label"] for r in train])
# upweight modern-model and student-essay data so they matter despite being smaller
MW = float(os.environ.get("MW", "3"))
w = np.array([MW if is_modern(r) else (1.5 if r["source"] == "IvyPanda" else 1.0) for r in train])
# balance classes
for lab in (0, 1):
    w[y == lab] *= len(y) / (2 * w[y == lab].sum() / w[y == lab].mean() * 1) if False else 1
import os
HW = float(os.environ.get("HW", "1"))  # extra weight on human samples: makes false flags costlier
TARGET = float(os.environ.get("TARGET", "0.007"))  # human false-flag target used to set thresholds on val
cw = {0: HW * (w[y == 1].sum() / w[y == 0].sum()), 1: 1.0}
w = w * np.array([cw[v] for v in y])

an = lambda s: s.split("\t")
def fit_ngram(docs, yy, ww, vocab=None):
    vec = TfidfVectorizer(analyzer=an, sublinear_tf=True, min_df=5 if vocab is None else 1, max_features=120000 if vocab is None else None, vocabulary=vocab, lowercase=False)
    X = vec.fit_transform(docs)
    clf = LogisticRegression(C=C_NG, max_iter=3000, solver="liblinear")
    clf.fit(X, yy, sample_weight=ww)
    return vec, clf

docs = [r["grams"] for r in train]
vec0, clf0 = fit_ngram(docs, y, w)
names = np.array(vec0.get_feature_names_out())
top = np.argsort(-np.abs(clf0.coef_[0]))[:K]
vocab = sorted(names[top].tolist())

def fit_style(S, yy, ww):
    sc = StandardScaler().fit(S)
    clf = LogisticRegression(C=1.0, max_iter=2000)
    clf.fit(sc.transform(S), yy, sample_weight=ww)
    return sc, clf

S = np.array([r["style"] for r in train])
L = np.log(np.array([max(len(r["text"].split()), 1) for r in train]))

vec, clf = fit_ngram(docs, y, w, vocab)
sc, cs = fit_style(S, y, w)
cdocs = [r["cgrams"] for r in train]
cvec0, cclf0 = fit_ngram(cdocs, y, w) if KC else (None, None)
if KC:
    cnames = np.array(cvec0.get_feature_names_out())
    ctop = np.argsort(-np.abs(cclf0.coef_[0]))[:KC]
    cvocab = sorted(cnames[ctop].tolist())
    cvec, cclf = fit_ngram(cdocs, y, w, cvocab)
    del cvec0, cclf0

def base(rs):
    X = vec.transform([r["grams"] for r in rs])
    a = clf.decision_function(X)
    e = cclf.decision_function(cvec.transform([r["cgrams"] for r in rs])) if KC else np.zeros(len(rs))
    b = cs.decision_function(sc.transform(np.array([r["style"] for r in rs])))
    l = np.log(np.array([max(len(r["text"].split()), 1) for r in rs]))
    return np.column_stack([a, b, e, l])

yv = np.array([r["label"] for r in val])
wv = np.array([3.0 if is_modern(r) else (1.5 if r["source"] == "IvyPanda" else 1.0) for r in val])
wv = wv * np.where(yv == 0, HW * wv[yv == 1].sum() / wv[yv == 0].sum(), 1.0)
stack = LogisticRegression(C=10.0, max_iter=1000).fit(base(val), yv, sample_weight=wv)
oof_p = stack.predict_proba(base(val))[:, 1]
y_oof = yv

def predict(rs):
    B = base(rs)
    return stack.predict_proba(B)[:, 1], B[:, 0], B[:, 1]

# Thresholds: per length bucket, the value that keeps human false flags on the
# validation split at or under TARGET. Short texts get a stricter bar.
EDGES = [80, 150, 300, 10**9]
def bidx(n): return next(i for i, e in enumerate(EDGES) if n < e)
vlen = np.array([len(r["text"].split()) for r in val])
hum_all = np.sort(oof_p[y_oof == 0])
glob_thr = float(hum_all[min(len(hum_all) - 1, int(math.ceil(len(hum_all) * (1 - TARGET))))])
thr_b = []
for i in range(len(EDGES)):
    h = np.sort(oof_p[(y_oof == 0) & (np.array([bidx(n) for n in vlen]) == i)])
    k = int(math.ceil(len(h) * (1 - TARGET)))
    tb = float(h[min(len(h) - 1, k)]) if len(h) > 50 else glob_thr
    thr_b.append(max(tb, 0.5))
thr = glob_thr
low = float(hum_all[int(len(hum_all) * 0.80)])
print("thresholds by length", [round(x, 3) for x in thr_b], "global", round(thr, 3), "unclear low", round(low, 3))
def thr_for(rs): return np.array([thr_b[bidx(len(r["text"].split()))] for r in rs])

def bucket(n):
    return "30-79" if n < 80 else "80-149" if n < 150 else "150-299" if n < 300 else "300+"

def summarize(rs, p):
    yy = np.array([r["label"] for r in rs])
    pred = p >= thr_for(rs)
    out = {"n": len(rs), "n_ai": int(yy.sum()), "n_human": int((1 - yy).sum())}
    if yy.sum(): out["ai_caught"] = float(pred[yy == 1].mean())
    if (1 - yy).sum(): out["human_false_flag"] = float(pred[yy == 0].mean())
    out["accuracy"] = float((pred == yy).mean())
    if 0 < yy.sum() < len(yy): out["auc"] = float(roc_auc_score(yy, p))
    return out

report = {"holdout_model": HOLDOUT_MODEL, "threshold": thr, "thresholds": [{"max_words": e, "threshold": t} for e, t in zip(EDGES, thr_b)], "unclear_low": low, "vocab": K, "human_weight": HW, "target": TARGET}
p_test, _, _ = predict(test)
report["overall"] = summarize(test, p_test)
groups = collections.defaultdict(list)
for i, r in enumerate(test):
    key = r["source"] if r["source"] != "Latent-gen-matched" else "Latent-gen"
    groups[("source", key)].append(i)
    groups[("length", bucket(len(r["text"].split())))].append(i)
    if r["label"] == 1:
        mdl = r["model"].split("+")[0]
        groups[("ai_model", mdl if is_modern(r) else r["source"] + " (older models)")].append(i)
    else:
        groups[("human_domain", r["source"] + ": " + r["domain"])].append(i)
for (kind, key), idx in sorted(groups.items()):
    report.setdefault(kind, {})[key] = summarize([test[i] for i in idx], p_test[idx])
if unseen:
    p_un, _, _ = predict(unseen)
    report["unseen_model"] = summarize(unseen, p_un)
print(json.dumps({k: report[k] for k in ["overall", "unseen_model"] if k in report}, indent=1))
for kind in ["source", "length", "ai_model"]:
    print(kind)
    for k, v in report[kind].items():
        print("  ", k, {a: round(b, 3) if isinstance(b, float) else b for a, b in v.items()})
print("worst human domains (false flags):")
for k, v in sorted(report["human_domain"].items(), key=lambda kv: -kv[1].get("human_false_flag", 0))[:10]:
    print("  ", k, v["n"], round(v["human_false_flag"], 3))

# ---- export
idf = vec.idf_
coef = clf.coef_[0]
vmap = {t: [round(float(idf[j]), 4), round(float(coef[j]), 4)] for t, j in vec.vocabulary_.items() if abs(coef[j]) > 1e-4}
model = {
    "version": "lw-1",
    "ngram": {"vocab": vmap, "bias": float(clf.intercept_[0]), "sublinear": True},
    "style": {"mean": sc.mean_.tolist(), "scale": sc.scale_.tolist(), "coef": cs.coef_[0].tolist(), "bias": float(cs.intercept_[0])},
    "chars": {"vocab": {t: [round(float(cvec.idf_[j]), 4), round(float(cclf.coef_[0][j]), 4)] for t, j in cvec.vocabulary_.items() if abs(cclf.coef_[0][j]) > 1e-4}, "bias": float(cclf.intercept_[0]), "sublinear": True} if KC else {"vocab": {}, "bias": 0.0, "sublinear": True},
    "stack": {"a": float(stack.coef_[0][0]), "b": float(stack.coef_[0][1]), "e": float(stack.coef_[0][2]) if KC else 0.0, "d": float(stack.coef_[0][3]), "c": float(stack.intercept_[0])},
    "calibration": {"threshold": thr, "bands": {"low": low, "high": thr}, "by_length": [{"max_words": min(e, 10**6), "threshold": t} for e, t in zip(EDGES, thr_b)]},
}
json.dump(model, open(f"{D}/model.json", "w"), separators=(",", ":"))
json.dump(report, open(f"{D}/report.json", "w"), indent=1)
# save test rows for parity checks, external-detector comparison and humanizer tests
with open(f"{D}/test_rows.jsonl", "w") as fh:
    for r, p in zip(test, p_test):
        fh.write(json.dumps({"text": r["text"], "label": r["label"], "source": r["source"], "model": r["model"], "domain": r["domain"], "p": float(p)}) + "\n")
with open(f"{D}/unseen_rows.jsonl", "w") as fh:
    for r, p in zip(unseen, p_un if unseen else []):
        fh.write(json.dumps({"text": r["text"], "label": r["label"], "source": r["source"], "model": r["model"], "domain": r["domain"], "p": float(p)}) + "\n")
print("style coefs:")
from shared_names import STYLE_NAMES
for n_, c_ in sorted(zip(STYLE_NAMES, cs.coef_[0]), key=lambda x: -abs(x[1]))[:12]:
    print("  ", n_, round(float(c_), 3))
