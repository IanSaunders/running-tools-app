'use strict';
// ---------------------------------------------------------------------------
// Level definitions. Each entry is a factory returning a fresh level object
// so entity state resets on every (re)load.
// ---------------------------------------------------------------------------

// Level 1 — climb the golden terraces of Black Mountain at dawn.
function makeMountain() {
  const HGT = 1500, WID = 4600;
  const plats = [{ x: -60, y: 1420, w: 960, h: HGT - 1420 + 200 }];
  const ents = [];

  // terraced hillside: [width, rise to the NEXT terrace]
  const spec = [
    [300, 90], [260, 85], [220, 95], [300, 80], [240, 90], [220, 95],
    [280, 85], [240, 90], [220, 95], [300, 80], [240, 90], [260, 95], [420, 0],
  ];
  const tops = [];
  let cx = 900, cy = 1420;
  for (const [w, rise] of spec) {
    cy -= rise === 0 ? 95 : rise; // last entry: summit plateau
    plats.push({ x: cx, y: cy, w, h: HGT - cy });
    tops.push({ x: cx, y: cy, w });
    cx += w;
  }
  // recompute: entry rises apply before each terrace; summit uses 95 above.
  const T = tops;

  const snakeOn = (t) => ents.push({
    type: 'snake', x: t.x + 30, y: t.y - 16, w: 40, h: 16,
    x1: t.x + 16, x2: t.x + t.w - 56, dir: 1, speed: 45,
  });
  snakeOn(T[2]); snakeOn(T[5]); snakeOn(T[9]);

  const hazards = [];
  const oakOn = (t) => hazards.push({ type: 'oak', x: t.x + t.w / 2 - 35, y: t.y - 24, w: 70, h: 24 });
  oakOn(T[3]); oakOn(T[7]); oakOn(T[10]);

  const rsuOn = (t, fx = 0.5, dy = 70) => ents.push({
    type: 'rsu', x: t.x + t.w * fx - 11, y: t.y - dy, w: 22, h: 22, bob: Math.random() * 6,
  });
  ents.push({ type: 'rsu', x: 380, y: 1350, w: 22, h: 22, bob: 0 });
  ents.push({ type: 'rsu', x: 620, y: 1350, w: 22, h: 22, bob: 2 });
  rsuOn(T[0]); rsuOn(T[1], 0.7); rsuOn(T[2], 0.3, 110); rsuOn(T[4]); rsuOn(T[5], 0.75, 110);
  rsuOn(T[6]); rsuOn(T[8], 0.3); rsuOn(T[9], 0.6, 110); rsuOn(T[11]); rsuOn(T[12], 0.35);

  ents.push({ type: 'coffee', x: T[6].x + T[6].w - 60, y: T[6].y - 30, w: 20, h: 26 });
  ents.push({ type: 'boba', x: T[1].x + T[1].w / 2 - 9, y: T[1].y - 34, w: 18, h: 28 });
  ents.push({ type: 'money', x: T[8].x + 70, y: T[8].y - 30, w: 24, h: 26 });
  ents.push({ type: 'headphones', x: T[10].x + T[10].w - 80, y: T[10].y - 28, w: 26, h: 22 });
  ents.push({ type: 'checkpoint', x: T[4].x + 40, y: T[4].y - 60, w: 30, h: 60, hit: false });
  ents.push({ type: 'checkpoint', x: T[9].x + 40, y: T[9].y - 60, w: 30, h: 60, hit: false });

  const summit = T[12];
  ents.push({ type: 'goal', kind: 'flag', x: summit.x + summit.w - 160, y: summit.y - 96, w: 70, h: 96 });

  return {
    id: 'mountain', song: 'mountain',
    name: 'BLACK MOUNTAIN',
    subtitle: 'Ascend the golden hills before your 10 AM standup.',
    tip: 'Beware rattlesnakes and poison oak!',
    w: WID, h: HGT, killY: HGT + 100,
    skyTop: '#33346e', skyMid: '#8c5a9e', skyBot: '#ffb45e',
    dirt: '#a97b4e', turf: '#d9c26b',
    playerStart: { x: 90, y: 1374 },
    timeLimit: 90,
    plats, ents, hazards, spawners: [],
  };
}

