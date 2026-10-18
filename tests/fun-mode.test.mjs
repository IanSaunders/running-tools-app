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
      assert.ok(p.radius > 0 && p.radius <= 50);
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


test('metric views connect different groups through known shared metrics and places', () => {
  const result = model([
    activity(1, '2026-10-01', { total_elevation_gain: 0, moving_time: 1600, average_heartrate: 145, start_latlng: [37, -122] }),
    activity(2, '2026-10-02', { total_elevation_gain: 800, moving_time: 1700, average_heartrate: 147, start_latlng: [37.01, -122] }),
    activity(3, '2026-10-03', { total_elevation_gain: 10, moving_time: 2600, average_heartrate: 180 }),
  ]);
  const edges = fun.connections(result.runs, result, 'gain', fun.groupsFor(result, 'gain'));
  assert.equal(edges.filter(e => !e.bridge).length, 1);
  const bridge = edges.find(e => e.bridge && [e.a, e.b].includes('1') && [e.a, e.b].includes('2'));
  assert.ok(bridge);
  assert.equal(bridge.reasons.length, 3);
  assert.ok(bridge.reasons.some(reason => reason.startsWith('Pace:')));
  assert.ok(bridge.reasons.some(reason => reason.startsWith('Heart rate:')));
  assert.ok(bridge.reasons.includes('Launch site 1'));
  assert.equal(new Set(edges.map(e => [e.a, e.b].sort().join(':'))).size, edges.length);
});

test('missing metrics and different remote sites never invent a bridge', () => {
  const result = model([activity(1, '2026-10-01', { total_elevation_gain: 0 }), activity(2, '2026-10-02', { total_elevation_gain: 900 })]);
  assert.deepEqual(fun.connections(result.runs, result, 'gain', fun.groupsFor(result, 'gain')), []);
  const far = model(Array.from({ length: 8 }, (_, i) => activity(i + 1, '2026-10-01', { start_latlng: [i * 10, 0], total_elevation_gain: i % 2 ? 0 : 900 })));
  assert.equal(fun.connections(far.runs, far, 'gain', fun.groupsFor(far, 'gain')).filter(e => e.bridge).length, 0);
});

test('graph work stays bounded to displayed runs and never mutates source coordinates', () => {
  const result = model(Array.from({ length: 1000 }, (_, i) => activity(i + 1, '2026-10-01', { total_elevation_gain: i % 2 ? 0 : 900, moving_time: 1600 })));
  const before = JSON.stringify(result), shown = fun.mapRuns(result.runs, '999');
  const edges = fun.connections(shown, result, 'gain', fun.groupsFor(result, 'gain'));
  assert.ok(edges.length <= shown.length * 3);
  assert.ok(edges.every(e => shown.some(r => r.id === e.a) && shown.some(r => r.id === e.b)));
  assert.equal(JSON.stringify(result), before);
});

test('zoom keeps the world point beneath the pointer fixed and respects bounds', () => {
  const view = { x: -25, y: 40, k: 1.5 }, point = { x: 230, y: 120 };
  const before = fun.worldPoint(view, point.x, point.y);
  for (const factor of [.001, .8, 1.25, 1000]) {
    const zoomed = fun.zoomAt(view, factor, point.x, point.y);
    assert.ok(zoomed.k >= .5 && zoomed.k <= 6);
    const after = fun.worldPoint(zoomed, point.x, point.y);
    assert.ok(Math.abs(before.x - after.x) < 1e-10 && Math.abs(before.y - after.y) < 1e-10);
  }
});

test('orbit focus fits its bubbles on desktop and mobile, including empty and single groups', () => {
  for (const width of [270, 736]) {
    const points = [{ x: 50, y: 40, radius: 28 }, { x: 120, y: 100, radius: 10 }];
    const view = fun.fitView(points, width, 400);
    for (const p of points) {
      assert.ok((p.x - p.radius) * view.k + view.x >= 0);
      assert.ok((p.x + p.radius) * view.k + view.x <= width);
      assert.ok((p.y - p.radius) * view.k + view.y >= 0);
      assert.ok((p.y + p.radius) * view.k + view.y <= 400);
    }
    assert.deepEqual(fun.fitView([], width, 400), { x: 0, y: 0, k: 1 });
    assert.ok(Number.isFinite(fun.fitView([points[0]], width, 400).k));
  }
});


test('crowded bubbles spread apart without changing data or distance sizes', () => {
  const input = Array.from({ length: 8 }, (_, i) => ({ run: { id: String(i) }, x: 100, y: 100, radius: 10 + i }));
  const before = JSON.stringify(input), points = fun.spreadPoints(input, 300, 300);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(points.map(p => p.radius), input.map(p => p.radius));
  assert.deepEqual(fun.spreadPoints(input, 300, 300), points);
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    assert.ok(a.x >= a.radius && a.x + a.radius <= 300 && a.y >= a.radius && a.y + a.radius <= 300);
    for (const b of points.slice(i + 1)) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= (a.radius + b.radius) * .9);
  }
});

