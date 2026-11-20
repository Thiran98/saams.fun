// All the game's sounds, made in the browser with the Web Audio API (no sound files to download, nothing copied).
// Background: birds and a soft breeze by day, crickets and frogs at night. Effects: the bus engine and horn,
// the meeting bell, attacks, coins, tricks, votes, morning and the end of the match.
// Browsers only allow sound after the player has clicked or pressed a key, so it starts on the first gesture.
// The speaker button (bottom left) turns it on and off; the choice is remembered in this browser.

VM.sound = {
  ctx: null,
  master: null,
  muted: false,
  mode: 'off',     // background: off | day | night
  timers: [],

  init() {
    try { this.muted = localStorage.getItem('sams-gama-mute') === '1'; this.musicOff = localStorage.getItem('sams-gama-music-off') === '1'; } catch (e) { /* private mode */ }
    const unlock = () => {
      this.start();
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  },

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(this.ctx.destination);
    this.noiseBuf = this.makeNoise();
    if (this.mode !== 'off') this.ambient(this.mode, true);
  },

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('sams-gama-mute', m ? '1' : '0'); } catch (e) { /* private mode */ }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
    this.showButton();
    if (!m) this.start();
  },

  showButton() {
    const btn = document.getElementById('soundbtn');
    if (!btn) return;
    btn.textContent = this.muted ? '🔇' : '🔊';
    btn.title = this.muted ? 'Sound is off (click to turn on)' : 'Sound is on (click to turn off)';
  },

  ready() { return this.ctx && this.ctx.state === 'running' && !this.muted; },

  makeNoise() {
    const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  },

  // ------------------------------------------------------------------ building blocks
  // a tone that starts at `f`, glides to `f2`, with a quick attack and a decay
  tone(f, dur, opts) {
    if (!this.ready()) return;
    const o = opts || {}, c = this.ctx, t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(o.out || this.master);
    osc.start(t); osc.stop(t + dur + 0.05);
  },

  // a burst of filtered noise (thuds, swishes, splashes)
  noise(dur, opts) {
    if (!this.ready()) return;
    const o = opts || {}, c = this.ctx, t = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noiseBuf;
    f.type = o.filter || 'lowpass'; f.frequency.value = o.freq || 800; f.Q.value = o.q || 1;
    g.gain.setValueAtTime(o.vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.out || this.master);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  },

  // an elephant's trumpet: a brassy blast that jumps up, wobbles and breaks, with breath noise
  trumpet(vol) {
    if (!this.ready()) return;
    const c = this.ctx, t = c.currentTime, dur = 1.25;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 1.4;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.08); g.gain.setValueAtTime(vol, t + 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    bp.connect(g); g.connect(this.master);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 9; lg.gain.value = 28; lfo.connect(lg);
    [1, 1.5, 2.02].forEach((m, k) => {
      const o = c.createOscillator(), og = c.createGain(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(330 * m, t); o.frequency.exponentialRampToValueAtTime(620 * m, t + 0.18);
      o.frequency.setValueAtTime(620 * m, t + 0.7); o.frequency.exponentialRampToValueAtTime(470 * m, t + dur);
      lg.connect(o.frequency); og.gain.value = [0.6, 0.3, 0.2][k]; o.connect(og); og.connect(bp);
      o.start(t); o.stop(t + dur + 0.05);
    });
    lfo.start(t); lfo.stop(t + dur + 0.05);
    this.noise(dur, { filter: 'bandpass', freq: 1800, q: 0.7, vol: vol * 0.25 });
  },

  // ------------------------------------------------------------------ effects
  play(name) {
    if (!this.ready()) return;
    switch (name) {
      case 'click': this.tone(660, 0.06, { vol: 0.08, type: 'triangle' }); break;
      case 'clank': this.tone(240, 0.07, { vol: 0.12, type: 'square' }); this.tone(170, 0.1, { vol: 0.1, type: 'square', delay: 0.07 }); this.tone(120, 0.12, { vol: 0.08, type: 'square', delay: 0.16 }); break; // a bit falls off the bus
      case 'seat': this.tone(520, 0.12, { vol: 0.12, type: 'triangle' }); this.tone(780, 0.16, { vol: 0.1, type: 'triangle', delay: 0.08 }); break;
      case 'task': this.tone(880, 0.1, { vol: 0.1 }); this.tone(1320, 0.14, { vol: 0.08, delay: 0.07 }); break;
      case 'error': this.tone(220, 0.18, { vol: 0.12, type: 'square', f2: 180 }); break;
      case 'horn': // the bus horn: two notes together
        for (const f of [392, 494]) this.tone(f, 0.55, { vol: 0.1, type: 'sawtooth', attack: 0.02 });
        for (const f of [392, 494]) this.tone(f, 0.4, { vol: 0.1, type: 'sawtooth', attack: 0.02, delay: 0.65 });
        break;
      case 'bell': // the village bell under the big tree: a bright bell with long ringing partials
        for (let k = 0; k < 3; k++) for (const [f, v] of [[523, 0.25], [1046, 0.12], [1567, 0.08], [2093, 0.05]]) this.tone(f, 2.2, { vol: v, delay: k * 0.7, attack: 0.005 });
        break;
      case 'kill': // a dull thud and a gasp
        this.tone(90, 0.5, { vol: 0.5, f2: 40 }); this.noise(0.4, { freq: 400, vol: 0.4 });
        this.noise(0.5, { filter: 'bandpass', freq: 1200, q: 3, vol: 0.12, delay: 0.15 });
        break;
      case 'loot': // coins
        for (let k = 0; k < 4; k++) this.tone(1800 + Math.random() * 900, 0.12, { vol: 0.08, type: 'square', delay: k * 0.07 });
        break;
      case 'trick': // a sly little swish
        this.noise(0.35, { filter: 'bandpass', freq: 2500, q: 2, vol: 0.18 }); this.tone(600, 0.3, { vol: 0.07, f2: 300, type: 'triangle' });
        break;
      case 'vote': this.tone(440, 0.08, { vol: 0.12, type: 'square' }); this.tone(660, 0.1, { vol: 0.1, type: 'square', delay: 0.06 }); break;
      case 'verdict': // a drum roll and a hit
        for (let k = 0; k < 10; k++) this.noise(0.08, { freq: 300, vol: 0.18 + k * 0.02, delay: k * 0.06 });
        this.tone(110, 0.8, { vol: 0.4, f2: 70, delay: 0.65 }); this.noise(0.6, { freq: 600, vol: 0.3, delay: 0.65 });
        break;
      case 'morning': // a rooster-like call
        this.tone(700, 0.18, { vol: 0.12, type: 'sawtooth', f2: 900 });
        this.tone(900, 0.5, { vol: 0.1, type: 'sawtooth', f2: 600, delay: 0.2 });
        break;
      case 'night': this.tone(196, 2.5, { vol: 0.2, attack: 0.05 }); this.tone(294, 2.5, { vol: 0.08, attack: 0.05 }); break; // a low gong
      case 'elephant': this.trumpet(0.12); break;   // a trumpet far away
      case 'trumpet': this.trumpet(0.45); break;    // an elephant charging close by
      case 'buzz': this.tone(205, 0.55, { vol: 0.05, type: 'sawtooth', f2: 225, attack: 0.08 }); this.tone(212, 0.55, { vol: 0.04, type: 'sawtooth', f2: 198, attack: 0.08 }); break; // the swarm
      case 'sting': this.tone(1400, 0.07, { vol: 0.12, type: 'square', f2: 900 }); break;
      case 'stomp': this.tone(55, 0.35, { vol: 0.35, f2: 35 }); this.noise(0.25, { freq: 160, vol: 0.25 }); break; // a heavy footstep
      case 'gun': this.noise(0.25, { freq: 2500, vol: 0.6 }); this.tone(80, 0.4, { vol: 0.5, f2: 40 }); this.noise(0.8, { freq: 600, vol: 0.15, delay: 0.1 }); break;
      case 'splash': this.noise(0.6, { filter: 'bandpass', freq: 900, q: 0.8, vol: 0.4 }); this.tone(300, 0.25, { vol: 0.12, f2: 120 }); break;
      case 'reveal': this.tone(55, 2.2, { vol: 0.5, attack: 0.02 }); this.noise(1.2, { freq: 200, vol: 0.3 }); break; // a deep boom
      case 'win': [523, 659, 784, 1046].forEach((f, k) => this.tone(f, 0.5, { vol: 0.14, type: 'triangle', delay: k * 0.15 })); break;
      case 'lose': [392, 349, 311, 262].forEach((f, k) => this.tone(f, 0.6, { vol: 0.14, type: 'triangle', delay: k * 0.22 })); break;
      default:
    }
  },

  // ------------------------------------------------------------------ music on the bus
  // An original loop in the style of a Sri Lankan "bus DJ" remix: fast four-on-the-floor kick, claps, open hi-hats on
  // the off-beat, a bouncy bass and a catchy synth lead over Am - F - C - G. (Written for this game, not copied.)
  setMusic(on) {
    this.musicOff = !on;
    try { localStorage.setItem('sams-gama-music-off', on ? '0' : '1'); } catch (e) { /* private mode */ }
    if (!on) this.music(false);
    else if (VM.journeyOn) this.music(true);
  },

  music(on) {
    if (on && this.musicOff) return;
    if (this.ownSong && Date.now() - this.ownSong.at > VM.ownSong.HOURS * 3600000) VM.ownSong.clear(); // 24 hours are up
    // the bus song: a temporary song from the game server if there is one, otherwise the site's bus song
    // (assets/sounds/bus-song.mp3 on saams.fun), unless this player chose their own song
    const serverSong = !this.ownSong && (this.busSongOn && VM.net ? VM.net.api('bus-song') : (this.siteSongOk !== false ? 'assets/sounds/bus-song.mp3' : null));
    if (serverSong) {
      if (!on) { if (this.songEl) this.songEl.pause(); return; }
      if (!this.songEl) { this.songEl = new Audio(); this.songEl.loop = true; }
      if (this.songEl.dataset.src !== serverSong) {
        this.songEl.src = serverSong; this.songEl.dataset.src = serverSong;
        // the song file is missing (for example on the cloud server's own address): use the game's tune instead
        this.songEl.onerror = () => { if (this.songEl.dataset.src === 'assets/sounds/bus-song.mp3') { this.siteSongOk = false; this.songEl.dataset.src = ''; if (VM.journeyOn) this.music(true); } };
      }
      this.songEl.volume = 0.85;
      this.songEl.currentTime = 0;
      this.songEl.play().catch(() => { const tap = document.getElementById('tapmusic'); if (tap && VM.journeyOn) tap.hidden = false; });
      return;
    }
    if (this.ownSong) { // the player's own song file (only on this device)
      if (!on) { if (this.songEl) this.songEl.pause(); return; }
      if (!this.songEl) { this.songEl = new Audio(); this.songEl.loop = true; }
      if (this.songEl.src !== this.ownSong.url) this.songEl.src = this.ownSong.url;
      this.songEl.volume = 0.85;
      this.songEl.currentTime = 0;
      this.songEl.play().catch(() => { // the browser wants a tap first: show "Tap for bus music"
        const tap = document.getElementById('tapmusic');
        if (tap && VM.journeyOn) tap.hidden = false;
      });
      return;
    }
    if (!on) {
      if (this.mus) { clearInterval(this.mus.timer); this.mus.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.4); this.mus = null; }
      return;
    }
    if (!this.ctx || this.mus) return;
    const c = this.ctx, g = c.createGain();
    g.gain.value = 0.55; g.connect(this.master); // loud enough over the engine
    const BPM = 132, step = 60 / BPM / 4; // 16th notes
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const roots = [45, 41, 48, 43];       // A, F, C, G (bass)
    const chords = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]];
    const _ = 0;
    const lead = [
      [76, _, _, 74, _, 72, _, 74, 76, _, 79, _, 76, _, 74, _],
      [72, _, _, 72, _, 74, _, 76, 74, _, 72, _, 69, _, _, _],
      [77, _, _, 76, _, 74, _, 72, 74, _, 76, _, 77, _, 79, _],
      [79, _, 76, _, 74, _, 72, _, 74, _, _, _, 69, _, 72, 74],
    ];
    const bassSteps = { 0: 0, 3: 12, 6: 0, 8: 0, 11: 12, 14: 7 };
    const note = (f, t, dur, type, vol, cutoff) => {
      const o = c.createOscillator(), e = c.createGain(), fl = c.createBiquadFilter();
      o.type = type; o.frequency.value = f;
      fl.type = 'lowpass'; fl.frequency.value = cutoff || 3000;
      e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(vol, t + 0.005); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(fl); fl.connect(e); e.connect(g); o.start(t); o.stop(t + dur + 0.02);
    };
    const hit = (t, freq, dur, vol, type) => {
      const src = c.createBufferSource(), fl = c.createBiquadFilter(), e = c.createGain();
      src.buffer = this.noiseBuf; fl.type = type || 'highpass'; fl.frequency.value = freq;
      e.gain.setValueAtTime(vol, t); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(fl); fl.connect(e); e.connect(g); src.start(t, Math.random()); src.stop(t + dur + 0.02);
    };
    const kick = (t) => {
      const o = c.createOscillator(), e = c.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      e.gain.setValueAtTime(0.9, t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(e); e.connect(g); o.start(t); o.stop(t + 0.3);
    };
    let n = 0, next = c.currentTime + 0.1;
    const schedule = () => {
      while (next < c.currentTime + 0.15) {
        const s = n % 16, bar = Math.floor(n / 16) % 4;
        if (s % 4 === 0) kick(next);
        if (s === 4 || s === 12) { hit(next, 1500, 0.14, 0.35, 'bandpass'); hit(next + 0.012, 1800, 0.1, 0.25, 'bandpass'); } // clap
        if (s % 4 === 2) hit(next, 7000, 0.12, 0.18);      // open hat on the off-beat
        else hit(next, 9000, 0.03, 0.05);                  // closed hat
        if (bassSteps[s] !== undefined) note(midi(roots[bar] + bassSteps[s]), next, step * 1.6, 'sawtooth', 0.28, 600);
        if (s === 2 || s === 10) chords[bar].forEach((m) => note(midi(m), next, step * 1.2, 'square', 0.035, 2200)); // offbeat chord stabs
        const m = lead[bar][s];
        if (m) { note(midi(m), next, step * 1.8, 'sawtooth', 0.07, 2600); note(midi(m + 12), next, step * 1.2, 'square', 0.025, 4000); }
        if (s === 0 && bar === 0 && n > 0) { const o = c.createOscillator(), e = c.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(200, next - step * 8); o.frequency.exponentialRampToValueAtTime(1200, next); e.gain.setValueAtTime(0.0001, next - step * 8); e.gain.exponentialRampToValueAtTime(0.03, next); e.gain.exponentialRampToValueAtTime(0.0001, next + 0.05); o.connect(e); e.connect(g); o.start(next - step * 8); o.stop(next + 0.1); } // riser
        next += step; n++;
      }
    };
    schedule();
    this.mus = { g, timer: setInterval(schedule, 40) };
  },

  // ------------------------------------------------------------------ the bus engine (during the ride)
  engine(on) {
    if (!on) {
      if (this.eng) { const e = this.eng; e.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3); setTimeout(() => { e.osc.stop(); e.src.stop(); e.lfo.stop(); }, 1500); this.eng = null; }
      return;
    }
    if (!this.ctx || this.eng) return;
    const c = this.ctx, g = c.createGain(), osc = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain();
    const f = c.createBiquadFilter(), src = c.createBufferSource();
    osc.type = 'sawtooth'; osc.frequency.value = 48;
    lfo.frequency.value = 9; lg.gain.value = 6; lfo.connect(lg); lg.connect(osc.frequency); // the engine rattle
    f.type = 'lowpass'; f.frequency.value = 380;
    src.buffer = this.noiseBuf; src.loop = true;
    const ng = c.createGain(); ng.gain.value = 0.25;
    osc.connect(f); src.connect(ng); ng.connect(f); f.connect(g); g.connect(this.master);
    g.gain.value = 0.0001; g.gain.setTargetAtTime(0.08, c.currentTime, 0.4);
    osc.start(); lfo.start(); src.start();
    this.eng = { g, osc, lfo, src, f };
  },
  // the engine works harder when the bus speeds up (0 = still, 1 = full speed)
  engineSpeed(k) {
    if (!this.eng) return;
    this.eng.osc.frequency.setTargetAtTime(44 + k * 40, this.ctx.currentTime, 0.2);
    this.eng.f.frequency.setTargetAtTime(300 + k * 500, this.ctx.currentTime, 0.2);
  },

  // ------------------------------------------------------------------ background: birds by day, crickets at night
  ambient(mode, force) {
    if (mode === this.mode && !force) return;
    this.mode = mode;
    if (this.areaName) { const a = this.areaName; this.areaName = null; setTimeout(() => this.area(a), 50); } // day/night versions
    this.timers.forEach(clearTimeout); this.timers = [];
    if (this.amb) { const a = this.amb; a.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.5); setTimeout(() => a.src.stop(), 2500); this.amb = null; }
    if (!this.ctx || mode === 'off') return;
    // a soft bed of sound: a breeze by day, a deeper hum at night
    const c = this.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noiseBuf; src.loop = true;
    f.type = mode === 'day' ? 'bandpass' : 'lowpass'; f.frequency.value = mode === 'day' ? 500 : 250; f.Q.value = 0.6;
    g.gain.value = 0.0001; g.gain.setTargetAtTime(mode === 'day' ? 0.05 : 0.04, c.currentTime, 1);
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
    this.amb = { src, g };
    const loop = (fn, min, max) => {
      const next = () => { fn(); this.timers.push(setTimeout(next, min + Math.random() * (max - min))); };
      this.timers.push(setTimeout(next, Math.random() * max));
    };
    if (mode === 'day') {
      loop(() => this.bird(), 1200, 4200);
      loop(() => this.bird(true), 3000, 9000);
    } else {
      loop(() => this.cricket(), 500, 1300);
      loop(() => this.frog(), 2500, 7000);
      loop(() => { if (Math.random() < 0.35) this.play('elephant'); }, 15000, 30000);
    }
  },

  // ------------------------------------------------------------------ the sound of the place you are in
  // river: flowing water · beach: waves · jungle: deep forest (birds, monkeys / insects, owls) · fields: wind and crows
  // (frogs at night) · farm: cows and hens · square: people talking · village: nothing extra
  area(name) {
    if (name === this.areaName || !this.ctx) { this.areaName = name; return; }
    this.areaName = name;
    (this.areaTimers || []).forEach(clearTimeout); this.areaTimers = [];
    if (this.areaBed) { const a = this.areaBed; a.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.6); setTimeout(() => { a.src.stop(); if (a.lfo) a.lfo.stop(); }, 3000); this.areaBed = null; }
    const night = this.mode === 'night';
    const loop = (fn, min, max) => {
      const next = () => { fn(); this.areaTimers.push(setTimeout(next, min + Math.random() * (max - min))); };
      this.areaTimers.push(setTimeout(next, 300 + Math.random() * min));
    };
    // a steady bed of filtered noise, optionally swelling slowly (waves)
    const bed = (type, freq, q, vol, swell) => {
      const c = this.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = this.noiseBuf; src.loop = true;
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      g.gain.value = 0.0001; g.gain.setTargetAtTime(vol, c.currentTime, 0.8);
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      let lfo = null;
      if (swell) {
        lfo = c.createOscillator(); const lg = c.createGain();
        lfo.frequency.value = swell; lg.gain.value = vol * 0.9; lfo.connect(lg); lg.connect(g.gain); lfo.start();
      }
      this.areaBed = { src, g, lfo };
    };
    switch (name) {
      case 'river':
        bed('bandpass', 1400, 0.7, 0.06, 0.3);
        loop(() => this.tone(500 + Math.random() * 500, 0.08, { vol: 0.05, f2: 1200 }), 400, 1400); // little plops
        break;
      case 'beach':
        bed('lowpass', 700, 0.5, 0.12, 0.13); // waves rolling in and out
        if (!night) loop(() => this.tone(1500, 0.25, { vol: 0.04, f2: 1100, type: 'triangle' }), 4000, 9000); // gulls far away
        break;
      case 'jungle':
        bed('bandpass', night ? 5000 : 3000, 2, night ? 0.035 : 0.025);
        if (night) {
          loop(() => { this.tone(380, 0.35, { vol: 0.08, f2: 330 }); this.tone(380, 0.5, { vol: 0.07, f2: 320, delay: 0.5 }); }, 6000, 14000); // an owl
          loop(() => this.cricket(), 250, 700);
        } else {
          loop(() => { this.tone(600, 0.25, { vol: 0.07, f2: 900 }); this.tone(700, 0.35, { vol: 0.07, f2: 1100, delay: 0.3 }); }, 3000, 7000); // a koel-like call
          loop(() => { for (let k = 0; k < 5; k++) this.tone(900 + Math.random() * 600, 0.06, { vol: 0.05, type: 'square', delay: k * 0.08 }); }, 8000, 18000); // monkeys chattering
          loop(() => this.bird(), 800, 2500);
        }
        break;
      case 'fields':
        bed('highpass', 2500, 0.3, 0.025, 0.2); // wind through the paddy
        if (night) loop(() => this.frog(), 600, 1800);
        else loop(() => { this.tone(420, 0.22, { vol: 0.07, type: 'sawtooth', f2: 360 }); }, 5000, 12000); // a crow
        break;
      case 'farm':
        if (!night) {
          loop(() => this.tone(150, 1.1, { vol: 0.12, type: 'sawtooth', f2: 110, attack: 0.2 }), 6000, 14000); // a cow
          loop(() => { for (let k = 0; k < 3; k++) this.tone(800 + Math.random() * 200, 0.07, { vol: 0.05, type: 'square', f2: 600, delay: k * 0.13 }); }, 2500, 6000); // hens
        }
        break;
      case 'square':
        if (!night) {
          bed('bandpass', 450, 3, 0.03, 0.7); // people talking
          loop(() => this.tone(250 + Math.random() * 120, 0.18, { vol: 0.035, type: 'triangle', f2: 200 + Math.random() * 150 }), 700, 2200);
        }
        break;
      default:
    }
  },

  bird(other) {
    const base = other ? 1800 : 2600 + Math.random() * 1200;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) this.tone(base, 0.09, { vol: 0.035, f2: base * (other ? 0.7 : 1.35), delay: k * 0.12 });
  },
  cricket() {
    for (let k = 0; k < 3; k++) this.tone(4400 + Math.random() * 200, 0.035, { vol: 0.02, type: 'square', delay: k * 0.05 });
  },
  frog() {
    this.tone(140 + Math.random() * 40, 0.16, { vol: 0.07, type: 'square', f2: 110 });
    this.tone(150 + Math.random() * 40, 0.14, { vol: 0.06, type: 'square', f2: 115, delay: 0.22 });
  },
};