// Level 2 — sprint through Shoreline Park, hop the creek inlets, dodge geese.
function makeShoreline() {
  const HGT = 800, WID = 4000;
  const GY = 660;
  const segs = [[0, 760], [880, 1560], [1720, 2360], [2500, 3160], [3340, 4000]];
  const plats = segs.map(([a, b]) => ({ x: a, y: GY, w: b - a, h: HGT - GY + 100 }));
  // docks across the wide inlets + a couple of picnic tables to hop on
  plats.push({ x: 1605, y: 690, w: 70, h: 18, deco: 'dock' });
  plats.push({ x: 3205, y: 690, w: 90, h: 18, deco: 'dock' });
  plats.push({ x: 1150, y: 560, w: 96, h: 16, deco: 'table' });
  plats.push({ x: 2700, y: 555, w: 96, h: 16, deco: 'table' });

  const ents = [];
  const goose = (x1, x2) => ents.push({
    type: 'goose', x: x1 + 20, y: GY - 30, w: 34, h: 30,
    x1, x2, dir: 1, speed: 55, mode: 'waddle', honkT: 0,
  });
  goose(950, 1250); goose(1290, 1520); goose(1800, 2120); goose(2560, 2820); goose(2860, 3120);

  ents.push({ type: 'scooter', x: 1740, y: GY - 58, w: 42, h: 58, x1: 1730, x2: 2310, dir: 1, speed: 270 });
  ents.push({ type: 'scooter', x: 3360, y: GY - 58, w: 42, h: 58, x1: 3350, x2: 3820, dir: 1, speed: 270 });

  const rsu = (x, y) => ents.push({ type: 'rsu', x, y, w: 22, h: 22, bob: Math.random() * 6 });
  rsu(300, GY - 70); rsu(520, GY - 70); rsu(800, GY - 140);   // over the creek — reward the leap
  rsu(1100, GY - 70); rsu(1190, 505); rsu(1400, GY - 70);
  rsu(1630, 610); rsu(1950, GY - 70); rsu(2420, GY - 150);
  rsu(2740, 500); rsu(3000, GY - 70); rsu(3240, 610); rsu(3600, GY - 70);

  ents.push({ type: 'coffee', x: 2600, y: GY - 30, w: 20, h: 26 });
  ents.push({ type: 'onewheel', x: 1180, y: 532, w: 28, h: 24 });
  ents.push({ type: 'burrito', x: 1950, y: GY - 30, w: 22, h: 16 });
  ents.push({ type: 'money', x: 2730, y: 525, w: 24, h: 26 });
  ents.push({ type: 'headphones', x: 3500, y: GY - 26, w: 26, h: 22 });
  ents.push({ type: 'checkpoint', x: 910, y: GY - 60, w: 30, h: 60, hit: false });
  ents.push({ type: 'checkpoint', x: 2520, y: GY - 60, w: 30, h: 60, hit: false });
  ents.push({ type: 'goal', kind: 'amp', x: 3870, y: GY - 110, w: 100, h: 110 });

  return {
    id: 'shoreline', song: 'shoreline',
    name: 'SHORELINE SPRINT',
    subtitle: 'Cross the wetlands to the Amphitheatre.',
    tip: 'The geese are NOT friendly. Stomp or sprint!',
    w: WID, h: HGT, killY: 745,
    skyTop: '#37b6f0', skyMid: '#7fd4f7', skyBot: '#cdf0fb',
    dirt: '#8a6642', turf: '#6abf5e',
    playerStart: { x: 80, y: GY - 46 },
    timeLimit: 75,
    plats, ents, hazards: [], spawners: [],
  };
}

// Level 3 — evening commute: dodge GBuses and robotaxis to reach Castro St.
function makeStreet() {
  const HGT = 700, WID = 4300;
  const GY = 580;
  const plats = [{ x: -60, y: GY, w: WID + 120, h: HGT - GY + 100 }];
  for (const x of [620, 1420, 2260, 3120]) {
    plats.push({ x, y: 480, w: 150, h: 12, deco: 'shelter' });
  }

  const ents = [];
  const rsu = (x, y) => ents.push({ type: 'rsu', x, y, w: 22, h: 22, bob: Math.random() * 6 });
  rsu(400, GY - 70); rsu(680, 420); rsu(1000, GY - 70); rsu(1480, 420);
  rsu(1800, GY - 140); rsu(2100, GY - 70); rsu(2320, 420); rsu(2650, GY - 70);
  rsu(2900, GY - 140); rsu(3180, 420); rsu(3500, GY - 70); rsu(3800, GY - 70);

  ents.push({ type: 'coffee', x: 2000, y: GY - 30, w: 20, h: 26 });
  ents.push({ type: 'boba', x: 820, y: GY - 34, w: 18, h: 28 });
  ents.push({ type: 'headphones', x: 2450, y: GY - 26, w: 26, h: 22 });
  ents.push({ type: 'burrito', x: 2620, y: GY - 24, w: 22, h: 16 });
  ents.push({ type: 'money', x: 3160, y: 448, w: 24, h: 26 });
  ents.push({ type: 'checkpoint', x: 1450, y: GY - 60, w: 30, h: 60, hit: false });
  ents.push({ type: 'checkpoint', x: 2920, y: GY - 60, w: 30, h: 60, hit: false });
  ents.push({ type: 'goal', kind: 'arch', x: 4090, y: GY - 130, w: 110, h: 130 });

  return {
    id: 'street', song: 'street',
    name: 'RUSH HOUR',
    subtitle: 'Dodge the GBus and the robotaxis.',
    tip: 'Hop over Waymos. Ride the bus roofs if you dare.',
    w: WID, h: HGT, killY: HGT + 100,
    skyTop: '#4a2a80', skyMid: '#c75587', skyBot: '#ff9e6d',
    dirt: '#3d4351', turf: '#565e70',
    playerStart: { x: 80, y: GY - 46 },
    timeLimit: 60,
    plats, ents, hazards: [],
    spawners: [
      { kind: 'bus',   interval: 3.4, speed: 330, t: 2.0 },
      { kind: 'waymo', interval: 5.0, speed: 235, t: 3.6 },
    ],
  };
}

