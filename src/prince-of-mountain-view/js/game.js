'use strict';
// ---------------------------------------------------------------------------
// Prince of Mountain View — a Prince of Persia parody platformer.
// One prince. Three challenges. Zero parking.
// ---------------------------------------------------------------------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = 960, H = 540;

// ---- physics tuning --------------------------------------------------------
const RUN = 270, ACC = 2000, FRI = 2400;
const GRAV = 1900, JUMP = 660, MAXFALL = 950;
const COYOTE = 0.10, JBUF = 0.12;

// ---- playable characters ----------------------------------------------------
const CHARACTERS = [
  { id: 'prince', name: 'The Prince', desc: 'Balanced. Iconic pants.', run: 1.0, jump: 1.0, dj: false,
    skin: '#e8b88a', hair: '#3a2b1e', band: '#e03a3a', vest: '#ffffff', trim: '#ffd45e', pants: '#f5f5f0' },
  { id: 'princess', name: 'The Princess', desc: 'Royal glide + the Queen at her side.', run: 1.0, jump: 1.2, dj: false, glide: true, dress: true, queen: true,
    skin: '#f0c8a0', hair: '#7a4a1e', band: '#ff6ea8', vest: '#ff9ec4', trim: '#e05a8e', pants: '#ffd9e8' },
  { id: 'intern', name: 'The Intern', desc: 'Fast. Powered by free snacks.', run: 1.18, jump: 0.95, dj: false, cap: true,
    skin: '#c68a5a', hair: '#1e1e1e', band: '#20c05c', vest: '#20c05c', trim: '#0e7a38', pants: '#3a4656' },
  { id: 'founder', name: 'The Founder', desc: 'High jump. Load-bearing vest.', run: 0.9, jump: 1.14, dj: false, shades: true,
    skin: '#f0c8a0', hair: '#8a7a5a', band: '#2b3442', vest: '#2b3442', trim: '#7a90b8', pants: '#b8a888' },
  { id: 'goose', name: 'The Goose', desc: 'DOUBLE JUMP. Pure chaos.', run: 1.05, jump: 0.98, dj: true },
];
const LEVEL_MENU = ['1 · BLACK MOUNTAIN', '2 · SHORELINE SPRINT', '3 · RUSH HOUR',
                    '4 · MAVERICKS', "5 · THE DRAGON'S HOARD",
                    '6 · UNICORN DREAM ∞', '7 · RANDOM REMIX ∞'];
const DREAM_SLOT = 5; // endless cute dream
const REMIX_SLOT = 6; // endless random remix
const N_SLOTS = LEVEL_MENU.length;

// Down in the cave you are rescuing your opposite number.
const RESCUE = {
  prince:   { charId: 'princess', name: 'THE PRINCESS', royal: true },
  princess: { charId: 'prince',   name: 'THE PRINCE',   royal: true },
  intern:   { charId: 'founder',  name: 'THE FOUNDER',  royal: false },
  founder:  { charId: 'intern',   name: 'THE INTERN',   royal: false },
  goose:    { charId: 'goose',    name: 'THE GANDER',   royal: false, goose: true },
};
function rescueTarget() { return RESCUE[CHARACTERS[G.charIndex].id] || RESCUE.prince; }

// ---- tiptoe & the dragon -----------------------------------------------------
const TIPTOE = 82;      // px/s — quiet enough that nothing stirs
const NOISE_FLOOR = 96; // move faster than this in the chamber and it hears you

// ---- the ocean ---------------------------------------------------------------
const SWIM_GRAV = 240;   // you barely sink
const SWIM_UP = 340;     // thrust while holding jump underwater
const SWIM_MAX = 245;    // vertical speed cap in water
const AIR_SECONDS = 17;  // a full lungful

// Everything the sea is currently doing to you.
const SEA = {
  sub: false, air: 1, swell: 0, swellT: 0, current: 0, currentT: 0,
  twistT: 0, twist: null, twistLeft: 0, gaspT: 0, splashT: 0,
};

const SURF_TWISTS = [
  { name: '🌊 ROGUE SET INCOMING!', kind: 'rogue' },
  { name: '🦈 SHARK FRENZY!',       kind: 'frenzy' },
  { name: '🐬 DOLPHIN POD!',        kind: 'pod' },
  { name: '🌀 RIPTIDE!',            kind: 'riptide' },
  { name: '☀️ GLASSY — SEND IT!',   kind: 'glassy' },
  { name: '🪼 JELLY BLOOM!',        kind: 'jelly' },
];

// ---- state -----------------------------------------------------------------
const G = {
  state: 'title',        // title | select | intro | play | levelend | gameover | win | paused
  mode: 'campaign',      // campaign | dream (endless cute) | remix (endless random)
  levelIndex: 0, remixDepth: 1, dreamDepth: 1,
  dreamEventT: 0,        // ticks down to the next cute happening
  funMode: false, zenMode: false,
  selChar: 0, selLevel: 0, charIndex: 0,
  buffs: { speed: 0, jump: 0 },
  shots: [], shootCd: 0,
  lives: 3, hearts: 3, rsus: 0,
  timer: 0, t: 0,        // t = global animation clock
  level: null,
  vehicles: [],          // buses & waymos (moving platform-hazards)
  particles: [],
  camX: 0, camY: 0, shake: 0,
  introT: 0, endT: 0,
  quip: null, quipT: 0,
  honkCool: 0, batCool: 0, dripT: 0,
  caveNoise: 0,          // discrete noise events, drained by the dragon each tick
};
const P = {
  x: 0, y: 0, vx: 0, vy: 0, w: 26, h: 46,
  onGround: false, facing: 1, animT: 0,
  coyote: 0, jbuf: 0, invuln: 0, py: 0, riding: null, jumps: 0,
  respawnX: 0, respawnY: 0, launch: false,
};

// The Queen — the Princess's floating sidekick. Magnets treasure, zaps
// pests, and takes one hit for her daughter per level.
const Q = {
  active: false, x: 0, y: 0, bob: 0,
  zapCd: 0, zapT: 0, zapX: 0, zapY: 0, saves: 1,
};
// A baby unicorn that adopts you the moment you hug your first unicorn.
const F = { active: false, x: 0, y: 0, hop: 0, facing: 1 };

// The dragon. Asleep on its hoard until you give it a reason not to be.
const D = {
  active: false, alert: 0, state: 'asleep', // asleep | stirring | waking | lunge
  lungeT: 0, breath: 0, snore: 0, warned: false, growled: false,
};
const CAVE_QUIPS = [
  'Something moved in the dark…',
  'These caves eat runners.',
  'Do NOT look up.',
];
const EATEN_QUIPS = [
  'CHOMP. Should have tiptoed.',
  'The dragon heard everything.',
  'Eaten. Loudly.',
];

const CUTE_QUIPS = [
  'Mew! 🐱', 'Purr… 🐱', 'Kitten secured!', 'So fluffy!!',
];
const DREAM_EVENTS = [
  { name: '✨ Sparkle shower! ✨', kind: 'sparkle' },
  { name: '💖 Heart rain! 💖', kind: 'hearts' },
  { name: '🦋 Butterfly parade! 🦋', kind: 'flutter' },
  { name: '🌈 Double rainbow! 🌈', kind: 'rainbow' },
];

const QUEEN_QUIPS = [
  'The Queen says: no.',
  'Royal decree: begone!',
  'Mum handled it.',
  "Queen's gambit!",
  'Escalated to management.',
];

const HURT_QUIPS = [
  'Ouch! My vested equity!',
  "That's going in the retro…",
  'Filing a bug report…',
  'My ergonomic posture!',
  'Not covered by my HSA!',
];
const GOOSE_QUIPS = ['The geese have NO chill!', 'HONK-related incident!'];
const BUS_QUIPS = ['Yeeted by the shuttle!', 'Should’ve taken Caltrain…'];
const COLLECT_QUIPS = ['Cha-ching!', 'Fully vested!', 'Refresh grant!'];

// ---- input -----------------------------------------------------------------
const keys = {};
addEventListener('keydown', (e) => {
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code)) e.preventDefault();
  AudioSys.unlock();
  if (!keys[e.code]) onKeyPress(e.code);
  keys[e.code] = true;
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

function onKeyPress(code) {
  if (code === 'KeyM') { AudioSys.toggleMute(); return; }
  if (code === 'KeyX') { toggleFullscreen(); return; }

  if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') P.jbuf = JBUF;

  // number keys: pick a level in the menu, or warp to it mid-game
  const digit = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3,
                  Digit5: 4, Digit6: 5, Digit7: 6 }[code];

  switch (G.state) {
    case 'title':
      if (code === 'Enter') G.state = 'select';
      break;
    case 'select': {
      const n = CHARACTERS.length;
      if (code === 'ArrowLeft' || code === 'KeyA') G.selChar = (G.selChar + n - 1) % n;
      else if (code === 'ArrowRight' || code === 'KeyD') G.selChar = (G.selChar + 1) % n;
      else if (code === 'ArrowUp' || code === 'KeyW') G.selLevel = (G.selLevel + N_SLOTS - 1) % N_SLOTS;
      else if (code === 'ArrowDown' || code === 'KeyS') G.selLevel = (G.selLevel + 1) % N_SLOTS;
      else if (digit !== undefined) G.selLevel = digit;
      else if (code === 'KeyF') G.funMode = !G.funMode;
      else if (code === 'KeyZ') G.zenMode = !G.zenMode;
      else if (code === 'Enter') startFromSelect();
      else if (code === 'Escape') G.state = 'title';
      break;
    }
    case 'intro':
      if (code === 'Enter' || code === 'Space') beginPlay();
      else if (digit !== undefined) jumpTo(digit);
      break;
    case 'play':
      if (code === 'KeyP') G.state = 'paused';
      else if (code === 'KeyR') restartLevel();
      else if (digit !== undefined) jumpTo(digit);
      break;
    case 'paused':
      if (code === 'KeyP' || code === 'Enter') G.state = 'play';
      break;
    case 'gameover':
    case 'win':
      if (code === 'Enter') { G.state = 'title'; AudioSys.startSong('title'); }
      else if (digit !== undefined) { G.lives = 3; jumpTo(digit); }
      break;
  }
  // first interaction on menus: start music
  if ((G.state === 'title' || G.state === 'select') && AudioSys.ctx && !AudioSys.song) {
    AudioSys.startSong('title');
  }
}

function toggleFullscreen() {
  const el = document.getElementById('wrap') || canvas;
  if (!document.fullscreenElement) {
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

// ---- flow ------------------------------------------------------------------
function startFromSelect() {
  G.charIndex = G.selChar;
  G.lives = 3; G.rsus = 0;
  if (G.selLevel === REMIX_SLOT) loadRandom(1);
  else if (G.selLevel === DREAM_SLOT) loadDream(1);
  else loadLevel(G.selLevel);
}

function jumpTo(d) {
  if (d === REMIX_SLOT) loadRandom(1);
  else if (d === DREAM_SLOT) loadDream(1);
  else loadLevel(d);
}

function restartLevel() {
  if (G.mode === 'remix') loadRandom(G.remixDepth);
  else if (G.mode === 'dream') loadDream(G.dreamDepth);
  else loadLevel(G.levelIndex);
}

function loadDream(depth) {
  G.mode = 'dream';
  G.dreamDepth = depth;
  setupLevel(makeUnicornDream(depth));
}

function loadLevel(i) {
  G.mode = 'campaign';
  G.levelIndex = i;
  setupLevel(LEVELS[i]());
}

function loadRandom(depth) {
  G.mode = 'remix';
  G.remixDepth = depth;
  setupLevel(makeRandom(depth));
}

function setupLevel(L) {
  G.level = L;
  G.hearts = 3;
  G.timer = L.timeLimit;
  G.vehicles = [];
  G.particles = [];
  G.quip = null;
  G.buffs = { speed: 0, jump: 0 };
  G.shots = []; G.shootCd = 0;
  G.dreamEventT = 9 + Math.random() * 6;
  F.active = false;
  D.active = !!L.dragon;
  D.alert = 0; D.state = 'asleep'; D.lungeT = 0; D.breath = 0;
  D.snore = 0; D.warned = false; D.growled = false;
  SEA.sub = false; SEA.air = 1; SEA.swell = 0; SEA.swellT = 0;
  SEA.current = 0; SEA.currentT = 0; SEA.gaspT = 0; SEA.splashT = 0;
  SEA.twist = null; SEA.twistLeft = 0;
  SEA.twistT = L.ocean ? 8 + Math.random() * 5 : 0;
  if (AudioSys.setMuffle) AudioSys.setMuffle(false);
  for (const s of L.spawners) s.t = s.t ?? 0;
  P.x = L.playerStart.x; P.y = L.playerStart.y;
  P.respawnX = P.x; P.respawnY = P.y;
  P.vx = 0; P.vy = 0; P.invuln = 0; P.riding = null; P.facing = 1; P.jumps = 0;
  Q.active = !!CHARACTERS[G.charIndex].queen;
  Q.x = P.x - 44; Q.y = P.y - 44; Q.bob = 0;
  Q.zapCd = 2.5; Q.zapT = 0; Q.saves = 1;
  G.camX = Math.max(0, Math.min(P.x - W * 0.42, L.w - W));
  G.camY = Math.max(0, Math.min(P.y - H * 0.55, L.h - H));
  G.state = 'intro';
  G.introT = 0;
  AudioSys.startSong(L.song);
}

function beginPlay() { G.state = 'play'; }

function levelComplete() {
  G.state = 'levelend';
  G.endT = 0;
  AudioSys.stopMusic();
  if (G.level.rescue) AudioSys.sfxRescue(); else AudioSys.sfxWin();
  burst(P.x + P.w / 2, P.y, 40, true);
}

function loseLife(msg) {
  AudioSys.sfxLose();
  if (G.funMode) {
    // fun mode: never game over — just spin the level back up
    restartLevel();
    say(msg || 'Fun mode: free do-over!');
    return;
  }
  G.lives--;
  if (G.lives <= 0) {
    G.state = 'gameover';
    AudioSys.stopMusic();
  } else {
    restartLevel();
    say(msg || 'Respawning…');
  }
}

function hurt(fromX, msg) {
  if (P.invuln > 0) return;
  G.shake = 8;
  AudioSys.sfxHurt();
  G.caveNoise += 0.26; // you yelped
  say(msg || HURT_QUIPS[(Math.random() * HURT_QUIPS.length) | 0]);
  if (G.zenMode) {
    // zen: bounced around, never harmed
    P.invuln = 1.2;
    P.vy = -320;
    P.vx = (P.x + P.w / 2 < fromX ? -1 : 1) * 260;
    return;
  }
  // the Queen throws herself in front of one fatal blow per level
  if (G.hearts <= 1 && Q.active && Q.saves > 0) {
    Q.saves--;
    G.hearts = 2;
    P.invuln = 3;
    P.vy = -320;
    P.vx = (P.x + P.w / 2 < fromX ? -1 : 1) * 200;
    AudioSys.sfxMagic();
    burst(Q.x + 12, Q.y + 20, 24, true);
    say('The Queen shields you! ♛');
    return;
  }
  G.hearts--;
  if (G.hearts <= 0) { loseLife(); return; }
  P.invuln = 1.5;
  P.vy = -320;
  P.vx = (P.x + P.w / 2 < fromX ? -1 : 1) * 260;
}

// ---- the baby unicorn --------------------------------------------------------
function updateFoal(dt) {
  if (!F.active) return;
  const tx = P.x - P.facing * 52;
  const dx = tx - F.x;
  F.x += dx * Math.min(1, dt * 2.6);
  F.y += (P.y - F.y) * Math.min(1, dt * 2.2);
  if (Math.abs(dx) > 6) F.facing = dx > 0 ? 1 : -1;
  F.hop += dt * (Math.abs(dx) > 14 ? 11 : 4);
  if (Math.random() < 0.12) {
    G.particles.push({
      x: F.x + 10 + Math.random() * 14, y: F.y + 34,
      vx: 0, vy: 20, life: 0.4, c: '#ffd6f0', s: 2, g: 50,
    });
  }
}

// ---- little things that just happen ------------------------------------------
function updateDreamEvents(dt) {
  G.dreamEventT -= dt;
  if (G.dreamEventT > 0) return;
  G.dreamEventT = 11 + Math.random() * 7;

  const ev = DREAM_EVENTS[(Math.random() * DREAM_EVENTS.length) | 0];
  say(ev.name);
  AudioSys.sfxMagic();
  const left = G.camX, top = G.camY;

  if (ev.kind === 'sparkle') {
    for (let i = 0; i < 60; i++) {
      G.particles.push({
        x: left + Math.random() * W, y: top - Math.random() * 120,
        vx: (Math.random() - 0.5) * 20, vy: 40 + Math.random() * 60,
        life: 2.4, c: Math.random() < 0.5 ? '#fff6a8' : '#ffffff', s: 2 + Math.random() * 2, g: 20,
      });
    }
  } else if (ev.kind === 'hearts') {
    for (let i = 0; i < 34; i++) {
      G.particles.push({
        x: left + Math.random() * W, y: top - Math.random() * 100,
        vx: (Math.random() - 0.5) * 30, vy: 30 + Math.random() * 40,
        life: 2.6, c: Math.random() < 0.5 ? '#ff9ec4' : '#ff6ea8', s: 4, g: 12,
      });
    }
  } else if (ev.kind === 'flutter') {
    // keep the meadow from silting up with butterflies over a long dream
    const flutters = G.level.ents.filter(e => e.type === 'butterfly' && !e.dead);
    while (flutters.length > 14) flutters.shift().dead = true;
    for (let i = 0; i < 6; i++) {
      G.level.ents.push({
        type: 'butterfly', x: P.x + 120 + i * 70, y: P.y - 60 - Math.random() * 90,
        w: 18, h: 14, baseX: P.x + 120 + i * 70, baseY: P.y - 60 - Math.random() * 90,
        phase: Math.random() * 6,
      });
    }
  } else { // rainbow: an arc of colour sweeps the screen
    const RB = ['#ff7b7b', '#ffb45e', '#ffe66d', '#7bdc8a', '#6ec5ff', '#c58cff'];
    for (let i = 0; i < 70; i++) {
      const a = Math.PI + (i / 70) * Math.PI;
      G.particles.push({
        x: left + W / 2 + Math.cos(a) * 300, y: top + 330 + Math.sin(a) * 220,
        vx: 0, vy: -20, life: 1.8 + Math.random(), c: RB[i % RB.length], s: 4, g: -10,
      });
    }
  }
}

// ---- the Queen ---------------------------------------------------------------
function updateQueen(dt) {
  if (!Q.active) return;
  const L = G.level;
  Q.bob += dt;

  // trail her daughter, hovering just behind and above
  const tx = P.x - P.facing * 44;
  const ty = P.y - 42 + Math.sin(Q.bob * 2) * 7;
  Q.x += (tx - Q.x) * Math.min(1, dt * 3.4);
  Q.y += (ty - Q.y) * Math.min(1, dt * 3.0);

  if (Math.random() < 0.3) {
    G.particles.push({
      x: Q.x + 6 + Math.random() * 14, y: Q.y + 14 + Math.random() * 18,
      vx: (Math.random() - 0.5) * 24, vy: 26, life: 0.45,
      c: Math.random() < 0.5 ? '#e6b3ff' : '#ffd45e', s: 2,
    });
  }

  // royal magnetism: treasure drifts toward the Princess
  for (const e of L.ents) {
    if (e.dead || (e.type !== 'rsu' && e.type !== 'star')) continue;
    const dx = (P.x + 13) - (e.x + e.w / 2);
    const dy = (P.y + 20) - (e.y + e.h / 2);
    const d = Math.hypot(dx, dy);
    if (d < 155 && d > 1) {
      const pull = 300 * dt;
      e.x += (dx / d) * pull;
      e.y += (dy / d) * pull;
    }
  }

  // zap the nearest pest on a cooldown
  Q.zapCd -= dt;
  Q.zapT = Math.max(0, Q.zapT - dt);
  if (Q.zapCd <= 0) {
    let best = null, bd = 250;
    for (const e of L.ents) {
      if (e.dead || !['goose', 'snake', 'scooter', 'pixie', 'bat', 'spider', 'shark', 'jelly'].includes(e.type)) continue;
      const d = Math.hypot((e.x + e.w / 2) - (P.x + 13), (e.y + e.h / 2) - (P.y + 23));
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      best.dead = true;
      if (best.type === 'pixie') scoreObjective('pixies');
      Q.zapCd = 3.4;
      Q.zapT = 0.22;
      Q.zapX = best.x + best.w / 2;
      Q.zapY = best.y + best.h / 2;
      AudioSys.sfxZap();
      burst(Q.zapX, Q.zapY, 14, true);
      if (Math.random() < 0.45) say(QUEEN_QUIPS[(Math.random() * QUEEN_QUIPS.length) | 0]);
    }
  }
}

function drown() {
  if (G.zenMode) {
    say('Breathe in, respawn out.');
    toRespawn();
    return;
  }
  if (P.invuln > 0.001 && G.hearts > 0) { toRespawn(); return; }
  G.hearts--;
  G.shake = 8;
  AudioSys.sfxHurt();
  if (G.hearts <= 0) { loseLife('Swimming in the slough…'); return; }
  say(G.level.id === 'shoreline' ? 'The slough is COLD!'
    : G.level.id === 'unicorn' ? 'Whoops! Cloud-diving…' : 'Long way down…');
  toRespawn();
}

function toRespawn() {
  P.x = P.respawnX; P.y = P.respawnY;
  P.vx = 0; P.vy = 0; P.invuln = 1.2; P.riding = null;
}

function say(text) { G.quip = text; G.quipT = 2.0; }

function burst(x, y, n, confetti) {
  const palette = confetti ? ['#ff5b5b','#ffd45e','#5bd68a','#5ba9ff','#c98cff'] : ['#ffe98a','#fff'];
  for (let i = 0; i < n; i++) {
    G.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 340,
      vy: -Math.random() * 380 - 60,
      life: 0.7 + Math.random() * 0.7,
      c: palette[(Math.random() * palette.length) | 0],
      s: confetti ? 3 + Math.random() * 4 : 2 + Math.random() * 3,
    });
  }
}

