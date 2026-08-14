# CLAUDE.md — Prince of Mountain View

Guidance for Claude Code when working on the game.

## What it is

A Prince of Persia parody platformer set in Silicon Valley. Pure HTML5 canvas
+ Web Audio API. No dependencies, no build step, no assets on disk — every
sprite is drawn with canvas paths and every sound is synthesized at runtime.

```
prince-of-mountain-view/
├── index.html    ← canvas element (960×540), fullscreen CSS, controls footer
└── js/
    ├── audio.js  ← chiptune sequencer + all sound effects
    ├── levels.js ← level factories and the two procedural generators
    └── game.js   ← engine: physics, entities, rendering, HUD, screens
```

Scripts load in that order as plain `<script>` tags; everything shares one
global scope. `game.js` is the only file with a main loop.

## Running it

It is a static page — `python3 -m http.server 8080` from `src/`, or
`netlify dev` from the repo root, then open `/prince-of-mountain-view/`.

## Engine notes (`js/game.js`)

- **Fixed canvas** `W=960, H=540`. Everything is authored at that size and
  CSS-scaled, so all drawing uses raw pixel coordinates.
- **Physics constants** live at the top: `RUN`, `ACC`, `FRI`, `GRAV`, `JUMP`,
  `MAXFALL`, `COYOTE`, `JBUF`. Platformer feel comes from coyote time, jump
  buffering and variable jump height.
- **`P.launch`** suppresses the variable-jump clamp so mushroom and dolphin
  launches keep their full height. Anything that launches the player must set
  it, or the launch gets cut to 240 px/s.
- **State machine** `G.state`: `title | select | intro | play | levelend |
  gameover | win | paused`. `update()` switches on it; `draw()` mirrors it.
- **Modes** `G.mode`: `campaign | dream | remix`. Campaign advances through
  `LEVELS`; the other two regenerate at `depth+1` forever.
- **The main loop wraps `update`/`draw` in try/catch** on purpose — a thrown
  frame used to kill `requestAnimationFrame` permanently and freeze the game.
- **Entities** are plain objects in `L.ents` with a `type` string, dispatched
  through one switch in `updatePlay()` and another in `drawEntity()`. Adding a
  type means adding a case to both.
- **Platforms** are rects in `L.plats`. A `deco` field selects the renderer;
  `oneWay()` marks the ones you can jump up through (clouds, rainbows).

## Levels (`js/levels.js`)

Five hand-built campaign levels plus two endless generators. Each factory
returns a level object — the fields it sets are the level's whole contract
with the engine (`plats`, `ents`, `hazards`, `spawners`, palette, `timeLimit`,
`playerStart`, `killY`).

Level-specific engine behaviour is switched on by flags on that object rather
than by level id where possible: `dark` (cave lighting), `ocean` (swell
physics), `dream`, `gravMul`, `dragon`/`dragonZone`, `wave`.

Two mechanics are worth knowing about because they change the physics:

- **`ocean`** — the water surface is a live sine wave (`waveY`/`waveSlope`).
  The player rides it as dynamic ground, and the slope accelerates them. Below
  the surface, gravity is replaced by buoyancy and drag, and jump becomes a
  continuous swim thrust. Air drains from `SEA.air`.
- **`dragon`** — the dragon is driven entirely by a noise meter (`D.alert`).
  Speed above `NOISE_FLOOR`, being airborne, landing hard, shooting and taking
  a hit all add noise; standing still drains it. `SHIFT` (`TIPTOE`) is the
  intended answer.

## Audio (`js/audio.js`)

One sequencer plays a 64-step pattern. `SONGS` gives each level a tempo,
transposition, waveform and drum treatment; `leadPat`/`bassPat` name an
alternative pattern array on the `AudioSys` object for levels that need their
own melody (cave, surf).

Every synthesis primitive (`tone`, `noise`, `kick`, `sweep`) guards on
`this.ctx` being non-null. The audio context only exists after the first key
press, and an unguarded call used to throw and take the game loop with it.

## Adding a level

1. Write a `makeX()` factory in `levels.js` returning the level object.
2. Add it to `LEVELS` (campaign) — this shifts the menu slots.
3. Update `LEVEL_MENU`, `DREAM_SLOT`, `REMIX_SLOT` and the digit map in
   `onKeyPress` in `game.js`.
4. Add a song to `SONGS`.
5. Add any new entity types to both switches, and any new `deco` to
   `drawPlatforms`.
