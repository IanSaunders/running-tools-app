import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Exercise the shipped single-file app without a browser or extra dependencies.
const html = readFileSync(new URL('../src/streak-checker/index.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes('function computeStreak('));
const plain = value => JSON.parse(JSON.stringify(value));
let nextId = 1;

function activity(date, overrides = {}) {
  return {
    id: nextId++, name: 'Morning Run', sport_type: 'Run',
    start_date: `${date}T12:00:00Z`, start_date_local: `${date}T12:00:00Z`,
    distance: 5000, elapsed_time: 1800, ...overrides,
  };
}

function daysBack(count, end = '2026-10-17') {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.parse(`${end}T12:00:00Z`) - index * 86400000).toISOString().slice(0, 10);
    return activity(date, { name: `Run ${count - index}` });
  });
}

function createApp(pages, { refreshStatus = 200 } = {}) {
  const calls = [];
  const views = [];
  const storage = new Map([
    ['strava_access_token', 'initial-token'],
    ['strava_refresh_token', 'refresh-token'],
    ['strava_token_expires_at', '4102444800'],
  ]);
  const context = vm.createContext({
    document: { addEventListener() {} },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    fetch: async (url, options) => {
      calls.push({ url, token: options.headers.Authorization });
      if (url === '/api/strava/token') {
        return {
          ok: refreshStatus === 200, status: refreshStatus,
          json: async () => ({ access_token: 'fresh-token', refresh_token: 'fresh-refresh', expires_at: 4102444800 }),
        };
      }
      const parsed = new URL(url);
      assert.equal(parsed.pathname, '/api/v3/athlete/activities');
      assert.equal(parsed.searchParams.get('per_page'), '200');
      const page = Number(parsed.searchParams.get('page'));
      assert.ok(page >= 1 && page <= pages.length, `Unexpected request for page ${page}`);
      const response = typeof pages[page - 1] === 'function'
        ? pages[page - 1](options.headers.Authorization) : pages[page - 1];
      if (response instanceof Error) throw response;
      const status = typeof response === 'number' ? response : 200;
      return { ok: status === 200, status, json: async () => response };
    },
  });
  vm.runInContext(script, context);
  for (const name of ['renderDashboard', 'renderError', 'renderReconnect', 'renderSetup', 'renderLoading', 'updateLoadingMsg']) {
    context[name] = value => views.push({ name, value });
  }
  return { context, calls, views, storage };
}

async function check(pages, expectedCalls, history = pages.flat()) {
  const app = createApp(pages);
  const runs = await app.context.fetchLatestStreakRuns('initial-token');
  const result = plain(app.context.computeStreak(runs));
  // The existing full-history calculation remains the regression oracle.
  assert.deepEqual(result, plain(app.context.computeStreak(history)));
  assert.equal(app.calls.length, expectedCalls);
  assert.equal(app.views.length, 0);
  return { ...app, runs, result };
}

test('short latest streak skips years of history after one full page', async () => {
  const latest = daysBack(3);
  const old = daysBack(1200, '2020-12-31');
  const history = [...latest, ...old];
  const pages = Array.from({ length: Math.ceil(history.length / 200) }, (_, i) => history.slice(i * 200, (i + 1) * 200));
  const { result, runs } = await check(pages, 1, history);
  assert.equal(result.streakDays, 3);
  assert.equal(result.nextNumber, 4);
  assert.equal(runs.length, 3);
});

test('long streak continues across full pages then stops before older history', async () => {
  const latest = daysBack(450);
  const old = daysBack(500, '2020-12-31');
  const history = [...latest, ...old];
  const pages = Array.from({ length: Math.ceil(history.length / 200) }, (_, i) => history.slice(i * 200, (i + 1) * 200));
  const { result } = await check(pages, 3, history);
  assert.equal(result.streakDays, 450);
  assert.equal(result.nextNumber, 451);
});

test('all same-day candidates survive a page boundary and preserve selection and totals', async () => {
  const newer = activity('2026-10-17', { name: 'Run 2' });
  const wrong = activity('2026-10-16', { name: 'Run 99' });
  const correct = activity('2026-10-16', {
    name: 'Run 1', start_date: '2026-10-16T06:00:00Z',
    start_date_local: '2026-10-16T06:00:00Z', distance: 12000, elapsed_time: 3600,
  });
  const { result, runs } = await check([[newer, wrong], [correct, activity('2026-10-13')]], 2);
  assert.equal(runs.length, 3);
  assert.equal(result.streakRuns[0].id, correct.id);
  assert.equal(result.totalDistance, 17000);
  assert.equal(result.totalTime, 5400);
  assert.ok(result.streakRuns.every(run => run.status === 'ok'));
});

