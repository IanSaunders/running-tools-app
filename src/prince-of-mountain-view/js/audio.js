'use strict';
// ---------------------------------------------------------------------------
// Chiptune audio engine — pure Web Audio API, no asset files.
// A Prince-of-Persia-flavored theme (E phrygian dominant) reused per level
// with different tempo / waveform / transposition so each stage feels new.
// ---------------------------------------------------------------------------
const AudioSys = {
  ctx: null,
  master: null,
  musicGain: null,
  sfxGain: null,
  noiseBuf: null,
  muted: false,

  song: null,
  step: 0,
  nextTime: 0,
  schedTimer: null,

  // 4 bars of 16 steps (16th notes). 0 = rest. MIDI note numbers.
  LEAD: [
    64,0,0,64, 65,0,64,0, 68,0,65,64, 65,0,0,0,
    64,0,0,64, 65,0,68,0, 71,0,69,68, 69,0,0,0,
    72,0,0,72, 74,0,72,0, 71,0,72,71, 69,0,68,0,
    71,69,68,65, 64,0,68,0, 65,0,62,0, 64,0,0,0,
  ],
  BASS: [
    40,0,52,0, 40,0,52,0, 40,0,52,0, 40,0,47,0,
    40,0,52,0, 40,0,52,0, 40,0,52,0, 40,0,47,0,
    45,0,57,0, 45,0,57,0, 47,0,59,0, 47,0,59,0,
    48,0,60,0, 48,0,60,0, 47,0,59,0, 47,0,59,0,
  ],

  // Down in the dark the theme slows to a crawl: sparse, tritone-haunted,
  // sitting on a sub-bass drone. Same scale, all the joy drained out.
  CAVE_LEAD: [
    52,0,0,0,  0,0,53,0,  55,0,0,0,  0,0,0,0,
    58,0,0,0,  0,0,57,0,  55,0,0,53, 0,0,0,0,
    52,0,0,0,  0,0,55,0,  58,0,0,0,  59,0,0,0,
    58,0,57,0, 55,0,53,0, 52,0,0,0,  0,0,0,0,
  ],
  CAVE_BASS: [
    28,0,0,0, 0,0,0,0, 28,0,0,0, 0,0,0,0,
    34,0,0,0, 0,0,0,0, 34,0,0,0, 0,0,0,0,
    28,0,0,0, 0,0,0,0, 33,0,0,0, 0,0,0,0,
    31,0,0,0, 0,0,0,0, 30,0,0,0, 0,0,0,0,
  ],

  // Out on the water: surf-rock, major, and in far too much of a hurry.
  SURF_LEAD: [
    69,0,71,0, 73,0,71,0, 69,0,66,0, 64,0,0,0,
    66,0,68,0, 69,0,68,0, 66,0,64,0, 62,0,0,0,
    73,0,74,0, 76,0,74,0, 73,0,71,0, 69,0,0,0,
    71,0,69,0, 68,0,66,0, 64,0,66,0, 69,0,0,0,
  ],
  SURF_BASS: [
    33,0,45,0, 33,0,45,0, 38,0,50,0, 38,0,50,0,
    40,0,52,0, 40,0,52,0, 33,0,45,0, 33,0,45,0,
    38,0,50,0, 38,0,50,0, 40,0,52,0, 40,0,52,0,
    45,0,57,0, 45,0,57,0, 40,0,52,0, 40,0,52,0,
  ],

  SONGS: {
    title:     { bpm: 96,  tr: 0, wave: 'triangle', hatEvery: 4, vol: 0.14 },
    mountain:  { bpm: 112, tr: 0, wave: 'square',   hatEvery: 2, vol: 0.13 },
    shoreline: { bpm: 124, tr: 3, wave: 'square',   hatEvery: 2, vol: 0.13 },
    street:    { bpm: 138, tr: 5, wave: 'sawtooth', hatEvery: 1, vol: 0.10 },
    unicorn:   { bpm: 128, tr: 8, wave: 'triangle', hatEvery: 4, vol: 0.15, sparkle: true },
    cave:      { bpm: 74,  tr: 0, wave: 'triangle', hatEvery: 16, vol: 0.11,
                 leadPat: 'CAVE_LEAD', bassPat: 'CAVE_BASS', drums: 'sparse', drone: 28 },
    surf:      { bpm: 146, tr: 0, wave: 'square',   hatEvery: 2,  vol: 0.12,
                 leadPat: 'SURF_LEAD', bassPat: 'SURF_BASS' },
  },

  // Duck the music while the player is under the surface — everything up
  // there sounds a long way off.
  setMuffle(on) {
    if (!this.musicGain) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.linearRampToValueAtTime(on ? 0.16 : 0.6, t + 0.35);
  },

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.6;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.85;
      this.sfxGain.connect(this.master);
      // shared white-noise buffer for drums
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  },

  freq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); },

  tone(midi, t, dur, wave, vol, dest) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(this.freq(midi), t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  },

  noise(t, dur, vol) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    s.buffer = this.noiseBuf;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(g); g.connect(this.musicGain);
    s.start(t); s.stop(t + dur + 0.02);
  },

  kick(t) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + 0.15);
  },

  startSong(name) {
    if (!this.ctx) return; // will start on first key press instead
    this.stopMusic();
    this.song = this.SONGS[name] || this.SONGS.title;
    this.songName = name;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.schedTimer = setInterval(() => this.schedule(), 25);
  },

  stopMusic() {
    if (this.schedTimer) { clearInterval(this.schedTimer); this.schedTimer = null; }
    this.song = null;
  },

  schedule() {
    if (!this.song) return;
    const stepDur = 60 / this.song.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      const i = this.step % 64;
      const t = this.nextTime;
      const s = this.song;
      const lead = (s.leadPat ? this[s.leadPat] : this.LEAD)[i];
      if (lead) this.tone(lead + s.tr + 12, t, stepDur * 1.6, s.wave, s.vol, this.musicGain);
      const bass = (s.bassPat ? this[s.bassPat] : this.BASS)[i];
      if (bass) this.tone(bass + s.tr, t, stepDur * 1.8, 'triangle', 0.22, this.musicGain);
      const beat = i % 16;
      // twinkly counter-melody, two octaves up (unicorn land only)
      if (s.sparkle && lead && i % 4 === 2) {
        this.tone(lead + s.tr + 24, t, stepDur * 0.9, 'sine', 0.07, this.musicGain);
      }
      // a sub-bass drone that never quite lets up (the cave)
      if (s.drone && i % 32 === 0) {
        this.tone(s.drone, t, stepDur * 33, 'sawtooth', 0.05, this.musicGain);
      }
      if (s.drums === 'sparse') {
        if (beat === 0) this.kick(t);
        if (i === 32) this.noise(t, 0.5, 0.05); // a distant collapse somewhere
      } else {
        if (beat === 0 || beat === 8) this.kick(t);
        if (beat === 4 || beat === 12) this.noise(t, 0.09, 0.12); // snare-ish
      }
      if (s.drums !== 'sparse' && i % s.hatEvery === 0) this.noise(t, 0.03, 0.045); // hat
      this.step++;
      this.nextTime += stepDur;
    }
  },

  // ---- sound effects -------------------------------------------------------
  sweep(f0, f1, dur, wave, vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  },

  arp(midis, stepDur, wave, vol) {
    if (!this.ctx) return;
    let t = this.ctx.currentTime;
    for (const m of midis) {
      if (m) this.tone(m, t, stepDur * 1.4, wave, vol, this.sfxGain);
      t += stepDur;
    }
  },

  sfxJump()   { this.sweep(280, 620, 0.14, 'square', 0.12); },
  sfxCollect(){ this.arp([88, 93, 100], 0.055, 'square', 0.12); },
  sfxCoffee() { this.arp([76, 83, 88, 95], 0.05, 'triangle', 0.18); },
  sfxHurt()   { this.sweep(320, 70, 0.28, 'sawtooth', 0.2); },
  sfxStomp()  { this.sweep(200, 50, 0.15, 'square', 0.2); },
  sfxHonk() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(58, t, 0.16, 'square', 0.14, this.sfxGain);
    this.tone(65, t, 0.16, 'square', 0.12, this.sfxGain);
  },
  sfxCheckpoint() { this.arp([81, 88], 0.09, 'triangle', 0.18); },
  sfxShoot()  { this.sweep(900, 300, 0.09, 'square', 0.08); },
  sfxBoing()  { this.sweep(180, 780, 0.22, 'sine', 0.18); },
  sfxMagic()  { this.arp([84, 88, 91, 96, 100], 0.045, 'sine', 0.14); },
  sfxZap()    { this.sweep(1500, 420, 0.14, 'triangle', 0.13); },
  sfxNeigh()  { this.arp([79, 84, 81, 88], 0.07, 'triangle', 0.16); },
  sfxPlink()  { this.sweep(1300, 900, 0.06, 'triangle', 0.1); },
  sfxWin()    { this.arp([64, 68, 71, 76, 0, 76, 80, 88], 0.11, 'triangle', 0.2); },
  sfxLose()   { this.arp([64, 62, 60, 55], 0.22, 'sawtooth', 0.12); },

  // ---- down in the dark ----------------------------------------------------
  sfxBat()    { this.sweep(2600, 900, 0.13, 'sawtooth', 0.07); },
  sfxDrip()   { this.sweep(1500, 620, 0.10, 'sine', 0.05); },
  sfxGold()   { this.arp([93, 100, 105], 0.04, 'triangle', 0.11); },
  sfxGrowl()  { this.sweep(120, 62, 0.5, 'sawtooth', 0.13); },
  sfxRoar() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sweep(180, 40, 0.9, 'sawtooth', 0.26);
    this.tone(26, t, 1.1, 'square', 0.16, this.sfxGain);
    this.noise(t, 0.8, 0.18);
  },
  sfxRescue() { this.arp([64, 71, 76, 83, 88, 0, 88, 95], 0.10, 'triangle', 0.2); },

  // ---- out on the water ----------------------------------------------------
  sfxSplash() {
    if (!this.ctx) return;
    this.noise(this.ctx.currentTime, 0.30, 0.16);
    this.sweep(900, 240, 0.28, 'sine', 0.07);
  },
  sfxDive() {
    if (!this.ctx) return;
    this.noise(this.ctx.currentTime, 0.22, 0.12);
    this.sweep(600, 120, 0.34, 'sine', 0.09);
  },
  sfxDolphin() { this.arp([98, 105, 100, 108, 103], 0.035, 'sine', 0.10); },
  sfxBubble()  { this.sweep(420, 1050, 0.13, 'sine', 0.08); },
  sfxCarve()   { this.sweep(300, 760, 0.16, 'triangle', 0.09); },
  sfxGasp()    { this.sweep(240, 700, 0.20, 'sawtooth', 0.10); },
  sfxRogue() {
    if (!this.ctx) return;
    this.noise(this.ctx.currentTime, 0.8, 0.14);
    this.sweep(140, 520, 0.7, 'sawtooth', 0.13);
  },
};