// ---- helpers ---------------------------------------------------------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// clouds and rainbow bridges can be jumped up through
const oneWay = (pl) => pl.deco === 'cloud' || pl.deco === 'rainbow';
const aabb = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ---- update ----------------------------------------------------------------
function update(dt) {
  G.t += dt;
  if (G.quipT > 0) { G.quipT -= dt; if (G.quipT <= 0) G.quip = null; }
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 24);
  G.honkCool = Math.max(0, G.honkCool - dt);
  G.batCool = Math.max(0, G.batCool - dt);

  // particles run in every state (confetti on win screens)
  for (const p of G.particles) {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g ?? 900) * dt;
  }
  G.particles = G.particles.filter(p => p.life > 0);

  switch (G.state) {
    case 'intro':
      G.introT += dt;
      if (G.introT > 2.6) beginPlay();
      break;
    case 'play':
      updatePlay(dt);
      break;
    case 'levelend':
      G.endT += dt;
      P.animT += dt * 2;
      if (G.endT > 2.6) {
        if (G.mode === 'remix') {
          loadRandom(G.remixDepth + 1); // the remix never ends
        } else if (G.mode === 'dream') {
          loadDream(G.dreamDepth + 1);  // …and neither does the dream
        } else if (G.levelIndex >= LEVELS.length - 1) {
          if (G.zenMode) {
            loadDream(1); // zen: drift straight into the endless dream
          } else {
            G.state = 'win';
            burst(W / 2, H / 3, 80, true);
          }
        } else {
          loadLevel(G.levelIndex + 1);
        }
      }
      break;
  }
}

function updatePlay(dt) {
  const L = G.level;

  // timer (zen mode is timeless)
  if (!G.zenMode) {
    G.timer -= dt;
    if (G.timer <= 0) { loseLife('You missed standup!'); return; }
  }

  // ---- player input & physics
  const ch = CHARACTERS[G.charIndex];
  G.buffs.speed = Math.max(0, G.buffs.speed - dt);
  G.buffs.jump = Math.max(0, G.buffs.jump - dt);
  // hold SHIFT to tiptoe — the only way past anything that listens
  const tiptoe = !!(keys['ShiftLeft'] || keys['ShiftRight']);
  const runMax = tiptoe ? TIPTOE : RUN * ch.run * (G.buffs.speed > 0 ? 1.4 : 1);
  const left = keys['ArrowLeft'] || keys['KeyA'];
  const right = keys['ArrowRight'] || keys['KeyD'];
  const dir = (right ? 1 : 0) - (left ? 1 : 0);

  if (dir !== 0) {
    P.vx += dir * ACC * dt;
    P.vx = clamp(P.vx, -runMax, runMax);
    P.facing = dir;
  } else {
    const s = Math.sign(P.vx);
    P.vx -= s * FRI * dt;
    if (Math.sign(P.vx) !== s) P.vx = 0;
  }

  P.coyote = Math.max(0, P.coyote - dt);
  P.jbuf = Math.max(0, P.jbuf - dt);
  P.invuln = Math.max(0, P.invuln - dt);

  // ---- are we under the surface? (Mavericks only)
  const sea = !!L.ocean;
  const duck = !!(keys['ArrowDown'] || keys['KeyS']);
  const wasSub = SEA.sub;
  if (sea) SEA.sub = P.y + P.h * 0.55 > waveY(L, P.x + P.w / 2);

  const jumpV = JUMP * ch.jump * (G.buffs.jump > 0 ? 1.15 : 1);
  if (P.jbuf > 0 && !(sea && SEA.sub)) {
    if (P.onGround || P.coyote > 0) {
      P.vy = -jumpV;
      P.onGround = false; P.coyote = 0; P.jbuf = 0; P.riding = null; P.jumps = 1;
      AudioSys.sfxJump();
    } else if (ch.dj && P.jumps < 2) {
      P.vy = -jumpV * 0.92; // mid-air wing flap
      P.jbuf = 0; P.jumps = 2;
      AudioSys.sfxJump();
      burst(P.x + 13, P.y + 42, 6, false);
    }
  }
  // variable jump height — but never clip a mushroom launch
  const holdJump = keys['Space'] || keys['ArrowUp'] || keys['KeyW'];
  if (P.launch && P.vy >= 0) P.launch = false;
  if (!holdJump && P.vy < -240 && !P.launch && !(sea && SEA.sub)) P.vy = -240;

  if (sea && SEA.sub) {
    // underwater: buoyant, draggy, and you steer with jump / down
    P.vy += SWIM_GRAV * dt;
    if (holdJump) P.vy -= (SWIM_UP + SWIM_GRAV) * dt;
    if (duck) P.vy += SWIM_UP * 0.7 * dt;
    P.vy = clamp(P.vy, -SWIM_MAX, SWIM_MAX);
    P.vx *= 1 - Math.min(0.9, dt * 1.7);
    P.jumps = 0; P.launch = false;
    if (Math.random() < 0.25) {
      G.particles.push({
        x: P.x + 8 + Math.random() * 12, y: P.y + 6,
        vx: (Math.random() - 0.5) * 20, vy: -70 - Math.random() * 50,
        life: 0.8, c: 'rgba(220,245,255,0.8)', s: 2, g: -60,
      });
    }
  } else {
    P.vy = Math.min(P.vy + GRAV * (L.gravMul || 1) * dt, MAXFALL);
  }

  // royal glide: princess floats while holding jump on the way down
  if (ch.glide && !P.onGround && P.vy > 140 && holdJump) {
    P.vy = 140;
    if (Math.random() < 0.4) {
      G.particles.push({
        x: P.x + Math.random() * 26, y: P.y + 40,
        vx: (Math.random() - 0.5) * 30, vy: 40, life: 0.35, c: '#ff9ec4', s: 2,
      });
    }
  }
  P.py = P.y;
  const wasGround = P.onGround;
  P.onGround = false;

  // horizontal (clouds & rainbows are jump-through: no side walls)
  P.x += P.vx * dt;
  if (sea && SEA.current) P.x += SEA.current * dt; // riptide drags you back
  for (const pl of L.plats) {
    if (oneWay(pl)) continue;
    if (aabb(P, pl)) {
      if (P.vx > 0) P.x = pl.x - P.w; else if (P.vx < 0) P.x = pl.x + pl.w;
      P.vx = 0;
    }
  }
  P.x = clamp(P.x, 0, L.w - P.w);

  // vertical
  const fellV = P.vy;
  P.y += P.vy * dt;
  for (const pl of L.plats) {
    if (!aabb(P, pl)) continue;
    if (oneWay(pl)) {
      // land on top only, and only when falling from above
      if (P.vy > 0 && P.py + P.h <= pl.y + 8) {
        P.y = pl.y - P.h; P.onGround = true; P.vy = 0;
      }
      continue;
    }
    if (P.vy > 0) { P.y = pl.y - P.h; P.onGround = true; P.vy = 0; }
    else if (P.vy < 0) { P.y = pl.y + pl.h; P.vy = 0; }
  }
  // ---- ride the face of the swell (never overriding solid ground, e.g. the pier)
  if (sea && !SEA.sub && !duck && !P.onGround) {
    const cxp = P.x + P.w / 2;
    const surfY = waveY(L, cxp);
    if (P.vy >= 0 && P.y + P.h >= surfY && !inStack(L, cxp)) {
      P.y = surfY - P.h;
      P.vy = 0; P.onGround = true; P.riding = null;
      // gravity down the wave face, plus the swell pushing you shoreward
      P.vx += waveSlope(L, cxp) * 1150 * dt + 34 * dt;
      P.vx = clamp(P.vx, -runMax * 1.7, runMax * 1.7);
      if (Math.abs(P.vx) > 250 && Math.random() < 0.35) {
        G.particles.push({
          x: P.x + 4 + Math.random() * 18, y: surfY,
          vx: -P.vx * 0.25, vy: -50 - Math.random() * 90,
          life: 0.45, c: 'rgba(255,255,255,0.9)', s: 3, g: 500,
        });
      }
    }
  }
  if (sea && wasSub !== SEA.sub) surfaceBreak(L);

  if (wasGround && !P.onGround && P.vy >= 0) P.coyote = COYOTE;
  if (P.onGround) { P.coyote = COYOTE; P.jumps = 0; }
  // boots hitting stone carry a long way underground
  if (!wasGround && P.onGround && fellV > 220) {
    G.caveNoise += clamp(fellV / 950, 0, 1) * (tiptoe ? 0.14 : 0.30);
  }

  // ---- office ordnance: hold C to throw red staplers
  G.shootCd = Math.max(0, G.shootCd - dt);
  if (keys['KeyC'] && G.shootCd <= 0) {
    G.shootCd = 0.45;
    G.shots.push({
      x: P.x + 13 + P.facing * 18, y: P.y + 16,
      vx: P.facing * 520 + P.vx * 0.3, vy: -60,
      t: 1.0, spin: 0,
    });
    AudioSys.sfxShoot();
    G.caveNoise += 0.34; // a stapler clattering off the rocks is not subtle
  }
  updateShots(dt);

  // ---- vehicles (buses / waymos): ride the roof or get bounced
  updateVehicles(dt);

  // ---- hazards (poison oak etc.)
  for (const hz of L.hazards) {
    if (aabb(P, hz)) hurt(hz.x + hz.w / 2, 'Poison oak! Itchy!');
  }

  if (L.dark) caveAmbience(dt);
  if (sea) updateSea(dt);

  // fell off the world / into the water
  if (P.y > L.killY) drown();

  // ---- entities
  for (const e of L.ents) {
    if (e.dead) continue;
    switch (e.type) {
      case 'snake': updatePatrol(e, dt); if (aabb(P, e)) stompOrHurt(e, 'Rattlesnake!'); break;
      case 'goose': updateGoose(e, dt); if (aabb(P, e)) stompOrHurt(e, GOOSE_QUIPS[(Math.random()*2)|0]); break;
      case 'scooter':
        updatePatrol(e, dt);
        if (aabb(P, e)) hurt(e.x + e.w / 2, 'Rogue e-scooter!');
        break;
      case 'shark': updateShark(e, dt); if (aabb(P, e)) stompOrHurt(e, 'SHARK! Not friendly!'); break;
      case 'dolphin': updateDolphin(e, dt); break;
      case 'jelly':
        e.y = e.baseY - Math.abs(Math.sin(G.t * 0.7 + e.phase)) * e.rise;
        if (aabb(P, e)) hurt(e.x + 15, 'Jellyfish! Zap!');
        break;
      case 'airbubble':
        e.y -= 14 * dt;
        if (aabb(P, e)) {
          e.dead = true;
          SEA.air = 1; G.rsus++;
          AudioSys.sfxBubble();
          burst(e.x + 13, e.y + 13, 10, false);
          say('Air! Lungs full.');
        }
        break;
      case 'kelp':
        // a thicket you can push through, but it costs you all your speed
        if (aabb(P, e)) P.vx *= 1 - Math.min(0.85, dt * 3.4);
        break;
      case 'chest':
        if (aabb(P, e)) {
          e.dead = true; G.rsus += 10;
          AudioSys.sfxGold();
          burst(e.x + 22, e.y + 16, 22, true);
          say('Sunken treasure! +10');
        }
        break;
      case 'bat': updateBat(e, dt); if (aabb(P, e)) stompOrHurt(e, 'BAT! In your hair!'); break;
      case 'spider': updateSpider(e, dt); if (aabb(P, e)) stompOrHurt(e, 'SPIDER. Enormous one.'); break;
      case 'gold':
        if (aabb(P, e)) {
          e.dead = true; G.rsus += 3;
          AudioSys.sfxGold();
          burst(e.x + 13, e.y + 10, 10, false);
          if (e.hoard) {
            G.caveNoise += 0.20; // the whole pile shifts when you take from it
            say('The hoard clinks… 🐉');
          } else if (Math.random() < 0.3) say('Gold! +3');
        }
        break;
      case 'pixie':
        updatePatrol(e, dt);
        e.y = e.baseY + Math.sin(G.t * 2 + e.phase) * 24;
        if (aabb(P, e)) stompOrHurt(e, 'Cheeky pixie!');
        break;
      case 'bounce':
        e.squash = Math.max(0, (e.squash || 0) - dt * 3.5);
        if (aabb(P, e) && P.vy > 0 && P.py + P.h <= e.y + 16) {
          P.y = e.y - P.h;
          P.vy = -1120;
          P.jumps = 0; P.onGround = false; P.riding = null; P.launch = true;
          e.squash = 1;
          AudioSys.sfxBoing();
          burst(e.x + e.w / 2, e.y, 10, true);
          if (Math.random() < 0.4) say('BOING! ✨');
        }
        break;
      case 'star':
        if (aabb(P, e)) {
          e.dead = true; G.rsus += 2;
          AudioSys.sfxMagic();
          burst(e.x + 13, e.y + 13, 12, true);
          scoreObjective('stars');
          if (Math.random() < 0.3) say('Wish granted! +2');
        }
        break;
      case 'unicorn':
        if (aabb(P, e)) {
          e.dead = true;
          G.buffs.speed = 10; G.buffs.jump = 10;
          G.hearts = Math.min(3, G.hearts + 1);
          AudioSys.sfxNeigh();
          burst(e.x + 33, e.y + 20, 30, true);
          scoreObjective('parade');
          if (!F.active) {
            F.active = true; F.x = P.x - 40; F.y = P.y; F.hop = 0;
            say('A baby unicorn joins you! 🦄💕');
          } else {
            say('Rainbow blessing! 🦄 +1 ♥');
          }
        }
        break;
      case 'kitten':
        if (aabb(P, e)) {
          e.dead = true; G.rsus += 3;
          AudioSys.sfxMagic();
          burst(e.x + 14, e.y + 13, 14, true);
          scoreObjective('kittens');
          say(CUTE_QUIPS[(Math.random() * CUTE_QUIPS.length) | 0]);
        }
        break;
      case 'butterfly': {
        // pure decoration — flutters in a lazy figure-eight, sprinkles glitter
        e.x = e.baseX + Math.sin(G.t * 0.8 + e.phase) * 60;
        e.y = e.baseY + Math.sin(G.t * 1.6 + e.phase) * 26;
        if (Math.random() < 0.03) {
          G.particles.push({ x: e.x + 9, y: e.y + 12, vx: 0, vy: 18, life: 0.5, c: '#fff0a8', s: 2, g: 40 });
        }
        break;
      }
      case 'bubble': {
        e.y = e.baseY + Math.sin(G.t * 1.4 + e.phase) * 16;
        if (aabb(P, e)) {
          // gently float the player upward
          P.vy = -300;
          P.launch = true; P.jumps = 0;
          e.pop += dt;
          if (Math.random() < 0.4) {
            G.particles.push({
              x: e.x + Math.random() * 46, y: e.y + 40,
              vx: (Math.random() - 0.5) * 40, vy: 30, life: 0.4, c: '#ffffff', s: 2, g: 60,
            });
          }
          if (e.pop > 0.9) {
            e.dead = true;
            AudioSys.sfxPlink();
            burst(e.x + 23, e.y + 23, 10, true);
          }
        }
        break;
      }
      case 'rsu':
        if (aabb(P, e)) {
          e.dead = true; G.rsus++;
          AudioSys.sfxCollect();
          burst(e.x + 11, e.y + 11, 8, false);
          if (Math.random() < 0.25) say(COLLECT_QUIPS[(Math.random()*COLLECT_QUIPS.length)|0]);
        }
        break;
      case 'coffee':
        if (aabb(P, e)) {
          e.dead = true;
          G.hearts = Math.min(3, G.hearts + 1);
          AudioSys.sfxCoffee();
          say('Cold brew power! +1 ♥');
          burst(e.x + 10, e.y, 10, true);
        }
        break;
      case 'boba':
        if (aabb(P, e)) {
          e.dead = true;
          G.buffs.speed = 7;
          AudioSys.sfxCoffee();
          say('Boba boost! ZOOM ZOOM');
          burst(e.x + 9, e.y, 10, true);
        }
        break;
      case 'onewheel':
        if (aabb(P, e)) {
          e.dead = true;
          G.buffs.jump = 7;
          AudioSys.sfxCoffee();
          say('Onewheel legs! Boing.');
          burst(e.x + 14, e.y, 10, true);
        }
        break;
      case 'headphones':
        if (aabb(P, e)) {
          e.dead = true;
          P.invuln = Math.max(P.invuln, 5);
          AudioSys.sfxCoffee();
          say('Noise-cancelled! Untouchable.');
          burst(e.x + 13, e.y, 12, true);
        }
        break;
      case 'burrito':
        if (aabb(P, e)) {
          e.dead = true;
          G.hearts = 3;
          AudioSys.sfxCoffee();
          say('Mission burrito! Fully healed.');
          burst(e.x + 11, e.y, 10, true);
        }
        break;
      case 'money':
        if (aabb(P, e)) {
          e.dead = true;
          G.rsus += 5;
          AudioSys.sfxCollect();
          say('Angel round! +5 RSUs');
          burst(e.x + 12, e.y, 12, false);
        }
        break;
      case 'checkpoint':
        if (!e.hit && aabb(P, e)) {
          e.hit = true;
          P.respawnX = e.x; P.respawnY = e.y;
          AudioSys.sfxCheckpoint();
          say('Checkpoint! (Synced to cloud)');
        }
        break;
      case 'goal':
        if (aabb(P, e)) levelComplete();
        break;
    }
    if (G.state !== 'play') return; // died / finished mid-loop
  }
  P.animT += Math.abs(P.vx) * dt * 0.05 + (P.onGround ? 0 : dt * 2);

  updateQueen(dt);
  updateFoal(dt);
  if (L.dream) updateDreamEvents(dt);
  if (D.active) updateDragon(dt, tiptoe);
  G.caveNoise = 0; // anything not consumed by the dragon simply echoes away

  // rainbow contrail through unicorn land
  if (L.id === 'unicorn' && Math.abs(P.vx) > 70 && Math.random() < 0.4) {
    const RB = ['#ff7b7b', '#ffb45e', '#ffe66d', '#7bdc8a', '#6ec5ff', '#c58cff'];
    G.particles.push({
      x: P.x + 13, y: P.y + 20 + Math.random() * 20,
      vx: -P.facing * 60, vy: -20 - Math.random() * 40, life: 0.5,
      c: RB[(Math.random() * RB.length) | 0], s: 3,
    });
  }

  // shimmer while invulnerable (headphones or post-hit grace)
  if (P.invuln > 0.5 && Math.random() < 0.3) {
    G.particles.push({
      x: P.x + Math.random() * 26, y: P.y + Math.random() * 46,
      vx: (Math.random() - 0.5) * 40, vy: -60, life: 0.4, c: '#ffe98a', s: 2,
    });
  }

  // ---- camera
  const tx = clamp(P.x - W * 0.42, 0, L.w - W);
  const ty = clamp(P.y - H * 0.55, 0, L.h - H);
  G.camX += (tx - G.camX) * Math.min(1, dt * 8);
  G.camY += (ty - G.camY) * Math.min(1, dt * 6);
}

// ---- sharks & dolphins -------------------------------------------------------
function updateShark(e, dt) {
  const L = G.level;
  const px = P.x + P.w / 2, py = P.y + P.h / 2;
  const near = Math.abs(px - (e.x + 36)) < 300 && Math.abs(py - (e.y + 15)) < (e.deep ? 220 : 120);

  if (near && G.state === 'play') {
    // it has your scent
    e.lunge = Math.min(1, e.lunge + dt * 1.6);
    e.dir = px < e.x + 36 ? -1 : 1;
    e.x += e.dir * e.speed * (1 + e.lunge * 0.85) * dt;
    if (e.deep) e.y += clamp(py - (e.y + 15), -70, 70) * dt * 1.5;
  } else {
    e.lunge = Math.max(0, e.lunge - dt);
    updatePatrol(e, dt);
  }
  e.x = clamp(e.x, e.x1 - 320, e.x2 + 320);
  if (!e.deep) {
    // surface sharks cruise just under the swell with the fin showing
    e.y += (waveY(L, e.x + 36) + 22 - e.y) * Math.min(1, dt * 3);
  } else {
    e.y = clamp(e.y, waveY(L, e.x + 36) + 60, L.seabedY - 40);
  }
}

function updateDolphin(e, dt) {
  const L = G.level;
  e.squash = Math.max(0, e.squash - dt * 3);
  e.arc += dt * 1.15;
  // porpoises in and out of the face of the wave
  const leap = Math.sin(e.arc);
  e.y = waveY(L, e.x + 39) - 10 - Math.max(0, leap) * 118;
  e.air = leap > 0.1;

  const prevBottom = P.py + P.h;
  if (aabb(P, e)) {
    if (P.vy > 0 && prevBottom <= e.y + 18) {
      // a proper launch off its back
      P.y = e.y - P.h;
      P.vy = -960; P.jumps = 0; P.onGround = false; P.launch = true;
      e.squash = 1;
      SEA.air = 1;
      AudioSys.sfxDolphin();
      burst(e.x + 39, e.y + 6, 14, true);
      if (Math.random() < 0.5) say('Dolphin launch! 🐬');
    } else if (!e.nudgeT || e.nudgeT <= 0) {
      // dolphins are never a hazard — they just shove you shoreward
      e.nudgeT = 1.2;
      P.vx = Math.max(P.vx, 300);
      SEA.air = Math.min(1, SEA.air + 0.45);
      AudioSys.sfxDolphin();
      say('A dolphin gives you a push! 🐬');
    }
  }
  if (e.nudgeT > 0) e.nudgeT -= dt;
}

