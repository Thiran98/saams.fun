// Starts the game once the page has loaded.
// Offline (opened from serve.js): the village starts at once with computer villagers.
// Online (opened from the game server): you type your name, join the village, then the game starts.

window.addEventListener('load', () => {
  const help = document.getElementById('help');
  const startBtn = document.getElementById('start');
  const nameInput = document.getElementById('name');
  const joinError = document.getElementById('join-error');
  const offlineBtn = document.getElementById('offline');
  VM.helpOpen = true;
  const menu = document.getElementById('menu'), howto = document.getElementById('howto');
  // How to play: from the menu, with H during the game, and once before a player's very first game
  let afterHowto = null;
  const showHowto = (then) => { afterHowto = then || null; help.hidden = false; VM.helpOpen = true; menu.hidden = true; howto.hidden = false; howto.scrollTop = 0; };
  const hideHowto = () => {
    try { localStorage.setItem('sams-gama-seen-howto', '1'); } catch (e) { /* private mode */ }
    howto.hidden = true;
    if (VM.game) { closeHelp(); } else menu.hidden = false;
    const then = afterHowto; afterHowto = null;
    if (then) then();
  };
  VM.showHelp = () => { help.classList.add('in-game'); showHowto(); };
  document.getElementById('howto-close').addEventListener('click', () => { afterHowto = null; hideHowto(); });
  document.getElementById('howto-go').addEventListener('click', hideHowto);
  document.getElementById('menu-howto').addEventListener('click', () => showHowto());
  document.getElementById('menu-settings').addEventListener('click', () => VM.gameMenu.open());
  const seenHowto = () => { try { return localStorage.getItem('sams-gama-seen-howto') === '1'; } catch (e) { return true; } };

  document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.tab-page').forEach((p) => { p.hidden = p.dataset.page !== tab.dataset.tab; });
  }));

  if (typeof Phaser === 'undefined') {
    document.getElementById('error-text').textContent =
      'Phaser (the game framework) did not load. Check your internet connection and reload the page.';
    document.getElementById('error').hidden = false;
    help.hidden = true;
    return;
  }

  const startGame = () => {
    if (VM.game) return;
    VM.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      backgroundColor: '#2d4a2b',
      antialias: true,
      roundPixels: true,
      scale: { mode: VM.turned ? Phaser.Scale.NONE : Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight }, // turned page: sized by landscape.js
      physics: { default: 'arcade', arcade: { debug: location.search.includes('debug') } },
      scene: [VillageScene],
    });
  };

  const closeHelp = () => {
    help.hidden = true;
    VM.helpOpen = false;
    document.body.classList.add('playing'); // the ☰ menu button shows during the game
    if (document.body.classList.contains('is-touch')) {
      try {
        const el = document.documentElement, fs = el.requestFullscreen || el.webkitRequestFullscreen;
        const p = fs && !document.fullscreenElement ? fs.call(el) : null;
        const lock = () => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {});
        if (p && p.then) p.then(lock).catch(() => {}); else lock();
      } catch (e) { /* not allowed here: the "turn your phone" screen asks instead */ }
    }
    const scene = VM.game && VM.game.scene.getScene('village');
    if (scene && scene.jobsDone) VM.ui.showTask(scene.jobsDone);
    else VM.firstTaskPending = true; // the scene shows it when it is ready
  };

  const codeInput = document.getElementById('code');
  const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  const newCode = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
  // how: public (the public bus) | join (a private bus by code) | create (a new private bus)
  const join = async (how, code) => {
    if (VM.game) { closeHelp(); return; } // already in the village (help was opened again with H)
    if (typeof how !== 'string') how = 'public';
    if (how === 'join' && cleanCode(code).length !== 4) { joinError.textContent = 'Type the 4-letter bus code.'; joinError.hidden = false; codeInput.focus(); return; }
    const name = nameInput.value.trim();
    if (!name) { joinError.textContent = 'Type your name first.'; joinError.hidden = false; nameInput.focus(); return; }
    if (!seenHowto()) { showHowto(() => join(how, code)); return; } // a first-time player reads how to play first
    joinError.hidden = true;
    startBtn.disabled = true;
    startBtn.textContent = 'JOINING…';
    try { localStorage.setItem('sams-gama-name', name); } catch (e) { /* private mode */ }
    try {
      await VM.net.connect(name, null, how, how === 'create' && !cleanCode(code) ? newCode() : cleanCode(code)); // the server gives each player different clothes
      startGame();
      closeHelp();
    } catch (err) {
      joinError.textContent = 'Could not join: ' + (err && err.message ? err.message : 'the game server did not answer') + ' Is the server running (npm start in the server folder)?';
      joinError.hidden = false;
      startBtn.disabled = false;
      startBtn.textContent = 'TRY AGAIN';
      offlineBtn.hidden = false;
    }
  };

  const playOffline = () => {
    VM.net.online = false;
    VM.BOT_COUNT = 7;
    startGame();
    closeHelp();
  };

  document.getElementById('menu-hint').textContent = VM.net.online ? 'Hop on the bus with anyone online' : 'Practise alone with computer villagers';
  document.getElementById('menu-or').hidden = !VM.net.online;
  if (VM.net.online) {
    document.getElementById('join').hidden = false;
    try { nameInput.value = localStorage.getItem('sams-gama-name') || ''; } catch (e) { /* private mode */ }
    // an invite link with ?code=ABCD joins that private bus
    const urlCode = cleanCode(new URLSearchParams(location.search).get('code'));
    if (urlCode) codeInput.value = urlCode;
    startBtn.textContent = urlCode ? 'JOIN BUS ' + urlCode : 'PLAY';
    startBtn.addEventListener('click', () => join(urlCode ? 'join' : 'public', urlCode));
    const priv = document.getElementById('menu-private'), codes = document.getElementById('codes');
    priv.hidden = false;
    priv.addEventListener('click', () => { codes.hidden = !codes.hidden; if (!codes.hidden) codeInput.focus(); });
    if (urlCode) codes.hidden = false;
    document.getElementById('code-join').addEventListener('click', () => join('join', codeInput.value));
    document.getElementById('code-new').addEventListener('click', () => join('create'));
    codeInput.addEventListener('input', () => { codeInput.value = cleanCode(codeInput.value); });
    codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') join('join', codeInput.value); });
    offlineBtn.addEventListener('click', playOffline);
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(urlCode ? 'join' : 'public', urlCode); });
    // after "New match" the page reloads and joins again by itself
    let auto = null;
    try { auto = sessionStorage.getItem('sams-gama-auto'); sessionStorage.removeItem('sams-gama-auto'); } catch (e) { /* private mode */ }
    let lastCode = '';
    try { lastCode = sessionStorage.getItem('sams-gama-code') || ''; } catch (e) { /* private mode */ }
    if (auto && nameInput.value) join(lastCode ? 'create' : 'public', lastCode); // back to the same bus (its code)
    else if (!('ontouchstart' in window)) nameInput.focus(); // type your name at once (no pop-up keyboard on phones)
  } else {
    startGame();
    startBtn.textContent = 'PLAY';
    startBtn.addEventListener('click', closeHelp);
    window.addEventListener('keydown', (e) => {
      if (VM.helpOpen && (e.key === 'Enter' || e.key === 'Escape')) closeHelp();
    });
  }
});
