// Phase 3 in the browser: secret roles, night actions, the village bell, meetings and votes, the end of the match.
// The server decides everything (server/rooms/VillageRoom.js). This file only shows it and sends requests.
// Online only: offline the village stays a single-player practice game.

VM.roleUI = {
  $(id) { return document.getElementById(id); },

  init(scene) {
    this.scene = scene;
    this.$('role-ok').onclick = () => this.hideRoleCard();
    this.$('myrole').onclick = () => { if (VM.net.role) this.showRoleCard(VM.net.role); };
    this.$('lobby-start').onclick = () => VM.net.send('start');
    this.$('lobby-addbot').onclick = () => VM.net.send('addBot');
    this.$('lobby-fillbots').onclick = () => {
      const free = 12 - VM.net.room.state.players.size;
      for (let i = 0; i < free; i++) VM.net.send('addBot');
    };
    this.$('lobby-clearbots').onclick = () => VM.net.send('clearBots');
    this.$('end-again').onclick = () => VM.net.send('restart');
    this.$('vote-skip').onclick = () => this.vote('skip');
    this.$('rolebtn').onclick = () => { VM.input.role = true; };
    this.$('trickbtn').onclick = () => { VM.input.trick = true; };
    this.$('lobby-copy').onclick = () => {
      const code = VM.net.room && VM.net.room.state.code;
      const link = location.origin + location.pathname + (code ? '?code=' + code : '');
      const done = () => { this.$('lobby-copy').textContent = 'Copied!'; setTimeout(() => { this.$('lobby-copy').textContent = 'Copy invite link'; }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, () => window.prompt('Send this link to your friends:', link));
      else window.prompt('Send this link to your friends:', link);
    };
    this.$('meeting-list').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-id]');
      if (b) this.vote(b.dataset.id);
    });
  },

  // ------------------------------------------------------------------ lobby
  // The bus stand: 12 seats in the bus. Everyone who joins takes the next seat; the host (first in) starts the bus.
  lobby(st, me) {
    const el = this.$('lobby');
    const show = st.stage === 'lobby' && !VM.journeyOn;
    el.hidden = !show;
    if (!show) { this.seated = null; return; }
    const n = st.players.size, min = st.minPlayers || 3;
    const host = st.players.get(st.host);
    const isHost = st.host === me;
    const was = this.seated || new Set();
    const now = new Set();
    // 6 bus windows with 2 seats each; players sit in the order they joined
    const seat = [], names = [];
    let key = isHost + '|' + st.host;
    st.players.forEach((p, id) => {
      const c = VM.colourByKey(p.colour);
      now.add(id);
      key += '|' + id + p.name + p.colour + p.connected + p.bot;
      if (id === st.host) { const d = this.$('lobby').querySelector('.lg-driver'); if (d) { d.style.setProperty('--c', c.hex); d.title = p.name + ' (bus driver)'; d.innerHTML = '<b>' + this.esc(p.name.charAt(0).toUpperCase()) + '</b><em>' + this.esc(p.name) + '</em>'; d.classList.add('on'); } }
      else seat.push('<span class="lg-seat pax' + (id === me ? ' me' : '') + (this.seated && !was.has(id) ? ' new' : '') + '" style="--c:' + c.hex +
        (p.connected ? '' : ';opacity:.45') + '" title="' + this.esc(p.name) + '"><b>' + this.esc(p.name.charAt(0).toUpperCase()) + '</b></span>');
      names.push('<li class="' + (id === me ? 'me' : '') + (p.connected ? '' : ' off') + '"><i style="background:' + c.hex + '"></i>' +
        this.esc(p.name) + (id === me ? ' (you)' : '') + (p.bot ? ' <small class="bot">computer</small>' : '') + (id === st.host ? ' <small>🚌 bus driver · starts the bus</small>' : '') + '</li>');
    });
    if (this.seated && [...now].some((id) => !was.has(id))) VM.sound.play('seat');
    while (seat.length < 11) seat.push('<span class="lg-seat empty"></span>');
    let windows = '';
    seat.push('<span class="lg-seat gap"></span>'); // 11 passengers: the 12th place is the driver's
    for (let w = 0; w < 6; w++) windows += '<li class="lg-win">' + seat[w * 2] + seat[w * 2 + 1] + '</li>';
    this.seated = now;
    this.$('lobby-timer').textContent = 'Leaves in ' + this.mmss(st.waitLeft);
    this.$('lobby-clock').textContent = this.mmss(st.waitLeft);
    if (key === this.lobbyKey) return;
    this.lobbyKey = key;
    this.$('lobby-count').textContent = n + ' / 12';
    const bc = this.$('bus-code');
    bc.hidden = !st.code;
    if (st.code) bc.querySelector('b').textContent = st.code;
    this.$('lobby-list').innerHTML = windows;
    this.$('lobby-names').innerHTML = names.join('');
    const start = this.$('lobby-start');
    start.hidden = !isHost;
    let bots = 0;
    st.players.forEach((p) => { if (p.bot) bots++; });
    this.$('lobby-bots').hidden = !isHost;
    this.$('lobby-addbot').disabled = n >= 12;
    this.$('lobby-fillbots').disabled = n >= 12;
    this.$('lobby-clearbots').hidden = !bots;
    start.disabled = n < min;
    start.textContent = n < min ? 'Let\'s go to Sams Gama! (need ' + min + ' players)' : 'Let\'s go to Sams Gama!';
    this.$('lobby-wait').hidden = isHost;
    this.$('lobby-wait').textContent = 'Waiting for ' + (host ? host.name : 'the first player') + ' to start the bus…';
    this.$('lobby-need').textContent = isHost
      ? (n < min ? 'You are the first on the bus, so you start it. Wait for at least ' + min + ' players, then press the button.'
        : 'Press the button whenever everyone is on board. Best with 8 to 12 players.') +
        ' No friends online? Add computer players to fill the seats.'
      : 'Take your seat. The bus leaves when ' + (host ? host.name : 'the first player') + ' presses start.';
  },

  // A message for the bus stand (for example "At least 3 players are needed")
  standMessage(text) {
    const m = this.$('lobby-msg');
    m.textContent = text; m.hidden = false;
    clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => { m.hidden = true; }, 4000);
  },

  // ------------------------------------------------------------------ your secret role
  showRoleCard(r) {
    const info = VM.ROLES[r.role];
    const card = this.$('rolecard');
    card.querySelector('.role-name').textContent = info.name;
    card.querySelector('.role-name').style.color = info.colour;
    card.querySelector('.role-text').textContent = (VM.roleText(r.role) || info).short;
    const partners = r.partners && r.partners.length ? 'Your partner' + (r.partners.length > 1 ? 's' : '') + ': ' + r.partners.map((p) => p.name).join(', ') + '. Never attack each other.' : '';
    const swim = r.swimmer ? '🏊 You can swim! You never drown, and you can swim across the water (slowly).' : '';
    card.querySelector('.role-partners').textContent = [partners, swim].filter(Boolean).join(' ');
    card.querySelector('.role-partners').hidden = !partners && !swim;
    card.querySelector('.role-key').innerHTML = {
      thief: 'At night: <kbd>R</kbd> attacks (next to someone, or at the door where someone sleeps), <kbd>E</kbd> robs houses and animals, <kbd>T</kbd> plays tricks (hides stolen goods at a house, spoils the well or the cooking fire).',
      police: 'Press <kbd>R</kbd> next to someone (or at their door while they sleep) to question them.',
      doctor: 'At night: press <kbd>R</kbd> next to someone, or at their door (or your own door), to guard them.',
      villager: 'Ring the bell under the big tree in the village square (E) to call a meeting when you suspect someone.',
    }[r.role];
    if (VM.roleText(r.role)) card.querySelector('.role-key').textContent = VM.roleText(r.role).key;
    card.hidden = false;
    VM.roleCardOpen = true;
    const badge = this.$('myrole');
    badge.hidden = false;
    badge.querySelector('b').textContent = info.name;
    badge.style.borderColor = info.colour;
  },

  hideRoleCard() { this.$('rolecard').hidden = true; VM.roleCardOpen = false; },

  trickPrompt(text) {
    const el = this.$('trickprompt');
    el.hidden = !text;
    if (text) el.querySelector('span').textContent = text;
    this.$('trickbtn').classList.toggle('ready', !!text);
  },

  // The thieves' secret loot (only thieves see it)
  purse(loot, goal) {
    const el = this.$('purse');
    if (!goal) { el.hidden = true; return; }
    el.hidden = false;
    el.querySelector('b').textContent = 'Rs ' + loot + ' / ' + goal;
    el.querySelector('i').style.width = Math.min(100, Math.round(loot / goal * 100)) + '%';
  },

  rolePrompt(text, type, always) {
    const el = this.$('roleprompt');
    el.hidden = !text;
    if (text) el.querySelector('span').textContent = text;
    const btn = this.$('rolebtn');
    btn.classList.toggle('ready', !!text);
    btn.classList.toggle('waiting', !text && !!always); // a thief's KILL button stays on screen at night, dim until someone is near
    btn.classList.toggle('kill', type === 'kill' || (!text && always === 'kill'));
    const word = { kill: 'KILL', heal: 'HEAL', investigate: 'ASK', protect: 'GUARD', shoot: 'SHOOT', paint: 'PAINT' }[type] || (always === 'kill' ? 'KILL' : 'Role');
    if (btn.textContent !== word) btn.textContent = word;
  },

  // ------------------------------------------------------------------ meetings
  meeting(st, me) {
    const el = this.$('meeting');
    const show = st.stage === 'meeting';
    el.hidden = !show;
    if (!show) { this.myVote = null; this.meetingKey = null; return; }
    const mine = st.players.get(me);
    const canVote = mine && mine.alive && !mine.voted;
    this.$('meeting-title').textContent = st.mode === 'mafia' ? 'Village vote: who is the thief?' : st.meetingBy ? st.meetingBy + ' rang the bell: village meeting' : 'Final meeting: the last vote';
    this.$('meeting-time').textContent = st.meetingLeft + ' s';
    let rows = '', key = canVote + '|' + this.myVote;
    st.players.forEach((p, id) => {
      if (!p.alive) return;
      const c = VM.colourByKey(p.colour);
      key += '|' + id + p.voted;
      rows += '<li><button type="button" data-id="' + id + '"' + (canVote && id !== me ? '' : ' disabled') +
        (this.myVote === id ? ' class="chosen"' : '') + '><i style="background:' + c.hex + '"></i>' + this.esc(p.name) +
        (id === me ? ' (you)' : '') + (p.voted ? ' <small>voted</small>' : '') + '</button></li>';
    });
    if (key !== this.meetingKey) {
      this.meetingKey = key;
      this.$('meeting-list').innerHTML = rows;
      this.$('vote-skip').disabled = !canVote;
      this.$('meeting-note').textContent = !mine || !mine.alive ? 'You are out: you can watch, but not vote.'
        : mine.voted ? 'You have voted. Waiting for the others…' : 'Talk it over (voice or chat), then tap who you think is a thief, or skip.';
    }
  },

  vote(target) {
    this.myVote = target;
    VM.sound.play('vote');
    VM.net.send('vote', { target });
  },

  // ------------------------------------------------------------------ the end
  endScreen(m, isHost) {
    const el = this.$('endscreen');
    el.hidden = false;
    VM.endOpen = true;
    const t = el.querySelector('.end-title');
    t.textContent = m.winner === 'thieves' ? 'The thieves win!' : 'The villagers win!';
    t.style.color = m.winner === 'thieves' ? VM.ROLES.thief.colour : VM.ROLES.villager.colour;
    el.querySelector('.end-sub').textContent = {
      loot: 'The thieves filled their loot bag (Rs ' + m.loot + ' of Rs ' + m.goal + ') and got away.',
      numbers: 'The thieves are as many as the honest villagers left.',
      escaped: 'A thief survived the final vote and got away.',
      caught: 'Every thief has been caught. The village is safe.',
    }[m.reason] || (m.winner === 'thieves' ? 'The thieves got away with the village\'s money.' : 'Every thief has been caught. The village is safe.');
    el.querySelector('tbody').innerHTML = m.roles.map((r) => {
      const c = VM.colourByKey(r.colour), info = VM.ROLES[r.role];
      return '<tr><td><i style="background:' + c.hex + '"></i>' + this.esc(r.name) + '</td><td style="color:' + info.colour + '"><b>' + info.name + '</b></td><td>' + (r.alive ? 'alive' : 'out') + '</td></tr>';
    }).join('');
    this.$('end-again').hidden = !isHost;
    this.$('end-wait').hidden = isHost;
  },

  mmss(sec) { sec = Math.max(0, sec | 0); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); },

  esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
};