VM.sound.init();

// The in-game menu (☰): sound effects, bus music, the narrator's voice, how to play, leave the game.
VM.gameMenu = {
  el: document.getElementById('gamemenu'),
  open() {
    const s = VM.sound;
    document.getElementById('gm-sound').checked = !s.muted;
    document.getElementById('gm-music').checked = !s.musicOff;
    document.getElementById('gm-leave').hidden = !VM.game;
    if (VM.mafia && VM.mafia.fillVoices) VM.mafia.fillVoices();
    this.el.hidden = false;
  },
  close() { this.el.hidden = true; },
};
document.getElementById('menubtn').addEventListener('click', () => VM.gameMenu.open());
document.getElementById('gm-close').addEventListener('click', () => VM.gameMenu.close());
document.getElementById('gamemenu').addEventListener('click', (e) => { if (e.target.id === 'gamemenu') VM.gameMenu.close(); });
document.getElementById('gm-sound').addEventListener('change', (e) => VM.sound.setMuted(!e.target.checked));
document.getElementById('gm-music').addEventListener('change', (e) => VM.sound.setMusic(e.target.checked));
document.getElementById('gm-howto').addEventListener('click', () => { VM.gameMenu.close(); if (VM.showHelp) VM.showHelp(); });
document.getElementById('gm-leave').addEventListener('click', () => {
  if (!confirm('Leave the game and go back to the menu?')) return;
  try { sessionStorage.removeItem('sams-gama-seat'); sessionStorage.removeItem('sams-gama-auto'); } catch (e) { /* private mode */ }
  if (VM.net && VM.net.room) VM.net.room.leave(true);
  setTimeout(() => location.reload(), 300);
});