// Level 4 — down into the dark. Gold, diamonds, bats, spiders, bottomless
// pits, and at the very back a dragon that hears absolutely everything.
// Your opposite number is in a cage behind it.
function makeCave() {
  const HGT = 900, GY = 660, CEIL = 118;
  const WID = 5200;
  const ZONE = 4020;              // past here the dragon can hear you
  const plats = [], ents = [], hazards = [], torches = [], groundSegs = [];

  // a solid ceiling — the only way out is forward
  plats.push({ x: -80, y: -80, w: WID + 200, h: CEIL + 80, deco: 'roof' });

  const ground = (x, w) => { plats.push({ x, y: GY, w, h: HGT - GY + 80 }); groundSegs.push([x, w]); };
  const ledge = (x, y, w) => plats.push({ x, y, w, h: 16, deco: 'shelf' });
  const torch = (x, y) => torches.push({ x, y: y ?? GY - 165, phase: Math.random() * 6 });
  const rsu = (x, y) => ents.push({ type: 'rsu', x, y, w: 22, h: 22, bob: Math.random() * 6 });
  const gold = (x, y, hoard) => ents.push({
    type: 'gold', x, y, w: 26, h: 20, bob: Math.random() * 6, hoard: !!hoard });
  const bat = (x, y) => ents.push({
    type: 'bat', x, y, w: 30, h: 20, baseX: x, baseY: y,
    phase: Math.random() * 6, mode: 'roost', t: 0, vx: 0, vy: 0 });
  const dropper = (x) => ents.push({
    type: 'spider', mode: 'drop', x, y: CEIL + 6, w: 26, h: 22,
    topY: CEIL + 6, dropY: GY - 44, state: 'hang', t: Math.random() * 1.5 });
  const crawler = (x1, x2) => ents.push({
    type: 'spider', mode: 'crawl', x: x1, y: GY - 20, w: 28, h: 20,
    x1, x2, dir: 1, speed: 76 });
  const check = (x) => ents.push({ type: 'checkpoint', x, y: GY - 60, w: 30, h: 60, hit: false });

  // ---- the descent: floor segments with bottomless pits between them.
  // Gaps sit around 125px against a ~188px running jump — enough margin that
  // a pit is never a frame-perfect input, since you are also jumping half
  // blind with bats on you.
  ground(-80, 1040);              // mouth of the cave
  ground(1085, 320);
  ground(1530, 295);
  ground(1950, 455);
  ground(2530, 380);
  ground(3035, 410);
  ground(3570, 1630);             // the long approach, then the chamber

  // ---- climbing shelves (every step is inside a single jump)
  ledge(600, 560, 130);  ledge(770, 465, 120);
  ledge(1180, 560, 140);
  ledge(1600, 560, 130); ledge(1770, 465, 120);
  ledge(2050, 555, 150); ledge(2250, 460, 130);
  ledge(2620, 560, 140); ledge(2810, 465, 130);
  ledge(3100, 560, 130); ledge(3280, 465, 140);
  ledge(3660, 560, 140); ledge(3830, 465, 130);

  // ---- torchlight, the only thing between you and total dark
  for (const tx of [180, 540, 880, 1220, 1660, 2080, 2340, 2680, 3160, 3520, 3780, 3980]) torch(tx);
  torch(4180, GY - 210); torch(4620, GY - 210); torch(4900, GY - 190);

  // ---- treasure: cyan diamonds on the route, gold up where it hurts
  for (const [x, y] of [[300, GY - 70], [430, GY - 70], [860, GY - 70], [1160, GY - 70],
                        [1300, GY - 130], [1620, GY - 70], [2020, GY - 70], [2180, GY - 70],
                        [2340, GY - 130], [2620, GY - 70], [2860, GY - 70], [3100, GY - 130],
                        [3380, GY - 70], [3700, GY - 70], [3880, GY - 70]]) rsu(x, y);
  for (const [x, y] of [[640, 520], [800, 425], [1220, 520], [1640, 520], [1810, 425],
                        [2100, 515], [2290, 420], [2660, 520], [2850, 425],
                        [3140, 520], [3320, 425], [3700, 520], [3870, 425]]) gold(x, y);

  // ---- the wildlife
  for (const [x, y] of [[700, 400], [1010, 350], [1260, 430], [1700, 380], [2150, 420],
                        [2610, 390], [2930, 350], [3210, 430], [3480, 380], [3760, 410]]) bat(x, y);
  for (const x of [1210, 1660, 2110, 2700, 3210, 3700]) dropper(x);
  crawler(1130, 1380); crawler(1990, 2390); crawler(2580, 2880); crawler(3620, 3900);

  // ---- supplies
  ents.push({ type: 'boba', x: 1240, y: GY - 34, w: 18, h: 28 });
  ents.push({ type: 'coffee', x: 2040, y: GY - 30, w: 20, h: 26 });
  ents.push({ type: 'burrito', x: 3120, y: 528, w: 22, h: 16 });
  ents.push({ type: 'headphones', x: 3900, y: GY - 26, w: 26, h: 22 });
  check(1140); check(2590); check(3630); check(3940);

  // ---- the dragon's chamber
  const dragon = { x: 4270, y: GY - 214, w: 430, h: 214 };
  // its hoard is scattered right across the only path (loud, and worth it)
  for (const [x, y] of [[4130, GY - 26], [4330, GY - 26], [4460, GY - 26],
                        [4600, GY - 26], [4720, GY - 26], [4830, GY - 26]]) gold(x, y, true);
  ents.push({ type: 'goal', kind: 'cage', x: 4960, y: GY - 128, w: 104, h: 128 });

  const r = rescueTarget();
  return {
    id: 'cave', song: 'cave', dark: true,
    name: "THE DRAGON'S HOARD",
    subtitle: `Rescue ${r.name} from the deep.`,
    tip: 'Near the dragon: hold SHIFT and tiptoe. Loud runners get eaten.',
    w: WID, h: HGT, killY: 820, ceilY: CEIL, groundY: GY,
    skyTop: '#0a0714', skyMid: '#140c22', skyBot: '#241432',
    dirt: '#2e2036', turf: '#3d2b46',
    playerStart: { x: 70, y: GY - 46 },
    timeLimit: 160,
    rescue: r,
    dragon, dragonZone: ZONE,
    groundSegs, torches,
    plats, ents, hazards, spawners: [],
  };
}