// ------------------------------------------------------------------ scene methods (added to VillageScene)
Object.assign(VillageScene.prototype, {
  initRoles() {
    this.stage = VM.net.room.state.stage;
    VM.state.inv.money = VM.LAND_PRICE; // online: Rs 50, just enough for the land by your house
    this.dead = false;
    // after a reload: take back what you had in this village
    this.restoredBag = false;
    try {
      const bag = JSON.parse(sessionStorage.getItem('sams-gama-bag') || 'null');
      if (bag && bag.room === VM.net.room.roomId && VM.net.room.state.stage !== 'lobby') {
        Object.assign(VM.state.inv, bag.inv); VM.state.home = bag.home || {}; VM.state.food = bag.food;
        this.restoredBag = true;
        const me = VM.net.myState();
        if (me && me.land) this.landOwned = true;
        VM.ui.inventory(); VM.ui.food(VM.state.food);
      }
    } catch (e) { /* nothing saved, or private mode */ }
    // keep what you have, every second and when the page closes
    const save = () => {
      if (!VM.net.room) return;
      try { sessionStorage.setItem('sams-gama-bag', JSON.stringify({ room: VM.net.room.roomId, inv: VM.state.inv, home: VM.state.home, food: VM.state.food })); } catch (e) { /* private mode */ }
    };
    clearInterval(VM.bagTimer); VM.bagTimer = setInterval(save, 1000);
    window.addEventListener('pagehide', save);
    VM.roleUI.init(this);
    VM.input.role = false;
    this.keys.R = this.input.keyboard.addKey('R');
    this.keys.T = this.input.keyboard.addKey('T');
    VM.input.trick = false;
    this.makeBell();
    VM.net.setHandler((type, m) => this.onGame(type, m));
    if (VM.net.role) { this.me.role = VM.net.role.role; VM.roleUI.showRoleCard(VM.net.role); VM.roleUI.hideRoleCard(); }
  },

  // The village bell under the big tree in the square: ring it (E) to call a meeting, once per match.
  makeBell() {
    const b = VM.bellSpot(this.world);
    if (!this.textures.exists('bell')) {
      const g = this.make.graphics({ add: false });
      g.fillStyle(0x6b4a2b, 1).fillRect(4, 6, 4, 34).fillRect(28, 6, 4, 34).fillRect(2, 4, 32, 5);
      g.fillStyle(0xc99a3a, 1).fillEllipse(18, 22, 16, 18).fillRect(9, 24, 18, 6);
      g.fillStyle(0xe8c25e, 1).fillEllipse(15, 18, 5, 8);
      g.fillStyle(0x4d3720, 1).fillRect(17, 9, 2, 5).fillCircle(18, 31, 2.5);
      g.generateTexture('bell', 36, 42);
      g.destroy();
    }
    this.bellImg = this.add.image(b.x, b.y, 'bell').setOrigin(0.5, 1).setDepth(b.y);
    this.bellPos = { x: b.x, y: b.y };
    this.addPlaceLabel(this.bellPos.x, this.bellPos.y - 48, 'Village bell (meeting)');
  },

  // An extra place to use with E while online: the bell (by day, once per match, while you are alive)
  findOnlineSpot() {
    const st = VM.net.room && VM.net.room.state;
    const mine = VM.net.myState();
    if (!st || !mine || st.stage !== 'playing' || !mine.alive || this.isNight || st.phase === 0 || st.mode === 'mafia') return null;
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, this.bellPos.x, this.bellPos.y) > VM.BELL_RANGE) return null;
    if (mine.bell) return { name: 'bell', key: 'bell', img: this.bellImg, task: { label: 'You have already rung the bell this match', seconds: 0, done: () => '' } };
    return { name: 'bell', key: 'bell', img: this.bellImg, task: { label: 'Ring the bell: call a village meeting (once per match)', seconds: 0, done: () => { VM.net.send('bell'); return ''; } } };
  },

  // The R key: your role's action on the nearest person (or the house where they sleep)
  findRoleAction() {
    const st = VM.net.room && VM.net.room.state;
    const mine = VM.net.myState();
    const role = this.me.role;
    // a ghost paints someone they think is a thief (once a day)
    if (st && mine && st.stage === 'playing' && !mine.alive && st.mode !== 'mafia') {
      let near = null, nd = 70;
      st.players.forEach((op, id) => {
        const r = this.remotes.get(id);
        if (!r || !op.alive) return;
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, r.sprite.x, r.sprite.y);
        if (d < nd) { nd = d; near = { id, name: op.name, sprite: r.sprite }; }
      });
      return near ? { label: 'Paint ' + near.name + ' (you think they are a thief)', type: 'paint', target: near.id, img: near.sprite } : null;
    }
    if (!st || !mine || !role || role === 'villager' || st.stage !== 'playing' || !mine.alive || mine.injured || this.sleeping || this.drowning || st.mode === 'mafia') return null;
    // the police officer's gun: scare an elephant away
    if (role === 'police' && !this.inTractor) {
      let el = null, ed = 230;
      for (const e of this.elephants) { const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y); if (!e.leaving && d < ed) { ed = d; el = e; } }
      if (el) return { label: 'Fire your gun at the elephant', type: 'shoot', target: '', x: Math.round(el.x), y: Math.round(el.y), img: el };
    }
    // the doctor heals someone a thief injured (day or night)
    if (role === 'doctor') {
      let hurt = null, hd = VM.ACTION_RANGE;
      st.players.forEach((op, id) => {
        const r = this.remotes.get(id);
        if (!r || !op.alive || !op.injured) return;
        const at = op.asleep ? { x: this.world.houses[op.house].x, y: this.world.houses[op.house].y + 26 } : r.sprite;
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, at.x, at.y);
        if (d < hd) { hd = d; hurt = { id, name: op.name, left: op.injured, img: op.asleep ? this.houseObjs[op.house].img : r.sprite }; }
      });
      if (hurt) return { label: 'Heal ' + hurt.name + ' (' + hurt.left + ' s left)', type: 'heal', target: hurt.id, img: hurt.img };
    }
    if (role !== 'police' && !this.isNight) return null;
    if (role === 'police' && st.phase === 0) return null;
    const partners = new Set(((VM.net.role && VM.net.role.partners) || []).map((p) => p.id));
    const me = this.player, R = VM.ACTION_RANGE;
    let best = null, bd = Infinity;
    st.players.forEach((p, id) => {
      if (id === VM.net.room.sessionId || !p.alive || (role === 'thief' && partners.has(id))) return;
      const r = this.remotes.get(id);
      if (!r) return;
      let d, asleep = false;
      if (p.asleep) { const h = this.world.houses[p.house]; d = Phaser.Math.Distance.Between(me.x, me.y, h.x, h.y + 26); asleep = true; }
      else d = Phaser.Math.Distance.Between(me.x, me.y, r.sprite.x, r.sprite.y);
      if (d < R && d < bd) { bd = d; best = { id, p, asleep, sprite: r.sprite, house: this.houseObjs[p.house] }; }
    });
    if (role === 'doctor') {
      const h = this.me.house, d = Phaser.Math.Distance.Between(me.x, me.y, h.x, h.y + 26);
      if (d < R && d < bd) best = { id: VM.net.room.sessionId, self: true, house: this.houseObjs[this.me.houseIndex] };
    }
    if (!best) return null;
    const who = best.self ? 'your own house' : best.asleep ? best.p.name + "'s house (asleep inside)" : this.isNight ? 'this villager' : best.p.name;
    const label = { thief: 'Attack ' + who, police: 'Question ' + who, doctor: 'Guard ' + who + ' tonight' }[role];
    const type = { thief: 'kill', police: 'investigate', doctor: 'protect' }[role];
    return { label, type, target: best.id, img: best.asleep || best.self ? best.house.img : best.sprite };
  },

  // The T key (thieves only, at night): a trick at the nearest sleeping player's door, the well or the cooking hut
  findTrick() {
    const st = VM.net.room && VM.net.room.state;
    const mine = VM.net.myState();
    if (!st || !mine || this.me.role !== 'thief' || st.stage !== 'playing' || !mine.alive || !this.isNight || this.sleeping || this.drowning || st.mode === 'mafia') return null;
    const me = this.player;
    const near = (x, y, r) => Phaser.Math.Distance.Between(me.x, me.y, x, y) < r;
    for (const s of this.spots) {
      if (s.name === 'well' && near(s.x, s.y, 70)) return { kind: 'well', label: 'Throw mud in the well (no water tomorrow)' };
      if (s.name === 'cookhut' && near(s.x, s.y, 80)) return { kind: 'cookhut', label: 'Put out the cooking fire (no cooking tomorrow)' };
    }
    const partners = new Set(((VM.net.role && VM.net.role.partners) || []).map((p) => p.id));
    let best = null;
    st.players.forEach((p, id) => {
      if (best || id === VM.net.room.sessionId || !p.alive || partners.has(id)) return;
      const h = this.world.houses[p.house];
      if (near(h.x, h.y + 26, VM.ACTION_RANGE)) best = { kind: 'frame', target: id, label: 'Hide stolen goods at ' + p.name + "'s house (they look guilty in the morning)" };
    });
    return best;
  },

  updateRoleAction(time) {
    const trickPressed = (this.keys.T && Phaser.Input.Keyboard.JustDown(this.keys.T)) || VM.input.trick;
    VM.input.trick = false;
    const trick = VM.helpOpen || VM.roleCardOpen ? null : this.findTrick();
    VM.roleUI.trickPrompt(trick ? trick.label : null);
    if (trick && trickPressed && time > (this.trickReady || 0)) {
      this.trickReady = time + 800;
      VM.net.send('trick', { kind: trick.kind, target: trick.target });
      if (VM.sound) VM.sound.play('trick');
    }
    const pressed = (this.keys.R && Phaser.Input.Keyboard.JustDown(this.keys.R)) || VM.input.role;
    VM.input.role = false;
    const a = VM.helpOpen || VM.roleCardOpen ? null : this.findRoleAction();
    const st2 = VM.net.room && VM.net.room.state, mine2 = VM.net.myState();
    const thiefNight = this.me.role === 'thief' && this.isNight && st2 && st2.stage === 'playing' && st2.mode !== 'mafia' && mine2 && mine2.alive && !this.sleeping;
    VM.roleUI.rolePrompt(a ? a.label : null, a ? a.type : null, thiefNight ? 'kill' : null);
    if (a && pressed && time > (this.roleReady || 0)) {
      this.roleReady = time + 800;
      VM.net.send(a.type, { target: a.target, x: a.x, y: a.y });
      if (a.type === 'paint') this.completeJob('paint');
    }
  },

  // Every frame: follow the server's stage, who is alive, who was seen stealing, the meeting
  syncRoles(room) {
    const st = room.state;
    const me = room.sessionId;
    const mine = st.players.get(me);
    if (st.stage !== this.stage) {
      const was = this.stage;
      this.stage = st.stage;
      if (st.stage === 'lobby' && was === 'ended') VM.net.rejoin();
    }
    const mafiaRest = st.mode === 'mafia' && (st.mstep === 'night' || st.mstep === 'morning'); // Classic Mafia: asleep / the news
    this.blocked = st.stage === 'meeting' || st.stage === 'lobby' || !!VM.endOpen || !!VM.journeyOn || mafiaRest;
    if (this.blocked && this.task) { this.task = null; VM.ui.progress(null); }
    if (st.stage === 'lobby' || st.stage === 'ended') {
      VM.ui.clock(st.stage === 'lobby' ? 'Waiting for players' : 'Match over', 0, false);
      VM.ui.timerEl.textContent = '–';
    } else if (st.stage === 'meeting') VM.ui.clock('Village meeting', st.meetingLeft, false);

    // my own life
    if (mine && !mine.alive && !this.dead && st.stage !== 'lobby') this.becomeGhost(this.deathMessage || 'You are out of the match.');

    // other players: the dead are only seen by other ghosts; ordinary villagers who stole are named
    st.players.forEach((p, id) => {
      const r = this.remotes.get(id);
      if (!r) return;
      const s = r.sprite;
      if (!p.alive) { s.setVisible(this.dead && !p.asleep); s.setAlpha(0.45); s.body.enable = false; }
      else s.body.enable = true;
      const look = (p.exposed && p.alive ? 1 : 0) + '|' + p.paint + '|' + (p.injured > 0) + '|' + (p.weak && p.alive);
      if (look !== s.look) {
        s.look = look;
        s.exposed = p.exposed;
        const text = (p.exposed && p.alive ? '🚨 STOLE!' : p.name) + (p.paint ? ' 🎨' + (p.paint > 1 ? '×' + p.paint : '') : '') + (p.injured > 0 ? ' · injured' : '') + (p.weak && p.alive ? ' · weak' : '');
        s.label.setText(text);
        const weak = !!(p.weak && p.alive);
        if (weak && !s.weakTween) { s.setTint(0xb8b0a0); s.weakTween = this.tweens.add({ targets: s, angle: { from: -6, to: 6 }, duration: 600, yoyo: true, repeat: -1 }); }
        if (!weak && s.weakTween) { s.weakTween.stop(); s.weakTween = null; s.clearTint(); s.setAngle(0); }
        if ((p.exposed && p.alive) || p.injured > 0) s.label.setBackgroundColor('#d63a2f').setColor('#ffffff');
        else s.label.setBackgroundColor(VM.colourByKey(p.colour).hex).setColor('#ffffff');
        s.setAngle(p.injured > 0 ? 90 : 0);
      }
    });
    // bought land is remembered by the server (after a reload too)
    if (mine && mine.land && !this.landOwned) { this.landOwned = true; if (!this.restoredBag) { VM.state.inv.money = 0; VM.ui.inventory(); } }
    // white flags at the dead player's house; birds eat their vegetables
    if (!this.mourned) this.mourned = new Set();
    st.players.forEach((p, id) => {
      if (p.alive || this.mourned.has(id) || st.stage === 'lobby') return;
      this.mourned.add(id);
      this.mourn(this.houseObjs[p.house]);
    });
    // trophies where people died (everyone sees them)
    if (!this.trophies) this.trophies = new Map();
    st.players.forEach((p, id) => {
      if (p.alive || !p.dx || this.trophies.has(id)) return;
      this.trophies.set(id, this.add.text(p.dx, p.dy, '🏆\n' + p.name, { fontFamily: 'Segoe UI, Arial, sans-serif', fontSize: '13px', fontStyle: 'bold', color: '#ffe9a8', align: 'center', backgroundColor: 'rgba(20,20,20,0.55)', padding: { x: 5, y: 2 } }).setOrigin(0.5, 1).setResolution(2).setDepth(p.dy));
    });
    // me, injured: lie down and wait for the doctor
    const hurt = !!(mine && mine.alive && mine.injured > 0);
    if (hurt !== !!this.injured) { this.injured = hurt; this.player.setAngle(hurt ? 90 : 0); if (hurt && this.task) { this.task = null; VM.ui.progress(null); } }
    const bar = VM.roleUI.$('injuredbar');
    bar.hidden = !hurt;
    if (hurt) bar.querySelector('b').textContent = mine.injured + ' s';
    if (mine && mine.exposed && mine.alive && !this.player.exposed) {
      this.player.exposed = true;
      this.player.label.setText('🚨 STOLE!').setBackgroundColor('#d63a2f').setColor('#ffffff');
    }

    VM.roleUI.lobby(st, me);
    if (st.stage === 'lobby') VM.mafia.lobby(st, me);
    VM.mafia.update(st, me, this);
    if (st.stage === 'ended') VM.roleUI.$('end-timer').textContent = 'Back to the bus stand by itself in ' + VM.roleUI.mmss(st.waitLeft) + '.';
    VM.roleUI.meeting(st, me);
  },

  becomeGhost(message) {
    if (this.player.exposed) { this.player.exposed = false; this.player.label.setText(this.me.name).setBackgroundColor(this.me.colour.hex).setColor('#ffffff'); } // no STOLE badge on the dead
    this.dead = true;
    this.ghost = true;
    if (this.sleeping) { this.sleeping = false; VM.ui.sleep(false); this.player.setVisible(true); }
    this.task = null; VM.ui.progress(null);
    VM.ui.closeTrade();
    this.player.setTint(0x9fd8ff).setAlpha(0.55);
    this.player.body.checkCollision.none = true;
    VM.JOBS = VM.GHOST_JOBS; this.jobsDone = new Set(); VM.ui.jobs(this.jobsDone);
    document.body.classList.add('is-ghost');
    VM.ui.banner('You are out', message, 'You are a ghost now: you can float around and watch, but nobody can see or hear you.', true);
  },

  // Messages from the server
  onGame(type, m) {
    const ui = VM.roleUI;
    switch (type) {
      case 'matchStart': {
        this.freshMatch = true;
        VM.JOBS = VM.LIVING_JOBS; document.body.classList.remove('is-ghost');
        this.landOwned = false;
        VM.state.inv.money = VM.LAND_PRICE; // Rs 50: just enough for the land next to your house
        VM.ui.inventory();
        // everyone rides the bus to the village, then the black screen tells each player their secret role
        const st = VM.net.room.state, riders = [];
        st.players.forEach((p) => riders.push({ name: p.name, colour: VM.colourByKey(p.colour).hex }));
        this.matchInfo = m.players + ' villagers arrived. ' + m.thieves + ' thie' + (m.thieves > 1 ? 'ves' : 'f') +
          (m.police ? ', 1 police' : '') + (m.doctor ? ', 1 doctor' : '') + ' are hidden among you.';
        VM.journey.play(riders, () => VM.journey.reveal(this.matchInfo, VM.net.role));
        break;
      }
      case 'role':
        this.me.role = m.role;
        this.canSwim = !!m.swimmer; // the one villager who can swim
        if (m.role === 'thief' && !this.thiefEmptied) { // a thief starts with nothing: no money, no goods
          this.thiefEmptied = true;
          for (const k of Object.keys(VM.state.inv)) VM.state.inv[k] = 0;
          VM.state.home = {};
          VM.ui.inventory();
        }
        this.freshMatch = false;
        ui.purse(m.loot || 0, m.role === 'thief' ? m.goal : 0);
        if (VM.journeyOn) VM.journey.setRole(m); // shown on the black screen at the end of the ride
        else ui.showRoleCard(m);
        break;
      case 'note':
        if (VM.net.room.state.stage === 'lobby') { ui.standMessage(m.text); break; }
        VM.ui.toast(m.text);
        if (m.kind === 'bad') VM.sound.play('error');
        if (m.kind) VM.mafia.onNote(m.text);
        if (m.kind) VM.ui.banner(this.me.role ? VM.ROLES[this.me.role].name : 'Village', m.text, '', m.kind === 'bad');
        break;
      case 'narrate':
        VM.mafia.narrate(m);
        break;
      case 'mpicks':
        VM.mafia.onPicks(m.picks);
        break;
      case 'purse':
        ui.purse(m.loot, m.goal);
        break;
      case 'loot':
        VM.sound.play('loot');
        VM.state.inv.money += m.amount;
        VM.ui.inventory();
        break;
      case 'rescued':
        this.pullOut(m.by);
        VM.sound.play('splash');
        break;
      case 'aswasuma':
        VM.give('money', m.amount);
        VM.sound.play('loot');
        VM.aswasuma(m.amount);
        break;
      case 'injured':
        VM.sound.play('kill');
        VM.fx.slash();
        VM.ui.banner('Attacked', 'A thief injured you!', 'Lie still: the doctor can save you within ' + m.seconds + ' seconds.', true);
        break;
      case 'healed':
        VM.sound.play('task');
        VM.ui.banner('Saved', m.by + ' saved you!', 'You are back in the game.');
        break;
      case 'shot':
        VM.sound.play('gun');
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, m.x, m.y) < 700) this.cameras.main.flash(120, 255, 240, 200);
        for (const e of this.elephants) if (!e.leaving && Phaser.Math.Distance.Between(e.x, e.y, m.x, m.y) < 260) this.scareElephant(e);
        if (this.me.role === 'police') VM.ui.toast('Bang! The elephant runs away. Bullets left tonight: ' + m.left + '.');
        break;
      case 'swapOffer':
        VM.swap.incoming(m);
        break;
      case 'swapDone':
        VM.give(m.give, -1); VM.give(m.want, 1);
        VM.sound.play('loot');
        VM.ui.toast('Swapped: you gave 1 ' + VM.ITEMS[m.give].label.toLowerCase() + ' and got 1 ' + VM.ITEMS[m.want].label.toLowerCase() + (m.with ? ' (with ' + m.with + ')' : '') + '.');
        break;
      case 'picked': {
        const got = Object.entries(m.items).map(([k, n]) => { VM.give(k, n); return k === 'money' ? 'Rs ' + n : n + ' ' + (VM.ITEMS[k] ? VM.ITEMS[k].label.toLowerCase() : k); });
        VM.sound.play('loot');
        VM.ui.toast('You picked up ' + m.by + "'s goods: " + got.join(', ') + '.');
        break;
      }
      case 'funeral':
        if (m.id !== VM.net.room.sessionId) VM.fx.funeral(m.name);
        break;
      case 'killed':
        VM.sound.play('kill');
        if (m.wounds) VM.fx.funeral(m.name);
        this.deathMessage = m.text;
        this.becomeGhost(m.text);
        break;
      case 'morning': {
        const lines = m.deaths.map((d) => d.name + (d.cause === 'thief' ? ' was killed by a thief' : d.cause === 'elephant' ? ' was trampled by an elephant' : d.cause === 'hunger' ? ' died of hunger' : ' did not survive the night'));
        (m.framed || []).forEach((n) => lines.push('Stolen goods were found at ' + n + "'s house"));
        (m.spoiled || []).forEach((t) => lines.push(t.replace(/[.!]$/, '')));
        if (lines.length) VM.ui.banner('Morning', lines.length === 1 ? 'Bad news' : lines.length + ' people are gone', lines.join('. ') + '.', true);
        else VM.ui.banner('Morning', 'Everyone survived the night', 'Watch the others closely today.');
        lines.forEach((l) => VM.ui.toast(l + '.'));
        VM.mafia.onMorning(lines);
        break;
      }
      case 'meeting':
        VM.sound.play('bell');
        if (this.sleeping) this.wakeUp(false);
        VM.ui.closeTrade();
        VM.ui.toast(m.by ? m.by + ' rang the bell. Village meeting!' : 'The final meeting has begun.');
        break;
      case 'verdict': {
        VM.sound.play('verdict');
        const sub = m.tally.map((t) => t.name + ': ' + t.votes).join(' · ') || 'Nobody voted.';
        VM.mafia.onVerdict(m.out ? m.out.name + ' leaves the village. ' + m.out.name + (m.out.wasThief ? ' was a thief!' : ' was not a thief.') : 'Nobody leaves the village.');
        if (m.out) VM.ui.banner('The village decided', m.out.name + ' leaves the village', (m.out.wasThief ? m.out.name + ' WAS a thief! ' : m.out.name + ' was not a thief. ') + sub, !m.out.wasThief);
        else VM.ui.banner('The village decided', 'Nobody leaves (no majority)', sub);
        if (m.out && m.out.name === VM.net.myState().name) this.deathMessage = 'The village voted you out.';
        break;
      }
      case 'reveal':
        VM.sound.play((m.winner === 'thieves') === (this.me.role === 'thief') ? 'win' : 'lose');
        ui.endScreen(m, VM.net.room.state.host === VM.net.room.sessionId);
        break;
      default:
    }
  },
});

