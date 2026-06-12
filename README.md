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

## Files

| File | Purpose |
|------|---------|
| `src/index.html` | Entire application (HTML + CSS + JS) |
| `src/config.js` | Generated at build time — holds only the public client id |
| `netlify/functions/strava-token.mjs` | Token broker — holds the client secret server-side |