// Level 4 — Mavericks. You ride the face of a live sine-wave swell, and the
// only way past the sea stacks is to duck-dive under them and swim. Sharks
// want you, dolphins are on your side, and the ocean keeps changing its mind.
function makeSurf() {
  const HGT = 1250, WID = 5600;
  const SURFACE = 470, SEABED = 1120;
  const plats = [], ents = [], torches = [];

  // the seabed, and the shore you are trying to reach
  plats.push({ x: -80, y: SEABED, w: WID + 160, h: HGT - SEABED + 90, deco: 'seabed' });

  const stack = (x, w) => plats.push({ x, y: -260, w, h: 900, deco: 'stack' });
  const reef = (x, y, w, h) => plats.push({ x, y, w, h: h || 40, deco: 'reef' });
  const rsu = (x, y) => ents.push({ type: 'rsu', x, y, w: 22, h: 22, bob: Math.random() * 6 });
  const shark = (x1, x2, y, deep) => ents.push({
    type: 'shark', x: x1, y, w: 72, h: 30, x1, x2, dir: 1,
    speed: deep ? 96 : 118, deep: !!deep, lunge: 0, bob: Math.random() * 6 });
  const dolphin = (x, y) => ents.push({
    type: 'dolphin', x, y, w: 78, h: 34, baseY: y, arc: Math.random() * 6, squash: 0 });
  const jelly = (x, y, rise) => ents.push({
    type: 'jelly', x, y, w: 30, h: 40, baseY: y, rise: rise || 60, phase: Math.random() * 6 });
  const air = (x, y) => ents.push({ type: 'airbubble', x, y, w: 26, h: 26, phase: Math.random() * 6 });
  const kelp = (x, h) => ents.push({ type: 'kelp', x, y: SEABED - h, w: 34, h, phase: Math.random() * 6 });
  const chest = (x, y) => ents.push({ type: 'chest', x, y, w: 44, h: 34 });
  const check = (x) => ents.push({ type: 'checkpoint', x, y: SURFACE - 60, w: 30, h: 60, hit: false });

  // ---- Act 1: paddle out. Open water, learn the swell.
  for (const x of [260, 420, 640, 860, 1080, 1300]) rsu(x, SURFACE - 90);
  dolphin(520, SURFACE - 10);
  dolphin(980, SURFACE - 10);
  shark(700, 1150, SURFACE + 26);
  ents.push({ type: 'boba', x: 1180, y: SURFACE - 120, w: 18, h: 28 });
  check(1420);

  // ---- Act 2: the reef. Sea stacks block the surface — you go under.
  const gates = [1700, 2380, 3060];
  gates.forEach((gx, i) => {
    stack(gx, 130);
    // what is waiting for you down there
    shark(gx - 210, gx + 210, 700 + i * 60, true);
    air(gx - 90, 690 + i * 40);
    air(gx + 150, 640 + i * 40);
    reef(gx - 300, 880 + i * 30, 190, 46);
    reef(gx + 190, 830 + i * 40, 210, 46);
    for (const kx of [gx - 260, gx - 150, gx + 120, gx + 250]) kelp(kx, 190 + Math.random() * 150);
    for (let j = 0; j < 4; j++) rsu(gx - 120 + j * 90, 760 + i * 40 + (j % 2) * 70);
    jelly(gx + 60, 820 + i * 30, 90);
    jelly(gx - 40, 900 + i * 20, 70);
  });
  chest(2050, SEABED - 40);
  chest(2720, SEABED - 40);
  dolphin(2100, SURFACE - 10);
  dolphin(2760, SURFACE - 10);
  check(2080); check(2740);
  ents.push({ type: 'coffee', x: 2420, y: 960, w: 20, h: 26 });
  ents.push({ type: 'burrito', x: 3120, y: SEABED - 44, w: 22, h: 16 });

  // ---- Act 3: the inside break. Fast, shark-heavy, dolphins to launch off.
  for (const x of [3400, 3620, 3860, 4100, 4340, 4600, 4860]) rsu(x, SURFACE - 100);
  dolphin(3560, SURFACE - 10);
  dolphin(3980, SURFACE - 10);
  dolphin(4420, SURFACE - 10);
  dolphin(4880, SURFACE - 10);
  shark(3400, 3900, SURFACE + 26);
  shark(4000, 4500, SURFACE + 26);
  shark(4550, 5050, SURFACE + 26);
  shark(3700, 4300, 760, true);
  jelly(4200, SURFACE + 190, 110);
  ents.push({ type: 'headphones', x: 4260, y: SURFACE - 130, w: 26, h: 22 });
  ents.push({ type: 'money', x: 4700, y: SURFACE - 160, w: 24, h: 26 });
  check(4300);

  // ---- the pier
  plats.push({ x: 5180, y: SURFACE - 40, w: 420, h: 26, deco: 'pier' });
  ents.push({ type: 'goal', kind: 'pier', x: 5330, y: SURFACE - 150, w: 110, h: 110 });

  return {
    id: 'surf', song: 'surf', ocean: true,
    name: 'MAVERICKS',
    subtitle: 'Sharks, dolphins, and one very long hold-down.',
    tip: 'Hold DOWN to duck-dive. Bounce off dolphins. Watch your air.',
    w: WID, h: HGT, killY: HGT + 400,
    surfaceY: SURFACE, seabedY: SEABED,
    wave: { baseY: SURFACE, a1: 34, k1: 0.0042, s1: 1.5, a2: 15, k2: 0.011, s2: 2.2 },
    skyTop: '#1d6fd0', skyMid: '#4fb3ef', skyBot: '#a8e6ff',
    dirt: '#c8a86a', turf: '#e6cf94',
    playerStart: { x: 70, y: SURFACE - 60 },
    timeLimit: 150,
    plats, ents, hazards: [], spawners: [], torches,
  };
}

