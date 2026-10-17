import assert from 'node:assert/strict';
import test from 'node:test';
import fun from '../src/streak-checker/fun-mode.js';

const activity = (id, date, fields = {}) => ({ id, name: `Run ${id}`, sport_type: 'Run', start_date_local: `${date}T06:30:00Z`, distance: 5000, elapsed_time: 1800, ...fields });
const model = runs => fun.buildModel(runs, '2026-10-01', '2026-10-28');

test('all same-day runs survive, duplicate IDs and unrelated history do not', () => {
  const a = activity(1, '2026-10-01'), b = activity(2, '2026-10-01');
  const input = [a, b, a, activity(3, '2026-09-01'), activity(4, '2026-10-29'), activity(5, '2026-10-02', { sport_type: 'Ride' })];
  const before = JSON.stringify(input), result = model(input);
  assert.deepEqual(result.runs.map(r => r.id), ['1', '2']);
  assert.equal(JSON.stringify(input), before);
});

test('overlapping cohorts are derived from data, including virtual and legacy runs', () => {
  const result = model([
    activity(1, '2026-10-01', { sport_type: 'Run', distance: 25000, total_elevation_gain: 320 }),
    activity(2, '2026-10-02', { sport_type: 'VirtualRun', start_date_local: '2026-10-02T21:00:00Z' }),
    activity(3, '2026-10-03', { sport_type: undefined, type: 'Run', start_date_local: '2026-10-03T12:00:00Z', distance: 10000 }),
  ]);
  assert.deepEqual(result.runs.map(r => r.tags), [[0, 2, 3], [1, 4], [5]]);
  assert.equal(result.runs[1].virtual, true);
  const dawn = fun.snapshot(result, 3, 0);
  assert.equal(dawn.members.length, 1);
  assert.deepEqual(dawn.crossovers.map(c => c.name), ['Gravity rebels', 'Longform']);
});

test('timeline uses local dates across daylight saving, months and years', () => {
  for (const [first, last] of [['2026-03-08', '2026-03-09'], ['2026-11-01', '2026-11-02'], ['2026-12-31', '2027-01-01']]) {
    const result = fun.buildModel([activity(1, first), activity(2, last)], first, last);
    assert.equal(result.days, 2);
    assert.deepEqual(result.runs.map(r => [r.day, r.hour]), [[1, 6], [2, 6]]);
    assert.equal(fun.snapshot(result, 1, 0).runs.length, 1);
  }
});

test('overnight recordings overlap the streak boundary and count once', () => {
  const run = activity(1, '2026-09-30', { start_date_local: '2026-09-30T23:00:00Z', elapsed_time: 30 * 3600, distance: 160900 });
  const result = model([run, run]);
  assert.equal(result.runs.length, 1);
  assert.equal(result.runs[0].day, 1);
  assert.equal(result.runs[0].endDay, 2);
  assert.equal(result.runs[0].km, 160.9);
});

test('empty data and invalid dates stay empty; unavailable distance is not a tiny run', () => {
  assert.deepEqual(fun.buildModel([], undefined, undefined), { runs: [], days: 0 });
  const result = model([activity(1, '2026-10-01', { start_date_local: 'bad' }), activity(2, '2026-10-01', { start_date_local: '2026-10-01T25:00:00Z' }), activity(3, '2026-10-01', { distance: null }), activity('invalid-id', '2026-10-01')]);
  assert.equal(result.runs.length, 1);
  assert.equal(result.runs[0].km, null);
  assert.deepEqual(result.runs[0].tags, [0]);
});

test('large streaks bound map work but preserve every run for analysis and selection', () => {
  const result = model(Array.from({ length: 10000 }, (_, i) => activity(i + 1, '2026-10-01')));
  const sample = fun.mapRuns(result.runs, '9999');
  assert.equal(sample.length, 160);
  assert.equal(new Set(sample.map(r => r.id)).size, 160);
  assert.ok(sample.some(r => r.id === '9999'));
  assert.equal(fun.snapshot(result, 1, 0).members.length, 10000);
  assert.deepEqual(fun.mapRuns([...result.runs].reverse(), '9999'), sample);
});

test('bubble area is proportional to distance, stable across timeline and sampling, and fits mobile', () => {
  const result = model([activity(1, '2026-10-01', { distance: 100 }), activity(2, '2026-10-02', { distance: 20000 }), activity(3, '2026-10-03', { distance: 160900 })]);
  for (const width of [270, 736]) {
    const positions = fun.layout(result.runs, width, 490, result.maxKm);
    assert.deepEqual(fun.layout(result.runs.slice(0, 1), width, 490, result.maxKm).points[0], positions.points[0]);
    const [a, b] = positions.points;
    assert.ok(Math.abs(b.radius ** 2 / a.radius ** 2 - 200) < 1e-10);
    for (const p of positions.points) {
      assert.ok(p.x >= p.radius && p.x + p.radius <= width);
      assert.ok(p.y >= p.radius && p.y + p.radius <= 490);
      assert.ok(p.radius > 0 && p.radius <= 28);
    }
  }
});

