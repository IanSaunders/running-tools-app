# Crew Tracker — architecture notes

A single-file (`index.html`, vanilla JS, no build) mobile-first crew companion for the
**Western States 100**. Crew log aid-station splits from the official live tracker; the
app projects the finish time, carries the running delta forward to every downstream
stop, and tells the runner what pace they need to hold for any goal time. A specific
Google Sheet is the **hardcoded** shared data store.

## Hardcoded data store

`const SHEET` pins the spreadsheet id + the **"Crew - app"** tab (`gid 354419833`):

```
https://docs.google.com/spreadsheets/d/1WInynSPvtb-TxcRhBhdyVjQ3_XnVHmPPEU_BXfLRdWw/edit?gid=354419833
```

The tab's columns (order auto-detected by header, so the layout can move):

| Mile | Crew Stop | ETA | Leave By | Adjust +/- min | Total Adj min | Stop Goal | Have Ready | Crew Notes |

- **ETA** is the runner's own pace plan (currently a ~19:30 finish) and is the source of
  truth for all planned splits — it replaces any generic terrain model.
- **Stop Goal / Have Ready** are surfaced on the *Next crew stop* card and each expanded
  row so crew know their job at the next stop.
- **Adjust +/- min** is the column the app writes back (see "Push").

### Load flow
1. `SHEET_SNAPSHOT` (an embedded copy of the 16 stops) builds the course instantly, so
   the app renders offline / before the network responds.
2. `pullFromSheet()` then fetches the live tab (public gviz CSV — CORS works for
   link-shared sheets) and rebuilds the course + merges any `Adjust` values. The header
   shows `Synced <time>` (green) or `Using saved plan` (red) if the fetch fails.
3. **Refresh from sheet** on the Data tab re-pulls on demand.

`SHEET_SNAPSHOT` is a static copy — if the sheet's stops/ETAs change structurally and you
want the offline default to match, re-paste the rows. Adjustments always come live.

## Course model

`buildCourse(rows)` turns sheet rows into `COURSE.stations[]` with
`{ name, mile, crew, etaText, leaveBy, plannedElapsed, stopGoal, haveReady, crewNotes }`.

- `plannedElapsed` is parsed from the ETA text (`parseDayTime` understands `"Sat 5:00 AM"`
  / `"Sun 12:20 AM"`) relative to the first row, so overnight Sat→Sun is handled.
- `crew` (crew-*access* — drives the "Next crew stop" card) is derived from `CREW_ACCESS`
  name keywords: Start, Robinson, Michigan, Foresthill, Rucky, Green Gate, Highway 49,
  Finish. (The sheet lists more stops than crew can physically reach; all are shown in the
  schedule, but only these surface as the next *crew* stop.)
- `PLAN_FINISH` = last stop's planned elapsed; the default goal/comparison.
- Default start is **2026-06-27 05:00** (WS 2026, a Saturday) so clock labels read Sat/Sun.

## Projection engine (`project()`)

Walks stations keeping a `runningOffset`:
- A logged **actual** sets `projected = actual`, `runningOffset = actual − planned`.
- A per-stop **adjust** nudges and carries forward.
- Otherwise `projected = planned + runningOffset`.

Each row also gets `incAdjust = round(delta − prevDelta)` — the **incremental** minutes for
that stop. That maps to the sheet's two columns: `incAdjust` → **Adjust +/- min**,
`delta` → **Total Adj min** (the cumulative). The finish row's `projected` is the headline.

## Tabs

- **Track** (mobile-smart default): dark hero (projected finish + on/off-plan badge + last
  split); a **Runner position** stepper (◀ Back / Reached next ▶) that advances the runner
  through the schedule *without needing a time* — for when the live tracker is quiet (sets a
  `reached` flag; see below); **Next crew stop** card with projected arrival, *Have ready*,
  and *Goal* from the sheet; a trimmed schedule (next 3 + next crew stop + finish, with
  "⋯ N more ⋯" gaps). Tap a stop → set actual arrival clock time, nudge Adjust ± min,
  **Mark reached (no time)**, or Clear.

### Reached vs timed
Each station's state is `{ adjust, actual, reached }`. A stop is **done** if it has a logged
`actual` *or* a manual `reached` flag. Only an `actual` changes the carried `runningOffset`
(the projection math); `reached` just advances the "current position" / next-crew pointer so
crew can keep the app in step with a runner even with no split data. `advanceRunner(dir)`
and the editor's *Mark reached* both toggle `reached`.

### Auto-push on Save
**Save split** writes locally and, if a write URL is configured, immediately pushes that
stop's `Adjust +/- min` to the sheet (status shows "Pushing…" → "Pushed … (adjust X, total
Y)"). With no write URL it saves on-device and tells the user how to enable writing. There's
no separate per-row push button anymore — saving is the push.
- **Pace**: goal chips — **Plan (sheet finish) / Sub-24 Silver / Sub-30 Finisher / Custom**.
  Targets scale the plan's segment durations to the chosen goal (keeps the runner's pacing
  shape). "Pace needed **from here**" recomputes the remaining stops from the last split.