const LEVELS = [makeMountain, makeShoreline, makeStreet, makeSurf, makeCave];

// ---------------------------------------------------------------------------
// Random Remix — procedurally generated commutes. Endless; each completion
// loads a fresh one at depth+1 (more enemies, wider gaps, faster buses).
// ---------------------------------------------------------------------------
const REMIX_NAMES = [
  'EL CAMINO CHAOS', 'CALTRAIN SCRAMBLE', 'STEVENS CREEK TRAIL', 'WHISMAN WANDER',
  'REX MANOR RUMBLE', 'PERMANENTE PANIC', 'CUESTA PARK CAPER', 'DANA STREET DASH',
  'SAN ANTONIO SHUFFLE', 'MOFFETT FIELD MAYHEM',
];
const REMIX_TIPS = [
  'Procedurally generated. Blame the algorithm.',
  'No two commutes are alike.',
  'This level was vibe-coded.',
  'Freshly compiled, just for you.',
];

function makeRandom(depth = 1) {
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => Math.round(rnd(a, b));
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  const theme = pick(['mountain', 'shoreline', 'street']);
  const skins = {
    mountain: [
      { top: '#33346e', mid: '#8c5a9e', bot: '#ffb45e', dirt: '#a97b4e', turf: '#d9c26b' },
      { top: '#1e2a52', mid: '#4a6a9e', bot: '#c9e6f5', dirt: '#8a6a52', turf: '#7aa05a' },
    ],
    shoreline: [
      { top: '#37b6f0', mid: '#7fd4f7', bot: '#cdf0fb', dirt: '#8a6642', turf: '#6abf5e' },
      { top: '#ff9e6d', mid: '#f7c88a', bot: '#cdf0fb', dirt: '#9a7a4a', turf: '#8ac05a' },
    ],
    street: [
      { top: '#4a2a80', mid: '#c75587', bot: '#ff9e6d', dirt: '#3d4351', turf: '#565e70' },
      { top: '#141c38', mid: '#3a2a68', bot: '#8a4a8e', dirt: '#2d3341', turf: '#464e60' },
    ],
  };
  const skin = pick(skins[theme]);

  const HGT = 950, KILL = 880;
  const plats = [], ents = [], spawners = [];
  const targetW = 2600 + Math.min(depth, 8) * 350;
  const SPECIALS = ['coffee', 'boba', 'onewheel', 'headphones', 'burrito', 'money'];
  const rsu = (x, y) => ents.push({ type: 'rsu', x, y, w: 22, h: 22, bob: Math.random() * 6 });

  let x = 420, y = 620, lastCk = 0, lastSp = 0;
  plats.push({ x: -40, y, w: 460, h: HGT - y + 60 });

  const populate = (px, py, pw) => {
    if (px < 700 || pw < 180) return;
    const roll = Math.random();
    if (theme === 'mountain' && roll < 0.45) {
      ents.push({ type: 'snake', x: px + 30, y: py - 16, w: 40, h: 16, x1: px + 16, x2: px + pw - 56, dir: 1, speed: 45 + depth * 3 });
    } else if (theme === 'shoreline' && roll < 0.5) {
      ents.push({ type: 'goose', x: px + 30, y: py - 30, w: 34, h: 30, x1: px + 10, x2: px + pw - 44, dir: 1, speed: 55, mode: 'waddle', honkT: 0 });
    } else if (theme === 'shoreline' && roll < 0.68 && pw > 300) {
      ents.push({ type: 'scooter', x: px + 20, y: py - 58, w: 42, h: 58, x1: px + 10, x2: px + pw - 52, dir: 1, speed: 250 + depth * 5 });
    } else if (theme === 'street' && roll < 0.25) {
      ents.push({ type: 'goose', x: px + 30, y: py - 30, w: 34, h: 30, x1: px + 10, x2: px + pw - 44, dir: 1, speed: 55, mode: 'waddle', honkT: 0 });
    }
    if (Math.random() < 0.65) rsu(px + pw / 2 - 11, py - 70);
    if (px - lastSp > 900 && Math.random() < 0.7) {
      lastSp = px;
      ents.push({ type: pick(SPECIALS), x: px + pw / 2 + 40, y: py - 32, w: 24, h: 26 });
    }
    if (px - lastCk > 1100) {
      lastCk = px;
      ents.push({ type: 'checkpoint', x: px + 40, y: py - 60, w: 30, h: 60, hit: false });
    }
  };

  // street stays flat so the buses line up with the road
  const types = theme === 'street'
    ? ['flat', 'flat', 'gap', 'float']
    : ['flat', 'flat', 'gap', 'rise', 'drop', 'float'];

  while (x < targetW) {
    let t = pick(types);
    if (y < 340 && t === 'rise') t = 'drop';
    if (y > 640 && t === 'drop') t = 'rise';
    if (t === 'flat') {
      const w = ri(220, 420);
      plats.push({ x, y, w, h: HGT - y + 60 });
      populate(x, y, w);
      x += w;
    } else if (t === 'rise') {
      for (let s = 0, n = ri(1, 2); s < n; s++) {
        const w = ri(180, 260);
        y -= ri(60, 88);
        plats.push({ x, y, w, h: HGT - y + 60 });
        if (Math.random() < 0.5) rsu(x + w / 2 - 11, y - 60);
        x += w;
      }
    } else if (t === 'drop') {
      const w = ri(200, 340);
      y = Math.min(y + ri(60, 130), 700);
      plats.push({ x, y, w, h: HGT - y + 60 });
      populate(x, y, w);
      x += w;
    } else if (t === 'gap') {
      const gp = Math.min(165, ri(90, 125 + depth * 6));
      rsu(x + gp / 2 - 11, y - 120);
      x += gp;
      const w = ri(240, 400);
      plats.push({ x, y, w, h: HGT - y + 60 });
      populate(x, y, w);
      x += w;
    } else { // float: wide gap bridged by a floating platform
      const gp = ri(180, 240);
      const fw = ri(90, 130);
      plats.push({ x: x + gp / 2 - fw / 2, y: y - ri(0, 30), w: fw, h: 18, deco: 'dock' });
      rsu(x + gp / 2 - 11, y - 130);
      x += gp;
      const w = ri(240, 400);
      plats.push({ x, y, w, h: HGT - y + 60 });
      populate(x, y, w);
      x += w;
    }
  }

  // finish plateau + themed goal
  plats.push({ x, y, w: 420, h: HGT - y + 60 });
  const goalKind = theme === 'mountain' ? 'flag' : theme === 'shoreline' ? 'amp' : 'arch';
  const gh = goalKind === 'flag' ? 96 : goalKind === 'amp' ? 110 : 130;
  ents.push({ type: 'goal', kind: goalKind, x: x + 240, y: y - gh, w: goalKind === 'flag' ? 70 : 105, h: gh });
  const width = x + 420;

  if (theme === 'street') {
    spawners.push({ kind: 'bus', interval: Math.max(2.6, 4.4 - depth * 0.25), speed: 300 + depth * 12, t: 2.5, gy: 620 });
    if (depth > 1) spawners.push({ kind: 'waymo', interval: 5.5, speed: 225 + depth * 10, t: 4, gy: 620 });
  }

  return {
    id: theme, song: theme, isRemix: true,
    name: pick(REMIX_NAMES),
    subtitle: pick(REMIX_TIPS),
    tip: `Remix depth ${depth} — difficulty ${'★'.repeat(Math.min(depth, 5))}`,
    w: width, h: HGT, killY: KILL, waterY: 855,
    skyTop: skin.top, skyMid: skin.mid, skyBot: skin.bot,
    dirt: skin.dirt, turf: skin.turf,
    playerStart: { x: 90, y: 620 - 46 },
    timeLimit: Math.round(45 + width / 55),
    plats, ents, hazards: [], spawners,
  };
}

