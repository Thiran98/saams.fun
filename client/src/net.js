// Multiplayer connection (Phase 2). Used only when the game is opened from the game server
// (http://localhost:2567), or with ?online in the address. Otherwise the game runs offline with computer villagers.

// the version of this game page: the server turns away older pages (players with an old saved copy)
VM.CLIENT_VERSION = 2;

VM.net = {
  // Also online through a Cloudflare test tunnel (*.trycloudflare.com), which serves the game from the game server.
  // and on saams.fun/play/: the page comes from the website, the live connection goes to the game server
  online: location.port === '2567' || /\.trycloudflare\.com$/.test(location.hostname) || /\/(play|game)(\/|$)/.test(location.pathname) ||
    new URLSearchParams(location.search).has('online'),
  base: null,          // the game server's web address ('' = the server that served this page)
  client: null,
  room: null,
  status: 'offline',   // offline | connecting | online | reconnecting
  onSnap: null,
  role: null,          // my secret role from the server (Phase 3): { role, partners }
  handler: null,       // the scene's function for game messages; messages wait in `queue` until it is set
  queue: [],

  // Where is the game server? The page itself came from it (localhost:2567 or the tunnel), or, on saams.fun/play/,
  // the website's server.json says where it is today (play-online.ps1 keeps it up to date).
  async locate() {
    if (this.base !== null) return this.base;
    // the game server serves the game at its root; only the website's /play/ page has to look the server up
    if (!/\/(play|game)(\/|$)/.test(location.pathname)) { this.base = ''; return ''; }
    try {
      const j = await (await fetch('/server.json?' + Date.now(), { cache: 'no-store' })).json();
      const cloud = String(j.url || '').replace(/\/$/, ''), pc = String(j.pc || '').replace(/\/$/, '');
      const want = (new URLSearchParams(location.search).get('server') || 'auto').toLowerCase();
      // is the PC server on? (it answers fast when it is; an old PC address simply fails)
      const pcOn = async () => { if (!pc) return false; try { const c = new AbortController(); const t = setTimeout(() => c.abort(), 3000); const r = await fetch(pc + '/health', { cache: 'no-store', signal: c.signal }); clearTimeout(t); return r.ok; } catch (e) { return false; } };
      if (want === 'pc') this.base = pc;
      else if (want === 'cloud') this.base = cloud;
      else this.base = (await pcOn()) ? pc : cloud;   // Auto: the PC when it is on, otherwise the cloud server
      if (!this.base) this.base = cloud || pc;
    } catch (e) { this.base = ''; }
    return this.base;
  },
  // an address on the game server (for example 'version' or 'tts?id=…')
  api(path) { return this.base ? this.base + '/' + path : path; },

  // the game server's live (WebSocket) address
  url() {
    if (VM.SERVER_URL) return VM.SERVER_URL;
    if (this.base) return this.base.replace(/^http/, 'ws');
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  },

  loadLibrary() {
    if (window.Colyseus) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = (this.base || '') + '/lib/colyseus.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('The multiplayer library did not load. Is the game server running?'));
      document.head.appendChild(s);
    });
  },

  // Join the village. After a page reload we first try to take back our old seat (same colour and house).
  // how: 'public' (the public bus), 'create' (a new private bus with this code) or 'join' (a private bus by code)
  async connect(name, outfit, how, code) {
    this.setStatus('connecting');
    await this.locate();
    if (this.base === '' && /\/(play|game)(\/|$)/.test(location.pathname)) throw new Error('The village is closed right now (the host is away).');
    await this.wake();
    await this.loadLibrary();
    this.client = new Colyseus.Client(this.url());
    let room = null;
    const token = this.savedToken();
    if (token) { try { room = await this.client.reconnect(token); } catch (e) { this.saveToken(null); } }
    code = how === 'public' ? 'PUBLIC' : String(code || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    if (!room && how === 'join') {
      try { room = await this.client.join('village', { name, outfit, code, v: VM.CLIENT_VERSION, look: VM.myDamindu }); } catch (e) {
        if (e && /out of date/.test(e.message || '')) throw e;
        throw new Error('There is no bus with the code ' + code + ' (or it has already left).');
      }
    }
    if (!room) room = await this.client.joinOrCreate('village', { name, outfit, code, v: VM.CLIENT_VERSION, look: VM.myDamindu });
    else if (VM.myDamindu) this.send('look', VM.myDamindu);   // back in my old seat: keep my Damindu up to date
    try { sessionStorage.setItem('sams-gama-code', how === 'public' ? '' : code); } catch (e) { /* private mode */ }
    this.bind(room);
    await this.waitFor(() => this.myState(), 6000, 'The server did not send the village in time.');
    return room;
  },

  // A free game server sleeps when nobody plays and takes up to a minute to wake up: keep knocking (about 90 s)
  // and tell the player, instead of failing at once.
  async wake() {
    const note = document.getElementById('join-error');
    const show = (t) => { if (note) { note.textContent = t; note.hidden = !t; note.classList.toggle('waking', !!t); } };
    const t0 = Date.now();
    for (let i = 0; Date.now() - t0 < 90000; i++) {
      try {
        const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 8000);
        const r = await fetch(this.api('health') + '?t=' + Date.now(), { cache: 'no-store', signal: ctl.signal });
        clearTimeout(timer);
        if (r.ok) { show(''); return; }
      } catch (e) { /* still asleep */ }
      show('Waking up the village… the bus is warming its engine (up to a minute). ' + '🚌💨'.slice(0, i % 2 ? 2 : 4));
      await new Promise((res) => setTimeout(res, 3000));
    }
    show('');
    throw new Error('The village server did not wake up. Try again in a minute.');
  },

  bind(room) {
    this.room = room;
    this.saveToken(room.reconnectionToken);
    this.setStatus('online');
    room.onMessage('snap', (m) => { if (this.onSnap) this.onSnap(m); });
    // Phase 3 game messages (roles, kills, meetings, votes…) go to the scene
    for (const type of ['role', 'note', 'loot', 'purse', 'rescued', 'mpicks', 'narrate', 'injured', 'healed', 'shot', 'swapOffer', 'swapDone', 'bees', 'aswasuma', 'funeral', 'picked', 'killed', 'morning', 'matchStart', 'meeting', 'verdict', 'reveal', 'restart']) {
      room.onMessage(type, (m) => this.dispatch(type, m));
    }
    room.onError((code, message) => console.warn('Game server error', code, message));
    room.onLeave((code) => {
      this.room = null;
      if (code === 1000 || this.leaving) { this.setStatus('offline'); return; }
      this.tryReconnect();
    });
  },

  // The connection dropped (Wi-Fi, sleep, server restart): try again at once, then for about 30 seconds.
  async tryReconnect() {
    this.setStatus('reconnecting');
    VM.ui.toast('Connection lost. Reconnecting…');
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, i === 0 ? 150 : i < 4 ? 700 : 2000)); // quick tries first: a short freeze
      if (this.room) return; // already back
      try {
        const room = await this.client.reconnect(this.savedToken());
        this.bind(room);
        VM.ui.toast('Reconnected.');
        return;
      } catch (e) { /* try again */ }
    }
    this.saveToken(null);
    this.setStatus('offline');
    VM.ui.toast('Could not reconnect. Reload the page to join the village again.');
  },

  dispatch(type, m) {
    if (type === 'role') this.role = m;
    if (type === 'restart') { this.rejoin(); return; }
    if (this.handler) this.handler(type, m); else this.queue.push([type, m]);
  },

  // A new match in the same village: reload the page and join again at once (the seat token keeps the house)
  rejoin() {
    if (this.rejoining) return;
    this.rejoining = true;
    try { sessionStorage.setItem('sams-gama-auto', '1'); } catch (e) { /* private mode */ }
    location.reload();
  },

  setHandler(fn) {
    this.handler = fn;
    const q = this.queue; this.queue = [];
    q.forEach(([t, m]) => fn(t, m));
  },

  myState() {
    const r = this.room;
    return r && r.state && r.state.players ? r.state.players.get(r.sessionId) : null;
  },

  send(type, data) {
    if (!this.room) return;
    try { this.room.send(type, data); } catch (e) { /* not connected right now */ }
  },

  setStatus(s) {
    this.status = s;
    if (VM.ui.netStatus) VM.ui.netStatus(s, this.room && this.room.state && this.room.state.players ? this.room.state.players.size : 0);
  },

  waitFor(test, ms, message) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (test()) return resolve();
        if (Date.now() - start > ms) return reject(new Error(message));
        setTimeout(check, 50);
      };
      check();
    });
  },

  // each browser tab keeps its own seat token, so a reload rejoins with the same house and colour
  savedToken() { try { return sessionStorage.getItem('sams-gama-seat'); } catch (e) { return null; } },
  saveToken(t) { try { if (t) sessionStorage.setItem('sams-gama-seat', t); else sessionStorage.removeItem('sams-gama-seat'); } catch (e) { /* private mode */ } },
};

// Online, the other villagers are real players, so there are no computer villagers.
if (VM.net.online) VM.BOT_COUNT = 0;

// When the game server is updated (restarted), a page that is still open would keep running the old game code.
// Every 15 seconds the page asks the server for its version; if it changed, the page reloads itself (and joins
// the bus stand again by itself if you had already joined).
if (VM.net.online) {
  let build = null;
  const check = () => VM.net.locate().then(() => fetch(VM.net.api('version'), { cache: 'no-store' })).then((r) => r.json()).then((v) => {
    if (build === null) { build = v.build; return; }
    if (v.build !== build) {
      if (VM.net.room || VM.net.status !== 'offline') VM.net.rejoin();
      else location.reload();
    }
  }).catch(() => { /* server restarting: try again next time */ });
  check();
  setInterval(check, 15000);
}
