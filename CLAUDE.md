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
├── run-speed/
│   ├── index.html        ← Pace & speed calculator app
│   └── CLAUDE.md         ← Full architecture notes for run-speed
└── pace-mate/
    ├── index.html        ← Web companion to the PaceMate iOS app (4 tabs)
    ├── app.js            ← All logic; state persisted to localStorage
    ├── styles.css        ← Light theme + scoped Monokai dark theme
    └── about.html        ← About / iOS download page
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

### `src/pace-mate/` — Pace Mate (web companion to the iOS app)
Feature-matched with the PaceMate iOS app. Key behaviours to keep in sync with iOS:
- **Race predictions**: Riegel `^1.06` up to the marathon, `^1.20` exponent beyond it, expressed as a ratio of one `enduranceFactor` curve so predictions are consistent in both directions. Predicted / Even pace toggle is persisted.
- **Share plan**: builds a cumulative-splits text pace band; `navigator.share` with clipboard fallback.
- **Converter**: side-by-side metric/imperial grid (distance/pace/speed editable in both units, prominent Time row) + pace cheat sheet whose 7-row window stays anchored while tapping (re-centres only when pace leaves the window).
- **Theming**: light by default; `html[data-theme="dark"]` applies a Monokai palette via native CSS nesting. Settings has a System/Light/Dark control; System follows `prefers-color-scheme` live.
- **Units**: persisted to localStorage; first visit defaults from the browser region (US/GB/LR/MM → imperial).
### `src/100-miles/` — How Far Is 100 Miles?
Zoom-out interactive experience (powers-of-ten style) from a GPS watch face (46 mm) to the full Western States 100 course (161.3 km). 8 levels with SVG illustrations, animated count-up numbers, sky transitions, and WS100 course facts. Single self-contained HTML file, no dependencies.

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