// ------------------------------------------------------------------ swapping goods with another player (online: no money)
VM.swap = {
  $(id) { return document.getElementById(id); },
  open(id, name) {
    this.target = id;
    const have = Object.keys(VM.ITEMS).filter((k) => (VM.state.inv[k] || 0) > 0);
    if (!have.length) { VM.ui.toast('You have nothing to swap yet. Work first: draw water, harvest paddy, pick vegetables…'); return; }
    this.$('swap').querySelector('.swap-who').textContent = 'Swap with ' + name;
    this.$('swap-give').innerHTML = have.map((k) => '<option value="' + k + '">1 ' + VM.ITEMS[k].label + ' (you have ' + VM.state.inv[k] + ')</option>').join('');
    this.$('swap-want').innerHTML = Object.keys(VM.ITEMS).map((k) => '<option value="' + k + '">1 ' + VM.ITEMS[k].label + '</option>').join('');
    this.$('swap').hidden = false;
    VM.helpOpen = true; // no walking while choosing
  },
  close() { this.$('swap').hidden = true; VM.helpOpen = false; },
  send() {
    const give = this.$('swap-give').value, want = this.$('swap-want').value;
    if (give === want) { VM.ui.toast('Choose two different goods.'); return; }
    VM.net.send('swapOffer', { target: this.target, give, want });
    VM.ui.toast('Offer sent. Waiting for an answer…');
    this.close();
  },
  incoming(m) {
    this.offer = m;
    const can = (VM.state.inv[m.want] || 0) > 0;
    this.$('swapin').querySelector('.swapin-text').textContent = m.name + ' offers 1 ' + VM.ITEMS[m.give].label.toLowerCase() + ' for 1 of your ' + VM.ITEMS[m.want].label.toLowerCase() + (can ? '.' : ' (you have none).');
    this.$('swapin-yes').disabled = !can;
    this.$('swapin').hidden = false;
    VM.sound.play('seat');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.reply(false), 20000);
  },
  reply(yes) {
    if (!this.offer) return;
    VM.net.send('swapReply', { from: this.offer.from, accept: !!yes });
    this.offer = null;
    this.$('swapin').hidden = true;
    clearTimeout(this.timer);
  },
};
document.getElementById('swap-close').addEventListener('click', () => VM.swap.close());
document.getElementById('swap-send').addEventListener('click', () => VM.swap.send());
document.getElementById('swapin-yes').addEventListener('click', () => VM.swap.reply(true));
document.getElementById('swapin-no').addEventListener('click', () => VM.swap.reply(false));