// ---------------------------------------------------------------------------
// Unicorn Dream — endless, procedurally generated cuteness. Every segment
// rolls a different little challenge and a fresh pastel palette.
// ---------------------------------------------------------------------------
const DREAM_NAMES = [
  'MARSHMALLOW MEADOW', 'SPARKLE HOLLOW', 'BUBBLEGUM BLUFF', 'TWINKLE TRAIL',
  'COTTON CANDY COVE', 'PASTEL PASTURE', 'GLITTER GROVE', 'SUGARPLUM SKYWAY',
  'MOONBEAM MEADOW', 'RAINBOW REACH', 'PEPPERMINT PATH', 'DAYDREAM DELL',
];

const DREAM_CHALLENGES = [
  { id: 'stars',   name: 'STAR RUSH',      tip: 'Catch every wishing star!',          label: 'STARS' },
  { id: 'kittens', name: 'KITTEN RESCUE',  tip: 'Rescue the kittens off the clouds!', label: 'KITTENS' },
  { id: 'bounce',  name: 'BOUNCE PARTY',   tip: 'Floaty gravity and mushrooms galore!' },
  { id: 'parade',  name: 'UNICORN PARADE', tip: 'Hug every single unicorn!',          label: 'HUGS' },
  { id: 'bubbles', name: 'BUBBLE DRIFT',   tip: 'Bubbles lift you over the voids!' },
  { id: 'rainbow', name: 'RAINBOW ROAD',   tip: 'Mind the gaps — ride the rainbows!' },
  { id: 'pixies',  name: 'PIXIE MISCHIEF', tip: 'Pixies pinched the stars. Bop them!', label: 'PIXIES' },
];

