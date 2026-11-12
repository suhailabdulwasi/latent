# Latent Detector

Scores how likely a piece of text is AI-written and highlights the sentences that look the most machine-made. Tested on held-out human writing to keep false flags under 1%.

Part of Latent Write, live at https://latentwrite.pplx.app

The shared app source is in [`../latent-write/`](../latent-write/).
Scoring lives in `shared/core.ts`, the client model in
`client/src/data/model.json`, and the training pipeline in `training/`.
