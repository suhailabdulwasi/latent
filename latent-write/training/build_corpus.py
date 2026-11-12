"""Assemble a balanced human vs AI corpus from public research datasets
plus freshly generated modern-model text. Writes corpus.jsonl."""
import json, random, re
import pyarrow.parquet as pq
import pyarrow.compute as pc

D = "/home/user/data"
random.seed(42)
rows = []

def window(text, rng):
    """Take a passage starting at the beginning, cut at a sentence boundary
    near a random target length, so length doesn't give the label away."""
    text = text.strip()
    target = rng.choice([50, 80, 120, 160, 220, 300, 400, 550])
    ws = text.split(" ")
    if len(ws) <= target:
        return text
    cut = " ".join(ws[:target])
    m = list(re.finditer(r"[.!?][\"')\]]?(\s|$)", cut))
    if m and m[-1].end() > len(cut) * 0.5:
        cut = cut[: m[-1].end()]
    return cut.strip()

def add(text, label, source, model, domain, rng=random):
    if not text or not isinstance(text, str):
        return
    t = window(text, rng)
    n = len(t.split())
    if n < 30:
        return
    rows.append({"text": t, "label": label, "source": source, "model": model, "domain": domain})

# ---- RAID (abstracts + other shards), no adversarial attack except paraphrase
for f in ["raid_0000.parquet", "raid_0005.parquet", "raid_0009.parquet"]:
    try:
        t = pq.read_table(f"{D}/{f}", columns=["model", "attack", "domain", "generation", "decoding"])
    except Exception as e:
        print("skip", f, e); continue
    t = t.filter(pc.is_in(t["attack"], value_set=__import__("pyarrow").array(["none", "paraphrase"])))
    df = t.to_pandas()
    print(f, df.domain.unique(), len(df))
    for dom, g in df.groupby("domain"):
        hum = g[(g.model == "human") & (g.attack == "none")]
        ai = g[(g.model != "human") & (g.model != "gpt2")]
        hn = min(len(hum), 700)
        for x in hum.sample(hn, random_state=1).generation:
            add(x, 0, "RAID", "human", dom)
        ai_none = ai[ai.attack == "none"]
        for x, mdl in ai_none.sample(min(len(ai_none), hn), random_state=2)[["generation", "model"]].values:
            add(x, 1, "RAID", mdl, dom)
        para = ai[ai.attack == "paraphrase"]
        for x, mdl in para.sample(min(len(para), hn // 6), random_state=3)[["generation", "model"]].values:
            add(x, 1, "RAID", mdl + "+paraphrase", dom)
    del df, t

# ---- HC3: same questions answered by humans and ChatGPT
h = pq.read_table(f"{D}/hc3.parquet").to_pandas()
for src, g in h.groupby("source"):
    g = g.sample(min(len(g), 900), random_state=4)
    for ha, ca in zip(g.human_answers, g.chatgpt_answers):
        if len(ha): add(ha[0], 0, "HC3", "human", src)
        if len(ca): add(ca[0], 1, "HC3", "chatgpt", src)

# ---- MAGE: 10 domains, 27 generators
HCAP = {}
for f in ["mage_train.parquet", "mage_test.parquet"]:
    try:
        m = pq.read_table(f"{D}/{f}").to_pandas()
    except Exception as e:
        print("skip", f, e); continue
    m = m.sample(min(len(m), 90000), random_state=5)
    # keep realistic chat/instruction models; drop tiny 2022-era models, sentence-fragment
    # domains, and AI-paraphrased human text (ambiguous label)
    STRONG = ("gpt-3.5-trubo", "text-davinci-003", "text-davinci-002", "gpt4", "gpt4_para", "65B", "GLM130B", "flan_t5_xxl")
    for x, lab, src in m[["text", "label", "src"]].values:
        dom = src.split("_")[0]
        if dom in ("hswag", "roct", "squad"):
            continue
        mdl = "_".join(src.split("_")[1:]) or "?"
        if lab == 0 and (not mdl.endswith(STRONG) or random.random() > 0.45):
            continue
        if lab == 1:
            HCAP[dom] = HCAP.get(dom, 0) + 1
            if HCAP[dom] > 1400: continue
        add(x, 0 if lab == 1 else 1, "MAGE", "human" if lab == 1 else mdl, dom)

# ---- IvyPanda student essays (human)
ivy = json.load(open(f"{D}/ivy_sample.json"))
for x in ivy[:2200]:
    body = "\n".join(x.split("\n")[1:])  # drop title line
    body = re.split(r"\n(References|Works Cited|Reference List|Bibliography)\s*\n", body)[0]
    lines = [l for l in body.split("\n") if not re.fullmatch(r"\s*(Table of Contents|Contents|Introduction|Conclusion|Discussion|Summary|Background|Analysis|Methods?|Results)\s*", l, re.I)]
    lines = [l for l in lines if len(l.split()) > 6 or l.strip() == ""]  # drop leftover headings
    body = "\n".join(lines)
    body = re.sub(r"\([A-Z][A-Za-z&.\- ]+,? (et al\.,? )?\d{4}[a-z]?(, p\. ?\d+)?\)", "", body)  # strip citations
    add(body, 0, "IvyPanda", "human", "student essay")

# ---- Enron emails and Reddit posts (human, pre-ChatGPT)
ex = json.load(open(f"{D}/extra_human.json"))
_ae = pq.read_table(f"{D}/aeslc.parquet", columns=["email_body"]).to_pandas().sample(4000, random_state=8)
ex["emails"] = list(ex["emails"]) + [b for b in _ae.email_body if isinstance(b, str) and 40 <= len(b.split()) <= 600]
_rd = pq.read_table(f"{D}/tldr17.parquet", columns=["content", "subreddit"]).to_pandas().sample(9000, random_state=9)
ex["reddit"] = list(ex["reddit"]) + [{"text": c, "sub": sr} for c, sr in zip(_rd.content, _rd.subreddit) if isinstance(c, str) and 40 <= len(c.split()) <= 600][:3000]
for e in ex["emails"][:2600]:
    e = re.sub(r"\s*\n\s*", " ", e)  # Enron bodies have hard-wrapped lines
    e = re.sub(r" {2,}", " ", e)
    add(e, 0, "Enron email", "human", "email")
for r in ex["reddit"][:3600]:
    add(r["text"], 0, "Reddit", "human", "r/" + str(r["sub"]))

# ---- Modern models generated for this project
for f in ["gen.jsonl", "gen_pair.jsonl"]:
    try:
        for line in open(f"{D}/{f}"):
            r = json.loads(line)
            add(r["text"], 1, "Latent-gen" if f == "gen.jsonl" else "Latent-gen-matched", r["model"], r["genre"])
    except FileNotFoundError:
        pass

random.shuffle(rows)
# de-dup
seen = set(); out = []
for r in rows:
    k = r["text"][:200]
    if k in seen: continue
    seen.add(k); out.append(r)
with open(f"{D}/corpus.jsonl", "w") as fh:
    for r in out:
        fh.write(json.dumps(r) + "\n")
import collections
print(len(out))
print(collections.Counter((r["source"], r["label"]) for r in out))