const DREAM_SKINS = [
  { top: '#ffd6f0', mid: '#dcc6ff', bot: '#c4f2e6', dirt: '#f6a6d6', turf: '#8ff0c8' },
  { top: '#cfe9ff', mid: '#e6d4ff', bot: '#ffe4f2', dirt: '#b9a6f6', turf: '#a6d8ff' },
  { top: '#fff0c9', mid: '#ffd6ea', bot: '#d9f7e8', dirt: '#ffb3a0', turf: '#ffd45e' },
  { top: '#e8d6ff', mid: '#ffc6e8', bot: '#fff0d6', dirt: '#d6a6f6', turf: '#9ff0d8' },
  { top: '#d6fff0', mid: '#cfe0ff', bot: '#ffe0f4', dirt: '#8fd8f6', turf: '#b6f0a6' },
];

function makeUnicornDream(depth = 1) {
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => Math.round(rnd(a, b));
  const pick = (a) => a[(Math.random() * a.length) | 0];

  const ch = pick(DREAM_CHALLENGES);
  const skin = pick(DREAM_SKINS);
  const HGT = 1000, GY = 700;
  const plats = [], ents = [], groundSegs = [];
  const targetW = 2500 + Math.min(depth, 10) * 210;

  const ground = (x, w) => { plats.push({ x, y: GY, w, h: HGT - GY + 80 }); groundSegs.push([x, w]); };
  const cloud = (x, y, w) => plats.push({ x, y, w: w || 124, h: 20, deco: 'cloud', face: Math.random() < 0.4 });
  const rainbow = (x, y, w) => plats.push({ x, y, w, h: 18, deco: 'rainbow' });
  const star = (x, y) => ents.push({ type: 'star', x, y, w: 26, h: 26, bob: Math.random() * 6 });
  const rsu = (x, y) => ents.push({ type: 'rsu', x, y, w: 22, h: 22, bob: Math.random() * 6 });
  const kitten = (x, y) => ents.push({ type: 'kitten', x, y, w: 28, h: 26, bob: Math.random() * 6 });
  const bubble = (x, y) => ents.push({ type: 'bubble', x, y, w: 46, h: 46, baseY: y, phase: Math.random() * 6, pop: 0 });
  const flutter = (x, y) => ents.push({ type: 'butterfly', x, y, w: 18, h: 14, baseX: x, baseY: y, phase: Math.random() * 6 });
  const mushroom = (x) => ents.push({ type: 'bounce', x, y: GY - 34, w: 54, h: 34, squash: 0 });
  const unicorn = (x) => ents.push({ type: 'unicorn', x, y: GY - 62, w: 66, h: 62 });
  const pixie = (x1, x2, by) => ents.push({
    type: 'pixie', x: x1, y: by, w: 28, h: 28,
    x1, x2, baseY: by, dir: 1, speed: 66 + depth * 2, phase: Math.random() * 6,
  });

  let stars = 0, kittens = 0, hugs = 0, pixies = 0;
  const addStar = (x, y) => { star(x, y); stars++; };
  const addKitten = (x, y) => { kitten(x, y); kittens++; };
  const addUnicorn = (x) => { unicorn(x); hugs++; };
  const addPixie = (a, b, y) => { pixie(a, b, y); pixies++; };

  // fill a stretch of ground with cute stuff
  let lastCk = 0, lastTreat = 0;
  const populate = (x, w) => {
    if (x < 500 || w < 200) return;
    rsu(x + w * 0.3, GY - 70);
    if (Math.random() < 0.5) rsu(x + w * 0.65, GY - 70);
    if (ch.id === 'bounce' || Math.random() < 0.3) mushroom(x + w * 0.5 - 27);
    if (ch.id === 'parade') { if (Math.random() < 0.75) addUnicorn(x + w * 0.6); }
    else if (Math.random() < 0.16) addUnicorn(x + w * 0.6);
    const pixieOdds = ch.id === 'pixies' ? 0.85 : 0.4;
    if (w > 240 && Math.random() < pixieOdds) addPixie(x + 24, x + w - 52, GY - ri(110, 170));
    if (ch.id === 'stars' && Math.random() < 0.8) addStar(x + w * 0.45, GY - ri(80, 150));
    if (Math.random() < 0.5) flutter(x + rnd(40, w - 40), GY - ri(120, 220));
    if (x - lastTreat > 950 && Math.random() < 0.75) {
      lastTreat = x;
      ents.push({ type: pick(['coffee', 'boba', 'burrito', 'money', 'headphones']),
                  x: x + w * 0.75, y: GY - 32, w: 24, h: 26 });
    }
    if (x - lastCk > 1050) {
      lastCk = x;
      ents.push({ type: 'checkpoint', x: x + 30, y: GY - 60, w: 30, h: 60, hit: false });
    }
  };

  // opening meadow
  ground(-40, 420);
  flutter(180, GY - 150);
  flutter(260, GY - 200);

  let x = 380;
  const beats = ch.id === 'rainbow' ? ['gap', 'gap', 'stairs', 'flat']
              : ch.id === 'bubbles' ? ['bubbles', 'gap', 'flat', 'stairs']
              : ['flat', 'flat', 'stairs', 'gap', 'flat'];

  while (x < targetW) {
    const beat = pick(beats);

    if (beat === 'gap' || beat === 'bubbles') {
      const wide = beat === 'bubbles';
      const gp = wide ? ri(210, 285) : ri(105, Math.min(158, 112 + depth * 4));
      if (wide) {
        const n = ri(2, 3);
        for (let i = 0; i < n; i++) bubble(x + 34 + i * ((gp - 80) / Math.max(1, n - 1)), GY - ri(90, 170));
      } else if (Math.random() < 0.75) {
        rainbow(x + gp * 0.14, GY - ri(46, 74), gp * 0.72);
      }
      addStar(x + gp / 2 - 13, GY - ri(150, 215));
      x += gp;
    } else if (beat === 'stairs') {
      // cloud staircase floating over safe ground
      const n = ri(2, 3);
      const span = n * 165 + 90;
      ground(x, span);
      populate(x, span);
      let cy = GY - 105, sx = x + 40;
      for (let i = 0; i < n; i++) {
        const cw = ri(112, 140);
        cloud(sx, cy, cw);
        if (ch.id === 'kittens') addKitten(sx + cw / 2 - 14, cy - 28);
        else if (Math.random() < 0.7) addStar(sx + cw / 2 - 13, cy - 36);
        sx += cw + ri(38, 70);
        cy -= ri(80, 94);
      }
      x += span;
      continue;
    } else {
      const w = ri(260, 430);
      ground(x, w);
      populate(x, w);
      x += w;
      continue;
    }

    // every gap lands on fresh ground
    const w = ri(250, 390);
    ground(x, w);
    populate(x, w);
    x += w;
  }

  // guarantee the objective is actually achievable
  const topUp = (n, fn) => {
    for (let i = 0; i < n; i++) {
      const [gx, gw] = groundSegs[ri(1, groundSegs.length - 1)] || groundSegs[0];
      fn(gx + rnd(40, Math.max(50, gw - 60)));
    }
  };
  if (ch.id === 'kittens' && kittens < 3) topUp(3 - kittens, (px) => addKitten(px, GY - 26));
  if (ch.id === 'stars' && stars < 5) topUp(5 - stars, (px) => addStar(px, GY - ri(70, 130)));
  if (ch.id === 'parade' && hugs < 3) topUp(3 - hugs, (px) => addUnicorn(px));
  if (ch.id === 'pixies' && pixies < 3) topUp(3 - pixies, (px) => addPixie(px, px + 150, GY - 130));

  // the castle at the end of the dream
  ground(x, 420);
  ents.push({ type: 'goal', kind: 'castle', x: x + 250, y: GY - 150, w: 120, h: 150 });
  const width = x + 420;

  const objMap = { stars, kittens, parade: hugs, pixies };
  const need = ch.id === 'stars' ? stars : ch.id === 'kittens' ? kittens
             : ch.id === 'parade' ? hugs : ch.id === 'pixies' ? pixies : 0;

  return {
    id: 'unicorn', song: 'unicorn', dream: true, depth,
    name: DREAM_NAMES[(depth - 1) % DREAM_NAMES.length],
    subtitle: '✨ ' + ch.name + ' ✨',
    tip: ch.tip,
    challenge: ch.id,
    objective: ch.label && need > 0 ? { kind: ch.id, label: ch.label, need, got: 0 } : null,
    gravMul: ch.id === 'bounce' ? 0.62 : 1,
    w: width, h: HGT, killY: 950,
    skyTop: skin.top, skyMid: skin.mid, skyBot: skin.bot,
    dirt: skin.dirt, turf: skin.turf,
    playerStart: { x: 90, y: GY - 46 },
    timeLimit: Math.round(60 + width / 42),
    plats, ents, hazards: [], spawners: [],
  };
}
