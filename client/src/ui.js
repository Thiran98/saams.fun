// The HTML panels on top of the game: clock, basket, food, jobs, village map, messages,
// the "press E" prompt and the progress bar.

VM.ui = {
  init() {
    const mapBtn = document.getElementById('mapbtn');
    if (mapBtn) mapBtn.addEventListener('click', () => document.body.classList.toggle('show-map'));
    document.getElementById('minimap').addEventListener('click', () => { if (document.body.classList.contains('is-touch')) document.body.classList.remove('show-map'); });
    document.getElementById('jobs').addEventListener('click', (e) => e.currentTarget.classList.toggle('open'));
    // phones: tap the clock to show or hide the village map
    const clk = document.getElementById('clock'); if (clk) clk.addEventListener('click', () => document.body.classList.toggle('show-map'));
    const $ = (id) => document.getElementById(id);
    this.$ = $;
    this.clockEl = $('clock');
    this.phaseEl = $('phase');
    this.taglineEl = $('tagline');
    this.timerEl = $('timer');
    this.invEl = $('inventory');
    this.storeEl = $('store');
    this.toastsEl = $('toasts');
    this.promptEl = $('prompt');
    this.promptText = this.promptEl.querySelector('span');
    this.progressEl = $('progress');
    this.progressBar = this.progressEl.querySelector('i');
    this.progressText = this.progressEl.querySelector('span');
    this.actionBtn = $('action');
    this.foodBar = $('food').querySelector('i');
    this.foodText = $('food-text');
    this.jobsEl = $('jobs');
    $('eat').addEventListener('click', () => { VM.input.eat = true; });
    // on phones "What I have" folds up; tap its title to open or close it
    this.invEl.addEventListener('click', (e) => {
      if (e.target.closest('.have-title')) this.invEl.closest('.basket').classList.toggle('open');
    });
    this.inventory();
  },

  setPlayer(owner) {
    const chip = this.$('me');
    chip.querySelector('i').style.background = owner.colour.hex;
    chip.querySelector('span').textContent = 'You are ' + owner.colour.name;
  },

  clock(label, secondsLeft, night) {
    const s = Math.max(0, Math.ceil(secondsLeft));
    this.phaseEl.textContent = label;
    this.timerEl.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    this.clockEl.classList.toggle('night', night);
    this.taglineEl.textContent = night ? 'Elephants come, thieves hide, stay alert' : 'Work, farm, trade, complete tasks';
  },

  // "What I have": every item is counted, even when you have none (basket + at home).
  inventory() {
    const inv = VM.state.inv, home = VM.state.home;
    let html = '<button type="button" class="have-title">What I have <span class="fold">▾</span></button>' + (VM.net && VM.net.online && !inv.money ? '' : '<div class="money">Rs ' + inv.money + '</div>') + '<ul class="have">'; // online there is no money: people swap goods
    for (const [key, item] of Object.entries(VM.ITEMS)) {
      const n = inv[key] || 0, h = home[key] || 0;
      html += '<li class="' + (n || h ? '' : 'zero') + '"><span>' + item.label + '</span><b>' + n + '</b>' + (h ? '<em>+' + h + ' home</em>' : '') + '</li>';
    }
    this.invEl.innerHTML = html + '</ul>';
    const atHome = Object.values(VM.state.home).reduce((a, b) => a + b, 0);
    this.storeEl.textContent = 'Village store: ' + VM.state.store + ' / ' + VM.STORE_GOAL + ' paddy · At home: ' + atHome + ' goods';
    if (this.tradeOwner) this.renderTrade();
  },

  food(value) {
    const v = Math.max(0, Math.min(100, value));
    this.foodBar.style.width = v + '%';
    this.foodBar.style.background = v > 50 ? '#7ccf5a' : v > 25 ? '#ffd25a' : '#ff6b5a';
    this.foodText.textContent = v <= 0 ? 'Starving' : v <= 25 ? 'Hungry' : 'Food';
  },

  // the 9 first jobs, shown 3 at a time: the set with the next job to do (set 1, 2 or 3)
  jobs(done) {
    const current = VM.JOBS.find((j) => !done.has(j.id));
    const index = current ? VM.JOBS.indexOf(current) : VM.JOBS.length - 1;
    const set = Math.floor(index / 3), shown = VM.JOBS.slice(set * 3, set * 3 + 3);
    const doneCount = VM.JOBS.filter((j) => done.has(j.id)).length;
    this.jobsEl.innerHTML = '<div class="jobs-title">Jobs · set ' + (set + 1) + ' of 3 <span class="jobs-count">' + doneCount + '/9</span></div>' +
      shown.map((j) => {
        const cls = done.has(j.id) ? 'done' : j === current ? 'now' : '';
        return '<li class="' + cls + '">' + j.text + '</li>';
      }).join('') + '<div class="jobs-dots">' + [0, 1, 2].map((k) => '<i class="' + (k < set ? 'full' : k === set ? 'now' : '') + '"></i>').join('') + '</div>';
    this.jobsEl.classList.toggle('finished', !current);
  },

  // Big banner in the middle of the screen
  banner(small, title, sub, warn) {
    const el = this.$('banner');
    el.querySelector('small').textContent = small;
    el.querySelector('b').textContent = title;
    el.querySelector('span').textContent = sub;
    el.classList.toggle('warn', !!warn);
    el.hidden = false;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => { el.hidden = true; }, warn ? 6000 : 4000);
  },

  showTask(done) {
    if (document.body.classList.contains('is-touch') && (innerWidth <= 700 || innerHeight <= 520)) return; // phones: the job line and arrow are enough
    const job = VM.JOBS.find((j) => !done.has(j.id));
    if (!job) return;
    this.banner('Your task', job.text.replace(/ \(.*\)$/, ''), job.id === 'eat' ? 'Press F or tap Eat' : 'Follow the yellow arrow');
  },

  // ---------------------------------------------------------------- trading with a villager
  openTrade(owner, onClose) {
    this.tradeOwner = owner;
    this.tradeClose = onClose;
    this.$('trade').hidden = false;
    this.$('trade-close').onclick = () => this.closeTrade();
    this.renderTrade();
  },

  closeTrade() {
    if (!this.tradeOwner) return;
    this.tradeOwner = null;
    this.$('trade').hidden = true;
    if (this.tradeClose) this.tradeClose();
  },

  renderTrade() {
    const o = this.tradeOwner, el = this.$('trade');
    el.querySelector('.trade-who').textContent = 'Trade with ' + o.name;
    el.querySelector('.trade-who').style.borderColor = o.colour.hex;
    el.querySelector('.trade-money').textContent = 'You have Rs ' + VM.state.inv.money; // other people's money stays private
    const row = (item, n, price, verb) => `<li><span>${VM.ITEMS[item].label} <em>×${n}</em></span><button data-verb="${verb}" data-item="${item}">${verb === 'buy' ? 'Buy' : 'Sell'} Rs ${price}</button></li>`;
    const theirs = Object.keys(VM.ITEMS).filter((k) => o.inv[k] > 0).map((k) => row(k, o.inv[k], VM.trade.buyPrice(o, k), 'buy')).join('');
    const mine = Object.keys(VM.ITEMS).filter((k) => VM.state.inv[k] > 0).map((k) => row(k, VM.state.inv[k], VM.trade.sellPrice(o, k), 'sell')).join('');
    el.querySelector('.trade-buy').innerHTML = theirs || '<li class="none">Nothing to sell</li>';
    el.querySelector('.trade-sell').innerHTML = mine || '<li class="none">Your basket is empty</li>';
    el.querySelectorAll('button[data-verb]').forEach((b) => {
      b.onclick = () => {
        const err = VM.trade[b.dataset.verb](o, b.dataset.item);
        if (err) this.toast(err); else if (this.onTraded) this.onTraded();
        this.renderTrade();
      };
    });
  },

  // ---------------------------------------------------------------- richest villagers
  richest(rows) {
    const el = this.$('richest');
    if (VM.net && VM.net.online) { el.hidden = true; return; } // no money online
    const sorted = rows.slice().sort((a, b) => b.wealth - a.wealth);
    const myRank = sorted.findIndex((r) => r.isPlayer) + 1;
    // only the ranking is shown; other people's money stays private, you see only your own
    const amount = (r) => (r.isPlayer ? `<b>Rs ${r.wealth}</b>` : '');
    el.innerHTML = '<div class="jobs-title">Richest villagers</div>' + sorted.slice(0, 3).map((r, i) =>
      `<li${r.isPlayer ? ' class="me"' : ''}><i style="background:${r.colour}"></i>${i + 1}. ${r.name}${amount(r)}</li>`).join('') +
      (myRank > 3 ? `<li class="me"><i style="background:${sorted[myRank - 1].colour}"></i>${myRank}. You${amount(sorted[myRank - 1])}</li>` : '');
  },

  // Online status pill: "Online · 3 villagers", "Reconnecting…"
  netStatus(status, count) {
    const el = document.getElementById('net');
    if (!el) return;
    if (status === this.lastNet && count === this.lastCount) return;
    this.lastNet = status; this.lastCount = count;
    el.hidden = !VM.net.online;
    el.className = 'net net--' + status;
    el.textContent = status === 'online' ? `Online · ${count} villager${count === 1 ? '' : 's'}`
      : status === 'reconnecting' ? 'Reconnecting…' : status === 'connecting' ? 'Connecting…' : 'Offline';
  },

  sleep(on, onWake) {
    const el = this.$('sleep');
    el.hidden = !on;
    if (on) this.$('wake').onclick = onWake;
  },

  prompt(text) {
    if (!text) {
      this.promptEl.hidden = true;
      this.actionBtn.classList.remove('ready');
      return;
    }
    this.promptText.textContent = text;
    this.promptEl.hidden = false;
    this.actionBtn.classList.add('ready');
  },

  progress(fraction, label) {
    if (fraction === null) { this.progressEl.hidden = true; return; }
    this.progressEl.hidden = false;
    this.progressBar.style.width = Math.round(fraction * 100) + '%';
    this.progressText.textContent = label;
  },

  toast(message) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    this.toastsEl.appendChild(el);
    while (this.toastsEl.children.length > 3) this.toastsEl.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3700);
  },

  // ---------------------------------------------------------------- village map
  // Shows the land, every house in its owner's colour and where YOU are. Other players are never shown.
  TILE_COLOURS: ['#6fae46', '#6fae46', '#6fae46', '#d4a96a', '#9ccf4f', '#a48a52', '#2f9bd0', '#a8743e', '#e8d29a', '#7a4e2d', '#c8b25e', '#e2c48e', '#2f5f2a'],

  initMap(scene) {
    this.scene = scene;
    this.mini = this.$('minimap');
    this.big = this.$('bigmap');
    this.mapView = this.$('mapview');
    this.base = document.createElement('canvas');
    this.base.width = VM.MAP_W;
    this.base.height = VM.MAP_H;
    this.mapDirty = true;
    this.mini.addEventListener('click', () => this.toggleBigMap(true));
    this.$('mapclose').addEventListener('click', () => this.toggleBigMap(false));
    this.mapView.addEventListener('click', (e) => { if (e.target === this.mapView) this.toggleBigMap(false); });
  },

  toggleBigMap(open) {
    const show = open === undefined ? this.mapView.hidden : open;
    this.mapView.hidden = !show;
    if (show) this.drawMap(this.big, true);
  },

  drawBase() {
    const ctx = this.base.getContext('2d');
    const g = this.scene.grid;
    for (let y = 0; y < VM.MAP_H; y++) for (let x = 0; x < VM.MAP_W; x++) {
      ctx.fillStyle = this.TILE_COLOURS[g[y][x]] || '#6fae46';
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.fillStyle = '#566b5a'; ctx.fillRect(0, 0, VM.MAP_W, 3); // mountains
    this.mapDirty = false;
  },

  fitCanvas(canvas, cssWidth) {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(cssWidth * dpr), h = Math.round(cssWidth * VM.MAP_H / VM.MAP_W * dpr);
    if (canvas.width !== w) { canvas.width = w; canvas.height = h; canvas.style.width = cssWidth + 'px'; canvas.style.height = Math.round(cssWidth * VM.MAP_H / VM.MAP_W) + 'px'; }
    return dpr;
  },

  drawMap(canvas, big) {
    const scene = this.scene, S = VM.TILE;
    if (this.mapDirty) this.drawBase();
    const dpr = this.fitCanvas(canvas, big ? Math.min(window.innerWidth - 48, 960) : (window.innerWidth < 600 ? 120 : 190));
    const ctx = canvas.getContext('2d');
    const sx = canvas.width / VM.MAP_W, sy = canvas.height / VM.MAP_H;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, 0, 0, canvas.width, canvas.height);

    // houses in their owners' colours
    for (const h of scene.world.houses) {
      const owner = scene.owners.find((o) => o.house === h);
      const x = (h.x / S - 1.5) * sx, y = (h.y / S - 2) * sy, w = 3 * sx, hh = 2 * sy;
      ctx.fillStyle = owner ? owner.colour.hex : '#9a8f80';
      ctx.fillRect(x, y, w, hh);
      ctx.strokeStyle = owner && owner.isPlayer ? '#ffffff' : 'rgba(0,0,0,0.6)';
      ctx.lineWidth = (owner && owner.isPlayer ? 2 : 1) * dpr;
      ctx.strokeRect(x, y, w, hh);
    }

    // place names (big map only)
    if (big) {
      ctx.font = `600 ${12 * dpr}px Segoe UI, Arial, sans-serif`;
      ctx.textAlign = 'center';
      for (const l of scene.placeLabels) {
        const x = (l.x / S) * sx, y = (l.y / S) * sy;
        const w = ctx.measureText(l.text).width + 10 * dpr;
        ctx.fillStyle = l.style.backgroundColor || 'rgba(25,25,25,0.8)';
        ctx.fillRect(x - w / 2, y - 16 * dpr, w, 16 * dpr);
        ctx.fillStyle = l.style.color;
        ctx.fillText(l.text, x, y - 4 * dpr);
      }
    }

    // your own things: a small round icon in your colour (house, vegetables, paddy)
    const col = scene.me.colour.hex, rr = (big ? 9 : 5.5) * dpr;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${rr * 1.15}px Segoe UI Emoji, Apple Color Emoji, sans-serif`;
    for (const t of VM.myThings(scene)) {
      const cx = (t.x + t.w / 2) * sx, cy = (t.y + t.h / 2) * sy;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.lineWidth = 2 * dpr; ctx.strokeStyle = col; ctx.stroke();
      ctx.fillText(t.icon, cx, cy + rr * 0.08);
    }
    ctx.textBaseline = 'alphabetic';

    // you
    const p = scene.player, r = Math.max(3.5 * dpr, sx * 0.8);
    ctx.beginPath(); ctx.arc((p.x / S) * sx, ((p.y - 10) / S) * sy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 2 * dpr; ctx.strokeStyle = scene.me.colour.hex; ctx.stroke();
  },

  updateMap(scene, time) {
    if (time - (this.lastMap || 0) < 150) return;
    this.lastMap = time;
    this.drawMap(this.mini, false);
    if (!this.mapView.hidden) this.drawMap(this.big, true);
  },
};
