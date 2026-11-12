# Latent

Latent is a set of AI tools I'm building for job hunting and writing. It started as a job board for ML/AI internships and kept growing from there. Long term the goal is to build my own generative model under the Latent name.

## Projects

| Project | What it is | Status |
|---|---|---|
| [Job Board](job-board/) | Self-updating board of ML, AI engineering, and data science roles at startups, with an internships tab for 2027 | Live at [latent.pplx.app](https://latent.pplx.app) |
| [Extension](extension/) | Chrome extension for filling out job applications faster | In progress |
| [Humanizer](humanizer/) | Rewrites AI-sounding text so it reads more naturally | Source in [latent-write/](latent-write/); improvements in progress |
| [Detector](detector/) | Scores how likely a piece of text is AI-written and highlights the sentences that look machine-made | Live at [latentwrite.pplx.app](https://latentwrite.pplx.app); source in [latent-write/](latent-write/) |

## Stack

Mostly TypeScript. React + Vite + Tailwind on the frontend, Express on the backend.

## Layout

Each project lives in its own folder with its own README and setup steps.

```
latent/
├── job-board/
├── extension/
├── humanizer/
└── detector/
```

The detector and humanizer share one app in [`latent-write/`](latent-write/).
Source updates belong in GitHub after each work session. Publishing to the
live site is a separate action requiring explicit approval.