- **Crew** (was "Splits"): the **Crew helper** — crew-access stops as rich cards with a
  **Parking in Maps** deep link, curated **tips**, the sheet's *Have ready*, and an editable
  per-stop **note**; full schedule below. Each stop's coords come from `CREW_INFO` (approx,
  editable per stop → `state.stations[].lat/lng`; a custom pin overrides). Notes/pins are
  device-local and are **preserved across an authoritative refresh**.
- **Data**: the hardcoded sheet (synced status + Open/Refresh), the optional push-back
  Apps Script URL, **units** (mi/km), race setup (runner / start / comparison goal), reset.

### Crew map
`CREW_MAP` holds the shared WSER "My Maps" (mid `1RYEuztq4mGBPbZITNXNV1GF0mvjuk-s`). It's
embedded (iframe `…/maps/d/embed?mid=…`) at the top of the Crew tab with an "Open full crew
map" link to the viewer. The per-stop parking pins in `CREW_INFO` (coords + access type:
shuttle / drive-in / on foot / pacer) are taken from this map's placemarks, and `CREW_ACCESS`
matches its `[C …]` tags (Olympic Valley, Robinson, Dusty Corners, Michigan, Foresthill, Rucky
Chucky, Green Gate, Pointed Rocks, Robie Point, Placer HS). To refresh from an updated map:
`curl -sL "https://www.google.com/maps/d/kml?mid=<mid>&forcekml=1"` and re-read the placemarks.

### Units
`state.units` ('imperial' | 'metric'). Helpers `toDist`/`fmtDist`/`toPace`/`fmtPaceU` convert
miles→km and min/mi→min/km across every distance and pace display.

### What syncs to the sheet
Only a genuine split syncs: a logged actual, a non-zero adjust, **Mark reached**, or the
position stepper (these push the incremental `Adjust +/- min`; *Mark reached*/stepper push 0 so
the filled cell marks the stop reached). **Clear** and *Undo reached* blank the cell
(`clearStationInSheet`). Editing only a note or parking pin stays on-device — it never writes.

State persists to `localStorage` (`ws-crew-state-v2`).

## Push (Apps Script web app — hardcoded, no OAuth)

Client-side writes to Sheets need an authenticated endpoint. We use a Google **Apps Script**
web app bound to the sheet. The endpoint is **hardcoded** in `index.html`:

```js
const SHEET_WRITE_URL = "";  // ← paste the deployed /exec URL here
const writeEndpoint = () => (state.writeUrl && state.writeUrl.trim()) || SHEET_WRITE_URL;
```

Once `SHEET_WRITE_URL` is filled, **every** crew device pushes automatically on Save split —
nobody pastes anything. The Data-tab field is only a per-device *override* for testing.
`writeEndpoint()` gates every push (Save split, per-row, Push all) and the Data-tab UI flips
to green "Auto-sync on".

The app POSTs `{ updates: [{ station, mile, adjust, total, actual }] }` (`mode:"no-cors"`,
so the response is opaque — confirm by refreshing the sheet). `adjust` is the **incremental**
value written to the **Adjust +/- min** column (E); `Total Adj min` (F) should be a formula
summing E so it updates itself.

### One-time deploy (gets the /exec URL to hardcode)
1. Open the sheet → **Extensions → Apps Script**.
2. Paste the script below, Save.
3. **Deploy → New deployment → Web app** — *Execute as: Me*, *Who has access: Anyone*.
4. Authorise, copy the **Web app `/exec` URL**, and put it in `SHEET_WRITE_URL` (or paste on
   the Data tab to test on one device first). Re-deploy as a *new version* after script edits.

```js
const SHEET_NAME  = 'Crew - app';
const COL_STATION = 2;   // column B = "Crew Stop" (used to match rows)
const COL_ADJUST  = 5;   // column E = "Adjust +/- min"

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const names = sh.getRange(1, COL_STATION, sh.getLastRow(), 1)
                  .getValues().map(r => String(r[0]).trim().toLowerCase());
  (data.updates || []).forEach(u => {
    const key = String(u.station).trim().toLowerCase();
    let row = names.indexOf(key);
    if (row < 0) row = names.findIndex(n => n && (n.includes(key.split(' ')[0]) ||
                                                  key.includes(n.split(' ')[0])));
    if (row >= 0) sh.getRange(row + 1, COL_ADJUST).setValue(u.adjust);
  });
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
                       .setMimeType(ContentService.MimeType.JSON);
}
```

## TODO / wiring left for Ian
- Deploy the Apps Script above and paste the `/exec` URL on the Data tab to enable push
  (read-only works today without it).
- Confirm/replace the Western States **live-tracker URL** crew watch on race day.
- Confirm the `CREW_ACCESS` list matches who's actually crewing which stops.