// Small DOM fixture exercises the real mount handlers without browser dependencies.
function mountFixture(reducedMotion = false) {
  const frames = new Map(); let nextFrame = 0;
  const doc = { defaultView: {
    matchMedia: () => ({ matches: reducedMotion }),
    requestAnimationFrame: fn => { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id),
  } };
  function element(tag) {
    const attributes = new Map(), capture = new Set();
    return { tag, ownerDocument: doc, children: [], clientWidth: 800, clientHeight: 400,
      namespaceURI: 'http://www.w3.org/2000/svg', classList: { add() {}, remove() {} }, listeners: {},
      append(child) { this.children.push(child); }, replaceChildren() { this.children = []; },
      setAttribute(key, value) { attributes.set(key, String(value)); }, getAttribute(key) { return attributes.get(key) ?? null; },
      focus() {}, addEventListener(name, fn) { this.listeners[name] = fn; },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 400 }),
      setPointerCapture(id) { capture.add(id); }, hasPointerCapture(id) { return capture.has(id); },
      releasePointerCapture(id) { capture.delete(id); this.onlostpointercapture?.({ pointerId: id }); },
    };
  }
  doc.createElement = element; doc.createElementNS = (_, tag) => element(tag);
  const root = element('div');
  const runs = model([activity(1, '2026-10-01', { total_elevation_gain: 0, moving_time: 1600 }), activity(2, '2026-10-02', { total_elevation_gain: 800, moving_time: 1600 })]);
  const dispose = fun.mount(root, runs);
  const all = (node = root) => [node, ...node.children.flatMap(all)];
  const button = name => all().find(el => el.tag === 'button' && (el.textContent === name || el.getAttribute('aria-label') === name));
  const svg = all().find(el => el.tag === 'svg');
  const scene = () => all().find(el => el.getAttribute('class') === 'ru-scene');
  const star = id => all().find(el => el.getAttribute('data-run-id') === id);
  const position = id => star(id).getAttribute('transform').match(/[-\d.]+/g).map(Number);
  const event = (x, y, id = 1) => ({ clientX: x, clientY: y, pointerId: id, button: 0, preventDefault() {} });
  const flush = () => { for (const now of [0, 500]) { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now)); } };
  return { all, button, svg, scene, position, event, flush, frames, dispose };
}

test('mounted graph drags bubbles and attached lines, preserves pins, and resets them', () => {
  const ui = mountFixture();
  const [x, y] = ui.position('2');
  ui.svg.onpointerdown(ui.event(x, y)); ui.svg.onpointermove(ui.event(x + 90, y + 30)); ui.svg.onpointerup(ui.event(x + 90, y + 30));
  assert.deepEqual(ui.position('2'), [x + 90, y + 30]);
  assert.ok(ui.all().some(el => el.tag === 'line' && (Number(el.getAttribute('x1')) === x + 90 || Number(el.getAttribute('x2')) === x + 90)));
  ui.button('Vert').onclick(); ui.flush(); ui.button('Themes').onclick(); ui.flush();
  assert.deepEqual(ui.position('2'), [x + 90, y + 30]);
  ui.button('Reset map').onclick(); ui.flush();
  assert.deepEqual(ui.position('2'), [x, y]);
  ui.dispose();
});

test('mounted graph supports pan, pinch, wheel, cancellation and zoom-aware dragging', () => {
  const ui = mountFixture();
  ui.svg.onpointerdown(ui.event(10, 10)); ui.svg.onpointermove(ui.event(50, 30)); ui.svg.onpointerup(ui.event(50, 30));
  assert.equal(ui.scene().getAttribute('transform'), 'translate(40 20) scale(1)');
  ui.button('Reset map').onclick(); ui.flush();
  ui.svg.onpointerdown(ui.event(10, 10, 1)); ui.svg.onpointerdown(ui.event(110, 10, 2));
  ui.svg.onpointermove(ui.event(210, 10, 2));
  assert.ok(ui.scene().getAttribute('transform').endsWith('scale(2)'));
  ui.svg.onpointercancel(ui.event(10, 10, 1)); ui.svg.onpointercancel(ui.event(210, 10, 2));
  ui.button('Reset map').onclick(); ui.flush();
  ui.svg.listeners.wheel({ ...ui.event(0, 0), deltaY: -Math.log(2) / .008 });
  assert.equal(ui.scene().getAttribute('transform'), 'translate(0 0) scale(2)');
  const [x, y] = ui.position('2');
  ui.svg.onpointerdown(ui.event(x * 2, y * 2)); ui.svg.onpointermove(ui.event(x * 2 + 80, y * 2 + 20)); ui.svg.onpointerup(ui.event(x * 2 + 80, y * 2 + 20));
  assert.deepEqual(ui.position('2'), [x + 40, y + 10]);
  ui.dispose();
});

