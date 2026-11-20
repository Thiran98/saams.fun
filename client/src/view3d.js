// 3D view (test version, switched on with ?3d in the address).
// The 2D Phaser game keeps running underneath for all the rules, movement, physics and multiplayer;
// this file draws the same village in soft low-poly 3D (Three.js) on a canvas behind it, every frame.
// Coordinates: 1 tile (32 px) = 1 unit. Phaser x -> 3D x, Phaser y -> 3D z, 3D y is up.

VM.USE3D = !/[?&]2d/.test(location.search); // 3D is the game everywhere (saams.fun, the Render server, practice); ?2d = the old flat look

VM.view3d = (function () {
  const T = () => VM.T;
  const U = (px) => px / VM.TILE;                 // pixels -> units
  const PAL = {
    grass: '#6fae46', grass2: '#9dc285', flowers: '#a9cb90', path: '#e2a59c', plaza: '#e9b8a8', paddy: '#b3d46f',
    bund: '#c99e7f', water: '#2f9bd0', planks: '#b98d64', sand: '#eed7ad', garden: '#8d5f40', stubble: '#dcc683', forest: '#4f8a35',
    pine: ['#2f7a3a', '#3f9446', '#55ad52'], round: ['#4f9a3a', '#6fb848', '#8fcf55'], trunk: '#7a5232',
    rock: ['#9a9a92', '#86867e', '#b2b0a6'], wall: '#f3ead8', wood: '#a7714a', roof: '#d0574a', white: '#f7f4ee',
  };
  let THREE, renderer, scene3, camera, sun, hemi, ground, groundTex, groundCanvas, specks;
  let game, sceneP, root, ready = false, dirty = false, lastGround = 0;
  const figures = new Map();   // Phaser sprite -> 3D figure
  const houseRoofs = [];       // per house: roof material (owner colour)
  const elephants = new Map();
  let tractor3, boats3 = [];
  const camPos = { x: 0, z: 0 };

  // ------------------------------------------------------------------ loading
  function loadThree() {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (VM.loadThree) return VM.loadThree();   // shared with the menu's Damindu preview (loaded once)
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      s.onload = () => res(window.THREE); s.onerror = () => rej(new Error('3D library did not load'));
      document.head.appendChild(s);
    });
  }

  function init(phaserScene) {
    if (!VM.USE3D || ready || root) return;
    sceneP = phaserScene; game = phaserScene.game;
    root = true;
    loadThree().then((t) => { THREE = t; build(); }).catch((e) => console.warn(e));
  }

  // ------------------------------------------------------------------ helpers
  const mat = (c, extra) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, extra || {}));
  const mats = {};
  const m = (c) => mats[c] || (mats[c] = mat(c));
  function mesh(geo, color, x, y, z) {
    const o = new THREE.Mesh(geo, typeof color === 'string' ? m(color) : color);
    o.position.set(x || 0, y || 0, z || 0); o.castShadow = true; o.receiveShadow = true;
    return o;
  }
  const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  // ------------------------------------------------------------------ building the world
  function build() {
    const wrap = document.createElement('div');
    wrap.id = 'view3d';
    document.body.insertBefore(wrap, document.body.firstChild);
    const weakPhone = document.body.classList.contains('is-touch') && (navigator.deviceMemory || 4) <= 2; // only very small phones skip edge smoothing
    try { renderer = new THREE.WebGLRenderer({ antialias: !weakPhone, powerPreference: 'high-performance' }); }
    catch (e) { console.warn('3D village could not start, using the flat village', e); wrap.remove(); fallback(); return; }
    renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); console.warn('3D lost: flat village'); fallback(); });
    const touch = document.body.classList.contains('is-touch');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // sharp on phones and PCs; lowered by itself below if the phone is slow
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = !touch; // phones: no shadows (saves a lot of graphics memory)
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    wrap.appendChild(renderer.domElement);
    scene3 = new THREE.Scene();
    scene3.background = new THREE.Color('#8fd0f5');
    scene3.fog = new THREE.Fog('#bfe6fa', 40, 90);
    camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.5, 200);
    hemi = new THREE.HemisphereLight('#ffffff', '#6f9a50', 0.62);
    scene3.add(hemi);
    sun = new THREE.DirectionalLight('#fff4e0', 0.8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); // lighter shadows
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
    scene3.add(sun, sun.target);

    buildGround();
    buildForest();
    sceneP.world.objects.forEach(buildObject);
    sceneP.world.houses.forEach(buildHouse);
    buildBoatsAndTractor();
    buildSpecks();
    buildLanka();
    buildTempleLife();
    buildKanatta();

    // white flags and fences drawn by the 2D game get a 3D version too
    const mourn = sceneP.mourn && sceneP.mourn.bind(sceneP);
    if (mourn) sceneP.mourn = (ho) => { mourn(ho); flags3d(ho); };
    const drawFence = sceneP.drawFence && sceneP.drawFence.bind(sceneP);
    if (drawFence) sceneP.drawFence = (r) => { drawFence(r); fence3d(r); };
    if (sceneP.mourned) (sceneP.houseObjs || []).forEach(() => {}); // (flags made before 3D started are rare)
    buildBell();
    // Phaser keeps running (rules, input, physics), invisible on top of the 3D view, and draws nothing (saves a lot)
    game.canvas.style.opacity = '0';
    sceneP.cameras.main.setVisible(false);
    // tiles that change (harvested paddy, regrowth) redraw the ground
    const setTile = sceneP.setTile.bind(sceneP);
    sceneP.setTile = (x, y, t) => { setTile(x, y, t); dirty = true; };
    window.addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
    ready = true;
  }

  // the ground: one big soft-edged painting of the tiles (blurred, so paths look like the soft clay trails)
  function tileColour(t) {
    const k = T();
    return { [k.GRASS]: PAL.grass, [k.GRASS2]: PAL.grass2, [k.FLOWERS]: PAL.flowers, [k.PATH]: PAL.path, [k.PADDY]: PAL.paddy, [k.BUND]: PAL.bund,
      [k.WATER]: PAL.water, [k.PLANKS]: PAL.planks, [k.SAND]: PAL.sand, [k.GARDEN]: PAL.garden, [k.STUBBLE]: PAL.stubble, [k.PLAZA]: PAL.plaza, [k.FOREST]: PAL.forest }[t] || PAL.grass;
  }
  let unsold = new Set(), sproutKey = '', bare = new Set(); const eatenPlots = new Set();
  function paintGround() {
    const g = sceneP.grid, W = VM.MAP_W, H = VM.MAP_H, S = 32, ctx = groundCanvas.getContext('2d');
    const src = sceneP.textures.get('tiles').getSourceImage();
    const gk = groundCanvas.width / (W * S); ctx.setTransform(gk, 0, 0, gk, 0, 0); // drawn at 32 px a tile, scaled to the canvas (smaller on phones)
    ctx.imageSmoothingEnabled = gk < 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) ctx.drawImage(src, g[y][x] * S, 0, S, S, x * S, y * S, S, S);
    // land still for sale: bare soil with tiny seedlings
    const k = T();
    unsold.forEach((key) => {
      const [x, y] = key.split(',').map(Number);
      if (g[y] && g[y][x] !== k.GARDEN) return;
      ctx.fillStyle = '#7a4e2d'; ctx.fillRect(x * S, y * S, S, S);
      ctx.fillStyle = '#64401f'; for (let r = 6; r < S; r += 10) ctx.fillRect(x * S, y * S + r, S, 2);
      ctx.fillStyle = '#8fd06a'; for (let r = 3; r < S; r += 10) for (let c = 3; c < S; c += 7) { ctx.fillRect(x * S + c, y * S + r, 2, 2); ctx.fillRect(x * S + c + 2, y * S + r - 1, 2, 2); }
    });
    // land of a dead player: the birds ate the harvest (bare, dull soil with a few pecked stalks)
    bare.forEach((key) => {
      const [x, y] = key.split(',').map(Number);
      if (!g[y] || (g[y][x] !== k.GARDEN && g[y][x] !== k.PADDY && g[y][x] !== k.STUBBLE)) return;
      ctx.fillStyle = '#8a6a48'; ctx.fillRect(x * S, y * S, S, S);
      ctx.fillStyle = '#6e5236'; for (let r = 5; r < S; r += 9) ctx.fillRect(x * S, y * S + r, S, 2);
      ctx.fillStyle = '#b8a070'; for (let i = 0; i < 6; i++) ctx.fillRect(x * S + ((i * 13 + x * 7) % 28) + 2, y * S + ((i * 17 + y * 5) % 26) + 3, 1, 3);
    });
    groundTex.needsUpdate = true;
  }
  function buildGround() {
    const W = VM.MAP_W, H = VM.MAP_H;
    const px = document.body.classList.contains('is-touch') ? 28 : 40; // ground picture detail (phones a little lighter)
    groundCanvas = document.createElement('canvas'); groundCanvas.width = W * px; groundCanvas.height = H * px;
    groundTex = new THREE.CanvasTexture(groundCanvas); groundTex.magFilter = THREE.LinearFilter; groundTex.minFilter = THREE.LinearMipmapLinearFilter; // smooth, not blocky
    groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    paintGround();
    ground = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshLambertMaterial({ map: groundTex }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, 0, H / 2); ground.receiveShadow = true;
    scene3.add(ground);
    // a big soft meadow around the map so the edges never show
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), m('#4f8a35'));
    outer.rotation.x = -Math.PI / 2; outer.position.set(W / 2, -0.02, H / 2); scene3.add(outer);
    // the lake carries on past the west edge of the map
    const farLake = new THREE.Mesh(new THREE.PlaneGeometry(120, H + 120), m('#2f9bd0'));
    farLake.rotation.x = -Math.PI / 2; farLake.position.set(-60 + 0.01, -0.01, H / 2); scene3.add(farLake);
    // water shine over the lake
    const water = new THREE.Mesh(new THREE.PlaneGeometry(12, H + 10), new THREE.MeshLambertMaterial({ color: '#5cc0e8', transparent: true, opacity: 0.25 }));
    water.rotation.x = -Math.PI / 2; water.position.set(4, 0.03, H / 2); scene3.add(water);
  }

  // forest tiles: many low-poly pines and round trees (instanced, so phones can draw them)
  function buildForest() {
    const g = sceneP.grid, k = T(), spots = [];
    // no jungle trees growing through buildings or houses
    const blocked = new Set();
    const block = (cx, cy, w, h) => { for (let y = Math.floor(cy - h - 1); y <= Math.ceil(cy + 1); y++) for (let x = Math.floor(cx - w / 2 - 1); x <= Math.ceil(cx + w / 2 + 1); x++) blocked.add(x + ',' + y); };
    sceneP.world.objects.forEach((o) => { const fp = VM.FOOTPRINTS[o.type]; if (fp && fp[0] > 30 && o.type !== 'mountain') block(U(o.x), U(o.y), U(fp[0]), 2.5); });
    sceneP.world.houses.forEach((h) => block(U(h.x), U(h.y), 2.5, 2.5));
    const density = document.body.classList.contains('is-touch') ? 0.3 : 0.55; // phones: fewer jungle trees
    for (let y = 0; y < VM.MAP_H; y++) for (let x = 0; x < VM.MAP_W; x++) if (g[y][x] === k.FOREST && !blocked.has(x + ',' + y) && rnd() < density) spots.push([x + 0.2 + rnd() * 0.6, y + 0.2 + rnd() * 0.6, rnd()]);
    // and a ring of trees outside the map
    for (let i = 0; i < 260; i++) { const a = rnd() * Math.PI * 2, d = 2 + rnd() * 10; const x = VM.MAP_W / 2 + Math.cos(a) * (VM.MAP_W / 2 + d), y = VM.MAP_H / 2 + Math.sin(a) * (VM.MAP_H / 2 + d); if (x > 10) spots.push([x, y, rnd()]); } // the west side is lake
    const trunkG = new THREE.CylinderGeometry(0.08, 0.11, 0.5, 5);
    const coneA = new THREE.ConeGeometry(0.55, 0.9, 6), coneB = new THREE.ConeGeometry(0.42, 0.75, 6), coneC = new THREE.ConeGeometry(0.28, 0.55, 6);
    const ballG = new THREE.IcosahedronGeometry(0.55, 0);
    const pines = spots.filter((s) => s[2] < 0.65), rounds = spots.filter((s) => s[2] >= 0.65);
    const inst = (geo, color, list, place) => {
      const im = new THREE.InstancedMesh(geo, m(color), list.length);
      const d = new THREE.Object3D();
      list.forEach((s, i) => { place(d, s); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
      im.castShadow = false; im.receiveShadow = true; scene3.add(im); // the many jungle trees cast no shadows (much faster)
    };
    const sz = (s) => 0.8 + (s[2] * 7 % 1) * 0.6;
    inst(trunkG, PAL.trunk, spots, (d, s) => { d.position.set(s[0], 0.25 * sz(s), s[1]); d.scale.setScalar(sz(s)); d.rotation.set(0, 0, 0); });
    inst(coneA, PAL.pine[0], pines, (d, s) => { d.position.set(s[0], 0.85 * sz(s), s[1]); d.scale.setScalar(sz(s)); d.rotation.y = s[2] * 6; });
    inst(coneB, PAL.pine[1], pines, (d, s) => { d.position.set(s[0], 1.3 * sz(s), s[1]); d.scale.setScalar(sz(s)); });
    inst(coneC, PAL.pine[2], pines, (d, s) => { d.position.set(s[0], 1.7 * sz(s), s[1]); d.scale.setScalar(sz(s)); });
    inst(ballG, PAL.round[0], rounds, (d, s) => { d.position.set(s[0], 0.95 * sz(s), s[1]); d.scale.set(sz(s), sz(s) * 1.1, sz(s)); d.rotation.y = s[2] * 9; });
    inst(new THREE.IcosahedronGeometry(0.38, 0), PAL.round[2], rounds, (d, s) => { d.position.set(s[0] + 0.15, 1.35 * sz(s), s[1] - 0.1); d.scale.setScalar(sz(s)); });
  }

  // ------------------------------------------------------------------ objects
  function pine(x, z, s) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.08 * s, 0.11 * s, 0.5 * s, 5), PAL.trunk, 0, 0.25 * s, 0));
    [[0.55, 0.9, 0.85, 0], [0.42, 0.75, 1.3, 1], [0.28, 0.55, 1.7, 2]].forEach(([r, h, y, i]) => g.add(mesh(new THREE.ConeGeometry(r * s, h * s, 6), PAL.pine[i], 0, y * s, 0)));
    g.position.set(x, 0, z); return g;
  }
  function roundTree(x, z, s, col) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.09 * s, 0.13 * s, 0.7 * s, 5), PAL.trunk, 0, 0.35 * s, 0));
    g.add(mesh(new THREE.IcosahedronGeometry(0.6 * s, 0), col || PAL.round[0], 0, 1.05 * s, 0));
    g.add(mesh(new THREE.IcosahedronGeometry(0.4 * s, 0), PAL.round[1], 0.25 * s, 1.4 * s, 0.1 * s));
    g.position.set(x, 0, z); return g;
  }
  function rock(x, z, s, tall) {
    const r = mesh(new THREE.DodecahedronGeometry(0.4 * s, 0), pick(PAL.rock, rnd()), x, 0.25 * s * (tall || 1), z);
    r.scale.set(1, tall || 0.7, 1); r.rotation.y = rnd() * 6; return r;
  }
  function box(w, h, d, c, x, y, z) { return mesh(new THREE.BoxGeometry(w, h, d), c, x, y, z); }
  function hutRoof(w, d, h, c) { const r = mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, h, 4), c, 0, 0, 0); r.rotation.y = Math.PI / 4; r.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d)); return r; }
  // a gable roof over a w x d block whose walls are h high (ridge along x); returns the group, roof material in userData
  function gableRoof(w, d, h, roofC, wallC, pitch) {
    const g = new THREE.Group(), rise = (d / 2) * (pitch || 0.75), over = 0.18;
    const slope = Math.hypot(d / 2 + over, rise + over * (pitch || 0.75)), ang = Math.atan2(rise, d / 2);
    const rm = typeof roofC === 'string' ? mat(roofC) : roofC;
    [-1, 1].forEach((side) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w + over * 2, 0.09, slope), rm);
      p.position.set(0, h + rise / 2 - 0.02, side * (d / 4 + over / 2 - 0.02)); p.rotation.x = side * ang; p.castShadow = true; p.receiveShadow = true; g.add(p);
      // a darker edge strip along the bottom of each slope
      const e = new THREE.Mesh(new THREE.BoxGeometry(w + over * 2 + 0.02, 0.11, 0.1), mat(VM.shade(typeof roofC === 'string' ? roofC : '#' + rm.color.getHexString(), -0.3)));
      e.position.set(0, h - over * 0.55, side * (d / 2 + over)); g.add(e);
    });
    g.add(box(w + over * 2 + 0.04, 0.12, 0.14, '#6b4a34', 0, h + rise + 0.02, 0));            // ridge beam
    const tri = new THREE.Shape(); tri.moveTo(-d / 2, 0); tri.lineTo(d / 2, 0); tri.lineTo(0, rise); tri.lineTo(-d / 2, 0);
    const gable = new THREE.ShapeGeometry(tri);
    [-1, 1].forEach((side) => { const t = new THREE.Mesh(gable, m(wallC || PAL.wall)); t.material.side = THREE.DoubleSide; t.position.set(side * w / 2, h, 0); t.rotation.y = Math.PI / 2; t.castShadow = true; g.add(t); });
    g.userData.roofMat = rm;
    return g;
  }
  function building(w, d, h, wallC, roofC) {
    const g = new THREE.Group();
    g.add(box(w + 0.12, 0.12, d + 0.12, '#b8aea2', 0, 0.06, 0));      // base
    g.add(box(w, h, d, wallC, 0, h / 2 + 0.1, 0));
    g.add(box(0.36, Math.min(0.62, h * 0.7), 0.05, '#7a4a32', 0, Math.min(0.62, h * 0.7) / 2 + 0.12, d / 2 + 0.02)); // door
    const r = gableRoof(w, d, h + 0.1, roofC, wallC, 1.1); if (w < d * 2.2) { g.remove(r); const r2 = gableRoof(d, w, h + 0.1, roofC, wallC, 0.8); r2.rotation.y = Math.PI / 2; g.add(r2); } else g.add(r);
    return g;
  }

  function buildObject(o) {
    const x = U(o.x), z = U(o.y) - 0.15, s = 1;
    let g = null;
    switch (o.type) {
      case 'tree': g = pine(x, z, 1.1); break;
      case 'tree2': g = roundTree(x, z, 1.1); break;
      case 'jungletree': g = roundTree(x, z, 1.4, '#5e9e62'); break;
      case 'araliya': g = roundTree(x, z, 1, '#8cc77a'); for (let i = 0; i < 6; i++) g.add(mesh(new THREE.SphereGeometry(0.07, 5, 4), '#fff8f0', (rnd() - 0.5) * 0.9, 1 + rnd() * 0.6, (rnd() - 0.5) * 0.9)); break;
      case 'bigtree': g = roundTree(x, z, 2.6, '#6fb36a'); break;
      case 'palm': {
        g = new THREE.Group();
        for (let i = 0; i < 5; i++) g.add(mesh(new THREE.CylinderGeometry(0.075 - i * 0.006, 0.085 - i * 0.006, 0.45, 6), i % 2 ? '#a37a52' : '#93693f', i * 0.04, 0.22 + i * 0.42, 0));
        const topY = 2.2;
        g.add(sph(0.12, '#6b4a2a', 0.2, topY, 0));
        for (let i = 0; i < 7; i++) {
          const leaf = mesh(new THREE.SphereGeometry(0.5, 8, 4), '#5fae5a', 0, 0, 0); leaf.scale.set(1, 0.06, 0.22);
          const holder = new THREE.Group(); holder.position.set(0.2, topY, 0); holder.rotation.y = i * (Math.PI * 2 / 7);
          leaf.position.x = 0.45; leaf.rotation.z = -0.45; holder.add(leaf); g.add(holder);
        }
        const nut = rnd() < 0.5 ? '#f08a24' : '#7a5a2a'; // king coconuts (thambili) are orange
        [[0.27, 0.06], [0.14, -0.06], [0.22, -0.1], [0.3, -0.02]].forEach(([a, b]) => g.add(sph(0.065, nut, a, topY - 0.13, b)));
        g.position.set(x, 0, z); break;
      }
      case 'bamboo': g = new THREE.Group(); for (let i = 0; i < 5; i++) g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6 + rnd(), 5), '#8fbf5a', (rnd() - 0.5) * 0.6, 0.9, (rnd() - 0.5) * 0.4)); g.position.set(x, 0, z); break;
      case 'banana': g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.9, 5), '#9a8a4a', 0, 0.45, 0)); for (let i = 0; i < 5; i++) { const l = box(0.18, 0.02, 0.8, '#76c05a', 0, 0.95, 0); l.rotation.set(0.5, i * 1.25, 0); l.translateZ(0.3); g.add(l); } g.position.set(x, 0, z); break;
      case 'bush': g = mesh(new THREE.IcosahedronGeometry(0.42, 0), '#79b864', x, 0.28, z); g.scale.set(1.3, 0.8, 1); break;
      case 'fern': g = mesh(new THREE.ConeGeometry(0.25, 0.35, 5), '#6fb35e', x, 0.17, z); break;
      case 'rock': g = rock(x, z, 1.2); break;
      case 'rock2': g = rock(x, z, 1.3, 1.3); break;
      case 'mountain': {
        g = new THREE.Group();
        for (let i = 0; i < 9; i++) { const h = 2.5 + rnd() * 3.5; const p = box(1 + rnd() * 1.2, h, 1 + rnd(), pick(['#8a97a0', '#7a8890', '#9aa6ad'], rnd()), (i - 4) * 1.4 + (rnd() - 0.5), h / 2, -rnd() * 1.5); p.rotation.y = rnd(); g.add(p); }
        g.position.set(x, 0, z); break;
      }
      case 'haystack': g = mesh(new THREE.ConeGeometry(0.55, 0.9, 7), '#e8c66a', x, 0.45, z); break;
      case 'scarecrow': g = new THREE.Group(); g.add(box(0.06, 1.1, 0.06, PAL.wood, 0, 0.55, 0)); g.add(box(0.8, 0.06, 0.06, PAL.wood, 0, 0.85, 0)); g.add(mesh(new THREE.SphereGeometry(0.14, 6, 5), '#e8c66a', 0, 1.15, 0)); g.position.set(x, 0, z); break;
      case 'lamp': {
        g = new THREE.Group();
        g.add(mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.12, 8), '#3a3a40', 0, 0.06, 0));          // base
        g.add(mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.5, 8), '#3a3a40', 0, 0.8, 0));          // post
        g.add(box(0.36, 0.035, 0.035, '#3a3a40', 0.16, 1.52, 0));                                     // arm
        g.add(mesh(new THREE.ConeGeometry(0.14, 0.12, 10, 1, true), '#3a3a40', 0.32, 1.48, 0)).children.slice(-1)[0].material.side = THREE.DoubleSide; // shade
        const bulb = mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshLambertMaterial({ color: '#fff1c0', emissive: '#ffd77a', emissiveIntensity: 0.2 }), 0.32, 1.42, 0);
        bulb.castShadow = false; g.add(bulb); lamps.push(bulb);
        g.position.set(x, 0, z); g.userData.lamp = true; break;
      }
      case 'bench': g = box(0.9, 0.12, 0.3, PAL.wood, x, 0.3, z); break;
      case 'pots': g = new THREE.Group(); for (let i = 0; i < 3; i++) g.add(mesh(new THREE.SphereGeometry(0.16, 7, 5), '#c4714a', (i - 1) * 0.3, 0.15, 0)); g.position.set(x, 0, z); break;
      case 'well': g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.45, 10), '#b4aee0', 0, 0.22, 0)); g.add(box(0.06, 0.9, 0.06, PAL.wood, -0.4, 0.6, 0)); g.add(box(0.06, 0.9, 0.06, PAL.wood, 0.4, 0.6, 0)); const wr = hutRoof(1, 0.8, 0.4, PAL.roof); wr.position.y = 1.2; g.add(wr); g.position.set(x, 0, z); break;
      case 'stupa': g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.4, 16), PAL.white, 0, 0.2, 0)); g.add(mesh(new THREE.SphereGeometry(1.15, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), PAL.white, 0, 0.4, 0)); g.add(box(0.5, 0.35, 0.5, PAL.white, 0, 1.7, 0)); g.add(mesh(new THREE.ConeGeometry(0.2, 1, 8), '#f0c14a', 0, 2.35, 0)); g.position.set(x, 0, z - 0.6); break;
      case 'granary': g = building(2.6, 1.4, 1.2, '#e9d9b8', '#b5643f'); g.position.set(x, 0, z - 0.6); break;
      case 'cowshed': g = building(3.4, 1.4, 0.9, '#d9c3a0', '#8a6a4a'); g.position.set(x, 0, z - 0.6); break;
      case 'workshop': g = building(3, 1.3, 1, '#d8c7a8', '#7a6aa8'); g.position.set(x, 0, z - 0.6); break;
      case 'kade': g = building(2.6, 1.3, 1, '#f1e2c2', '#3f8f7a'); g.position.set(x, 0, z - 0.6); break;
      case 'cookhut': g = building(2.1, 1.2, 0.8, '#e2cfaa', '#c98a4a'); g.position.set(x, 0, z - 0.5); g.add(mesh(new THREE.ConeGeometry(0.2, 0.35, 5), new THREE.MeshBasicMaterial({ color: '#ff8a3a' }), 0.5, 0.2, 0.9)); break;
      case 'coop': g = building(1.5, 0.9, 0.6, '#e6d3b0', '#c45a4a'); g.position.set(x, 0, z - 0.4); break;
      case 'watchtower': g = new THREE.Group(); [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].forEach(([a, b]) => g.add(box(0.08, 2, 0.08, PAL.wood, a, 1, b))); g.add(box(1.3, 0.1, 1.3, PAL.wood, 0, 2, 0)); const tr = hutRoof(1.4, 1.4, 0.6, '#8a6a4a'); tr.position.y = 2.6; g.add(tr); g.position.set(x, 0, z - 0.5); break;
      case 'fence-h': case 'fence-v': { // a wooden paddock fence: posts and two rails
        const hz = o.type === 'fence-h'; g = new THREE.Group();
        [-0.45, 0, 0.45].forEach((d) => g.add(box(0.07, 0.45, 0.07, '#8a6040', hz ? d : 0, 0.22, hz ? 0 : d)));
        [0.16, 0.34].forEach((h) => g.add(box(hz ? 1 : 0.04, 0.05, hz ? 0.04 : 1, '#a8774c', 0, h, 0)));
        g.position.set(x, 0, z); break;
      }
      default: {
        const fp = VM.FOOTPRINTS[o.type];
        if (fp && fp[0] > 20) { g = building(U(fp[0]), Math.max(0.8, U(fp[1]) * 1.5), 0.8, '#e9dcc0', '#b5643f'); g.position.set(x, 0, z - 0.4); }
        else if (/fence/.test(o.type)) { g = box(o.type === 'fence-h' ? 1 : 0.08, 0.35, o.type === 'fence-h' ? 0.08 : 1, PAL.wood, x, 0.18, z); }
      }
    }
    if (g) scene3.add(g);
  }

  function buildHouse(h, i) {
    const g = new THREE.Group();
    const W = 2.1, D = 1.35, H = 1.05, B = 0.16, F = D / 2 + 0.03;
    g.add(box(W + 0.16, B, D + 0.16, '#b9b0a4', 0, B / 2, 0));                 // stone base
    g.add(box(W, H, D, PAL.wall, 0, B + H / 2, 0));                            // walls
    g.add(box(W + 0.02, 0.1, D + 0.02, '#e3d7c0', 0, B + 0.05, 0));             // skirting
    g.add(box(0.7, 0.07, 0.32, '#c9bfb2', 0, 0.035, F + 0.16));                // front step
    g.add(box(0.46, 0.72, 0.04, '#5e3a26', 0, B + 0.36, F));                   // door frame
    g.add(box(0.36, 0.64, 0.05, '#8a5232', 0, B + 0.33, F + 0.01));            // door
    g.add(mesh(new THREE.SphereGeometry(0.025, 6, 4), '#f0c14a', 0.12, B + 0.33, F + 0.05)); // handle
    const shutterMat = mat('#c9c1b6');
    [-0.66, 0.66].forEach((x) => {
      g.add(box(0.42, 0.36, 0.04, '#f7f2e8', x, B + 0.6, F));                  // window frame
      g.add(box(0.34, 0.28, 0.05, '#9fd2ee', x, B + 0.6, F + 0.005));          // glass
      g.add(box(0.02, 0.28, 0.06, '#f7f2e8', x, B + 0.6, F + 0.01));           // window bar
      [-1, 1].forEach((sd) => g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.36, 0.03), shutterMat)).children.slice(-1)[0].position.set(x + sd * 0.27, B + 0.6, F + 0.01));
      g.add(box(0.46, 0.05, 0.1, '#e3d7c0', x, B + 0.4, F + 0.03));            // sill
    });
    g.add(box(0.16, 0.16, 0.16, '#c4714a', -0.32, 0.08, F + 0.18)); g.add(mesh(new THREE.IcosahedronGeometry(0.12, 0), '#79b864', -0.32, 0.24, F + 0.18)); // flower pot
    const roofMat = mat('#c9c1b6');
    const roof = gableRoof(D, W, B + H, roofMat, PAL.wall, 0.95); roof.rotation.y = Math.PI / 2; // the pointed end faces the front
    g.add(roof);
    g.add(box(0.2, 0.6, 0.2, '#b9b0a4', 0.55, B + H + 0.7, -0.35));           // chimney
    roofMat.userData.shutters = shutterMat;
    g.position.set(U(h.x), 0, U(h.y) - 0.75);
    scene3.add(g);
    houseRoofs[i] = roofMat;
  }

  // a Sri Lankan oruwa: a narrow wooden canoe with an outrigger float, seat planks and a paddle
  function makeBoat() {
    const b = new THREE.Group(), hullC = '#8a5a36', darkC = '#5e3a22';
    const lens = (L, W) => { const sh = new THREE.Shape(); sh.moveTo(-L, 0); sh.quadraticCurveTo(0, W * 2, L, 0); sh.quadraticCurveTo(0, -W * 2, -L, 0); return sh; };
    const hullGeo = new THREE.ExtrudeGeometry(lens(0.85, 0.2), { depth: 0.2, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 14 });
    const hull = new THREE.Mesh(hullGeo, m(hullC)); hull.rotation.x = -Math.PI / 2; hull.position.y = -0.02; hull.castShadow = true; b.add(hull);
    const inside = new THREE.Mesh(new THREE.ShapeGeometry(lens(0.74, 0.15), 14), m('#4a2c18')); inside.rotation.x = -Math.PI / 2; inside.position.y = 0.215; b.add(inside);
    const rim = new THREE.Mesh(new THREE.ExtrudeGeometry(lens(0.87, 0.21), { depth: 0.03, bevelEnabled: false, curveSegments: 14 }), m(darkC)); rim.rotation.x = -Math.PI / 2; rim.position.y = 0.2; b.add(rim);
    b.add(inside); // keep the dark inside on top of the rim
    [-0.35, 0.35].forEach((x) => b.add(box(0.1, 0.03, 0.34, '#c49a6a', x, 0.24, 0)));                    // seats
    [-0.3, 0.3].forEach((x) => b.add(box(0.05, 0.05, 0.8, darkC, x, 0.27, 0.5)));                       // outrigger poles
    const log = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 10), '#a37a52', 0, 0.06, 0.9); log.rotation.z = Math.PI / 2; b.add(log);
    [-0.55, 0.55].forEach((x) => { const tip = mesh(new THREE.ConeGeometry(0.07, 0.15, 10), '#a37a52', x, 0.06, 0.9); tip.rotation.z = x > 0 ? -Math.PI / 2 : Math.PI / 2; b.add(tip); });
    const paddle = box(0.04, 0.03, 0.85, '#c49a6a', 0.05, 0.28, -0.02); paddle.rotation.y = 0.55; b.add(paddle);
    const blade = box(0.14, 0.02, 0.22, '#c49a6a', 0.28, 0.28, -0.4); blade.rotation.y = 0.55; b.add(blade);
    return b;
  }

  function buildBoatsAndTractor() {
    tractor3 = new THREE.Group();
    tractor3.add(box(0.9, 0.45, 0.55, '#d8443a', 0, 0.45, 0));
    tractor3.add(box(0.5, 0.12, 0.5, '#d8443a', 0.2, 0.74, 0));                      // bonnet
    tractor3.add(box(0.26, 0.08, 0.3, '#2f2f3a', -0.25, 0.72, 0));                  // open seat
    tractor3.add(box(0.06, 0.25, 0.3, '#2f2f3a', -0.37, 0.85, 0));                  // seat back
    const wheel = mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 14), '#2b2b2b', 0.0, 0.92, 0); wheel.rotation.y = Math.PI / 2; wheel.rotation.x = 0.6; tractor3.add(wheel); // steering wheel
    tractor3.add(box(0.05, 0.3, 0.05, '#555', 0.42, 0.95, 0.15));                  // exhaust pipe
    [[-0.3, 0.32, 0.3], [-0.3, 0.32, -0.3]].forEach(([a, r, b]) => { const w = mesh(new THREE.CylinderGeometry(r, r, 0.15, 10), '#2b2b2b', a, r, b); w.rotation.x = Math.PI / 2; tractor3.add(w); });
    [[0.35, 0.18, 0.3], [0.35, 0.18, -0.3]].forEach(([a, r, b]) => { const w = mesh(new THREE.CylinderGeometry(r, r, 0.12, 10), '#2b2b2b', a, r, b); w.rotation.x = Math.PI / 2; tractor3.add(w); });
    scene3.add(tractor3);
    (sceneP.boats || []).forEach(() => { const b = makeBoat(); scene3.add(b); boats3.push(b); });
  }

  // ------------------------------------------------------------------ Sri Lanka
  const BUDDHIST = ['#0057b7', '#ffd400', '#e5262b', '#ffffff', '#ff8c1a'];
  function buddhistFlagTexture() {
    const c = document.createElement('canvas'); c.width = 240; c.height = 120; const ctx = c.getContext('2d');
    BUDDHIST.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(i * 40, 0, 40, 120); });
    BUDDHIST.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(200, i * 24, 40, 24); });   // the sixth band: all five colours
    return new THREE.CanvasTexture(c);
  }
  // a string of little pennants from a to b (in units), sagging in the middle
  function bunting(a, b, n) {
    const g = new THREE.Group();
    const line = []; for (let i = 0; i <= n; i++) { const t = i / n; line.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * 0.25, a.z + (b.z - a.z) * t)); }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), new THREE.LineBasicMaterial({ color: '#f4f0e6' })));
    for (let i = 1; i < n; i++) {
      const p = line[i], tri = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 3), new THREE.MeshLambertMaterial({ color: BUDDHIST[i % 5] }));
      tri.rotation.x = Math.PI; tri.position.set(p.x, p.y - 0.08, p.z); g.add(tri);
    }
    scene3.add(g);
    return g;
  }
  function buildLanka() {
    const objs = sceneP.world.objects;
    // temple: strings from the top of the stupa to posts around the courtyard, and a big flag at the entrance
    const st = objs.find((o) => o.type === 'stupa');
    if (st) {
      const cx = U(st.x), cz = U(st.y) - 0.6, top = new THREE.Vector3(cx, 2.7, cz);
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2, px = cx + Math.cos(a) * 3.4, pz = cz + Math.sin(a) * 3.4;
        scene3.add(box(0.06, 1.3, 0.06, '#f4f0e6', px, 0.65, pz));
        bunting(top, new THREE.Vector3(px, 1.28, pz), 12);
      }
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, b = (i + 1) / 8 * Math.PI * 2; bunting(new THREE.Vector3(cx + Math.cos(a) * 3.4, 1.28, cz + Math.sin(a) * 3.4), new THREE.Vector3(cx + Math.cos(b) * 3.4, 1.28, cz + Math.sin(b) * 3.4), 8); }
      const pole = new THREE.Group();
      pole.add(box(0.07, 2.6, 0.07, '#f4f0e6', 0, 1.3, 0));
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5, 8, 1), new THREE.MeshLambertMaterial({ map: buddhistFlagTexture(), side: THREE.DoubleSide }));
      flag.position.set(0.52, 2.3, 0); flag.userData.wave = true; pole.add(flag);
      pole.position.set(cx + 2.2, 0, cz + 3.6);
      scene3.add(pole); flagsToWave.push(flag);
    }
    // the big tree in the village square: pennants round it
    const bt = objs.find((o) => o.type === 'bigtree');
    if (bt) {
      const cx = U(bt.x), cz = U(bt.y) - 0.15;
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, b = (i + 1) / 8 * Math.PI * 2; bunting(new THREE.Vector3(cx + Math.cos(a) * 1.1, 1.1, cz + Math.sin(a) * 1.1), new THREE.Vector3(cx + Math.cos(b) * 1.1, 1.1, cz + Math.sin(b) * 1.1), 5); }
      // a white cloth tied round the trunk (as on a sacred bo tree)
      scene3.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12), '#f7f4ee', cx, 0.7, cz));
    }
  }
  const flagsToWave = [], lamps = [];

  // ---- a monk at the temple (walks slowly round the stupa) and a bo tree in the temple courtyard
  let monk = null;
  function buildTempleLife() {
    const st = sceneP.world.objects.find((o) => o.type === 'stupa');
    if (!st) return;
    const cx = U(st.x), cz = U(st.y) - 0.6;
    // the monk: saffron robe over one shoulder, shaved head, a cute face
    monk = new THREE.Group();
    const b = new THREE.Group();
    b.add(mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.5, 14), '#e8741c', 0, 0.25, 0));
    b.add(sph(0.17, '#e8741c', 0, 0.48, 0, 1, 0.95, 0.9));
    const drape = mesh(new THREE.BoxGeometry(0.08, 0.42, 0.33), '#c95f12', -0.06, 0.45, 0); drape.rotation.z = -0.55; b.add(drape);
    b.add(sph(0.06, '#a8714e', 0.18, 0.45, 0.02));                                   // bare right shoulder
    b.add(sph(0.23, '#a8714e', 0, 0.82, 0));                                         // shaved head
    [-0.08, 0.08].forEach((x) => { b.add(sph(0.016, '#1b1410', x, 0.82, 0.21)); b.add(sph(0.035, '#f08a8a', x * 1.5, 0.75, 0.18, 1, 0.6, 0.4)); });
    const smile = mesh(new THREE.TorusGeometry(0.03, 0.007, 4, 10, Math.PI), '#6b2e22', 0, 0.73, 0.215); smile.rotation.z = Math.PI; b.add(smile);
    b.add(mesh(new THREE.SphereGeometry(0.09, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#2b2b2b', 0.2, 0.34, 0.1)); // alms bowl
    monk.add(b); monk.userData = { body: b, cx, cz, r: 2.6 };
    monk.traverse((c) => { c.castShadow = true; });
    const tag = labelSprite(); tag.position.y = 1.3; monk.add(tag); drawLabel(tag, 'Loku Hamuduruwo', '#e8741c', '#fff');
    scene3.add(monk);
    // the bo tree: a wide, sacred tree on a white walled platform, with flags and little oil lamps
    const bx = cx - 4.6, bz = cz - 3.4, tree = new THREE.Group();
    tree.add(mesh(new THREE.CylinderGeometry(1.25, 1.3, 0.3, 16), '#f7f4ee', 0, 0.15, 0));          // white platform wall
    tree.add(mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.04, 16), '#eadcc4', 0, 0.31, 0));
    tree.add(mesh(new THREE.CylinderGeometry(0.16, 0.26, 1.6, 8), '#7a5236', 0, 1.1, 0));             // trunk
    [[0.4, 1.6, 0.1, 0.6], [-0.35, 1.7, -0.1, -0.7]].forEach(([x, y, z, r]) => { const br = mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.9, 6), '#7a5236', x, y, z); br.rotation.z = r; tree.add(br); });
    [[0, 2.35, 0, 1.1], [0.75, 2.1, 0.3, 0.75], [-0.75, 2.15, -0.2, 0.8], [0.2, 2.2, -0.75, 0.7], [-0.2, 2.1, 0.75, 0.7]].forEach(([x, y, z, r], i) =>
      tree.add(mesh(new THREE.IcosahedronGeometry(r, 1), ['#5fa85a', '#6fb862', '#7cc26a'][i % 3], x, y, z)));
    tree.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 12), '#f7f4ee', 0, 0.75, 0));          // white cloth round the trunk
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, b2 = (i + 1) / 6 * Math.PI * 2; bunting(new THREE.Vector3(bx + Math.cos(a) * 0.9, 1.35, bz + Math.sin(a) * 0.9), new THREE.Vector3(bx + Math.cos(b2) * 0.9, 1.35, bz + Math.sin(b2) * 0.9), 5); }
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; tree.add(mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffcf5a' }), Math.cos(a) * 1.18, 0.34, Math.sin(a) * 1.18)); } // oil lamps on the wall
    tree.position.set(bx, 0, bz);
    tree.traverse((c) => { c.castShadow = true; });
    scene3.add(tree);
  }

  // ---- the kanatta (village cemetery): a low whitewashed wall with a gate, an araliya tree, and a headstone per death
  function buildKanatta() {
    const c = VM.CEMETERY; if (!c) return;
    const g = new THREE.Group(), x0 = c.x, z0 = c.y, x1 = c.x + c.w, z1 = c.y + c.h, gx = (x0 + x1) / 2;
    const wall = (ax, az, bx, bz) => { const len = Math.hypot(bx - ax, bz - az); if (len < 0.05) return; const w = box(len, 0.32, 0.16, '#e9e4d8', (ax + bx) / 2, 0.16, (az + bz) / 2); w.rotation.y = -Math.atan2(bz - az, bx - ax); g.add(w); const cap = box(len + 0.04, 0.05, 0.22, '#bdb6a6', (ax + bx) / 2, 0.34, (az + bz) / 2); cap.rotation.copy(w.rotation); g.add(cap); };
    wall(x0, z0, x1, z0); wall(x0, z0, x0, z1); wall(x1, z0, x1, z1);
    wall(x0, z1, gx - 0.6, z1); wall(gx + 0.6, z1, x1, z1);                          // the front wall, with the gate gap
    [gx - 0.65, gx + 0.65].forEach((x) => { g.add(box(0.26, 0.75, 0.26, '#e9e4d8', x, 0.37, z1)); g.add(box(0.32, 0.08, 0.32, '#bdb6a6', x, 0.78, z1)); }); // gate pillars
    // an araliya (frangipani) tree in the corner: grey branches, white flowers
    const t = new THREE.Group();
    t.add(mesh(new THREE.CylinderGeometry(0.08, 0.13, 1.1, 7), '#8d8378', 0, 0.55, 0));
    [[0.35, 1.15, 0.1, -0.7], [-0.3, 1.2, -0.05, 0.7], [0.05, 1.25, 0.32, 0.2]].forEach(([x, y, z, r]) => { const b = mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.7, 6), '#8d8378', x, y, z); b.rotation.z = r; t.add(b); });
    [[0.6, 1.5, 0.1, 0.42], [-0.55, 1.55, -0.05, 0.45], [0.05, 1.7, 0.4, 0.4], [0, 1.65, -0.3, 0.38]].forEach(([x, y, z, r], i) => {
      t.add(mesh(new THREE.IcosahedronGeometry(r, 1), i % 2 ? '#5f9a4a' : '#6aa852', x, y, z));
      for (let k = 0; k < 4; k++) t.add(mesh(new THREE.SphereGeometry(0.06, 6, 4), '#fffaf0', x + Math.cos(k * 1.6) * r * 0.8, y + 0.15, z + Math.sin(k * 1.6) * r * 0.8));
    });
    t.position.set(x0 + 0.7, 0, z0 + 0.7); g.add(t);
    g.traverse((m) => { m.castShadow = true; });
    scene3.add(g);
  }
  const graves3 = new Map();
  function syncGraves() {
    if (!sceneP.graves) return;
    for (const [id, gr] of sceneP.graves) {
      if (graves3.has(id)) continue;
      const g = new THREE.Group();
      g.add(box(0.62, 0.08, 0.95, '#8a8c92', 0, 0.04, 0.25));                          // the grave slab
      g.add(box(0.5, 0.06, 0.8, '#a3a5ab', 0, 0.11, 0.28));
      const stone = gr.dark ? '#2b2c31' : '#9a9ca3';
      g.add(box(0.46, 0.48, 0.12, stone, 0, 0.36, -0.15));                            // the headstone
      const top = mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.12, 16, 1, false, 0, Math.PI), stone, 0, 0.6, -0.15); top.rotation.set(Math.PI / 2, Math.PI / 2, 0); g.add(top);
      g.add(box(0.3, 0.05, 0.02, gr.dark ? '#d8c27a' : '#4a4b50', 0, 0.42, -0.08));    // the name plate
      g.add(mesh(new THREE.SphereGeometry(0.06, 6, 4), '#f6f0e0', 0.16, 0.18, 0.45));  // a few araliya flowers left on the grave
      g.add(mesh(new THREE.SphereGeometry(0.05, 6, 4), '#fff6dc', -0.12, 0.18, 0.55));
      g.position.set(U(gr.x), 0, U(gr.y) - 0.3);
      g.traverse((m) => { m.castShadow = true; });
      scene3.add(g); graves3.set(id, g);
    }
  }

  // ---- my things: glowing outline + bobbing pin in my colour
  const mineMarks = new Map();
  function syncMine(now) {
    const list = VM.myThings(sceneP), col = sceneP.me.colour.hex, seen = new Set();
    for (const t of list) {
      const key = t.kind + ':' + t.x + ',' + t.y; seen.add(key);
      let mk = mineMarks.get(key);
      if (!mk) {
        mk = new THREE.Group();
        const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x2 = c.getContext('2d');
        x2.beginPath(); x2.arc(64, 64, 54, 0, Math.PI * 2); x2.fillStyle = '#ffffff'; x2.fill(); x2.lineWidth = 10; x2.strokeStyle = col; x2.stroke();
        x2.font = '62px Segoe UI Emoji, Apple Color Emoji, sans-serif'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText(t.icon, 64, 68);
        const pin = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
        pin.scale.set(0.55, 0.55, 1); pin.renderOrder = 8;
        pin.position.set(t.x + t.w / 2, t.kind === 'house' ? 3.1 : 1.0, t.y + t.h / 2 - (t.kind === 'house' ? 0.3 : 0));
        mk.add(pin); mk.userData.pin = pin; mk.userData.baseY = pin.position.y;
        scene3.add(mk); mineMarks.set(key, mk);
      }
      mk.userData.pin.position.y = mk.userData.baseY + Math.sin(now / 400) * 0.06;
    }
    for (const [k, mk] of mineMarks) if (!seen.has(k)) { scene3.remove(mk); mineMarks.delete(k); }
  }

  // ---- the guide arrow, elephant alerts, smoke
  let arrow3 = null, smoke3 = [];
  const swarms3 = [];
  function makeSwarm() {
      const bees3 = new THREE.Group();
      for (let i = 0; i < 18; i++) {
        const bee = new THREE.Group();
        bee.add(sph(0.05, '#ffc21a', 0, 0, 0, 1.4, 1, 1)); bee.add(box(0.03, 0.105, 0.105, '#1c1c1c', 0, 0, 0));
        const w = mesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 }), 0, 0.05, 0); w.scale.set(1, 0.3, 1.6); bee.add(w);
        bees3.add(bee);
      }
      scene3.add(bees3);
      return bees3;
  }
  function syncBees(now) {
    const list = [sceneP.bees, ...(sceneP.otherBees ? sceneP.otherBees.values() : [])].filter(Boolean);
    while (swarms3.length < list.length) swarms3.push(makeSwarm());
    swarms3.forEach((s, i) => { s.visible = i < list.length; });
    list.forEach((b, j) => {
    const bees3 = swarms3[j];
    bees3.position.set(U(b.x), 1.0, U(b.y) + 0.4);
    bees3.children.forEach((bee, i) => { const a = now / 90 + i * 2.1, r = 0.25 + (i % 4) * 0.13; bee.position.set(Math.cos(a * (1 + i % 3 * 0.3)) * r, Math.sin(now / 70 + i) * 0.25, Math.sin(a * 1.3 + i) * r); bee.rotation.y = -a; });
    });
  }
  const hives3 = new Map();
  function syncHives(now) {
    const list = sceneP.hives || [], seen = new Set();
    for (const h of list) {
      const key = h.x + ',' + h.y; seen.add(key);
      let g = hives3.get(key);
      if (!g) {
        g = new THREE.Group();
        g.add(box(0.07, 1.3, 0.07, '#6b4a2a', 0, 0.65, 0)); g.add(box(0.5, 0.06, 0.06, '#6b4a2a', 0.22, 1.28, 0));
        [[0.98, 0.2], [0.82, 0.26], [0.66, 0.2]].forEach(([y, r]) => { g.add(sph(r, '#d9a440', 0.42, y, 0, 1, 0.65, 1)); g.add(mesh(new THREE.TorusGeometry(r * 0.95, 0.02, 4, 16), '#b98328', 0.42, y - 0.04, 0)).children.slice(-1)[0].rotation.x = Math.PI / 2; });
        g.add(sph(0.05, '#3a2510', 0.42, 0.74, 0.2));
        const bees = new THREE.Group();
        for (let i = 0; i < 7; i++) { const b = new THREE.Group(); b.add(sph(0.04, '#ffc21a', 0, 0, 0, 1.4, 1, 1)); b.add(box(0.025, 0.085, 0.085, '#1c1c1c', 0, 0, 0)); bees.add(b); }
        g.add(bees); g.userData.bees = bees;
        g.position.set(U(h.x) + 1.15, 0, U(h.y) + 0.2);
        g.traverse((m) => { m.castShadow = true; });
        scene3.add(g); hives3.set(key, g);
      }
      g.userData.bees.children.forEach((b, i) => { const a = now / 160 + i * 0.9; b.position.set(0.42 + Math.cos(a) * 0.45, 0.85 + Math.sin(a * 1.6) * 0.2, Math.sin(a) * 0.45); });
    }
    for (const [k, g] of hives3) if (!seen.has(k)) { scene3.remove(g); hives3.delete(k); }
  }
  function syncHelpers(now, dt) {
    syncBees(now);
    syncHives(now);
    // the yellow arrow that points to your next job
    const gd = sceneP.guide;
    if (!arrow3) {
      arrow3 = new THREE.Group();
      const head = mesh(new THREE.ConeGeometry(0.22, 0.4, 4), new THREE.MeshLambertMaterial({ color: '#ffd23f', emissive: '#7a5a00', emissiveIntensity: 0.4 }), 0, 0, 0.35);
      head.rotation.x = Math.PI / 2; arrow3.add(head);
      arrow3.add(box(0.14, 0.06, 0.4, '#ffd23f', 0, 0, 0));
      scene3.add(arrow3);
    }
    arrow3.visible = !!(gd && gd.visible);
    if (arrow3.visible) {
      const p = sceneP.player, a = gd.rotation;              // 2D angle: 0 = right, positive = down the screen
      arrow3.position.set(U(p.x) + Math.cos(a) * 0.9, 0.35 + Math.sin(now / 200) * 0.06, U(p.y) - 0.1 + Math.sin(a) * 0.9);
      arrow3.rotation.y = Math.PI / 2 - a;
    }
    // smoke from the cooking hut chimney
    const fp = sceneP.firePos;
    if (fp && (!smoke3.last || now - smoke3.last > 700)) {
      smoke3.last = now;
      const puff = mesh(new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshLambertMaterial({ color: '#e8e4f0', transparent: true, opacity: 0.7 }), U(fp.x), 0.9, U(fp.y) + 0.4);
      puff.castShadow = false; puff.userData.t0 = now; scene3.add(puff); smoke3.push(puff);
    }
    smoke3 = Object.assign(smoke3.filter((pf) => { const t = (now - pf.userData.t0) / 2600; if (t > 1) { scene3.remove(pf); return false; } pf.position.y = 0.9 + t * 1.4; pf.position.x += dt * 0.15; pf.scale.setScalar(1 + t * 2.2); pf.material.opacity = 0.7 * (1 - t); return true; }), { last: smoke3.last });
    // the monk walks slowly round the stupa
    if (monk) {
      const d = monk.userData, a = now / 9000;
      monk.position.set(d.cx + Math.cos(a) * d.r, 0, d.cz + Math.sin(a) * d.r);
      d.body.rotation.y = -a; d.body.position.y = Math.abs(Math.sin(now / 260)) * 0.03;
    }
  }

  // floating light specks, like fireflies / dust in the sun
  function buildSpecks() {
    const n = 160, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (rnd() - 0.5) * 30; pos[i * 3 + 1] = 0.3 + rnd() * 3; pos[i * 3 + 2] = (rnd() - 0.5) * 24; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    specks = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#dfe6ff', size: 0.12, transparent: true, opacity: 0.85, depthWrite: false }));
    scene3.add(specks);
  }

  // ------------------------------------------------------------------ people and animals
  function labelSprite() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const tex = new THREE.CanvasTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(2, 0.5, 1); sp.renderOrder = 10;
    sp.userData = { c, tex, text: null };
    return sp;
  }
  function drawLabel(sp, text, bg, fg) {
    const key = text + bg + fg;
    if (sp.userData.text === key) return;
    sp.userData.text = key;
    const { c, tex } = sp.userData, ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    ctx.font = 'bold 26px Segoe UI, Arial, sans-serif';
    const w = Math.min(250, ctx.measureText(text).width + 24);
    ctx.fillStyle = bg || '#333'; ctx.beginPath(); ctx.roundRect((256 - w) / 2, 12, w, 40, 12); ctx.fill();
    ctx.fillStyle = fg || '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 128, 33);
    tex.needsUpdate = true;
  }
  const sph = (r, c, x, y, z, sx, sy, sz) => { const o = mesh(new THREE.SphereGeometry(r, 14, 10), c, x, y, z); if (sx) o.scale.set(sx, sy, sz); return o; };
  // which Damindu a villager is: mine (chosen on the menu), another player's (from the server), or random
  function figureLook(s) {
    let code = '';
    if (s === sceneP.player) code = (sceneP.online && VM.net.myState() && VM.net.myState().look) || VM.myDamindu || '';
    else if (s.owner && s.owner.remote && VM.net.room && VM.net.room.state) { const p = VM.net.room.state.players.get(s.owner.id); code = (p && p.look) || ''; }
    const force = code ? VM.lookToForce(code) : null;
    const key = force ? 'L' + code : 'O' + ((s.outfit && s.outfit.key) || 'villager');
    return { key, seed: VM.villagerSeed(key), force };
  }
  function makeFigure(s) {
    const o = s.outfit || {}, g = new THREE.Group();
    // this villager's Damindu: the player's own choice, or random (the same on every screen) for computer villagers
    const fl = figureLook(s);
    const built = VM.buildVillager(fl.seed, 0, fl.force);
    const body = built.body;
    body.userData.parts = built.parts;
    g.add(body);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.33, 24), new THREE.MeshBasicMaterial({ color: (s.owner && s.owner.colour && s.owner.colour.hex) || '#fff', transparent: true, opacity: 0.85 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
    const label = labelSprite(); label.position.y = 1.4; g.add(label);
    body.traverse((c) => { if (c.material) c.material.userData.own = true; }); // own materials (made per villager), so a ghost can fade alone
    g.userData = { body, label, ring, lastX: s.x, lastY: s.y, face: 0, look: fl.key };
    scene3.add(g);
    return g;
  }
  function makeAnimal(key) {
    const g = new THREE.Group();
    const legs = (c, h, w, d, r) => [[-w, d], [w, d], [-w, -d], [w, -d]].forEach(([a, b]) => g.add(mesh(new THREE.CylinderGeometry(r, r * 0.9, h, 8), c, a, h / 2, b)));
    if (key === 'cow') {
      legs('#f1ece2', 0.28, 0.24, 0.12, 0.055);
      [[-0.24, 0.12], [0.24, 0.12], [-0.24, -0.12], [0.24, -0.12]].forEach(([a, b]) => g.add(mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.05, 8), '#4a3a30', a, 0.025, b))); // hooves
      g.add(sph(0.26, '#f6f2ea', 0, 0.48, 0, 1.55, 1, 1));                         // round body
      g.add(sph(0.1, '#4a3a32', -0.12, 0.6, 0.18, 1.3, 1, 0.5)); g.add(sph(0.08, '#4a3a32', 0.15, 0.5, -0.2, 1.2, 1, 0.5)); g.add(sph(0.07, '#4a3a32', -0.2, 0.62, -0.15, 1, 1, 0.6)); // spots
      g.add(sph(0.17, '#f6f2ea', 0.46, 0.62, 0));                                   // head
      g.add(sph(0.11, '#f3b8b0', 0.6, 0.56, 0, 0.8, 0.8, 1.2));                      // pink nose
      [-0.07, 0.07].forEach((z) => { g.add(sph(0.02, '#1b1410', 0.57, 0.68, z)); g.add(sph(0.06, '#f6f2ea', 0.42, 0.7, z * 2.6, 0.5, 0.4, 1)); });
      [-1, 1].forEach((sd) => { const h = mesh(new THREE.ConeGeometry(0.025, 0.1, 6), '#efe2b8', 0.44, 0.8, sd * 0.09); h.rotation.x = sd * -0.5; g.add(h); }); // horns
      const tail = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.25, 5), '#e8e0d0', -0.42, 0.45, 0); tail.rotation.z = -0.4; g.add(tail); g.add(sph(0.035, '#4a3a32', -0.47, 0.33, 0));
    } else if (key === 'deer') {
      legs('#b97a46', 0.4, 0.17, 0.08, 0.035);
      g.add(sph(0.2, '#c88a52', 0, 0.58, 0, 1.5, 0.9, 0.85));
      [[-0.1, 0.12], [0.05, -0.13], [0.12, 0.13]].forEach(([a, b]) => g.add(sph(0.025, '#f4e6d0', a, 0.68, b)));   // white spots
      const neck = mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.26, 8), '#c88a52', 0.28, 0.76, 0); neck.rotation.z = -0.5; g.add(neck);
      g.add(sph(0.11, '#c88a52', 0.38, 0.9, 0, 1.2, 1, 1)); g.add(sph(0.04, '#3a2a20', 0.5, 0.88, 0));
      [-0.05, 0.05].forEach((z) => g.add(sph(0.018, '#1b1410', 0.45, 0.93, z * 1.4)));
      [-1, 1].forEach((sd) => { const a1 = mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.22, 5), '#e8d6b0', 0.36, 1.06, sd * 0.06); a1.rotation.x = sd * -0.4; g.add(a1); const a2 = mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.1, 5), '#e8d6b0', 0.4, 1.1, sd * 0.1); a2.rotation.z = -0.8; g.add(a2); }); // antlers
      g.add(sph(0.05, '#ffffff', -0.3, 0.64, 0));                                    // white tail
    } else if (key === 'elephant') {
      legs('#8f8aa6', 0.55, 0.42, 0.24, 0.13);
      g.add(sph(0.62, '#9a95b0', 0, 1.0, 0, 1.35, 1, 0.95));                          // big round body
      g.add(sph(0.38, '#9a95b0', 0.85, 1.25, 0));                                     // head
      [-1, 1].forEach((sd) => { const ear = sph(0.32, '#a9a4c0', 0.72, 1.28, sd * 0.36, 0.25, 1, 1); g.add(ear); g.add(sph(0.22, '#d6b8c8', 0.76, 1.28, sd * 0.37, 0.18, 0.75, 0.75)); }); // ears
      const t1 = mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.42, 10), '#9a95b0', 1.15, 1.0, 0); t1.rotation.z = 0.25; g.add(t1);
      const t2 = mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.32, 10), '#9a95b0', 1.22, 0.72, 0); t2.rotation.z = -0.4; g.add(t2);       // curled trunk
      [-1, 1].forEach((sd) => { const tk = mesh(new THREE.ConeGeometry(0.04, 0.3, 8), '#fbf6ea', 1.12, 1.02, sd * 0.16); tk.rotation.z = -2.2; g.add(tk); }); // tusks
      [-0.13, 0.13].forEach((z) => g.add(sph(0.035, '#1b1410', 1.08, 1.38, z)));
      const tail = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 5), '#8f8aa6', -0.85, 0.9, 0); tail.rotation.z = -0.3; g.add(tail);
    } else {
      // a fluffy round chicken
      [-0.04, 0.04].forEach((z) => g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.1, 4), '#f0a030', 0, 0.05, z)));
      g.add(sph(0.13, '#fbf7ee', 0, 0.18, 0, 1.2, 1, 1));
      g.add(sph(0.08, '#fbf7ee', 0.1, 0.3, 0));
      g.add(mesh(new THREE.ConeGeometry(0.025, 0.06, 5), '#f0a030', 0.18, 0.3, 0)).children.slice(-1)[0].rotation.z = -Math.PI / 2;
      g.add(sph(0.035, '#e0403a', 0.1, 0.39, 0, 1.2, 1, 0.5));                        // comb
      [-0.04, 0.04].forEach((z) => g.add(sph(0.012, '#1b1410', 0.15, 0.32, z)));
      [-1, 1].forEach((sd) => g.add(sph(0.07, '#f1ebdc', -0.02, 0.19, sd * 0.11, 1.2, 0.8, 0.4))); // wings
      g.add(sph(0.06, '#f1ebdc', -0.14, 0.26, 0, 0.6, 1.2, 0.6));                     // tail
    }
    g.traverse((c) => { c.castShadow = true; });
    scene3.add(g);
    return g;
  }
  function follow(g, s, dt, isPerson) {
    const x = U(s.x), z = U(s.y) - 0.1, d = g.userData;
    if (typeof d.face !== 'number') d.face = 0;
    const dx = x - (d.px === undefined ? x : d.px), dz = z - (d.pz === undefined ? z : d.pz);
    d.px = x; d.pz = z;
    g.position.set(x, 0, z);
    const moving = Math.hypot(dx, dz) > 0.002;
    if (moving) d.face = Math.atan2(dx, dz);
    const target = isPerson ? d.face : d.face - Math.PI / 2;
    const part = isPerson ? d.body : g;
    if (part) {
      let diff = target - part.rotation.y; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
      part.rotation.y += diff * Math.min(1, dt * 10);
      if (isPerson) {
        d.bob = (d.bob || 0) + (moving ? dt * 14 : 0); part.position.y = moving ? Math.abs(Math.sin(d.bob)) * 0.06 : 0; part.rotation.z = Math.PI / 2 * ((s.angle || 0) / 90);
        const p = part.userData.parts;
        if (p) {
          d.stride = (d.stride || 0) + ((moving ? 1 : 0) - (d.stride || 0)) * Math.min(1, dt * 8);   // eases in and out
          const sw = Math.sin(d.bob) * 0.55 * d.stride;
          if (p.legs) { p.legs[0].rotation.x = sw; p.legs[1].rotation.x = -sw; }
          if (p.arms) { p.arms[0].rotation.x = -sw * 0.8; p.arms[1].rotation.x = sw * 0.8; }
        }
      }
    }
  }

  // ------------------------------------------------------------------ details from the 2D game
  const texts = new Map();     // Phaser text -> 3D label
  const crows = new Map();     // Phaser crow image -> 3D crow
  let fences3 = [], fenceKey = null;
  function textLabel(t) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const tex = new THREE.CanvasTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.renderOrder = 9; sp.userData = { c, tex, key: null };
    scene3.add(sp);
    return sp;
  }
  function drawText(sp, t) {
    const st = t.style || {}, text = String(t.text || ''), key = text + '|' + st.backgroundColor + '|' + st.color + '|' + st.fontSize;
    if (sp.userData.key === key) return;
    sp.userData.key = key;
    const { c, tex } = sp.userData, ctx = c.getContext('2d'), lines = text.split('\n');
    const fs = Math.max(11, parseInt(st.fontSize, 10) || 12), px = fs * 3.2;
    ctx.clearRect(0, 0, 512, 128);
    ctx.font = 'bold ' + px + 'px Segoe UI, Arial, sans-serif';
    const w = Math.min(500, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 30), h = Math.min(124, lines.length * px * 1.1 + 16);
    if (st.backgroundColor && st.backgroundColor !== 'transparent') { ctx.fillStyle = st.backgroundColor; ctx.beginPath(); ctx.roundRect((512 - w) / 2, (128 - h) / 2, w, h, 16); ctx.fill(); }
    ctx.fillStyle = st.color || '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (st.stroke && st.strokeThickness) { ctx.lineWidth = st.strokeThickness * 3; ctx.strokeStyle = st.stroke; lines.forEach((l, i) => ctx.strokeText(l, 256, 64 + (i - (lines.length - 1) / 2) * px * 1.1)); }
    lines.forEach((l, i) => ctx.fillText(l, 256, 64 + (i - (lines.length - 1) / 2) * px * 1.1));
    tex.needsUpdate = true;
    sp.scale.set(4, 1, 1);
  }
  function syncTexts() {
    const own = new Set();
    for (const v of sceneP.villagers || []) if (v.label) own.add(v.label);
    const places = new Set(sceneP.placeLabels || []);
    const seen = new Set();
    for (const t of sceneP.children.list) {
      if (t.type !== 'Text' || own.has(t) || !t.active) continue;
      seen.add(t);
      let sp = texts.get(t);
      if (!sp) { sp = textLabel(t); texts.set(t, sp); }
      drawText(sp, t);
      const place = places.has(t);
      // place names sit high above their building; signs and the rest stand where they are
      sp.position.set(U(t.x), place ? 2.7 : 0.75, U(t.y) + (place ? 2.1 : 0));
      // fade out names near the screen edges, so no word is ever cut in half
      const ndc = sp.position.clone().project(camera), edge = Math.max(Math.abs(ndc.x) + 0.18 * sp.scale.x / 4, Math.abs(ndc.y) + 0.06);
      const fade = edge > 0.95 ? 0 : edge > 0.82 ? (0.95 - edge) / 0.13 : 1;
      sp.visible = t.visible !== false && t.alpha > 0.05 && fade > 0.02;
      sp.material.opacity = Math.min(1, t.alpha) * fade;
    }
    for (const [t, sp] of texts) if (!seen.has(t)) { scene3.remove(sp); texts.delete(t); }
  }
  function buildBell() {
    const b = sceneP.bellPos; if (!b) return;
    const g = new THREE.Group();
    g.add(box(0.08, 1.3, 0.08, '#6b4a34', -0.4, 0.65, 0)); g.add(box(0.08, 1.3, 0.08, '#6b4a34', 0.4, 0.65, 0)); g.add(box(1, 0.1, 0.12, '#6b4a34', 0, 1.3, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.26, 0.38, 14, 1, true), '#d9a93a', 0, 1.02, 0)).children.slice(-1)[0].material.side = THREE.DoubleSide;
    g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), '#8a6a2a', 0, 0.84, 0));
    g.position.set(U(b.x), 0, U(b.y) - 0.1);
    scene3.add(g);
  }
  function flags3d(ho) {
    if (!ready || !ho || !ho.h) return;
    const g = new THREE.Group(), x = U(ho.h.x), z = U(ho.h.y) + 0.35;
    const white = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }); // always bright white
    // two tall white flag poles in front of the house, with big white flags
    [-1.5, 1.5].forEach((dx) => {
      g.add(box(0.07, 2.6, 0.07, '#f2f2f2', x + dx, 1.3, z));
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.55, 6, 1), white);
      fl.position.set(x + dx + 0.52, 2.25, z); fl.userData.wave = true; g.add(fl);
    });
    // a string of white pennants between the poles, and a second one along the front fence line
    [[2.0, 0], [1.2, 0.45]].forEach(([h, dz]) => {
      for (let i = 0; i < 18; i++) {
        const t = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 3), white);
        t.rotation.x = Math.PI; t.position.set(x - 1.45 + i * 0.17, h - Math.sin((i / 17) * Math.PI) * 0.18, z + dz); g.add(t);
      }
    });
    scene3.add(g);
    (flags3d.list || (flags3d.list = [])).push(g);
    // crows circling above the dead player's land
    const gd = ho.h.garden;
    if (gd) for (let i = 0; i < 3; i++) { const c = makeCrow(true); c.userData.circle = { cx: gd.x + gd.w / 2, cz: gd.y + gd.h / 2, r: 0.9 + i * 0.35, h: 2.2 + i * 0.4, sp: 0.8 + i * 0.25, ph: i * 2 }; circling.push(c); }
  }
  function fence3d(r) {
    if (!ready) return;
    const g = new THREE.Group(), x0 = r.x + 0.05, z0 = r.y + 0.05, x1 = r.x + r.w - 0.05, z1 = r.y + r.h - 0.05;
    const post = (x, z) => g.add(box(0.07, 0.5, 0.07, '#5a3a1e', x, 0.25, z));
    for (let x = x0; x <= x1 + 0.01; x += 0.6) { post(x, z0); post(x, z1); }
    for (let z = z0; z <= z1 + 0.01; z += 0.6) { post(x0, z); post(x1, z); }
    const wire = new THREE.MeshBasicMaterial({ color: '#ffe14a' });
    [0.22, 0.4].forEach((h) => {
      [[x0, z0, x1, z0], [x0, z1, x1, z1], [x0, z0, x0, z1], [x1, z0, x1, z1]].forEach(([a, b, c, d]) => {
        const len = Math.hypot(c - a, d - b), w = new THREE.Mesh(new THREE.BoxGeometry(len, 0.02, 0.02), wire);
        w.position.set((a + c) / 2, h, (b + d) / 2); w.rotation.y = -Math.atan2(d - b, c - a); g.add(w);
      });
    });
    g.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffe14a' }), x1, 0.56, z0));
    scene3.add(g); fences3.push(g);
  }
  const circling = [];
  function makeCrow(flying) {
    const g = new THREE.Group();
    g.add(sph(0.09, '#1c1c22', 0, 0.1, 0, 1.4, 0.9, 0.9)); g.add(sph(0.06, '#1c1c22', 0.1, 0.17, 0));
    g.add(mesh(new THREE.ConeGeometry(0.025, 0.07, 5), '#f0b400', 0.17, 0.17, 0)).children.slice(-1)[0].rotation.z = -Math.PI / 2;
    g.add(sph(0.012, '#ffffff', 0.13, 0.19, 0.04));
    if (flying) [-1, 1].forEach((sd) => { const w = box(0.12, 0.01, 0.22, '#1c1c22', 0, 0.12, sd * 0.13); w.userData.wing = sd; g.add(w); });
    g.scale.setScalar(2.2);                                                      // big enough to see from the camera
    scene3.add(g); return g;
  }
  function syncDetails(now) {
    syncTexts();
    // crows on a dead player's garden
    const seen = new Set();
    for (const c of sceneP.children.list) {
      if (c.type !== 'Image' || !c.texture || c.texture.key !== 'crow' || !c.active) continue;
      seen.add(c);
      let g = crows.get(c); if (!g) { g = makeCrow(); crows.set(c, g); }
      g.position.set(U(c.x), Math.abs(Math.sin(now / 250 + c.x)) * 0.04, U(c.y) - 0.1); g.rotation.y = c.flipX ? Math.PI : 0; g.rotation.z = Math.sin(now / 200 + c.y) * 0.3;
    }
    for (const [c, g] of crows) if (!seen.has(c)) { scene3.remove(g); crows.delete(c); }
    // fences: rebuilt whenever the 2D game rebuilds them
    if (sceneP.fenceKey !== fenceKey) {
      fenceKey = sceneP.fenceKey;
      fences3.forEach((g) => scene3.remove(g)); fences3 = [];
      if (sceneP.fencedPlots) sceneP.fencedPlots.forEach((i) => fence3d(VM.paddyPlotRect(sceneP.world, i)));
      if (sceneP.fencedHouses) sceneP.fencedHouses.forEach((hi) => { const ho = sceneP.houseObjs[hi]; if (ho && ho.h && ho.h.garden) fence3d(ho.h.garden); });
    }
    circling.forEach((c) => { const k = c.userData.circle, a = now / 1000 * k.sp + k.ph; c.position.set(k.cx + Math.cos(a) * k.r, k.h + Math.sin(now / 300 + k.ph) * 0.1, k.cz + Math.sin(a) * k.r); c.rotation.y = -a - Math.PI / 2; c.children.forEach((w) => { if (w.userData.wing) w.rotation.x = w.userData.wing * Math.sin(now / 90) * 0.6; }); });
    // white flags flutter
    (flags3d.list || []).forEach((g) => g.children.forEach((c) => { if (c.userData.wave) c.rotation.y = Math.sin(now / 300 + c.position.x) * 0.4; }));
  }

  let fishes = null, waterTiles = null, rod = null;
  function updateFish(now) {
    if (!waterTiles) { waterTiles = []; const g = sceneP.grid, k = T(); for (let y = 0; y < VM.MAP_H; y++) for (let x = 0; x < VM.MAP_W; x++) if (g[y][x] === k.WATER) waterTiles.push([x + 0.5, y + 0.5]); }
    if (!fishes) {
      fishes = [];
      for (let i = 0; i < 6; i++) {
        const f = new THREE.Group();
        f.add(sph(0.07, '#7fa8c8', 0, 0, 0, 1.8, 0.8, 0.6));
        const tail = mesh(new THREE.ConeGeometry(0.05, 0.08, 3), '#6f98b8', -0.15, 0, 0); tail.rotation.z = Math.PI / 2; f.add(tail);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.1, 16), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6 }));
        ring.rotation.x = -Math.PI / 2; f.userData = { ring, at: now + rnd() * 6000 };
        scene3.add(f, ring); f.visible = false; ring.visible = false; fishes.push(f);
      }
    }
    // fish jump near the camera, so you see them
    const near = waterTiles.filter(([x, z]) => Math.abs(x - camPos.x) < 12 && Math.abs(z - camPos.z) < 9);
    fishes.forEach((f) => {
      const d = f.userData;
      if (now > d.at && !d.jump && near.length) { const [x, z] = near[Math.floor(rnd() * near.length)]; d.jump = { x, z, t0: now }; d.at = now + 2500 + rnd() * 6000; }
      if (!d.jump) return;
      const t = (now - d.jump.t0) / 900;
      if (t > 1.6) { d.jump = null; f.visible = false; d.ring.visible = false; return; }
      f.visible = t <= 1;
      f.position.set(d.jump.x + t * 0.5, Math.sin(Math.min(1, t) * Math.PI) * 0.45, d.jump.z);
      f.rotation.z = (0.5 - Math.min(1, t)) * 2.4;
      d.ring.visible = true; d.ring.position.set(d.jump.x + (t > 1 ? 0.5 : 0), 0.04, d.jump.z);
      const sc = 1 + (t % 1) * 3; d.ring.scale.set(sc, sc, sc); d.ring.material.opacity = 0.6 * (1 - (t % 1));
    });
    // a fishing rod in your hands while you fish from the boat
    const me = figures.get(sceneP.player);
    const fishing = !!(sceneP.task && sceneP.task.spot && sceneP.task.spot.name === 'fish');
    if (me) {
      if (!rod) {
        rod = new THREE.Group();
        const pole = box(0.025, 0.025, 1.2, '#7a5a3a', 0, 0, 0.6); rod.add(pole);
        const line = box(0.006, 0.6, 0.006, '#ffffff', 0, -0.3, 1.2); rod.add(line);
        rod.add(sph(0.035, '#e0403a', 0, -0.6, 1.2));
        rod.position.set(0.2, 0.45, 0.05); rod.rotation.x = -0.5;
        me.userData.body.add(rod);
      }
      rod.visible = fishing;
      if (fishing) rod.rotation.x = -0.5 + Math.sin(now / 300) * 0.05;
    }
  }

  // ------------------------------------------------------------------ every frame
  // something went wrong with 3D: show the normal flat village (the game itself never stops)
  let failed = false, errors = 0;
  function fallback() {
    if (failed) return;
    failed = true; ready = false; VM.USE3D = false;
    if (game && game.canvas) game.canvas.style.opacity = '';
    if (sceneP && sceneP.cameras && sceneP.cameras.main) sceneP.cameras.main.setVisible(true); // the flat village draws again
    const w = document.getElementById('view3d'); if (w) w.remove();
    try { if (renderer) { renderer.dispose(); renderer.forceContextLoss(); } } catch (e) { /* gone */ }
  }
  function update(dt) {
    if (failed) return;
    try { update3d(dt); errors = 0; } catch (e) { console.warn('3D frame', e); if (++errors > 5) fallback(); }
  }
  // a phone that cannot keep up (under ~28 frames a second): lower the sharpness a step, at most twice
  const perf = { frames: 0, t0: 0, steps: 0 };
  function watchSpeed(now) {
    if (perf.steps >= 2 || !document.body.classList.contains('is-touch') || document.hidden) return;
    if (!perf.t0) { perf.t0 = now; perf.frames = 0; return; }
    perf.frames++;
    if (now - perf.t0 < 4000) return;
    const fps = perf.frames * 1000 / (now - perf.t0);
    perf.t0 = now; perf.frames = 0;
    if (fps < 28 && renderer.getPixelRatio() > 1) { perf.steps++; renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() - 0.4)); renderer.setSize(innerWidth, innerHeight); }
  }
  function update3d(dt) {
    if (!ready || !sceneP || !sceneP.player) return;
    const now = performance.now();
    watchSpeed(now);
    // which vegetable land is still for sale (online): repaint when that changes
    let sk = '';
    (sceneP.houseObjs || []).forEach((ho, i) => { if (ho.sprouts && ho.sprouts.visible) sk += i + ','; });
    (sceneP.houseObjs || []).forEach((ho, i) => { if (ho.owner && ho.owner.deadLand) sk += 'd' + i + ','; });
    const st = sceneP.online && VM.net.room && VM.net.room.state;
    if (st) st.paddy.forEach((owner, plot) => { const op = st.players.get(owner); if (op && !op.alive) sk += 'p' + plot + ','; });
    if (sk !== sproutKey) {
      bare = new Set();
      (sceneP.houseObjs || []).forEach((ho) => { if (ho.owner && ho.owner.deadLand && ho.h && ho.h.garden) { const g = ho.h.garden; for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) bare.add(x + ',' + y); } });
      if (st) st.paddy.forEach((owner, plot) => { const op = st.players.get(owner); if (op && !op.alive) { const r = VM.paddyPlotRect(sceneP.world, Number(plot)); for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) bare.add(x + ',' + y); if (!eatenPlots.has(plot)) { eatenPlots.add(plot); for (let i = 0; i < 3; i++) { const c = makeCrow(true); c.userData.circle = { cx: r.x + r.w / 2, cz: r.y + r.h / 2, r: 1.5 + i * 0.6, h: 2 + i * 0.5, sp: 0.7 + i * 0.2, ph: i * 2 }; circling.push(c); } } } }); sproutKey = sk; unsold = new Set(); (sceneP.houseObjs || []).forEach((ho) => { if (ho.sprouts && ho.sprouts.visible && ho.h && ho.h.garden) { const g = ho.h.garden; for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) unsold.add(x + ',' + y); } }); dirty = true; lastGround = 0; }
    if (dirty && now - lastGround > 600) { dirty = false; lastGround = now; paintGround(); }

    // villagers (you, the computer villagers, other players)
    const seen = new Set();
    for (const s of sceneP.villagers || []) {
      if (!s.active) continue;
      seen.add(s);
      let g = figures.get(s);
      if (g && g.userData.look !== figureLook(s).key) { scene3.remove(g); figures.delete(s); if (s === sceneP.player) rod = null; g = null; } // new clothes: a new figure
      if (!g) { g = makeFigure(s); figures.set(s, g); }
      follow(g, s, dt, true);
      const wt = sceneP.tileAt(Math.floor(s.x / VM.TILE), Math.floor((s.y - 3) / VM.TILE));
      const inBoat = s === sceneP.player ? !!sceneP.inBoat : false;
      g.position.y = wt === T().WATER ? (inBoat ? 0.12 : -0.45) : 0;
      if (s === sceneP.player && sceneP.inTractor && tractor3) { g.position.set(tractor3.position.x - 0.2, 0.5, tractor3.position.z); g.userData.ring.visible = false; }
      const ghost = s.alpha < 0.9;
      g.visible = s.visible !== false && (s.alpha > 0.05);
      g.userData.body.visible = true;
      // at night the 2D game shows other villagers as black shapes (tint fill): the 3D figure goes fully black too
      const black = !!(s.isTinted && s.tintFill);
      g.userData.body.traverse((c) => { if (!c.material || !c.material.color || !c.material.userData.own) return; const md = c.material.userData; if (md.col === undefined) md.col = c.material.color.getHex(); c.material.color.setHex(black ? 0x0c0c10 : md.col); c.material.transparent = ghost; c.material.opacity = ghost ? 0.45 : 1; });
      if (g.userData.ring) g.userData.ring.visible = !black && g.userData.ring.visible;
      const lb = s.label;
      if (lb) { g.userData.label.visible = lb.visible !== false; drawLabel(g.userData.label, lb.text, lb.style && lb.style.backgroundColor, lb.style && lb.style.color); }
      if (s.ring) g.userData.ring.visible = s.ring.visible !== false;
    }
    for (const [s, g] of figures) if (!seen.has(s)) { scene3.remove(g); figures.delete(s); }

    // animals and elephants
    (sceneP.animals || []).forEach((a) => { if (!a.g3) a.g3 = makeAnimal(a.texture.key); a.g3.userData.body = null; follow(a.g3, a, dt, false); a.g3.visible = a.visible !== false; });
    const eSeen = new Set();
    (sceneP.elephants || []).forEach((e) => { if (!e.active) return; eSeen.add(e); let g = elephants.get(e); if (!g) { g = makeAnimal('elephant'); const al = labelSprite(); al.position.y = 2.3; al.scale.set(1.2, 0.3, 1); drawLabel(al, '! ELEPHANT', '#d63a2f', '#fff'); g.add(al); g.userData.alert = al; elephants.set(e, g); } follow(g, e, dt, false); if (g.userData.alert) g.userData.alert.visible = !e.leaving; });
    for (const [e, g] of elephants) if (!eSeen.has(e)) { scene3.remove(g); elephants.delete(e); }
    if (sceneP.tractor && tractor3) { tractor3.position.set(U(sceneP.tractor.x), 0, U(sceneP.tractor.y) - 0.3); tractor3.rotation.y = sceneP.tractor.flipX ? Math.PI : 0; }
    (sceneP.boats || []).forEach((b, i) => { const sp = b.sprite || b; if (boats3[i] && sp) { boats3[i].position.set(U(sp.x), Math.sin(now / 700 + i) * 0.02, U(sp.y) - 0.2); /* floats level, only bobbing gently */ } });

    // house roofs take the colour of the family living there
    (sceneP.houseObjs || []).forEach((ho, i) => { const r = houseRoofs[i]; if (!r) return; const c = ho.owner ? ho.owner.colour.hex : '#c9c1b6'; if (r.userData.c !== c) { r.userData.c = c; r.color.set(c); if (r.userData.shutters) r.userData.shutters.color.set(VM.shade(c, -0.15)); } });

    syncDetails(now);
    syncHelpers(now, dt);
    syncMine(now);
    syncGraves();
    updateFish(now);
    flagsToWave.forEach((fl) => { const p = fl.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(now / 250 + x * 5) * 0.06 * (x + 0.5)); } p.needsUpdate = true; });
    lamps.forEach((l) => { l.material.emissiveIntensity = (sceneP.isNight || sceneP.isDusk) ? 1.2 : 0.2; }); // street lamps light up in the evening
    // camera: above and behind the player, tilted like a toy diorama
    const p = sceneP.player, tx = U(p.x), tz = U(p.y);
    if (!camPos.set || Math.hypot(tx - camPos.x, tz - camPos.z) > 15) { camPos.x = tx; camPos.z = tz; camPos.set = true; } // jump straight to you at the start or after a teleport
    camPos.x += (tx - camPos.x) * Math.min(1, dt * 5); camPos.z += (tz - camPos.z) * Math.min(1, dt * 5);
    const narrow = innerWidth < innerHeight, phone = document.body.classList.contains('is-touch') && Math.min(innerWidth, innerHeight) < 600; const dist = phone ? (narrow ? 12 : 10) : 16; // phones: much closer, so villagers and details are big enough; PC unchanged
    camera.position.set(camPos.x, dist * 0.85, camPos.z + dist * 0.8);
    camera.lookAt(camPos.x, 0.4, camPos.z);
    sun.position.set(camPos.x - 10, 22, camPos.z + 8); sun.target.position.set(camPos.x, 0, camPos.z);
    specks.position.set(camPos.x, 0, camPos.z);
    specks.rotation.y += dt * 0.02;
    specks.visible = !!sceneP.isNight;                                  // fireflies only at night
    specks.material.opacity = 0.55 + Math.sin(now / 900) * 0.35;

    // day and night
    const night = !!sceneP.isNight, dusk = !!sceneP.isDusk;
    const k = night ? 1 : dusk ? 0.5 : 0;
    const sky = new THREE.Color('#8fd0f5').lerp(new THREE.Color('#1f2346'), k);
    scene3.background.copy(sky); scene3.fog.color.copy(new THREE.Color('#bfe6fa').lerp(new THREE.Color('#1f2346'), k));
    hemi.intensity = 0.62 - k * 0.36; sun.intensity = 0.8 - k * 0.66;
    specks.material.color.set(night ? '#ffe98a' : '#dfe6ff'); specks.material.size = night ? 0.16 : 0.12;

    renderer.render(scene3, camera);
  }

  return { init, update };
})();
