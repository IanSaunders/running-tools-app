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

  // Stable, bounded sampling keeps large streaks responsive; counts and chooser
  // always use every run. Include the inspected run even when it is outside it.
  function mapRuns(runs, selectedId, limit = 160) {
    if (runs.length <= limit) return runs;
    const selected = runs.find(r => r.id === selectedId) || runs[runs.length - 1];
    const chosen = [...runs].filter(r => r !== selected).sort((a, b) => hash(a.id) - hash(b.id) || a.id.localeCompare(b.id)).slice(0, limit - 1);
    return [...chosen, selected].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
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
    const maxRadius = Math.min(28, width * .075);
    const points = runs.map(run => {
      const memberships = groups.map((g, i) => g.matches(run) ? i : -1).filter(i => i >= 0);
      const center = memberships.reduce((s, tag) => [s[0] + centers[tag][0] / memberships.length, s[1] + centers[tag][1] / memberships.length], [0, 0]);
      const seed = hash(run.id), angle = (seed % 6283) / 1000;
      const spread = Math.min(width * .1, 45);
      const distanceOffset = Math.max(-1, Math.min(1, Math.log1p(run.km || 0) / Math.log(11) - 1));
      const durationOffset = Math.max(-1, Math.min(1, Math.log1p(run.duration / 60) / Math.log(61) - 1));
      // No minimum or per-run cap: area remains directly proportional to km.
      // A hollow diamond represents zero/missing distance, outside this scale.
      const radius = run.km > 0 && maxKm > 0 ? maxRadius * Math.sqrt(run.km / maxKm) : 0;
      const margin = maxRadius + 7;
      return { run, memberships, x: Math.max(margin, Math.min(width - margin, center[0] * width + distanceOffset * spread + Math.cos(angle) * 25)), y: Math.max(margin, Math.min(height - margin, center[1] * height + durationOffset * spread + Math.sin(angle) * 32)), radius };
    });
    return { centers, points };
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
    let day = model.days, theme = -1, selectedId = model.runs[model.runs.length - 1].id;
    const workspace = make('div', 'ru-workspace');
    const stage = make('section', 'ru-stage', undefined, workspace);
    const panel = make('aside', 'ru-panel', undefined, workspace);
    const lenses = make('div', 'ru-lenses', undefined, stage); lenses.setAttribute('aria-label', 'Explore by metric');
    const lensButtons = Object.entries(LENSES).map(([key, value]) => {
      const b = make('button', '', value.name, lenses); b.type = 'button';
      b.onclick = () => { lens = key; groups = groupsFor(model, lens); theme = -1; buildButtons(); render(); }; return [key, b];
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
    const map = make('div', 'ru-map', undefined, stage);
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Running constellation. Select any run using the chooser below.'); map.append(svg);
    const count = make('p', 'ru-key', undefined, stage);
    make('p', 'ru-key', 'Glowing stars are your runs; faint specks are decorative. Lines connect runs in the same group. Bubble area = distance: 20 km is four times the area of 5 km. Hollow diamonds = zero / unavailable distance. Scale stays fixed while scrubbing.', stage);
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
    let current, shown, disposed = false;
    function describe() {
      detail.replaceChildren();
      const run = current.runs.find(r => r.id === selectedId);
      if (!run) { make('p', '', 'No runs in this orbit yet. Try a later day or another group.', detail); return; }
      const link = make('a', '', run.name, detail);
      link.href = `https://www.strava.com/activities/${run.id}`; link.target = '_blank'; link.rel = 'noopener noreferrer';
      make('p', '', `${run.date} · ${run.time} · ${kmLabel(run.km)}${run.virtual ? ' · Virtual run' : ''}`, detail);
      make('p', 'ru-run-themes', run.tags.map(t => THEMES[t].name).join(' + '), detail);
      const metrics = make('dl', 'ru-metrics', undefined, detail);
      for (const [label, value] of [
        ['Climbing', run.gain === null ? 'Unavailable' : `${Math.round(run.gain).toLocaleString()} m ↑`],
        ['Gain / km', run.gain === null || !(run.km > 0) ? 'Unavailable' : `${(run.gain / run.km).toFixed(1)} m/km`],
        ['Moving pace', paceLabel(run.pace)],
        ['Average HR', run.hr === null ? 'Unavailable' : `${Math.round(run.hr)} bpm`],
      ]) { const cell = make('div', '', undefined, metrics); make('dt', '', label, cell); make('dd', '', value, cell); }
      const place = model.places[run.place];
      make('p', 'ru-place', place ? `${place.name} · near ${regionLabel(place.coordinates)} (approximate start region)` : 'Uncharted · outdoor start location unavailable', detail);
      if (run.endDay > run.day) make('p', '', `One recording covering streak days ${run.day}–${run.endDay}; shown once.`, detail);
    }
    function draw() {
      if (disposed) return;
      const width = map.clientWidth, height = map.clientHeight;
      if (!width) return;
      shown = mapRuns(current.runs, selectedId);
      const { centers, points } = layout(shown, width, height, model.maxKm, groups);
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.replaceChildren();
      const mark = (tag, attrs, text) => {
        const el = doc.createElementNS(svg.namespaceURI, tag);
        Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value)));
        if (text) el.textContent = text; svg.append(el); return el;
      };
      mark('title', {}, `${LENSES[lens].name} map: ${current.runs.length} runs through streak day ${day}`);
      // Deterministic decorative stars: no animation, storage, or network work.
      for (let i = 0; i < 100; i++) {
        const seed = hash(`sky-${i}`);
        mark('circle', { cx: (seed % 1000) / 1000 * width, cy: ((seed >>> 10) % 1000) / 1000 * height, r: i % 9 === 0 ? 1 : .5, fill: '#aabbd9', opacity: .18 + (i % 4) * .07, 'aria-hidden': true, 'pointer-events': 'none' });
      }
      for (let t = 0; t < groups.length; t++) {
        const group = points.filter(p => p.memberships.includes(t));
        for (let i = 1; i < group.length; i++) {
          const a = group[i - 1], b = group[i];
          mark('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: groups[t].color, 'stroke-width': 1, opacity: theme === t ? .65 : theme === -1 ? .24 : .08 });
        }
      }
      for (const p of points) {
        const active = theme === -1 || p.memberships.includes(theme);
        const color = groups[p.memberships[0]].color;
        if (active) mark('circle', { cx: p.x, cy: p.y, r: p.radius * 2.2, fill: color, opacity: .07, 'pointer-events': 'none' });
        const node = p.radius > 0
          ? mark('circle', { cx: p.x, cy: p.y, r: p.radius, fill: color, opacity: active ? .85 : .14 })
          : mark('path', { d: `M ${p.x} ${p.y - 4} l 4 4 -4 4 -4 -4 Z`, fill: 'none', stroke: color, opacity: active ? .9 : .14 });
        if (active && p.radius > 0) mark('circle', { cx: p.x, cy: p.y, r: p.radius * .2, fill: '#ffffff', opacity: .9, 'pointer-events': 'none' });
        const title = doc.createElementNS(svg.namespaceURI, 'title'); title.textContent = `${p.run.name} · ${kmLabel(p.run.km)}`; node.append(title);
        if (p.run.id === selectedId) mark('circle', { cx: p.x, cy: p.y, r: p.radius + 5, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 });
      }
      centers.forEach((c, i) => {
        if (!current.runs.some(groups[i].matches)) return;
        mark('text', { x: c[0] * width, y: Math.min(height - 10, c[1] * height + 65), 'text-anchor': 'middle', class: 'ru-map-label', opacity: theme === -1 || theme === i ? 1 : .3 }, groups[i].name);
      });
      count.textContent = `${shown.length === current.runs.length ? `${shown.length} runs` : `${shown.length} of ${current.runs.length} dots; every run is in the chooser`} · Ring = selected run`;
    }
    function render() {
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
      draw(); describe();
    }
    // Pointer selection uses nearest marks; the native chooser provides the same
    // information for keyboard users and for runs outside the bounded map sample.
    svg.onclick = e => {
      const rect = svg.getBoundingClientRect();
      const { points } = layout(shown, rect.width, rect.height, model.maxKm, groups);
      const nearest = points.filter(p => theme === -1 || p.memberships.includes(theme)).map(p => ({ ...p, d: Math.hypot(p.x - (e.clientX - rect.left), p.y - (e.clientY - rect.top)) })).sort((a, b) => a.d - b.d)[0];
      if (nearest && nearest.d < Math.max(24, nearest.radius + 5)) { selectedId = nearest.run.id; chooser.value = selectedId; draw(); describe(); }
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(draw) : null;
    render(); observer?.observe(map);
    return () => { disposed = true; observer?.disconnect(); };
  }
  const api = { THEMES, LENSES, buildModel, snapshot, mapRuns, layout, groupsFor, paceLabel, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.StreakFunMode = api;
})();
