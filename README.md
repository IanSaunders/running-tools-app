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

Name your runs with the streak number as the last number in the title — e.g. `Morning Run 42`. The app tracks consecutive days, shows what number to use next, and flags any runs where the title number is wrong.

The latest streak ends on your most recent run, even if that run was several days ago. Activities are fetched newest first in pages of 200, stopping once the first missing run day is confirmed instead of downloading your entire history. Local dates and timezone differences are accounted for, and all runs on streak days are retained for title validation. A short page is not treated as the end of history; an empty page confirms exhaustion. If the beginning remains unconfirmed after 50 pages, the app shows an incomplete-check error rather than a potentially incorrect streak or title corrections.

## Tests

Run the dependency-free regression tests with Node.js:

```bash
node --test tests/streak-checker.test.mjs
```

The tests mock Strava responses, compare results with the full-history calculation, and verify pagination, request counts, local dates, and failure handling without accessing your account.

## Files

| File | Purpose |
|------|---------|
| `src/streak-checker/index.html` | Entire streak application (HTML + CSS + JS) |
| `src/streak-checker/config.js` | Generated at build time — holds only the public client id |
| `netlify/functions/strava-token.mjs` | Token broker — holds the client secret server-side |
| `tests/streak-checker.test.mjs` | Dependency-free streak fetching and calculation tests |
