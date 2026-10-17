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
    activity(1, '2026-10-01', { sport_type: 'TrailRun', distance: 25000 }),
    activity(2, '2026-10-02', { sport_type: 'VirtualRun', start_date_local: '2026-10-02T21:00:00Z' }),
    activity(3, '2026-10-03', { sport_type: undefined, type: 'Run', start_date_local: '2026-10-03T12:00:00Z', distance: 10000 }),
  ]);
  assert.deepEqual(result.runs.map(r => r.tags), [[0, 2, 3], [1, 4], [5]]);
  assert.equal(result.runs[1].virtual, true);
  const dawn = fun.snapshot(result, 3, 0);
  assert.equal(dawn.members.length, 1);
  assert.deepEqual(dawn.crossovers.map(c => c.name), ['Dirt worship', 'Longform']);
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

test('layout is stable as runs append, caps ultra size, and fits narrow screens', () => {
  const result = model([activity(1, '2026-10-01', { distance: 1600 }), activity(2, '2026-10-02', { distance: 160900 })]);
  for (const width of [270, 736]) {
    const positions = fun.layout(result.runs, width, 490);
    assert.deepEqual(fun.layout(result.runs.slice(0, 1), width, 490).points[0], positions.points[0]);
    for (const p of positions.points) {
      assert.ok(p.x >= p.radius && p.x + p.radius <= width);
      assert.ok(p.y >= p.radius && p.y + p.radius <= 490);
      assert.ok(p.radius >= 4 && p.radius <= 12);
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
