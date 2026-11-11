# Latent

Job board I built for ML, AI engineering, and data science roles, mostly at startups. I got tired of checking a bunch of different career pages every day so this pulls them all into one place and keeps itself updated.

Live site: https://latent.pplx.app

## What it does

- Pulls jobs from the career pages of 75+ AI startups plus the SimplifyJobs Summer 2027 internship list, refreshes every 3 hours
- Internships tab is set up for what I'm looking for: Summer 2027 anywhere in the US, and Fall/Winter/Spring 2027 if it's remote or in Charlottesville
- Separate tab for full-time roles
- Tracks when each job first showed up so you can see what got added today / in the last 24h
- Insights page with a chart of jobs added and removed each day
- Pipeline page to keep track of stuff I've saved and applied to
- Public site is view-only, editing needs an owner key (server only stores a SHA-256 hash of it)

## Stack

React + TypeScript + Vite, Tailwind, shadcn/ui on the frontend. Express + Drizzle on the backend.

## Run it

```
npm install
npm run dev
```

For editing, set `OWNER_KEY_HASH` to the sha256 of whatever key you want, or put it in an `owner-key.hash` file in the root (it's gitignored).

Production build:

```
npm run build
npm start
```
