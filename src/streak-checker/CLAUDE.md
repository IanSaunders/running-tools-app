# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A personal Strava streak tracker that shows the current running streak, the next streak number to use in a run title, and validates that past run titles are numbered correctly.

## Architecture

Single-file app — all HTML, CSS, and JavaScript lives in `src/index.html`. No build step, no package manager, no framework.

## File Structure

```
streak-app/
├── README.md
├── .gitignore
└── src/
    ├── index.html   ← entire application
    └── config.js    ← credentials (do NOT commit)
```

## Credentials

`config.js` is generated at build time (see `../../build.sh`) and holds only the public client id. The client secret lives in Netlify environment variables and is used exclusively by the `/api/strava/token` Netlify Function (`../../netlify/functions/strava-token.mjs`), which performs all token exchange and refresh calls.

`index.html` loads `config.js` at startup and seeds localStorage from it automatically. If `config.js` is missing or its values are empty, the setup form is shown as a fallback.

## Serving

Must be served over HTTP (not `file://`) for Strava OAuth to work:

```bash
cd src/
python3 -m http.server 8080
# open http://localhost:8080/index.html
```

Register `localhost` as the Authorization Callback Domain in Strava API settings at strava.com/settings/api.

## Application States

```
STATE_SETUP         → fallback if config.js is missing/empty; enter credentials → redirect to Strava OAuth
STATE_AUTHING       → detect ?code= in URL → exchange for tokens → dashboard
STATE_AUTHENTICATED → refresh token if expired → fetch runs → display dashboard
STATE_RECONNECT     → session retired by another device → renderReconnect() → one-tap re-OAuth
```

## Multi-device handling

Strava keeps a single active grant per (athlete, app), so connecting the same
account on a second device retires this device's tokens. Recovery is graceful
rather than a dead-end:

- A `401` from the API triggers **one refresh + retry** (`stravaGet(..., retried)`);
  if the access token was only stale it recovers silently.
- If the refresh token itself is rejected, `refreshAccessToken()` returns
  `'rejected'`, `clearTokens()` wipes only the session (keeping the client id),
  and `renderReconnect()` shows a one-tap reconnect explaining the situation.
- A network/transient failure returns `'error'` and **keeps** the tokens so a
  later retry still works — it never silently signs the user out.
- **Disconnect is local-only** (never calls Strava deauthorize), so signing out
  one device leaves other devices connected.

## localStorage Keys

| Key | Purpose |
|-----|---------|
| `strava_client_id` | Strava app Client ID |
| `strava_access_token` | Current OAuth access token |
| `strava_refresh_token` | OAuth refresh token |
| `strava_token_expires_at` | Token expiry (Unix seconds) |
| `strava_athlete_name` | Athlete display name |

## Key Design Decisions

- **Date source** — uses `start_date_local` (Strava's local-time field) for all date grouping and display, falling back to `start_date` + browser timezone conversion if absent. This avoids runs near midnight being bucketed onto the wrong calendar day.
- **`subtractOneDay`** — uses `new Date(y, m-1, d)` local constructor, not string arithmetic, to handle month boundaries correctly.
- **Run type filter** — includes `sport_type` values `Run`, `TrailRun`, and `VirtualRun` (plus legacy `type === 'Run'`), so trail runs or virtual runs don't create phantom gaps in the streak.
- **Pagination** — fetches up to 50 pages × 200 activities (10,000 total) to ensure the full history is covered; stops naturally when Strava returns a partial page.
- **Streak validation** — anchors on the **most recent** numbered run in the streak and computes expected numbers backwards. This ensures the known-good current run drives the sequence, not an older one.
- **Multiple runs per day** — exactly one run is selected per streak day via `pickStreakRun`. A day is valid as long as at least one run has the correct streak number in its title. Selection priority: exact expected-number match → any numbered title → earliest by time. A two-pass approach in `computeStreak` handles this: pass 1 finds the anchor, pass 2 re-picks each day with the now-known expected number.

## Data Structures

```js
RunActivity:   { id, name, start_date, start_date_local, sport_type, workout_type, distance, elapsed_time }
ProcessedRun:  { id, name, localDate, distance, elapsed_time, isRace, parsedNumber, expectedNumber, status }
StreakResult:  { streakDays, nextNumber, streakRuns, mostRecentRun, totalDistance, totalTime }
// status: 'ok' | 'error' | 'no-number'
// isRace: workout_type === 1
```

## Key Functions

- `getRunLocalDate(run)` — returns `YYYY-MM-DD` from `start_date_local` (preferred) or `start_date`
- `formatDate(dateStr)` — formats `YYYY-MM-DD` as human-readable e.g. `Sat, 28 Feb`
- `formatDistance(meters)` — converts metres to `12.3 km`
- `formatDuration(seconds)` — formats as `4h 32m` or `45m`
- `parseLastNumber(title)` — regex `/(\d+)/g`, returns last match as number or null
- `pickStreakRun(runsOnDay, expectedNumber)` — selects the single streak run from a day with multiple activities
- `computeStreak(runs)` — groups by local date, walks backward to find streak, two-pass picks one run per day, validates sequence, computes total distance and time
- `validateStreakNumbers(streakRuns)` — sorts ascending, anchors on most recent numbered run, computes expected offsets, flags mismatches
- `fetchAllRuns(accessToken, onRun)` — paginates Strava API, filters to run sport types, calls `onRun(name)` per run for loading UI feedback
- `refreshAccessToken()` — refreshes via the token proxy; returns `'ok' | 'rejected' | 'error'` (rejected = grant retired → session cleared; error = transient → tokens kept)
- `ensureValidToken()` — refreshes token if within 60s of expiry, returns token string or null
- `clearTokens()` — clears only the OAuth session (keeps client id) for one-tap reconnect; vs `clearAll()` for a full disconnect
- `handleOAuthCallback()` — detects `?code=` or `?error=`, exchanges code, cleans URL
- `stravaGet(path, token, retried)` — on 401 does one refresh + retry, else `renderReconnect()`; 429 → rate-limit message
- `renderReconnect()` — reconnect screen shown when the session was retired by another device