// ---------------------------------------------------------------- "My own bus song" (kept in this browser only)
// It switches back to the game's own tune 24 hours after it was chosen.
VM.ownSong = {
  HOURS: 24 * 365 * 10, // kept until the player switches back to the game's tune
  db() {
    return new Promise((ok, fail) => {
      const r = indexedDB.open('sams-gama', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fail(r.error);
    });
  },
  async save(file) {
    try { const db = await this.db(); db.transaction('files', 'readwrite').objectStore('files').put({ blob: file, name: file.name, at: Date.now() }, 'busSong'); } catch (e) { /* storage blocked: it still works until the page closes */ }
    this.use(file, file.name, Date.now());
  },
  async load() {
    try {
      const db = await this.db();
      const rec = await new Promise((ok) => { const q = db.transaction('files').objectStore('files').get('busSong'); q.onsuccess = () => ok(q.result); q.onerror = () => ok(null); });
      if (rec && rec.blob) {
        if (rec.at && Date.now() - rec.at > this.HOURS * 3600000) { this.clear(); return; } // older than 24 hours
        this.use(rec.blob, rec.name, rec.at || Date.now());
      }
    } catch (e) { /* private mode: no saved song */ }
  },
  async clear() {
    try { const db = await this.db(); db.transaction('files', 'readwrite').objectStore('files').delete('busSong'); } catch (e) { /* ignore */ }
    if (VM.sound.ownSong) URL.revokeObjectURL(VM.sound.ownSong.url);
    VM.sound.ownSong = null;
    if (VM.sound.songEl) VM.sound.songEl.pause();
    this.show();
  },
  use(blob, name, at) {
    if (VM.sound.ownSong) URL.revokeObjectURL(VM.sound.ownSong.url);
    VM.sound.ownSong = { url: URL.createObjectURL(blob), name: name || 'My song', at: at || Date.now() };
    this.show();
  },
  show() {
    const s = VM.sound.ownSong;
    const left = s ? Math.max(0, Math.ceil((s.at + this.HOURS * 3600000 - Date.now()) / 3600000)) : 0;
    document.getElementById('gm-song-name').textContent = s ? s.name + ' (' + left + ' h left)' : "The game's own tune";
    document.getElementById('gm-song-clear').hidden = !s;
    document.getElementById('gm-song-pick').textContent = s ? 'Choose another' : 'Choose my song';
  },
};
document.getElementById('gm-song-pick').addEventListener('click', () => document.getElementById('gm-song-file').click());
document.getElementById('gm-song-file').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) VM.ownSong.save(f); e.target.value = ''; });
document.getElementById('gm-song-clear').addEventListener('click', () => VM.ownSong.clear());
VM.ownSong.load();

// Does the game server have a temporary bus song right now? (asked once the server's address is known)
window.addEventListener('load', () => {
  if (!VM.net || !VM.net.online) return;
  VM.net.locate().then(() => fetch(VM.net.api('bus-song-status'), { cache: 'no-store' })).then((r) => r.json())
    .then((j) => { VM.sound.busSongOn = !!j.on; }).catch(() => { VM.sound.busSongOn = false; });
});
