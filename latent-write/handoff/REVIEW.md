# Muse retrain verification

This branch preserves the returned `latent-write-fixed-1.zip` plus a separate
runtime verification script. It is not approved for live publication.
Earlier handoff documents contain historical and sometimes superseded claims.

## Verified locally

`npm run build` and `npx tsc --noEmit` pass. The supplied humanizer benchmark
reproduces 33.9% Standard/Strong, 33.3% Casual/Strong, and 38.2%
Academic/Strong still flagged on 186 AI texts.

These are results against the changed detector, not an isolated measurement
of rewriting quality against a fixed detector. The benchmark also compares
the minimum output probability to the original input's length threshold;
this can differ from the UI when a rewrite crosses a length boundary.

## Training/runtime mismatch

`training/featurize.ts` uses `charGramsMasked()`, but `charLogit()` in
`shared/core.ts` still uses raw `charGrams()`. The training report therefore
does not describe precisely the browser implementation.

`npx tsx handoff/verify_runtime.ts` reproduces the following using the original
local `/home/user/data/test_rows.jsonl` and `unseen_rows.jsonl`:

| Metric | Current raw-character runtime | Training-compatible masked scoring |
|---|---:|---:|
| Full test AI caught (1,715 AI) | 1,119 / 1,715 = 65.25% | 1,127 / 1,715 = 65.71% |
| Full test human false flags (3,448 human) | 27 / 3,448 = 0.783% | 24 / 3,448 = 0.696% |
| Unseen Grok caught (280 AI) | 152 / 280 = 54.29% | 148 / 280 = 52.86% |

Both tested configurations remain under 1% human false flags on this full test
set; that is a measured rate, not a guarantee for every domain or population.

## Other release blockers

- Review unconditional synonyms for semantic damage, including
  `molecules → particles`, `failure → setback`, and `quietly → softly`.
- Recompute the humanizer benchmark with each selected output's own threshold.
- Regenerate the Accuracy data from consistent cohorts. The existing table
  mixes the new 186-text Latent benchmark with older external-detector rows.
- Rescore full-rewrite texts against the final detector instead of retaining
  the old model's results.
- Align stale source comments and method descriptions with the final scorer.

## Next checks

Make runtime features explicitly match model metadata, rerun full-test and
unseen checks, compare old/new humanizers against a fixed detector, and assess
meaning preservation separately from detector scores. Do not publish or merge
as a release solely because the build passes or the humanizer scores fall.
