# Strava Streak Tracker

Shows your current running streak, the next streak number to use in your run title, and validates that past runs are numbered correctly.

## Setup

### 1. Get Strava API credentials

Go to [strava.com/settings/api](https://www.strava.com/settings/api) and create an app (or use an existing one).

Set the **Authorization Callback Domain** to `localhost`.

### 2. Add your credentials

Set both values as environment variables on Netlify (Site settings → Environment variables):

- `STRAVA_CLIENT_ID` — also injected into the page as `config.js` at build time (public)
- `STRAVA_CLIENT_SECRET` — used **only** by the `netlify/functions/strava-token.mjs` function; it never appears in the published site

Token exchange and refresh go through `/api/strava/token`, so the secret stays server-side.

### 3. Run

```bash
netlify dev
```

`netlify dev` serves the static site and the token function together (plain `python3 -m http.server` will not serve `/api/strava/token`). Open the printed URL and click "Connect with Strava".

## How it works

Include the streak number in your run title — e.g. `Morning Run 42` or `Run 42 & 20min sauna`. The app tracks consecutive days, shows what number to use next, and flags any runs where the title number is wrong.

The latest streak ends on your most recent run, even if that run was several days ago. Activities are fetched newest first in pages of 200, stopping once an earlier run finished before the first missing run day instead of downloading your entire history. Overnight runs fill every local day they cover, and all candidates on streak days are retained for title validation without duplicating multi-day runs in the results. Timezone differences are accounted for; non-run pages alone cannot establish the gap. Shuffled activities within a page and repeated activities at page boundaries are tolerated. If unseen activities arrive out of order across pages, the check falls back to reading through an empty page instead of trusting an apparent gap. A short page is not treated as the end of history; an empty page confirms exhaustion. If the beginning remains unconfirmed after 50 pages, the app shows an incomplete-check error rather than a potentially incorrect streak or title corrections.

The early stop assumes no still-older recording overlaps that earlier completed run and extends across the gap. Arbitrarily overlapping long recordings cannot be ruled out without fetching the entire history; no fixed duration or lookback limit is imposed.

## Fun Mode

Click **Enter Fun Mode** below the next-run number to open **Your running universe**, a full-window star map: a music-inspired map of overlapping running themes. Dawn patrol, Tiny escapes, Gravity rebels, Longform, After hours, and In the groove have explicit rules shown when selected. Scrub through local streak days, highlight a theme and its crossovers, or inspect any run and open it on Strava.

The map uses all distinct runs on the latest streak's days, including multiple runs per day; the numbering table continues to use its existing daily selection. Consequently, theme counts can exceed table-row counts. Overnight recordings appear once. Theme membership determines the broad layout; compressed distance and duration scales plus small deterministic offsets position runs within it. This is an exploratory theme map, not a geographic map or a trained clustering model. Bubble **area is proportional to distance**, without a per-run cap. A fixed square-root distance scale keeps ordinary runs small, scaling all bubbles down proportionally only when the largest run needs to fit; scrubbing or filtering keeps that scale fixed, while a newly fetched longer run can rescale it. Zero or missing distances use hollow diamonds instead. Large streaks show a stable sample of at most 160 dots, always retaining the selected run and the five longest runs through the chosen timeline day, while counts and the run chooser include every run.

Switch between **Themes**, **Vert**, **Pace**, **Heart rate**, and **Places** to regroup the constellation. Gravity rebels is based on at least 300 m of climbing, independent of trail tags. Vert bands use total elevation gain; run details also show gain per kilometre. Pace uses moving time / distance, falling back to supplied average speed, never elapsed time. Heart rate uses the supplied average; its bands are comparisons, not training zones. Missing metrics get explicit unknown groups and unavailable labels, while recorded zero elevation remains zero.

Places groups outdoor starts within 5 km of each site's earliest run, in chronological order, assigning to the nearest eligible anchor. These are start-area groups, not route similarity or inferred city names. The five busiest sites get their own orbits; additional sites remain in Farther orbits and are identified in run details. Virtual/indoor runs and missing or invalid coordinates remain Uncharted. Only an approximate coordinate label (rounded to 0.1°) is displayed. Group anchors and orbit choices use the full loaded streak so scrubbing does not reshuffle them. There are no map tiles, geocoding requests, or additional Strava requests. The metrics use the existing [Strava activity summary fields](https://developers.strava.com/docs/reference/#api-models-SummaryActivity).

Use **Back to streak** or Escape to close the map; keyboard focus and page scrolling return to the checker. The modal keeps background controls inactive and preserves the selected theme and timeline when reopened. Desktop controls sit beside the map; narrow screens stack them below it. The dark starfield uses decorative specks and crisp distance-sized run markers. Switching views animates the same runs into their new groups over 450 ms; reduced-motion preferences skip this transition. A bounded separation pass makes crowded bubbles easier to pick up. There is no continuously running simulation.

Drag individual bubbles to rearrange a view; connected lines follow them. Drag empty space to pan, use the zoom buttons, scroll over the map, or pinch with two fingers to zoom (50–600%). **Focus orbit** fits the selected group, or the selected run's first group; double-click a bubble or group label to focus its orbit. **Reset map** restores the camera and clears dragged positions. With the map focused, +/− zoom, arrow keys pan, and 0 resets the camera. Touch users can scroll the page outside the map. Dragged positions are kept separately for each view in memory, and do not change activity data. Resizing resets the camera; changing views resets the camera and retains the inspected run when eligible.

Only up to **four connections for the selected run** are drawn. The **Connections** toggle hides them entirely. Solid edges indicate a shared current group; dashed edges indicate other known shared metrics or an actual launch site. Candidate bridges use known vert, moving-pace, heart-rate bands, or start sites, excluding the active view's metric; missing readings never establish similarity. Links are ranked by number of shared reasons, then recording-time proximity. These are explainable similarities, not routes or evidence of fitness improvement. **Follow this run** carries the selection into another view. Graph analysis remains bounded to the map sample.

The longest run through the timeline day is drawn last with a crisp outline and a distance label in kilometres and miles, so smaller circles cannot cover its label. **Find longest** selects and zooms to the longest run in the loaded latest streak, clears group filtering, and advances the timeline if necessary. It cannot find a run outside that streak or one with missing distance. **How circle sizes compare** shows a relative area guide. A 100-mile run has 20 times the area of a 5-mile run, or about 4.5 times its diameter; no per-run size cap distorts this ratio. Decorative halos and bright central dots have been removed to make filled circle boundaries clearer.

Fun Mode opens only on request, uses no additional API calls or dependencies, and stores no activity data. It does not modify streak calculation, title validation, or activity names. Runs without a usable local start timestamp are omitted from Fun Mode only. Refresh reloads the latest streak and rebuilds the map. Optional map failures leave the checker usable.

## Tests

Run the dependency-free regression tests with Node.js:

```bash
node --test tests/*.test.mjs
```

The tests mock Strava responses, compare results with the full-history calculation, and verify pagination, request counts, local dates, overnight runs, title matching, and failure handling without accessing your account.

## Files

| File | Purpose |
|------|---------|
| `src/streak-checker/index.html` | Core streak application (HTML + CSS + JS) |
| `src/streak-checker/fun-mode.js` | Optional theme analysis, map, and interactions |
| `src/streak-checker/fun-mode.css` | Scoped Fun Mode styles |
| `tests/fun-mode.test.mjs` | Theme, timeline, deduplication, and map-size regression tests |
| `src/streak-checker/config.js` | Generated at build time — holds only the public client id |
| `netlify/functions/strava-token.mjs` | Token broker — holds the client secret server-side |
| `tests/streak-checker.test.mjs` | Dependency-free streak fetching and calculation tests |
