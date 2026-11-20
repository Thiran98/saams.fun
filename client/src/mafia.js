// Classic Mafia mode in the browser: the night screen (thieves, doctor and police choose from a list), the morning
// news, the discussion bar and the narrator's voice. The server runs the turns (VillageRoom.js, "Classic Mafia mode").

VM.mafia = {
  $(id) { return document.getElementById(id); },
  kind: 'main',     // thieves: choose the victim, or hide stolen goods at a house
  picks: [],        // what the thieves have chosen tonight (thieves only)
  myPick: null,
  result: '',       // the answer to the police's check, the doctor's choice, …
  morningLines: [],

  init() {
    this.el = this.$('mafia');
    this.list = this.el.querySelector('.mafia-list');
    this.list.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-id]');
      if (!b) return;
      if (this.kind === 'main') this.myPick = b.dataset.id;
      VM.net.send('mpick', { target: b.dataset.id, kind: this.kind });
      VM.sound.play('click');
      this.key = null;
    });
    this.el.querySelectorAll('.mafia-tabs button').forEach((b) => {
      b.onclick = () => { this.kind = b.dataset.kind; this.key = null; };
    });
    this.$('mafia-votenow').onclick = () => VM.net.send('mvoteNow');
    // the bus stand: the host chooses how to play
    this.$('mode-pick').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-mode]');
      if (b && !b.disabled) { VM.net.send('mode', b.dataset.mode); VM.sound.play('click'); }
    });
  },

  // The bus stand's mode cards (every frame while at the bus stand)
  lobby(st, me) {
    const isHost = st.host === me;
    document.querySelectorAll('#mode-pick .mode-card').forEach((b) => {
      b.classList.toggle('on', b.dataset.mode === st.mode);
      b.disabled = !isHost;
    });
    const host = st.players.get(st.host);
    this.$('mode-note').textContent = isHost ? 'You choose how to play this match.' : (host ? host.name : 'The first player') + ' chooses how to play.';
  },

  on(st) { return st && st.mode === 'mafia'; },

  // Every frame during a match
  update(st, me, scene) {
    if (!this.on(st) || (st.stage !== 'playing' && st.stage !== 'meeting') || !st.mstep) { this.hide(); this.step = null; return; }
    if (st.mstep !== this.step) this.enterStep(st);
    const left = Math.floor(st.mleft / 60) + ':' + String(st.mleft % 60).padStart(2, '0');
    const label = { night: 'Night ' + st.mround, morning: 'Morning', talk: 'Discussion', vote: 'Village vote' }[st.mstep] || '';
    VM.ui.clock(label, st.mstep === 'vote' ? st.meetingLeft : st.mleft, st.mstep === 'night');
    if (st.mstep === 'talk') {
      this.el.hidden = true;
      const bar = this.$('mafia-bar');
      bar.hidden = false;
      bar.querySelector('b').textContent = 'Discussion · ' + left;
      bar.querySelector('span').textContent = 'Who is the thief? Talk it over (voice or chat). Then everyone votes.';
      this.$('mafia-votenow').hidden = st.host !== me;
      return;
    }
    this.$('mafia-bar').hidden = true;
    if (st.mstep === 'vote') { this.el.hidden = true; return; }
    this.el.hidden = false;
    this.el.classList.toggle('morning', st.mstep === 'morning');
    this.el.querySelector('.mafia-step').textContent = label + ' · ' + left;
    if (st.mstep === 'morning') this.renderMorning();
    else this.renderNight(st, me, scene);
  },

  hide() { this.el.hidden = true; this.$('mafia-bar').hidden = true; },

  enterStep(st) {
    this.step = st.mstep;
    this.key = null;
    const say = () => {}; // the server sends the narrator's lines (narrate)
    if (st.mstep === 'night') {
      this.picks = []; this.myPick = null; this.result = ''; this.kind = 'main';
      say('Night falls on Berala Panathara. Everyone, close your eyes. Thieves, open your eyes and choose your victim. Doctor, choose someone to protect. Police, choose someone to check.');
    } else if (st.mstep === 'morning') {
      say('Good morning, Berala Panathara. ' + this.morningLines.join('. ') + '.');
    } else if (st.mstep === 'talk') {
      say('Gather around the big tree. Now talk: who is the thief?');
    } else if (st.mstep === 'vote') {
      say('Time to vote. Who should leave the village?');
    }
  },

  renderNight(st, me, scene) {
    const mine = st.players.get(me);
    const role = scene.me.role;
    const alive = mine && mine.alive;
    const partners = new Set(((VM.net.role && VM.net.role.partners) || []).map((p) => p.id));
    const key = [role, alive, this.kind, this.myPick, this.result, JSON.stringify(this.picks), [...st.players.values()].map((p) => p.alive).join()].join('|');
    if (key === this.key) return;
    this.key = key;
    const title = this.el.querySelector('.mafia-title'), text = this.el.querySelector('.mafia-text');
    const tabs = this.el.querySelector('.mafia-tabs'), foot = this.el.querySelector('.mafia-foot');
    tabs.hidden = !(alive && role === 'thief');
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.kind === this.kind));
    foot.textContent = this.result;
    let people = [];
    if (!alive) {
      title.textContent = 'You are out of the match';
      text.innerHTML = '<span class="mafia-zzz">👻</span>\nYou can watch, but not act. The village sleeps.';
    } else if (role === 'thief') {
      title.textContent = this.kind === 'main' ? 'Thieves, choose your victim' : 'Hide stolen goods at a house';
      text.textContent = this.kind === 'main'
        ? 'The person most thieves choose is robbed and leaves the match (unless the doctor protects them).' + (partners.size ? ' Your partners see your choice.' : '')
        : 'In the morning the village finds stolen goods at this house, and that person looks guilty. Once a night.';
      st.players.forEach((p, id) => { if (p.alive && !partners.has(id) && id !== me) people.push([id, p]); });
    } else if (role === 'doctor') {
      title.textContent = 'Doctor, who will you protect tonight?';
      text.textContent = 'If the thieves choose this person, they survive. You can protect yourself.';
      st.players.forEach((p, id) => { if (p.alive) people.push([id, p]); });
    } else if (role === 'police') {
      title.textContent = 'Police, who do you want to check?';
      text.textContent = 'You learn whether they are a thief. One check a night.';
      st.players.forEach((p, id) => { if (p.alive && id !== me) people.push([id, p]); });
    } else {
      title.textContent = 'The village sleeps…';
      text.innerHTML = '<span class="mafia-zzz">💤</span>\nClose your eyes. Somewhere in the dark, the thieves are choosing.';
    }
    this.list.innerHTML = people.map(([id, p]) => {
      const by = this.kind === 'main' ? this.picks.filter((k) => k.target === id).map((k) => k.by) : [];
      return '<li><button type="button" data-id="' + id + '"' + (this.kind === 'main' && this.myPick === id ? ' class="chosen"' : '') + '><i style="background:' +
        VM.colourByKey(p.colour).hex + '"></i>' + VM.roleUI.esc(p.name) + (id === me ? ' (you)' : '') + (by.length ? '<small>' + VM.roleUI.esc(by.join(', ')) + '</small>' : '') + '</button></li>';
    }).join('');
  },

  renderMorning() {
    const key = 'morning|' + this.morningLines.join('|');
    if (key === this.key) return;
    this.key = key;
    this.el.querySelector('.mafia-title').textContent = 'Good morning, Berala Panathara';
    this.el.querySelector('.mafia-text').textContent = this.morningLines.length ? this.morningLines.join('.\n') + '.' : 'Everyone survived the night.';
    this.el.querySelector('.mafia-tabs').hidden = true;
    this.list.innerHTML = '';
    this.el.querySelector('.mafia-foot').textContent = 'Soon everyone gathers at the big tree to talk.';
  },

  // ------------------------------------------------------------------ messages from the server
  onMorning(lines) { this.morningLines = lines.length ? lines : ['Everyone survived the night']; },
  onPicks(picks) { this.picks = picks; this.key = null; },
  onNote(text) { if (this.step === 'night') { this.result = text; this.key = null; } },
  onVerdict() { /* the server narrates the verdict */ },

  // ------------------------------------------------------------------ the narrator
  // The server writes every narrator line and sends it ("narrate"). With an OpenAI key on the server, each line is
  // spoken by an OpenAI voice (made once on the server and saved, so repeated lines cost nothing). Without a key,
  // the browser's own voice reads it. The narrator button (bottom left) lets each player choose the voice.
  OPENAI_VOICES: ['ballad', 'onyx', 'ash', 'coral', 'echo', 'fable', 'nova', 'sage', 'shimmer', 'verse', 'alloy'],
  savedVoice() { try { return localStorage.getItem('sams-gama-voice'); } catch (e) { return null; } },
  englishVoices() { return (window.speechSynthesis ? speechSynthesis.getVoices() : []).filter((v) => /^en/i.test(v.lang)); },
  browserVoice() {
    const voices = this.englishVoices(), saved = this.savedVoice();
    const byName = saved && voices.find((v) => v.name === saved);
    if (byName) return byName;
    const score = (v) => (/natural|online/i.test(v.name) ? 40 : 0) + (/google/i.test(v.name) ? 20 : 0) +
      (/en-IN/i.test(v.lang) ? 8 : /en-GB/i.test(v.lang) ? 6 : 0);
    return voices.sort((x, y) => score(y) - score(x))[0] || null;
  },
  // ballad is the default narrator voice
  openaiVoice() { const v = this.savedVoice(); return this.OPENAI_VOICES.includes(v) ? v : 'ballad'; },

  // a line from the server
  narrate(m) {
    if (VM.sound.muted || !m || !m.text) return;
    if (this.tts && m.id) {
      if (this.audio) this.audio.pause();
      this.audio = new Audio(VM.net.api('tts?id=' + encodeURIComponent(m.id) + '&voice=' + this.openaiVoice()));
      this.audio.play().catch(() => this.say(m.text)); // no audio (or the server refused): the browser voice
      return;
    }
    this.say(m.text);
  },
  say(text) {
    if (!window.speechSynthesis || VM.sound.muted || !text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = this.browserVoice();
      u.rate = 0.92; u.pitch = 0.85;
      speechSynthesis.speak(u);
    } catch (e) { /* no voice on this device */ }
  },

  // the narrator's voice (in the ☰ menu): OpenAI voices when the server has a key, otherwise this browser's voices
  initVoicePicker() {
    const sel = this.$('voicepick');
    if (!sel) return;
    VM.net.locate().then(() => fetch(VM.net.api('tts-status'))).then((r) => r.json()).then((j) => { this.tts = !!j.on; }).catch(() => { this.tts = false; });
    this.fillVoices = () => {
      if (this.tts) {
        const cur = this.openaiVoice();
        sel.innerHTML = this.OPENAI_VOICES.map((v) => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + v + '</option>').join('');
      } else {
        const cur = this.browserVoice();
        sel.innerHTML = this.englishVoices().map((v) => '<option value="' + VM.roleUI.esc(v.name) + '"' + (cur && v.name === cur.name ? ' selected' : '') + '>' + VM.roleUI.esc(v.name.replace(/^Microsoft /, '')) + '</option>').join('') || '<option>Browser voice</option>';
      }
    };
    if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => this.fillVoices();
    sel.onchange = () => {
      try { localStorage.setItem('sams-gama-voice', sel.value); } catch (e) { /* private mode */ }
      this.narrate({ id: 'sample', text: 'Welcome to Berala Panathara. I am your narrator tonight.' });
    };
  },

};

VM.mafia.init();
VM.mafia.initVoicePicker();
