// 3D bus stand and bus ride (test version, with ?3d). Same timing, place names, music and engine sound as the
// 2D ride in journey.js; only the picture is drawn in low-poly 3D (Three.js).
// The bus: a red SLTB bus with a white and blue stripe; players sit in its windows, the host is the driver.

VM.bus3d = (function () {
  let THREE = null, loading = null;
  const load = () => {
    if (window.THREE) { THREE = window.THREE; return Promise.resolve(THREE); }
    if (loading) return loading;
    loading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      s.onload = () => { THREE = window.THREE; res(THREE); }; s.onerror = rej;
      document.head.appendChild(s);
    });
    return loading;
  };
  const mats = {};
  const m = (c) => mats[c] || (mats[c] = new THREE.MeshLambertMaterial({ color: c }));
  function mesh(geo, c, x, y, z) { const o = new THREE.Mesh(geo, typeof c === 'string' ? m(c) : c); o.position.set(x || 0, y || 0, z || 0); o.castShadow = true; o.receiveShadow = true; return o; }
  const box = (w, h, d, c, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), c, x, y, z);
  const sph = (r, c, x, y, z, sx, sy, sz) => { const o = mesh(new THREE.SphereGeometry(r, 12, 9), c, x, y, z); if (sx) o.scale.set(sx, sy, sz); return o; };
  function textPlane(text, w, h, bg, fg, font) {
    const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w);
    const ctx = c.getContext('2d');
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.fillStyle = fg; ctx.font = font || ('bold ' + Math.round(c.height * 0.55) + 'px Segoe UI, Arial, sans-serif');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = String(text).split('\n');
    lines.forEach((l, i) => ctx.fillText(l, c.width / 2, c.height * (i + 0.5) / lines.length));
    const tex = new THREE.CanvasTexture(c);
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: !bg, side: THREE.DoubleSide }));
  }

  // ---- a little passenger (head and shoulders, seen through a window)
  function rider(colour, skin) {
    const g = new THREE.Group();
    g.add(sph(0.2, colour, 0, 0.0, 0, 1, 0.8, 0.8));
    g.add(sph(0.17, skin || '#f1d3aa', 0, 0.28, 0));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.2), m('#2a1d16'))).children.slice(-1)[0].position.set(0, 0.3, -0.01);
    [-0.06, 0.06].forEach((x) => g.add(sph(0.022, '#1b1410', x, 0.29, 0.155)));
    return g;
  }

  // ---- the SLTB bus: 7.5 long, front at +x. riders: [{colour}] up to 11, driver: {colour} or null
  function makeBus() {
    const b = new THREE.Group(), body = new THREE.Group(); b.add(body);
    const L = 7.5, H = 2.2, Wd = 2.1, red = '#c91f26';
    body.add(box(L, 0.5, Wd, '#a8151c', 0, 0.55, 0));                                   // skirt
    // the body has real window openings: lower body, a band above the windows, pillars, solid ends and a floor
    body.add(box(L, 0.6, Wd, red, 0, 1.1, 0));                                        // lower body (below the windows)
    body.add(box(L, 0.42, Wd, red, 0, 2.31, 0));                                      // band above the windows
    for (let i = 0; i <= 6; i++) [-1, 1].forEach((sd) => body.add(box(0.16, 0.8, 0.08, red, -3.39 + i * 0.98, 1.72, sd * (Wd / 2 - 0.04))));
    body.add(box(0.5, 0.8, Wd, red, L / 2 - 0.25 - 0.6, 1.72, 0).translateX(0));     // behind the driver
    body.add(box(0.3, 0.8, Wd, red, -L / 2 + 0.15, 1.72, 0));                         // back end
    body.add(box(L - 0.4, 0.05, Wd - 0.1, '#5a2a2a', 0, 1.42, 0));                     // floor inside
    for (let i = 0; i < 6; i++) body.add(box(0.12, 0.45, Wd - 0.4, '#2b3fa8', -3.25 + i * 0.98, 1.65, 0)); // blue seat backs (behind each passenger)
    const roof = box(L - 0.1, 0.25, Wd - 0.08, '#e9e4dc', 0, H + 0.62, 0); body.add(roof);   // roof
    body.add(box(L + 0.02, 0.16, Wd + 0.02, '#ffffff', 0, 1.15, 0));                     // white stripe
    body.add(box(L + 0.03, 0.1, Wd + 0.03, '#2b3fa8', 0, 1.15, 0));                      // blue stripe
    // windows (both sides): 6 per side, light blue; at night they glow with disco colours
    const winMats = [];
    for (let i = 0; i < 6; i++) {
      const x = -2.9 + i * 0.98;
      [-1, 1].forEach((sd) => {
        const wm = new THREE.MeshLambertMaterial({ color: '#bfe3f5', emissive: '#000000', transparent: true, opacity: 0.22, depthWrite: false });
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.72, 0.04), wm); w.position.set(x, 1.72, sd * (Wd / 2 + 0.01)); body.add(w); winMats.push(wm);
      });
    }
    // front: big windscreen, door, lights, destination board
    body.add(box(0.06, 0.95, Wd - 0.3, '#9fd2ee', L / 2 + 0.01, 1.75, 0));
    body.add(box(0.05, 1.6, 0.7, '#3a1416', 2.5, 1.2, Wd / 2 + 0.01));                   // door
    const board = textPlane('99  SAMS GAMA', 1.6, 0.28, '#111', '#ffb000'); board.position.set(L / 2 + 0.04, 2.45, 0); board.rotation.y = Math.PI / 2; body.add(board);
    [-0.7, 0.7].forEach((z) => body.add(mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff6c8' }), L / 2 + 0.02, 0.75, z)));
    // SLTB on both sides
    [-1, 1].forEach((sd) => { const t = textPlane('SLTB', 1.3, 0.42, null, '#ffffff', 'bold 100px Segoe UI, Arial'); t.position.set(-1.2, 0.95, sd * (Wd / 2 + 0.03)); if (sd < 0) t.rotation.y = Math.PI; body.add(t); });
    // wheels
    const wheels = [];
    [[-2.4, 1], [-2.4, -1], [2.3, 1], [2.3, -1]].forEach(([x, sd]) => {
      const w = new THREE.Group(); w.position.set(x, 0.45, sd * (Wd / 2 - 0.05));
      const tyre = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 16), '#1f1f1f'); tyre.rotation.x = Math.PI / 2; w.add(tyre);
      const hub = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.32, 8), '#bbbbbb'); hub.rotation.x = Math.PI / 2; w.add(hub);
      b.add(w); wheels.push(w);
    });
    // seats: passengers by the windows (near side first), and the driver behind the windscreen
    const seats = [];
    for (let i = 0; i < 6; i++) [0.55, -0.55].forEach((z) => seats.push({ x: -2.9 + i * 0.98, z }));
    // disco lights inside the roof
    const disco = [];
    ['#ff3b6b', '#3bd5ff', '#ffe23b', '#8b5cff'].forEach((c, i) => { const l = mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: c }), -2.5 + i * 1.6, 2.45, 0); l.visible = false; body.add(l); disco.push(l); });
    b.userData = { body, wheels, seats, riders: [], driver: null, winMats, disco, key: '' };
    b.traverse((c) => { if (c.isMesh) c.castShadow = true; });
    return b;
  }
  function seatRiders(bus, riders, driver) {
    const d = bus.userData, key = riders.map((r) => r.colour).join(',') + '|' + (driver ? driver.colour : '');
    if (key === d.key) return;
    d.key = key;
    d.riders.forEach((r) => d.body.remove(r)); d.riders = [];
    if (d.driver) { d.body.remove(d.driver); d.driver = null; }
    riders.slice(0, 11).forEach((r, i) => { const s = d.seats[i], p = rider(r.colour); p.position.set(s.x, 1.45, s.z); p.userData.pop = performance.now(); d.body.add(p); d.riders.push(p); });
    if (driver) { const p = rider(driver.colour); p.position.set(3.1, 1.45, 0.45); d.body.add(p); d.driver = p; }
  }
  function animateBus(bus, now, speed, nightK) {
    const d = bus.userData;
    d.wheels.forEach((w) => { w.children.forEach((c) => { c.rotation.y -= speed * 0.06; }); });
    d.body.position.y = speed > 0.01 ? Math.sin(now / 70) * 0.025 : 0;
    d.riders.concat(d.driver ? [d.driver] : []).forEach((p, i) => {
      const age = (now - (p.userData.pop || 0)) / 400; const s = (age < 1 ? 0.3 + 0.7 * Math.sin(Math.min(1, age) * Math.PI / 2) : 1) * 1.25;
      p.scale.setScalar(s); p.position.y = 1.45 + (speed > 0.01 ? Math.abs(Math.sin(now / 160 + i)) * 0.04 : 0) + (nightK > 0.5 ? Math.abs(Math.sin(now / 230 + i * 1.7)) * 0.06 : 0); // dancing at night
    });
    // disco at night: windows flash in party colours, lights on the roof
    const cols = ['#ff3b6b', '#3bd5ff', '#ffe23b', '#8b5cff', '#3bff8a'];
    d.winMats.forEach((wm, i) => {
      if (nightK > 0.3) { wm.emissive.set(cols[(Math.floor(now / 330) + i) % cols.length]); wm.emissiveIntensity = 0.9 * nightK; wm.opacity = 0.45; }
      else { wm.emissive.set('#000000'); wm.opacity = 0.22; }
    });
    d.disco.forEach((l) => { l.visible = nightK > 0.3; });
  }

  return { load, makeBus, seatRiders, animateBus, mesh, box, sph, textPlane, m, get THREE() { return THREE; } };
})();