// ---- the cave ----------------------------------------------------------------
function updateBat(e, dt) {
  const L = G.level;
  const px = P.x + P.w / 2, py = P.y + P.h / 2;
  e.rest = Math.max(0, (e.rest || 0) - dt);

  if (e.mode === 'roost') {
    const tx = e.baseX + Math.sin(G.t * 1.1 + e.phase) * 44;
    const ty = e.baseY + Math.sin(G.t * 2.2 + e.phase) * 14;
    e.x += (tx - e.x) * Math.min(1, dt * 2.4);
    e.y += (ty - e.y) * Math.min(1, dt * 2.4);
    const near = Math.abs(px - (e.x + 15)) < 250 && Math.abs(py - (e.y + 10)) < 215;
    if (near && e.rest <= 0 && G.state === 'play') {
      e.mode = 'swoop'; e.t = 1.5; e.vx = 0; e.vy = 0;
      if (G.batCool <= 0) { AudioSys.sfxBat(); G.batCool = 0.45; }
    }
  } else {
    e.t -= dt;
    const dx = px - (e.x + 15), dy = py - (e.y + 10);
    const d = Math.hypot(dx, dy) || 1;
    e.vx = clamp(e.vx + (dx / d) * 640 * dt, -270, 270);
    e.vy = clamp(e.vy + (dy / d) * 640 * dt, -270, 270);
    e.x += e.vx * dt; e.y += e.vy * dt;
    if (e.t <= 0) { e.mode = 'roost'; e.rest = 1.3; }
  }
  e.y = clamp(e.y, (L.ceilY || 0) + 6, (L.groundY || 700) - 34);
}

function updateSpider(e, dt) {
  if (e.mode === 'crawl') { updatePatrol(e, dt); return; }
  const px = P.x + P.w / 2;
  if (e.state === 'hang') {
    e.y = e.topY + Math.sin(G.t * 2 + e.x * 0.01) * 5;
    if (Math.abs(px - (e.x + 13)) < 72 && G.state === 'play') e.state = 'drop';
  } else if (e.state === 'drop') {
    e.y += 640 * dt;
    if (e.y >= e.dropY) { e.y = e.dropY; e.state = 'wait'; e.t = 0.55; }
  } else if (e.state === 'wait') {
    e.t -= dt;
    if (e.t <= 0) e.state = 'climb';
  } else {
    e.y -= 195 * dt;
    if (e.y <= e.topY) { e.y = e.topY; e.state = 'hang'; }
  }
}

// ---- the ocean ---------------------------------------------------------------
// The surface is a live sine swell; everything about the surf level reads off
// these two functions.
function waveY(L, x) {
  const w = L.wave;
  return w.baseY
       + Math.sin(x * w.k1 + G.t * w.s1) * (w.a1 + SEA.swell)
       + Math.sin(x * w.k2 - G.t * w.s2) * w.a2;
}
function waveSlope(L, x) {
  return (waveY(L, x + 5) - waveY(L, x - 5)) / 10;
}
const inStack = (L, x) => L.plats.some(p => p.deco === 'stack' && x > p.x - 2 && x < p.x + p.w + 2);

function surfaceBreak(L) {
  const y = waveY(L, P.x + P.w / 2);
  SEA.splashT = 0.35;
  AudioSys[SEA.sub ? 'sfxDive' : 'sfxSplash']();
  if (AudioSys.setMuffle) AudioSys.setMuffle(SEA.sub);
  for (let i = 0; i < 14; i++) {
    G.particles.push({
      x: P.x + 13 + (Math.random() - 0.5) * 34, y,
      vx: (Math.random() - 0.5) * 220, vy: -80 - Math.random() * 220,
      life: 0.5 + Math.random() * 0.3, c: 'rgba(255,255,255,0.92)', s: 2 + Math.random() * 3, g: 700,
    });
  }
}

function updateSea(dt) {
  // ---- air
  if (SEA.sub) {
    SEA.air = Math.max(0, SEA.air - dt / AIR_SECONDS);
    if (SEA.air <= 0) {
      SEA.gaspT -= dt;
      if (SEA.gaspT <= 0) { SEA.gaspT = 2.4; AudioSys.sfxGasp(); hurt(P.x, 'Out of air!'); }
    } else if (SEA.air < 0.3 && Math.random() < 0.015) AudioSys.sfxBubble();
  } else {
    SEA.air = Math.min(1, SEA.air + dt * 0.9);
    SEA.gaspT = 0;
  }
  SEA.splashT = Math.max(0, SEA.splashT - dt);

  // ---- whatever the ocean decided to do to you, winding back down
  if (SEA.swellT > 0) { SEA.swellT -= dt; if (SEA.swellT <= 0) SEA.swell = 0; }
  else SEA.swell += (0 - SEA.swell) * Math.min(1, dt * 1.5);
  if (SEA.currentT > 0) { SEA.currentT -= dt; if (SEA.currentT <= 0) SEA.current = 0; }
  if (SEA.twistLeft > 0) SEA.twistLeft -= dt;

  // ---- and the next twist
  SEA.twistT -= dt;
  if (SEA.twistT > 0) return;
  SEA.twistT = 10 + Math.random() * 7;
  fireTwist(G.level);
}

function fireTwist(L) {
  const tw = SURF_TWISTS[(Math.random() * SURF_TWISTS.length) | 0];
  SEA.twist = tw; SEA.twistLeft = 4.5;
  say(tw.name);
  const px = P.x, sy = L.surfaceY;

  if (tw.kind === 'rogue') {
    SEA.swell = 64; SEA.swellT = 6;
    AudioSys.sfxRogue();
    G.shake = 8;
  } else if (tw.kind === 'glassy') {
    SEA.swell = -22; SEA.swellT = 6;
    G.buffs.speed = Math.max(G.buffs.speed, 6);
    AudioSys.sfxCarve();
  } else if (tw.kind === 'riptide') {
    SEA.current = -150; SEA.currentT = 4;
    AudioSys.sfxRogue();
  } else if (tw.kind === 'frenzy') {
    AudioSys.sfxHonk();
    for (let i = 0; i < 3; i++) {
      const x = px + 420 + i * 260;
      L.ents.push({ type: 'shark', x, y: sy + 26, w: 72, h: 30,
                    x1: x - 240, x2: x + 240, dir: -1, speed: 132,
                    deep: false, lunge: 0, bob: Math.random() * 6, temp: true });
    }
  } else if (tw.kind === 'pod') {
    AudioSys.sfxDolphin();
    for (let i = 0; i < 4; i++) {
      L.ents.push({ type: 'dolphin', x: px + 340 + i * 190, y: sy - 10, w: 78, h: 34,
                    baseY: sy - 10, arc: Math.random() * 6, squash: 0, temp: true });
    }
  } else { // jelly bloom
    AudioSys.sfxBubble();
    for (let i = 0; i < 5; i++) {
      const x = px + 300 + i * 150;
      L.ents.push({ type: 'jelly', x, y: sy + 260 + Math.random() * 220, w: 30, h: 40,
                    baseY: sy + 260, rise: 130, phase: Math.random() * 6, temp: true });
    }
  }
  // never let the temporary spawns pile up over a long run
  const temps = L.ents.filter(e => e.temp && !e.dead);
  while (temps.length > 20) temps.shift().dead = true;
}

function caveAmbience(dt) {
  G.dripT -= dt;
  if (G.dripT <= 0) {
    G.dripT = 2.5 + Math.random() * 5;
    if (Math.random() < 0.55) AudioSys.sfxDrip();
    if (Math.random() < 0.12) say(CAVE_QUIPS[(Math.random() * CAVE_QUIPS.length) | 0]);
  }
}

// The dragon sleeps on its hoard and listens. Speed is noise; noise is death.
function updateDragon(dt, tiptoe) {
  const L = G.level;
  D.snore += dt;
  D.breath = Math.max(0, D.breath - dt);

  if (D.state === 'lunge') {
    D.lungeT -= dt;
    if (D.lungeT <= 0) dragonEats();
    return;
  }

  const inZone = P.x + P.w > L.dragonZone;
  if (!inZone) {
    D.alert = Math.max(0, D.alert - dt * 0.7);
    D.warned = false; D.growled = false;
    D.state = D.alert > 0.42 ? 'stirring' : 'asleep';
    return;
  }

  if (!D.warned) {
    D.warned = true;
    say(P.invuln > 1.6
      ? 'Noise-cancelling helps YOUR ears, not his — 🐉 TIPTOE'
      : '🐉 SLEEPING DRAGON — hold SHIFT to tiptoe');
  }

  const spd = Math.abs(P.vx);
  let noise = G.caveNoise;
  if (spd > NOISE_FLOOR) noise += (spd - NOISE_FLOOR) / 470 * 1.05 * dt;
  if (!P.onGround) noise += dt * 0.26;

  if (noise > 0) {
    D.alert = Math.min(1, D.alert + noise);
  } else {
    // freezing on the spot always buys you back out, and fastest when it is
    // already half awake and you have just realised your mistake
    D.alert = Math.max(0, D.alert - dt * (D.alert > 0.78 ? 0.62 : 0.42));
  }

  if (D.alert >= 1) {
    D.state = 'lunge'; D.lungeT = 0.55;
    G.shake = 12;
    AudioSys.sfxRoar();
    say('IT SEES YOU');
    return;
  }
  if (D.alert >= 0.78) {
    if (D.state !== 'waking') { D.state = 'waking'; AudioSys.sfxGrowl(); }
    G.shake = Math.max(G.shake, 3);
  } else if (D.alert >= 0.42) {
    if (D.state !== 'stirring') {
      D.state = 'stirring';
      if (!D.growled) { D.growled = true; AudioSys.sfxGrowl(); say('It stirs. STOP MOVING.'); }
    }
  } else {
    D.state = 'asleep';
    D.growled = false;
    if (Math.random() < 0.012) D.breath = 1.1; // a slow snore-puff of smoke
  }
}

function dragonEats() {
  D.state = 'asleep'; D.alert = 0; D.lungeT = 0; D.warned = false;
  G.shake = 16;
  AudioSys.sfxRoar();
  burst(P.x + 13, P.y + 20, 30, false);
  if (G.zenMode) {
    // zen mode: it just huffs you back down the tunnel
    P.x = G.level.dragonZone - 140; P.y = G.level.groundY - 46;
    P.vx = 0; P.vy = 0; P.invuln = 1.5;
    say('The dragon huffs you back down the tunnel.');
    return;
  }
  loseLife(EATEN_QUIPS[(Math.random() * EATEN_QUIPS.length) | 0]);
}

function updatePatrol(e, dt) {
  e.x += e.dir * e.speed * dt;
  if (e.x < e.x1) { e.x = e.x1; e.dir = 1; }
  if (e.x > e.x2) { e.x = e.x2; e.dir = -1; }
}

function updateGoose(e, dt) {
  const px = P.x + P.w / 2, ex = e.x + e.w / 2;
  const near = Math.abs(px - ex) < 190 && Math.abs(P.y - e.y) < 90;
  if (near && G.state === 'play') {
    if (e.mode !== 'charge') {
      e.mode = 'charge';
      if (G.honkCool <= 0) { AudioSys.sfxHonk(); G.honkCool = 0.8; }
    }
    e.dir = px < ex ? -1 : 1;
    e.x += e.dir * 195 * dt;
    e.x = clamp(e.x, e.x1 - 40, e.x2 + 40);
  } else {
    e.mode = 'waddle';
    updatePatrol(e, dt);
  }
}

// tick a dream challenge forward; celebrate when it's complete
function scoreObjective(kind) {
  const o = G.level && G.level.objective;
  if (!o || o.kind !== kind || o.done) return;
  o.got++;
  if (o.got >= o.need) {
    o.done = true;
    G.rsus += 10;
    AudioSys.sfxWin();
    burst(P.x + 13, P.y + 10, 40, true);
    say('PERFECT! ✨ +10');
  }
}

function stompOrHurt(e, msg) {
  const prevBottom = P.py + P.h;
  if (P.vy > 0 && prevBottom <= e.y + 12) {
    e.dead = true;
    if (e.type === 'pixie') scoreObjective('pixies');
    P.vy = -400;
    AudioSys.sfxStomp();
    burst(e.x + e.w / 2, e.y, 10, false);
    say(e.type === 'goose' ? 'Goose... managed out.'
      : e.type === 'shark' ? 'Shark bopped! Paddle on.'
      : e.type === 'bat' ? 'Bat batted!'
      : e.type === 'spider' ? 'Spider: squished.'
      : e.type === 'pixie' ? 'Cheeky pixie bopped!'
      : 'Snake stomped!');
  } else {
    hurt(e.x + e.w / 2, msg);
  }
}

function updateShots(dt) {
  const L = G.level;
  for (const s of G.shots) {
    s.t -= dt;
    s.spin += 14 * dt;
    s.x += s.vx * dt;
    s.vy += 500 * dt;
    s.y += s.vy * dt;
    if (s.t <= 0) { s.dead = true; continue; }
    const box = { x: s.x - 8, y: s.y - 4, w: 16, h: 8 };
    for (const pl of L.plats) {
      if (aabb(box, pl)) { s.dead = true; burst(s.x, s.y, 4, false); break; }
    }
    if (s.dead) continue;
    for (const e of L.ents) {
      if (e.dead || !['goose', 'snake', 'scooter', 'pixie', 'bat', 'spider', 'shark', 'jelly'].includes(e.type)) continue;
      if (aabb(box, e)) {
        e.dead = true; s.dead = true;
        if (e.type === 'pixie') scoreObjective('pixies');
        AudioSys.sfxStomp();
        burst(e.x + e.w / 2, e.y + e.h / 2, 12, false);
        if (Math.random() < 0.4) {
          say(e.type === 'scooter' ? 'Scooter decommissioned!'
            : e.type === 'bat' ? 'Bat stapled mid-air!' : 'Stapled!');
        }
        break;
      }
    }
    if (s.dead) continue;
    for (const v of G.vehicles) {
      if (aabb(box, v)) {
        // corporate vehicles are stapler-proof
        s.dead = true;
        AudioSys.sfxPlink();
        burst(s.x, s.y, 5, false);
        break;
      }
    }
  }
  G.shots = G.shots.filter(s => !s.dead);
}

function updateVehicles(dt) {
  const L = G.level;
  // spawn ahead of the camera, driving left (they're headed to SF)
  for (const s of L.spawners) {
    s.t -= dt;
    if (s.t <= 0) {
      s.t = s.interval;
      const groundY = s.gy || 580;
      const v = s.kind === 'bus'
        ? { kind: 'bus', w: 180, h: 64, vx: -s.speed }
        : { kind: 'waymo', w: 110, h: 42, vx: -s.speed };
      v.x = G.camX + W + 80;
      v.y = groundY - v.h;
      if (v.x < L.w + 300) G.vehicles.push(v);
    }
  }

  const prevBottom = P.py + P.h;
  P.riding = null;
  for (const v of G.vehicles) {
    v.x += v.vx * dt;
    const overX = P.x + P.w > v.x + 6 && P.x < v.x + v.w - 6;
    const onTop = P.vy >= 0 && prevBottom <= v.y + 16 && P.y + P.h >= v.y && P.y + P.h <= v.y + 42 && overX;
    if (onTop) {
      P.y = v.y - P.h;
      P.vy = 0;
      P.onGround = true;
      P.coyote = COYOTE;
      P.riding = v;
      P.x += v.vx * dt;
    } else if (aabb(P, v)) {
      hurt(v.x + v.w / 2, v.kind === 'bus' ? BUS_QUIPS[(Math.random()*2)|0] : 'Beep boop. Collision logged.');
    }
  }
  G.vehicles = G.vehicles.filter(v => v.x + v.w > G.camX - 700);
}

// ============================================================================
// RENDERING
// ============================================================================
function draw() {
  ctx.clearRect(0, 0, W, H);
  switch (G.state) {
    case 'title': drawTitle(); break;
    case 'select': drawSelect(); break;
    case 'gameover': drawGameOver(); break;
    case 'win': drawWin(); break;
    default: drawWorld(); break;
  }
  drawParticlesScreen();
}

function camOffset() {
  const sx = (Math.random() - 0.5) * G.shake;
  const sy = (Math.random() - 0.5) * G.shake;
  return [Math.round(G.camX + sx), Math.round(G.camY + sy)];
}

function drawWorld() {
  const L = G.level;
  const [cx, cy] = camOffset();

  drawSky(L);
  drawBackdrop(L, cx, cy);

  ctx.save();
  ctx.translate(-cx, -cy);

  drawPlatforms(L);
  if (L.ocean) drawOceanBody(L, cx);
  drawWater(L, cx);
  if (L.dragon) drawDragon(L);
  if (L.torches) for (const t of L.torches) drawTorch(t);
  for (const hz of L.hazards) drawOak(hz);
  for (const e of L.ents) if (!e.dead) drawEntity(e);
  for (const v of G.vehicles) (v.kind === 'bus' ? drawBus : drawWaymo)(v);
  drawShots();
  drawFoal();
  drawQueen();
  if (L.ocean && !SEA.sub) drawSurfboard(L);
  if (L.ocean && SEA.sub) {
    // swimming: pitch into whatever direction you are kicking
    ctx.save();
    ctx.translate(P.x + 13, P.y + 23);
    ctx.rotate(clamp(P.vy / 420, -0.5, 0.5) * P.facing + P.facing * 0.28);
    ctx.translate(-(P.x + 13), -(P.y + 23));
    drawPlayer(CHARACTERS[G.charIndex], P.x, P.y, P.facing, P.animT, false, P.invuln, true);
    ctx.restore();
  } else {
    drawPlayer(CHARACTERS[G.charIndex], P.x, P.y, P.facing, P.animT, P.onGround, P.invuln, Math.abs(P.vx) > 20);
  }
  drawQuip();
  drawParticlesWorld();

  ctx.restore();

  if (L.dark) drawDarkness(L, cx, cy);
  if (L.ocean) drawUnderwaterTint(L, cx, cy);
  drawHUD();
  if (G.state === 'intro') drawIntroCard();
  if (G.state === 'levelend') drawLevelEnd();
  if (G.state === 'paused') drawPaused();
}

function drawSky(L) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, L.skyTop);
  g.addColorStop(0.55, L.skyMid);
  g.addColorStop(1, L.skyBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawBackdrop(L, cx, cy) {
  ctx.save();
  if (L.dark) { drawCaveBackdrop(L, cx); ctx.restore(); return; } // no sky down here

  // out at sea the whole sky hangs off the waterline, not off the screen
  const horizon = L.ocean ? L.surfaceY - cy : 0;

  // sun / moon
  const sunX = L.id === 'street' ? 220 : 720;
  const sunY = L.ocean ? horizon - 232 : (L.id === 'shoreline' ? 80 : 130);
  ctx.fillStyle = L.id === 'shoreline' ? '#fff6c9' : '#ffd88a';
  const sr = L.id === 'street' ? 46 : 34;
  const sxp = sunX - cx * 0.05;
  ctx.beginPath(); ctx.arc(sxp, sunY, sr, 0, 7); ctx.fill();
  if (L.id === 'unicorn') {
    // the sun is having a lovely time
    ctx.fillStyle = '#e8a33d';
    ctx.beginPath(); ctx.arc(sxp - 12, sunY - 4, 3, 0, 7); ctx.arc(sxp + 12, sunY - 4, 3, 0, 7); ctx.fill();
    ctx.strokeStyle = '#e8a33d'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(sxp, sunY + 2, 12, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,150,190,0.45)';
    ctx.beginPath(); ctx.arc(sxp - 20, sunY + 6, 5, 0, 7); ctx.arc(sxp + 20, sunY + 6, 5, 0, 7); ctx.fill();
  }

  // drifting clouds
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 5; i++) {
    const x = ((i * 260 + G.t * 12 - cx * 0.15) % (W + 300)) - 150;
    const y = L.ocean ? horizon - 258 + (i % 3) * 46 : 50 + (i % 3) * 45;
    ctx.beginPath();
    ctx.ellipse(x, y, 46, 14, 0, 0, 7);
    ctx.ellipse(x + 28, y - 8, 30, 12, 0, 0, 7);
    ctx.ellipse(x - 26, y - 5, 26, 11, 0, 0, 7);
    ctx.fill();
  }

  if (L.id === 'mountain') {
    // far ridge with the famous Black Mountain radio towers
    ctx.fillStyle = 'rgba(40,32,70,0.55)';
    ridge(cx * 0.2, 330, 130);
    ctx.fillStyle = 'rgba(30,24,54,0.75)';
    ridge(cx * 0.35 + 400, 400, 100);
    ctx.strokeStyle = 'rgba(30,24,54,0.9)'; ctx.lineWidth = 3;
    const tX = 620 - cx * 0.2;
    for (const dx of [0, 26, 52]) {
      ctx.beginPath(); ctx.moveTo(tX + dx, 268); ctx.lineTo(tX + dx, 218); ctx.stroke();
      ctx.fillStyle = 'rgba(255,90,90,' + (0.4 + 0.4 * Math.sin(G.t * 3 + dx)) + ')';
      ctx.beginPath(); ctx.arc(tX + dx, 216, 3, 0, 7); ctx.fill();
    }
  } else if (L.id === 'shoreline') {
    // the bay + a sail + distant white amphitheatre tent
    ctx.fillStyle = 'rgba(64,150,200,0.5)';
    ctx.fillRect(0, 250, W, 90);
    const sx = ((G.t * 20 - cx * 0.1) % (W + 200)) - 100;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(sx, 280); ctx.lineTo(sx, 252); ctx.lineTo(sx + 18, 278); ctx.closePath(); ctx.fill();
    drawTentShape(760 - cx * 0.12, 268, 0.55, 'rgba(255,255,255,0.85)');
  } else if (L.id === 'unicorn') {
    // giant layered rainbow
    const RB = ['#ff9ec4', '#ffc98a', '#fff09e', '#a8f0c0', '#a8d8ff', '#d0b0ff'];
    ctx.lineWidth = 15;
    RB.forEach((c, i) => {
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.arc(520 - cx * 0.16, 448, 215 - i * 15, Math.PI, 0);
      ctx.stroke();
    });
    // twinkling stars
    for (let i = 0; i < 26; i++) {
      const sx = ((i * 167 - cx * 0.08) % (W + 160)) - 80;
      const sy = 30 + (i * 79) % 250;
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(G.t * 2 + i));
      ctx.fillStyle = `rgba(255,255,255,${tw})`;
      sparkle(sx, sy, 3 + (i % 3));
    }
    // floating candy islets
    for (let i = 0; i < 4; i++) {
      const ix = ((i * 320 + 80 - cx * 0.3) % (W + 400)) - 200;
      const iy = 300 + (i % 2) * 60;
      ctx.fillStyle = 'rgba(246,166,214,0.55)';
      ctx.beginPath(); ctx.ellipse(ix, iy, 46, 14, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(143,240,200,0.55)';
      ctx.beginPath(); ctx.ellipse(ix, iy - 6, 46, 10, 0, 0, 7); ctx.fill();
    }
  } else if (L.id === 'surf') {
    // Everything out here hangs off the waterline, so it stays put on the
    // horizon however far up or down the camera has travelled.
    const hz = L.surfaceY - cy;
    if (hz > -140) {
      // headland out at the point
      ctx.fillStyle = 'rgba(46,74,60,0.85)';
      const hx = 190 - cx * 0.06;
      ctx.beginPath();
      ctx.moveTo(hx - 190, hz);
      ctx.quadraticCurveTo(hx - 60, hz - 74, hx + 40, hz - 38);
      ctx.quadraticCurveTo(hx + 120, hz - 14, hx + 210, hz);
      ctx.closePath(); ctx.fill();
      // rank after rank of swell marching in from out the back
      for (let i = 0; i < 6; i++) {
        const y = hz - 52 + i * 9;
        ctx.fillStyle = `rgba(24,96,164,${0.30 + i * 0.07})`;
        ctx.beginPath();
        ctx.moveTo(-10, y);
        for (let x = -10; x <= W + 10; x += 26) {
          ctx.lineTo(x, y + Math.sin((x + cx * 0.1 + i * 40) * 0.02 + G.t * (0.6 + i * 0.1)) * (1.5 + i * 0.8));
        }
        ctx.lineTo(W + 10, y + 10); ctx.lineTo(-10, y + 10);
        ctx.closePath(); ctx.fill();
      }
      // gulls
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const gx = ((i * 271 + G.t * 16 - cx * 0.12) % (W + 200)) - 100;
        const gy = hz - 210 + (i * 47) % 90 + Math.sin(G.t * 1.4 + i) * 5;
        const f = Math.sin(G.t * 4 + i) * 4;
        ctx.beginPath();
        ctx.moveTo(gx - 9, gy); ctx.quadraticCurveTo(gx - 4, gy - 5 - f, gx, gy);
        ctx.quadraticCurveTo(gx + 4, gy - 5 - f, gx + 9, gy);
        ctx.stroke();
      }
    }
  } else if (L.id === 'street') {
    // office-park skyline with lit windows + palm trees
    for (let i = 0; i < 8; i++) {
      const bx = ((i * 190 - cx * 0.25) % (W + 400)) - 200;
      const bh = 90 + (i * 53) % 130;
      ctx.fillStyle = 'rgba(35,25,60,0.8)';
      ctx.fillRect(bx, 330 - bh, 120, bh + 60);
      ctx.fillStyle = 'rgba(255,220,130,0.7)';
      for (let wy = 0; wy < bh - 20; wy += 22)
        for (let wx = 0; wx < 100; wx += 24)
          if ((i * 7 + wx + wy) % 5 !== 0) ctx.fillRect(bx + 10 + wx, 340 - bh + wy, 10, 8);
    }
    for (let i = 0; i < 4; i++) {
      const px = ((i * 340 + 120 - cx * 0.45) % (W + 300)) - 150;
      drawPalm(px, 392);
    }
  }
  ctx.restore();
}