test('trail, virtual, and legacy runs count; non-run pages do not confirm the gap', async () => {
  const pages = [
    [activity('2026-10-20', { sport_type: 'Ride' })],
    [activity('2026-10-19', { sport_type: 'Swim' })],
    [activity('2026-10-17', { sport_type: 'TrailRun' }),
      activity('2026-10-16', { sport_type: 'VirtualRun' }),
      activity('2026-10-15', { sport_type: undefined, type: 'Run' })],
    [activity('2026-10-12', { sport_type: 'Ride' })],
    [activity('2020-01-01')],
  ];
  const runs = pages.flat().filter(a => a.sport_type !== 'Ride' && a.sport_type !== 'Swim');
  const { result } = await check(pages, 5, runs);
  assert.equal(result.streakDays, 3);
});

test('empty account and account with no runs finish only at an empty page', async () => {
  await check([[]], 1);
  await check([[activity('2026-10-17', { sport_type: 'Ride' })], []], 2, []);
});

test('short non-final pages do not truncate the streak', async () => {
  const runs = daysBack(3);
  const { result } = await check([[runs[0]], [runs[1]], [runs[2]], []], 4);
  assert.equal(result.streakDays, 3);
});

test('history ending on a full page is confirmed by the next empty page', async () => {
  const { result } = await check([daysBack(200), []], 2);
  assert.equal(result.streakDays, 200);
});

test('UTC+14 boundary is inclusive: another page can fill the apparent missing day', async () => {
  const boundary = '2026-10-15T10:00:00Z';
  const today = activity('2026-10-17');
  const ride = activity('2026-10-15', { start_date: boundary, sport_type: 'Ride' });
  const missing = activity('2026-10-16', { start_date: boundary, start_date_local: '2026-10-16T00:00:00Z' });
  const pages = [[today, ride], [missing, activity('2026-10-12')]];
  const { result } = await check(pages, 2, [today, missing, pages[1][1]]);
  assert.equal(result.streakDays, 2);
});

test('travel can make a later page contain the latest local run day', async () => {
  const first = activity('2026-10-17');
  const nextDay = activity('2026-10-18', {
    start_date: '2026-10-17T11:00:00Z', start_date_local: '2026-10-18T01:00:00Z',
  });
  const { result } = await check([[first], [nextDay, activity('2026-10-13')]], 2);
  assert.equal(result.streakDays, 2);
  assert.equal(result.mostRecentRun.id, nextDay.id);
  assert.ok(result.streakRuns.some(run => run.localDate === '2026-10-18'));
});

test('UTC-12 and UTC+14 runs fill consecutive local days across pages', async () => {
  const west = activity('2026-10-17', {
    start_date: '2026-10-18T11:30:00Z', start_date_local: '2026-10-17T23:30:00Z',
  });
  const east = activity('2026-10-16', {
    start_date: '2026-10-15T10:30:00Z', start_date_local: '2026-10-16T00:30:00Z',
  });
  const { result } = await check([[west], [east, activity('2026-10-12')]], 2);
  // The western run ends exactly at midnight, covering one additional day.
  assert.equal(result.streakDays, 3);
});

test('overnight ultra bridges days across pages and counts only once in totals', async () => {
  const latest = activity('2026-10-20', { name: 'Run 4 & 20min sauna' });
  const ultra = activity('2026-10-17', {
    name: 'Ultra 1/2/3', elapsed_time: 55 * 3600, distance: 160934,
  });
  const older = activity('2026-10-13');
  const { result, runs } = await check([[latest], [ultra, older]], 2);
  assert.equal(runs.length, 2);
  assert.equal(result.streakDays, 4);
  assert.equal(result.nextNumber, 5);
  assert.equal(result.streakRuns.length, 2);
  assert.equal(result.streakRuns[0].expectedLabel, '1/2/3');
  assert.equal(result.streakRuns[0].dayCount, 3);
  assert.equal(result.totalDistance, 165934);
  assert.equal(result.totalTime, 55 * 3600 + 1800);
  assert.ok(result.streakRuns.every(run => run.status === 'ok'));
});

test('non-run pages beyond an apparent gap cannot hide an earlier multi-day run', async () => {
  const latest = activity('2026-10-17', { name: 'Run 5' });
  const ride = activity('2026-10-14', { sport_type: 'Ride' });
  const ultra = activity('2026-10-13', { name: 'Ultra 1/2/3/4', elapsed_time: 3 * 86400 });
  const older = activity('2026-10-09');
  const pages = [[latest, ride], [ultra], [older]];
  const { result } = await check(pages, 3, [latest, ultra, older]);
  assert.equal(result.streakDays, 5);
});