// Aswasuma money arrives: a small gold card pops up, coins drop and the amount counts up
VM.aswasuma = (amount) => {
  const old = document.getElementById('aswasuma'); if (old) old.remove();
  const el = document.createElement('div');
  el.id = 'aswasuma';
  el.innerHTML = '<div class="asw-card"><div class="asw-tag">ASWASUMA</div><div class="asw-amt">+Rs <b>0</b></div>' +
    '<div class="asw-sub">Buy a paddy plot (Rs ' + VM.PADDY_PRICE + ') or your vegetable land</div></div>';
  for (let i = 0; i < 9; i++) {
    const c = document.createElement('i'); c.className = 'asw-coin'; c.textContent = 'රු';
    c.style.left = (8 + Math.random() * 84) + '%'; c.style.animationDelay = (Math.random() * 0.6) + 's';
    el.appendChild(c);
  }
  document.body.appendChild(el);
  const b = el.querySelector('b'), t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / 900); b.textContent = Math.round(amount * k); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
  setTimeout(() => el.classList.add('asw-out'), 3600);
  setTimeout(() => el.remove(), 4200);
};

// Screen effects: the red slash when a thief attacks you, and the black funeral screen when nobody could save someone
VM.fx = {
  myColour() { const me = VM.net.myState && VM.net.myState(); return me ? VM.colourByKey(me.colour).hex : '#f5d000'; },
  person(colour) {
    return '<svg viewBox="0 0 60 80" class="fx-person"><ellipse cx="30" cy="76" rx="20" ry="4" fill="rgba(0,0,0,.35)"/>' +
      '<rect x="12" y="20" width="36" height="50" rx="16" fill="' + colour + '" stroke="#111" stroke-width="4"/>' +
      '<circle cx="30" cy="16" r="13" fill="#8a5a3c" stroke="#111" stroke-width="4"/>' +
      '<rect x="22" y="50" width="6" height="22" fill="#111"/><rect x="33" y="50" width="6" height="22" fill="#111"/></svg>';
  },
  slash() {
    const old = document.getElementById('fx-slash'); if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'fx-slash';
    let streaks = ''; // jagged red streaks with a white-hot core
    for (let i = 0; i < 7; i++) {
      const y = 20 + Math.random() * 60, h = 2 + Math.random() * 4;
      let pts = '0,' + y;
      for (let x = 0; x <= 100; x += 5) pts += ' ' + x + ',' + (y - h / 2 - (x % 10 ? Math.random() * h * 2.5 : 0));
      for (let x = 100; x >= 0; x -= 5) pts += ' ' + x + ',' + (y + h / 2 + (x % 10 ? 0 : Math.random() * h * 2.5));
      streaks += '<polygon points="' + pts + '" fill="' + (i % 2 ? '#c00010' : '#ff2a2a') + '" style="animation-delay:' + (i * 0.04) + 's"/>';
    }
    el.innerHTML = '<svg class="fx-streaks" viewBox="0 0 100 100" preserveAspectRatio="none">' + streaks +
      '<rect x="0" y="45" width="100" height="10" fill="#ffd0d0"/><rect x="0" y="48.5" width="100" height="3" fill="#fff"/></svg>' +
      '<div class="fx-pair"><div class="fx-victim">' + this.person(this.myColour()) + '</div><div class="fx-attacker">' + this.person('#1b1b1b') + '<span class="fx-knife">🔪</span></div></div>';
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('fx-out'), 1700);
    setTimeout(() => el.remove(), 2200);
  },
  funeral(name) {
    const old = document.getElementById('fx-funeral'); if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'fx-funeral';
    el.innerHTML = '<div class="fx-fun-in"><svg class="fx-flag" viewBox="0 0 60 120"><rect x="6" y="4" width="4" height="116" fill="#ddd"/>' +
      '<path d="M10 8 C 30 4, 40 16, 58 10 L 58 46 C 40 52, 30 40, 10 44 Z" fill="#fff"/></svg>' +
      '<div class="fx-fun-title">අනිච්චාවත සංඛාරා</div><div class="fx-fun-sub">නැතිවන ලොවක ඇති නොවන ජීවිතය</div>' +
      '<div class="fx-fun-name">' + String(name || '').replace(/[<>&]/g, '') + '</div></div>';
    document.body.appendChild(el);
    // sad violin while the screen shows (not when the sound is turned off)
    let violin = null;
    if (!VM.sound.muted) {
      try { violin = new Audio('assets/sounds/sad-violin.mp3'); violin.volume = 0.8; violin.play().catch(() => {}); } catch (e) { violin = null; }
    }
    const stop = () => { if (!violin) return; const v = violin; violin = null; const fade = setInterval(() => { v.volume = Math.max(0, v.volume - 0.08); if (v.volume <= 0) { clearInterval(fade); v.pause(); } }, 80); };
    el.addEventListener('click', () => { stop(); el.remove(); });
    setTimeout(stop, 8300);
    setTimeout(() => el.classList.add('fx-out'), 8500);
    setTimeout(() => el.remove(), 9300);
  },
};

