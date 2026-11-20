// The bus ride to the village at the start of every online match, then the black screen with your secret role.
// Everyone sees the ride at the same time (it starts when the server sends "matchStart") while the server deals
// the roles ("Roles being dealt", 40 seconds). The pictures are drawn here with plain canvas shapes.
// Route: Pettah bus stand (Colombo) → Kegalle (paddy fields and tanks) → Kandy (a temple) → Deniyaya's
// tea hills → the jungle → Berala Panathara, the village (Sams Gama).

VM.journey = {
  RIDE: 37,    // seconds the bus drives (with the stop and the fade: 40 seconds)
  HOLD: 1.5,   // seconds it waits at the village gate
  FADE: 1.5,   // seconds to fade to black
  D: 12600,    // how far the road goes (logical pixels)

  // Places shown at the bottom left while the bus passes them (u = how far along the ride, 0 to 1)
  PLACES: [
    { u: 0.0, small: 'University of Moratuwa', text: 'All aboard! The bus to Sams Gama is leaving' },
    { u: 0.13, small: 'Now passing', text: 'Pettah' },
    { u: 0.25, small: 'Now passing', text: 'Hikkaduwa beach' },
    { u: 0.37, small: 'Evening', text: 'Galle Fort: disco lights on the bus!' },
    { u: 0.54, small: 'Night', text: 'Through Akuressa in the dark' },
    { u: 0.68, small: 'Night', text: 'Deniyaya and its tea hills' },
    { u: 0.84, small: 'Sunrise', text: 'Morning in the jungle: Berala Panathara' },
  ],

  // the ride leaves by day, drives through the night and arrives in the morning
  night(u) {
    if (u < 0.36) return 0;
    if (u < 0.48) return (u - 0.36) / 0.12;
    if (u < 0.78) return 1;
    if (u < 0.92) return 1 - (u - 0.78) / 0.14;
    return 0;
  },
  dawn(u) { return u < 0.76 || u > 1 ? 0 : u < 0.88 ? (u - 0.76) / 0.12 : Math.max(0, 1 - (u - 0.88) / 0.12); },
  dusk(u) { return u < 0.3 ? 0 : u < 0.4 ? (u - 0.3) / 0.1 : Math.max(0, 1 - (u - 0.4) / 0.1); },

  ease(u) { return (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, u)))) / 2; },

  play(riders, done) {
    this.stop();
    VM.journeyOn = true;
    this.riders = riders.slice(0, 12);
    this.done = done;
    this.el = document.getElementById('journey');
    this.canvas = document.getElementById('journey-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.place = document.getElementById('journey-place');
    this.el.hidden = false;
    document.getElementById('lobby').hidden = true;
    VM.sound.start();
    VM.sound.play('horn');
    VM.sound.music(true); // bus DJ music all the way to the village
    // the browser blocks sound until the player clicks: then one tap starts the music
    const tap = document.getElementById('tapmusic');
    const blocked = !VM.sound.muted && (!VM.sound.ctx || VM.sound.ctx.state !== 'running');
    tap.hidden = !blocked;
    tap.onclick = () => {
      VM.sound.start();
      if (VM.sound.ctx) VM.sound.ctx.resume().then(() => { VM.sound.music(true); });
      tap.hidden = true;
    };
    document.getElementById('journey-skip').onclick = () => this.finish();
    this.resize();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.build();
    this.placeIndex = -1;
    this.t0 = performance.now();
    const frame = (now) => {
      if (!this.el || this.el.hidden) return;
      const t = (now - this.t0) / 1000;
      try { this.draw(t); } catch (e) { console.warn('ride frame', e); }   // a bad frame never stops the ride
      if (t >= this.RIDE + this.HOLD + this.FADE) { this.finish(); return; }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
    // whatever happens (a slow phone, a hidden tab), the ride ends and the game goes on
    clearTimeout(this.safety);
    this.safety = setTimeout(() => this.finish(), (this.RIDE + this.HOLD + this.FADE + 3) * 1000);
  },

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    VM.sound.engine(false);
    VM.sound.music(false);
    document.getElementById('tapmusic').hidden = true;
    if (this.el) this.el.hidden = true;
    clearTimeout(this.placeTimer);
  },

  finish() {
    if (!this.el || this.el.hidden) return;
    this.stop();
    const cb = this.done;
    this.done = null;
    if (cb) cb();
  },

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth || 800, h = window.innerHeight || 600; // never zero (a hidden window)
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    // everything is drawn on a 540-pixel-high stage, as wide as the screen needs (never narrower than 400, so the bus fits on a phone)
    this.scale = Math.min(this.canvas.height / 540, this.canvas.width / 400);
    this.W = this.canvas.width / this.scale;
    this.H = this.canvas.height / this.scale;
    this.top = (this.H - 540) / 2; // extra space on tall phone screens goes above (sky) and below (grass)
  },

  // Where to put something so it is level with the bus when the ride is `u` along (p = parallax: far away < 1)
  at(u, p, off) { return this.busMid + p * this.D * this.ease(u) + (off || 0); },

  build() {
    this.busX = Math.min(this.W - 305, Math.max(90, this.W * 0.22)); // room behind the bus for its smoke
    this.busMid = this.busX + 150;
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const o = [];
    const cityColours = ['#e9d7b4', '#cfd9e6', '#f0c9a8', '#d8e5c9', '#e7c0c0', '#c9c4e0', '#f2e6a6'];
    // University of Moratuwa: the university buildings and its sign, where the bus starts
    o.push({ kind: 'uni', p: 0.65, x: this.at(0.0, 0.65, 330) });
    o.push({ kind: 'shelter', p: 1, x: this.busMid + 40 });
    o.push({ kind: 'uniwall', p: 1, x: this.at(0.0, 1, 420) }); // the long sign wall at the entrance
    // Pettah: busy market streets, the striped red mosque, the Lotus Tower behind
    o.push({ kind: 'tower', p: 0.42, x: this.at(0.16, 0.42) });
    for (let x = this.at(0.11, 0.6); x < this.at(0.2, 0.6); x += 70 + rnd() * 70) {
      o.push({ kind: 'building', p: 0.6, x, w: 60 + rnd() * 70, h: 70 + rnd() * 150, c: cityColours[Math.floor(rnd() * cityColours.length)] });
    }
    o.push({ kind: 'mosque', p: 0.7, x: this.at(0.155, 0.7) });
    o.push({ kind: 'sign', p: 1, x: this.at(0.15, 1, 300), text: 'Pettah', sub: 'Galle 120 km' });
    // Hikkaduwa: the sea, surfers and a turtle on the beach
    o.push({ kind: 'sea', p: 0.6, x: this.at(0.21, 0.6, -150), w: this.D * 0.6 * 0.3 + this.W * 2 });
    o.push({ kind: 'surfer', p: 0.6, x: this.at(0.24, 0.6, 120) });
    o.push({ kind: 'surfer', p: 0.6, x: this.at(0.27, 0.6, 380) });
    o.push({ kind: 'turtle', p: 1, x: this.at(0.25, 1, 260) });
    o.push({ kind: 'sign', p: 1, x: this.at(0.24, 1, 320), text: 'Hikkaduwa', sub: 'Galle 20 km' });
    for (let x = this.at(0.19, 0.85); x < this.at(0.45, 0.85); x += 120 + rnd() * 150) o.push({ kind: 'palm', p: 0.85, x, h: 90 + rnd() * 60, lean: rnd() * 0.6 - 0.3 });
    // Galle: the fort walls, the lighthouse and the clock tower
    o.push({ kind: 'fort', p: 0.7, x: this.at(0.38, 0.7) });
    o.push({ kind: 'sign', p: 1, x: this.at(0.37, 1, 360), text: 'Galle', sub: 'Akuressa 30 km' });
    // Akuressa: the Nilwala river and paddy fields
    o.push({ kind: 'paddy', p: 1, x: this.at(0.5, 1, -200), w: 900 });
    o.push({ kind: 'river', p: 0.9, x: this.at(0.55, 0.9), w: 700 });
    o.push({ kind: 'paddy', p: 1, x: this.at(0.59, 1), w: 700 });
    o.push({ kind: 'sign', p: 1, x: this.at(0.54, 1, 260), text: 'Akuressa', sub: 'Deniyaya 40 km' });
    // Deniyaya: tea hills and the rainforest
    for (let x = this.at(0.64, 0.5); x < this.at(0.8, 0.5); x += 260 + rnd() * 120) o.push({ kind: 'tea', p: 0.5, x, w: 360 + rnd() * 200, h: 90 + rnd() * 60 });
    o.push({ kind: 'sign', p: 1, x: this.at(0.68, 1, 220), text: 'Deniyaya', sub: 'Berala Panathara 12 km' });
    // the jungle and the village gate
    for (let x = this.at(0.78, 0.9); x < this.at(1, 0.9, this.W * 1.5); x += 34 + rnd() * 40) o.push({ kind: 'tree', p: 0.9, x, h: 150 + rnd() * 120, s: rnd() });
    o.push({ kind: 'gate', p: 1, x: this.at(1, 1, 210) });
    for (let x = this.at(0.82, 1.25); x < this.at(1, 1.25, this.W * 1.5); x += 160 + rnd() * 220) {
      const endX = x - this.D * 1.25; // where it stands on screen when the bus stops: never in front of the bus or the gate
      if (endX < this.busX - 80 || endX > this.busMid + 340) o.push({ kind: 'tree', p: 1.25, x, h: 220 + rnd() * 120, s: rnd(), front: true });
    }
    for (let x = 0; x < this.D * 1.3 + this.W * 2; x += 40 + rnd() * 90) o.push({ kind: 'tuft', p: 1.3, x, s: rnd() });
    o.sort((a, b) => a.p - b.p);
    this.objects = o;
  },

  // ------------------------------------------------------------------ one frame
  draw(t) {
    const c = this.ctx, W = this.W;
    const u = Math.min(1, t / this.RIDE);
    const cam = this.D * this.ease(u);
    const moving = t < this.RIDE;
    this.uNow = u;
    VM.sound.engineSpeed(moving ? Math.sin(Math.PI * u) : 0);
    c.setTransform(this.scale, 0, 0, this.scale, 0, this.scale * this.top);

    // sky: bright morning, then the green shade of the jungle
    const j = Math.max(0, (u - 0.8) / 0.2) * 0.5;
    const nt = this.night(u), dw = this.dawn(u), dk = this.dusk(u);
    const g = c.createLinearGradient(0, -this.top, 0, 330);
    let top = this.mix(this.mix('#5fb6ec', '#2f5f46', j), '#0a0f2e', nt), bottom = this.mix(this.mix('#d9f1fb', '#7fae84', j), '#1d2a5a', nt);
    top = this.mix(top, '#e8743b', dk * 0.6); bottom = this.mix(bottom, '#ffb36b', Math.max(dk, dw) * 0.8);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g;
    c.fillRect(0, -this.top, W, 330 + this.top);
    if (nt > 0) { // stars
      c.fillStyle = 'rgba(255,255,255,' + nt + ')';
      for (let i = 0; i < 60; i++) { const sx = (i * 137.5) % W, sy = -this.top + ((i * 71) % (230 + this.top)); c.fillRect(sx, sy, 2, 2); }
      c.fillStyle = 'rgba(245,240,210,' + nt + ')'; c.beginPath(); c.arc(W * 0.18, 60, 22, 0, Math.PI * 2); c.fill(); // the moon
    }
    // the sun (sets in the evening, rises at dawn) and a few clouds
    const sunY = 70 + dk * 180 + (u > 0.48 && u < 0.85 ? 400 : 0) + (dw > 0 && u < 0.9 ? (1 - dw) * 180 : 0);
    c.fillStyle = 'rgba(255, 236, 150, ' + (1 - nt) + ')';
    c.beginPath(); c.arc(W * 0.82, sunY, 34, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,' + 0.85 * (1 - j) + ')';
    for (let i = 0; i < 5; i++) {
      const x = ((i * 420 - cam * 0.08) % (W + 300) + W + 300) % (W + 300) - 150, y = 50 + (i % 3) * 38;
      this.cloud(x, y, 0.8 + (i % 2) * 0.4);
    }

    // far mountains: low behind Colombo, high and blue-green near Deniyaya
    const amp = 30 + 120 * Math.min(1, Math.max(0, (u - 0.2) / 0.5));
    c.fillStyle = this.mix('#9db8cf', '#4f7f63', Math.max(0, (u - 0.55) / 0.35));
    c.beginPath(); c.moveTo(0, 332);
    for (let x = 0; x <= W + 20; x += 20) {
      const wx = x + cam * 0.2;
      c.lineTo(x, 330 - amp * (0.55 + 0.3 * Math.sin(wx * 0.0042) + 0.15 * Math.sin(wx * 0.013 + 1.3)));
    }
    c.lineTo(W, 332); c.closePath(); c.fill();

    // things behind the road (sorted far to near), the road, the bus, then the things in front
    const back = this.objects.filter((o) => o.p <= 1 && !o.front);
    const far = back.filter((o) => o.kind === 'tower' || o.kind === 'building' || o.kind === 'tea');
    for (const o of far) this.thing(o, o.x - cam * o.p, u, t);
    this.verge(cam);
    for (const o of back) if (!far.includes(o)) this.thing(o, o.x - cam * o.p, u, t);
    this.road(cam, u);
    const dark = this.night(u);
    if (dark > 0) { c.fillStyle = 'rgba(6, 10, 32, ' + (0.62 * dark) + ')'; c.fillRect(0, 0, W, this.H); }
    for (const o of back) if (o.kind === 'sign' || o.kind === 'gate' || o.kind === 'uniwall') this.thing(o, o.x - cam * o.p, u, t, true);

    this.bus(this.busX, moving ? Math.sin(t * 15) * 1.3 : 0, cam, moving, t);

    for (const o of this.objects) if (o.p > 1) this.thing(o, o.x - cam * o.p, u, t);

    // the place names
    for (let i = this.PLACES.length - 1; i >= 0; i--) {
      if (u >= this.PLACES[i].u) {
        if (i !== this.placeIndex) this.showPlace(i);
        break;
      }
    }

    // fade to black at the end
    const f = (t - this.RIDE - this.HOLD) / this.FADE;
    if (f > 0) { c.fillStyle = 'rgba(0,0,0,' + Math.min(1, f) + ')'; c.fillRect(0, -this.top, W, this.H); }
  },

  showPlace(i) {
    this.placeIndex = i;
    const p = this.PLACES[i];
    this.place.querySelector('small').textContent = p.small;
    this.place.querySelector('b').textContent = p.text;
    this.place.classList.add('show');
    clearTimeout(this.placeTimer);
    this.placeTimer = setTimeout(() => this.place.classList.remove('show'), 3600);
  },

  verge(cam) {
    const c = this.ctx, W = this.W;
    // the verge: pavement in Colombo, grass in the country, dark jungle floor at the end
    const regions = [[-1, '#b8b1a2'], [0.19, '#ecd9a4'], [0.46, '#86c24e'], [0.8, '#3f7a2e']];
    for (let i = 0; i < regions.length; i++) {
      const a = i === 0 ? -1e6 : this.at(regions[i][0], 1) - cam - 300;
      const b = i === regions.length - 1 ? 1e6 : this.at(regions[i + 1][0], 1) - cam - 300;
      c.fillStyle = regions[i][1];
      c.fillRect(Math.max(0, a), 330, Math.min(W, b) - Math.max(0, a), 92);
    }
  },

  road(cam, u) {
    const c = this.ctx, W = this.W;
    // the road
    c.fillStyle = '#4d4b48'; c.fillRect(0, 420, W, 76);
    c.fillStyle = '#e9e4d6'; c.fillRect(0, 423, W, 3); c.fillRect(0, 490, W, 3);
    c.fillStyle = '#f2c230';
    for (let x = -((cam % 80) + 80) % 80; x < W; x += 80) c.fillRect(x, 456, 40, 4);
    // grass in front of the road
    c.fillStyle = u > 0.82 ? '#356a27' : '#5aa437';
    c.fillRect(0, 496, W, 44 + this.top + 10);
  },

  // ------------------------------------------------------------------ the bus
  bus(x, bob, cam, moving, t) {
    const c = this.ctx, y = 470 + bob; // y = bottom of the body
    // shadow
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.beginPath(); c.ellipse(x + 150, 488, 160, 8, 0, 0, Math.PI * 2); c.fill();
    // thick black diesel smoke from the exhaust pipe (darkest when the bus pulls away)
    if (moving) {
      const thick = 0.8 + 0.2 * Math.max(0, 1 - t / 4);
      c.fillStyle = '#222'; c.fillRect(x - 10, y - 12, 12, 5); // the exhaust pipe
      for (let i = 0; i < 12; i++) {
        const k = (((t * 1.1 + i / 12) % 1) + 1) % 1; // never negative (the first frame can have t a hair below 0)
        const grey = Math.round(12 + k * 55);
        c.fillStyle = 'rgba(' + grey + ',' + grey + ',' + grey + ',' + (thick * (1 - k)) + ')';
        c.beginPath();
        c.arc(x - 14 - k * 110 + Math.sin(i * 2.1 + t * 3) * 5, y - 10 - k * 70, 9 + k * 36, 0, Math.PI * 2);
        c.fill();
      }
    }
    // a red Langama (SLTB-style) bus: red all over (roof too), a white-blue-white stripe under the windows,
    // a thin silver line, silver window frames with a bar across
    this.round(x, y - 118, 300, 118, 14, '#d21c24');
    c.fillStyle = '#b5141b'; this.roundPath(x, y - 118, 300, 10, 10); c.fill();
    c.fillStyle = '#f4f4f4'; c.fillRect(x, y - 54, 300, 13);
    c.fillStyle = '#2b3fa8'; c.fillRect(x, y - 51, 300, 7);
    c.fillStyle = '#d7dbe0'; c.fillRect(x, y - 33, 300, 2);
    c.fillStyle = '#f4f4f4'; c.beginPath(); c.ellipse(x + 112, y - 47, 26, 12, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#2b3fa8'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#2b3fa8'; c.font = '900 13px "Segoe UI", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('SLTB', x + 112, y - 46);
    c.fillStyle = '#b5141b'; this.roundPath(x, y - 14, 300, 14, 6); c.fill();
    // at night the body goes dark (the lights inside and the headlight stay bright)
    const nb = this.night(this.uNow || 0);
    if (nb > 0) {
      c.fillStyle = 'rgba(6, 10, 32, ' + (0.5 * nb) + ')'; this.roundPath(x, y - 118, 300, 118, 14); c.fill();
      const beam = c.createLinearGradient(x + 300, 0, x + 520, 0);
      beam.addColorStop(0, 'rgba(255, 244, 180, ' + (0.45 * nb) + ')'); beam.addColorStop(1, 'rgba(255, 244, 180, 0)');
      c.fillStyle = beam; c.beginPath(); c.moveTo(x + 296, y - 22); c.lineTo(x + 520, y - 60); c.lineTo(x + 520, y + 20); c.lineTo(x + 296, y - 14); c.closePath(); c.fill();
    }
    // front: big windscreen and the destination board
    c.fillStyle = '#1d1d1d'; this.roundPath(x + 226, y - 114, 72, 16, 4); c.fill();
    c.fillStyle = '#ff9a2e'; c.font = '800 9px "Segoe UI", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('99 SAMS GAMA', x + 262, y - 106);
    c.fillStyle = '#9fd3ef'; this.roundPath(x + 262, y - 94, 34, 40, 6); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(x + 268, y - 90, 6, 30);
    // the door
    c.fillStyle = '#3a1416'; this.roundPath(x + 232, y - 92, 26, 84, 4); c.fill();
    c.fillStyle = '#9fd3ef'; c.fillRect(x + 236, y - 88, 18, 34);
    // passenger windows with the players inside (2 per window)
    for (let i = 0; i < 6; i++) {
      const wx = x + 12 + i * 36;
      c.fillStyle = '#c9ced6'; this.roundPath(wx - 2, y - 104, 36, 42, 4); c.fill(); // silver frame
      c.fillStyle = '#9fd3ef'; this.roundPath(wx, y - 102, 32, 38, 3); c.fill();
      if (nb > 0.15) { // disco lights inside the bus: colours chase from window to window
        const hue = (t * 240 + i * 55) % 360, flash = 0.55 + 0.45 * Math.sin(t * 18 + i * 1.7);
        c.fillStyle = 'hsla(' + hue + ', 95%, 58%, ' + (nb * flash) + ')'; this.roundPath(wx, y - 102, 32, 38, 3); c.fill();
        c.fillStyle = 'hsla(' + ((hue + 120) % 360) + ', 95%, 65%, ' + (nb * 0.25) + ')'; // light spilling out of the window
        c.beginPath(); c.ellipse(wx + 16, y - 83, 30, 26, 0, 0, Math.PI * 2); c.fill();
      }
      for (let k = 0; k < 2; k++) {
        const r = this.riders[i * 2 + k];
        if (!r) continue;
        const px = wx + 9 + k * 14, bounce = moving ? Math.sin(t * 15 + i + k) * 0.8 : 0;
        c.fillStyle = r.colour; c.fillRect(px - 6, y - 76 + bounce, 12, 12);        // shirt in the player's colour
        c.fillStyle = '#8d5a3b'; c.beginPath(); c.arc(px, y - 82 + bounce, 6, 0, Math.PI * 2); c.fill(); // face
        c.fillStyle = '#1f1612'; c.beginPath(); c.arc(px, y - 85 + bounce, 6, Math.PI, 0); c.fill();    // hair
      }
      c.fillStyle = '#c9ced6'; c.fillRect(wx, y - 89, 32, 2); // the bar across the window
      c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(wx + 3, y - 99, 3, 30);
    }
    // headlight and bumper
    c.fillStyle = '#fff6c8'; c.beginPath(); c.arc(x + 294, y - 18, 5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#333'; c.fillRect(x - 2, y - 8, 304, 6);
    // roof rack
    c.fillStyle = '#6b4a2b'; c.fillRect(x + 30, y - 124, 180, 4);
    c.fillStyle = '#c9a36b'; c.fillRect(x + 50, y - 134, 40, 10); c.fillStyle = '#7d9a4a'; c.fillRect(x + 100, y - 132, 30, 8);
    // wheels (they turn with the road)
    for (const wx of [x + 62, x + 238]) {
      c.fillStyle = '#1b1b1b'; c.beginPath(); c.arc(wx, y + 2, 19, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#bdbdbd'; c.beginPath(); c.arc(wx, y + 2, 8, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#7a7a7a'; c.lineWidth = 3;
      const a = cam / 19;
      for (let s = 0; s < 3; s++) {
        const ang = a + s * Math.PI * 2 / 3;
        c.beginPath(); c.moveTo(wx, y + 2); c.lineTo(wx + Math.cos(ang) * 15, y + 2 + Math.sin(ang) * 15); c.stroke();
      }
    }
  },

  // ------------------------------------------------------------------ the scenery
  thing(o, x, u, t, overRoad) {
    const c = this.ctx;
    if (x < -900 || x > this.W + 900) return;
    switch (o.kind) {
      case 'building': {
        c.fillStyle = o.c; c.fillRect(x, 330 - o.h, o.w, o.h);
        c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(x + o.w - 8, 330 - o.h, 8, o.h);
        c.fillStyle = 'rgba(60,90,120,0.45)';
        for (let yy = 330 - o.h + 12; yy < 318; yy += 22) for (let xx = x + 8; xx < x + o.w - 14; xx += 18) c.fillRect(xx, yy, 9, 12);
        break;
      }
      case 'tower': { // Nelum Kuluna: a tall green stem with a purple lotus bud on top
        c.fillStyle = '#c9c2b0'; c.fillRect(x - 60, 300, 120, 30);
        c.fillStyle = '#b5ad98'; c.fillRect(x - 40, 286, 80, 14);
        c.fillStyle = '#3f9a72';
        c.beginPath(); c.moveTo(x - 14, 290); c.lineTo(x + 14, 290); c.lineTo(x + 8, 92); c.lineTo(x - 8, 92); c.closePath(); c.fill();
        c.fillStyle = '#2f7a59'; c.fillRect(x + 2, 92, 5, 198);
        for (let k = -2; k <= 2; k++) { // petals
          c.save(); c.translate(x, 96); c.rotate(k * 0.32);
          c.fillStyle = k % 2 ? '#9a3a8e' : '#c04aa8';
          c.beginPath(); c.ellipse(0, -30, 13, 34, 0, 0, Math.PI * 2); c.fill();
          c.restore();
        }
        c.fillStyle = '#d778c4'; c.beginPath(); c.ellipse(x, 70, 10, 26, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#888'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, 44); c.lineTo(x, 12); c.stroke();
        c.fillStyle = 'rgba(255,230,120,' + (0.5 + 0.5 * Math.sin(t * 4)) + ')'; c.beginPath(); c.arc(x, 12, 3, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'shelter': { // the bus stand
        c.fillStyle = '#6b4a2b'; c.fillRect(x - 70, 350, 6, 68); c.fillRect(x + 64, 350, 6, 68);
        c.fillStyle = '#c0262d';
        c.beginPath(); c.moveTo(x - 84, 352); c.lineTo(x + 84, 352); c.lineTo(x + 70, 336); c.lineTo(x - 70, 336); c.closePath(); c.fill();
        c.fillStyle = '#8a6d3b'; c.fillRect(x - 50, 396, 100, 6);
        c.fillStyle = '#1d6b3a'; this.roundPath(x - 46, 312, 92, 22, 4); c.fill();
        c.fillStyle = '#fff'; c.font = '700 12px "Segoe UI", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('BUS STAND', x, 323);
        break;
      }
      case 'uniwall': { // the University of Moratuwa sign wall: a long, low pale wall with black letters, trees behind
        if (!overRoad) return;
        c.fillStyle = '#2f6a2a';
        for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(x - 230 + k * 92, 300, 46, 0, Math.PI * 2); c.fill(); }
        c.fillStyle = '#5a3d26'; for (let k = 0; k < 4; k++) c.fillRect(x - 200 + k * 130, 300, 12, 70);
        c.fillStyle = '#e6e4dc'; c.fillRect(x - 280, 330, 560, 58);
        c.fillStyle = '#cfcbbf'; c.fillRect(x - 280, 384, 560, 6);
        c.fillStyle = '#d8d5cb'; c.fillRect(x - 280, 326, 560, 5);
        c.fillStyle = '#1d1d1d'; c.font = '700 22px "Segoe UI", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('UNIVERSITY OF MORATUWA SRI LANKA', x, 358);
        c.fillStyle = '#6aa83f'; c.fillRect(x - 290, 390, 580, 10);
        break;
      }
      case 'uni': { // the University of Moratuwa: long modern blocks on a lawn
        c.fillStyle = '#e9e2d0'; c.fillRect(x - 230, 230, 300, 100);
        c.fillStyle = '#d8cfb8'; c.fillRect(x + 80, 200, 170, 130);
        c.fillStyle = '#8a1c2b'; c.fillRect(x - 230, 222, 300, 10); c.fillRect(x + 80, 192, 170, 10);
        c.fillStyle = 'rgba(60,90,120,0.5)';
        for (let yy = 244; yy < 320; yy += 22) for (let xx = x - 220; xx < x + 60; xx += 20) c.fillRect(xx, yy, 12, 12);
        for (let yy = 214; yy < 320; yy += 22) for (let xx = x + 92; xx < x + 240; xx += 20) c.fillRect(xx, yy, 12, 12);
        c.fillStyle = '#f4f0e6'; for (let k = 0; k < 6; k++) c.fillRect(x - 210 + k * 50, 300, 8, 30); // columns at the entrance
        c.fillStyle = '#5aa437'; c.fillRect(x - 260, 326, 540, 6);
        break;
      }
      case 'mosque': { // a red-and-white striped mosque in Pettah
        const w = 170;
        for (let k = 0; k < 9; k++) { c.fillStyle = k % 2 ? '#f4efe6' : '#c0262d'; c.fillRect(x - w / 2, 220 + k * 12, w, 12); }
        for (const mx of [x - w / 2 - 8, x + w / 2 - 8]) { // minarets
          for (let k = 0; k < 12; k++) { c.fillStyle = k % 2 ? '#f4efe6' : '#c0262d'; c.fillRect(mx, 160 + k * 14, 16, 14); }
          c.fillStyle = '#c0262d'; c.beginPath(); c.moveTo(mx - 3, 160); c.lineTo(mx + 8, 136); c.lineTo(mx + 19, 160); c.closePath(); c.fill();
        }
        c.fillStyle = '#c0262d'; c.beginPath(); c.arc(x, 220, 34, Math.PI, 0); c.fill(); // the dome
        c.fillStyle = '#f4efe6'; c.beginPath(); c.arc(x, 220, 34, Math.PI, Math.PI * 1.1); c.lineTo(x, 220); c.fill();
        c.fillStyle = '#3a1416'; for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(x - 55 + k * 37, 300, 9, Math.PI, 0); c.fillRect(x - 64 + k * 37, 300, 18, 28); c.fill(); }
        break;
      }
      case 'sea': { // the Indian Ocean along the coast road
        const sg = c.createLinearGradient(0, 270, 0, 336);
        sg.addColorStop(0, '#2c8fd0'); sg.addColorStop(1, '#5cc2e8');
        c.fillStyle = sg; c.fillRect(x, 272, o.w, 64);
        c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 2;
        for (let k = 0; k < o.w; k += 46) { const wy = 290 + (k * 7 % 34); const sh = Math.sin(t * 2 + k) * 6; c.beginPath(); c.moveTo(x + k + sh, wy); c.quadraticCurveTo(x + k + 10 + sh, wy - 5, x + k + 22 + sh, wy); c.stroke(); }
        c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillRect(x, 332, o.w, 4); // surf on the sand
        break;
      }
      case 'surfer': { // a surfer riding a wave
        const bob = Math.sin(t * 3 + x) * 3;
        c.fillStyle = '#ffd25a'; c.beginPath(); c.ellipse(x, 312 + bob, 22, 4, -0.1, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#8d5a3b'; c.fillRect(x - 3, 290 + bob, 6, 18); c.beginPath(); c.arc(x, 286 + bob, 5, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#8d5a3b'; c.lineWidth = 3; c.beginPath(); c.moveTo(x - 12, 294 + bob); c.lineTo(x + 12, 296 + bob); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 3; c.beginPath(); c.arc(x - 26, 318 + bob, 14, Math.PI * 1.2, Math.PI * 1.9); c.stroke();
        break;
      }
      case 'turtle': { // a sea turtle on Hikkaduwa beach
        c.fillStyle = '#3f8a5a'; c.beginPath(); c.ellipse(x, 372, 22, 13, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#2a6040'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 14, 372); c.lineTo(x + 14, 372); c.moveTo(x, 360); c.lineTo(x, 384); c.stroke();
        c.fillStyle = '#5fa070'; c.beginPath(); c.arc(x + 25, 368, 6, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.ellipse(x - 14, 384, 8, 4, 0.5, 0, Math.PI * 2); c.ellipse(x + 14, 384, 8, 4, -0.5, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'fort': { // Galle Fort: ramparts, the lighthouse and the clock tower
        c.fillStyle = '#c9b48a'; c.fillRect(x - 260, 278, 520, 54);
        c.fillStyle = '#b39d72'; for (let k = 0; k < 13; k++) c.fillRect(x - 260 + k * 40, 268, 22, 12); // battlements
        c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 1; for (let yy = 290; yy < 332; yy += 12) { c.beginPath(); c.moveTo(x - 260, yy); c.lineTo(x + 260, yy); c.stroke(); }
        // the lighthouse (its light turns at night)
        c.fillStyle = '#f7f5ef'; c.beginPath(); c.moveTo(x + 120, 278); c.lineTo(x + 150, 278); c.lineTo(x + 144, 150); c.lineTo(x + 126, 150); c.closePath(); c.fill();
        c.fillStyle = '#2f2f2f'; c.fillRect(x + 122, 140, 26, 12);
        c.fillStyle = '#ffe58a'; c.fillRect(x + 126, 128, 18, 12);
        c.fillStyle = '#2f2f2f'; c.beginPath(); c.moveTo(x + 122, 128); c.lineTo(x + 135, 112); c.lineTo(x + 148, 128); c.closePath(); c.fill();
        const nb = this.night(this.uNow || 0);
        if (nb > 0.2) { const a = t * 1.5; c.fillStyle = 'rgba(255, 240, 160, ' + (0.35 * nb) + ')'; c.beginPath(); c.moveTo(x + 135, 134); c.lineTo(x + 135 + Math.cos(a) * 260, 134 + Math.sin(a) * 40 - 30); c.lineTo(x + 135 + Math.cos(a) * 260, 134 + Math.sin(a) * 40 + 30); c.closePath(); c.fill(); }
        // the clock tower
        c.fillStyle = '#e8dcc0'; c.fillRect(x - 150, 190, 34, 88);
        c.fillStyle = '#c9b48a'; c.beginPath(); c.moveTo(x - 154, 190); c.lineTo(x - 133, 166); c.lineTo(x - 112, 190); c.closePath(); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(x - 133, 210, 11, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#333'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 133, 210); c.lineTo(x - 133, 202); c.moveTo(x - 133, 210); c.lineTo(x - 127, 212); c.stroke();
        break;
      }
      case 'river': { // the Nilwala river at Akuressa
        c.fillStyle = '#6a9a3a'; c.fillRect(x - o.w / 2 - 10, 340, o.w + 20, 72);
        const rg = c.createLinearGradient(0, 346, 0, 406);
        rg.addColorStop(0, '#6fb5d8'); rg.addColorStop(1, '#3f86b8');
        c.fillStyle = rg; c.fillRect(x - o.w / 2, 346, o.w, 60);
        c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2;
        for (let k = 0; k < 8; k++) { const fx = x - o.w / 2 + ((k * 97 + t * 40) % o.w); c.beginPath(); c.moveTo(fx, 360 + (k % 3) * 14); c.lineTo(fx + 24, 360 + (k % 3) * 14); c.stroke(); }
        c.fillStyle = '#7a5a34'; c.fillRect(x - 40, 368, 80, 8); c.fillRect(x - 40, 362, 6, 14); // a little wooden boat
        break;
      }
      case 'paddy': {
        c.fillStyle = '#a9d04a'; c.fillRect(x, 336, o.w, 80);
        c.strokeStyle = '#8bb83a'; c.lineWidth = 2;
        for (let yy = 342; yy < 414; yy += 8) { c.beginPath(); c.moveTo(x, yy); c.lineTo(x + o.w, yy); c.stroke(); }
        c.fillStyle = '#7a5a34'; c.fillRect(x, 374, o.w, 4); // a bund across the field
        break;
      }
      case 'wewa': { // a village tank: still water, lotus, egrets
        c.fillStyle = '#6a9a3a'; c.beginPath(); c.ellipse(x, 372, o.w / 2 + 14, 34, 0, 0, Math.PI * 2); c.fill();
        const wg = c.createLinearGradient(0, 344, 0, 404);
        wg.addColorStop(0, '#7cc4e8'); wg.addColorStop(1, '#3f8fc0');
        c.fillStyle = wg; c.beginPath(); c.ellipse(x, 372, o.w / 2, 28, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2;
        for (let k = 0; k < 6; k++) {
          const lx = x - o.w / 3 + k * o.w / 9 + Math.sin(t * 2 + k) * 6;
          c.beginPath(); c.moveTo(lx, 362 + (k % 3) * 9); c.lineTo(lx + 26, 362 + (k % 3) * 9); c.stroke();
        }
        for (let k = 0; k < 7; k++) {
          const lx = x - o.w / 2.6 + k * o.w / 8, ly = 380 + (k % 2) * 8;
          c.fillStyle = '#3f8f3a'; c.beginPath(); c.ellipse(lx, ly, 9, 4, 0, 0, Math.PI * 2); c.fill();
          if (k % 2 === 0) { c.fillStyle = '#f08ab8'; c.beginPath(); c.arc(lx + 2, ly - 4, 4, 0, Math.PI * 2); c.fill(); }
        }
        for (let k = 0; k < 3; k++) { // white egrets
          const ex = x + o.w / 5 + k * 34, ey = 360 + k * 6;
          c.fillStyle = '#fff'; c.beginPath(); c.ellipse(ex, ey, 7, 4, 0, 0, Math.PI * 2); c.fill();
          c.fillRect(ex + 4, ey - 9, 2, 7); c.fillStyle = '#f2c230'; c.fillRect(ex + 5, ey - 9, 5, 2);
        }
        break;
      }
      case 'temple': { // a white dagoba, a bo tree and a line of flags
        c.fillStyle = '#3f7a2e'; c.beginPath(); c.arc(x + 150, 250, 62, 0, Math.PI * 2); c.arc(x + 110, 280, 44, 0, Math.PI * 2); c.arc(x + 190, 282, 46, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#6b4a2b'; c.fillRect(x + 144, 280, 12, 52);
        c.fillStyle = '#e8e2d2'; c.fillRect(x - 90, 312, 180, 18); c.fillRect(x - 76, 298, 152, 14);
        c.fillStyle = '#fbf8ef'; c.beginPath(); c.ellipse(x, 298, 66, 70, 0, Math.PI, 0); c.fill();
        c.fillStyle = '#ece6d6'; c.fillRect(x - 14, 214, 28, 16);
        c.fillStyle = '#fbf8ef'; c.beginPath(); c.moveTo(x - 10, 214); c.lineTo(x + 10, 214); c.lineTo(x, 150); c.closePath(); c.fill();
        c.strokeStyle = '#d8d0bc'; c.lineWidth = 1.5;
        for (let k = 0; k < 5; k++) { const yy = 206 - k * 10, hw = 9 - k * 1.5; c.beginPath(); c.moveTo(x - hw, yy); c.lineTo(x + hw, yy); c.stroke(); }
        c.fillStyle = '#e8b43a'; c.beginPath(); c.arc(x, 150, 4, 0, Math.PI * 2); c.fill();
        const flags = ['#2f55b5', '#f2c230', '#c0262d', '#ffffff', '#f08a24'];
        c.strokeStyle = '#777'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 160, 300); c.quadraticCurveTo(x - 100, 316, x - 70, 300); c.stroke();
        for (let k = 0; k < 10; k++) {
          const fx = x - 156 + k * 9, fy = 302 + Math.sin(k / 9 * Math.PI) * 8 + Math.sin(t * 6 + k) * 1.5;
          c.fillStyle = flags[k % 5]; c.fillRect(fx, fy, 7, 9);
        }
        break;
      }
      case 'palm': {
        const base = 334;
        c.strokeStyle = '#8a6440'; c.lineWidth = 6; c.lineCap = 'round';
        const tx = x + o.lean * o.h, ty = base - o.h;
        c.beginPath(); c.moveTo(x, base); c.quadraticCurveTo(x + o.lean * o.h * 0.2, base - o.h * 0.5, tx, ty); c.stroke();
        c.strokeStyle = '#3f8f3a'; c.lineWidth = 5;
        for (let k = 0; k < 7; k++) {
          const a = -Math.PI + k * Math.PI / 6 + Math.sin(t * 2 + x) * 0.05;
          c.beginPath(); c.moveTo(tx, ty);
          c.quadraticCurveTo(tx + Math.cos(a) * 30, ty + Math.sin(a) * 30 - 12, tx + Math.cos(a) * 46, ty + Math.sin(a) * 46 + 14); c.stroke();
        }
        c.fillStyle = '#7a5a34'; c.beginPath(); c.arc(tx - 3, ty + 4, 4, 0, Math.PI * 2); c.arc(tx + 4, ty + 5, 4, 0, Math.PI * 2); c.fill();
        c.lineCap = 'butt';
        break;
      }
      case 'tea': { // a round hill with rows of tea bushes
        c.fillStyle = '#4f9a3c'; c.beginPath(); c.ellipse(x, 332, o.w / 2, o.h, 0, Math.PI, 0); c.fill();
        c.save(); c.beginPath(); c.ellipse(x, 332, o.w / 2, o.h, 0, Math.PI, 0); c.clip();
        c.strokeStyle = '#2f7a2a'; c.lineWidth = 4;
        for (let k = 1; k < 9 && o.h - k * 12 > 2; k++) { c.beginPath(); c.ellipse(x, 332 + k * 4, o.w / 2 - k * 4, o.h - k * 12, 0, Math.PI, 0); c.stroke(); }
        c.restore();
        break;
      }
      case 'sign': {
        if (!overRoad) return;
        c.fillStyle = '#777'; c.fillRect(x - 3, 300, 6, 120);
        const w = Math.max(90, c.measureText ? 18 + o.text.length * 11 : 120);
        c.fillStyle = '#1d6b3a'; this.roundPath(x - w / 2, 262, w, o.sub ? 48 : 30, 6); c.fill();
        c.strokeStyle = '#fff'; c.lineWidth = 2; this.roundPath(x - w / 2 + 3, 265, w - 6, (o.sub ? 48 : 30) - 6, 4); c.stroke();
        c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = '800 15px "Segoe UI", Arial, sans-serif'; c.fillText(o.text, x, 278);
        if (o.sub) { c.font = '600 9px "Segoe UI", Arial, sans-serif'; c.fillText(o.sub, x, 297); }
        break;
      }
      case 'tree': { // jungle trees
        const base = o.front ? 548 : 334, h = o.h;
        c.fillStyle = o.front ? '#2a1d12' : '#4a3422'; c.fillRect(x - 5, base - h * 0.6, 10, h * 0.6);
        const greens = o.front ? ['#16391a', '#1f4a22', '#24572a'] : ['#2a5a2a', '#356d31', '#2f6430'];
        for (let k = 0; k < 3; k++) {
          c.fillStyle = greens[k];
          c.beginPath(); c.arc(x + (k - 1) * h * 0.14, base - h * (0.62 + k * 0.1), h * (0.2 - k * 0.03), 0, Math.PI * 2); c.fill();
        }
        if (o.s > 0.6) { c.strokeStyle = '#3f6a2a'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + 10, base - h * 0.6); c.quadraticCurveTo(x + 18, base - h * 0.4, x + 12, base - h * 0.25); c.stroke(); }
        break;
      }
      case 'gate': { // the village gate
        if (!overRoad) return;
        c.fillStyle = '#6b4a2b'; c.fillRect(x - 80, 300, 10, 120); c.fillRect(x + 70, 300, 10, 120);
        c.fillStyle = '#8a6440'; this.roundPath(x - 96, 290, 192, 40, 8); c.fill();
        c.fillStyle = '#f3e7c8'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = '800 16px "Segoe UI", Arial, sans-serif'; c.fillText('Berala Panathara', x, 305);
        c.font = '600 10px "Segoe UI", Arial, sans-serif'; c.fillText('Welcome to Sams Gama', x, 320);
        const fl = ['#f2c230', '#f08a24', '#ffffff', '#e94a8a'];
        for (let k = 0; k < 12; k++) { c.fillStyle = fl[k % 4]; c.beginPath(); c.arc(x - 88 + k * 16, 292, 4, 0, Math.PI * 2); c.fill(); }
        break;
      }
      case 'tuft': {
        const yy = 506 + o.s * 26;
        c.strokeStyle = u > 0.82 ? '#244f1c' : '#3f8a2a'; c.lineWidth = 2;
        for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(x, yy); c.lineTo(x + k * 3, yy - 8 - Math.abs(2 - Math.abs(k)) * 3); c.stroke(); }
        break;
      }
      default:
    }
  },

  // ------------------------------------------------------------------ helpers
  cloud(x, y, s) {
    const c = this.ctx;
    c.beginPath(); c.ellipse(x, y, 40 * s, 12 * s, 0, 0, Math.PI * 2); c.arc(x - 12 * s, y - 8 * s, 14 * s, 0, Math.PI * 2); c.arc(x + 12 * s, y - 10 * s, 18 * s, 0, Math.PI * 2); c.fill();
  },
  roundPath(x, y, w, h, r) {
    const c = this.ctx;
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  },
  round(x, y, w, h, r, fill) { this.ctx.fillStyle = fill; this.roundPath(x, y, w, h, r); this.ctx.fill(); },
  mix(a, b, k) {
    k = Math.min(1, Math.max(0, k));
    // colours come as '#rrggbb' or as 'rgb(r,g,b)' (the result of an earlier mix)
    const num = (col) => {
      const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(col);
      return m ? (+m[1] << 16) | (+m[2] << 8) | +m[3] : parseInt(col.slice(1), 16);
    };
    const pa = num(a), pb = num(b);
    const ch = (s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
    return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
  },

  // ------------------------------------------------------------------ the black screen: your secret role
  reveal(info, role) {
    const el = document.getElementById('reveal');
    this.revealEl = el;
    el.querySelector('.reveal-info').textContent = info || '';
    // restart the fade-in animations
    el.hidden = true; void el.offsetWidth; el.hidden = false;
    this.setRole(role);
    setTimeout(() => VM.sound.play('reveal'), 2800); // as your role appears
    const close = () => {
      if (el.hidden) return;
      el.hidden = true;
      clearInterval(this.watch);
      VM.journeyOn = false;
      if (VM.net.role) { VM.roleUI.showRoleCard(VM.net.role); VM.roleUI.hideRoleCard(); } // the "Secret role" button
      VM.ui.toast('Find your house (follow the arrow). Day 1 begins!');
    };
    document.getElementById('reveal-go').onclick = close;
    // when Day 1 starts on the server, everyone goes into the village
    clearInterval(this.watch);
    this.watch = setInterval(() => {
      const st = VM.net.room && VM.net.room.state;
      if (!st || st.stage !== 'playing' || st.phase >= 1) close();
    }, 500);
  },

  setRole(r) {
    const el = document.getElementById('reveal');
    if (!r) {
      el.querySelector('.reveal-role').textContent = '…';
      el.querySelector('.reveal-text').textContent = 'The roles are being dealt.';
      return;
    }
    const info = VM.ROLES[r.role];
    const name = el.querySelector('.reveal-role');
    name.textContent = 'You are ' + (r.role === 'police' ? 'the Police' : r.role === 'doctor' ? 'the Doctor' : 'a ' + info.name);
    name.style.color = info.colour;
    el.querySelector('.reveal-text').textContent = (VM.roleText(r.role) || info).short;
    const partners = r.partners && r.partners.length ? 'Your partner' + (r.partners.length > 1 ? 's' : '') + ': ' + r.partners.map((p) => p.name).join(', ') + '. Never attack each other.' : '';
    const swim = r.swimmer ? '🏊 You can swim! You never drown, and you can swim across the water (slowly).' : '';
    el.querySelector('.reveal-partners').textContent = [partners, swim].filter(Boolean).join(' ');
    el.querySelector('.reveal-partners').hidden = !partners && !swim;
    el.querySelector('.reveal-key').innerHTML = {
      thief: 'At night: <kbd>R</kbd> attacks (next to someone, or at the door where someone sleeps), <kbd>E</kbd> robs houses and animals, <kbd>T</kbd> plays tricks (hides stolen goods at a house, spoils the well or the cooking fire).',
      police: 'Press <kbd>R</kbd> next to someone (or at their door while they sleep) to question them.',
      doctor: 'At night press <kbd>R</kbd> next to someone, or at their door, to guard them.',
      villager: 'Work, trade and watch. Ring the bell under the big tree to call a meeting.',
    }[r.role];
    if (VM.roleText(r.role)) el.querySelector('.reveal-key').textContent = VM.roleText(r.role).key;
  },
};
