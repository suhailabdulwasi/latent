# Latent Write

Shared source for the detector, humanizer, and Accuracy page at
[latentwrite.pplx.app](https://latentwrite.pplx.app).
This review branch contains the returned Muse retrain, not the published
implementation. See [`handoff/REVIEW.md`](handoff/REVIEW.md) for verified
results and release blockers. `main` preserves the earlier source snapshot.

## Development

```bash
npm ci
npm run dev
```

## Checks

```bash
npm run build
npx tsc --noEmit
npx tsx handoff/eval_humanizer.ts
```

The benchmark includes a held-out sample. Full training data and locally
generated feature files are not checked into this repository. Read training
scripts for their input paths before running them.

## Workflow

- Commit and push completed work each session.
- Keep unapproved experimental model changes on a review branch.
- Keep the user as commit author and include the Perplexity co-author trailer.
- Publishing to the live site requires separate explicit authorization.
- Verify training and runtime feature parity, human false flags, and meaning
  preservation before promoting a retrained model.
