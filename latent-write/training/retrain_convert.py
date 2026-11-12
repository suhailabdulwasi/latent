"""Convert downloaded sources into exactly the files build_corpus.py expects."""
import json, os
import pyarrow as pa
import pyarrow.parquet as pq

D = os.path.expanduser("~/workspace/latent-write/data")

# --- HC3: all.jsonl -> hc3.parquet ---
rows = [json.loads(l) for l in open(f"{D}/all.jsonl")]
t = pa.Table.from_pylist([{k: r.get(k) for k in ("id", "question", "human_answers", "chatgpt_answers", "source")} for r in rows])
pq.write_table(t, f"{D}/hc3.parquet")
print("hc3.parquet", t.num_rows, t.column_names)

# --- AESLC: concat 3 splits -> aeslc.parquet ---
parts = [pq.read_table(f"{D}/aeslc/data/train-00000-of-00001.parquet"),
         pq.read_table(f"{D}/data/validation-00000-of-00001.parquet"),
         pq.read_table(f"{D}/data/test-00000-of-00001.parquet")]
t = pa.concat_tables(parts)
pq.write_table(t, f"{D}/aeslc.parquet")
print("aeslc.parquet", t.num_rows, t.column_names)

# --- TLDR17: full shard0 -> tldr17.parquet (build_corpus samples 9000 itself) ---
import shutil
shutil.copy(f"{D}/tldr17_shard0.parquet", f"{D}/tldr17.parquet")
t = pq.read_table(f"{D}/tldr17.parquet", columns=["content", "subreddit"])
print("tldr17.parquet", t.num_rows, t.column_names)

# --- DAIGT PERSUADE human essays -> ivy_sample.json ("title\\nbody" strings) ---
d = pq.read_table(f"{D}/daigt/daigt_train.parquet", columns=["text", "label", "source"]).to_pylist()
hum = [r["text"] for r in d if r["label"] == 0 and r["source"] == "persuade_corpus"]
print("DAIGT persuade human essays:", len(hum))
json.dump(hum[:2200], open(f"{D}/ivy_sample.json", "w"))
print("ivy_sample.json", min(len(hum), 2200), "essays")

# --- extra_human.json: empty seed (build_corpus re-samples AESLC/TLDR itself) ---
json.dump({"emails": [], "reddit": []}, open(f"{D}/extra_human.json", "w"))
print("extra_human.json (empty seed)")
print("CONVERT DONE")
