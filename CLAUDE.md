# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Repository Structure

A collection of single-file vanilla JS running tools. No build step, no package manager, no framework.

```
src/
├── index.html            ← Tools index / landing page
├── streak-checker/
│   ├── index.html        ← Strava streak tracker app
│   ├── config.js         ← Strava credentials (gitignored, do not commit)
│   └── CLAUDE.md         ← Full architecture notes for streak-checker
└── run-speed/
    ├── index.html        ← Pace & speed calculator app
    └── CLAUDE.md         ← Full architecture notes for run-speed
```

## Running Locally

Serve the `src/` directory over HTTP (required for Strava OAuth in streak-checker):

```bash
cd src/
python3 -m http.server 8080
# index:          http://localhost:8080/
# streak-checker: http://localhost:8080/streak-checker/index.html
# run-speed:      http://localhost:8080/run-speed/index.html
```

## Tools

### `src/index.html` — Landing Page
Styled index listing all tools with SVG preview cards. Style follows ultra-daemon.com: off-white background (`#FBFAFA`), dark charcoal text (`#22272E`), Strava orange (`#fc4c02`) accent, soft card shadows, system fonts. Add new tool cards here when new tools are added.

### `src/streak-checker/` — Strava Streak Tracker
Connects to Strava via OAuth. Shows current running streak, next title number to use, and validates numbered run titles. See `streak-checker/CLAUDE.md` for full architecture.

### `src/run-speed/` — Run Pace & Speed Calculator
Interactive pace/speed visualiser across 8 distances (mile → 100 mile). Three chart types: heatmap, speed-to-save-time, and pace-vs-speed hyperbola. See `run-speed/CLAUDE.md` for full architecture.

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
