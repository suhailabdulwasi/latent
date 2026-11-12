"""Download the public sources for the Latent Write corpus rebuild.
Writes into ~/workspace/latent-write/data/ . Uses the HF parquet mirrors
where possible so no 11 GB CSV has to move."""
import json, os, sys
import requests
from huggingface_hub import hf_hub_download

D = os.path.expanduser("~/workspace/latent-write/data")
os.makedirs(D, exist_ok=True)
def get(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        print("have", dest); return dest
    print("GET", url, "->", dest)
    r = requests.get(url, stream=True, timeout=60)
    r.raise_for_status()
    with open(dest, "wb") as f:
        for chunk in r.iter_content(1 << 20):
            f.write(chunk)
    print("  done", os.path.getsize(dest) // (1 << 20), "MB")
    return dest

# --- RAID: 3 train shards from the parquet mirror (0, 5, 9) ---
meta = requests.get("https://huggingface.co/api/datasets/liamdugan/raid/parquet", timeout=60).json()
train_urls = sorted(meta["raid"]["train"])
print("RAID train shards:", len(train_urls))
for i, idx in enumerate([0, 5, 9]):
    get(train_urls[idx], f"{D}/raid_{idx:04d}.parquet")

# --- HC3: all.jsonl ---
p = hf_hub_download("Hello-SimpleAI/HC3", "all.jsonl", repo_type="dataset", local_dir=D)
print("HC3 ->", p)

# --- MAGE: parquet mirror, train + test ---
meta = requests.get("https://huggingface.co/api/datasets/yaful/MAGE/parquet", timeout=60).json()
for split, name in [("train", "mage_train.parquet"), ("test", "mage_test.parquet")]:
    urls = sorted(meta["default"][split])
    print("MAGE", split, urls)
    get(urls[0], f"{D}/{name}")

# --- AESLC: parquet splits ---
for split in ["train", "validation", "test"]:
    p = hf_hub_download("Yale-LILY/aeslc", f"data/{split}-00000-of-00001.parquet", repo_type="dataset", local_dir=D)
    print("AESLC", split, "->", p)

# --- TL;DR 2017: first parquet shard, sampled later ---
meta = requests.get("https://huggingface.co/api/datasets/webis/tldr-17/parquet", timeout=60).json()
urls = sorted(meta["default"]["train"])
print("TLDR17 shards:", len(urls))
get(urls[0], f"{D}/tldr17_shard0.parquet")

# --- DAIGT V2 (IvyPanda substitute: PERSUADE human essays) ---
try:
    p = hf_hub_download("Yunij/daig2_tokenized_dataset", "train.csv", repo_type="dataset", local_dir=D)
    print("DAIGT ->", p)
except Exception as e:
    print("DAIGT train.csv failed:", e)
    import huggingface_hub as hh
    print([f.rfilename for f in hh.list_repo_files("Yunij/daig2_tokenized_dataset", repo_type="dataset")][:20])
print("ALL DOWNLOADS DONE")
