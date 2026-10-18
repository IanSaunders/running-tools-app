/* Optional, local-only exploration of the already-fetched latest streak. */
(function () {
  'use strict';
  const DAY = 86400000;
  const THEMES = [
    { name: 'Dawn patrol', rule: 'Starts before 07:00', color: '#ffc38b' },
    { name: 'Tiny escapes', rule: '5 km or less', color: '#c7a1ff' },
    { name: 'Gravity rebels', rule: 'At least 300 m of climbing', color: '#76e5c4' },
    { name: 'Longform', rule: '20 km or more', color: '#84bdff' },
    { name: 'After hours', rule: 'Starts from 20:00 to 04:59', color: '#f6a6d6' },
    { name: 'In the groove', rule: 'Runs outside the other themes', color: '#d1de9c' },
  ];
  const stamp = date => Date.parse(`${date}T00:00:00Z`);
  const finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  const kmLabel = n => n === null ? 'Distance unavailable' : `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
  function hash(text) {
    let h = 2166136261;
    for (const char of String(text)) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
    return h >>> 0;
  }

  function buildModel(activities, firstDate, lastDate) {
    const first = stamp(firstDate), last = stamp(lastDate);
    if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return { runs: [], days: 0 };
    const unique = new Map();
    for (const activity of activities || []) {
      if (!['Run', 'TrailRun', 'VirtualRun'].includes(activity.sport_type) && activity.type !== 'Run') continue;
      const id = String(activity.id);
      if (!/^\d+$/.test(id) || unique.has(id)) continue;
      // Strava local dates are wall-clock strings even when suffixed with Z.
      const local = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(activity.start_date_local || '');
      if (!local || Number(local[2]) > 23 || Number(local[3]) > 59 || Number(local[4]) > 59) continue;
      const start = Date.parse(`${local[1]}T${local[2]}:${local[3]}:${local[4]}Z`);
      if (!Number.isFinite(start) || new Date(start).toISOString().slice(0, 10) !== local[1]) continue;
      const duration = finite(activity.elapsed_time) ? activity.elapsed_time : 0;
      const end = start + duration * 1000;
      if (!Number.isFinite(end) || end < first || stamp(local[1]) > last) continue;
      const km = finite(activity.distance) ? activity.distance / 1000 : null;
      const movingPace = km > 0 && finite(activity.moving_time) && activity.moving_time > 0
        ? activity.moving_time / km : km > 0 && finite(activity.average_speed) && activity.average_speed > 0 ? 1000 / activity.average_speed : null;
      const hour = Number(local[2]), tags = [];
      if (hour < 7) tags.push(0);
      if (km !== null && km <= 5) tags.push(1);
      const gain = finite(activity.total_elevation_gain) ? activity.total_elevation_gain : null;
      if (gain !== null && gain >= 300) tags.push(2);
      if (km !== null && km >= 20) tags.push(3);
      if (hour >= 20 || hour < 5) tags.push(4);
      if (!tags.length) tags.push(5);
      unique.set(id, {
        id, name: String(activity.name || 'Untitled run'), km, duration, hour, gain,
        pace: positive(movingPace) ? movingPace : null,
        hr: activity.has_heartrate !== false && finite(activity.average_heartrate) && activity.average_heartrate > 0 ? activity.average_heartrate : null,
        coordinates: activity.sport_type !== 'VirtualRun' && activity.trainer !== true && validCoordinates(activity.start_latlng) ? [...activity.start_latlng] : null,
        date: local[1], time: `${local[2]}:${local[3]}`, start,
        day: Math.max(1, Math.floor((stamp(local[1]) - first) / DAY) + 1),
        endDay: Math.min(Math.floor((last - first) / DAY) + 1, Math.floor((end - first) / DAY) + 1),
        tags, virtual: activity.sport_type === 'VirtualRun',
      });
    }
    const runs = [...unique.values()].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    const places = assignPlaces(runs);
    return { runs, places, maxKm: runs.reduce((max, r) => Math.max(max, r.km || 0), 0), days: Math.floor((last - first) / DAY) + 1 };
  }

  function snapshot(model, day, theme) {
    const runs = model.runs.filter(r => r.day <= day);
    const members = runs.filter(r => r.tags.includes(theme));
    const crossovers = THEMES.map((t, i) => ({ name: t.name, count: i === theme ? 0 : members.filter(r => r.tags.includes(i)).length })).filter(t => t.count);
    return { runs, members, crossovers };
  }

  const distanceOrder = (a, b) => (b.km || 0) - (a.km || 0) || a.start - b.start || a.id.localeCompare(b.id);
  const longestRun = runs => [...runs].filter(r => r.km > 0).sort(distanceOrder)[0];
  const milesLabel = km => `${(km / 1.609344).toLocaleString(undefined, { maximumFractionDigits: 1 })} mi`;
  // Preserve distance outliers in the bounded sample, as well as the inspected
  // run. Fill the remaining slots deterministically; never change the scale.
  function mapRuns(runs, selectedId, limit = 160) {
    if (limit <= 0) return [];
    if (runs.length <= limit) return runs;
    const selected = runs.find(r => r.id === selectedId) || runs[runs.length - 1];
    const reserved = new Set([selected, ...[...runs].filter(r => r.km > 0).sort(distanceOrder).slice(0, 5)]);
    const chosen = [...reserved].slice(0, limit);
    const filler = [...runs].filter(r => !reserved.has(r)).sort((a, b) => hash(a.id) - hash(b.id) || a.id.localeCompare(b.id));
    return [...chosen, ...filler.slice(0, limit - chosen.length)].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  }

  const positive = n => finite(n) && n > 0;
  const paceLabel = value => {
    if (!positive(value)) return 'Unavailable';
    const seconds = Math.round(value);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} /km`;
  };
  const validCoordinates = value => Array.isArray(value) && value.length === 2 && value.every(n => typeof n === 'number' && Number.isFinite(n)) && Math.abs(value[0]) <= 90 && Math.abs(value[1]) <= 180;
  const regionLabel = c => `${Math.abs(c[0]).toFixed(1)}°${c[0] < 0 ? 'S' : 'N'}, ${Math.abs(c[1]).toFixed(1)}°${c[1] < 0 ? 'W' : 'E'}`;

  // Nearby starts share an anchor within 5 km. A 3D spatial hash avoids a
  // quadratic scan and handles the date line and poles without special cases.
  function assignPlaces(runs) {
    const places = [], cells = new Map();
    const chordLimit = 2 * 6371 * Math.sin(5 / (2 * 6371));
    for (const run of runs) {
      run.place = null;
      if (!run.coordinates) continue;
      const [lat, lon] = run.coordinates.map(n => n * Math.PI / 180);
      const xyz = [6371 * Math.cos(lat) * Math.cos(lon), 6371 * Math.cos(lat) * Math.sin(lon), 6371 * Math.sin(lat)];
      const cell = xyz.map(n => Math.floor(n / 5));
      let nearest = null, distance = chordLimit;
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
        for (const place of cells.get([cell[0] + x, cell[1] + y, cell[2] + z].join(',')) || []) {
          const d = Math.hypot(...xyz.map((v, i) => v - place.xyz[i]));
          if (d <= distance) { nearest = place; distance = d; }
        }
      }
      if (!nearest) {
        nearest = { id: places.length, name: `Launch site ${places.length + 1}`, coordinates: run.coordinates, xyz, count: 0 };
        places.push(nearest);
        const key = cell.join(',');
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(nearest);
      }
      run.place = nearest.id; nearest.count++;
    }
    return places;
  }

  const LENSES = {
    themes: { name: 'Themes', note: 'Overlapping constellations, discovered from your runs. No tags needed.' },
    gain: { name: 'Vert', note: 'Total climbing per run, in metres. Gain per kilometre is in the run details.' },
    pace: { name: 'Pace', note: 'Average moving pace, in min/km. Terrain and stops can make runs very different.' },
    hr: { name: 'Heart rate', note: 'Average recorded heart rate, in bpm. These are comparison bands, not training zones.' },
    places: { name: 'Places', note: 'Starts within 5 km of a launch site’s first run share an orbit. A constellation of places, not a geographic map.' },
  };
  function bands(names, rules, values, field) {
    return names.map((name, i) => ({ name, rule: rules[i], color: THEMES[i % THEMES.length].color,
      matches: r => r[field] === null ? i === names.length - 1 : i < names.length - 1 && r[field] >= (values[i - 1] || 0) && r[field] < (values[i] ?? Infinity) }));
  }
  function groupsFor(model, lens) {
    if (lens === 'themes') return THEMES.map((t, i) => ({ ...t, matches: r => r.tags.includes(i) }));
    if (lens === 'gain') return bands(['Low orbit', 'Rolling worlds', 'Hill country', 'Gravity rebels', 'Mountain moons', 'Unknown vert'], ['Under 50 m', '50 to under 150 m', '150 to under 300 m', '300 to under 600 m', '600 m or more', 'No elevation gain supplied'], [50, 150, 300, 600], 'gain');
    if (lens === 'pace') return bands(['Warp speed', 'Cruise control', 'Easy orbit', 'Scenic route', 'Time travellers', 'Unknown pace'], ['Under 5:00 /km', '5:00 to under 6:00 /km', '6:00 to under 7:00 /km', '7:00 to under 8:00 /km', '8:00 /km or more', 'No usable moving pace supplied'], [300, 360, 420, 480], 'pace');
    if (lens === 'hr') return bands(['Quiet signal', 'Steady pulse', 'Bright signal', 'Solar flare', 'Supernova', 'Unknown HR'], ['Under 120 bpm', '120 to under 140 bpm', '140 to under 160 bpm', '160 to under 180 bpm', '180 bpm or more', 'No heart rate supplied'], [120, 140, 160, 180], 'hr');
    const popular = [...model.places].sort((a, b) => b.count - a.count || a.id - b.id).slice(0, 5);
    const ids = new Set(popular.map(p => p.id));
    const groups = popular.map((p, i) => ({ name: p.name, rule: `Near ${regionLabel(p.coordinates)} (approximate)`, color: THEMES[i].color, matches: r => r.place === p.id }));
    if (model.places.length > 5) groups.push({ name: 'Farther orbits', rule: 'Other launch sites; exact site shown in run details', color: '#d1de9c', matches: r => r.place !== null && !ids.has(r.place) });
    groups.push({ name: 'Uncharted', rule: 'No outdoor start location supplied, or a virtual / indoor run', color: '#a8b3c9', matches: r => r.place === null });
    return groups;
  }

  function layout(runs, width, height, maxKm = runs.reduce((max, r) => Math.max(max, r.km || 0), 0), groups = groupsFor({}, 'themes')) {
    const columns = width < 500 ? 2 : 3, rows = Math.ceil(groups.length / columns);
    const centers = groups.map((_, i) => [(i % columns + .5) / columns, (Math.floor(i / columns) + .5) / rows]);
    const maxRadius = Math.min(50, width * .13);
    const points = runs.map(run => {
      const memberships = groups.map((g, i) => g.matches(run) ? i : -1).filter(i => i >= 0);
      const center = memberships.reduce((s, tag) => [s[0] + centers[tag][0] / memberships.length, s[1] + centers[tag][1] / memberships.length], [0, 0]);
      const seed = hash(run.id), angle = (seed % 6283) / 1000;
      const spread = Math.min(width * .1, 45);
      const distanceOffset = Math.max(-1, Math.min(1, Math.log1p(run.km || 0) / Math.log(11) - 1));
      const durationOffset = Math.max(-1, Math.min(1, Math.log1p(run.duration / 60) / Math.log(61) - 1));
      // No minimum or per-run cap: area remains directly proportional to km.
      // A hollow diamond represents zero/missing distance, outside this scale.
      const radius = run.km > 0 && maxKm > 0 ? Math.min(4, maxRadius / Math.sqrt(maxKm)) * Math.sqrt(run.km) : 0;
      const margin = maxRadius + 7;
      return { run, memberships, x: Math.max(margin, Math.min(width - margin, center[0] * width + distanceOffset * spread + Math.cos(angle) * 25)), y: Math.max(margin, Math.min(height - margin, center[1] * height + durationOffset * spread + Math.sin(angle) * 32)), radius };
    });
    return { centers, points };
  }

  // A bounded layout pass separates crowded bubbles before painting. It does
  // not run during gestures or keep a background physics simulation alive.
  function spreadPoints(input, width, height) {
    const points = input.map(p => ({ ...p }));
    for (let pass = 0; pass < 36; pass++) {
      for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
        const a = points[i], b = points[j], dx = b.x - a.x, dy = b.y - a.y;
        const distance = Math.hypot(dx, dy), needed = Math.max(a.radius, 4) + Math.max(b.radius, 4) + 4;
        if (distance >= needed) continue;
        const angle = (hash(`${a.run.id}:${b.run.id}`) % 6283) / 1000;
        const ux = distance ? dx / distance : Math.cos(angle), uy = distance ? dy / distance : Math.sin(angle);
        const push = (needed - distance) * .5;
        a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push;
      }
      points.forEach((p, i) => {
        p.x += (input[i].x - p.x) * .01; p.y += (input[i].y - p.y) * .01;
        const margin = Math.max(p.radius, 4) + 8;
        p.x = Math.max(margin, Math.min(width - margin, p.x)); p.y = Math.max(margin, Math.min(height - margin, p.y));
      });
    }
    return points;
  }

  // Connections use recorded similarities, never missing values. Bound each run
  // to two cross-group neighbours so dense streaks remain readable and responsive.
  function connections(runs, model, lens, groups) {
    const metrics = ['gain', 'pace', 'hr', 'places'].filter(key => key !== lens);
    const memberships = runs.map(run => groups.map((g, i) => g.matches(run) ? i : -1).filter(i => i >= 0));
    const metricGroups = metrics.map(key => groupsFor(model, key));
    const signatures = runs.map(run => metrics.map((key, i) => {
      if (key === 'places') return run.place;
      return run[key] === null ? null : metricGroups[i].findIndex(g => g.matches(run));
    }));
    const edges = new Map();
    const add = (a, b, bridge, reasons) => {
      const key = [runs[a].id, runs[b].id].sort().join(':');
      if (!edges.has(key)) edges.set(key, { a: runs[a].id, b: runs[b].id, bridge, reasons });
    };
    groups.forEach((g, index) => {
      const members = runs.map((_, i) => i).filter(i => memberships[i].includes(index));
      for (let i = 1; i < members.length; i++) add(members[i - 1], members[i], false, [g.name]);
    });
    runs.forEach((run, a) => {
      const candidates = [];
      runs.forEach((other, b) => {
        if (a === b || memberships[a].some(i => memberships[b].includes(i))) return;
        const reasons = metrics.flatMap((key, i) => {
          const value = signatures[a][i];
          if (value === null || value !== signatures[b][i]) return [];
          return [key === 'places' ? model.places[value].name : `${LENSES[key].name}: ${metricGroups[i][value].rule}`];
        });
        if (reasons.length) candidates.push({ b, reasons, time: Math.abs(run.start - other.start) });
      });
      candidates.sort((a, b) => b.reasons.length - a.reasons.length || a.time - b.time || runs[a.b].id.localeCompare(runs[b.b].id));
      candidates.slice(0, 2).forEach(c => add(a, c.b, true, c.reasons));
    });
    return [...edges.values()];
  }
  function visibleConnections(edges, runs, selectedId, limit = 4) {
    const byId = new Map(runs.map(r => [r.id, r]));
    const selected = byId.get(selectedId);
    if (!selected) return [];
    const neighbour = edge => byId.get(edge.a === selectedId ? edge.b : edge.a);
    return edges.filter(e => (e.a === selectedId || e.b === selectedId) && neighbour(e))
      .sort((a, b) => b.reasons.length - a.reasons.length
        || Math.abs(neighbour(a).start - selected.start) - Math.abs(neighbour(b).start - selected.start)
        || neighbour(a).id.localeCompare(neighbour(b).id)).slice(0, limit);
  }

  function zoomAt(view, factor, x, y) {
    const k = Math.max(.5, Math.min(6, view.k * factor));
    return { k, x: x - (x - view.x) * k / view.k, y: y - (y - view.y) * k / view.k };
  }
  function worldPoint(view, x, y) { return { x: (x - view.x) / view.k, y: (y - view.y) / view.k }; }
  function fitView(points, width, height) {
    if (!points.length) return { x: 0, y: 0, k: 1 };
    const left = Math.min(...points.map(p => p.x - Math.max(p.radius, 8)));
    const right = Math.max(...points.map(p => p.x + Math.max(p.radius, 8)));
    const top = Math.min(...points.map(p => p.y - Math.max(p.radius, 8)));
    const bottom = Math.max(...points.map(p => p.y + Math.max(p.radius, 8)));
    const k = Math.max(.5, Math.min(6, (width - 60) / Math.max(1, right - left), (height - 60) / Math.max(1, bottom - top)));
    return { k, x: width / 2 - (left + right) / 2 * k, y: height / 2 - (top + bottom) / 2 * k };
  }

  function mount(root, model) {
    const doc = root.ownerDocument;
    const make = (tag, cls, text, parent = root) => {
      const el = doc.createElement(tag);
      if (cls) el.className = cls;
      if (text !== undefined) el.textContent = text;
      parent.append(el); return el;
    };
    root.replaceChildren(); root.className = 'running-underground';
    const header = make('header', 'ru-header');
    make('p', 'ru-eyebrow', 'EVERY RUN LEAVES A STAR', header);
    make('h2', '', 'Your running universe.', header);
    make('p', 'ru-intro', 'Familiar orbits. Unexpected connections. A constellation that keeps growing.', header);
    if (!model.runs.length) { make('p', '', 'Your map starts with your first run.'); return () => {}; }
    let lens = 'themes', groups = groupsFor(model, lens);
    let showConnections = true;
    const longest = longestRun(model.runs);
    let day = model.days, theme = -1, selectedId = model.runs[model.runs.length - 1].id;
    const workspace = make('div', 'ru-workspace');
    const stage = make('section', 'ru-stage', undefined, workspace);
    const panel = make('aside', 'ru-panel', undefined, workspace);
    const lenses = make('div', 'ru-lenses', undefined, stage); lenses.setAttribute('aria-label', 'Explore by metric');
    const lensButtons = Object.entries(LENSES).map(([key, value]) => {
      const b = make('button', '', value.name, lenses); b.type = 'button';
      b.onclick = () => switchLens(key); return [key, b];
    });
    const lensNote = make('p', 'ru-lens-note', '', stage);
    const themes = make('div', 'ru-themes', undefined, stage); themes.setAttribute('aria-label', 'Explore running groups');
    let buttons;
    function buildButtons() {
      themes.replaceChildren();
      buttons = [{ name: 'All runs', rule: 'Explore the whole streak' }, ...groups].map((t, i) => {
        const b = make('button', '', t.name, themes); b.type = 'button'; b.title = t.rule;
        b.onclick = () => { theme = i - 1; render(); }; return b;
      });
    }
    buildButtons();
    const controls = make('div', 'ru-navigation', undefined, stage);
    const control = (label, action) => { const b = make('button', '', label, controls); b.type = 'button'; b.onclick = action; return b; };
    control('−', () => zoom(.8)).setAttribute('aria-label', 'Zoom out');
    const zoomValue = make('output', 'ru-zoom-value', '100%', controls); zoomValue.setAttribute('aria-label', 'Map zoom');
    control('+', () => zoom(1.25)).setAttribute('aria-label', 'Zoom in');
    control('Focus orbit', () => focusOrbit());
    control('Reset map', () => { pins.clear(); view = { x: 0, y: 0, k: 1 }; draw(true); });
    const connectionToggle = control('Connections', () => { showConnections = !showConnections; draw(); });
    connectionToggle.setAttribute('aria-pressed', 'true');
    const findLongest = control(longest ? `Find longest · ${milesLabel(longest.km)}` : 'Find longest run', () => {
      if (!longest) return;
      day = Math.max(day, longest.day); timeline.value = String(day); theme = -1; selectedId = longest.id;
      render(); view = fitView(points.filter(p => p.run.id === selectedId), map.clientWidth, map.clientHeight); applyView();
    });
    findLongest.setAttribute('aria-label', 'Find longest run'); findLongest.disabled = !longest;
    const map = make('div', 'ru-map', undefined, stage);
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('tabindex', '0'); svg.setAttribute('aria-describedby', 'ru-map-help'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Running constellation. Select any run using the chooser below.'); map.append(svg);
    const sizeGuide = make('details', 'ru-size-guide', undefined, stage);
    make('summary', '', 'How circle sizes compare', sizeGuide);
    make('p', 'ru-key', 'Filled circle area represents distance. A 100-mile run has 20 times the area of a 5-mile run (about 4.5 times the width). Relative sizes below; zoom changes their size on the map.', sizeGuide);
    const guide = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    guide.setAttribute('viewBox', '0 0 360 145'); guide.setAttribute('role', 'img'); guide.setAttribute('aria-label', 'Relative distance size guide'); sizeGuide.append(guide);
    const count = make('p', 'ru-key', undefined, stage);
    const help = make('p', 'ru-key', 'Drag a bubble to rearrange it. Drag space to pan. Scroll or pinch to zoom. Double-click an orbit to dive in. Keyboard: + / − to zoom, arrows to pan, 0 to reset. Touch: scroll the page outside the map.', stage); help.id = 'ru-map-help';
    make('p', 'ru-key', 'Only the selected run’s strongest connections are shown (up to four). Solid = same group; dashed = shared metrics or place. Toggle Connections to hide them. Filled circles are runs; faint specks are decorative. Bubble area = distance: 20 km is four times the area of 5 km. Hollow diamonds = zero / unavailable distance. Scale stays fixed while scrubbing.', stage);
    make('p', 'ru-eyebrow', 'MISSION CONTROL', panel);
    const summary = make('p', 'ru-summary', undefined, panel); summary.setAttribute('aria-live', 'polite');
    const timelineLabel = make('label', 'ru-label', 'Travel through your streak', panel); timelineLabel.htmlFor = 'ru-timeline';
    const timelineValue = make('span', '', '', timelineLabel);
    const timeline = make('input', 'ru-timeline', undefined, panel); timeline.id = 'ru-timeline'; timeline.type = 'range'; timeline.min = '1'; timeline.max = String(model.days); timeline.value = String(day); timeline.disabled = model.days === 1;
    timeline.oninput = () => { day = Number(timeline.value); render(); };
    const chooserLabel = make('label', 'ru-label', 'Explore a run', panel); chooserLabel.htmlFor = 'ru-chooser';
    const chooser = make('select', 'ru-chooser', undefined, panel); chooser.id = 'ru-chooser';
    chooser.onchange = () => { selectedId = chooser.value; draw(); describe(); };
    const detail = make('div', 'ru-run', undefined, panel); detail.setAttribute('aria-live', 'polite');
    let current, shown, disposed = false, view = { x: 0, y: 0, k: 1 }, scene, points = [], updatePositions = () => {};
    const win = doc.defaultView;
    const pins = new Map(), displayed = new Map(), pointers = new Map();
    let frame = null, gesture = null, lastOrbit = null, lastWidth = 0, lastHeight = 0;
    function stopAnimation() { if (frame !== null) win.cancelAnimationFrame(frame); frame = null; }
    function switchLens(key, group = -1) {
      lens = key; groups = groupsFor(model, lens); theme = group;
      view = { x: 0, y: 0, k: 1 }; buildButtons(); render(true);
      lensButtons.find(([id]) => id === key)[1].focus();
    }
    function applyView() {
      scene?.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
      zoomValue.textContent = `${Math.round(view.k * 100)}%`;
    }
    function zoom(factor, x = map.clientWidth / 2, y = map.clientHeight / 2) {
      view = zoomAt(view, factor, x, y); applyView();
    }
    function focusOrbit(index = theme) {
      stopAnimation();
      const selected = points.find(p => p.run.id === selectedId);
      const orbit = index === -1 ? selected?.memberships[0] : index;
      view = fitView(points.filter(p => p.memberships.includes(orbit)), map.clientWidth, map.clientHeight); applyView();
    }
    function describe() {
      detail.replaceChildren();
      const run = current.runs.find(r => r.id === selectedId);
      if (!run) { make('p', '', 'No runs in this orbit yet. Try a later day or another group.', detail); return; }
      const link = make('a', '', run.name, detail);
      link.href = `https://www.strava.com/activities/${run.id}`; link.target = '_blank'; link.rel = 'noopener noreferrer';
      make('p', '', `${run.date} · ${run.time} · ${kmLabel(run.km)}${run.km === null ? '' : ' / ' + milesLabel(run.km)}${run.virtual ? ' · Virtual run' : ''}`, detail);
      make('p', 'ru-run-themes', run.tags.map(t => THEMES[t].name).join(' + '), detail);
      const metrics = make('dl', 'ru-metrics', undefined, detail);
      for (const [label, value] of [
        ['Climbing', run.gain === null ? 'Unavailable' : `${Math.round(run.gain).toLocaleString()} m ↑`],
        ['Gain / km', run.gain === null || !(run.km > 0) ? 'Unavailable' : `${(run.gain / run.km).toFixed(1)} m/km`],
        ['Moving pace', paceLabel(run.pace)],
        ['Average HR', run.hr === null ? 'Unavailable' : `${Math.round(run.hr)} bpm`],
      ]) { const cell = make('div', '', undefined, metrics); make('dt', '', label, cell); make('dd', '', value, cell); }
      const routes = make('div', 'ru-related', undefined, detail);
      make('p', 'ru-eyebrow', 'FOLLOW THIS RUN', routes);
      for (const [key, value] of Object.entries(LENSES)) {
        if (key === lens) continue;
        const otherGroups = groupsFor(model, key);
        const index = otherGroups.findIndex(g => g.matches(run));
        if (index < 0) continue;
        const b = make('button', '', `${value.name} · ${otherGroups[index].name} ↗`, routes); b.type = 'button';
        b.onclick = () => switchLens(key, index);
      }
      const place = model.places[run.place];
      make('p', 'ru-place', place ? `${place.name} · near ${regionLabel(place.coordinates)} (approximate start region)` : 'Uncharted · outdoor start location unavailable', detail);
      if (run.endDay > run.day) make('p', '', `One recording covering streak days ${run.day}–${run.endDay}; shown once.`, detail);
    }
    function draw(animate = false) {
      if (disposed) return;
      stopAnimation();
      const width = map.clientWidth, height = map.clientHeight;
      if (!width || !height) return;
      if (width !== lastWidth || height !== lastHeight) { view = { x: 0, y: 0, k: 1 }; displayed.clear(); }
      lastWidth = width; lastHeight = height;
      shown = mapRuns(current.runs, selectedId);
      const result = layout(shown, width, height, model.maxKm, groups);
      points = spreadPoints(result.points, width, height);
      const targets = new Map();
      for (const p of points) {
        const pin = pins.get(`${lens}:${p.run.id}`);
        if (pin) { p.x = pin.x * width; p.y = pin.y * height; }
        targets.set(p.run.id, { x: p.x, y: p.y });
        if (animate && displayed.has(p.run.id)) Object.assign(p, displayed.get(p.run.id));
      }
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.replaceChildren();
      const mark = (tag, attrs, text, parent = svg) => {
        const el = doc.createElementNS(svg.namespaceURI, tag);
        Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value)));
        if (text) el.textContent = text; parent.append(el); return el;
      };
      mark('title', {}, `${LENSES[lens].name} map: ${current.runs.length} runs through streak day ${day}`);
      for (let i = 0; i < 100; i++) {
        const seed = hash(`sky-${i}`);
        mark('circle', { cx: (seed % 1000) / 1000 * width, cy: ((seed >>> 10) % 1000) / 1000 * height, r: i % 9 === 0 ? 1 : .5, fill: '#aabbd9', opacity: .18 + (i % 4) * .07, 'aria-hidden': true, 'pointer-events': 'none' });
      }
      scene = mark('g', { class: 'ru-scene' }); applyView();
      const byId = new Map(points.map(p => [p.run.id, p]));
      const edges = showConnections ? visibleConnections(connections(shown, model, lens, groups), shown, selectedId) : [];
      connectionToggle.setAttribute('aria-pressed', String(showConnections));
      const longestShown = longestRun(current.runs);
      guide.replaceChildren();
      if (model.maxKm > 0) {
        const distances = model.maxKm > 20 ? [5, 20, model.maxKm] : model.maxKm > 5 ? [1, 5, model.maxKm] : [model.maxKm / 4, model.maxKm];
        guide.setAttribute('aria-label', 'Relative circle areas for ' + distances.map(km => kmLabel(km) + ' / ' + milesLabel(km)).join(', '));
        distances.forEach((km, i) => {
          const x = (i + .5) * 360 / distances.length;
          mark('circle', { cx: x, cy: 52, r: 42 * Math.sqrt(km / model.maxKm), fill: '#c6b8ff', stroke: '#eee6ff', 'stroke-width': 1 }, undefined, guide);
          mark('text', { x, y: 116, 'text-anchor': 'middle', fill: '#eef3ff', 'font-size': 12 }, kmLabel(km), guide);
          mark('text', { x, y: 134, 'text-anchor': 'middle', fill: '#acbdd8', 'font-size': 11 }, milesLabel(km), guide);
        });
      }
      const lineElements = edges.map(edge => {
        const a = byId.get(edge.a), b = byId.get(edge.b);
        const line = mark('line', { stroke: edge.bridge ? '#c4dcff' : groups[a.memberships.find(i => b.memberships.includes(i))].color,
          'stroke-width': 1.5, 'stroke-dasharray': edge.bridge ? '5 5' : 'none',
          'vector-effect': 'non-scaling-stroke', opacity: .8,
          class: edge.bridge ? 'ru-bridge' : 'ru-connection' }, undefined, scene);
        mark('title', {}, edge.reasons.join(' · '), line);
        return { line, a, b };
      });
      const nodeLayer = mark('g', { class: 'ru-nodes' }, undefined, scene);
      const labelLayer = mark('g', { class: 'ru-orbit-labels' }, undefined, scene);
      const longestLayer = mark('g', { class: 'ru-longest' }, undefined, scene);
      // Draw the longest last so small bubbles cannot obscure its distance label.
      const nodeElements = [...points].sort((a, b) => Number(a.run.id === longestShown?.id) - Number(b.run.id === longestShown?.id)).map(p => {
        const active = theme === -1 || p.memberships.includes(theme), color = groups[p.memberships[0]].color;
        const node = mark('g', { class: 'ru-star', 'data-run-id': p.run.id }, undefined, p.run.id === longestShown?.id ? longestLayer : nodeLayer);
        // Transparent hit area is separate from the honest distance-sized bubble.
        mark('circle', { r: Math.max(p.radius, 10), fill: 'transparent' }, undefined, node);
        const isLongest = p.run.id === longestShown?.id;
        if (p.radius > 0) mark('circle', { r: p.radius, fill: color, stroke: isLongest ? '#fff4be' : color, 'stroke-width': isLongest ? 2 : 1, 'vector-effect': 'non-scaling-stroke', opacity: active ? .9 : .2 }, undefined, node);
        else mark('path', { d: 'M 0 -4 l 4 4 -4 4 -4 -4 Z', fill: 'none', stroke: color, opacity: active ? .9 : .14 }, undefined, node);
        if (isLongest && p.radius > 0) {
          const inside = p.radius >= 30;
          const attrs = { 'text-anchor': 'middle', 'pointer-events': 'none', fill: inside ? '#12182b' : '#fff4be', 'font-size': 11, 'font-weight': 600 };
          mark('text', { ...attrs, y: inside ? -9 : -p.radius - 32 }, 'LONGEST', node);
          mark('text', { ...attrs, y: inside ? 6 : -p.radius - 18, 'font-size': 12 }, kmLabel(p.run.km), node);
          mark('text', { ...attrs, y: inside ? 21 : -p.radius - 4 }, milesLabel(p.run.km), node);
        }
        mark('title', {}, `${p.run.name} · ${kmLabel(p.run.km)} · drag to move`, node);
        if (p.run.id === selectedId) mark('circle', { r: p.radius + 5, fill: 'none', stroke: '#fff', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }, undefined, node);
        return { node, p };
      });
      result.centers.forEach((c, i) => {
        if (!current.runs.some(groups[i].matches)) return;
        mark('text', { x: c[0] * width, y: Math.min(height - 10, c[1] * height + 65), 'text-anchor': 'middle', class: 'ru-map-label', 'data-orbit': i, opacity: theme === -1 || theme === i ? 1 : .3 }, groups[i].name, labelLayer);
      });
      updatePositions = () => {
        for (const { node, p } of nodeElements) {
          node.setAttribute('transform', `translate(${p.x} ${p.y})`);
          displayed.set(p.run.id, { x: p.x, y: p.y });
        }
        for (const { line, a, b } of lineElements) {
          line.setAttribute('x1', a.x); line.setAttribute('y1', a.y); line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
        }
      };
      const origins = new Map(points.map(p => [p.run.id, { x: p.x, y: p.y }]));
      if (animate && !win.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        let started;
        const tick = now => {
          if (disposed) return;
          started ??= now;
          const progress = Math.min(1, (now - started) / 450), eased = 1 - (1 - progress) ** 3;
          points.forEach(p => { const from = origins.get(p.run.id), to = targets.get(p.run.id); p.x = from.x + (to.x - from.x) * eased; p.y = from.y + (to.y - from.y) * eased; });
          updatePositions();
          frame = progress < 1 ? win.requestAnimationFrame(tick) : null;
        };
        frame = win.requestAnimationFrame(tick);
      } else { points.forEach(p => Object.assign(p, targets.get(p.run.id))); }
      updatePositions();
      count.textContent = `${shown.length === current.runs.length ? `${shown.length} runs` : `${shown.length} of ${current.runs.length} dots; every run is in the chooser`} · ${edges.length} connections for selected run${longestShown ? ' · Longest: ' + kmLabel(longestShown.km) + ' / ' + milesLabel(longestShown.km) : ''} · Ring = selected run`;
    }
    function render(animate = false) {
      current = snapshot(model, day, lens === 'themes' ? theme : -1);
      if (lens !== 'themes') current.members = theme === -1 ? current.runs : current.runs.filter(groups[theme].matches);
      lensButtons.forEach(([key, b]) => b.setAttribute('aria-pressed', String(key === lens)));
      lensNote.textContent = LENSES[lens].note;
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(i - 1 === theme)));
      timelineValue.textContent = `Day ${day} / ${model.days}`;
      timeline.setAttribute('aria-valuetext', `Day ${day} of ${model.days}`);
      const eligible = theme === -1 ? current.runs : current.members;
      if (!eligible.some(r => r.id === selectedId)) selectedId = eligible[eligible.length - 1]?.id || '';
      chooser.replaceChildren();
      for (const run of [...eligible].reverse()) {
        const option = make('option', '', `${run.date} · ${kmLabel(run.km)} · ${run.name}`, chooser); option.value = run.id;
      }
      chooser.disabled = !eligible.length; chooser.value = selectedId;
      summary.textContent = theme === -1
        ? `${current.runs.length} distinct runs across ${day} streak ${day === 1 ? 'day' : 'days'}. ${lens === 'themes' ? 'Themes overlap: one run can belong to several.' : lens === 'places' ? `${new Set(current.runs.filter(r => r.place !== null).map(r => r.place)).size} launch sites discovered. Uncharted runs stay visible.` : 'Pick an orbit to explore runs with similar readings.'}`
        : `${groups[theme].name}: ${current.members.length} of ${current.runs.length} runs. ${groups[theme].rule}.${current.crossovers.length ? ' Crossovers: ' + current.crossovers.map(c => `${c.count} also in ${c.name}`).join(' · ') + '.' : ''}`;
      draw(animate); describe();
    }
    const eventPoint = e => { const rect = svg.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; };
    const hit = point => {
      const world = worldPoint(view, point.x, point.y);
      return points.filter(p => theme === -1 || p.memberships.includes(theme))
        .map(p => ({ p, d: Math.hypot(p.x - world.x, p.y - world.y) }))
        .filter(({ p, d }) => d <= Math.max(p.radius, 12 / view.k))
        .sort((a, b) => a.d - b.d)[0]?.p;
    };
    function pinchState() {
      const [a, b] = [...pointers.values()];
      return { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
    }
    svg.onpointerdown = e => {
      if (e.button !== 0) return;
      e.preventDefault(); stopAnimation(); svg.focus({ preventScroll: true });
      lastOrbit = e.target?.closest?.('[data-orbit]')?.getAttribute('data-orbit') ?? null;
      const point = eventPoint(e); pointers.set(e.pointerId, point); svg.setPointerCapture(e.pointerId);
      if (pointers.size > 1) { gesture = { type: 'pinch', ...pinchState() }; return; }
      const found = hit(point);
      gesture = { type: found ? 'run' : 'pan', id: found?.run.id, last: point, moved: false };
      map.classList.add('ru-dragging');
    };
    svg.onpointermove = e => {
      if (!pointers.has(e.pointerId) || !gesture) return;
      const point = eventPoint(e); pointers.set(e.pointerId, point);
      if (pointers.size > 1) {
        const next = pinchState();
        view = zoomAt(view, next.distance / gesture.distance, gesture.center.x, gesture.center.y);
        view.x += next.center.x - gesture.center.x; view.y += next.center.y - gesture.center.y;
        gesture = { type: 'pinch', ...next }; applyView(); return;
      }
      const dx = point.x - gesture.last.x, dy = point.y - gesture.last.y;
      if (!gesture.moved && Math.hypot(dx, dy) < 3) return;
      gesture.moved = true; gesture.last = point;
      if (gesture.type === 'run') {
        const p = points.find(p => p.run.id === gesture.id);
        if (p) {
          p.x += dx / view.k; p.y += dy / view.k;
          pins.set(`${lens}:${p.run.id}`, { x: p.x / map.clientWidth, y: p.y / map.clientHeight }); updatePositions();
        }
      } else { view.x += dx; view.y += dy; applyView(); }
    };
    function endPointer(e, cancelled = false) {
      if (!pointers.has(e.pointerId)) return;
      const previous = gesture; pointers.delete(e.pointerId);
      if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
      if (pointers.size) { gesture = { type: 'pan', last: [...pointers.values()][0], moved: true }; return; }
      gesture = null; map.classList.remove('ru-dragging');
      if (!cancelled && previous?.type === 'run') {
        selectedId = previous.id; chooser.value = selectedId; draw(); describe();
      }
    }
    svg.onpointerup = e => endPointer(e);
    svg.onpointercancel = e => endPointer(e, true);
    svg.onlostpointercapture = e => endPointer(e, true);
    svg.addEventListener('wheel', e => { e.preventDefault(); const p = eventPoint(e); zoom(Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * .008), p.x, p.y); }, { passive: false });
    svg.ondblclick = e => {
      // Pointer capture retargets the double-click to the SVG; retain the label
      // observed at pointer-down so a label still focuses its own orbit.
      const orbit = e.target?.closest?.('[data-orbit]')?.getAttribute('data-orbit') ?? lastOrbit;
      const p = hit(eventPoint(e));
      if (orbit !== undefined && orbit !== null) focusOrbit(Number(orbit));
      else if (p) focusOrbit(p.memberships[0]);
      else { const at = eventPoint(e); zoom(1.8, at.x, at.y); }
    };
    svg.onkeydown = e => {
      if (['+', '=', '-', '0', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();
      if (e.key === '+' || e.key === '=') zoom(1.25);
      if (e.key === '-') zoom(.8);
      if (e.key === '0') { view = { x: 0, y: 0, k: 1 }; applyView(); }
      if (e.key === 'ArrowLeft') view.x += 40;
      if (e.key === 'ArrowRight') view.x -= 40;
      if (e.key === 'ArrowUp') view.y += 40;
      if (e.key === 'ArrowDown') view.y -= 40;
      applyView();
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
    render(); observer?.observe(map);
    return () => { disposed = true; stopAnimation(); pointers.clear(); observer?.disconnect(); };
  }
  const api = { THEMES, LENSES, buildModel, snapshot, mapRuns, longestRun, milesLabel, visibleConnections, layout, spreadPoints, groupsFor, paceLabel, connections, zoomAt, worldPoint, fitView, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.StreakFunMode = api;
})();
