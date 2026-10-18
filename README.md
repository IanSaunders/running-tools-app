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

The map uses all distinct runs on the latest streak's days, including multiple runs per day; the numbering table continues to use its existing daily selection. Consequently, theme counts can exceed table-row counts. Overnight recordings appear once. Theme membership determines the broad layout; compressed distance and duration scales plus small deterministic offsets position runs within it. This is an exploratory theme map, not a geographic map or a trained clustering model. Bubble **area is proportional to distance**, without a per-run cap. The largest run sets the scale for the loaded streak; scrubbing or filtering keeps that scale fixed, while a newly fetched longer run can rescale it. Zero or missing distances use hollow diamonds instead. Large streaks show a stable sample of at most 160 dots, including the selected run, while counts and the run chooser include every run.

Switch between **Themes**, **Vert**, **Pace**, **Heart rate**, and **Places** to regroup the constellation. Gravity rebels is based on at least 300 m of climbing, independent of trail tags. Vert bands use total elevation gain; run details also show gain per kilometre. Pace uses moving time / distance, falling back to supplied average speed, never elapsed time. Heart rate uses the supplied average; its bands are comparisons, not training zones. Missing metrics get explicit unknown groups and unavailable labels, while recorded zero elevation remains zero.

Places groups outdoor starts within 5 km of each site's earliest run, in chronological order, assigning to the nearest eligible anchor. These are start-area groups, not route similarity or inferred city names. The five busiest sites get their own orbits; additional sites remain in Farther orbits and are identified in run details. Virtual/indoor runs and missing or invalid coordinates remain Uncharted. Only an approximate coordinate label (rounded to 0.1°) is displayed. Group anchors and orbit choices use the full loaded streak so scrubbing does not reshuffle them. There are no map tiles, geocoding requests, or additional Strava requests. The metrics use the existing [Strava activity summary fields](https://developers.strava.com/docs/reference/#api-models-SummaryActivity).

Use **Back to streak** or Escape to close the map; keyboard focus and page scrolling return to the checker. The modal keeps background controls inactive and preserves the selected theme and timeline when reopened. Desktop controls sit beside the map; narrow screens stack them below it. The dark starfield uses static decorative specks and glowing run markers, with no continuous animation.

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