// The far cavern wall: crystal seams, dripping columns, and a red glow
// coming up from something much deeper than you are going.
function drawCaveBackdrop(L, cx) {
  ctx.fillStyle = 'rgba(20,12,30,0.9)';
  ctx.fillRect(0, 0, W, H);
  // distant rock columns
  for (let i = 0; i < 7; i++) {
    const bx = ((i * 268 - cx * 0.22) % (W + 420)) - 210;
    ctx.fillStyle = 'rgba(38,24,52,0.7)';
    ctx.beginPath();
    ctx.moveTo(bx, 0); ctx.lineTo(bx + 66, 0);
    ctx.lineTo(bx + 48, H); ctx.lineTo(bx + 18, H);
    ctx.closePath(); ctx.fill();
  }
  // crystals glinting in the far dark
  for (let i = 0; i < 30; i++) {
    const gx = ((i * 231 - cx * 0.18) % (W + 300)) - 150;
    const gy = 60 + (i * 137) % 400;
    const tw = 0.18 + 0.34 * Math.abs(Math.sin(G.t * 0.9 + i));
    ctx.fillStyle = i % 3 === 0 ? `rgba(255,208,110,${tw})` : `rgba(120,220,240,${tw * 0.8})`;
    sparkle(gx, gy, 2 + (i % 3));
  }
  // cold mineral light seeping up out of the deep
  const gl = ctx.createLinearGradient(0, H, 0, H - 200);
  gl.addColorStop(0, `rgba(46,70,124,${0.30 + 0.07 * Math.sin(G.t * 0.7)})`);
  gl.addColorStop(1, 'rgba(46,70,124,0)');
  ctx.fillStyle = gl;
  ctx.fillRect(0, H - 200, W, 200);
}

function sparkle(x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

function ridge(off, baseY, amp) {
  ctx.beginPath();
  ctx.moveTo(-10, H);
  for (let x = -10; x <= W + 10; x += 20) {
    const y = baseY - Math.abs(Math.sin((x + off) * 0.006)) * amp - Math.sin((x + off) * 0.02) * 18;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W + 10, H);
  ctx.closePath();
  ctx.fill();
}

function drawPalm(x, y) {
  ctx.strokeStyle = 'rgba(60,40,60,0.9)'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 6, y - 40, x + 2, y - 70); ctx.stroke();
  ctx.strokeStyle = 'rgba(30,90,60,0.9)'; ctx.lineWidth = 4;
  for (let a = 0; a < 6; a++) {
    const ang = -Math.PI / 2 + (a - 2.5) * 0.5;
    ctx.beginPath();
    ctx.moveTo(x + 2, y - 70);
    ctx.quadraticCurveTo(x + 2 + Math.cos(ang) * 24, y - 70 + Math.sin(ang) * 24 - 8,
                         x + 2 + Math.cos(ang) * 42, y - 70 + Math.sin(ang) * 42 + 10);
    ctx.stroke();
  }
}

function drawPlatforms(L) {
  for (const pl of L.plats) {
    if (pl.deco === 'dock') {
      ctx.fillStyle = '#9c7040'; ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
      ctx.fillStyle = '#7a5530';
      ctx.fillRect(pl.x + 8, pl.y + pl.h, 8, 40);
      ctx.fillRect(pl.x + pl.w - 16, pl.y + pl.h, 8, 40);
      continue;
    }
    if (pl.deco === 'table') {
      ctx.fillStyle = '#b5814f'; ctx.fillRect(pl.x, pl.y, pl.w, 10);
      ctx.fillStyle = '#8a5f36';
      ctx.fillRect(pl.x + 12, pl.y + 10, 8, 88);
      ctx.fillRect(pl.x + pl.w - 20, pl.y + 10, 8, 88);
      continue;
    }
    if (pl.deco === 'shelter') {
      ctx.fillStyle = '#5a6b85'; ctx.fillRect(pl.x - 6, pl.y, pl.w + 12, pl.h);
      ctx.fillStyle = 'rgba(160,210,240,0.5)';
      ctx.fillRect(pl.x + 6, pl.y + pl.h, pl.w - 12, 70);
      ctx.fillStyle = '#4a5870';
      ctx.fillRect(pl.x + 2, pl.y + pl.h, 8, 88);
      ctx.fillRect(pl.x + pl.w - 10, pl.y + pl.h, 8, 88);
      ctx.fillStyle = '#ffd45e';
      ctx.font = 'bold 11px Trebuchet MS';
      ctx.fillText('GBUS STOP', pl.x + 34, pl.y + 30);
      continue;
    }
    if (pl.deco === 'cloud') {
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      ctx.beginPath();
      ctx.ellipse(pl.x + pl.w * 0.22, pl.y + 13, 32, 15, 0, 0, 7);
      ctx.ellipse(pl.x + pl.w * 0.52, pl.y + 10, 38, 18, 0, 0, 7);
      ctx.ellipse(pl.x + pl.w * 0.82, pl.y + 14, 28, 14, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(206,226,255,0.75)';
      ctx.beginPath(); ctx.ellipse(pl.x + pl.w / 2, pl.y + 22, pl.w * 0.42, 6, 0, 0, 7); ctx.fill();
      if (pl.face) {
        // some clouds are just happy to see you
        const fx = pl.x + pl.w * 0.52, fy = pl.y + 10;
        const blink = Math.sin(G.t * 1.3 + pl.x) > 0.96;
        ctx.fillStyle = '#7a6a8a';
        if (blink) {
          ctx.fillRect(fx - 10, fy, 6, 1.6); ctx.fillRect(fx + 5, fy, 6, 1.6);
        } else {
          ctx.beginPath(); ctx.arc(fx - 7, fy, 2, 0, 7); ctx.arc(fx + 8, fy, 2, 0, 7); ctx.fill();
        }
        ctx.strokeStyle = '#7a6a8a'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(fx + 0.5, fy + 2, 4, 0.15, Math.PI - 0.15); ctx.stroke();
        ctx.fillStyle = 'rgba(255,160,200,0.45)';
        ctx.beginPath(); ctx.arc(fx - 11, fy + 4, 3, 0, 7); ctx.arc(fx + 12, fy + 4, 3, 0, 7); ctx.fill();
      }
      continue;
    }
    if (pl.deco === 'stack' || pl.deco === 'reef' || pl.deco === 'seabed') {
      const rock = pl.deco === 'seabed' ? '#c8a86a' : '#4a5f6e';
      ctx.fillStyle = rock;
      if (pl.deco === 'seabed') {
        ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
        ctx.fillStyle = '#e0c98e';
        ctx.fillRect(pl.x, pl.y, pl.w, 16);
        // ripples in the sand, and a bit of coral
        const from = Math.max(pl.x, G.camX - 80), to = Math.min(pl.x + pl.w, G.camX + W + 80);
        ctx.fillStyle = 'rgba(160,132,80,0.5)';
        for (let x = Math.floor(from / 54) * 54; x < to; x += 54) ctx.fillRect(x, pl.y + 20, 30, 4);
        for (let x = Math.floor(from / 190) * 190; x < to; x += 190) {
          ctx.fillStyle = ['#ff8fae', '#ffb45e', '#c58cff'][(x / 190 | 0) % 3];
          for (const a of [-0.5, 0, 0.5]) {
            ctx.beginPath();
            ctx.moveTo(x, pl.y);
            ctx.quadraticCurveTo(x + Math.sin(a) * 16, pl.y - 20, x + Math.sin(a) * 26, pl.y - 34);
            ctx.lineWidth = 5; ctx.strokeStyle = ctx.fillStyle; ctx.stroke();
          }
        }
      } else if (pl.deco === 'stack') {
        // a weathered sea stack: tapered, striated, wearing a collar of foam
        const bot = pl.y + pl.h, top = pl.y;
        const g = ctx.createLinearGradient(pl.x, 0, pl.x + pl.w, 0);
        g.addColorStop(0, '#3c4f5e');
        g.addColorStop(0.45, '#5b7185');
        g.addColorStop(1, '#33434f');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(pl.x - 16, bot);
        ctx.lineTo(pl.x + 6, top + 120);
        ctx.lineTo(pl.x + 22, top);
        ctx.lineTo(pl.x + pl.w - 22, top);
        ctx.lineTo(pl.x + pl.w - 6, top + 120);
        ctx.lineTo(pl.x + pl.w + 16, bot);
        ctx.closePath(); ctx.fill();
        // strata
        ctx.strokeStyle = 'rgba(20,30,40,0.28)'; ctx.lineWidth = 3;
        for (let y = top + 150; y < bot; y += 74) {
          ctx.beginPath();
          ctx.moveTo(pl.x - 6, y);
          ctx.quadraticCurveTo(pl.x + pl.w / 2, y + 10, pl.x + pl.w + 6, y - 4);
          ctx.stroke();
        }
        // weed below the tideline, foam at it
        const sy = G.level.surfaceY;
        ctx.fillStyle = 'rgba(34,86,64,0.5)';
        ctx.fillRect(pl.x - 12, sy + 16, pl.w + 24, bot - sy - 16);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath();
        ctx.ellipse(pl.x + pl.w / 2, waveY(G.level, pl.x + pl.w / 2) + 2,
                    pl.w * 0.78, 13 + Math.sin(G.t * 3) * 3, 0, 0, 7);
        ctx.fill();
        // gulls' worth of guano and a couple of barnacles
        ctx.fillStyle = 'rgba(226,232,238,0.6)';
        ctx.fillRect(pl.x + 26, top, pl.w - 52, 9);
      } else {
        // reef shelf — deliberately bright, because you can land on it
        ctx.fillStyle = '#8c9aa6';
        roundRect(pl.x, pl.y, pl.w, pl.h, 14); ctx.fill();
        ctx.fillStyle = '#b9c6cf';
        roundRect(pl.x + 3, pl.y + 2, pl.w - 6, 10, 6); ctx.fill();
        ctx.fillStyle = 'rgba(30,60,50,0.35)';
        roundRect(pl.x + 6, pl.y + pl.h - 10, pl.w - 12, 9, 5); ctx.fill();
        // coral clinging to the top edge
        for (let x = pl.x + 16; x < pl.x + pl.w - 12; x += 34) {
          ctx.fillStyle = ['#ff8fae', '#ffc06a', '#9ae6c8'][((x / 34) | 0) % 3];
          ctx.beginPath(); ctx.ellipse(x, pl.y + 1, 9, 6, 0, Math.PI, 0); ctx.fill();
        }
      }
      continue;
    }
    if (pl.deco === 'pier') {
      ctx.fillStyle = '#8a6440'; ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
      ctx.fillStyle = '#6d4d31';
      for (let x = pl.x + 16; x < pl.x + pl.w; x += 74) ctx.fillRect(x, pl.y + pl.h, 12, 240);
      ctx.fillStyle = '#9c7048';
      for (let x = pl.x; x < pl.x + pl.w; x += 26) ctx.fillRect(x, pl.y, 22, 4);
      continue;
    }
    if (pl.deco === 'roof') {
      // cave ceiling, hung with stalactites
      ctx.fillStyle = '#1c1226';
      ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
      ctx.fillStyle = '#2a1b34';
      const y0 = pl.y + pl.h;
      const from = Math.max(pl.x, G.camX - 80), to = Math.min(pl.x + pl.w, G.camX + W + 80);
      for (let x = Math.floor(from / 74) * 74; x < to; x += 74) {
        const len = 22 + ((x * 37) % 46);
        ctx.beginPath();
        ctx.moveTo(x, y0); ctx.lineTo(x + 15, y0); ctx.lineTo(x + 7, y0 + len);
        ctx.closePath(); ctx.fill();
      }
      continue;
    }
    if (pl.deco === 'shelf') {
      // rock shelf with a bright gold seam running through it
      ctx.fillStyle = '#33223d';
      roundRect(pl.x, pl.y, pl.w, pl.h + 12, 4); ctx.fill();
      ctx.fillStyle = '#453055';
      ctx.fillRect(pl.x, pl.y, pl.w, 5);
      ctx.strokeStyle = 'rgba(255,196,74,0.75)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pl.x + 8, pl.y + 10);
      ctx.lineTo(pl.x + pl.w * 0.4, pl.y + 7);
      ctx.lineTo(pl.x + pl.w * 0.7, pl.y + 12);
      ctx.lineTo(pl.x + pl.w - 8, pl.y + 8);
      ctx.stroke();
      continue;
    }
    if (pl.deco === 'rainbow') {
      const RB = ['#ff7b7b', '#ffb45e', '#ffe66d', '#7bdc8a', '#6ec5ff', '#c58cff'];
      const band = pl.h / RB.length;
      RB.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(pl.x, pl.y + i * band, pl.w, band + 0.6);
      });
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 3; i++) {
        const sx = pl.x + ((G.t * 40 + i * 45) % pl.w);
        sparkle(sx, pl.y - 6, 3);
      }
      continue;
    }
    // terrain block
    ctx.fillStyle = L.dirt;
    ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
    ctx.fillStyle = L.turf;
    ctx.fillRect(pl.x, pl.y, pl.w, 14);
    if (L.id === 'unicorn') {
      // candy-floss strata + sugar sparkles
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      for (let y = pl.y + 26; y < pl.y + pl.h; y += 34) ctx.fillRect(pl.x, y, pl.w, 9);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let x = pl.x + 24; x < pl.x + pl.w - 10; x += 78) {
        sparkle(x, pl.y + 7 + Math.sin(G.t * 2 + x) * 2, 3);
      }
    } else if (L.id === 'cave') {
      // living rock, threaded with gold and studded with raw gems
      const from = Math.max(pl.x, G.camX - 90), to = Math.min(pl.x + pl.w, G.camX + W + 90);
      ctx.fillStyle = '#241830';
      ctx.fillRect(pl.x, pl.y + 16, pl.w, pl.h - 16);
      ctx.fillStyle = '#3d2b46';
      ctx.fillRect(pl.x, pl.y, pl.w, 9);
      for (let x = Math.floor(from / 96) * 96; x < to; x += 96) {
        // gold seam
        ctx.strokeStyle = 'rgba(255,196,74,0.55)'; ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x, pl.y + 30);
        ctx.quadraticCurveTo(x + 30, pl.y + 18 + ((x * 13) % 22), x + 62, pl.y + 44);
        ctx.stroke();
        // embedded gem
        const gy = pl.y + 60 + ((x * 29) % 70);
        const tw = 0.35 + 0.4 * Math.abs(Math.sin(G.t * 1.3 + x * 0.01));
        ctx.fillStyle = (x / 96) % 2 ? `rgba(110,220,240,${tw})` : `rgba(200,140,255,${tw})`;
        ctx.beginPath();
        ctx.moveTo(x + 40, gy - 6); ctx.lineTo(x + 46, gy); ctx.lineTo(x + 40, gy + 6);
        ctx.lineTo(x + 34, gy); ctx.closePath(); ctx.fill();
        // stalagmite poking up off the floor
        if ((x * 7) % 3 === 0) {
          ctx.fillStyle = '#2f2039';
          const len = 20 + ((x * 17) % 28);
          ctx.beginPath();
          ctx.moveTo(x + 20, pl.y); ctx.lineTo(x + 34, pl.y); ctx.lineTo(x + 27, pl.y - len);
          ctx.closePath(); ctx.fill();
        }
      }
    } else if (L.id === 'street') {
      // asphalt with lane dashes
      ctx.fillStyle = '#2e3340';
      ctx.fillRect(pl.x, pl.y + 14, pl.w, pl.h - 14);
      ctx.fillStyle = '#ffd45e';
      for (let x = pl.x + 20; x < pl.x + pl.w - 40; x += 90) ctx.fillRect(x, pl.y + 46, 44, 6);
    } else {
      // dry-grass tufts
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let x = pl.x + 10; x < pl.x + pl.w - 10; x += 46) ctx.fillRect(x, pl.y + 10, 12, 4);
    }
  }
}

// ---- the ocean ---------------------------------------------------------------
// Trace the live swell across the visible span.
function traceSwell(L, from, to, step) {
  ctx.moveTo(from, waveY(L, from));
  for (let x = from + step; x <= to; x += step) ctx.lineTo(x, waveY(L, x));
  ctx.lineTo(to, waveY(L, to));
}

function drawOceanBody(L, cx) {
  const from = cx - 40, to = cx + W + 40, step = 10;
  const bottom = L.h + 120;

  const g = ctx.createLinearGradient(0, L.surfaceY - 90, 0, L.seabedY);
  g.addColorStop(0, 'rgba(86,196,238,0.80)');
  g.addColorStop(0.35, 'rgba(30,132,200,0.86)');
  g.addColorStop(1, 'rgba(10,48,104,0.94)');
  ctx.fillStyle = g;
  ctx.beginPath();
  traceSwell(L, from, to, step);
  ctx.lineTo(to, bottom); ctx.lineTo(from, bottom);
  ctx.closePath(); ctx.fill();

  // sunlit lip along the crest, plus foam where it is steepest
  ctx.strokeStyle = 'rgba(226,250,255,0.9)'; ctx.lineWidth = 4;
  ctx.beginPath(); traceSwell(L, from, to, step); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let x = from; x < to; x += 46) {
    const s = Math.abs(waveSlope(L, x));
    if (s > 0.12) {
      const y = waveY(L, x);
      ctx.beginPath();
      ctx.ellipse(x, y - 2, 16 + s * 26, 4 + s * 6, 0, 0, 7);
      ctx.fill();
    }
  }
  // slow light bands drifting under the surface
  ctx.strokeStyle = 'rgba(180,236,255,0.16)'; ctx.lineWidth = 3;
  for (let i = 0; i < 7; i++) {
    const off = ((i * 190 + G.t * 26) % (to - from + 400)) - 200;
    ctx.beginPath();
    ctx.moveTo(from + off, waveY(L, from + off) + 30);
    ctx.lineTo(from + off - 90, L.seabedY - 40);
    ctx.stroke();
  }
}

