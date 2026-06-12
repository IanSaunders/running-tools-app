# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Repository Structure

A collection of single-file vanilla JS running tools. No build step, no package manager, no framework.

```
netlify/
└── functions/
    └── strava-token.mjs  ← Strava OAuth token broker (client secret stays in Netlify env vars)
src/
├── index.html            ← Tools index / landing page
├── streak-checker/
│   ├── index.html        ← Strava streak tracker app
│   ├── config.js         ← Generated at build time (public client id only)
│   └── CLAUDE.md         ← Full architecture notes for streak-checker
└── run-speed/
    ├── index.html        ← Pace & speed calculator app
    └── CLAUDE.md         ← Full architecture notes for run-speed
```

## Running Locally

Use `netlify dev` from the repo root so the `/api/strava/token` function is served alongside the site (required for Strava OAuth in streak-checker). Tools that don't need OAuth can also be served with `python3 -m http.server 8080` from `src/`.

## Tools

### `src/index.html` — Landing Page
Styled index listing all tools with SVG preview cards. Style follows ultra-daemon.com: off-white background (`#FBFAFA`), dark charcoal text (`#22272E`), Strava orange (`#fc4c02`) accent, soft card shadows, system fonts. Add new tool cards here when new tools are added.

### `src/streak-checker/` — Strava Streak Tracker
Connects to Strava via OAuth. Shows current running streak, next title number to use, and validates numbered run titles. See `streak-checker/CLAUDE.md` for full architecture.

### `src/run-speed/` — Run Pace & Speed Calculator
Interactive pace/speed visualiser across 8 distances (mile → 100 mile). Three chart types: heatmap, speed-to-save-time, and pace-vs-speed hyperbola. See `run-speed/CLAUDE.md` for full architecture.

## Style Conventions

All tools share a consistent design language:

```css
--orange: #fc4c02;      /* Strava brand / primary accent */
--bg: #f9fafb;          /* page background */
--card: #ffffff;        /* card background */
--border: #e5e7eb;      /* borders */
--text: #111827;        /* primary text */
--text-muted: #6b7280;  /* secondary text */
```

- System font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- Cards: white, `border-radius: 12px`, `1px solid var(--border)`
- No external CSS frameworks

## Remote

GitHub: https://github.com/IanSaunders/running-tools-app
