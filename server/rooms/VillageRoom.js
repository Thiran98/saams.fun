// One match of Sams Gama: up to 12 players in the same village.
// The server is the umpire. It decides: who is in the room, each player's colour and house, the match clock,
// impossible movement (refused), and since Phase 3 the secret roles, night kills, the doctor's guard, the police's
// questions, stealing that names ordinary villagers, elephant deaths, meetings, votes and who wins.
// Roles are kept here (this.roles) and only ever sent to the player they belong to (and thieves learn their partners).

const { Room } = require('colyseus');
const { Player, VillageState } = require('./schema');
const { VM, world, worldW, worldH, door } = require('../shared');
const tts = require('../tts');

const MAX_SPEED = 260;          // pixels per second (ghosts fly at 230, the tractor drives at 185)
const SLACK = 80;               // extra pixels allowed for network jitter (slow mobile connections)
const SNAP_AFTER = 220;         // only a move this far beyond the limit puts the player back (a cheat or a teleport)
const RECONNECT_SECONDS = 30;   // how long a seat is kept after a connection drops
const DEV = process.env.NODE_ENV !== 'production';
const MIN_PLAYERS = Number(process.env.MIN_PLAYERS) || (DEV ? 3 : VM.MIN_PLAYERS);
const RANGE = VM.ACTION_RANGE + 12; // a little slack: positions arrive about 15 times a second
const BELL = VM.bellSpot(world);
const FINAL_DAY = VM.SCHEDULE.length - 2;
// Nobody waits forever: the bus leaves by itself after this long, and after a match everyone goes back to the
// bus stand after this long if the host does not press "New match". (WAIT_SECONDS env changes it for testing.)
const WAIT = Number(process.env.WAIT_SECONDS) || 300;
const MIN_CLIENT_VERSION = 2; // game pages older than this are turned away (VM.CLIENT_VERSION in client/src/net.js)
// The thieves' secret loot purse: they win when it reaches the goal (more thieves, higher goal).
const LOOT_HOUSE = 60;    // robbing a sleeping player's house (each house once a night)
const LOOT_ANIMAL = 80;   // taking a cow or chicken for meat
const lootGoal = (thieves) => 250 + 250 * thieves;
// Places a thief can spoil at night (they cannot be used the next day)
const PLACES = {
  well: { pos: world.objects.find((o) => o.type === 'well'), news: 'Someone threw mud in the well! No water today.', done: 'You threw mud in the well. Nobody can draw water tomorrow.' },
  cookhut: { pos: world.objects.find((o) => o.type === 'cookhut'), news: 'Someone put out the fire in the cooking hut! No cooking today.', done: 'You put out the cooking fire. Nobody can cook tomorrow.' },
};
// Classic Mafia mode: how long each step lasts (seconds)
const MAFIA = { night: 45, morning: 10, talk: 100 };
// Lines at busy places: one person uses the place at a time, the others wait in a line behind them
const QUEUE_PLACES = {};
for (const type of ['well', 'cookhut', 'kade']) { const o = world.objects.find((x) => x.type === type); if (o) QUEUE_PLACES[type] = { x: o.x, y: o.y + 34 }; }
const INJURED_SECONDS = 20;   // an attacked player lies injured this long; the doctor can save them
const BULLETS = 3;
const TRACTOR_SECONDS = 15;   // one ride on the tractor lasts this long, then it is free for someone else            // the police officer's bullets per night (for elephants)
const QUEUE_GAP = 30;          // pixels between people in a line
const QUEUE_TURN_MS = 25000;   // the person at the front must use the place within this time
const CUT_COOLDOWN_MS = 20000; // a player can cut in once every 20 seconds
const newNight = (deaths) => ({ kills: new Set(), guard: new Map(), deaths: deaths || [], saved: [], robbed: new Set(), framers: new Set(), framed: [], spoil: new Set() }); // "Final day and meeting": a vote follows it automatically

const clean = (s) => String(s || '').replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, 14);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