Object.assign(VillageScene.prototype, {
  mourn(ho) {
    if (!ho || !ho.h) return;
    const h = ho.h, g = h.garden;
    // a line of small white flags in front of the house, and two tall white flags
    const gfx = this.add.graphics().setDepth(h.y + 2);
    const left = h.x - 70, right = h.x + 70, top = h.y - 70;
    gfx.fillStyle(0xdddddd); gfx.fillRect(left - 2, top, 3, 74); gfx.fillRect(right - 1, top, 3, 74);
    gfx.lineStyle(1, 0xbbbbbb); gfx.lineBetween(left, top + 4, right, top + 4);
    gfx.fillStyle(0xffffff);
    for (let x = left + 8; x < right - 4; x += 12) gfx.fillTriangle(x - 4, top + 4, x + 4, top + 4, x, top + 14);
    const flags = [left, right].map((x) => this.add.triangle(x + 1, top + 10, 0, 0, 22, 7, 0, 14, 0xffffff).setOrigin(0, 0).setDepth(h.y + 3));
    flags.forEach((f, i) => this.tweens.add({ targets: f, scaleX: 0.75, duration: 700 + i * 150, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
    // birds ate the vegetables: the land goes bare and birds peck at it
    if (ho.owner) ho.owner.deadLand = true;
    if (g) {
      for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) {
        const t = this.ground ? this.ground.getTileAt(x, y) : null;
        if (t) t.tint = 0x9a8a6a;
      }
      const cx = (g.x + g.w / 2) * VM.TILE, cy = (g.y + g.h / 2) * VM.TILE;
      for (let i = 0; i < 4; i++) {
        if (!this.textures.exists('crow')) {
          const c = this.make.graphics({ add: false });
          c.fillStyle(0x1a1a1a); c.fillEllipse(9, 9, 14, 9); c.fillCircle(15, 5, 4); c.fillTriangle(2, 8, -1, 4, 4, 6);
          c.fillStyle(0xf0b400); c.fillTriangle(18, 4, 22, 6, 18, 7);
          c.fillStyle(0xffffff); c.fillCircle(16, 4, 1);
          c.lineStyle(1.5, 0x333333); c.lineBetween(8, 13, 7, 17); c.lineBetween(11, 13, 12, 17);
          c.generateTexture('crow', 24, 18); c.destroy();
        }
        const b = this.add.image(cx + (Math.random() - 0.5) * g.w * VM.TILE * 0.7, cy + (Math.random() - 0.5) * g.h * VM.TILE * 0.6, 'crow').setOrigin(0.5, 1).setFlipX(Math.random() < 0.5).setDepth(cy + 50);
        this.tweens.add({ targets: b, y: b.y + 3, angle: 15, duration: 260 + Math.random() * 200, yoyo: true, repeat: -1, delay: Math.random() * 500 });
      }
    }
  },
});
