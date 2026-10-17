/* Optional, local-only exploration of the already-fetched latest streak. */
(function () {
  'use strict';
  const DAY = 86400000;
  const THEMES = [
    { name: 'Dawn patrol', rule: 'Starts before 07:00', color: '#ffc38b' },
    { name: 'Tiny escapes', rule: '5 km or less', color: '#c7a1ff' },
    { name: 'Dirt worship', rule: 'Recorded as a trail run', color: '#76e5c4' },
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
      const hour = Number(local[2]), tags = [];
      if (hour < 7) tags.push(0);
      if (km !== null && km <= 5) tags.push(1);
      if (activity.sport_type === 'TrailRun') tags.push(2);
      if (km !== null && km >= 20) tags.push(3);
      if (hour >= 20 || hour < 5) tags.push(4);
      if (!tags.length) tags.push(5);
      unique.set(id, {
        id, name: String(activity.name || 'Untitled run'), km, duration, hour,
        date: local[1], time: `${local[2]}:${local[3]}`, start,
        day: Math.max(1, Math.floor((stamp(local[1]) - first) / DAY) + 1),
        endDay: Math.min(Math.floor((last - first) / DAY) + 1, Math.floor((end - first) / DAY) + 1),
        tags, virtual: activity.sport_type === 'VirtualRun',
      });
    }
    return { runs: [...unique.values()].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)), days: Math.floor((last - first) / DAY) + 1 };
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

  function layout(runs, width, height) {
    const compact = width < 500;
    const centers = compact ? [[.25,.14],[.75,.14],[.25,.49],[.75,.49],[.25,.83],[.75,.83]] : [[.19,.21],[.5,.16],[.81,.21],[.19,.74],[.5,.8],[.81,.74]];
    const points = runs.map(run => {
      const center = run.tags.reduce((s, tag) => [s[0] + centers[tag][0] / run.tags.length, s[1] + centers[tag][1] / run.tags.length], [0, 0]);
      const seed = hash(run.id), angle = (seed % 6283) / 1000;
      const spread = Math.min(width * .1, 45);
      // Fixed logarithmic scales place similar distances/durations nearby within
      // a theme without letting a new ultra rescale every previous run.
      const distanceOffset = Math.max(-1, Math.min(1, Math.log1p(run.km || 0) / Math.log(11) - 1));
      const durationOffset = Math.max(-1, Math.min(1, Math.log1p(run.duration / 60) / Math.log(61) - 1));
      return { run, x: Math.max(20, Math.min(width - 20, center[0] * width + distanceOffset * spread + Math.cos(angle) * 15)), y: Math.max(22, Math.min(height - 22, center[1] * height + durationOffset * spread + Math.sin(angle) * 20)), radius: 4 + Math.min(8, Math.sqrt(run.km || 0) * .8) };
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
    let day = model.days, theme = -1, selectedId = model.runs[model.runs.length - 1].id;
    const workspace = make('div', 'ru-workspace');
    const stage = make('section', 'ru-stage', undefined, workspace);
    const panel = make('aside', 'ru-panel', undefined, workspace);
    const themes = make('div', 'ru-themes', undefined, stage); themes.setAttribute('aria-label', 'Explore running themes');
    const buttons = [{ name: 'All runs', rule: 'Explore the whole streak' }, ...THEMES].map((t, i) => {
      const b = make('button', '', t.name, themes); b.type = 'button'; b.title = t.rule;
      b.onclick = () => { theme = i - 1; render(); }; return b;
    });
    const map = make('div', 'ru-map', undefined, stage);
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Running theme map. Select any run using the chooser below.'); map.append(svg);
    const count = make('p', 'ru-key', undefined, stage);
    make('p', 'ru-key', 'Glowing stars are your runs; faint specks are decorative. Connections follow shared themes, not geography. Star size suggests distance, capped.', stage);
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
      if (!run) { make('p', '', 'No runs in this theme yet. Try a later day or another theme.', detail); return; }
      const link = make('a', '', run.name, detail);
      link.href = `https://www.strava.com/activities/${run.id}`; link.target = '_blank'; link.rel = 'noopener noreferrer';
      make('p', '', `${run.date} · ${run.time} · ${kmLabel(run.km)}${run.virtual ? ' · Virtual run' : ''}`, detail);
      make('p', '', run.tags.map(t => THEMES[t].name).join(' + '), detail);
      if (run.endDay > run.day) make('p', '', `One recording covering streak days ${run.day}–${run.endDay}; shown once.`, detail);
    }
    function draw() {
      if (disposed) return;
      const width = map.clientWidth, height = map.clientHeight;
      if (!width) return;
      shown = mapRuns(current.runs, selectedId);
      const { centers, points } = layout(shown, width, height);
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.replaceChildren();
      const mark = (tag, attrs, text) => {
        const el = doc.createElementNS(svg.namespaceURI, tag);
        Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value)));
        if (text) el.textContent = text; svg.append(el); return el;
      };
      mark('title', {}, `Theme map: ${current.runs.length} runs through streak day ${day}`);
      // Deterministic decorative stars: no animation, storage, or network work.
      for (let i = 0; i < 100; i++) {
        const seed = hash(`sky-${i}`);
        mark('circle', { cx: (seed % 1000) / 1000 * width, cy: ((seed >>> 10) % 1000) / 1000 * height, r: i % 9 === 0 ? 1 : .5, fill: '#aabbd9', opacity: .18 + (i % 4) * .07, 'aria-hidden': true, 'pointer-events': 'none' });
      }
      for (let t = 0; t < THEMES.length; t++) {
        const group = points.filter(p => p.run.tags.includes(t));
        for (let i = 1; i < group.length; i++) {
          const a = group[i - 1], b = group[i];
          mark('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: THEMES[t].color, 'stroke-width': 1, opacity: theme === t ? .65 : theme === -1 ? .24 : .08 });
        }
      }
      for (const p of points) {
        const active = theme === -1 || p.run.tags.includes(theme);
        const color = THEMES[p.run.tags[0]].color;
        if (active) mark('circle', { cx: p.x, cy: p.y, r: p.radius * 2.2, fill: color, opacity: .07, 'pointer-events': 'none' });
        const node = mark('circle', { cx: p.x, cy: p.y, r: p.radius, fill: color, opacity: active ? .9 : .14 });
        if (active) mark('circle', { cx: p.x, cy: p.y, r: Math.max(1.5, p.radius * .25), fill: '#ffffff', opacity: .9, 'pointer-events': 'none' });
        const title = doc.createElementNS(svg.namespaceURI, 'title'); title.textContent = `${p.run.name} · ${kmLabel(p.run.km)}`; node.append(title);
        if (p.run.id === selectedId) mark('circle', { cx: p.x, cy: p.y, r: p.radius + 5, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 });
      }
      centers.forEach((c, i) => {
        if (!current.runs.some(r => r.tags.includes(i))) return;
        mark('text', { x: c[0] * width, y: Math.min(height - 10, c[1] * height + 65), 'text-anchor': 'middle', class: 'ru-map-label', opacity: theme === -1 || theme === i ? 1 : .3 }, THEMES[i].name);
      });
      count.textContent = `${shown.length === current.runs.length ? `${shown.length} runs` : `${shown.length} of ${current.runs.length} dots; every run is in the chooser`} · Ring = selected run`;
    }
    function render() {
      current = snapshot(model, day, theme);
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
        ? `${current.runs.length} distinct runs across ${day} streak days. Themes overlap: one run can belong to several.`
        : `${THEMES[theme].name}: ${current.members.length} of ${current.runs.length} runs. ${THEMES[theme].rule}.${current.crossovers.length ? ' Crossovers: ' + current.crossovers.map(c => `${c.count} also in ${c.name}`).join(' · ') + '.' : ''}`;
      draw(); describe();
    }
    // Pointer selection uses nearest marks; the native chooser provides the same
    // information for keyboard users and for runs outside the bounded map sample.
    svg.onclick = e => {
      const rect = svg.getBoundingClientRect();
      const { points } = layout(shown, rect.width, rect.height);
      const nearest = points.filter(p => theme === -1 || p.run.tags.includes(theme)).map(p => ({ ...p, d: Math.hypot(p.x - (e.clientX - rect.left), p.y - (e.clientY - rect.top)) })).sort((a, b) => a.d - b.d)[0];
      if (nearest && nearest.d < 24) { selectedId = nearest.run.id; chooser.value = selectedId; draw(); describe(); }
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(draw) : null;
    render(); observer?.observe(map);
    return () => { disposed = true; observer?.disconnect(); };
  }
  const api = { THEMES, buildModel, snapshot, mapRuns, layout, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.StreakFunMode = api;
})();