// The board only exists while you are actually riding.
function drawSurfboard(L) {
  // once you are up on the pier the board is under your arm, not your feet
  if (P.onGround && L.plats.some(p => p.deco === 'pier' &&
      P.x + P.w > p.x && P.x < p.x + p.w && Math.abs(P.y + P.h - p.y) < 5)) return;
  if (!P.onGround) {
    // still show it underfoot in the air, tilted into the launch
    if (P.y + P.h < waveY(L, P.x + P.w / 2) - 170) return;
  }
  const sl = waveSlope(L, P.x + P.w / 2);
  ctx.save();
  ctx.translate(P.x + 13, P.y + P.h + 2);
  ctx.rotate(clamp(sl, -0.6, 0.6) + (P.onGround ? 0 : 0.18 * P.facing));
  ctx.scale(P.facing, 1);
  ctx.fillStyle = '#fff6e8';
  ctx.beginPath(); ctx.ellipse(0, 0, 32, 6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#ff5b5b';
  ctx.beginPath(); ctx.ellipse(-4, -1, 22, 3, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#2e7cc4';
  ctx.beginPath();
  ctx.moveTo(-22, 2); ctx.lineTo(-30, 12); ctx.lineTo(-16, 4);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// A veil over everything below the surface, so being under it feels like it.
function drawUnderwaterTint(L, cx, cy) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-20, waveY(L, cx - 20) - cy);
  for (let sx = -20; sx <= W + 20; sx += 12) ctx.lineTo(sx, waveY(L, sx + cx) - cy);
  ctx.lineTo(W + 20, H + 20); ctx.lineTo(-20, H + 20);
  ctx.closePath();
  ctx.clip();

  const deep = clamp((P.y - L.surfaceY) / 520, 0, 1);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(30,130,200,0.14)');
  g.addColorStop(1, `rgba(4,26,72,${0.42 + deep * 0.24})`);
  ctx.fillStyle = g;
  ctx.fillRect(-20, -20, W + 40, H + 40);

  // shafts of light coming down through the swell
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const bx = ((i * 233 + G.t * 12 - cx * 0.4) % (W + 460)) - 230;
    const top = waveY(L, bx + cx) - cy;
    const gg = ctx.createLinearGradient(0, top, 0, top + 420);
    gg.addColorStop(0, 'rgba(190,240,255,0.16)');
    gg.addColorStop(1, 'rgba(190,240,255,0)');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.moveTo(bx - 26, top); ctx.lineTo(bx + 26, top);
    ctx.lineTo(bx + 96, top + 420); ctx.lineTo(bx - 60, top + 420);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // going under muffles the edges of the screen too
  if (SEA.sub) {
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.86);
    v.addColorStop(0, 'rgba(4,30,72,0)');
    v.addColorStop(1, 'rgba(4,26,66,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawWater(L, cx) {
  if (L.id !== 'shoreline') return;
  const wy = L.waterY || 735;
  ctx.fillStyle = 'rgba(48,130,190,0.9)';
  ctx.fillRect(cx - 20, wy, W + 40, 80);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let x = cx - 20; x < cx + W + 20; x += 60) {
    const y = wy + 3 + Math.sin(x * 0.05 + G.t * 3) * 3;
    ctx.fillRect(x, y, 30, 3);
  }
}

// ---- the cave ----------------------------------------------------------------
function drawTorch(t) {
  if (t.x < G.camX - 60 || t.x > G.camX + W + 60) return;
  const f = Math.sin(G.t * 9 + t.phase);
  ctx.fillStyle = '#4a3524';
  ctx.fillRect(t.x - 3, t.y, 6, 26);
  ctx.fillStyle = '#2a1c14';
  ctx.fillRect(t.x - 6, t.y + 22, 12, 6);
  // flame
  const h = 20 + f * 4;
  ctx.fillStyle = '#ff7a1e';
  ctx.beginPath();
  ctx.moveTo(t.x - 7, t.y + 2);
  ctx.quadraticCurveTo(t.x + f * 2, t.y - h, t.x + 7, t.y + 2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffd45e';
  ctx.beginPath();
  ctx.moveTo(t.x - 4, t.y + 2);
  ctx.quadraticCurveTo(t.x + f * 1.5, t.y - h * 0.6, t.x + 4, t.y + 2);
  ctx.closePath(); ctx.fill();
  if (Math.random() < 0.10) {
    G.particles.push({
      x: t.x, y: t.y - 12, vx: (Math.random() - 0.5) * 26, vy: -40 - Math.random() * 40,
      life: 0.7, c: '#ff9a3c', s: 2, g: -20,
    });
  }
}

// A black overlay with holes punched in it: your lantern and the torches.
// Built offscreen so it never eats the world.
let darkCv = null, darkCx = null;
function drawDarkness(L, cx, cy) {
  if (!darkCv) {
    darkCv = document.createElement('canvas');
    darkCv.width = W; darkCv.height = H;
    darkCx = darkCv.getContext('2d');
  }
  const d = darkCx;
  d.globalCompositeOperation = 'source-over';
  // the closer the dragon is to waking, the redder and tighter the dark gets
  const rage = D.active ? D.alert : 0;
  d.fillStyle = `rgba(${(6 + rage * 52) | 0},${3 + rage * 2 | 0},${(14 - rage * 6) | 0},${0.88 + rage * 0.04})`;
  d.clearRect(0, 0, W, H);
  d.fillRect(0, 0, W, H);

  d.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r, soft) => {
    if (x < -r || x > W + r || y < -r || y > H + r) return;
    const g = d.createRadialGradient(x, y, r * 0.12, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${soft ?? 1})`);
    g.addColorStop(0.55, `rgba(0,0,0,${(soft ?? 1) * 0.55})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = g;
    d.beginPath(); d.arc(x, y, r, 0, 7); d.fill();
  };

  // your own lantern, guttering slightly
  const flick = 1 + Math.sin(G.t * 11) * 0.02 + Math.sin(G.t * 3.3) * 0.03;
  hole(P.x + 13 - cx, P.y + 23 - cy, 300 * flick * (1 - rage * 0.22));
  // a dimmer, wider halo so you can still read the jump in front of you
  hole(P.x + 13 - cx, P.y + 23 - cy, 470 * flick, 0.34);
  for (const t of L.torches) hole(t.x - cx, t.y - cy + 4, 132 + Math.sin(G.t * 9 + t.phase) * 8, 0.95);
  if (L.dragon) {
    // the hoard glows all on its own
    hole(L.dragon.x + L.dragon.w / 2 - cx, L.dragon.y + L.dragon.h - 30 - cy, 300, 0.9);
  }
  const goal = L.ents.find(e => e.type === 'goal');
  if (goal) hole(goal.x + goal.w / 2 - cx, goal.y + goal.h / 2 - cy, 170, 0.92);

  d.globalCompositeOperation = 'source-over';
  ctx.drawImage(darkCv, 0, 0);
}

function drawOak(hz) {
  ctx.fillStyle = '#4c7a35';
  ctx.beginPath();
  ctx.ellipse(hz.x + hz.w / 2, hz.y + hz.h, hz.w / 2, hz.h, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#c0453a';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(hz.x + 10 + i * (hz.w - 20) / 4, hz.y + 8 + (i % 2) * 6, 4, 0, 7);
    ctx.fill();
  }
}

// ---- entity sprites --------------------------------------------------------
function drawEntity(e) {
  switch (e.type) {
    case 'rsu': drawRSU(e); break;
    case 'coffee': drawCoffee(e); break;
    case 'boba': drawBoba(e); break;
    case 'onewheel': drawOnewheel(e); break;
    case 'headphones': drawHeadphones(e); break;
    case 'burrito': drawBurrito(e); break;
    case 'money': drawMoney(e); break;
    case 'checkpoint': drawCheckpoint(e); break;
    case 'goose': drawGoose(e); break;
    case 'snake': drawSnake(e); break;
    case 'scooter': drawScooter(e); break;
    case 'pixie': drawPixie(e); break;
    case 'bounce': drawBounce(e); break;
    case 'star': drawStar(e); break;
    case 'kitten': drawKitten(e); break;
    case 'shark': drawShark(e); break;
    case 'dolphin': drawDolphin(e); break;
    case 'jelly': drawJelly(e); break;
    case 'airbubble': drawAirBubble(e); break;
    case 'kelp': drawKelp(e); break;
    case 'chest': drawChest(e); break;
    case 'bat': drawBat(e); break;
    case 'spider': drawSpider(e); break;
    case 'gold': drawGold(e); break;
    case 'bubble': drawBubble(e); break;
    case 'butterfly': drawButterfly(e); break;
    case 'unicorn': drawUnicorn(e); break;
    case 'goal': drawGoal(e); break;
  }
}

function drawRSU(e) {
  const y = e.y + Math.sin(G.t * 3 + e.bob) * 5;
  ctx.save();
  ctx.translate(e.x + 11, y + 11);
  ctx.rotate(Math.sin(G.t * 2 + e.bob) * 0.2);
  ctx.fillStyle = '#59e0e8';
  ctx.beginPath();
  ctx.moveTo(0, -11); ctx.lineTo(9, 0); ctx.lineTo(0, 11); ctx.lineTo(-9, 0);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 0); ctx.lineTo(0, 3); ctx.lineTo(-3, 0); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawCoffee(e) {
  ctx.fillStyle = '#f4ede2';
  ctx.fillRect(e.x, e.y + 6, 20, 20);
  ctx.fillStyle = '#6b4226';
  ctx.fillRect(e.x + 2, e.y + 9, 16, 6);
  ctx.fillStyle = '#e0d5c5';
  ctx.fillRect(e.x - 2, e.y, 24, 6);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
  const w = Math.sin(G.t * 4) * 2;
  ctx.beginPath(); ctx.moveTo(e.x + 7, e.y - 2); ctx.quadraticCurveTo(e.x + 7 + w, e.y - 8, e.x + 7, e.y - 13); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(e.x + 13, e.y - 2); ctx.quadraticCurveTo(e.x + 13 - w, e.y - 8, e.x + 13, e.y - 13); ctx.stroke();
}

function drawBoba(e) {
  const y = e.y + Math.sin(G.t * 3) * 3;
  ctx.fillStyle = 'rgba(240,190,255,0.9)';
  roundRect(e.x, y + 6, 18, 22, 6); ctx.fill();
  ctx.fillStyle = '#5a3a20';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath(); ctx.arc(e.x + 4 + (i % 3) * 5, y + 22 + ((i / 3) | 0) * 4, 2, 0, 7); ctx.fill();
  }
  ctx.fillStyle = '#ff79b0';
  ctx.fillRect(e.x + 7, y - 4, 4, 14);
}

function drawOnewheel(e) {
  const y = e.y + Math.sin(G.t * 3 + 1) * 3;
  ctx.fillStyle = '#2b3442';
  ctx.fillRect(e.x, y + 8, 28, 5);
  ctx.fillStyle = '#ffd45e';
  ctx.beginPath(); ctx.arc(e.x + 14, y + 13, 8, 0, 7); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(e.x + 14, y + 13, 4, 0, 7); ctx.fill();
}

function drawHeadphones(e) {
  const y = e.y + Math.sin(G.t * 3 + 2) * 3;
  ctx.strokeStyle = '#f0f2f6'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(e.x + 13, y + 14, 10, Math.PI, 0); ctx.stroke();
  ctx.fillStyle = '#f0f2f6';
  roundRect(e.x, y + 10, 8, 12, 3); ctx.fill();
  roundRect(e.x + 18, y + 10, 8, 12, 3); ctx.fill();
}

function drawBurrito(e) {
  const y = e.y + Math.sin(G.t * 3 + 3) * 3;
  ctx.save();
  ctx.translate(e.x + 11, y + 8);
  ctx.rotate(-0.5);
  ctx.fillStyle = '#c9ccd6';
  roundRect(-11, -6, 22, 12, 6); ctx.fill();
  ctx.fillStyle = '#e8d5a0';
  ctx.beginPath(); ctx.arc(9, 0, 5, 0, 7); ctx.fill();
  ctx.fillStyle = '#4c7a35';
  ctx.beginPath(); ctx.arc(10, -2, 1.5, 0, 7); ctx.fill();
  ctx.restore();
}

function drawMoney(e) {
  const y = e.y + Math.sin(G.t * 3 + 4) * 3;
  ctx.fillStyle = '#2c8a4f';
  ctx.beginPath();
  ctx.moveTo(e.x + 12, y);
  ctx.quadraticCurveTo(e.x + 26, y + 8, e.x + 22, y + 20);
  ctx.quadraticCurveTo(e.x + 12, y + 28, e.x + 2, y + 20);
  ctx.quadraticCurveTo(e.x - 2, y + 8, e.x + 12, y);
  ctx.fill();
  ctx.fillStyle = '#ffd45e'; ctx.font = 'bold 13px Trebuchet MS';
  ctx.fillText('$', e.x + 8, y + 18);
}