test('view transitions respect reduced motion and cancel pending frames on disposal', () => {
  const ui = mountFixture(); ui.button('Vert').onclick();
  assert.equal(ui.frames.size, 1); ui.dispose(); assert.equal(ui.frames.size, 0);
  const reduced = mountFixture(true); reduced.button('Vert').onclick();
  assert.equal(reduced.frames.size, 0); reduced.dispose();
});

test('double-clicking a group label focuses its orbit after pointer capture retargets the event', () => {
  const ui = mountFixture(); ui.button('Vert').onclick(); ui.flush();
  ui.svg.onpointerdown({ ...ui.event(5, 5), target: { closest: () => ({ getAttribute: () => '0' }) } });
  ui.svg.onpointerup(ui.event(5, 5));
  ui.svg.ondblclick({ ...ui.event(5, 5), target: ui.svg });
  assert.ok(ui.scene().getAttribute('transform').endsWith('scale(6)'));
  ui.dispose();
});


test('large streak samples always include the five longest runs and selected run', () => {
  const result = model(Array.from({ length: 1000 }, (_, i) => activity(i + 1, '2026-10-01', { distance: i < 5 ? 160934.4 + i : 5000 })));
  const selected = '999', sample = fun.mapRuns(result.runs, selected);
  assert.equal(sample.length, 160);
  assert.equal(new Set(sample.map(r => r.id)).size, 160);
  for (const id of ['1', '2', '3', '4', '5', selected]) assert.ok(sample.some(r => r.id === id));
  assert.deepEqual(fun.mapRuns([...result.runs].reverse(), selected), sample);
  assert.equal(fun.longestRun(result.runs).id, '5');
  assert.equal(fun.mapRuns(result.runs, selected, 1)[0].id, selected);
});

test('100-mile runs are visibly larger without inflating ordinary runs or changing area ratios', () => {
  const result = model([activity(1, '2026-10-01', { distance: 8046.72 }), activity(2, '2026-10-02', { distance: 160934.4 })]);
  for (const width of [270, 800]) {
    const [short, ultra] = fun.layout(result.runs, width, 490, result.maxKm).points;
    assert.ok(ultra.radius >= 35);
    assert.ok(Math.abs(ultra.radius ** 2 / short.radius ** 2 - 20) < 1e-10);
    assert.ok(ultra.radius / short.radius > 4.4);
  }
  assert.ok(fun.layout([result.runs[0]], 800, 490).points[0].radius < 12);
  assert.equal(fun.milesLabel(160.9344), '100 mi');
  assert.equal(fun.longestRun(model([activity(3, '2026-10-01', { distance: null }), activity(4, '2026-10-01', { distance: 0 })]).runs), undefined);
});

test('visible connections show at most four links, all attached to the selection', () => {
  const result = model(Array.from({ length: 40 }, (_, i) => activity(i + 1, '2026-10-01', { total_elevation_gain: i % 2 ? 0 : 900, moving_time: 1600 })));
  const edges = fun.connections(result.runs, result, 'gain', fun.groupsFor(result, 'gain'));
  for (const run of result.runs) {
    const visible = fun.visibleConnections(edges, result.runs, run.id);
    assert.ok(visible.length > 0 && visible.length <= 4);
    assert.ok(visible.every(e => e.a === run.id || e.b === run.id));
  }
  assert.deepEqual(fun.visibleConnections(edges, result.runs, ''), []);
});

test('connection toggle hides every edge without changing bubble sizes', () => {
  const ui = mountFixture();
  const radii = () => ui.all().filter(el => el.tag === 'circle').map(el => el.getAttribute('r'));
  const sizes = radii();
  assert.ok(ui.all().some(el => el.tag === 'line'));
  ui.button('Connections').onclick();
  assert.equal(ui.all().filter(el => el.tag === 'line').length, 0);
  assert.equal(ui.button('Connections').getAttribute('aria-pressed'), 'false');
  assert.deepEqual(radii(), sizes);
  ui.button('Connections').onclick();
  assert.ok(ui.all().some(el => el.tag === 'line'));
  ui.dispose();
});

test('find-longest control exits filters, selects the longest run, and focuses it', () => {
  const ui = mountFixture();
  ui.button('Vert').onclick(); ui.flush(); ui.button('Mountain moons').onclick();
  ui.button('Find longest run').onclick();
  const chooser = ui.all().find(el => el.tag === 'select');
  assert.equal(chooser.value, '1');
  assert.equal(ui.button('All runs').getAttribute('aria-pressed'), 'true');
  assert.ok(ui.all().some(el => el.textContent === 'LONGEST'));
  assert.notEqual(ui.scene().getAttribute('transform'), 'translate(0 0) scale(1)');
  ui.dispose();
});