// ------------------------------------------------------------------ the bus stand (lobby)
VM.lobby3d = (function () {
  let r, scene, cam, bus, canvas, raf = null, started = false;
  // the 12 seats as round avatars (the driver first), plus a line about what happens next
  let seatsKey = '';
  function drawSeats(st) {
    const top = document.querySelector('#lobby .sheet-top');
    if (!top) return;
    let row = top.querySelector('.seat-row');
    if (!row) { row = document.createElement('div'); row.className = 'seat-row'; top.prepend(row); }
    const me = VM.net.room.sessionId, list = [];
    st.players.forEach((p, id) => list.push({ id, p }));
    list.sort((a, b) => (a.id === st.host ? -1 : b.id === st.host ? 1 : 0));
    const min = st.minPlayers || 3, need = Math.max(0, min - list.length);
    const key = list.map(({ id, p }) => id + p.name + p.colour).join('|') + need + (st.host === me);
    if (key === seatsKey) return;
    seatsKey = key;
    let html = '';
    for (let i = 0; i < 12; i++) {
      const e = list[i];
      if (!e) { html += '<span class="seat empty" title="Empty seat"></span>'; continue; }
      const c = VM.colourByKey(e.p.colour).hex, esc = (t) => String(t).replace(/[<>&"]/g, '');
      html += '<span class="seat' + (e.id === me ? ' me' : '') + (e.id === st.host ? ' driver' : '') + '" style="--c:' + c + '" title="' + esc(e.p.name) + (e.id === st.host ? ' (driver)' : '') + '">' + esc(e.p.name.charAt(0).toUpperCase()) + (e.id === st.host ? '<i>🚌</i>' : '') + '</span>';
    }
    const isHost = st.host === me, host = st.players.get(st.host);
    const note = isHost ? (need ? "You're the driver · " + need + ' more player' + (need > 1 ? 's' : '') + ' needed' : "You're the driver · ready when you are")
      : (host ? host.name + ' is driving · ' + (need ? need + ' more needed' : 'waiting to leave') : '');
    row.innerHTML = '<div class="seats">' + html + '</div><div class="seat-note">' + note + '</div>';
  }

  function start() {
    if (started || !VM.USE3D) return;
    started = true;
    VM.bus3d.load().then((THREE) => {
      const B = VM.bus3d, holder = document.querySelector('#lobby .lg-scene');
      if (!holder) return;
      holder.classList.add('is-3d');
      // the designed layout: the controls move into one panel at the bottom (same elements, same buttons)
      const lobbyEl = document.getElementById('lobby'), wrap = lobbyEl.querySelector('.stand-wrap');
      lobbyEl.classList.add('lobby-3d');
      const sheet = document.createElement('div'); sheet.className = 'lobby-sheet';
      const top = document.createElement('div'); top.className = 'sheet-top';
      top.append(document.getElementById('lobby-names'), lobbyEl.querySelector('.stand-clock'));
      sheet.append(top, document.getElementById('mode-pick'), document.getElementById('mode-note'), document.getElementById('lobby-need'), document.getElementById('lobby-msg'), lobbyEl.querySelector('.lobby-buttons'));
      wrap.appendChild(sheet);
      // the newspaper opens as a pop-up with a close button
      const paper = document.getElementById('paper'), link = lobbyEl.querySelector('.paper-link');
      if (paper && !paper.querySelector('.paper-close')) { const x = document.createElement('button'); x.type = 'button'; x.className = 'paper-close'; x.setAttribute('aria-label', 'Close'); x.textContent = '✕'; paper.prepend(x); x.onclick = () => lobbyEl.classList.remove('show-paper'); }
      if (link) { link.textContent = '📰 Paper'; link.onclick = (e) => { e.preventDefault(); lobbyEl.classList.add('show-paper'); paper.scrollTop = 0; }; }
      const copy = document.getElementById('lobby-copy'); if (copy) copy.textContent = '🔗 Invite';
      // choose your own bus song right here (it plays only on your device, from your phone or computer)
      const btns = lobbyEl.querySelector('.lobby-buttons');
      if (btns && !document.getElementById('lobby-song')) { const sb = document.createElement('button'); sb.type = 'button'; sb.id = 'lobby-song'; sb.textContent = (VM.sound && VM.sound.ownSong) ? '🎵 ' + VM.sound.ownSong.name.slice(0, 14) : '🎵 My song'; sb.title = 'Play your own song on the bus ride (only on this device)'; sb.onclick = () => document.getElementById('gm-song-file').click(); btns.appendChild(sb);
        document.getElementById('gm-song-file').addEventListener('change', () => setTimeout(() => { if (VM.sound.ownSong) { sb.textContent = '🎵 ' + VM.sound.ownSong.name.slice(0, 14); VM.ui.toast('Your song will play on the bus ride.'); } }, 800)); }
      const add = document.getElementById('lobby-addbot'); if (add) add.textContent = '+ Computer';
      const fill = document.getElementById('lobby-fillbots'); if (fill) fill.textContent = 'Fill the bus';
      const clr = document.getElementById('lobby-clearbots'); if (clr) clr.textContent = 'Remove computers';
      const clock = lobbyEl.querySelector('.stand-clock'); if (clock) clock.firstChild.textContent = '🚌 Leaves in ';
      document.querySelectorAll('#mode-pick .mode-card b').forEach((b, i) => { b.textContent = (i ? '🎭 ' : '🌾 ') + b.textContent.replace(/^[^A-Za-z]+/, ''); });
      canvas = document.createElement('canvas'); canvas.className = 'lg-3d'; holder.appendChild(canvas);
      try { r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch (e) { canvas.remove(); holder.classList.remove('is-3d'); return; }
      const phone = document.body.classList.contains('is-touch'); r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); r.shadowMap.enabled = !phone; r.shadowMap.type = THREE.PCFSoftShadowMap;
      scene = new THREE.Scene();
      cam = new THREE.PerspectiveCamera(32, 2, 0.5, 100);
      scene.add(new THREE.HemisphereLight('#ffffff', '#6f9a50', 0.62));
      const sun = new THREE.DirectionalLight('#fff1dc', 0.7); sun.position.set(-6, 12, 9); sun.castShadow = true;
      Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 }); sun.shadow.mapSize.set(1024, 1024); scene.add(sun);
      // ground, road with dashes, pavement
      const ground = B.mesh(new THREE.PlaneGeometry(60, 30), '#6fae46'); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
      const road = B.mesh(new THREE.PlaneGeometry(60, 4), '#4a4a55', 0, 0.01, 0.6); road.rotation.x = -Math.PI / 2; scene.add(road);
      for (let x = -28; x < 28; x += 2.2) { const d = B.mesh(new THREE.PlaneGeometry(1, 0.12), '#f4d24a', x, 0.02, 2.0); d.rotation.x = -Math.PI / 2; scene.add(d); }
      const pave = B.box(60, 0.15, 2.2, '#d9cfc2', 0, 0.075, -2.6); scene.add(pave);
      // the bus halt shelter with a bench and a sign
      const sh = new THREE.Group();
      [[-1.4, -0.5], [1.4, -0.5]].forEach(([x, z]) => sh.add(B.box(0.1, 2.3, 0.1, '#5a5a66', x, 1.2, z)));
      sh.add(B.box(3.4, 0.12, 1.6, '#c91f26', 0, 2.4, -0.9)); sh.add(B.box(3.2, 2.2, 0.08, '#e9e4dc', 0, 1.25, -1.6));
      sh.add(B.box(2.4, 0.1, 0.5, '#a7714a', 0, 0.55, -1.25));
      const sign = B.textPlane('Bus to Sams Gama', 2.6, 0.4, '#1e6b3a', '#ffffff'); sign.position.set(0, 2.75, -0.1); sh.add(sign);
      sh.position.set(-6.5, 0.15, -2.4); scene.add(sh);
      // palms and a couple of trees behind
      for (let i = 0; i < 7; i++) { const t = B.sph(0.9, ['#4f9a3a', '#6fb848', '#8fcf55'][i % 3], -14 + i * 4.6, 1.6, -5.5 - (i % 2)); scene.add(t); scene.add(B.box(0.2, 1.2, 0.2, '#8a5a3c', -14 + i * 4.6, 0.6, -5.5 - (i % 2))); }
      bus = B.makeBus(); bus.position.set(0.6, 0, 0.3); scene.add(bus);
      const resize = () => { const w = holder.clientWidth || 600, h = holder.clientHeight || 260; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
      resize(); window.addEventListener('resize', resize);
      const frame = (now) => {
        raf = requestAnimationFrame(frame);
        const lobby = document.getElementById('lobby');
        if (VM.net.room && VM.net.room.state && VM.net.room.state.stage !== 'lobby' && !lobby.classList.contains('released')) {
          // the bus has left: free the bus stand's 3D drawing (it comes back with the page for the next match)
          cancelAnimationFrame(raf); try { r.dispose(); r.forceContextLoss(); } catch (e) { /* gone */ }
          lobby.classList.add('released'); return;
        }
        if (!lobby || lobby.hidden) return;
        resize();
        const st = VM.net.room && VM.net.room.state;
        if (st) {
          const riders = [], host = st.host; let driver = null;
          st.players.forEach((p, id) => { const c = { colour: VM.colourByKey(p.colour).hex }; if (id === host) driver = c; else riders.push(c); });
          B.seatRiders(bus, riders, driver);
          drawSeats(st);
        }
        B.animateBus(bus, now, 0, 0);
        const a = Math.sin(now / 6000) * 0.25;
        const tall = innerHeight > innerWidth; const dist = tall ? 30 : 21; cam.position.set(Math.sin(a) * dist - 1, dist * 0.32, Math.cos(a) * dist); cam.lookAt(-1, tall ? -2.6 : -1.1, 0); // the bus sits in the upper half, above the panel
        r.render(scene, cam);
      };
      raf = requestAnimationFrame(frame);
    }).catch((e) => console.warn(e));
  }
  return { start };
})();

// ------------------------------------------------------------------ the bus ride
VM.journey3d = (function () {
  let r, scene, cam, bus, canvas, sky, sun, hemi, stars, moon, smoke = [], parts = [], fadeEl, ready = false, startedFor = null;
  const D3 = 270;                       // road length in units
  const at = (u) => D3 * (0.8 * u + 0.2 * VM.journey.ease(u)); // an even, unhurried pace; places line up with the place names

  function build(THREE) {
    const B = VM.bus3d, J = VM.journey;
    canvas = document.createElement('canvas'); canvas.className = 'journey-3d';
    J.el.insertBefore(canvas, J.el.firstChild.nextSibling);
    r = new THREE.WebGLRenderer({ canvas, antialias: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = !document.body.classList.contains('is-touch'); r.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#bfe6fa', 50, 130);
    sky = new THREE.Color('#8fd0f5'); scene.background = sky;
    cam = new THREE.PerspectiveCamera(36, 2, 0.5, 300);
    hemi = new THREE.HemisphereLight('#ffffff', '#6f9a50', 0.66); scene.add(hemi);
    sun = new THREE.DirectionalLight('#fff1dc', 0.75); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, far: 80 }); scene.add(sun, sun.target);
    // ground and the road (x = along the road)
    const ground = B.mesh(new THREE.PlaneGeometry(D3 + 200, 120), '#6fae46', D3 / 2, 0, 0); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const road = B.mesh(new THREE.PlaneGeometry(D3 + 200, 4.2), '#4f4d58', D3 / 2, 0.01, 0); road.rotation.x = -Math.PI / 2; scene.add(road);
    for (let x = -60; x < D3 + 100; x += 3) { const d = B.mesh(new THREE.PlaneGeometry(1.4, 0.12), '#f4d24a', x, 0.02, 0); d.rotation.x = -Math.PI / 2; scene.add(d); }
    [-2.3, 2.3].forEach((z) => { const e = B.mesh(new THREE.PlaneGeometry(D3 + 200, 0.3), '#d4a96a', D3 / 2, 0.015, z); e.rotation.x = -Math.PI / 2; scene.add(e); });
    // stars and the moon
    const sp = new Float32Array(600 * 3); for (let i = 0; i < 600; i++) { sp[i * 3] = Math.random() * (D3 + 200) - 60; sp[i * 3 + 1] = 20 + Math.random() * 40; sp[i * 3 + 2] = -60 - Math.random() * 30; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 0.35, transparent: true, opacity: 0 })); scene.add(stars);
    moon = B.mesh(new THREE.SphereGeometry(2.2, 16, 12), new THREE.MeshBasicMaterial({ color: '#f5efd2' })); scene.add(moon);
    places(THREE);
    bus = B.makeBus(); scene.add(bus);
    B.seatRiders(bus, (J.riders || []).slice(1).map((p) => ({ colour: VM.colourByKey(p.colour).hex })), J.riders && J.riders[0] ? { colour: VM.colourByKey(J.riders[0].colour).hex } : null);
    fadeEl = document.createElement('div'); fadeEl.className = 'journey-fade'; J.el.appendChild(fadeEl);
    ready = true;
  }

  // ---- the places along the way
  function places(THREE) {
    const B = VM.bus3d, add = (o) => { scene.add(o); return o; };
    let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const tree = (x, z, s, c) => { add(B.box(0.25 * s, 1.4 * s, 0.25 * s, '#8a5a3c', x, 0.7 * s, z)); add(B.sph(0.95 * s, c || ['#4f9a3a', '#6fb848', '#8fcf55'][Math.floor(rnd() * 3)], x, 1.9 * s, z)); };
    const pine = (x, z, s) => { add(B.box(0.2 * s, 0.8 * s, 0.2 * s, '#8a5a3c', x, 0.4 * s, z)); [[0.9, 1.3, 1.1], [0.7, 1.1, 1.8], [0.45, 0.9, 2.4]].forEach(([rr, h, y], i) => add(B.mesh(new THREE.ConeGeometry(rr * s, h * s, 6), ['#2f7a3a', '#3f9446', '#55ad52'][i], x, y * s, z))); };
    const palm = (x, z, s) => { for (let i = 0; i < 5; i++) add(B.box(0.16 * s, 0.6 * s, 0.16 * s, i % 2 ? '#a37a52' : '#93693f', x + i * 0.05, 0.3 * s + i * 0.55 * s, z)); for (let i = 0; i < 7; i++) { const hold = new THREE.Group(); hold.position.set(x + 0.25, 3 * s, z); hold.rotation.y = i * 0.9; const leaf = B.sph(0.7 * s, '#5fae5a', 0.6 * s, 0, 0, 1, 0.07, 0.25); leaf.rotation.z = -0.45; hold.add(leaf); add(hold); } };
    const sign = (u, text, sub) => { const g = new THREE.Group(); g.add(B.box(0.12, 2.2, 0.12, '#888', 0, 1.1, 0)); const p = B.textPlane(text + '\n' + sub, 2.6, 1.1, '#1e6b3a', '#ffffff', 'bold 70px Segoe UI, Arial'); p.position.set(0, 2.6, 0.08); g.add(p); g.position.set(at(u) + 14, 0, -3.2); add(g); };
    const building = (x, z, w, h, c) => { add(B.box(w, h, 3, c, x, h / 2, z)); for (let y = 1; y < h - 0.5; y += 1.2) for (let k = -w / 2 + 0.6; k < w / 2 - 0.3; k += 1) add(B.box(0.5, 0.6, 0.05, '#9fd2ee', x + k, y, z + 1.52)); };

    // University of Moratuwa: buildings and the long sign wall (start)
    building(-9, -12, 10, 6, '#e9e4dc'); building(3, -13, 8, 8, '#d9cfc2');
    add(B.box(16, 1.6, 0.4, '#8a1d22', -5, 0.8, -4.2));
    const uni = B.textPlane('UNIVERSITY OF MORATUWA', 12, 0.9, '#8a1d22', '#ffd23f'); uni.position.set(-5, 0.85, -3.98); add(uni);
    // Pettah: colourful shops, the red and white striped mosque, the Lotus Tower behind
    const cols = ['#e9d7b4', '#cfd9e6', '#f0c9a8', '#d8e5c9', '#e7c0c0', '#c9c4e0', '#f2e6a6'];
    for (let x = at(0.11); x < at(0.21); x += 4 + rnd() * 3) building(x, -10 - rnd() * 4, 3 + rnd() * 3, 3 + rnd() * 6, cols[Math.floor(rnd() * cols.length)]);
    const mx = at(0.155);
    for (let i = 0; i < 8; i++) add(B.box(6, 0.5, 4, i % 2 ? '#ffffff' : '#c8262b', mx, 0.25 + i * 0.5, -8));
    [-2.2, 0, 2.2].forEach((dx, i) => { add(B.box(0.8, 5.5 + (i === 1 ? 1 : 0), 0.8, i % 2 ? '#ffffff' : '#c8262b', mx + dx, 2.8, -8)); add(B.sph(0.55, '#c8262b', mx + dx, 6 + (i === 1 ? 1 : 0), -8)); });
    // Nelum Kuluna (the Lotus Tower): a slim white tower with a green collar and a pink lotus bud on top
    const lt = at(0.165), lz = -16;
    add(B.mesh(new THREE.CylinderGeometry(1.6, 2, 1.2, 12), '#9fd0e6', lt, 0.6, lz));                     // base
    add(B.mesh(new THREE.CylinderGeometry(0.35, 0.6, 13, 10), '#f2eee6', lt, 7.6, lz));                  // shaft
    add(B.mesh(new THREE.CylinderGeometry(1.4, 0.7, 0.9, 12), '#3f9a5a', lt, 14.3, lz));                 // green collar
    for (let i = 0; i < 8; i++) { const p = B.sph(0.75, i % 2 ? '#e07ab4' : '#c45a9e', lt, 15.6, lz, 0.55, 1.5, 0.55); p.rotation.y = i * Math.PI / 4; p.position.x += Math.cos(i * Math.PI / 4) * 0.6; p.position.z += Math.sin(i * Math.PI / 4) * 0.6; p.rotation.z = Math.cos(i * Math.PI / 4) * -0.35; p.rotation.x = Math.sin(i * Math.PI / 4) * 0.35; add(p); }
    add(B.sph(0.75, '#f29ac8', lt, 16.4, lz, 1, 1.3, 1)); add(B.mesh(new THREE.CylinderGeometry(0.05, 0.12, 3.5, 6), '#e9e4dc', lt, 18.5, lz)); // bud and mast
    const lk = B.textPlane('Nelum Kuluna', 3.6, 0.7, '#c45a9e', '#ffffff'); lk.position.set(lt, 2.2, lz + 2.2); add(lk);
    // Nelum Pokuna (the lotus pond theatre): a white curved hall behind a pond full of lotus flowers
    const px = at(0.195), pz = -11;
    const hall = B.mesh(new THREE.CylinderGeometry(4.2, 4.6, 3.2, 20, 1, false, Math.PI * 0.15, Math.PI * 0.7), '#f4f1ea', px, 1.6, pz - 2); hall.rotation.y = Math.PI * 0.85; add(hall);
    for (let i = 0; i < 7; i++) { const a = -0.55 + i * 0.18; add(B.box(0.25, 3.4, 0.25, '#ffffff', px + Math.sin(a) * 4.8, 1.7, pz - 2 + Math.cos(a) * 4.8)); }
    const pond = B.mesh(new THREE.CircleGeometry(4, 24), '#3f9ad0', px, 0.04, pz + 2.6); pond.rotation.x = -Math.PI / 2; add(pond);
    for (let i = 0; i < 12; i++) { const a = rnd() * Math.PI * 2, r = 1 + rnd() * 2.6, x = px + Math.cos(a) * r, z = pz + 2.6 + Math.sin(a) * r * 0.8; const pad = B.mesh(new THREE.CircleGeometry(0.35, 10), '#3f9446', x, 0.06, z); pad.rotation.x = -Math.PI / 2; add(pad); if (i % 2) add(B.sph(0.16, '#f29ac8', x, 0.18, z, 1, 0.8, 1)); }
    const lp = B.textPlane('Nelum Pokuna', 3.6, 0.7, '#3f9ad0', '#ffffff'); lp.position.set(px, 2.2, pz + 6.9); add(lp);
    sign(0.15, 'Pettah', 'Galle 120 km');
    // Hikkaduwa: the sea, surf, surfers, a turtle and palms
    const sea = B.mesh(new THREE.PlaneGeometry(at(0.12) + 40, 60), '#5fb0e0', at(0.27), 0.03, -36); sea.rotation.x = -Math.PI / 2; add(sea);
    const sand = B.mesh(new THREE.PlaneGeometry(at(0.12) + 40, 3), '#eed7ad', at(0.27), 0.025, -5.2); sand.rotation.x = -Math.PI / 2; add(sand);
    for (let i = 0; i < 10; i++) { const w = B.box(6 + rnd() * 6, 0.12, 0.25, '#ffffff', at(0.21) + rnd() * at(0.12), 0.08, -7 - rnd() * 14); add(w); }
    [[0.24, -12], [0.27, -16]].forEach(([u, z]) => { add(B.box(1.6, 0.08, 0.45, '#ffd23f', at(u), 0.1, z)); add(B.sph(0.25, '#a8714e', at(u), 0.6, z)); add(B.box(0.3, 0.6, 0.3, '#2b3fa8', at(u), 0.3, z)); });
    const tx = at(0.25) + 6; add(B.sph(0.6, '#4f8f5a', tx, 0.25, -5.2, 1.3, 0.45, 1)); add(B.sph(0.22, '#7aa86a', tx + 0.8, 0.25, -5.2));
    for (let x = at(0.19); x < at(0.45); x += 5 + rnd() * 6) palm(x, -4.5 - rnd() * 1.5, 1);
    sign(0.24, 'Hikkaduwa', 'Galle 20 km');
    // Galle: the fort wall, the white lighthouse and the clock tower
    const gx = at(0.38);
    add(B.box(26, 2.6, 2, '#a9a49a', gx, 1.3, -10));
    for (let k = -12; k <= 12; k += 1.5) add(B.box(0.8, 0.6, 2, '#a9a49a', gx + k, 2.9, -10));
    add(B.mesh(new THREE.CylinderGeometry(0.9, 1.2, 9, 12), '#ffffff', gx + 6, 4.5, -13)); add(B.mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.8, 12), '#2f2f3a', gx + 6, 9.3, -13));
    const lamp = B.mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff3a0' }), gx + 6, 9.9, -13); add(lamp); lamp.userData.beacon = true;
    add(B.box(1.6, 7, 1.6, '#f1e6d0', gx - 6, 3.5, -12)); add(B.mesh(new THREE.ConeGeometry(1.3, 1.6, 4), '#c8262b', gx - 6, 7.8, -12)); add(B.mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16), '#ffffff', gx - 6, 6, -11.15)).rotation.x = Math.PI / 2;
    sign(0.37, 'Galle', 'Akuressa 30 km');
    // Akuressa: paddy fields and the Nilwala river under a bridge
    [[0.5, 22], [0.6, 18]].forEach(([u, w]) => { const p = B.mesh(new THREE.PlaneGeometry(w, 14), '#b3d46f', at(u), 0.02, -12); p.rotation.x = -Math.PI / 2; add(p); });
    const rx = at(0.55); const river = B.mesh(new THREE.PlaneGeometry(6, 120), '#5fa8d8', rx, 0.03, 0); river.rotation.x = -Math.PI / 2; add(river);
    add(B.box(7, 0.4, 4.6, '#b9b0a4', rx, 0.2, 0)); [-2.4, 2.4].forEach((z) => add(B.box(7, 0.5, 0.15, '#d9cfc2', rx, 0.65, z)));
    sign(0.54, 'Akuressa', 'Deniyaya 40 km');
    // Deniyaya: tea hills with rows and pickers
    for (let x = at(0.63); x < at(0.8); x += 14 + rnd() * 8) { const h = B.sph(9, '#6fae5a', x, -4, -22 - rnd() * 8, 1.2, 0.7, 0.8); add(h); const hz = h.position.z; for (let k = 1; k < 6; k++) add(B.sph(9 - k * 1.45, k % 2 ? '#4f8f3a' : '#6fae5a', x, -4 + k * 0.55, hz, 1.2, 0.7, 0.8)); } // tea terraces
    sign(0.68, 'Deniyaya', 'Berala Panathara 12 km');
    // the jungle, and the gate of Berala Panathara (the end)
    for (let x = at(0.78); x < at(1) + 40; x += 2.5 + rnd() * 2.5) { (rnd() < 0.5 ? pine : tree)(x, -5 - rnd() * 10, 1 + rnd() * 0.6); if (rnd() < 0.5 && x < at(1) - 8) (rnd() < 0.5 ? pine : tree)(x, 6 + rnd() * 8, 1 + rnd() * 0.5); }
    for (let x = -40; x < at(0.78); x += 9 + rnd() * 10) if (x > at(0.45) || x < at(0.11)) tree(x, -6 - rnd() * 8, 1);
    const gx2 = at(1) + 9;
    [-2.8, 2.8].forEach((z) => add(B.box(0.5, 4, 0.5, '#7a5236', gx2, 2, z)));
    add(B.box(0.6, 0.5, 6.4, '#7a5236', gx2, 4.1, 0));
    const gs = B.textPlane('BERALA PANATHARA', 5.6, 0.8, '#3f6b2a', '#ffe9a8'); gs.position.set(gx2 - 0.32, 3.6, 0); gs.rotation.y = -Math.PI / 2; add(gs);
    [-3.3, 3.3].forEach((z) => add(B.mesh(new THREE.ConeGeometry(0.25, 0.4, 6), new THREE.MeshBasicMaterial({ color: '#ff9a3a' }), gx2, 4.6, z)));
  }

  function frame(t) {
    const THREE = VM.bus3d.THREE, J = VM.journey, B = VM.bus3d, now = performance.now();
    const u = Math.min(1, t / J.RIDE), x = at(u), moving = t < J.RIDE;
    const w = innerWidth || 800, h = innerHeight || 600;
    r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
    bus.position.set(x, 0, -0.9);
    const speed = moving ? Math.sin(Math.PI * u) * 1.2 + 0.15 : 0;
    const nt = J.night(u), dk = J.dusk(u), dw = J.dawn(u);
    B.animateBus(bus, now, speed, nt);
    // camera: beside the road, a little above, the bus in the left third (room to see what is coming)
    const narrow = w < h, back = 15.5 * Math.max(1, 1.7 / (w / h)); // pull back on squarer or upright screens so the whole bus fits
    cam.position.set(x + (narrow ? 1 : 3), 4.2 + (back - 15.5) * 0.25, back);
    cam.lookAt(x + (narrow ? 1 : 3), 1.6, -1);
    sun.position.set(x - 10, 24, 12); sun.target.position.set(x, 0, 0);
    // sky and light: day, golden evening, night, sunrise
    const day = new THREE.Color('#8fd0f5'), dusk = new THREE.Color('#f2a36b'), night = new THREE.Color('#141a3c'), dawn = new THREE.Color('#ffc58a');
    const c = day.clone().lerp(dusk, dk * 0.8).lerp(night, nt).lerp(dawn, dw * 0.7);
    scene.background.copy(c); scene.fog.color.copy(c);
    hemi.intensity = 0.6 - nt * 0.4; sun.intensity = 0.75 - nt * 0.6;
    stars.material.opacity = nt; stars.position.x = 0;
    moon.visible = nt > 0.05; moon.position.set(x - 12, 26, -70);
    // now and then a bit falls off the old bus and bounces onto the road behind it
    if (moving && t > 3 && (!parts.next || t > parts.next)) {
      parts.next = t + 5 + Math.random() * 5;
      const kinds = [['mirror', () => B.box(0.06, 0.28, 0.2, '#2b2b2b')], ['hubcap', () => { const m = B.mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12), '#c8c8c8'); m.rotation.x = Math.PI / 2; return m; }],
        ['bumper', () => B.box(0.18, 0.18, 1.6, '#9a9a9a')], ['light', () => B.mesh(new THREE.SphereGeometry(0.13, 8, 6), '#fff2b0')], ['panel', () => B.box(0.7, 0.4, 0.05, '#c91f26')]];
      const [name, make] = kinds[Math.floor(Math.random() * kinds.length)];
      const p = make(); p.position.set(x - 2 + Math.random() * 3, 1.2, -0.9 + (Math.random() < 0.5 ? -1.1 : 1.1));
      p.userData = { vy: 2.5, vx: -1.5 - Math.random(), spin: (Math.random() - 0.5) * 12, rest: false, name };
      scene.add(p); parts.push(p);
      if (VM.sound && VM.sound.play) VM.sound.play('clank');
      p.scale.setScalar(0.6); // small bits, no words: you just see something drop off
    }
    parts.forEach((p) => { const d = p.userData; if (d.rest) return; const dt2 = 1 / 60; d.vy -= 9.8 * dt2; p.position.y += d.vy * dt2; p.position.x += d.vx * dt2; p.rotation.z += d.spin * dt2; p.rotation.x += d.spin * 0.5 * dt2;
      if (p.position.y < 0.08) { p.position.y = 0.08; if (Math.abs(d.vy) > 1.2) { d.vy = -d.vy * 0.4; d.spin *= 0.6; } else { d.rest = true; } } });
    // black smoke from the exhaust while it drives
    if (moving && (!smoke.last || now - smoke.last > 120)) {
      smoke.last = now;
      const p = B.mesh(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshLambertMaterial({ color: '#2a2a2e', transparent: true, opacity: 0.75 }), x - 3.9, 0.45, -0.3);
      p.castShadow = false; p.userData.t0 = now; scene.add(p); smoke.push(p);
    }
    smoke = Object.assign(smoke.filter((p) => { const k = (now - p.userData.t0) / 1600; if (k > 1) { scene.remove(p); return false; } p.position.y += 0.012; p.position.x -= 0.03; p.scale.setScalar(1 + k * 3); p.material.opacity = 0.75 * (1 - k); return true; }), { last: smoke.last });
    scene.traverse((o) => { if (o.userData && o.userData.beacon) o.visible = nt > 0.1 || dk > 0.2; });
    r.render(scene, cam);
    // place names (same as 2D) and the fade to black
    for (let i = J.PLACES.length - 1; i >= 0; i--) { if (u >= J.PLACES[i].u) { if (i !== J.placeIndex) J.showPlace(i); break; } }
    const f = (t - J.RIDE - J.HOLD) / J.FADE;
    fadeEl.style.opacity = f > 0 ? Math.min(1, f) : 0;
    VM.sound.engineSpeed(moving ? Math.sin(Math.PI * u) : 0);
  }

  // called instead of the 2D drawing each frame; returns false while the 3D library is still loading
  function draw(t) {
    if (!VM.USE3D) return false;
    if (!ready) {
      if (!startedFor) { startedFor = true; VM.bus3d.load().then((THREE) => build(THREE)).catch(() => { VM.USE3D = false; }); }
      return false;
    }
    frame(t);
    return true;
  }
  function release() {
    if (!r) return;
    try { r.dispose(); r.forceContextLoss(); } catch (e) { /* already gone */ }
    if (canvas) canvas.remove();
    if (fadeEl) fadeEl.remove();
    r = null; scene = null; ready = false; startedFor = null; smoke = []; parts = [];
  }
  return { draw, release };
})();

// hook into the 2D ride: draw in 3D when it is ready, otherwise the 2D picture
(function () {
  const draw2d = VM.journey.draw.bind(VM.journey);
  let ride3dOk = true;
  VM.journey.draw = function (t) {
    if (VM.USE3D && ride3dOk) {
      try { if (VM.journey3d.draw(t)) { this.canvas.style.visibility = 'hidden'; return; } }
      catch (e) { console.warn('3D ride failed, using the flat ride', e); ride3dOk = false; VM.journey3d.release(); }
    }
    this.canvas.style.visibility = '';
    draw2d(t);
  };
  // the ride is over: free its 3D drawing (phones have little graphics memory)
  const stop = VM.journey.stop.bind(VM.journey);
  VM.journey.stop = function () { clearTimeout(this.safety); stop(); VM.journey3d.release(); };
  if (VM.USE3D) {
    const tick = () => { const l = document.getElementById('lobby'); if (l && !l.hidden) VM.lobby3d.start(); else setTimeout(tick, 500); if (l && !l.hidden) return; };
    setTimeout(tick, 500);
  }
})();