function drawPixie(e) {
  const cx = e.x + 14, cy = e.y + 14;
  const flap = Math.sin(G.t * 18) * 0.5;
  // wings
  ctx.fillStyle = 'rgba(200,235,255,0.75)';
  ctx.save(); ctx.translate(cx, cy);
  ctx.rotate(-0.5 + flap);
  ctx.beginPath(); ctx.ellipse(-9, -5, 10, 5, 0, 0, 7); ctx.fill();
  ctx.rotate(1.0 - flap * 2);
  ctx.beginPath(); ctx.ellipse(9, -5, 10, 5, 0, 0, 7); ctx.fill();
  ctx.restore();
  // body + head
  ctx.fillStyle = '#b98cff';
  ctx.beginPath(); ctx.ellipse(cx, cy + 4, 8, 9, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffe0c2';
  ctx.beginPath(); ctx.arc(cx, cy - 7, 7, 0, 7); ctx.fill();
  ctx.fillStyle = '#6a4aa8';
  ctx.beginPath(); ctx.arc(cx, cy - 10, 7, Math.PI, 0); ctx.fill();
  // cheeky face
  ctx.fillStyle = '#333';
  ctx.beginPath(); ctx.arc(cx - 3, cy - 7, 1.4, 0, 7); ctx.arc(cx + 3, cy - 7, 1.4, 0, 7); ctx.fill();
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(cx, cy - 4, 2.5, 0.2, Math.PI - 0.2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,160,200,0.5)';
  ctx.beginPath(); ctx.arc(cx - 5, cy - 4, 2, 0, 7); ctx.arc(cx + 5, cy - 4, 2, 0, 7); ctx.fill();
}

function drawBounce(e) {
  const sq = e.squash || 0;
  const h = e.h * (1 - sq * 0.42);
  const w = e.w * (1 + sq * 0.3);
  const bx = e.x + e.w / 2, by = e.y + e.h;
  // stalk
  ctx.fillStyle = '#fff2f8';
  ctx.fillRect(bx - 7, by - h * 0.4, 14, h * 0.4);
  // cap
  ctx.fillStyle = '#ff6ea8';
  ctx.beginPath();
  ctx.ellipse(bx, by - h * 0.4, w / 2, h * 0.62, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (const [dx, dy, r] of [[-11, -8, 4], [4, -13, 5], [14, -6, 3.5]]) {
    ctx.beginPath(); ctx.arc(bx + dx, by - h * 0.4 + dy, r, 0, 7); ctx.fill();
  }
  if (sq > 0.05) {
    ctx.fillStyle = `rgba(255,255,255,${sq})`;
    sparkle(bx, by - h - 12, 6 * sq + 3);
  }
}

function drawStar(e) {
  const cx = e.x + 13, cy = e.y + 13 + Math.sin(G.t * 3 + e.bob) * 4;
  const spin = G.t * 1.6 + e.bob;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(spin);
  ctx.fillStyle = '#ffe66d';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 13 : 5.5;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    i === 0 ? ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
            : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff8c4';
  ctx.beginPath(); ctx.arc(-2, -2, 3.5, 0, 7); ctx.fill();
  ctx.restore();
  ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.4 * Math.sin(G.t * 4 + e.bob)})`;
  sparkle(cx + 14, cy - 12, 4);
}

function drawShark(e) {
  const L = G.level;
  ctx.save();
  ctx.translate(e.x + 36, e.y + 15);
  ctx.scale(e.dir >= 0 ? 1 : -1, 1);
  const hunt = e.lunge > 0.35;
  // tail
  ctx.fillStyle = '#5a6d80';
  const sw = Math.sin(G.t * (hunt ? 14 : 7) + e.bob) * 7;
  ctx.beginPath();
  ctx.moveTo(-28, 0); ctx.lineTo(-44, -14 + sw); ctx.lineTo(-38, 0); ctx.lineTo(-44, 14 + sw);
  ctx.closePath(); ctx.fill();
  // body
  const g = ctx.createLinearGradient(0, -14, 0, 15);
  g.addColorStop(0, '#7e91a4');
  g.addColorStop(0.55, '#5c7086');
  g.addColorStop(1, '#e6ecf2');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-30, 0);
  ctx.quadraticCurveTo(-6, -15, 30, -5);
  ctx.quadraticCurveTo(36, 0, 30, 6);
  ctx.quadraticCurveTo(-6, 15, -30, 0);
  ctx.closePath(); ctx.fill();
  // pectoral fin + dorsal
  ctx.fillStyle = '#4f6377';
  ctx.beginPath(); ctx.moveTo(2, 5); ctx.lineTo(-6, 20); ctx.lineTo(12, 8); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-4, -10); ctx.lineTo(2, -30); ctx.lineTo(14, -7); ctx.closePath(); ctx.fill();
  // business end
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(30, 3);
  for (let i = 0; i < 5; i++) ctx.lineTo(24 - i * 5, 8 + (i % 2 ? 0 : 3));
  ctx.lineTo(24, 3);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = hunt ? '#ff3a3a' : '#16202c';
  ctx.beginPath(); ctx.arc(19, -4, 2.6, 0, 7); ctx.fill();
  ctx.fillStyle = '#3d4d5c';
  for (let i = 0; i < 3; i++) ctx.fillRect(6 + i * 4, -2, 1.6, 8);
  ctx.restore();

  // the fin, if it is riding the surface
  if (!e.deep) {
    const sy = waveY(L, e.x + 36);
    if (e.y + 15 > sy) {
      ctx.fillStyle = '#4f6377';
      ctx.beginPath();
      ctx.moveTo(e.x + 30, sy + 2);
      ctx.lineTo(e.x + 40, sy - 26);
      ctx.lineTo(e.x + 52, sy + 2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.x + 22, sy + 4);
      ctx.quadraticCurveTo(e.x + 40, sy + 10, e.x + 60, sy + 4);
      ctx.stroke();
    }
  }
}

function drawDolphin(e) {
  ctx.save();
  ctx.translate(e.x + 39, e.y + 17);
  const tilt = Math.cos(e.arc) * (e.air ? 0.5 : 0.15);
  ctx.rotate(-tilt);
  ctx.scale(1, 1 - e.squash * 0.25);
  const g = ctx.createLinearGradient(0, -18, 0, 18);
  g.addColorStop(0, '#8fb6d8');
  g.addColorStop(0.55, '#5c8fc0');
  g.addColorStop(1, '#eaf4fb');
  ctx.fillStyle = g;
  // body
  ctx.beginPath();
  ctx.moveTo(-34, 0);
  ctx.quadraticCurveTo(-8, -17, 26, -7);
  ctx.quadraticCurveTo(40, -3, 38, 3);
  ctx.quadraticCurveTo(30, 8, 24, 7);
  ctx.quadraticCurveTo(-8, 16, -34, 0);
  ctx.closePath(); ctx.fill();
  // flukes
  ctx.fillStyle = '#5c8fc0';
  const fl = Math.sin(G.t * 9) * 6;
  ctx.beginPath();
  ctx.moveTo(-30, 0); ctx.lineTo(-46, -10 + fl); ctx.lineTo(-38, 0); ctx.lineTo(-46, 10 + fl);
  ctx.closePath(); ctx.fill();
  // dorsal + flipper
  ctx.beginPath(); ctx.moveTo(-6, -11); ctx.lineTo(0, -27); ctx.lineTo(11, -8); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(2, 6); ctx.lineTo(-8, 20); ctx.lineTo(11, 9); ctx.closePath(); ctx.fill();
  // very pleased with itself
  ctx.fillStyle = '#16202c';
  ctx.beginPath(); ctx.arc(23, -5, 2.4, 0, 7); ctx.fill();
  ctx.strokeStyle = '#16202c'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(26, 0, 5, -0.2, 1.0); ctx.stroke();
  ctx.restore();
  if (e.squash > 0.1) {
    ctx.fillStyle = `rgba(255,255,255,${e.squash * 0.7})`;
    sparkle(e.x + 39, e.y - 10, 10);
  }
}

function drawJelly(e) {
  const pulse = 1 + Math.sin(G.t * 2.6 + e.phase) * 0.14;
  ctx.save();
  ctx.translate(e.x + 15, e.y + 14);
  ctx.fillStyle = 'rgba(226,150,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 15 * pulse, 13 / pulse, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,210,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(0, -2, 9 * pulse, 7 / pulse, 0, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(232,170,255,0.65)'; ctx.lineWidth = 2;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 5, 0);
    ctx.quadraticCurveTo(i * 6 + Math.sin(G.t * 3 + i) * 5, 14, i * 5 + Math.sin(G.t * 2.2 + i) * 7, 30);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAirBubble(e) {
  const y = e.y + Math.sin(G.t * 3 + e.phase) * 3;
  const g = ctx.createRadialGradient(e.x + 9, y + 8, 1, e.x + 13, y + 13, 13);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.6, 'rgba(200,240,255,0.35)');
  g.addColorStop(1, 'rgba(150,215,255,0.55)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(e.x + 13, y + 13, 13, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(e.x + 13, y + 13, 13, 0, 7); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath(); ctx.ellipse(e.x + 8, y + 8, 3, 2, -0.6, 0, 7); ctx.fill();
}

function drawKelp(e) {
  ctx.strokeStyle = 'rgba(38,104,62,0.85)';
  ctx.lineWidth = 7;
  const sway = Math.sin(G.t * 0.9 + e.phase) * 26;
  ctx.beginPath();
  ctx.moveTo(e.x + 17, e.y + e.h);
  ctx.quadraticCurveTo(e.x + 17 + sway * 0.4, e.y + e.h * 0.5, e.x + 17 + sway, e.y);
  ctx.stroke();
  ctx.fillStyle = 'rgba(58,138,80,0.85)';
  for (let i = 1; i <= 5; i++) {
    const t = i / 6;
    const lx = e.x + 17 + sway * t * t;
    const ly = e.y + e.h * (1 - t);
    ctx.beginPath();
    ctx.ellipse(lx + (i % 2 ? 12 : -12), ly, 13, 5, i % 2 ? 0.4 : -0.4, 0, 7);
    ctx.fill();
  }
}

function drawChest(e) {
  ctx.fillStyle = '#7a4f2a';
  roundRect(e.x, e.y + 12, 44, 22, 3); ctx.fill();
  ctx.fillStyle = '#8f5f33';
  ctx.beginPath();
  ctx.moveTo(e.x, e.y + 12);
  ctx.quadraticCurveTo(e.x + 22, e.y - 6, e.x + 44, e.y + 12);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffc44a';
  ctx.fillRect(e.x - 1, e.y + 10, 46, 4);
  ctx.fillRect(e.x + 19, e.y + 8, 6, 12);
  ctx.fillStyle = `rgba(255,240,170,${0.35 + 0.35 * Math.sin(G.t * 2.5 + e.x)})`;
  sparkle(e.x + 40, e.y + 2, 5);
  sparkle(e.x + 4, e.y + 6, 4);
}

function drawBat(e) {
  const cx = e.x + 15, cy = e.y + 10;
  const swoop = e.mode === 'swoop';
  const flap = Math.sin(G.t * (swoop ? 26 : 9) + e.phase);
  ctx.save();
  ctx.translate(cx, cy);
  // wings
  ctx.fillStyle = swoop ? '#4a2036' : '#3a1b2c';
  for (const s of [-1, 1]) {
    ctx.save(); ctx.scale(s, 1);
    ctx.beginPath();
    ctx.moveTo(3, -1);
    ctx.quadraticCurveTo(14, -8 + flap * 7, 25, -2 + flap * 9);
    ctx.lineTo(20, 3 + flap * 6);
    ctx.quadraticCurveTo(15, 1 + flap * 4, 12, 5 + flap * 3);
    ctx.quadraticCurveTo(9, 2 + flap * 2, 3, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // body + ears
  ctx.fillStyle = '#553049';
  ctx.beginPath(); ctx.ellipse(0, 0, 7, 8, 0, 0, 7); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-5, -6); ctx.lineTo(-7, -14); ctx.lineTo(-1, -8); ctx.closePath(); ctx.fill();
  ctx.moveTo(5, -6); ctx.lineTo(7, -14); ctx.lineTo(1, -8); ctx.closePath(); ctx.fill();
  // eyes — red and much too interested in you
  ctx.fillStyle = swoop ? '#ff3a3a' : '#ff8a5e';
  ctx.beginPath(); ctx.arc(-2.5, -1, 1.8, 0, 7); ctx.arc(2.5, -1, 1.8, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(-2, 3, 1.5, 2.5); ctx.fillRect(1, 3, 1.5, 2.5); // little fangs
  ctx.restore();
}

function drawSpider(e) {
  const cx = e.x + 13, cy = e.y + 11;
  if (e.mode === 'drop') {
    // silk thread all the way back up to the ceiling
    ctx.strokeStyle = 'rgba(220,220,235,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, e.topY); ctx.lineTo(cx, cy); ctx.stroke();
  }
  const scut = e.mode === 'crawl' ? Math.sin(G.t * 12) * 2 : Math.sin(G.t * 5) * 1.2;
  ctx.save();
  ctx.translate(cx, cy);
  // legs
  ctx.strokeStyle = '#191320'; ctx.lineWidth = 2;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const a = (-0.75 + i * 0.42) + scut * 0.05 * (i % 2 ? 1 : -1);
      ctx.beginPath();
      ctx.moveTo(s * 4, -1);
      ctx.quadraticCurveTo(s * (13 + i), -9 + i * 3, s * (16 + i * 1.5), 3 + i * 2.5 + Math.sin(a) * 3);
      ctx.stroke();
    }
  }
  // abdomen + head
  ctx.fillStyle = '#211826';
  ctx.beginPath(); ctx.ellipse(0, 2, 9, 8, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#2e2136';
  ctx.beginPath(); ctx.arc(0, -6, 5.5, 0, 7); ctx.fill();
  // hourglass marking
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.moveTo(-3, -1); ctx.lineTo(3, -1); ctx.lineTo(0, 3);
  ctx.lineTo(3, 7); ctx.lineTo(-3, 7); ctx.lineTo(0, 3);
  ctx.closePath(); ctx.fill();
  // far too many eyes
  ctx.fillStyle = '#ffd45e';
  for (const [ox, oy, r] of [[-3, -8, 1.5], [3, -8, 1.5], [-1.5, -5, 1], [1.5, -5, 1]]) {
    ctx.beginPath(); ctx.arc(ox, oy, r, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function drawGold(e) {
  const y = e.y + Math.sin(G.t * 2 + e.bob) * 2;
  const g = ctx.createLinearGradient(e.x, y, e.x, y + 20);
  g.addColorStop(0, '#ffe89a');
  g.addColorStop(0.5, '#ffc44a');
  g.addColorStop(1, '#c98a1e');
  ctx.fillStyle = g;
  // a little stack of ingots
  ctx.beginPath();
  ctx.moveTo(e.x + 3, y + 20); ctx.lineTo(e.x + 23, y + 20);
  ctx.lineTo(e.x + 26, y + 12); ctx.lineTo(e.x, y + 12);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(e.x + 6, y + 12); ctx.lineTo(e.x + 20, y + 12);
  ctx.lineTo(e.x + 22, y + 5); ctx.lineTo(e.x + 4, y + 5);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillRect(e.x + 7, y + 6, 8, 2);
  ctx.fillStyle = `rgba(255,240,170,${0.4 + 0.4 * Math.sin(G.t * 3 + e.bob)})`;
  sparkle(e.x + 24, y + 2, 4);
}

// The dragon. Enormous, asleep, and an extremely light sleeper.
function drawDragon(L) {
  const dg = L.dragon;
  if (dg.x + dg.w < G.camX - 300 || dg.x > G.camX + W + 300) return;
  const bx = dg.x, bw = dg.w, baseY = dg.y + dg.h;
  const breathe = Math.sin(G.t * 0.9) * 4;
  const lunge = D.state === 'lunge' ? 1 - D.lungeT / 0.55 : 0;
  const lift = D.state === 'stirring' ? 16 : D.state === 'waking' ? 48 : 0;

  // ---- the hoard it is lying on
  ctx.fillStyle = '#b8860f';
  ctx.beginPath();
  ctx.moveTo(bx - 60, baseY);
  ctx.quadraticCurveTo(bx + bw * 0.5, baseY - 96, bx + bw + 60, baseY);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffc44a';
  for (let i = 0; i < 26; i++) {
    const hx = bx - 40 + (i * 137) % (bw + 80);
    const hy = baseY - 6 - ((i * 53) % 62);
    ctx.beginPath(); ctx.arc(hx, hy, 4 + (i % 3), 0, 7); ctx.fill();
  }

  ctx.save();
  ctx.translate(0, breathe);

  // ---- tail, curling away to the right
  ctx.strokeStyle = '#2f6b4a'; ctx.lineWidth = 26;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(bx + bw - 60, baseY - 60);
  ctx.quadraticCurveTo(bx + bw + 70, baseY - 90, bx + bw + 40, baseY - 8);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // ---- body
  const bg = ctx.createLinearGradient(0, baseY - 190, 0, baseY);
  bg.addColorStop(0, '#3f8a5e');
  bg.addColorStop(1, '#1e4a35');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.ellipse(bx + bw * 0.58, baseY - 70, bw * 0.36, 74, 0, 0, 7);
  ctx.fill();

  // ---- folded wing
  ctx.fillStyle = '#25573d';
  ctx.beginPath();
  ctx.moveTo(bx + bw * 0.48, baseY - 120);
  ctx.quadraticCurveTo(bx + bw * 0.74, baseY - 210 - lift * 0.4, bx + bw * 0.94, baseY - 128);
  ctx.quadraticCurveTo(bx + bw * 0.72, baseY - 118, bx + bw * 0.48, baseY - 120);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#17402b'; ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(bx + bw * 0.5, baseY - 122);
    ctx.lineTo(bx + bw * (0.55 + i * 0.11), baseY - 150 - i * 12 - lift * 0.3);
    ctx.stroke();
  }

  // ---- spines down the back
  ctx.fillStyle = '#8fd66e';
  for (let i = 0; i < 7; i++) {
    const sx = bx + bw * 0.34 + i * 34;
    const sy = baseY - 130 - Math.sin(i / 6 * Math.PI) * 22;
    ctx.beginPath();
    ctx.moveTo(sx - 9, sy + 14); ctx.lineTo(sx, sy - 14); ctx.lineTo(sx + 9, sy + 14);
    ctx.closePath(); ctx.fill();
  }

  // ---- neck and head, reaching left toward the path
  const hx = bx + 76 - lunge * 210;
  const hy = baseY - 54 - lift - lunge * 8;
  ctx.strokeStyle = '#357a52'; ctx.lineWidth = 46;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(bx + bw * 0.42, baseY - 96);
  ctx.quadraticCurveTo(bx + 150, baseY - 96 - lift * 0.8, hx + 30, hy + 8);
  ctx.stroke();
  ctx.lineCap = 'butt';

  ctx.save();
  ctx.translate(hx, hy);
  // jaw — hinges open as it lunges
  const jaw = lunge * 0.55 + (D.state === 'waking' ? 0.08 : 0);
  ctx.fillStyle = '#2b6644';
  ctx.save(); ctx.rotate(jaw);
  ctx.beginPath();
  ctx.moveTo(-4, 6); ctx.lineTo(-46, 16); ctx.lineTo(-46, 26); ctx.lineTo(-2, 22);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(-10 - i * 8, 16); ctx.lineTo(-14 - i * 8, 8); ctx.lineTo(-18 - i * 8, 17);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // upper skull + snout
  ctx.fillStyle = '#3f8a5e';
  ctx.beginPath();
  ctx.moveTo(14, -18); ctx.lineTo(-50, 2); ctx.lineTo(-48, 14); ctx.lineTo(10, 16);
  ctx.quadraticCurveTo(26, 10, 22, -12);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(-12 - i * 8, 12); ctx.lineTo(-16 - i * 8, 21); ctx.lineTo(-20 - i * 8, 12);
    ctx.closePath(); ctx.fill();
  }
  // horns
  ctx.fillStyle = '#e8dfc0';
  ctx.beginPath(); ctx.moveTo(12, -16); ctx.lineTo(40, -46); ctx.lineTo(20, -12); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(2, -16); ctx.lineTo(20, -44); ctx.lineTo(10, -12); ctx.closePath(); ctx.fill();
  // the eye — everything about this level is really about the eye
  const open = D.state === 'asleep' ? 0
             : D.state === 'stirring' ? 0.35
             : D.state === 'waking' ? 0.8 : 1;
  if (open <= 0.01) {
    ctx.strokeStyle = '#1d4732'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(-8, -2, 7, 0.15, Math.PI - 0.15); ctx.stroke();
  } else {
    ctx.fillStyle = `rgba(255,${190 - open * 150 | 0},40,${0.55 + open * 0.45})`;
    ctx.beginPath(); ctx.ellipse(-8, -3, 9, 4 + open * 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#160c04';
    ctx.beginPath(); ctx.ellipse(-8, -3, 2.6, 3 + open * 5, 0, 0, 7); ctx.fill();
  }
  // nostril smoke while it sleeps
  if (D.breath > 0 && Math.random() < 0.5) {
    G.particles.push({
      x: hx - 44, y: hy + 8, vx: -34 - Math.random() * 26, vy: -16 - Math.random() * 18,
      life: 1.1, c: 'rgba(180,180,190,0.8)', s: 4, g: -14,
    });
  }
  ctx.restore();
  ctx.restore();

  // sleepy Zs — the only friendly thing down here
  if (D.state === 'asleep') {
    ctx.fillStyle = 'rgba(180,220,200,0.55)';
    ctx.font = 'bold 20px Trebuchet MS';
    for (let i = 0; i < 3; i++) {
      const p = (G.t * 0.35 + i * 0.33) % 1;
      ctx.globalAlpha = (1 - p) * 0.7;
      ctx.fillText('z', bx + 40 - p * 40, baseY - 130 - p * 70);
    }
    ctx.globalAlpha = 1;
  }
}

function drawKitten(e) {
  const bx = e.x + 14, by = e.y + 24 + Math.sin(G.t * 2 + e.bob) * 2;
  ctx.save();
  ctx.translate(bx, by);
  // swishy tail
  ctx.strokeStyle = '#ffb37a'; ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-9, -6);
  ctx.quadraticCurveTo(-19, -10 + Math.sin(G.t * 4 + e.bob) * 5, -16, -20 + Math.sin(G.t * 4 + e.bob) * 4);
  ctx.stroke();
  // body + head
  ctx.fillStyle = '#ffc796';
  ctx.beginPath(); ctx.ellipse(0, -7, 11, 7, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(4, -17, 8, 0, 7); ctx.fill();
  // ears
  ctx.beginPath();
  ctx.moveTo(-2, -23); ctx.lineTo(-1, -31); ctx.lineTo(4, -25); ctx.closePath(); ctx.fill();
  ctx.moveTo(8, -25); ctx.lineTo(12, -31); ctx.lineTo(12, -23); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ff9ec4';
  ctx.beginPath();
  ctx.moveTo(-0.5, -25); ctx.lineTo(0, -29); ctx.lineTo(3, -26); ctx.closePath(); ctx.fill();
  // stripes
  ctx.strokeStyle = '#e89a5e'; ctx.lineWidth = 1.6;
  for (const sx of [-6, -2, 2]) {
    ctx.beginPath(); ctx.moveTo(sx, -12); ctx.lineTo(sx + 2, -6); ctx.stroke();
  }
  // face
  ctx.fillStyle = '#333';
  ctx.beginPath(); ctx.arc(1, -18, 1.6, 0, 7); ctx.arc(8, -18, 1.6, 0, 7); ctx.fill();
  ctx.fillStyle = '#ff7ba8';
  ctx.beginPath(); ctx.arc(4.5, -14.5, 1.5, 0, 7); ctx.fill();
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(4.5, -13.5); ctx.lineTo(4.5, -12); ctx.stroke();
  ctx.beginPath(); ctx.arc(2.5, -12, 2, 0, Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(6.5, -12, 2, 0, Math.PI); ctx.stroke();
  // whiskers
  ctx.strokeStyle = 'rgba(80,60,50,0.6)';
  ctx.beginPath(); ctx.moveTo(-2, -15); ctx.lineTo(-9, -16); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(11, -15); ctx.lineTo(18, -16); ctx.stroke();
  // paws
  ctx.fillStyle = '#ffdcb8';
  ctx.beginPath(); ctx.ellipse(-4, -1, 4, 2.5, 0, 0, 7); ctx.ellipse(5, -1, 4, 2.5, 0, 0, 7); ctx.fill();
  ctx.restore();
  ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.35 * Math.sin(G.t * 4 + e.bob)})`;
  sparkle(bx + 17, by - 30, 4);
}

function drawBubble(e) {
  const cx = e.x + 23, cy = e.y + 23;
  const r = 22 * (1 - e.pop * 0.15);
  const g = ctx.createRadialGradient(cx - 6, cy - 8, 2, cx, cy, r);
  g.addColorStop(0, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.5, 'rgba(190,235,255,0.30)');
  g.addColorStop(1, 'rgba(255,190,235,0.42)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.ellipse(cx - 7, cy - 9, 4.5, 3, -0.6, 0, 7); ctx.fill();
}

function drawButterfly(e) {
  const cx = e.x + 9, cy = e.y + 7;
  const flap = Math.abs(Math.sin(G.t * 9 + e.phase));
  const ww = 3 + flap * 8;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(255,150,205,0.9)';
  ctx.beginPath(); ctx.ellipse(-ww, -3, ww, 6, -0.3, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(180,200,255,0.9)';
  ctx.beginPath(); ctx.ellipse(ww, -3, ww, 6, 0.3, 0, 7); ctx.fill();
  ctx.fillStyle = '#6a4a68';
  ctx.fillRect(-1.5, -6, 3, 11);
  ctx.strokeStyle = '#6a4a68'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-1, -6); ctx.lineTo(-4, -11); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(1, -6); ctx.lineTo(4, -11); ctx.stroke();
  ctx.restore();
}

function drawFoal() {
  if (!F.active) return;
  const hop = Math.abs(Math.sin(F.hop)) * 7;
  ctx.save();
  ctx.translate(F.x + 13, F.y + 46 - hop);
  ctx.scale(F.facing, 1);
  const RB = ['#ff7b7b', '#ffe66d', '#7bdc8a', '#6ec5ff', '#c58cff'];
  // tail
  RB.forEach((c, i) => {
    ctx.strokeStyle = c; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-9, -20);
    ctx.quadraticCurveTo(-15 - i, -16 + i, -13 - i, -6 + Math.sin(G.t * 4 + i) * 1.5);
    ctx.stroke();
  });
  // body, legs
  ctx.fillStyle = '#fffafd';
  ctx.beginPath(); ctx.ellipse(0, -19, 14, 9, 0, 0, 7); ctx.fill();
  for (const lx of [-8, -2, 4, 9]) ctx.fillRect(lx, -12, 3.5, 12);
  ctx.fillStyle = '#ffd9e8';
  for (const lx of [-8, -2, 4, 9]) ctx.fillRect(lx, -3, 3.5, 3);
  // head
  ctx.fillStyle = '#fffafd';
  ctx.beginPath(); ctx.ellipse(13, -30, 8, 6, -0.3, 0, 7); ctx.fill();
  ctx.fillRect(6, -30, 8, 12);
  // little horn + mane
  ctx.fillStyle = '#ffd45e';
  ctx.beginPath();
  ctx.moveTo(13, -36); ctx.lineTo(16, -46); ctx.lineTo(18, -35); ctx.closePath(); ctx.fill();
  RB.forEach((c, i) => {
    ctx.strokeStyle = c; ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(9 - i * 1.5, -34 + i * 2);
    ctx.quadraticCurveTo(3 - i * 2, -28 + i * 2, 2 - i, -20 + i);
    ctx.stroke();
  });
  // big baby eye
  ctx.fillStyle = '#333';
  ctx.beginPath(); ctx.arc(16, -31, 2.2, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(16.7, -31.8, 0.8, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,160,200,0.6)';
  ctx.beginPath(); ctx.arc(18, -26, 2.5, 0, 7); ctx.fill();
  ctx.restore();
}

function drawUnicorn(e) {
  const bx = e.x, by = e.y + e.h;
  const bob = Math.sin(G.t * 2) * 3;
  ctx.save();
  ctx.translate(bx, by + bob);
  // tail (rainbow)
  const RB = ['#ff7b7b', '#ffb45e', '#ffe66d', '#7bdc8a', '#6ec5ff', '#c58cff'];
  RB.forEach((c, i) => {
    ctx.strokeStyle = c; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(4, -34);
    ctx.quadraticCurveTo(-8 - i * 1.5, -28 + i * 2, -6 - i * 2, -8 + Math.sin(G.t * 3 + i) * 2);
    ctx.stroke();
  });
  // body
  ctx.fillStyle = '#fffafd';
  ctx.beginPath(); ctx.ellipse(26, -32, 24, 16, 0, 0, 7); ctx.fill();
  // legs
  ctx.fillStyle = '#fffafd';
  for (const lx of [12, 22, 34, 44]) ctx.fillRect(lx, -22, 6, 22);
  ctx.fillStyle = '#ffd9e8';
  for (const lx of [12, 22, 34, 44]) ctx.fillRect(lx, -5, 6, 5);
  // neck + head
  ctx.fillStyle = '#fffafd';
  ctx.beginPath();
  ctx.moveTo(40, -40); ctx.lineTo(52, -62); ctx.lineTo(62, -58); ctx.lineTo(50, -32);
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(58, -60, 13, 9, -0.35, 0, 7); ctx.fill();
  // horn
  ctx.fillStyle = '#ffd45e';
  ctx.beginPath();
  ctx.moveTo(60, -70); ctx.lineTo(66, -90); ctx.lineTo(68, -68);
  ctx.closePath(); ctx.fill();
  // mane
  RB.forEach((c, i) => {
    ctx.strokeStyle = c; ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(52 - i * 2.5, -66 + i * 3);
    ctx.quadraticCurveTo(42 - i * 3, -56 + i * 3, 40 - i * 2, -40 + i * 2);
    ctx.stroke();
  });
  // face
  ctx.fillStyle = '#333';
  ctx.beginPath(); ctx.arc(63, -62, 1.8, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,160,200,0.6)';
  ctx.beginPath(); ctx.arc(64, -55, 3, 0, 7); ctx.fill();
  ctx.restore();
  // ambient sparkles
  ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.4 * Math.sin(G.t * 3)})`;
  sparkle(bx + 76, by - 82 + bob, 5);
  sparkle(bx - 4, by - 54 + bob, 4);
}

function drawQueen() {
  if (!Q.active) return;
  // zap beam
  if (Q.zapT > 0) {
    ctx.strokeStyle = `rgba(230,179,255,${Q.zapT * 4})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(Q.x + 22, Q.y + 6);
    const midX = (Q.x + 22 + Q.zapX) / 2 + (Math.random() - 0.5) * 20;
    const midY = (Q.y + 6 + Q.zapY) / 2 + (Math.random() - 0.5) * 20;
    ctx.quadraticCurveTo(midX, midY, Q.zapX, Q.zapY);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(Q.x, Q.y);
  const s = 0.86;
  ctx.scale(s, s);
  // gown
  ctx.fillStyle = '#8a4ec4';
  ctx.beginPath();
  ctx.moveTo(2, 12); ctx.lineTo(22, 12); ctx.lineTo(30, 46); ctx.lineTo(-6, 46);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#a86ee0';
  ctx.fillRect(6, 10, 12, 16);
  // arms + wand
  ctx.fillStyle = '#f0c8a0';
  ctx.fillRect(19, 14, 4, 12);
  ctx.strokeStyle = '#ffd45e'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(21, 18); ctx.lineTo(28, 6); ctx.stroke();
  ctx.fillStyle = '#ffe98a';
  sparkle(29, 4, 5 + Math.sin(G.t * 6) * 1.5);
  // head + hair
  ctx.fillStyle = '#f0c8a0';
  ctx.beginPath(); ctx.arc(12, 2, 8, 0, 7); ctx.fill();
  ctx.fillStyle = '#c4a0d8';
  ctx.beginPath(); ctx.arc(12, -1, 8, Math.PI, 0); ctx.fill();
  ctx.beginPath(); ctx.ellipse(5, 6, 3.5, 8, 0.2, 0, 7); ctx.fill();
  // crown
  ctx.fillStyle = '#ffd45e';
  ctx.beginPath();
  ctx.moveTo(5, -6); ctx.lineTo(5, -14); ctx.lineTo(9, -9); ctx.lineTo(12, -16);
  ctx.lineTo(15, -9); ctx.lineTo(19, -14); ctx.lineTo(19, -6);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ff5b5b';
  ctx.beginPath(); ctx.arc(12, -9, 1.8, 0, 7); ctx.fill();
  // face
  ctx.fillStyle = '#333';
  ctx.beginPath(); ctx.arc(9, 2, 1.4, 0, 7); ctx.arc(15, 2, 1.4, 0, 7); ctx.fill();
  ctx.restore();
}

