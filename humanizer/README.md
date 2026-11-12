# Latent Humanizer

Takes AI-sounding text and rewrites it so it reads more like a person wrote it. Part of Latent Write, live at https://latentwrite.pplx.app

The shared app source is in [`../latent-write/`](../latent-write/).
The rewriter lives in `shared/humanize.ts` within that app. It is still being
tuned; lower detector scores are not a guarantee of preserved meaning or
undetectability.