test('a latest run spanning several days has one row and one set of totals', async () => {
  const ultra = activity('2026-10-17', { name: 'Ultra 1/2/3', elapsed_time: 48 * 3600 });
  const { result, runs } = await check([[ultra, activity('2026-10-13')]], 1);
  assert.equal(runs.length, 1);
  assert.equal(result.streakDays, 3);
  assert.equal(result.streakRuns.length, 1);
  assert.equal(result.streakRuns[0].endDate, '2026-10-19');
  assert.equal(result.totalDistance, ultra.distance);
  assert.equal(result.totalTime, ultra.elapsed_time);
});

test('an older run must finish before the UTC gap boundary, not merely start before it', async () => {
  const latest = activity('2026-10-17');
  // Locally this run ends on the 15th, but in UTC it ends after the earliest
  // possible start of the missing 16th. Another timezone can still fill it.
  const older = activity('2026-10-15', {
    start_date: '2026-10-15T09:00:00Z', start_date_local: '2026-10-15T08:00:00Z', elapsed_time: 7200,
  });
  const crossing = activity('2026-10-15', {
    start_date: '2026-10-15T08:30:00Z', start_date_local: '2026-10-15T22:30:00Z', elapsed_time: 7200,
  });
  const { result } = await check([[latest, older], [crossing, activity('2026-10-11')]], 2);
  assert.equal(result.streakDays, 3);
});

test('invalid run durations fail safely', async () => {
  for (const elapsed_time of [-1, NaN, Infinity]) {
    const app = createApp([[activity('2026-10-17', { elapsed_time })]]);
    await assert.rejects(app.context.fetchLatestStreakRuns('initial-token'), /invalid duration/);
  }
});

test('multiple title numbers and closest-number fixes survive early fetching', async () => {
  const latest = activity('2026-10-17', { name: 'Run 2 & 20min sauna' });
  const wrong = activity('2026-10-16', { name: 'Run 4 & 20min sauna' });
  const other = activity('2026-10-16', {
    name: 'Run 50', start_date: '2026-10-16T06:00:00Z', start_date_local: '2026-10-16T06:00:00Z',
  });
  const { result, context } = await check([[latest, wrong], [other, activity('2026-10-12')]], 2);
  assert.equal(result.streakRuns[1].status, 'ok');
  assert.equal(result.streakRuns[0].id, wrong.id);
  assert.equal(result.streakRuns[0].parsedNumber, 4);
  assert.equal(context.buildFixedName(wrong.name, '1', 4), 'Run 1 & 20min sauna');
});

for (const [label, dates] of [
  ['spring daylight saving', [['2026-03-09', '07'], ['2026-03-08', '08'], ['2026-03-07', '08']]],
  ['fall daylight saving', [['2026-11-02', '08'], ['2026-11-01', '07'], ['2026-10-31', '07']]],
  ['year boundary', [['2026-01-02', '08'], ['2026-01-01', '08'], ['2025-12-31', '08']]],
  ['leap day', [['2024-03-01', '08'], ['2024-02-29', '08'], ['2024-02-28', '08']]],
]) {
  test(`${label} preserves consecutive local dates`, async () => {
    const runs = dates.map(([date, hour]) => activity(date, {
      start_date: `${date}T${hour}:30:00Z`, start_date_local: `${date}T00:30:00Z`,
    }));
    const { result } = await check([...runs.map(run => [run]), []], 4);
    assert.equal(result.streakDays, 3);
  });
}

test('missing local timestamps retain the existing browser-timezone fallback', async () => {
  const runs = daysBack(3).map(run => ({ ...run, start_date_local: undefined }));
  const { result } = await check([[runs[0]], runs.slice(1), []], 3);
  assert.equal(result.streakDays, 3);
});

test('shuffled activities within a page retain fast early stopping', async () => {
  const runs = daysBack(3);
  const older = activity('2026-10-10');
  const pages = [[runs[1], older, runs[0], runs[2]]];
  const { result } = await check(pages, 1);
  assert.equal(result.streakDays, 3);
});

test('obscured timestamps mixed with normal times no longer cause an ordering error', async () => {
  const hidden = activity('2026-10-17', {
    start_date: '2026-10-17T00:00:01Z', start_date_local: '2026-10-17T00:00:01Z',
  });
  const app = createApp([[hidden, activity('2026-10-17'), activity('2026-10-13')]]);
  await app.context.loadAndRenderDashboard();
  assert.equal(app.calls.length, 1);
  assert.equal(app.views.at(-1).name, 'renderDashboard');
  assert.equal(app.views.at(-1).value.streakDays, 1);
});