function drawCheckpoint(e) {
  ctx.fillStyle = '#8a8f9c';
  ctx.fillRect(e.x + 12, e.y, 5, e.h);
  const wave = Math.sin(G.t * 5) * 3;
  ctx.fillStyle = e.hit ? '#5bd68a' : '#c9ccd6';
  ctx.beginPath();
  ctx.moveTo(e.x + 17, e.y + 2);
  ctx.lineTo(e.x + 44 + wave, e.y + 10);
  ctx.lineTo(e.x + 17, e.y + 20);
  ctx.closePath(); ctx.fill();
  if (e.hit) {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Trebuchet MS';
    ctx.fillText('✓', e.x + 22, e.y + 14);
  }
}

function drawGoose(e) {
  ctx.save();
  ctx.translate(e.x + e.w / 2, e.y + e.h);
  ctx.scale(e.dir, 1);
  const bob = e.mode === 'charge' ? Math.sin(G.t * 24) * 2 : Math.sin(G.t * 8) * 1.5;
  // body
  ctx.fillStyle = '#8c7a63';
  ctx.beginPath(); ctx.ellipse(0, -12 + bob, 16, 11, 0, 0, 7); ctx.fill();
  // wings out when charging
  if (e.mode === 'charge') {
    ctx.fillStyle = '#7a6952';
    ctx.beginPath(); ctx.ellipse(-6, -18 + bob, 12, 5, -0.6, 0, 7); ctx.fill();
  }
  // neck + head
  ctx.fillStyle = '#222';
  ctx.fillRect(8, -30 + bob, 5, 20);
  ctx.beginPath(); ctx.ellipse(11, -31 + bob, 7, 5.5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(11, -28 + bob, 4, 2.5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#e8a33d';
  ctx.beginPath(); ctx.moveTo(17, -32 + bob); ctx.lineTo(25, -30 + bob); ctx.lineTo(17, -28 + bob); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(13, -33 + bob, 1.6, 0, 7); ctx.fill();
  // feet
  ctx.strokeStyle = '#e8a33d'; ctx.lineWidth = 2;
  const step = Math.sin(G.t * (e.mode === 'charge' ? 26 : 10)) * 4;
  ctx.beginPath(); ctx.moveTo(-4, -3); ctx.lineTo(-4 + step, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4, -3); ctx.lineTo(4 - step, 0); ctx.stroke();
  if (e.mode === 'charge') {
    ctx.scale(e.dir, 1); // un-flip for text
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Trebuchet MS';
    ctx.fillText('HONK!', -18, -44);
  }
  ctx.restore();
}

function drawSnake(e) {
  ctx.save();
  ctx.translate(e.x, e.y + e.h);
  ctx.strokeStyle = '#7a8a3d'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) {
    const x = i * 4.5;
    const y = -6 + Math.sin(i * 1.2 + G.t * 10) * 3;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
  const hx = e.dir > 0 ? 38 : 0;
  ctx.fillStyle = '#7a8a3d';
  ctx.beginPath(); ctx.arc(hx, -8, 5, 0, 7); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(hx + e.dir * 2, -9, 1.3, 0, 7); ctx.fill();
  // rattle
  ctx.fillStyle = '#c9b37a';
  const rx = e.dir > 0 ? -2 : 40;
  ctx.fillRect(rx, -10 + Math.sin(G.t * 30) * 2, 5, 5);
  ctx.restore();
}

function drawScooter(e) {
  ctx.save();
  ctx.translate(e.x + e.w / 2, e.y + e.h);
  ctx.scale(e.dir, 1);
  // deck + wheels
  ctx.fillStyle = '#20c05c';
  ctx.fillRect(-16, -8, 30, 4);
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(-14, -3, 4, 0, 7); ctx.arc(14, -3, 4, 0, 7); ctx.fill();
  ctx.strokeStyle = '#20c05c'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(12, -8); ctx.lineTo(16, -34); ctx.moveTo(10, -34); ctx.lineTo(22, -34); ctx.stroke();
  // rider (hoodie + helmet, phone in hand obviously)
  ctx.fillStyle = '#4a5aa8';
  ctx.fillRect(-8, -34, 14, 22);
  ctx.fillStyle = '#e8b88a';
  ctx.beginPath(); ctx.arc(-1, -40, 7, 0, 7); ctx.fill();
  ctx.fillStyle = '#ff5b5b';
  ctx.beginPath(); ctx.arc(-1, -43, 7, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.fillRect(8, -30, 5, 8);
  ctx.restore();
}

function drawBus(v) {
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.fillStyle = '#eef1f5';
  roundRect(0, 0, v.w, v.h - 8, 8); ctx.fill();
  // windows
  ctx.fillStyle = '#3a4656';
  for (let i = 0; i < 5; i++) roundRect(10 + i * 34, 8, 26, 18, 3), ctx.fill();
  // rainbow "G" stripe (parody colors)
  const cols = ['#4285f4', '#ea4335', '#fbbc05', '#34a853'];
  cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(8 + i * 40, 34, 36, 7); });
  ctx.fillStyle = '#5a6572';
  ctx.font = 'bold 12px Trebuchet MS';
  ctx.fillText('GBUS → SF', 54, v.h + 4 - 22 + 10);
  // wheels
  ctx.fillStyle = '#1c1f26';
  ctx.beginPath(); ctx.arc(34, v.h - 4, 11, 0, 7); ctx.arc(v.w - 34, v.h - 4, 11, 0, 7); ctx.fill();
  ctx.fillStyle = '#666';
  ctx.beginPath(); ctx.arc(34, v.h - 4, 5, 0, 7); ctx.arc(v.w - 34, v.h - 4, 5, 0, 7); ctx.fill();
  ctx.restore();
}

function drawWaymo(v) {
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.fillStyle = '#f7f9fc';
  roundRect(0, 10, v.w, v.h - 14, 12); ctx.fill();
  ctx.fillStyle = '#2b3442';
  roundRect(18, 2, v.w - 36, 18, 8); ctx.fill();
  // spinning lidar dome
  ctx.fillStyle = '#3aa9e8';
  ctx.beginPath(); ctx.arc(v.w / 2, 0, 7, 0, 7); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  const a = G.t * 10;
  ctx.beginPath(); ctx.moveTo(v.w / 2, 0);
  ctx.lineTo(v.w / 2 + Math.cos(a) * 6, Math.sin(a) * 3); ctx.stroke();
  ctx.fillStyle = '#1c1f26';
  ctx.beginPath(); ctx.arc(24, v.h - 3, 8, 0, 7); ctx.arc(v.w - 24, v.h - 3, 8, 0, 7); ctx.fill();
  ctx.restore();
}

function drawGoal(e) {
  if (e.kind === 'flag') {
    ctx.fillStyle = '#8a8f9c';
    ctx.fillRect(e.x + 30, e.y, 6, e.h);
    const wv = Math.sin(G.t * 4) * 4;
    ctx.fillStyle = '#ffd45e';
    ctx.beginPath();
    ctx.moveTo(e.x + 36, e.y);
    ctx.lineTo(e.x + 76 + wv, e.y + 14);
    ctx.lineTo(e.x + 36, e.y + 28);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6b4a10'; ctx.font = 'bold 10px Trebuchet MS';
    ctx.fillText('SUMMIT', e.x + 38, e.y + 17);
  } else if (e.kind === 'castle') {
    const bx = e.x, by = e.y, bw = e.w, bh = e.h;
    // towers + keep in candy pink
    ctx.fillStyle = '#ffc2e2';
    ctx.fillRect(bx, by + 26, 28, bh - 26);
    ctx.fillRect(bx + bw - 28, by + 26, 28, bh - 26);
    ctx.fillStyle = '#ffd9ec';
    ctx.fillRect(bx + 26, by + 52, bw - 52, bh - 52);
    // conical roofs
    const roof = (rx, ry, rw) => {
      ctx.fillStyle = '#8ff0c8';
      ctx.beginPath();
      ctx.moveTo(rx, ry); ctx.lineTo(rx + rw / 2, ry - 30); ctx.lineTo(rx + rw, ry);
      ctx.closePath(); ctx.fill();
    };
    roof(bx, by + 26, 28); roof(bx + bw - 28, by + 26, 28); roof(bx + 26, by + 52, bw - 52);
    // door + windows
    ctx.fillStyle = '#b96ec4';
    ctx.beginPath();
    ctx.moveTo(bx + bw / 2 - 14, by + bh);
    ctx.lineTo(bx + bw / 2 - 14, by + bh - 26);
    ctx.quadraticCurveTo(bx + bw / 2, by + bh - 46, bx + bw / 2 + 14, by + bh - 26);
    ctx.lineTo(bx + bw / 2 + 14, by + bh);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff3a8';
    for (const wx of [bx + 8, bx + bw - 18]) ctx.fillRect(wx, by + 52, 10, 12);
    // pennants
    ctx.fillStyle = '#ff6ea8';
    const fl = Math.sin(G.t * 5) * 3;
    for (const px of [bx + 14, bx + bw - 14]) {
      ctx.beginPath();
      ctx.moveTo(px, by - 4); ctx.lineTo(px + 14 + fl, by + 2); ctx.lineTo(px, by + 8);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.4 * Math.sin(G.t * 3)})`;
    sparkle(bx - 10, by + 40, 6);
    sparkle(bx + bw + 8, by + 70, 5);
  } else if (e.kind === 'pier') {
    // a lifeguard tower at the end of the pier
    const bx = e.x, by = e.y, bw = e.w, bh = e.h;
    ctx.fillStyle = '#e8dcc4';
    ctx.fillRect(bx + 8, by + 30, bw - 16, bh - 46);
    ctx.fillStyle = '#c94f4f';
    ctx.beginPath();
    ctx.moveTo(bx - 4, by + 32); ctx.lineTo(bx + bw / 2, by - 4); ctx.lineTo(bx + bw + 4, by + 32);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5aa9d8';
    ctx.fillRect(bx + 20, by + 44, bw - 40, 26);
    ctx.fillStyle = '#8a6440';
    ctx.fillRect(bx + 12, by + bh - 16, 10, 20);
    ctx.fillRect(bx + bw - 22, by + bh - 16, 10, 20);
    ctx.fillStyle = '#2e2a26'; ctx.font = 'bold 11px Trebuchet MS';
    ctx.textAlign = 'center';
    ctx.fillText('SHORE', bx + bw / 2, by + 84);
    ctx.textAlign = 'left';
    const gl = 0.5 + 0.5 * Math.sin(G.t * 4);
    ctx.fillStyle = `rgba(255,212,94,${gl})`;
    sparkle(bx - 6, by + 20, 7);
    sparkle(bx + bw + 6, by + 50, 6);
  } else if (e.kind === 'cage') {
    const r = G.level.rescue;
    const bx = e.x, by = e.y, bw = e.w, bh = e.h;
    // hanging chain
    ctx.strokeStyle = '#6a6a78'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(bx + bw / 2, by - 40); ctx.lineTo(bx + bw / 2, by); ctx.stroke();
    // the captive, waving through the bars
    ctx.save();
    ctx.beginPath(); ctx.rect(bx + 6, by + 8, bw - 12, bh - 14); ctx.clip();
    const cap = CHARACTERS.find(c => c.id === r.charId) || CHARACTERS[0];
    const wob = Math.sin(G.t * 3) * 2;
    drawPlayer(cap, bx + bw / 2 - 13 + wob, by + bh - 58, -1, G.t * 2, true, 0, false);
    if (r.royal) drawCrown(bx + bw / 2 - 10 + wob, by + bh - 76, 20);
    ctx.restore();
    // the cage itself
    ctx.fillStyle = '#4a4452';
    ctx.fillRect(bx, by, bw, 10);
    ctx.fillRect(bx, by + bh - 8, bw, 8);
    ctx.fillStyle = '#5e5768';
    for (let i = 0; i <= 6; i++) ctx.fillRect(bx + 4 + i * ((bw - 8) / 6), by + 8, 5, bh - 16);
    ctx.fillStyle = '#3a3542';
    ctx.fillRect(bx - 4, by - 4, bw + 8, 8);
    // help label
    ctx.fillStyle = `rgba(255,212,94,${0.6 + 0.4 * Math.sin(G.t * 4)})`;
    ctx.font = 'bold 12px Trebuchet MS';
    ctx.textAlign = 'center';
    ctx.fillText(r.name, bx + bw / 2, by - 14);
    ctx.textAlign = 'left';
  } else if (e.kind === 'amp') {
    drawTentShape(e.x, e.y + e.h, 1, '#f5f2ea');
    ctx.fillStyle = '#7a7466'; ctx.font = 'bold 11px Trebuchet MS';
    ctx.fillText('AMPHITHEATRE', e.x - 8, e.y + e.h + 14);
  } else { // arch
    ctx.fillStyle = '#2c6e4f';
    ctx.fillRect(e.x, e.y, 12, e.h);
    ctx.fillRect(e.x + e.w - 12, e.y, 12, e.h);
    ctx.beginPath();
    ctx.moveTo(e.x, e.y + 8);
    ctx.quadraticCurveTo(e.x + e.w / 2, e.y - 34, e.x + e.w, e.y + 8);
    ctx.quadraticCurveTo(e.x + e.w / 2, e.y - 8, e.x, e.y + 8);
    ctx.fill();
    ctx.fillStyle = '#ffd45e'; ctx.font = 'bold 12px Trebuchet MS';
    ctx.fillText('CASTRO ST', e.x + 18, e.y - 2);
    const gl = 0.5 + 0.5 * Math.sin(G.t * 5);
    ctx.fillStyle = `rgba(255,212,94,${gl})`;
    ctx.beginPath(); ctx.arc(e.x + e.w / 2, e.y + 40, 10 + gl * 4, 0, 7); ctx.fill();
    drawCrown(e.x + e.w / 2 - 12, e.y + 30, 24);
  }
}

function drawTentShape(x, baseY, s, color) {
  // Shoreline Amphitheatre's twin white peaks
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - 50 * s, baseY);
  ctx.lineTo(x - 10 * s, baseY - 70 * s);
  ctx.lineTo(x + 15 * s, baseY - 30 * s);
  ctx.lineTo(x + 40 * s, baseY - 85 * s);
  ctx.lineTo(x + 90 * s, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawCrown(x, y, w) {
  ctx.fillStyle = '#ffd45e';
  ctx.beginPath();
  ctx.moveTo(x, y + 12);
  ctx.lineTo(x, y + 2); ctx.lineTo(x + w * 0.25, y + 8); ctx.lineTo(x + w * 0.5, y);
  ctx.lineTo(x + w * 0.75, y + 8); ctx.lineTo(x + w, y + 2); ctx.lineTo(x + w, y + 12);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ff5b5b';
  ctx.beginPath(); ctx.arc(x + w / 2, y + 8, 2.5, 0, 7); ctx.fill();
}

// ---- the runner --------------------------------------------------------------
function drawPlayer(ch, x, y, facing, animT, onGround, invuln, moving) {
  if (invuln > 0 && Math.floor(invuln * 12) % 2 === 0) return; // flicker
  if (ch.id === 'goose') { drawGoosePlayer(x, y, facing, animT, onGround); return; }
  ctx.save();
  ctx.translate(x + 13, y + 46);
  ctx.scale(facing, 1);
  const run = moving && onGround;
  const leg = run ? Math.sin(animT * 4) * 8 : 0;
  const airLeg = onGround ? 0 : 6;

  if (ch.dress) {
    // legs + slippers under a flowing skirt
    ctx.fillStyle = ch.skin;
    ctx.fillRect(-6 + leg * 0.4, -12, 4, 10);
    ctx.fillRect(2 - leg * 0.4, -12, 4, 10);
    ctx.fillStyle = ch.trim;
    ctx.fillRect(-8 + leg, -3, 9, 3);
    ctx.fillRect(0 - leg, -3, 9, 3);
    const flare = onGround ? 0 : 4; // skirt billows mid-glide
    ctx.fillStyle = ch.pants;
    ctx.beginPath();
    ctx.moveTo(-7, -30); ctx.lineTo(7, -30);
    ctx.lineTo(12 + flare, -10); ctx.lineTo(-12 - flare, -10);
    ctx.closePath(); ctx.fill();
  } else {
    // pants (puffy for royalty, khakis for founders)
    ctx.fillStyle = ch.pants;
    ctx.beginPath(); ctx.ellipse(-4 + leg * 0.5, -10, 6, 10, (leg + airLeg) * 0.04, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(4 - leg * 0.5, -10, 6, 10, -(leg + airLeg) * 0.04, 0, 7); ctx.fill();
    // shoes
    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(-9 + leg, -3, 10, 3);
    ctx.fillRect(0 - leg, -3, 10, 3);
  }
  // vest / torso
  ctx.fillStyle = ch.vest;
  ctx.fillRect(-8, -34, 16, 16);
  ctx.fillStyle = ch.trim;
  ctx.fillRect(-8, -34, 3, 16);
  ctx.fillRect(5, -34, 3, 16);
  // badge lanyard — every runner has a day job
  ctx.strokeStyle = '#4285f4'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-4, -34); ctx.lineTo(0, -26); ctx.lineTo(4, -34); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillRect(-2, -27, 5, 7);
  ctx.fillStyle = '#ea4335'; ctx.fillRect(-2, -27, 5, 2);
  // arms
  ctx.fillStyle = ch.skin;
  const arm = run ? Math.sin(animT * 4 + Math.PI) * 6 : (onGround ? 0 : -8);
  ctx.fillRect(-11, -32 + arm * 0.3, 4, 12);
  ctx.fillRect(7, -32 - arm * 0.3, 4, 12);
  // head
  ctx.fillStyle = ch.skin;
  ctx.beginPath(); ctx.arc(0, -41, 8, 0, 7); ctx.fill();
  ctx.fillStyle = ch.hair;
  ctx.beginPath(); ctx.arc(0, -44, 8, Math.PI, 0); ctx.fill();
  if (ch.dress) {
    // long hair + tiara
    ctx.beginPath(); ctx.ellipse(-7, -34, 3.5, 9, 0.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd45e';
    ctx.beginPath();
    ctx.moveTo(-5, -47); ctx.lineTo(-2.5, -53); ctx.lineTo(0, -47);
    ctx.lineTo(2.5, -53); ctx.lineTo(5, -47);
    ctx.closePath(); ctx.fill();
  } else if (ch.cap) {
    // backwards-forwards cap, intern standard issue
    ctx.fillStyle = ch.band;
    ctx.beginPath(); ctx.arc(0, -45, 8, Math.PI, 0); ctx.fill();
    ctx.fillRect(0, -47, 13, 3);
  } else if (ch.shades) {
    ctx.fillStyle = '#1b1f28';
    ctx.fillRect(-2, -43, 9, 4);
  } else {
    // red headband (PoP homage)
    ctx.fillStyle = ch.band;
    ctx.fillRect(-8, -46, 16, 4);
    ctx.beginPath(); ctx.moveTo(-8, -44); ctx.lineTo(-15, -40); ctx.lineTo(-13, -46); ctx.closePath(); ctx.fill();
  }
  // eye
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(4, -41, 1.6, 0, 7); ctx.fill();
  ctx.restore();
}

function drawGoosePlayer(x, y, facing, animT, onGround) {
  ctx.save();
  ctx.translate(x + 13, y + 46);
  ctx.scale(facing, 1);
  const bob = Math.sin(animT * 8) * 1.5;
  // body
  ctx.fillStyle = '#8c7a63';
  ctx.beginPath(); ctx.ellipse(0, -13 + bob, 15, 11, 0, 0, 7); ctx.fill();
  // wings out mid-air (double-jump energy)
  if (!onGround) {
    ctx.fillStyle = '#7a6952';
    ctx.beginPath(); ctx.ellipse(-7, -20 + bob, 13, 5, -0.7, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-9, -16 + bob, 12, 4, -0.3, 0, 7); ctx.fill();
  }
  // neck + head — main-character energy
  ctx.fillStyle = '#222';
  ctx.fillRect(6, -36 + bob, 5, 25);
  ctx.beginPath(); ctx.ellipse(9, -37 + bob, 7.5, 6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(9, -34 + bob, 4, 2.5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#e8a33d';
  ctx.beginPath(); ctx.moveTo(15, -38 + bob); ctx.lineTo(24, -36 + bob); ctx.lineTo(15, -34 + bob); ctx.closePath(); ctx.fill();
  // royal headband
  ctx.fillStyle = '#e03a3a';
  ctx.fillRect(3, -43 + bob, 12, 3);
  // eye
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(11, -39 + bob, 1.7, 0, 7); ctx.fill();
  // feet
  ctx.strokeStyle = '#e8a33d'; ctx.lineWidth = 2;
  const step = Math.sin(animT * 10) * 4;
  ctx.beginPath(); ctx.moveTo(-4, -3); ctx.lineTo(-4 + step, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4, -3); ctx.lineTo(4 - step, 0); ctx.stroke();
  ctx.restore();
}

function drawShots() {
  for (const s of G.shots) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.spin);
    ctx.fillStyle = '#c0392b';
    roundRect(-8, -4, 16, 6, 2); ctx.fill();
    ctx.fillStyle = '#8a2a1e';
    ctx.fillRect(-8, 2, 16, 2);
    ctx.fillStyle = '#d9dde5';
    ctx.fillRect(-6, -2, 4, 2);
    ctx.restore();
  }
}

function drawQuip() {
  if (!G.quip) return;
  ctx.font = 'bold 13px Trebuchet MS';
  const tw = ctx.measureText(G.quip).width;
  const bx = P.x + 13 - tw / 2 - 10, by = P.y - 38;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  roundRect(bx, by, tw + 20, 24, 10); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(P.x + 8, by + 24); ctx.lineTo(P.x + 18, by + 24); ctx.lineTo(P.x + 13, by + 32);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#333';
  ctx.fillText(G.quip, bx + 10, by + 16);
}

function drawParticlesWorld() {
  for (const p of G.particles) {
    if (G.state === 'win' || G.state === 'gameover' || G.state === 'title') continue;
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = p.c;
    ctx.fillRect(p.x, p.y, p.s, p.s);
  }
  ctx.globalAlpha = 1;
}

function drawParticlesScreen() {
  if (!(G.state === 'win' || G.state === 'gameover' || G.state === 'title')) return;
  for (const p of G.particles) {
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = p.c;
    ctx.fillRect(p.x, p.y, p.s, p.s);
  }
  ctx.globalAlpha = 1;
}

// ---- HUD & screens ---------------------------------------------------------
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function heart(x, y, s, filled) {
  ctx.fillStyle = filled ? '#ff5b6e' : 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y - s * 0.3, x - s, y - s * 0.3, x - s, y + s * 0.3);
  ctx.bezierCurveTo(x - s, y + s * 0.8, x, y + s * 1.1, x, y + s * 1.5);
  ctx.bezierCurveTo(x, y + s * 1.1, x + s, y + s * 0.8, x + s, y + s * 0.3);
  ctx.bezierCurveTo(x + s, y - s * 0.3, x, y - s * 0.3, x, y + s * 0.3);
  ctx.fill();
}

function drawHUD() {
  ctx.fillStyle = 'rgba(20,16,40,0.55)';
  roundRect(12, 10, 936, 38, 12); ctx.fill();

  for (let i = 0; i < 3; i++) heart(44 + i * 30, 24, 9, i < G.hearts);

  // lives (or FUN/ZEN badge — no game over in those modes)
  ctx.fillStyle = G.zenMode ? '#b48ae8' : G.funMode ? '#5bd68a' : '#fff';
  ctx.font = 'bold 15px Trebuchet MS';
  ctx.fillText(G.zenMode ? 'ZEN' : G.funMode ? 'FUN' : '×' + G.lives, 152, 34);
  ctx.fillStyle = '#e03a3a'; ctx.fillRect(130, 20, 14, 5);
  ctx.fillStyle = '#e8b88a'; ctx.beginPath(); ctx.arc(137, 29, 6, 0, 7); ctx.fill();

  // RSUs
  ctx.save(); ctx.translate(220, 29);
  ctx.fillStyle = '#59e0e8';
  ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(8, 0); ctx.lineTo(0, 9); ctx.lineTo(-8, 0); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.fillText('×' + G.rsus, 236, 34);

  // active buff chips — own row, so they never crowd the level title
  let bx = 16;
  ctx.font = 'bold 12px Trebuchet MS';
  const chip = (label, col) => {
    const cw = ctx.measureText(label).width + 14;
    ctx.fillStyle = col; roundRect(bx, 54, cw, 22, 8); ctx.fill();
    ctx.fillStyle = '#1b1430'; ctx.fillText(label, bx + 7, 69);
    bx += cw + 6;
  };
  const obj = G.level.objective;
  if (obj) chip(`${obj.label} ${obj.got}/${obj.need}${obj.done ? ' ✓' : ''}`, obj.done ? '#8ff0c8' : '#ffe66d');
  if (keys['ShiftLeft'] || keys['ShiftRight']) chip('TIPTOE', '#9fe8c0');
  if (G.level.gravMul && G.level.gravMul < 1) chip('FLOATY', '#c4f2e6');
  if (Q.active) chip(Q.saves > 0 ? 'QUEEN ♛' : 'QUEEN ·', '#e0b3ff');
  if (F.active) chip('FOAL 🦄', '#ffd6f0');
  if (G.buffs.speed > 0) chip('BOBA ' + Math.ceil(G.buffs.speed), '#e6a3ff');
  if (G.buffs.jump > 0) chip('WHEEL ' + Math.ceil(G.buffs.jump), '#7ad0ff');
  if (P.invuln > 1.6) chip('NC ' + Math.ceil(P.invuln), '#ffd45e');

  // level name
  ctx.fillStyle = '#ffd45e'; ctx.font = 'bold 14px Trebuchet MS';
  ctx.textAlign = 'center';
  ctx.fillText(
    G.mode === 'remix' ? `${G.level.name} · REMIX ${G.remixDepth}`
    : G.mode === 'dream' ? `${G.level.name} · DREAM ${G.dreamDepth}`
    : G.level.name, W / 2, 34);
  ctx.textAlign = 'left';

  // timer with a tiny hourglass (PoP homage) — zen is timeless
  const tLow = !G.zenMode && G.timer < 11;
  const tx = 860;
  ctx.fillStyle = tLow && Math.floor(G.t * 4) % 2 === 0 ? '#ff5b5b' : '#fff';
  ctx.font = 'bold 17px Trebuchet MS';
  ctx.fillText(G.zenMode ? '∞' : Math.max(0, Math.ceil(G.timer)) + 's', tx + 24, 35);
  ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tx, 18); ctx.lineTo(tx + 14, 18); ctx.lineTo(tx, 40); ctx.lineTo(tx + 14, 40);
  ctx.closePath(); ctx.stroke();

  if (D.active) drawNoiseMeter();
  if (G.level.ocean) drawAirMeter();
}

// Breath left, and whatever the ocean is doing about it.
function drawAirMeter() {
  if (SEA.air < 0.999 || SEA.sub) {
    const mw = 200, mx = W / 2 - mw / 2, my = 92;
    ctx.fillStyle = 'rgba(8,30,60,0.72)';
    roundRect(mx - 8, my - 20, mw + 16, 42, 10); ctx.fill();
    ctx.fillStyle = SEA.air < 0.25 ? '#ff6b6b' : '#bfeaff';
    ctx.font = 'bold 12px Trebuchet MS';
    ctx.textAlign = 'center';
    ctx.fillText(SEA.air <= 0 ? 'NO AIR — SURFACE!' : 'AIR', W / 2, my - 6);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    roundRect(mx, my + 2, mw, 12, 6); ctx.fill();
    const col = SEA.air < 0.25 ? '#ff4d4d' : SEA.air < 0.55 ? '#ffc02e' : '#5ad6ff';
    ctx.fillStyle = col;
    roundRect(mx, my + 2, Math.max(3, mw * SEA.air), 12, 6); ctx.fill();
  }
  // whatever the sea just threw at you
  if (SEA.twistLeft > 0 && SEA.twist) {
    ctx.globalAlpha = Math.min(1, SEA.twistLeft / 1.2);
    ctx.fillStyle = 'rgba(10,40,80,0.8)';
    ctx.font = 'bold 22px Trebuchet MS';
    const tw = ctx.measureText(SEA.twist.name).width;
    roundRect(W / 2 - tw / 2 - 16, 138, tw + 32, 38, 12); ctx.fill();
    ctx.fillStyle = '#ffd45e';
    ctx.textAlign = 'center';
    ctx.fillText(SEA.twist.name, W / 2, 165);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }
}

// How much of you the dragon can currently hear.
function drawNoiseMeter() {
  const inZone = P.x + P.w > G.level.dragonZone;
  if (!inZone && D.alert <= 0.02) return;
  const mw = 260, mx = W / 2 - mw / 2, my = 92;
  ctx.fillStyle = 'rgba(20,10,14,0.72)';
  roundRect(mx - 8, my - 20, mw + 16, 44, 10); ctx.fill();

  ctx.fillStyle = '#e8d8e8'; ctx.font = 'bold 12px Trebuchet MS';
  ctx.textAlign = 'center';
  const label = D.state === 'lunge' ? 'IT SEES YOU'
              : D.state === 'waking' ? 'IT IS WAKING — STOP'
              : D.state === 'stirring' ? 'IT STIRS…'
              : 'THE DRAGON SLEEPS';
  ctx.fillText(label, W / 2, my - 6);
  ctx.textAlign = 'left';

  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  roundRect(mx, my + 2, mw, 12, 6); ctx.fill();
  const a = D.alert;
  const col = a >= 0.78 ? '#ff3a3a' : a >= 0.42 ? '#ffab2e' : '#5bd68a';
  ctx.fillStyle = col;
  roundRect(mx, my + 2, Math.max(4, mw * a), 12, 6); ctx.fill();
  // the line past which it starts to stir
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(mx + mw * 0.42, my, 2, 16);
  ctx.fillRect(mx + mw * 0.78, my, 2, 16);

  if (a < 0.42) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = 'bold 11px Trebuchet MS';
    ctx.textAlign = 'center';
    ctx.fillText('hold SHIFT to tiptoe', W / 2, my + 34);
    ctx.textAlign = 'left';
  }
}

function bigTextPanel(lines, colors, sizes) {
  ctx.fillStyle = 'rgba(15,10,35,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  let y = H / 2 - (lines.length - 1) * 24;
  lines.forEach((ln, i) => {
    ctx.fillStyle = colors[i] || '#fff';
    ctx.font = `bold ${sizes[i] || 20}px Trebuchet MS`;
    ctx.fillText(ln, W / 2, y);
    y += (sizes[i] || 20) + 18;
  });
  ctx.textAlign = 'left';
}

function drawIntroCard() {
  const L = G.level;
  const label = G.mode === 'remix' ? `REMIX #${G.remixDepth}`
              : G.mode === 'dream' ? `DREAM #${G.dreamDepth}`
              : `LEVEL ${G.levelIndex + 1}`;
  bigTextPanel(
    [label, L.name, L.subtitle, L.tip, 'Press ENTER'],
    ['#ffd45e', '#fff', '#c9e6ff', '#ffb0b0', 'rgba(255,255,255,0.7)'],
    [22, 44, 18, 16, 14]
  );
}

function drawLevelEnd() {
  if (G.level.rescue) {
    bigTextPanel(
      ['RESCUED!', `${G.level.rescue.name} is free.`,
       `Treasure hauled out: ${G.rsus}`, 'Coronation awaits…'],
      ['#ffd45e', '#fff', '#59e0e8', '#5bd68a'],
      [44, 24, 20, 18]
    );
    return;
  }
  bigTextPanel(
    [G.mode === 'dream' ? 'DREAM CLEAR! ✨' : 'LEVEL CLEAR!', `RSUs banked: ${G.rsus}`,
     G.mode === 'remix' ? 'Another remix approaches…'
     : G.mode === 'dream' ? 'Drifting deeper into the dream…'
     : (G.levelIndex >= LEVELS.length - 1 ? 'Coronation awaits…' : 'Onward!')],
    ['#5bd68a', '#59e0e8', '#ffd45e'],
    [40, 22, 18]
  );
}

function drawPaused() {
  bigTextPanel(['PAUSED', '(Probably in a meeting)', 'P to resume'], ['#fff', '#c9e6ff', 'rgba(255,255,255,0.7)'], [40, 18, 14]);
}

function drawSelect() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2a2160'); g.addColorStop(0.6, '#8c4a8e'); g.addColorStop(1, '#ff9e6d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd45e'; ctx.font = 'bold 32px Trebuchet MS';
  ctx.fillText('CHOOSE YOUR RUNNER', W / 2, 58);

  CHARACTERS.forEach((c, i) => {
    const cx = 96 + i * 192, cy = 210;
    const sel = i === G.selChar;
    if (sel) {
      ctx.fillStyle = 'rgba(255,212,94,0.15)';
      roundRect(cx - 68, cy - 108, 136, 168, 14); ctx.fill();
      ctx.strokeStyle = '#ffd45e'; ctx.lineWidth = 3;
      roundRect(cx - 68, cy - 108, 136, 168, 14); ctx.stroke();
      ctx.fillStyle = '#ffd45e';
      const ay = cy - 124 + Math.sin(G.t * 5) * 3;
      ctx.beginPath(); ctx.moveTo(cx - 8, ay); ctx.lineTo(cx + 8, ay); ctx.lineTo(cx, ay + 9); ctx.closePath(); ctx.fill();
    }
    ctx.save();
    ctx.translate(cx, cy + 18);
    ctx.scale(1.7, 1.7);
    drawPlayer(c, -13, -46, 1, sel ? G.t * 3 : 0, true, 0, sel);
    ctx.restore();
    if (c.queen) {
      // the Queen hovers beside her daughter
      const saveQ = Q.active, sx = Q.x, sy = Q.y, sz = Q.zapT;
      Q.active = true; Q.zapT = 0;
      Q.x = cx + 22; Q.y = cy - 34 + Math.sin(G.t * 2) * 4;
      drawQueen();
      Q.active = saveQ; Q.x = sx; Q.y = sy; Q.zapT = sz;
    }
    ctx.fillStyle = sel ? '#fff' : 'rgba(255,255,255,0.55)';
    ctx.font = 'bold 14px Trebuchet MS';
    ctx.fillText(c.name, cx, cy + 46);
  });

  const c = CHARACTERS[G.selChar];
  const dots = (v) => { const n = clamp(Math.round((v - 0.82) * 12), 1, 5); return '●'.repeat(n) + '○'.repeat(5 - n); };
  ctx.fillStyle = '#c9e6ff'; ctx.font = 'italic 16px Trebuchet MS';
  ctx.fillText(c.desc + (c.dj ? '' : `   ·   SPD ${dots(c.run)}   JMP ${dots(c.jump)}`), W / 2, 306);

  ctx.fillStyle = '#fff'; ctx.font = 'bold 22px Trebuchet MS';
  ctx.fillText('▲▼  ' + LEVEL_MENU[G.selLevel], W / 2, 366);

  ctx.fillStyle = G.funMode ? '#5bd68a' : 'rgba(255,255,255,0.6)';
  ctx.font = 'bold 15px Trebuchet MS';
  ctx.fillText(`[F] FUN MODE: ${G.funMode ? 'ON — no game over, just vibes' : 'OFF'}`, W / 2, 404);

  ctx.fillStyle = G.zenMode ? '#b48ae8' : 'rgba(255,255,255,0.6)';
  ctx.font = 'bold 15px Trebuchet MS';
  ctx.fillText(`[Z] ZEN MODE: ${G.zenMode ? 'ON — deathless, timeless, endless' : 'OFF'}`, W / 2, 430);

  ctx.fillStyle = '#ffd45e';
  ctx.font = `bold ${19 + Math.sin(G.t * 4) * 1.5}px Trebuchet MS`;
  ctx.fillText('Press ENTER to run', W / 2, 472);
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '13px Trebuchet MS';
  ctx.fillText('←/→ runner · ↑/↓ or 1-7 level · C shoot · SHIFT tiptoe · ↓ duck-dive · ESC back', W / 2, 498);
  ctx.textAlign = 'left';
}