test('malicious titles remain plain data and links can only use numeric IDs', () => {
  const title = '<img src=x onerror=alert(1)>';
  const result = model([activity(42, '2026-10-01', { name: title }), activity('42/../../bad', '2026-10-01')]);
  assert.equal(result.runs.length, 1);
  assert.equal(result.runs[0].name, title);
  assert.equal(result.runs[0].id, '42');
});

test('vert comes from recorded gain, never the trail tag; missing is distinct from zero', () => {
  const result = model([
    activity(1, '2026-10-01', { sport_type: 'TrailRun' }),
    activity(2, '2026-10-02', { total_elevation_gain: 300 }),
    activity(3, '2026-10-03', { total_elevation_gain: 0 }),
    activity(4, '2026-10-04', { total_elevation_gain: -10 }),
  ]);
  assert.deepEqual(result.runs.map(r => r.tags.includes(2)), [false, true, false, false]);
  assert.deepEqual(result.runs.map(r => r.gain), [null, 300, 0, null]);
  const groups = fun.groupsFor(result, 'gain');
  assert.deepEqual(groups.map(g => result.runs.filter(g.matches).map(r => r.id)), [['3'], [], [], ['2'], [], ['1', '4']]);
});

test('pace uses moving time or average speed, never elapsed time; HR is optional', () => {
  const result = model([
    activity(1, '2026-10-01', { moving_time: 1500, elapsed_time: 3600, average_heartrate: 143.5 }),
    activity(2, '2026-10-02', { average_speed: 4, has_heartrate: false, average_heartrate: 150 }),
    activity(3, '2026-10-03', { moving_time: 0, average_speed: 0, average_heartrate: 0 }),
    activity(4, '2026-10-04', { distance: 0, moving_time: 300, average_heartrate: '145' }),
    activity(5, '2026-10-05', { moving_time: -30, average_speed: NaN, average_heartrate: Infinity }),
  ]);
  assert.deepEqual(result.runs.map(r => r.pace), [300, 250, null, null, null]);
  assert.deepEqual(result.runs.map(r => r.hr), [143.5, null, null, null, null]);
  assert.equal(fun.paceLabel(359.7), '6:00 /km');
  assert.equal(fun.paceLabel(null), 'Unavailable');
});

test('every metric run belongs to exactly one explicit band, including boundaries and unknowns', () => {
  const result = model([0, 50, 150, 300, 600, null].map((gain, i) => activity(i + 1, '2026-10-01', {
    total_elevation_gain: gain, average_heartrate: [100, 120, 140, 160, 180, null][i], moving_time: [1200, 1500, 1800, 2100, 2400, undefined][i],
  })));
  for (const lens of ['gain', 'pace', 'hr']) {
    const groups = fun.groupsFor(result, lens);
    for (const [i, run] of result.runs.entries()) assert.deepEqual(groups.map((g, index) => g.matches(run) ? index : -1).filter(i => i >= 0), [i]);
  }
});

test('nearby starts share a stable launch site, including across date line and near poles', () => {
  const coords = [[37.77, -122.42], [37.78, -122.43], [34.05, -118.24], [0, 179.99], [0, -179.99], [89.99, 0], [89.99, 180], [0, 0]];
  const input = coords.map((start_latlng, i) => activity(i + 1, '2026-10-01', { start_latlng }));
  const result = model(input);
  assert.deepEqual(result.runs.map(r => r.place), [0, 0, 1, 2, 2, 3, 3, 4]);
  assert.deepEqual(model([...input].reverse()), result);
  assert.deepEqual(model(input.slice(0, 3)).runs.map(r => r.place), [0, 0, 1]);
  assert.equal(result.places[0].count, 2);
});

test('location never guesses missing/private coordinates or maps indoor and virtual runs', () => {
  const invalid = [null, [], [91, 0], [0, 181], ['37', -122], [NaN, 1], [1, Infinity]];
  const runs = invalid.map((start_latlng, i) => activity(i + 1, '2026-10-01', { start_latlng }));
  runs.push(activity(20, '2026-10-01', { start_latlng: [37, -122], sport_type: 'VirtualRun' }), activity(21, '2026-10-01', { start_latlng: [37, -122], trainer: true }));
  const result = model(runs);
  assert.equal(result.places.length, 0);
  assert.ok(result.runs.every(r => r.coordinates === null && r.place === null));
  assert.equal(fun.groupsFor(result, 'places')[0].name, 'Uncharted');
});

test('many places keep a bounded set of orbits with all runs reachable, and zero distance has no sized bubble', () => {
  const result = model(Array.from({ length: 1000 }, (_, i) => activity(i + 1, '2026-10-01', { start_latlng: [(i % 100) - 50, Math.floor(i / 100)], distance: i % 2 ? 0 : null })));
  const groups = fun.groupsFor(result, 'places');
  assert.equal(groups.length, 7);
  assert.ok(result.runs.every(r => groups.filter(g => g.matches(r)).length === 1));
  for (const p of fun.layout(fun.mapRuns(result.runs), 270, 490, result.maxKm, groups).points) {
    assert.equal(p.radius, 0);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
});