test('out-of-order pages finish at exhaustion instead of failing or trusting an apparent gap', async () => {
  const pages = [
    [activity('2026-10-17')],
    [activity('2026-10-18'), activity('2026-10-14')],
    [activity('2026-10-16'), activity('2026-10-15')],
    [],
  ];
  const { result } = await check(pages, 4);
  assert.equal(result.streakDays, 5);
});

test('duplicate activities at page boundaries do not disable early stopping', async () => {
  const runs = daysBack(3);
  const older = activity('2026-10-10');
  const pages = [[runs[0], runs[1]], [runs[0], runs[1], runs[2], older]];
  const { result, runs: fetched } = await check(pages, 2, [...runs, older]);
  assert.equal(fetched.length, 3);
  assert.equal(result.totalDistance, 15000);
});

test('a duplicate-only page is not mistaken for exhaustion', async () => {
  const runs = daysBack(3);
  const older = activity('2026-10-10');
  const pages = [[runs[0]], [runs[0]], [runs[1], runs[2], older]];
  const { result } = await check(pages, 3, [...runs, older]);
  assert.equal(result.streakDays, 3);
});

test('unordered-page fallback still respects the safety limit without showing partial results', async () => {
  const runs = daysBack(49);
  const app = createApp([[runs[1]], ...runs.map(run => [run])]);
  await app.context.loadAndRenderDashboard();
  assert.equal(app.calls.length, 50);
  assert.match(app.views.at(-1).value, /could not be fully checked within 50 pages/);
  assert.ok(!app.views.some(view => view.name === 'renderDashboard'));
});

test('invalid activity dates fail safely, including dates on non-runs', async () => {
  for (const run of [
    activity('2026-10-17', { start_date: 'invalid', sport_type: 'Ride' }),
    activity('2026-10-17', { start_date_local: 'invalid' }),
  ]) {
    const app = createApp([[run]]);
    await assert.rejects(app.context.fetchLatestStreakRuns('initial-token'), /invalid/);
  }
});

test('page limit never presents a partial streak or title corrections', async () => {
  const app = createApp(daysBack(50).map(run => [run]));
  await app.context.loadAndRenderDashboard();
  assert.equal(app.calls.length, 50);
  assert.match(app.views.at(-1).value, /could not be fully checked within 50 pages/);
  assert.ok(!app.views.some(view => view.name === 'renderDashboard'));
});

test('a confirmed gap or exhausted history on page 50 still succeeds', async () => {
  const runs = daysBack(49);
  await check([...runs.map(run => [run]), [activity('2020-01-01')]], 50);
  await check([...runs.map(run => [run]), []], 50);
});

for (const [label, failure, expected] of [
  ['rate limit', 429, /Rate limit/],
  ['server error', 500, /Strava API error: 500/],
  ['network error', new Error('Network unavailable'), /Network unavailable/],
]) {
  test(`${label} does not render a partial result`, async () => {
    const app = createApp([[activity('2026-10-17')], failure]);
    await app.context.loadAndRenderDashboard();
    assert.equal(app.calls.length, 2);
    assert.match(app.views.at(-1).value, expected);
    assert.ok(!app.views.some(view => view.name === 'renderDashboard'));
  });
}

test('authentication refresh retries the page and uses fresh tokens on later pages', async () => {
  const latest = activity('2026-10-17');
  const app = createApp([
    token => token === 'Bearer initial-token' ? 401 : [latest],
    [activity('2026-10-13')],
  ]);
  const runs = await app.context.fetchLatestStreakRuns('initial-token');
  assert.equal(app.context.computeStreak(runs).streakDays, 1);
  assert.equal(app.calls.length, 4);
  assert.equal(app.calls[2].token, 'Bearer fresh-token');
  assert.equal(app.calls[3].token, 'Bearer fresh-token');
});

test('rejected refresh shows reconnect without a partial dashboard', async () => {
  const app = createApp([[activity('2026-10-17')], 401], { refreshStatus: 400 });
  await app.context.loadAndRenderDashboard();
  assert.equal(app.views.at(-1).name, 'renderReconnect');
  assert.ok(!app.views.some(view => view.name === 'renderDashboard'));
});

test('dashboard orchestration uses the early result and latest-streak loading text', async () => {
  const app = createApp([[...daysBack(3), activity('2020-01-01')]]);
  await app.context.loadAndRenderDashboard();
  assert.equal(app.calls.length, 1);
  assert.equal(app.views[0].value, 'Checking your latest streak…');
  assert.equal(app.views.at(-1).name, 'renderDashboard');
  assert.equal(app.views.at(-1).value.streakDays, 3);
});
