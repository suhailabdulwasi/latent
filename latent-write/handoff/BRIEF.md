# Latent Write — handoff brief

## What this project is

Latent Write (live at https://latentwrite.pplx.app) is a static, fully client-side web app with three parts:

1. **AI Detector** — scores text as "Likely AI / Unclear / Likely human" in the browser. Three stacked logistic models:
   - a **word n-gram model** (1–3 grams over tokens where topic words are masked to shape tokens like `<w-ing>`, keeping only a list of ~1,900 topic-neutral "keep" words — this stops it learning "essays about social media are AI")
   - a **32-feature style model** (sentence-length rhythm, comma ratio, modal verbs, pronouns…)
   - a **character 3–5 gram model** (char_wb, sees raw spelling)
   - Stack: `z = 0.983·ngram + 0.039·style + 0.425·chars + d·log(words) + c`, then a length-aware threshold per bucket (30–79 / 80–149 / 150–299 / 300+ words) tuned so under 1% of human writing is flagged.

2. **AI Humanizer** — a rule-based, meaning-preserving rewriter. It strips chatbot tells: stock phrases ("delve into", "it's important to note"), em dashes, Oxford commas, list formatting, stiff transitions, and it restructures rhythm (splitting long sentences, merging short ones, inserting hedges like "I think" at sentence starts).

3. **Accuracy report** — every number on the site comes from held-out text.

All scoring runs in the browser via the same JS (`shared/core.ts`) that the Python trainer exported. Parity between JS and Python is within 0.0003. There is no backend: the LLM API is not available on the published host, so everything must remain static/client-side.

## Repo map

```
shared/core.ts        — tokenizer (masking), n-gram/char/style featurizers, score(), length thresholds
shared/humanize.ts    — THE HUMANIZER. ~450 lines of regex passes. This is the file to beat.
shared/analysis.ts    — per-sentence scores, top AI/human n-gram signals (used by the detector UI)
shared/keep.json     — the ~1,921 "keep" words that pass through the tokenizer unmasked
client/               — React UI (vite). client/src/data/model.json = the live detector.
training/             — Python/TS pipeline: build_corpus.py (HF datasets → corpus.jsonl),
                         featurize.ts, train.py (trains all 3 models + stack + thresholds),
                         ext_eval.py / build_eval.py (external-detector comparison),
                         make_plain.ts (regenerates the humanizer test set)
handoff/              — THIS folder. Self-contained benchmark: eval_humanizer.ts + heldout_sample.json
```

`client/src/data/model.json` is the live model: `ngram.vocab`, `chars.vocab` are `{gram: [idf, weight]}`, `style` is standard-scaled, `calibration.by_length` holds the per-length thresholds.

## Current numbers (held-out)

Detector: AUC 0.976, catches 64.3% of chatbot text, false-flags 0.64% of human text. Scope: chat-assistant text (ChatGPT/Claude/Gemini/Grok/Llama-chat…), not base-model continuations.

Humanizer (held-out, Standard tone, Strong, best-of-10 seeds — the exact behavior the site ships):

| Setting | Still flagged |
|---|---|
| No humanizing | 70.4% |
| Standard / Medium | 50.0% |
| Standard / Strong | 47.8% |
| Fakespot RoBERTa (external) | 83% → 66% after humanizing |

Mean score after humanizing: 0.70 (from ~0.87).

## THE PROBLEM: the humanizer plateaus at ~48%, and some texts barely move

Rules get us from 70% → 48% flagged, but a large group of texts stays at p≈0.99 no matter what the humanizer does. Diagnosis, done from the model internals:

1. **The character model is the wall.** After humanizing, the n-gram logit drops 2.2 → 1.0 (human texts: −3.8) and style 0.6 → −0.1 (human: −2.0), but the char logit only drops 2.2 → 1.6 (human: −3.6). The stack multiplies chars by 0.425, so a stubborn char logit of ~5 keeps p near 1.0 even with clean word-level text.

2. **Topic leakage through spelling.** On a "learning from failure" essay, the top char-model contributors were `" a "`, `"s: "`, `"lure "` (from "failure"), `"curi "` (from "curiosity"), `"fail"`, `"fee "` (from "feedback" or "fee"), `"steps"`, `"ach "` (from "approach" or "each"). The char model was trained on a corpus where AI text skews toward essay-ish topics (HC3 ChatGPT answers, generated essays) and human text skews toward Reddit/emails/news — so it learned "these letter patterns = AI". The n-gram model hides topic words behind `<w>` shape masks, but the char model sees raw spelling. Education/psychology vocabulary is exactly the kind of text people humanize, and exactly what the char model nails.

3. **Rules can't fix this.** We tried, measured, and rejected: pronoun substitution of repeated topic words (no score change, breaks meaning), article variation ("a key" → "quite a key", no change), stronger seed sampling (best-of-10 barely beats single seed because most passes are deterministic), more sentence splitting (grammar breaks). What does work, and is already in: hedges (biggest single win), splitting ", which"/", while" clauses, comma lightening, rhythm variation. All are n-gram-level fixes — they move the word model, not the char model.

## What would actually fix it (ideas, pick your battles)

- **Retrain the char model topic-blind.** Same masking idea applied at the character level is hard, but there are options: train on topic-balanced human/AI pairs (same prompt answered by human vs AI), downweight chars in the stack, or add per-topic calibration. `training/train.py` + `build_corpus.py` are the pipeline. Note: any fix must keep the detector's 0.64% human false-flag rate — that is the hard constraint and the reason we can't just raise thresholds.
- **Or make the humanizer rewrite at the meaning-preserving paraphrase level** (a small distilled rewrite model shipped as static weights, since there's no backend). A rule-based rewriter fundamentally cannot change the distribution of letters in topic vocabulary.
- **Or both:** fix the char model's topic bias AND keep the rules for the tells they do catch.

## How to run

```bash
npm install
npm run build                # builds client to dist/public
npx tsx handoff/eval_humanizer.ts   # the benchmark above; keep this green:
                                 # goal: humanizer < 20% flagged at Standard/Strong
                                 # constraint: detector false-flag rate must stay < 1% (see below)
npx tsx training/eval_humanizer.ts  # parity + tone/strength eval against the full local test set
```

Detector regression check after any model change: rebuild `client/src/data/model.json` via `training/train.py`, copy to `client/src/data/`, rerun `training/build_eval.py`, and confirm the Accuracy page still shows false-flag < 1%.

## Honest notes

- The humanizer's job is transparent editing, not deception: it never adds facts, and the site states plainly that detectors still catch much of the edited text. Keep that framing — it's also what makes the product defensible.
- `shared/humanize.ts` passes have grammar-safety guards (LOWERABLE word list, clause guards). If you add rules, run the benchmark AND read the sample outputs — earlier passes here broke sentences ("Repeated attempts. I think each informed by…") and had to be reverted.
- The detector is intentionally cautious (false-flag < 1% is the product's core promise). Any humanizer gain bought by making the detector blind is not a gain.