class VillageRoom extends Room {
  onCreate(options) {
    this.maxClients = 12;
    this.setState(new VillageState());
    // the public bus is matched with the code PUBLIC (an empty code would match every bus); its state code stays ''
    const code = String((options && options.code) || '').toUpperCase().replace(/[^A-Z]/g, '');
    this.state.code = code === 'PUBLIC' ? '' : code.slice(0, 4);
    this.state.tractorX = world.tractor.x; this.state.tractorY = world.tractor.y;
    this.state.minPlayers = MIN_PLAYERS;
    this.meta = new Map();   // sessionId -> { last: time of last accepted move }
    this.roles = new Map();  // sessionId -> thief | police | doctor | villager (SECRET)
    this.bots = new Map();   // computer players: id -> what they are doing
    this.botCount = 0;
    this.clock.setInterval(() => this.botTick(0.1), 100);
    this.resetMatch();
    this.clock.setInterval(() => this.tick(), 1000);

    this.onMessage('move', (client, m) => this.onMove(client, m));
    this.onMessage('status', (client, m) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !m) return;
      p.asleep = !!m.asleep && p.alive; p.inBoat = !!m.inBoat; p.inTractor = !!m.inTractor; p.inWater = !!m.inWater && p.alive; p.weak = !!m.weak && p.alive;
    });
    this.onMessage('outfit', (client, key) => {
      const p = this.state.players.get(client.sessionId);
      if (p && VM.OUTFITS.some((o) => o.key === key)) p.outfit = key;
    });
    // waking up: you appear at your own front door
    this.onMessage('respawn', (client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      const d = door(p.house);
      p.x = d.x; p.y = d.y;
      this.meta.get(client.sessionId).last = Date.now();
    });
    // testing only: skip to the next part of the match (the N key)
    this.onMessage('skipPhase', () => { const s = this.state; if (!DEV || s.stage !== 'playing') return; if (s.mode === 'mafia') { if (s.mstep) s.mleft = 1; else s.phaseLeft = 1; return; } this.nextPhase(); });
    // testing only (never on the live server): become a role, or jump to a place
    this.onMessage('devRole', (client, role) => { if (DEV && this.roles.has(client.sessionId) && VM.ROLES[role]) { if (role === 'thief') for (const [o, r] of this.roles) if (r === 'thief') this.roles.set(o, 'villager'); this.roles.set(client.sessionId, role); this.sendRole(client.sessionId, role); } });
    this.onMessage('devMove', (client, m) => { const p = this.state.players.get(client.sessionId); if (DEV && p && m) { p.x = Number(m.x) || p.x; p.y = Number(m.y) || p.y; this.meta.get(client.sessionId).last = Date.now(); } });

    // Phase 3
    this.onMessage('start', (client) => this.startMatch(client));
    this.onMessage('addBot', (client) => this.addBot(client));
    this.onMessage('clearBots', (client) => this.clearBots(client));
    this.onMessage('restart', (client) => this.restart(client));
    this.onMessage('kill', (client, m) => this.onKill(client, m));
    this.onMessage('protect', (client, m) => this.onProtect(client, m));
    this.onMessage('investigate', (client, m) => this.onInvestigate(client, m));
    this.onMessage('stole', (client) => this.onStole(client));
    this.onMessage('steal', (client, m) => this.onSteal(client, m));
    this.onMessage('trick', (client, m) => this.onTrick(client, m));
    // Classic Mafia mode
    this.onMessage('mode', (client, mode) => { const s = this.state; if (s.stage === 'lobby' && client.sessionId === s.host && (mode === 'walk' || mode === 'mafia')) s.mode = mode; });
    this.onMessage('mpick', (client, m) => this.pick(client.sessionId, m && String(m.target || ''), m && m.kind));
    this.onMessage('mvoteNow', (client) => { const s = this.state; if (s.mode === 'mafia' && s.mstep === 'talk' && client.sessionId === s.host) s.mleft = Math.min(s.mleft, 3); });
    // lines at the well, cooking hut and Kade
    this.onMessage('qjoin', (client, m) => this.qJoin(client.sessionId, m && m.place));
    this.onMessage('qdone', (client, m) => this.qRemove(client.sessionId, m && m.place));
    this.onMessage('qleave', (client, m) => this.qRemove(client.sessionId, m && m.place));
    this.onMessage('qcut', (client, m) => this.qCut(client.sessionId, m && m.place, m && String(m.target || '')));
    // the shared tractor
    this.onMessage('tractor', (client, m) => this.onTractor(client.sessionId, m));
    // swapping goods between players (no money): an offer, then a yes or no
    this.onMessage('swapOffer', (client, m) => this.onSwapOffer(client.sessionId, m));
    this.onMessage('swapReply', (client, m) => this.onSwapReply(client.sessionId, m));
    // a ghost paints someone they think is a thief; the police fire at elephants; the doctor heals the injured
    this.onMessage('paint', (client, m) => this.onPaint(client.sessionId, m && String(m.target || '')));
    this.onMessage('shoot', (client, m) => this.onShoot(client.sessionId, m));
    this.onMessage('heal', (client, m) => this.onHeal(client.sessionId, m && String(m.target || '')));
    // buy a paddy plot (one per player; the browser pays the Rs 40)
    this.onMessage('buyPaddy', (client, m) => {
      const s = this.state, id = client.sessionId, p = s.players.get(id), i = String(Number(m && m.plot));
      if (!p || !p.alive || s.stage !== 'playing' || !(Number(i) >= 0 && Number(i) < 6) || s.paddy.get(i)) return;
      if ([...s.paddy.values()].includes(id)) { this.tell(id, 'You already own a paddy plot. One each.', 'bad'); return; }
      s.paddy.set(i, id);
      this.broadcast('note', { text: p.name + ' bought a paddy plot.' });
    });
    // an electric fence around your own paddy plot or vegetable garden (the browser pays the Rs 50)
    this.onMessage('buyFence', (client, m) => {
      const s = this.state, id = client.sessionId, p = s.players.get(id), what = m && m.what;
      if (!p || !p.alive || s.stage !== 'playing') return;
      if (what === 'paddy' && [...s.paddy.values()].includes(id) && !p.fencePaddy) p.fencePaddy = true;
      if (what === 'garden' && p.land && !p.fenceGarden) p.fenceGarden = true;
    });
    this.onMessage('buyLand', (client) => { const p = this.state.players.get(client.sessionId); if (p && p.alive && this.state.stage === 'playing') p.land = true; });
    this.onMessage('rescue', (client, m) => { const p = this.state.players.get(client.sessionId); if (p && p.alive && !p.inWater) this.rescue(p, m && String(m.target || '')); });
    this.onMessage('died', (client, m) => this.onDied(client, m));
    // goods dropped where an elephant trampled someone; anyone alive can pick them up
    this.onMessage('drop', (client, m) => {
      const s = this.state, p = s.players.get(client.sessionId);
      if (!p || s.stage !== 'playing' || !m || !m.items) return;
      const items = {};
      for (const [k, v] of Object.entries(m.items)) {
        const n = Math.min(99, Math.floor(Number(v) || 0));
        if (n > 0 && (k === 'money' || VM.ITEMS[k])) items[k] = k === 'money' ? Math.min(n, 500) : n;
      }
      if (!Object.keys(items).length) return;
      const id = 'd' + (++this.dropCount || (this.dropCount = 1));
      s.drops.set(id, JSON.stringify({ x: Math.round(Number(m.x) || p.x), y: Math.round(Number(m.y) || p.y), by: p.name, items }));
    });
    // a swarm of bees chasing someone: everyone sees it (it stings whoever it reaches)
    this.onMessage('bees', (client, m) => {
      const s = this.state, p = s.players.get(client.sessionId);
      if (!p || s.stage !== 'playing' || !m) return;
      const now = Date.now(); this.beesAt = this.beesAt || new Map();
      if (m.on && now - (this.beesAt.get(client.sessionId) || 0) < 150) return; // at most about 6 a second
      this.beesAt.set(client.sessionId, now);
      this.broadcast('bees', { id: client.sessionId, name: p.name, on: !!m.on, x: Math.round(Number(m.x) || 0), y: Math.round(Number(m.y) || 0) }, { except: client });
    });
    this.onMessage('pickup', (client, m) => {
      const s = this.state, p = s.players.get(client.sessionId), id = m && String(m.id || '');
      const raw = id && s.drops.get(id);
      if (!p || !p.alive || !raw) return;
      const d = JSON.parse(raw);
      if (Math.hypot(p.x - d.x, p.y - d.y) > 90) return;
      s.drops.delete(id);
      client.send('picked', { items: d.items, by: d.by });
    });
    this.onMessage('bell', (client) => this.onBell(client));
    this.onMessage('vote', (client, m) => this.onVote(client, m));
    this.onMessage('*', () => {}); // ignore anything unknown
  }

  resetMatch() {
    const s = this.state;
    s.stage = 'lobby';
    s.phase = 0;
    s.phaseLeft = VM.SCHEDULE[0].seconds;
    s.meetingLeft = 0; s.meetingBy = ''; s.winner = '';
    s.waitLeft = WAIT;
    s.spoiled = '';
    s.queues.clear();
    s.mstep = ''; s.mleft = 0; s.mround = 0;
    this.loot = 0; this.lootGoal = 0;
    this.roles.clear();
    this.votes = new Map();
    this.night = newNight();
    this.questioned = new Set(); // police who already asked this day/night
    s.players.forEach((p) => { p.alive = true; p.exposed = false; p.voted = false; p.bell = false; });
  }

  // Old game pages (a browser that kept an old saved copy) are turned away with a clear message
  onAuth(client, options) {
    if (!(options && Number(options.v) >= MIN_CLIENT_VERSION)) throw new Error('Your game page is out of date. Open saams.fun/game/ (or press Ctrl + F5 to reload it).');
    return true;
  }

  onJoin(client, options) {
    // a real player takes the seat of a computer player when the bus is full
    if (this.state.players.size >= 12) {
      const bot = [...this.state.players.keys()].reverse().find((id) => this.state.players.get(id).bot);
      if (bot) this.removeBot(bot);
    }
    const p = this.makePlayer(clean(options && options.name) || 'Villager', options && options.outfit);
    this.state.players.set(client.sessionId, p);
    this.meta.set(client.sessionId, { last: Date.now() });
    if (!this.state.host || !this.state.players.has(this.state.host)) this.state.host = client.sessionId;
    console.log(`${p.name} joined (${p.colour}, house ${p.house}). Players: ${this.state.players.size}`);
  }

  // A new villager with a free name, outfit, colour and house, standing at their front door
  makePlayer(name, outfit) {
    const players = [...this.state.players.values()];
    const takenColours = new Set(players.map((p) => p.colour));
    const takenHouses = new Set(players.map((p) => p.house));
    const takenOutfits = new Set(players.map((p) => p.outfit));
    const freeHouses = world.houses.map((h, i) => i).filter((i) => !takenHouses.has(i));
    const options = { outfit };

    const p = new Player();
    p.name = name;
    // two players with the same name would be confusing in votes: add a number
    let base = p.name, n = 2;
    while (players.some((o) => o.name === p.name)) p.name = (base.slice(0, 11) + ' ' + n++);
    const wanted = options && VM.OUTFITS.find((o) => o.key === options.outfit && !takenOutfits.has(o.key));
    const free = VM.OUTFITS.filter((o) => !takenOutfits.has(o.key));
    p.outfit = wanted ? wanted.key : (free.length ? free : VM.OUTFITS)[Math.floor(Math.random() * (free.length || VM.OUTFITS.length))].key;
    p.colour = (VM.PLAYER_COLORS.find((c) => !takenColours.has(c.key)) || VM.PLAYER_COLORS[0]).key;
    p.house = freeHouses[Math.floor(Math.random() * freeHouses.length)];
    const d = door(p.house);
    p.x = d.x; p.y = d.y;
    return p;
  }

  // ------------------------------------------------------------------ computer players
  // The host can fill empty seats with computer players. The server moves them: by day they walk between houses
  // and the village square, at night they go home to sleep (a thief goes out to attack someone instead), and they
  // vote at meetings. A real player who joins later takes a computer player's seat when the bus is full.
  addBot(client) {
    const s = this.state;
    if (s.stage !== 'lobby' || client.sessionId !== s.host || s.players.size >= 12) return;
    const used = new Set([...s.players.values()].map((p) => p.name));
    const names = VM.OUTFITS.filter((o) => !used.has(o.name));
    const pick = names.length ? names[Math.floor(Math.random() * names.length)] : VM.OUTFITS[0];
    const p = this.makePlayer(pick.name, pick.key);
    p.bot = true;
    const id = 'bot-' + (++this.botCount);
    s.players.set(id, p);
    this.meta.set(id, { last: Date.now() });
    this.bots.set(id, { dest: null, wait: 1 + Math.random() * 3, target: null, voteAt: 0 });
    console.log(`Computer player ${p.name} joined. Players: ${s.players.size}`);
  }

  removeBot(id) {
    this.state.players.delete(id);
    this.meta.delete(id);
    this.bots.delete(id);
    this.roles.delete(id);
  }

  clearBots(client) {
    if (this.state.stage !== 'lobby' || client.sessionId !== this.state.host) return;
    for (const id of [...this.bots.keys()]) this.removeBot(id);
  }

  // Ten times a second: move every computer player a little and let it act
  botTick(dt) {
    const s = this.state;
    if (s.mode === 'mafia') return; // Classic Mafia: computer players only choose and vote
    for (const [id, b] of this.bots) {
      const p = s.players.get(id);
      if (!p) continue;
      if (!p.alive || p.injured || s.stage !== 'playing' || s.phase === 0) { p.moving = false; continue; }
      const role = this.roles.get(id);
      if (this.isNight()) {
        const sched = VM.SCHEDULE[s.phase];
        // a thief waits until the village is asleep, then goes to a victim (at their door if they sleep inside)
        if (role === 'thief' && !this.night.kills.size && s.phaseLeft < sched.seconds - 15) {
          p.asleep = false;
          let t = b.target && s.players.get(b.target);
          if (!t || !t.alive) {
            const victims = this.aliveIds().filter((o) => this.roles.get(o) !== 'thief' && !s.players.get(o).inTractor);
            b.target = victims[Math.floor(Math.random() * victims.length)];
            t = b.target && s.players.get(b.target);
          }
          if (!t) continue;
          const goal = t.asleep ? door(t.house) : t;
          if (this.walk(p, goal, dt, 85) < RANGE - 16) this.performKill(id, b.target);
          continue;
        }
        // after the attack a computer thief may rob a house, hide goods at someone's house or spoil the well or fire
        if (role === 'thief' && b.extra !== s.phase) {
          b.extra = s.phase;
          const n = this.night;
          const victims = this.aliveIds().filter((o) => this.roles.get(o) !== 'thief');
          const pick = (list) => list[Math.floor(Math.random() * list.length)];
          if (Math.random() < 0.6) { const h = pick(victims.filter((o) => !n.robbed.has(o))); if (h) { n.robbed.add(h); this.addLoot(id, LOOT_HOUSE, ''); } }
          if (s.stage !== 'playing') return;
          if (Math.random() < 0.5 && !n.framers.has(id)) { const f = pick(victims.filter((o) => !n.framed.includes(o))); if (f) { n.framers.add(id); n.framed.push(f); } }
          if (Math.random() < 0.3) n.spoil.add(Math.random() < 0.5 ? 'well' : 'cookhut');
        }
        if (role === 'doctor' && ![...this.night.guard.values()].includes(id)) this.night.guard.set(id, id);
        // everyone else goes home to bed
        if (!p.asleep && this.walk(p, door(p.house), dt, 90) < 6) { p.asleep = true; p.moving = false; }
        continue;
      }
      // a computer police officer quietly questions one person a day
      if (role === 'police' && !this.questioned.has(id)) {
        const others = this.aliveIds().filter((o) => o !== id);
        const q = others[Math.floor(Math.random() * others.length)];
        if (q) { this.questioned.add(id); b.known = b.known || new Set(); if (this.roles.get(q) === 'thief') b.known.add(q); }
      }
      // on Day 2, if nobody has called a meeting yet, a worried computer villager rings the bell
      if (s.phase === 3 && !this.meetings && s.phaseLeft <= 70 && role !== 'thief' && !p.bell) {
        p.bell = true;
        this.startMeeting(p.name);
        return;
      }
      // someone in the water nearby: a computer player runs to pull them out
      if (!p.asleep) {
        let swimmer = null;
        s.players.forEach((o, oid) => { if (!swimmer && o.inWater && oid !== id && dist(p, o) < 700) swimmer = oid; });
        if (swimmer) { const o = s.players.get(swimmer); if (this.walk(p, o, dt, 95) < 60) this.rescue(p, swimmer); continue; }
      }
      // day: wander between houses, the village square and other players
      if (p.asleep) { p.asleep = false; const d = door(p.house); p.x = d.x; p.y = d.y; b.dest = null; }
      if (b.wait > 0) { b.wait -= dt; p.moving = false; continue; }
      if (!b.dest) {
        const r = Math.random();
        if (r < 0.45) b.dest = door(Math.floor(Math.random() * world.houses.length));
        else if (r < 0.75) b.dest = { x: BELL.x + (Math.random() - 0.5) * 120, y: BELL.y + 30 + Math.random() * 60 };
        else {
          const others = this.aliveIds().filter((o) => o !== id);
          const o = others.length && s.players.get(others[Math.floor(Math.random() * others.length)]);
          b.dest = o ? { x: o.x + 30, y: o.y } : door(p.house);
        }
      }
      if (this.walk(p, b.dest, dt, 60) < 6) { b.dest = null; b.wait = 2 + Math.random() * 6; }
    }
  }

  // ------------------------------------------------------------------ Classic Mafia mode
  // Turns like the party game: night (thieves choose a victim from a list, the doctor protects someone, the police
  // check someone) -> morning (the narrator tells what happened) -> discussion around the big tree -> vote -> night.
  // The narrator: the line goes to every browser (spoken by OpenAI with a key, else by the browser's voice)
  narrate(text) {
    if (this.state.mode !== 'mafia') return;
    this.broadcast('narrate', { id: tts.remember(text), text });
  }

  mafiaTick() {
    const s = this.state;
    if (!s.mstep) { // the bus ride and the black screen
      if (s.phaseLeft > 0) s.phaseLeft -= 1;
      if (s.phaseLeft <= 0) this.mafiaNight();
      return;
    }
    if (s.mleft > 0) s.mleft -= 1;
    if (s.mleft > 0) return;
    if (s.mstep === 'night') this.mafiaMorning();
    else if (s.mstep === 'morning') this.mafiaTalk();
    else if (s.mstep === 'talk') { s.mstep = 'vote'; this.startMeeting('The village'); this.narrate('Time to vote. Who should leave the village?'); }
  }

  mafiaNight() {
    const s = this.state;
    s.phase = 2; // the village looks like night
    s.mstep = 'night'; s.mleft = MAFIA.night; s.mround += 1;
    s.spoiled = '';
    this.night = newNight();
    this.mvotes = new Map();
    s.players.forEach((p) => { if (p.alive) p.asleep = true; p.inWater = false; });
    for (const id of this.bots.keys()) this.clock.setTimeout(() => this.botPick(id), 3000 + Math.random() * 10000);
    this.narrate('Night falls on Berala Panathara. Everyone, close your eyes. Thieves, open your eyes, and choose your victim. Doctor, choose someone to protect. Police, choose someone to check.');
  }

  mafiaMorning() {
    const s = this.state, n = this.night;
    // the thieves' victim: the person most of them chose (a tie is decided at random)
    const count = new Map();
    for (const t of this.mvotes.values()) count.set(t, (count.get(t) || 0) + 1);
    const best = Math.max(0, ...count.values());
    const top = [...count].filter(([, c]) => c === best && best > 0).map(([t]) => t);
    const targetId = top[Math.floor(Math.random() * top.length)];
    const t = targetId && s.players.get(targetId);
    if (t && t.alive) {
      const guard = n.guard.get(targetId);
      if (guard) n.saved.push({ doctor: guard, name: t.name });
      else {
        t.alive = false;
        n.deaths.push({ name: t.name, cause: 'thief' });
        const victim = this.clients.find((x) => x.sessionId === targetId);
        if (victim) victim.send('killed', { text: 'The thieves came for you in the night!' });
      }
    }
    s.phase = 1; // daylight
    s.players.forEach((p) => { p.asleep = false; });
    const news = n.deaths.map((d) => 'Last night, ' + d.name + ' was taken by the thieves.');
    if (!news.length) news.push(n.saved.length ? 'The thieves came in the night, but someone was saved.' : 'Everyone survived the night.');
    n.framed.forEach((fid) => { const fp = s.players.get(fid); if (fp && fp.alive) news.push('And stolen goods were found at ' + fp.name + '\x27s house!'); });
    this.narrate('Good morning, Berala Panathara. ' + news.join(' '));
    this.morning();
    if (this.checkWin()) return;
    s.mstep = 'morning'; s.mleft = MAFIA.morning;
  }

  // Discussion: everyone alive gathers in a circle around the big tree in the village square
  mafiaTalk() {
    const s = this.state;
    s.mstep = 'talk'; s.mleft = MAFIA.talk;
    this.narrate('Gather around the big tree. Now talk. Who is the thief?');
    const alive = this.aliveIds();
    alive.forEach((id, i) => {
      const a = (i / alive.length) * Math.PI * 2, p = s.players.get(id);
      p.x = Math.round(BELL.x - 34 + Math.cos(a) * 120); p.y = Math.round(BELL.y + 10 + Math.sin(a) * 80);
      if (this.meta.has(id)) this.meta.get(id).last = Date.now();
      const c = this.clients.find((x) => x.sessionId === id);
      if (c) c.send('snap', { x: p.x, y: p.y });
    });
  }

  // A night choice from the list: thieves choose a victim (or hide stolen goods at a house), the doctor
  // protects someone, the police check someone (once a night). Players and computer players use this.
  pick(id, targetId, kind) {
    const s = this.state;
    const p = s.players.get(id), t = s.players.get(targetId);
    if (s.mode !== 'mafia' || s.stage !== 'playing' || s.mstep !== 'night' || !p || !p.alive || !t || !t.alive) return;
    const role = this.roles.get(id), n = this.night;
    if (role === 'thief') {
      if (this.roles.get(targetId) === 'thief') return;
      if (kind === 'frame') {
        if (n.framers.has(id)) { this.tell(id, 'You have already hidden goods tonight.', 'bad'); return; }
        n.framers.add(id);
        if (!n.framed.includes(targetId)) n.framed.push(targetId);
        this.tell(id, 'You hid stolen goods at ' + t.name + "'s house.", 'good');
        return;
      }
      this.mvotes.set(id, targetId);
      const picks = [...this.mvotes].map(([by, tg]) => ({ by: s.players.get(by).name, target: tg }));
      for (const [tid, r] of this.roles) if (r === 'thief') { const c = this.clients.find((x) => x.sessionId === tid); if (c) c.send('mpicks', { picks }); }
    } else if (role === 'doctor') {
      for (const [g, doc] of n.guard) if (doc === id) n.guard.delete(g);
      n.guard.set(targetId, id);
      this.tell(id, targetId === id ? 'You will protect yourself tonight.' : 'You will protect ' + t.name + ' tonight.', 'good');
    } else if (role === 'police') {
      if (targetId === id) return;
      if (this.questioned.has(id)) { this.tell(id, 'You have already checked someone tonight.', 'bad'); return; }
      this.questioned.add(id);
      const thief = this.roles.get(targetId) === 'thief';
      this.tell(id, thief ? t.name + ' IS a thief!' : t.name + ' is not a thief.', thief ? 'bad' : 'good');
    } else return;
    // everyone with a night job has chosen: morning comes sooner
    const done = this.aliveIds().every((o) => {
      const r = this.roles.get(o);
      return r === 'thief' ? this.mvotes.has(o) : r === 'doctor' ? [...n.guard.values()].includes(o) : r === 'police' ? this.questioned.has(o) : true;
    });
    if (done) s.mleft = Math.min(s.mleft, 4);
  }

  // A computer player's night choice
  botPick(id) {
    const s = this.state;
    const p = s.players.get(id);
    if (s.mstep !== 'night' || !p || !p.alive) return;
    const role = this.roles.get(id);
    const alive = this.aliveIds(), pickOf = (list) => list[Math.floor(Math.random() * list.length)];
    if (role === 'thief') {
      const victims = alive.filter((o) => this.roles.get(o) !== 'thief');
      const partner = [...this.mvotes.values()][0];
      this.pick(id, partner && Math.random() < 0.75 ? partner : pickOf(victims), 'main');
      if (Math.random() < 0.4) this.pick(id, pickOf(victims), 'frame');
    } else if (role === 'doctor') this.pick(id, Math.random() < 0.4 ? id : pickOf(alive), 'main');
    else if (role === 'police') {
      const q = pickOf(alive.filter((o) => o !== id));
      if (!q) return;
      this.pick(id, q, 'main');
      if (this.roles.get(q) === 'thief') { const b = this.bots.get(id); b.known = b.known || new Set(); b.known.add(q); }
    }
  }

  // Pull a player out of the water (by a player standing next to them, or a computer player)
  rescue(by, targetId) {
    const t = this.state.players.get(targetId);
    if (!t || !t.inWater || dist(by, t) > 110) return;
    t.inWater = false;
    const c = this.clients.find((x) => x.sessionId === targetId);
    if (c) c.send('rescued', { by: by.name });
  }

  // Walk a computer player towards a point; returns how far it still is
  walk(p, goal, dt, speed) {
    const dx = goal.x - p.x, dy = goal.y - p.y, d = Math.hypot(dx, dy);
    if (d < 1) { p.moving = false; return d; }
    const step = Math.min(d, speed * dt);
    p.x += dx / d * step; p.y += dy / d * step;
    p.moving = true;
    if (Math.abs(dx) > Math.abs(dy)) { p.facing = 'side'; p.flip = dx < 0; } else p.facing = dy < 0 ? 'up' : 'down';
    return d - step;
  }

  // A computer player's vote, a few seconds into a meeting
  botVote(id) {
    const s = this.state;
    const p = s.players.get(id);
    if (s.stage !== 'meeting' || !p || !p.alive || p.voted) return;
    const thief = this.roles.get(id) === 'thief';
    const others = this.aliveIds().filter((o) => o !== id && !(thief && this.roles.get(o) === 'thief'));
    const named = others.filter((o) => s.players.get(o).exposed);
    const b = this.bots.get(id) || {};
    const final = s.meetingBy === '';
    // who is ahead so far (computer players often follow the village, so a real player can lead the vote)
    const count = new Map();
    for (const t of this.votes.values()) if (t !== 'skip') count.set(t, (count.get(t) || 0) + 1);
    const leader = [...count].filter(([t]) => others.includes(t)).sort((x, y) => y[1] - x[1])[0];
    const known = [...(b.known || [])].filter((o) => others.includes(o));
    let target = 'skip';
    if (known.length) target = known[0];                                   // the police found a thief
    else if (named.length) target = named[Math.floor(Math.random() * named.length)]; // seen stealing
    else if (leader && Math.random() < 0.6) target = leader[0];
    else if (others.length && (final || Math.random() < 0.6)) target = others[Math.floor(Math.random() * others.length)];
    this.castVote(id, target);
  }

  // A reconnecting player gets their secret role again (their browser lost it on reload)
  onReconnected(client) {
    // after the match: show the end screen again (with "New match" for the host) instead of the role card
    if (this.state.stage === 'ended' && this.lastReveal) { client.send('reveal', this.lastReveal); return; }
    const role = this.roles.get(client.sessionId);
    if (role) this.sendRole(client.sessionId, role);
  }

  async onLeave(client, consented) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    p.connected = false;
    p.moving = false;
    try {
      if (consented) throw new Error('left on purpose');
      await this.allowReconnection(client, RECONNECT_SECONDS);
      p.connected = true;
      this.meta.get(client.sessionId).last = Date.now();
      console.log(`${p.name} reconnected.`);
      this.clock.setTimeout(() => this.onReconnected(client), 800); // after the browser has its listeners again
    } catch (e) {
      const wasAlive = p.alive && this.state.stage !== 'lobby';
      this.qRemoveEverywhere(client.sessionId);
      if (this.state.tractorBy === client.sessionId) this.state.tractorBy = '';
      this.state.players.delete(client.sessionId);
      this.meta.delete(client.sessionId);
      this.roles.delete(client.sessionId);
      this.votes.delete(client.sessionId);
      if (this.state.host === client.sessionId) this.state.host = [...this.state.players.keys()].find((id) => !this.bots.has(id)) || '';
      console.log(`${p.name} left. Players: ${this.state.players.size}`);
      if (wasAlive && this.state.stage !== 'ended') {
        this.broadcast('note', { text: `${p.name} left the village.` });
        if (this.state.stage === 'meeting') this.maybeEndVote();
        this.checkWin();
      }
    }
  }

  // Accept a position only if it is possible: inside the village and not faster than anyone can move.
  onMove(client, m) {
    const p = this.state.players.get(client.sessionId);
    const meta = this.meta.get(client.sessionId);
    if (!p || !meta || !m) return;
    const x = Number(m.x), y = Number(m.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const now = Date.now();
    const dt = Math.min(2, (now - meta.last) / 1000);
    const d = Math.hypot(x - p.x, y - p.y);
    const inside = x >= 0 && y >= 0 && x <= worldW && y <= worldH;
    const allowed = MAX_SPEED * dt + SLACK;
    if (!inside || d > allowed + SNAP_AFTER) {
      client.send('snap', { x: p.x, y: p.y }); // far too far: put the player back where the server says they are
      return;
    }
    if (d > allowed) {
      // a little too far (moves arrived in a burst on a slow connection): accept the move, only as far as allowed,
      // without throwing the player back (that felt like getting stuck)
      const k = allowed / d; p.x += (x - p.x) * k; p.y += (y - p.y) * k;
    } else { p.x = x; p.y = y; }
    if (this.state.tractorBy === client.sessionId) { this.state.tractorX = x + (m.flip ? -10 : 10); this.state.tractorY = y + 12; }
    this.qCheckDistance(client.sessionId);
    p.facing = ['down', 'up', 'side'].includes(m.facing) ? m.facing : 'down';
    p.flip = !!m.flip;
    p.moving = !!m.moving;
    meta.last = now;
  }

  // ------------------------------------------------------------------ the match clock
  tick() {
    const s = this.state;
    if (s.stage === 'meeting') {
      if (s.meetingLeft > 0) s.meetingLeft -= 1;
      if (s.meetingLeft <= 0) this.endVote();
      return;
    }
    if (s.stage === 'lobby' || s.stage === 'ended') { this.waitTick(); return; }
    this.qTick();
    this.injuryTick();
    if (s.tractorBy && Date.now() - (this.tractorSince || 0) > (TRACTOR_SECONDS + 2) * 1000) s.tractorBy = '';
    s.players.forEach((p) => { if (!p.alive && !p.dx) { p.dx = p.x || 1; p.dy = p.y || 1; } }); // a trophy marks where they died
    if (s.stage !== 'playing') return;
    if (s.mode === 'mafia') { this.mafiaTick(); return; }
    if (s.phaseLeft > 0) s.phaseLeft -= 1;
    if (s.phaseLeft <= 0) this.nextPhase();
  }

  // ------------------------------------------------------------------ injured players, the doctor, ghosts, the police gun
  injuryTick() {
    const s = this.state;
    s.players.forEach((p, id) => {
      if (!p.injured) return;
      p.injured -= 1;
      if (p.injured > 0 || !p.alive) return;
      // nobody saved them in time
      p.alive = false; p.asleep = false;
      if (this.isNight()) this.night.deaths.push({ name: p.name, cause: 'thief' });
      else { this.broadcast('note', { text: p.name + ' died of their wounds.', kind: 'bad' }); this.broadcast('funeral', { name: p.name, id }); }
      const c = this.clients.find((x) => x.sessionId === id);
      if (c) c.send('killed', { text: 'Nobody saved you in time. A thief got you.', wounds: true, name: p.name });
      this.qRemoveEverywhere(id);
      this.checkWin();
    });
  }

  onHeal(id, targetId) {
    const s = this.state, p = s.players.get(id), t = s.players.get(targetId);
    if (!p || !p.alive || p.injured || this.roles.get(id) !== 'doctor' || !t || !t.injured || !t.alive) return;
    if (!this.reaches(p, t)) { this.tell(id, 'Too far away.', 'bad'); return; }
    t.injured = 0;
    this.tell(id, 'You saved ' + t.name + '!', 'good');
    const c = this.clients.find((x) => x.sessionId === targetId);
    if (c) c.send('healed', { by: 'The doctor' });
  }

  onPaint(id, targetId) {
    const s = this.state, p = s.players.get(id), t = s.players.get(targetId);
    if (!p || p.alive || !t || !t.alive || s.stage !== 'playing') return;
    if (!this.painted) this.painted = new Map();
    if (this.painted.get(id) === s.phase) { this.tell(id, 'You can paint one person a day.', 'bad'); return; }
    if (dist(p, t) > 90) { this.tell(id, 'Float closer to them.', 'bad'); return; }
    this.painted.set(id, s.phase);
    t.paint = Math.min(255, t.paint + 1);
    this.tell(id, 'You painted ' + t.name + '. Everyone can see it.', 'good');
    this.broadcast('note', { text: 'A ghost painted ' + t.name + '!' });
  }

  onShoot(id, m) {
    const s = this.state, p = s.players.get(id);
    if (!p || !p.alive || this.roles.get(id) !== 'police' || s.stage !== 'playing' || !m) return;
    if (!this.night.bullets) this.night.bullets = new Map();
    const used = this.night.bullets.get(id) || 0;
    if (used >= BULLETS) { this.tell(id, 'No bullets left tonight.', 'bad'); return; }
    this.night.bullets.set(id, used + 1);
    const x = Number(m.x), y = Number(m.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x - p.x, y - p.y) > 300) return;
    this.broadcast('shot', { x, y, from: { x: p.x, y: p.y }, left: BULLETS - used - 1 });
  }

  // ------------------------------------------------------------------ the shared tractor
  onTractor(id, m) {
    const s = this.state, p = s.players.get(id);
    if (!p || !m) return;
    if (m.drive) {
      const driver = s.tractorBy && s.players.get(s.tractorBy);
      if (driver && s.tractorBy !== id && driver.connected) { this.tell(id, driver.name + ' is driving the tractor.', 'bad'); return; }
      if (Math.hypot(p.x - s.tractorX, p.y - s.tractorY) > 90) return;
      if (s.tractorBy !== id) this.tractorSince = Date.now();
      s.tractorBy = id;
    } else if (s.tractorBy === id) s.tractorBy = '';
  }

  // ------------------------------------------------------------------ swapping goods (no money)
  onSwapOffer(id, m) {
    const s = this.state, p = s.players.get(id), targetId = m && String(m.target || ''), t = s.players.get(targetId);
    if (!p || !t || !p.alive || !t.alive || targetId === id || !m || !VM.ITEMS[m.give] || !VM.ITEMS[m.want]) return;
    if (dist(p, t) > 120) { this.tell(id, 'Stand next to them to offer a swap.', 'bad'); return; }
    if (!this.offers) this.offers = new Map();
    this.offers.set(id, { target: targetId, give: m.give, want: m.want, at: Date.now() });
    const c = this.clients.find((x) => x.sessionId === targetId);
    if (c) c.send('swapOffer', { from: id, name: p.name, give: m.give, want: m.want });
    else this.tell(id, t.name + ' cannot answer right now.', 'bad');
  }

  onSwapReply(id, m) {
    const from = m && String(m.from || ''), o = this.offers && this.offers.get(from);
    if (!o || o.target !== id || Date.now() - o.at > 60000) return;
    this.offers.delete(from);
    const a = this.state.players.get(from), b = this.state.players.get(id);
    const ca = this.clients.find((x) => x.sessionId === from), cb = this.clients.find((x) => x.sessionId === id);
    if (!m.accept) { if (ca) ca.send('note', { text: (b ? b.name : 'They') + ' said no to your swap.' }); return; }
    if (ca) ca.send('swapDone', { give: o.give, want: o.want, with: b ? b.name : '' });            // the one who offered
    if (cb) cb.send('swapDone', { give: o.want, want: o.give, with: a ? a.name : '' });            // the one who said yes
  }

  // ------------------------------------------------------------------ lines (queues)
  qList(place) { const v = this.state.queues.get(place); return v ? v.split(',').filter(Boolean) : []; }
  qSet(place, list) {
    const before = this.qList(place)[0];
    if (list.length) this.state.queues.set(place, list.join(',')); else this.state.queues.delete(place);
    if (!this.qFront) this.qFront = {};
    if (list[0] !== before) this.qFront[place] = Date.now(); // a new person at the front: their turn starts now
    // everyone stands in their place in the line (the front at the place, the rest behind, to the right)
    const spot = QUEUE_PLACES[place];
    list.forEach((id, k) => {
      const p = this.state.players.get(id);
      if (!p) return;
      const x = spot.x + k * QUEUE_GAP, y = spot.y;
      if (Math.hypot(p.x - x, p.y - y) > 6) {
        p.x = x; p.y = y; p.moving = false;
        if (this.meta.has(id)) this.meta.get(id).last = Date.now();
        const c = this.clients.find((cl) => cl.sessionId === id);
        if (c) c.send('snap', { x, y });
      }
    });
  }
  qJoin(id, place) {
    const p = this.state.players.get(id), spot = QUEUE_PLACES[place];
    if (!p || !spot || !p.alive || this.state.stage !== 'playing') return;
    const list = this.qList(place);
    if (list.includes(id)) return;
    if (dist(p, spot) > 150 + list.length * QUEUE_GAP) return; // must be near the place (or the end of the line)
    for (const other of Object.keys(QUEUE_PLACES)) if (other !== place) this.qRemove(id, other, true);
    list.push(id);
    this.qSet(place, list);
    if (list.length > 1) this.tell(id, 'You joined the line. You are number ' + list.length + '.');
  }
  qRemove(id, place, quiet) {
    const list = this.qList(place);
    if (!list.includes(id)) return;
    this.qSet(place, list.filter((x) => x !== id));
  }
  qRemoveEverywhere(id) { for (const place of Object.keys(QUEUE_PLACES)) this.qRemove(id, place, true); }
  // walked away from your place in the line: you lose it
  qCheckDistance(id) {
    const p = this.state.players.get(id);
    for (const place of Object.keys(QUEUE_PLACES)) {
      const list = this.qList(place), k = list.indexOf(id);
      if (k < 0) continue;
      const spot = QUEUE_PLACES[place];
      if (Math.hypot(p.x - (spot.x + k * QUEUE_GAP), p.y - spot.y) > 70) { this.qRemove(id, place); this.tell(id, 'You left the line.'); }
    }
  }
  // cut in front of someone: swap places with them
  qCut(id, place, targetId) {
    const p = this.state.players.get(id), list = this.qList(place);
    if (!p || !p.alive || !QUEUE_PLACES[place]) return;
    const t = this.state.players.get(targetId), kt = list.indexOf(targetId);
    if (!t || kt < 0 || targetId === id) return;
    if (!this.cutAt) this.cutAt = new Map();
    if (Date.now() - (this.cutAt.get(id) || 0) < CUT_COOLDOWN_MS) { this.tell(id, 'Wait a little before cutting in again.', 'bad'); return; }
    if (dist(p, t) > 60) { this.tell(id, 'Stand next to them to cut in.', 'bad'); return; }
    const km = list.indexOf(id);
    if (km >= 0 && km < kt) return; // already in front of them
    this.cutAt.set(id, Date.now());
    if (km >= 0) list.splice(km, 1);
    list.splice(list.indexOf(targetId), 0, id);
    this.qSet(place, list);
    this.tell(id, 'You cut in front of ' + t.name + '!', 'good');
    this.tell(targetId, p.name + ' cut in front of you in the line!', 'bad');
  }
  // every second: the person at the front who does not take their turn is sent away
  qTick() {
    if (!this.qFront) return;
    for (const place of Object.keys(QUEUE_PLACES)) {
      const list = this.qList(place);
      if (list.length > 1 && Date.now() - (this.qFront[place] || Date.now()) > QUEUE_TURN_MS) {
        const slow = list[0];
        this.qRemove(slow, place);
        this.tell(slow, 'You took too long. Your turn went to the next person.', 'bad');
      }
    }
  }

  isNight() { return this.state.stage === 'playing' && VM.SCHEDULE[this.state.phase].night; }

  nextPhase() {
    const s = this.state;
    if (s.phase === FINAL_DAY) { this.startMeeting(''); return; } // the final vote
    const wasNight = VM.SCHEDULE[s.phase].night;
    s.phase = Math.min(s.phase + 1, VM.SCHEDULE.length - 1);
    s.phaseLeft = VM.SCHEDULE[s.phase].seconds;
    const night = VM.SCHEDULE[s.phase].night;
    if (night) {
      this.night = newNight(this.night.deaths); s.spoiled = ''; s.queues.clear();
    }
    if (wasNight && !night) {
      this.morning();
      // Aswasuma: when they wake up, every living player gets their own random Rs 5-20 (after the morning news)
      this.clock.setTimeout(() => {
        for (const c of this.clients) {
          const pp = s.players.get(c.sessionId);
          if (!pp || !pp.alive || s.stage === 'ended') continue;
          c.send('aswasuma', { amount: VM.ASWASUMA[0] + Math.floor(Math.random() * (VM.ASWASUMA[1] - VM.ASWASUMA[0] + 1)) });
        }
      }, 4500);
    }
  }

  // Morning: everyone hears who died in the night. The doctor hears who they saved.
  morning() {
    const s = this.state, n = this.night;
    const deaths = n.deaths;
    // the thieves' tricks come to light: goods hidden at someone's house, a spoiled well or cooking fire
    const framed = [];
    for (const id of n.framed) { const p = s.players.get(id); if (p && p.alive) { p.exposed = true; framed.push(p.name); } }
    s.spoiled = [...n.spoil].join(',');
    this.broadcast('morning', { deaths, framed, spoiled: [...n.spoil].map((k) => PLACES[k].news) });
    for (const save of this.night.saved) this.tell(save.doctor, `Last night you saved ${save.name} from a thief!`, 'good');
    this.night = newNight();
    this.questioned.clear();
  }

  // ------------------------------------------------------------------ lobby, roles, the end
  // The bus stand and the end screen count down; at 0 the bus leaves (or waits again if too few are on it),
  // and a finished match goes back to the bus stand.
  waitTick() {
    const s = this.state;
    const people = [...s.players.values()].filter((p) => !p.bot && p.connected).length;
    if (!people) return;
    if (s.waitLeft > 0) s.waitLeft -= 1;
    if (s.waitLeft > 0) return;
    if (s.stage === 'ended') { this.restart(null); return; }
    const on = [...s.players.values()].filter((p) => p.connected).length;
    if (on >= MIN_PLAYERS) { this.startMatch(null); return; }
    s.waitLeft = WAIT;
    this.broadcast('note', { text: `Not enough players yet (at least ${MIN_PLAYERS}). The bus waits another ${Math.round(WAIT / 60)} minutes.` });
  }

  startMatch(client) { // client = null when the bus leaves by itself
    const s = this.state;
    if (s.stage !== 'lobby' || (client && client.sessionId !== s.host)) return;
    const ids = [...s.players.keys()].filter((id) => s.players.get(id).connected);
    if (ids.length < MIN_PLAYERS) { if (client) client.send('note', { text: `At least ${MIN_PLAYERS} players are needed to start.`, kind: 'bad' }); return; }

    const counts = VM.roleCounts(ids.length);
    const order = shuffle(ids.slice());
    this.roles.clear();
    order.forEach((id, i) => {
      const role = i < counts.thief ? 'thief' : i < counts.thief + counts.police ? 'police'
        : i < counts.thief + counts.police + counts.doctor ? 'doctor' : 'villager';
      this.roles.set(id, role);
    });
    this.painted = new Map();
    s.paddy.clear(); s.drops.clear();
    s.tractorBy = ''; s.tractorX = world.tractor.x; s.tractorY = world.tractor.y;
    s.players.forEach((p, id) => {
      p.alive = true; p.exposed = false; p.voted = false; p.bell = false; p.asleep = false;
      p.injured = 0; p.paint = 0; p.dx = 0; p.dy = 0; p.land = false; p.fencePaddy = false; p.fenceGarden = false;
      const d = door(p.house); p.x = d.x; p.y = d.y;
      if (this.meta.has(id)) this.meta.get(id).last = Date.now();
    });
    this.meetings = 0;
    this.loot = 0; this.lootGoal = s.mode === 'mafia' ? 0 : lootGoal(counts.thief); s.spoiled = '';
    s.mstep = ''; s.mleft = 0; s.mround = 0;
    this.night = newNight();
    for (const b of this.bots.values()) { b.dest = null; b.target = null; b.known = null; b.wait = 1 + Math.random() * 3; }
    s.phase = 0;
    s.phaseLeft = VM.SCHEDULE[0].seconds;
    s.stage = 'playing';
    this.lock(); // new players go to a new village until this match ends
    this.broadcast('matchStart', { players: ids.length, thieves: counts.thief, police: counts.police, doctor: counts.doctor });
    const villagers = [...this.roles].filter(([, r]) => r === 'villager').map(([id]) => id);
    this.swimmer = villagers.length ? villagers[Math.floor(Math.random() * villagers.length)] : null; // swims instead of drowning
    for (const [id, role] of this.roles) this.sendRole(id, role);
    console.log(`Match started with ${ids.length} players: ${[...this.roles].map(([id, r]) => s.players.get(id).name + '=' + r).join(', ')}`);
  }

  sendRole(id, role) {
    const partners = role === 'thief'
      ? [...this.roles].filter(([o, r]) => r === 'thief' && o !== id && this.state.players.has(o)).map(([o]) => ({ id: o, name: this.state.players.get(o).name }))
      : [];
    const c = this.clients.find((x) => x.sessionId === id);
    if (c) c.send('role', { role, partners, swimmer: id === this.swimmer, loot: role === 'thief' ? this.loot : undefined, goal: role === 'thief' ? this.lootGoal : undefined });
  }

  restart(client) { // client = null when the 5 minutes after a match run out
    if (this.state.stage !== 'ended' || (client && client.sessionId !== this.state.host)) return;
    this.resetMatch();
    this.unlock();
    this.broadcast('restart', {});
  }

  aliveIds() { return [...this.state.players.keys()].filter((id) => this.state.players.get(id).alive); }

  checkWin() {
    const s = this.state;
    if (s.stage !== 'playing' && s.stage !== 'meeting') return false;
    const alive = this.aliveIds();
    const thieves = alive.filter((id) => this.roles.get(id) === 'thief').length;
    if (thieves === 0) { this.endMatch('villagers', 'caught'); return true; }
    if (thieves >= alive.length - thieves) { this.endMatch('thieves', 'numbers'); return true; }
    return false;
  }

  endMatch(winner, reason) {
    const s = this.state;
    s.stage = 'ended';
    s.winner = winner;
    s.meetingLeft = 0;
    const roles = [];
    s.players.forEach((p, id) => roles.push({ name: p.name, colour: p.colour, role: this.roles.get(id) || 'villager', alive: p.alive }));
    s.waitLeft = WAIT;
    this.lastReveal = { winner, roles, reason: reason || '', loot: this.loot, goal: this.lootGoal };
    this.broadcast('reveal', this.lastReveal);
    this.narrate(winner === 'thieves' ? 'The thieves have won. Berala Panathara will never be the same.' : 'Every thief has been caught. The villagers of Berala Panathara win!');
    console.log(`Match over: ${winner} win.`);
  }

  // ------------------------------------------------------------------ night actions
  tell(id, text, kind) {
    if (!text) return;
    const c = this.clients.find((x) => x.sessionId === id);
    if (c) c.send('note', { text, kind: kind || '' });
  }

  // Can `p` reach `target`? Next to them outside, or at their front door while they sleep inside.
  reaches(p, target) {
    if (target.asleep) return dist(p, door(target.house)) <= RANGE;
    return dist(p, target) <= RANGE;
  }

  actor(client, role, m) {
    const s = this.state;
    const p = s.players.get(client.sessionId);
    const targetId = m && String(m.target || '');
    const t = s.players.get(targetId);
    if (!p || !p.alive || p.asleep || !t || !t.alive || this.roles.get(client.sessionId) !== role) return null;
    return { p, t, targetId };
  }

  onKill(client, m) {
    if (!this.isNight() || this.state.mode === 'mafia') return;
    const a = this.actor(client, 'thief', m);
    if (!a) return;
    const { p, t, targetId } = a;
    if (this.roles.get(targetId) === 'thief' || t.inTractor) return;
    if (this.night.kills.size) { this.tell(client.sessionId, 'The thieves have already struck tonight. Only one attack a night.', 'bad'); return; }
    if (!this.reaches(p, t)) { this.tell(client.sessionId, 'Too far away.', 'bad'); return; }
    this.performKill(client.sessionId, targetId);
  }

  // A thief (a player or a computer player) attacks: the doctor's guard stops it, otherwise the victim is out
  performKill(killerId, targetId) {
    const t = this.state.players.get(targetId);
    if (!t || !t.alive || t.injured || this.night.kills.size) return; // only one attack a night, for all the thieves
    this.night.kills.add(killerId);
    const guard = this.night.guard.get(targetId);
    if (guard) {
      this.night.saved.push({ doctor: guard, name: t.name });
      this.tell(killerId, 'Someone was guarding them. Your attack failed!', 'bad');
      return;
    }
    t.injured = INJURED_SECONDS; // lying injured: the doctor can still save them
    const victim = this.clients.find((x) => x.sessionId === targetId);
    if (victim) victim.send('injured', { seconds: INJURED_SECONDS });
    this.addLoot(killerId, VM.KILL_LOOT, `You robbed ${t.name} and took Rs ${VM.KILL_LOOT}.`);
  }

  onProtect(client, m) {
    if (!this.isNight()) return;
    const a = this.actor(client, 'doctor', m);
    if (!a) return;
    if ([...this.night.guard.values()].includes(client.sessionId)) { this.tell(client.sessionId, 'You are already guarding someone tonight.', 'bad'); return; }
    if (!this.reaches(a.p, a.t) && a.targetId !== client.sessionId) { this.tell(client.sessionId, 'Too far away.', 'bad'); return; }
    if (a.targetId === client.sessionId && dist(a.p, door(a.p.house)) > RANGE) return;
    this.night.guard.set(a.targetId, client.sessionId);
    this.tell(client.sessionId, a.targetId === client.sessionId ? 'You are guarding your own house tonight.' : `You are guarding ${a.t.name} tonight.`, 'good');
  }

  onInvestigate(client, m) {
    if (this.state.stage !== 'playing' || this.state.phase === 0) return;
    const a = this.actor(client, 'police', m);
    if (!a || a.targetId === client.sessionId) return;
    if (this.questioned.has(client.sessionId)) { this.tell(client.sessionId, 'You have already questioned someone. Try again after the next morning.', 'bad'); return; }
    if (!this.reaches(a.p, a.t)) { this.tell(client.sessionId, 'Too far away.', 'bad'); return; }
    this.questioned.add(client.sessionId);
    const thief = this.roles.get(a.targetId) === 'thief';
    this.tell(client.sessionId, thief ? `${a.t.name} IS a thief!` : `${a.t.name} is not a thief.`, thief ? 'bad' : 'good');
  }

  // ------------------------------------------------------------------ the thieves' loot and tricks
  // Money goes into the thieves' shared, secret purse. The one who took it also gets it in their basket.
  // When the purse reaches the goal, the thieves win.
  addLoot(id, amount, text) {
    if (this.state.stage !== 'playing') return;
    this.loot += amount;
    this.tell(id, text, 'good');
    const c = this.clients.find((x) => x.sessionId === id);
    if (c) c.send('loot', { amount });
    for (const [tid, r] of this.roles) {
      if (r !== 'thief') continue;
      const tc = this.clients.find((x) => x.sessionId === tid);
      if (tc) tc.send('purse', { loot: this.loot, goal: this.lootGoal });
    }
    if (this.loot >= this.lootGoal) this.endMatch('thieves', 'loot');
  }

  // Stealing at night: from a sleeping player's house, or an animal. Thieves fill their purse unseen;
  // an ordinary villager who steals is named for everyone (and gets nothing for the purse).
  onSteal(client, m) {
    const s = this.state, id = client.sessionId;
    const p = s.players.get(id);
    if (!p || !p.alive || p.asleep || !this.isNight() || !m) return;
    if (this.roles.get(id) !== 'thief') { this.onStole(client); return; }
    if (m.kind === 'animal') {
      const last = this.night.animals || (this.night.animals = new Map());
      if (Date.now() - (last.get(id) || 0) < 25000) { this.tell(id, 'Wait a little before taking another animal.', 'bad'); return; }
      last.set(id, Date.now());
      this.addLoot(id, LOOT_ANIMAL, `You sold the meat quietly: Rs ${LOOT_ANIMAL} for the thieves.`);
      return;
    }
    const targetId = String(m.target || '');
    const t = s.players.get(targetId);
    if (!t || targetId === id || this.roles.get(targetId) === 'thief') return;
    if (dist(p, door(t.house)) > RANGE + 20) { this.tell(id, 'Too far away.', 'bad'); return; }
    if (this.night.robbed.has(targetId)) { this.tell(id, `${t.name}'s house has already been robbed tonight.`, 'bad'); return; }
    this.night.robbed.add(targetId);
    this.addLoot(id, LOOT_HOUSE, `You robbed ${t.name}'s house: Rs ${LOOT_HOUSE} for the thieves.`);
  }

  // A thief's tricks at night (the T key): hide stolen goods at someone's house so they look guilty in the
  // morning, throw mud in the well, or put out the cooking fire (no water or cooking the next day).
  onTrick(client, m) {
    const s = this.state, id = client.sessionId;
    const p = s.players.get(id);
    if (!p || !p.alive || p.asleep || !this.isNight() || this.roles.get(id) !== 'thief' || !m) return;
    const n = this.night;
    if (m.kind === 'frame') {
      const targetId = String(m.target || '');
      const t = s.players.get(targetId);
      if (!t || !t.alive || targetId === id || this.roles.get(targetId) === 'thief') return;
      if (n.framers.has(id)) { this.tell(id, 'You have already hidden goods somewhere tonight.', 'bad'); return; }
      if (dist(p, door(t.house)) > RANGE + 20) { this.tell(id, 'Too far away.', 'bad'); return; }
      n.framers.add(id);
      if (!n.framed.includes(targetId)) n.framed.push(targetId);
      this.tell(id, `You hid stolen goods at ${t.name}'s house. In the morning the village will find them.`, 'good');
      return;
    }
    const place = PLACES[m.kind];
    if (!place || !place.pos) return;
    if (dist(p, place.pos) > 90) { this.tell(id, 'Too far away.', 'bad'); return; }
    if (n.spoil.has(m.kind)) { this.tell(id, 'That has already been done tonight.', 'bad'); return; }
    n.spoil.add(m.kind);
    this.tell(id, place.done, 'good');
  }

  // Someone stole goods or an animal. An ordinary villager is named for everyone; an original thief is not.
  onStole(client) {
    const p = this.state.players.get(client.sessionId);
    if (!p || !p.alive || !this.isNight()) return;
    if (this.roles.get(client.sessionId) === 'thief') return;
    if (!p.exposed) { p.exposed = true; this.broadcast('note', { text: 'Someone was seen stealing! Look for the STOLE badge.', kind: 'bad' }); }
  }

  // The browser runs the elephants; a player can only report their own death (outside, at night).
  onDied(client, m) {
    const p = this.state.players.get(client.sessionId);
    // hunger kills at any time of day
    if (m && m.cause === 'hunger' && p && p.alive && this.state.stage === 'playing') {
      p.alive = false; p.weak = false; p.asleep = false;
      if (this.isNight()) this.night.deaths.push({ name: p.name, cause: 'hunger' });
      else { this.broadcast('note', { text: p.name + ' died of hunger.', kind: 'bad' }); this.broadcast('funeral', { name: p.name, id: client.sessionId }); }
      this.qRemoveEverywhere(client.sessionId);
      this.checkWin();
      return;
    }
    if (!p || !p.alive || p.asleep || !this.isNight()) return;
    p.alive = false;
    this.night.deaths.push({ name: p.name, cause: m && m.cause === 'elephant' ? 'elephant' : 'night' });
    this.checkWin();
  }

  // ------------------------------------------------------------------ meetings and votes
  onBell(client) {
    const s = this.state;
    const p = s.players.get(client.sessionId);
    if (!p || !p.alive || p.bell || s.stage !== 'playing' || s.phase === 0 || this.isNight() || s.mode === 'mafia') return;
    if (dist(p, BELL) > VM.BELL_RANGE + 20) return;
    p.bell = true;
    this.startMeeting(p.name);
  }

  startMeeting(by) {
    const s = this.state;
    this.meetings = (this.meetings || 0) + 1;
    s.stage = 'meeting';
    s.meetingBy = by;
    s.meetingLeft = VM.MEETING_SECONDS;
    this.votes = new Map();
    s.players.forEach((p) => { p.voted = false; });
    for (const id of this.bots.keys()) this.clock.setTimeout(() => this.botVote(id), 4000 + Math.random() * 14000);
    this.broadcast('meeting', { by });
  }

  onVote(client, m) {
    const s = this.state;
    const p = s.players.get(client.sessionId);
    if (s.stage !== 'meeting' || !p || !p.alive || p.voted) return;
    this.castVote(client.sessionId, m && String(m.target || ''));
  }

  castVote(id, target) {
    const s = this.state;
    const p = s.players.get(id);
    if (s.stage !== 'meeting' || !p || !p.alive || p.voted) return;
    if (target !== 'skip' && !(s.players.get(target) && s.players.get(target).alive)) return;
    this.votes.set(id, target);
    p.voted = true;
    this.maybeEndVote();
  }

  maybeEndVote() {
    const waiting = this.aliveIds().filter((id) => { const p = this.state.players.get(id); return p.connected && !p.voted; });
    if (!waiting.length) this.endVote();
  }

  endVote() {
    const s = this.state;
    if (s.stage !== 'meeting') return;
    const count = new Map();
    for (const t of this.votes.values()) count.set(t, (count.get(t) || 0) + 1);
    let top = null, best = 0, tie = false;
    for (const [t, n] of count) {
      if (n > best) { top = t; best = n; tie = false; } else if (n === best) tie = true;
    }
    const tally = [...count].map(([t, n]) => ({ name: t === 'skip' ? 'Skip' : (s.players.get(t) || {}).name || '?', votes: n }));
    const final = s.meetingBy === '';
    let out = null;
    if (top && top !== 'skip' && !tie) {
      const p = s.players.get(top);
      if (p) { p.alive = false; p.asleep = false; out = { name: p.name, wasThief: this.roles.get(top) === 'thief' }; }
    }
    this.broadcast('verdict', { out, tally, final });
    this.narrate(out ? out.name + ' leaves the village. ' + out.name + (out.wasThief ? ' was a thief!' : ' was not a thief.') : 'No one has enough votes. Nobody leaves the village.');
    s.stage = 'playing';
    s.meetingLeft = 0;
    if (this.checkWin()) return;
    if (s.mode === 'mafia') { this.mafiaNight(); return; } // Classic Mafia: after the vote, night falls again
    if (final) { this.endMatch('thieves', 'escaped'); return; } // the thieves got away after the final vote
  }
}

module.exports = { VillageRoom };