function drawTitle() {
  // festive gradient
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2a2160'); g.addColorStop(0.6, '#8c4a8e'); g.addColorStop(1, '#ff9e6d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // backdrop hills + towers
  ctx.fillStyle = 'rgba(30,24,54,0.7)';
  ridge(40, 420, 120);
  ctx.strokeStyle = 'rgba(30,24,54,0.9)'; ctx.lineWidth = 3;
  for (const dx of [0, 26, 52]) {
    ctx.beginPath(); ctx.moveTo(600 + dx, 352); ctx.lineTo(600 + dx, 300); ctx.stroke();
    ctx.fillStyle = `rgba(255,90,90,${0.4 + 0.4 * Math.sin(G.t * 3 + dx)})`;
    ctx.beginPath(); ctx.arc(600 + dx, 298, 3, 0, 7); ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.font = 'bold 58px Trebuchet MS';
  ctx.fillText('PRINCE OF', W / 2 + 3, 143);
  ctx.fillText('MOUNTAIN VIEW', W / 2 + 3, 213);
  const shimmer = 0.75 + 0.25 * Math.sin(G.t * 2);
  ctx.fillStyle = `rgba(255,212,94,${shimmer})`;
  ctx.fillText('PRINCE OF', W / 2, 140);
  ctx.fillStyle = '#fff';
  ctx.fillText('MOUNTAIN VIEW', W / 2, 210);

  drawCrown(W / 2 - 26, 52 + Math.sin(G.t * 2) * 4, 52);

  ctx.fillStyle = '#c9e6ff';
  ctx.font = 'italic 18px Trebuchet MS';
  ctx.fillText('One prince. Three challenges. Zero parking.', W / 2, 252);

  // running prince demo
  ctx.save(); ctx.translate(W / 2 - 13, 300);
  drawPlayer(CHARACTERS[0], 0, 0, 1, G.t * 3, true, 0, true);
  ctx.restore();

  ctx.fillStyle = '#ffd45e';
  ctx.font = `bold ${20 + Math.sin(G.t * 4) * 2}px Trebuchet MS`;
  ctx.fillText('Press ENTER — choose your runner', W / 2, 420);
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '14px Trebuchet MS';
  ctx.fillText("Black Mountain · Shoreline · The GBus · Mavericks · The Dragon's Hoard · Dream · Remix", W / 2, 456);
  ctx.fillText('C: staplers · SHIFT: tiptoe · DOWN: duck-dive · F/Z (in menu): fun & zen · 1-7: warp', W / 2, 482);
  ctx.textAlign = 'left';
}

function drawGameOver() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a1030'); g.addColorStop(1, '#4a1a3a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff5b6e'; ctx.font = 'bold 52px Trebuchet MS';
  ctx.fillText('GAME OVER', W / 2, 200);
  ctx.fillStyle = '#c9e6ff'; ctx.font = 'italic 19px Trebuchet MS';
  ctx.fillText('The Valley claims another dreamer.', W / 2, 250);
  ctx.fillStyle = '#59e0e8'; ctx.font = 'bold 18px Trebuchet MS';
  ctx.fillText(`RSUs collected: ${G.rsus} (unvested, sorry)`, W / 2, 300);
  ctx.fillStyle = '#ffd45e'; ctx.font = 'bold 18px Trebuchet MS';
  ctx.fillText('Press ENTER to pivot', W / 2, 380);
  ctx.textAlign = 'left';
}

function drawWin() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2a2160'); g.addColorStop(0.5, '#b3548c'); g.addColorStop(1, '#ffb45e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (Math.random() < 0.15) burst(Math.random() * W, -10, 6, true);

  ctx.textAlign = 'center';
  drawCrown(W / 2 - 40, 60 + Math.sin(G.t * 2) * 5, 80);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 40px Trebuchet MS';
  ctx.fillText('YOU ARE THE', W / 2, 190);
  ctx.fillStyle = '#ffd45e'; ctx.font = 'bold 48px Trebuchet MS';
  ctx.fillText('PRINCE OF MOUNTAIN VIEW', W / 2, 245);

  const r = RESCUE[CHARACTERS[G.charIndex].id] || RESCUE.prince;
  ctx.fillStyle = '#c9e6ff'; ctx.font = 'italic 18px Trebuchet MS';
  ctx.fillText(`You carried ${r.name} out of the dragon's hoard.`, W / 2, 300);
  ctx.fillText('Your kingdom: a studio apartment near the Caltrain tracks.', W / 2, 328);

  ctx.fillStyle = '#59e0e8'; ctx.font = 'bold 20px Trebuchet MS';
  ctx.fillText(`Royal treasury: ${G.rsus} RSUs · Lives remaining: ${G.lives}`, W / 2, 382);

  ctx.fillStyle = '#ffd45e'; ctx.font = 'bold 18px Trebuchet MS';
  ctx.fillText('Press ENTER for the title screen', W / 2, 440);
  ctx.fillStyle = '#ffb0e0'; ctx.font = 'italic 15px Trebuchet MS';
  ctx.fillText('…or press 6 to drift into the endless Unicorn Dream 🦄', W / 2, 466);
  ctx.textAlign = 'left';

  // your runner, crowned — with the one you went down there for
  ctx.save(); ctx.translate(W / 2 - 46, 540);
  drawPlayer(CHARACTERS[G.charIndex], 0, -46, 1, G.t * 2, true, 0, false);
  drawCrown(3, -64 + Math.sin(G.t * 2) * 2, 20);
  const cap = CHARACTERS.find(c => c.id === r.charId) || CHARACTERS[0];
  drawPlayer(cap, 66, -46, -1, G.t * 2, true, 0, false);
  if (r.royal) drawCrown(69, -64 + Math.sin(G.t * 2 + 1) * 2, 20);
  ctx.restore();
}

// ---- main loop -------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  // one bad frame should never brick the whole game
  try { update(dt); draw(); } catch (err) { console.error('frame error:', err); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
