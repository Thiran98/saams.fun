// Sams Gama villagers: one funny human shape for everyone, never showing man or woman, each one different.
// VM.buildVillager(seed, detail) returns { body, parts } built from the seed (the same seed always gives the same
// villager on every screen). The look is random: skin, hair (curly mop, short crop, messy tufts, shaved, grey),
// eyes, grin, and poor village clothes: faded colours, patches, frayed hems, a missing button, rubber slippers or
// bare feet, sometimes an old towel, a frayed straw hat, a head cloth or a woven bag.
// detail: 1 = full (preview), 0 = lighter (the game, on phones too).

// everything a player can choose for their Damindu (no man / woman choices)
VM.DAMINDU = {
  skins: ['#8a5a3c', '#a8714e', '#c08a62', '#6e452e', '#b77d55', '#94603f'],
  hairs: [['curly', false, 'Curly'], ['short', false, 'Short'], ['messy', false, 'Messy'], ['shaved', false, 'Shaved'], ['curly', true, 'Grey curls'], ['short', true, 'Grey short'], ['wavy', false, 'Wavy'], ['wavy', true, 'Grey wavy']],
  tops: [['shirt', 'Old shirt'], ['tee', 'Worn T-shirt'], ['vest', 'Banian vest']],
  colours: ['#9a8f7a', '#7f93a8', '#a86a5e', '#7d8a5a', '#8a8a86', '#b59a5a', '#d8d0bc', '#6f7f9a', '#a08a70', '#8c6e5a', '#9aa08a', '#3a3b42'],
  lows: [['sarong', false, 'Sarong'], ['sarong', true, 'Rolled-up sarong'], ['shorts', false, 'Old shorts'], ['trousers', false, 'Rolled trousers']],
  extras: [['none', 'Nothing'], ['towel', 'Towel'], ['hat', 'Straw hat'], ['cloth', 'Head cloth'], ['bag', 'Woven bag']],
  mouths: [['grin', 'Big grin'], ['buck', 'Buck tooth'], ['gap', 'Gap tooth'], ['oh', 'Surprised']],
  feet: [[true, 'Slippers'], [false, 'Bare feet']],
  glasses: [[0, 'No glasses'], [1, 'Round glasses'], [2, 'Square glasses']],
};
VM.DAMINDU.parts = ['skins', 'hairs', 'tops', 'colours', 'lows', 'colours', 'extras', 'mouths', 'feet', 'glasses']; // the order of the numbers in a look code
// a look code -> the choices for VM.buildVillager (null when the code is not valid)
VM.lookToForce = (code) => {
  const n = String(code || '').split('.').map(Number), D = VM.DAMINDU;
  if (n.length === D.parts.length - 1) n.push(0);   // an older code without glasses
  if (n.length !== D.parts.length || n.some((x, i) => !Number.isInteger(x) || x < 0 || x >= D[D.parts[i]].length)) return null;
  const h = D.hairs[n[1]], l = D.lows[n[4]];
  return { skin: D.skins[n[0]], hair: h[0], grey: h[1], top: D.tops[n[2]][0], topC: D.colours[n[3]], low: l[0], rolled: l[1], lowC: D.colours[n[5]], extra: D.extras[n[6]][0], mouth: D.mouths[n[7]][0], slippers: D.feet[n[8]][0], glasses: D.glasses[n[9]][0] };
};
VM.randomLook = () => VM.DAMINDU.parts.map((p) => Math.floor(Math.random() * VM.DAMINDU[p].length)).join('.');

VM.buildVillager = function buildVillager(seed, detail, force) {
  const full = detail !== 0, F = force || {};
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const seg = full ? [28, 20] : [14, 10];
  const mat = (c, o) => { const m = new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {})); m.userData.own = true; return m; };
  const mesh = (geo, m, x, y, z) => { const r = new THREE.Mesh(geo, typeof m === 'string' ? mat(m) : m); r.position.set(x || 0, y || 0, z || 0); r.castShadow = true; return r; };
  const sph = (r, m, x, y, z, sx, sy, sz) => { const o = mesh(new THREE.SphereGeometry(r, seg[0], seg[1]), m, x, y, z); if (sx) o.scale.set(sx, sy, sz); return o; };
  const box = (w, h, d, m, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z);
  // faded, washed-out village colours (nothing new or bright)
  const FADED = VM.DAMINDU.colours || ['#9a8f7a', '#7f93a8', '#a86a5e', '#7d8a5a', '#8a8a86', '#b59a5a', '#d8d0bc', '#6f7f9a', '#a08a70', '#8c6e5a', '#9aa08a', '#c4b494'];
  const PATCH = ['#5a4a3a', '#6f8fb0', '#a83a30', '#c9b27a', '#4a5a3a', '#e0d6c0'];
  const fabric = (base, kind) => {        // a canvas texture: faded cloth, with checks for a sarong, stains and a patch or two
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const x = cv.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, 128, 64);
    if (kind === 'check') { x.fillStyle = 'rgba(255,255,255,.2)'; for (let i = 0; i < 128; i += 16) x.fillRect(i, 0, 5, 64); for (let j = 0; j < 64; j += 16) x.fillRect(0, j, 128, 5); x.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 8; i < 128; i += 16) x.fillRect(i, 0, 2, 64); }
    for (let k = 0; k < 5; k++) { x.fillStyle = 'rgba(60,40,20,' + (0.05 + rnd() * 0.08) + ')'; x.beginPath(); x.arc(rnd() * 128, rnd() * 64, 4 + rnd() * 9, 0, Math.PI * 2); x.fill(); } // old stains
    const patches = 1 + Math.floor(rnd() * 2);
    for (let k = 0; k < patches; k++) {   // a sewn-on patch with stitches
      const px = 10 + rnd() * 90, py = 8 + rnd() * 34, pw = 14 + rnd() * 12, ph = 12 + rnd() * 10;
      x.fillStyle = pick(PATCH); x.fillRect(px, py, pw, ph);
      x.strokeStyle = 'rgba(240,230,210,.8)'; x.setLineDash([2, 2]); x.lineWidth = 1; x.strokeRect(px + 1.5, py + 1.5, pw - 3, ph - 3); x.setLineDash([]);
    }
    const t = new THREE.CanvasTexture(cv); t.wrapS = THREE.RepeatWrapping; t.repeat.set(2, 1); return t;
  };
  const SKINS = VM.DAMINDU.skins || ['#8a5a3c', '#a8714e', '#c08a62', '#6e452e', '#b77d55', '#94603f'];
  const skinC = F.skin || pick(SKINS), skin = mat(skinC), skinDark = mat(new THREE.Color(skinC).multiplyScalar(0.82));
  const grey = F.grey !== undefined ? F.grey : rnd() < 0.15, hairM = mat(grey ? '#8a8682' : '#1b1512');
  const body = new THREE.Group(), parts = {};

  // ---- legs: each one swings from the hip, with a foot (worn rubber slipper or bare) at the end
  const slippers = F.slippers !== undefined ? F.slippers : rnd() < 0.65, slipC = pick(['#3a6fd0', '#e8e4da', '#3a3a3a', '#c0392b']);
  const HIP = 0.27;
  parts.legs = [-1, 1].map((sd) => {
    const leg = new THREE.Group(); leg.position.set(sd * 0.08, HIP, 0);
    leg.add(mesh(new THREE.CylinderGeometry(0.036, 0.032, 0.23, 10), skin, 0, -0.115, 0));            // the leg
    leg.add(sph(0.038, skin, 0, -0.12, 0.005, 1, 0.8, 1));                                              // a knobbly knee
    const foot = new THREE.Group(); foot.position.set(0, -HIP, 0.04);                                   // the foot on the ground
    foot.add(sph(0.058, skin, 0, 0.035, 0.01, 1, 0.55, 1.6));
    if (slippers) { foot.add(box(0.105, 0.018, 0.18, slipC, 0, 0.009, 0.01)); foot.add(box(0.012, 0.03, 0.06, slipC, 0, 0.04, 0.04)); }
    leg.add(foot);
    body.add(leg); return leg;
  });
  parts.feet = parts.legs;   // older code swings "feet": now the whole leg swings

  // ---- bottoms: a knee-length faded sarong (or rolled up), old patched shorts, or rolled-up trousers
  const low = F.low || pick(['sarong', 'sarong', 'sarong', 'shorts', 'trousers']), lowC = F.lowC || pick(FADED);
  if (low === 'sarong') {
    const rolled = F.rolled !== undefined ? F.rolled : rnd() < 0.5;   // folded up for field work
    const h = rolled ? 0.1 : 0.14, y = rolled ? 0.32 : 0.3;
    body.add(mesh(new THREE.CylinderGeometry(0.14, 0.17, h, seg[0]), mat('#ffffff', { map: fabric(lowC, 'check') }), 0, y, 0));
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; body.add(box(0.03, 0.025, 0.01, mat(lowC), Math.sin(a) * 0.167, y - h / 2 - 0.006, Math.cos(a) * 0.167)).children.slice(-1)[0].rotation.y = a; } // frayed hem
    body.add(sph(0.032, mat(lowC), 0.06, 0.35, 0.13, 1.2, 0.8, 0.6));                       // the knot
  } else {
    const m = mat('#ffffff', { map: fabric(lowC, 'plain') }), long = low === 'trousers';
    parts.legs.forEach((leg) => {
      const len = long ? 0.19 : 0.09;
      leg.add(mesh(new THREE.CylinderGeometry(0.052, 0.056, len, 12), m, 0, -len / 2 + 0.01, 0));      // the trouser / shorts leg swings with the leg
      if (long) leg.add(mesh(new THREE.CylinderGeometry(0.057, 0.057, 0.03, 12), mat(lowC), 0, -0.18, 0)); // rolled-up cuff
    });
    body.add(mesh(new THREE.CylinderGeometry(0.135, 0.14, 0.08, seg[0]), m, 0, 0.29, 0));
  }

  // ---- top: an old shirt (a button missing), a worn T-shirt, or a vest with holes; frayed hem
  const top = F.top || pick(['shirt', 'shirt', 'tee', 'vest']), topC = F.topC ? F.topC : top === 'vest' ? pick(['#e6dfcc', '#d8d0bc', '#c9c2ad']) : pick(FADED);
  const topM = mat('#ffffff', { map: fabric(topC, 'plain') }), topPlain = mat(topC);
  body.add(sph(0.16, topM, 0, 0.42, 0, 1, 1, 0.9));
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; if (rnd() < 0.5) body.add(mesh(new THREE.ConeGeometry(0.015, 0.03, 4), topPlain, Math.sin(a) * 0.15, 0.3, Math.cos(a) * 0.135)).children.slice(-1)[0].rotation.x = Math.PI; } // ragged hem
  if (top === 'shirt') {
    [0.5, 0.43, 0.36].forEach((y, i) => { if (i !== 1 || rnd() < 0.4) body.add(sph(0.011, '#efe8d8', 0, y, 0.146)); });    // a button is missing
    [-1, 1].forEach((sd) => { const c = box(0.07, 0.02, 0.05, topPlain, sd * 0.04, 0.565, 0.09); c.rotation.z = sd * -0.5; body.add(c); }); // collar
  }
  if (top === 'vest') [[0.06, 0.45], [-0.05, 0.38]].forEach(([x, y]) => body.add(sph(0.014, skinDark, x, y, 0.15, 1, 1, 0.3))); // little holes
  // arms: sleeves for a shirt or T-shirt, bare for a vest
  parts.arms = [-1, 1].map((sd) => {
    const a = new THREE.Group(); a.position.set(sd * 0.15, 0.5, 0);
    if (top !== 'vest') { const sl = mesh(new THREE.CylinderGeometry(0.036, 0.032, top === 'tee' ? 0.1 : 0.17, 10), topPlain, sd * 0.02, top === 'tee' ? -0.04 : -0.08, 0); sl.rotation.z = sd * 0.25; a.add(sl); }
    const arm = mesh(new THREE.CylinderGeometry(0.029, 0.026, 0.2, 10), skin, sd * 0.03, -0.09, 0); arm.rotation.z = sd * 0.25; a.add(arm);
    a.add(sph(0.052, skin, sd * 0.06, -0.2, 0.01));                         // big hand
    a.userData.s = sd; body.add(a); return a;
  });

  // ---- head: big and round, big ears
  const head = new THREE.Group(); head.position.set(0, 0.8, 0); body.add(head); parts.head = head;
  head.add(sph(0.245, skin, 0, 0, 0, 1, 0.95, 0.95));
  [-1, 1].forEach((sd) => head.add(sph(0.068, skin, sd * 0.245, -0.01, 0, 0.5, 1, 0.75)));
  // hair (neutral styles only)
  const hair = F.hair || pick(['curly', 'curly', 'short', 'messy', 'shaved']);
  if (hair !== 'shaved') head.add(mesh(new THREE.SphereGeometry(0.255, seg[0], 10, 0, Math.PI * 2, 0, Math.PI / 2.15), hairM, 0, 0.02, -0.02));
  else head.add(mesh(new THREE.SphereGeometry(0.249, seg[0], 10, 0, Math.PI * 2, 0, Math.PI / 2.3), mat(grey ? '#9a9690' : '#2a221d', { transparent: true, opacity: 0.55 }), 0, 0.01, -0.01));
  if (hair === 'curly') {
    const n = full ? 90 : 34, big = full ? 0 : 0.02;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, up = rnd() * 1.45, rr = 0.265 + rnd() * 0.05;
      const x = Math.cos(a) * Math.sin(up) * rr, y = 0.05 + Math.cos(up) * rr * 1.12, z = Math.sin(a) * Math.sin(up) * rr - 0.02;
      if (z > 0.04 && y < 0.24) continue;                                      // keep the face clear
      head.add(sph(0.046 + big + rnd() * 0.028, hairM, x, y, z));
    }
  } else if (hair === 'messy') {
    for (let i = 0; i < (full ? 12 : 7); i++) { const a = rnd() * Math.PI * 2, x = Math.cos(a) * 0.14, z = Math.sin(a) * 0.14 - 0.03; const t = mesh(new THREE.ConeGeometry(0.045, 0.12, 6), hairM, x, 0.23, z); t.rotation.z = -x * 3; t.rotation.x = z * 3; head.add(t); }
  } else if (hair === 'short') {
    head.add(box(0.3, 0.05, 0.08, hairM, 0, 0.17, 0.17));                      // a straight fringe
  } else if (hair === 'wavy') {
    // thick wavy hair swept up and back, with a lifted wave at the front
    [[0, 0.25, 0.1, 0.13], [-0.1, 0.24, 0.06, 0.11], [0.1, 0.25, 0.05, 0.11], [0, 0.27, -0.04, 0.14], [-0.13, 0.2, -0.08, 0.11], [0.13, 0.2, -0.08, 0.11], [0, 0.2, -0.16, 0.13], [-0.17, 0.12, 0.0, 0.08], [0.17, 0.12, 0.0, 0.08]]
      .forEach(([x, y, z, r]) => head.add(sph(r, hairM, x, y, z, 1.15, 0.6, 1)));
    head.add(sph(0.09, hairM, 0.04, 0.24, 0.16, 1.5, 0.55, 0.9));               // the wave over the forehead
  }
  // googly eyes (random sizes), eyebrows
  parts.pupils = [];
  const eyeA = 0.055 + rnd() * 0.025, eyeB = 0.055 + rnd() * 0.025, browTilt = (rnd() - 0.5) * 0.8;
  [[-1, eyeA, 0.02 + rnd() * 0.02], [1, eyeB, 0.02 + rnd() * 0.02]].forEach(([sd, r, y]) => {
    head.add(sph(r, '#ffffff', sd * 0.09, y, 0.2, 1, 1.1, 0.55));
    const p = sph(r * 0.5, '#1b1410', sd * 0.09, y, 0.226, 1, 1, 0.5); p.userData = { x: sd * 0.09, y, r }; parts.pupils.push(p); head.add(p);
    const b = box(0.075, 0.02, 0.02, hairM, sd * 0.095, y + r + 0.035, 0.212); b.rotation.z = sd * browTilt; head.add(b);
  });
  // glasses: round or square black frames, sometimes on random villagers too
  const glasses = F.glasses !== undefined ? F.glasses : (rnd() < 0.15 ? 1 + Math.floor(rnd() * 2) : 0);
  if (glasses) {
    const frame = mat('#141414'), gy = 0.035, gz = 0.235;
    [-1, 1].forEach((sd) => {
      const ring = glasses === 1 ? mesh(new THREE.TorusGeometry(0.068, 0.009, 6, 24), frame, sd * 0.09, gy, gz)
        : mesh(new THREE.TorusGeometry(0.075, 0.01, 4, 4), frame, sd * 0.09, gy, gz);
      if (glasses === 2) { ring.rotation.z = Math.PI / 4; ring.scale.set(1.1, 0.85, 1); }
      head.add(ring);
      head.add(mesh(new THREE.CircleGeometry(0.064, 20), mat('#cfe6f0', { transparent: true, opacity: 0.18 }), sd * 0.09, gy, gz + 0.002));     // the lens
      const arm = box(0.012, 0.012, 0.2, frame, sd * 0.16, gy + 0.01, gz - 0.11); head.add(arm);                                                // the arm to the ear
    });
    head.add(box(0.045, 0.01, 0.01, frame, 0, gy + 0.015, gz + 0.005));                                                                         // the bridge
  }
  head.add(sph(0.034, skinDark, 0, -0.05, 0.235));                              // a round nose
  // a funny mouth: a toothy grin, a buck tooth, a gap-toothed smile or a surprised "O"
  const mouthKind = F.mouth || pick(['grin', 'buck', 'gap', 'oh']);
  if (mouthKind === 'oh') head.add(sph(0.035, '#4a1414', 0, -0.12, 0.215, 1, 1.2, 0.4));
  else {
    const m = mesh(new THREE.SphereGeometry(0.075, seg[0], 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat('#5a1a1a'), 0, -0.105, 0.2); m.scale.set(1.25, 0.75, 0.55); m.rotation.x = -0.25; head.add(m);
    if (mouthKind === 'grin') for (let i = -2; i <= 2; i++) head.add(box(0.022, 0.028, 0.012, '#f6f0e2', i * 0.025, -0.118, 0.243 - Math.abs(i) * 0.008));
    if (mouthKind === 'buck') head.add(box(0.036, 0.034, 0.014, '#f6f0e2', 0.012, -0.12, 0.243));
    if (mouthKind === 'gap') [-0.03, 0.03].forEach((x) => head.add(box(0.026, 0.028, 0.012, '#f6f0e2', x, -0.118, 0.241)));
    if (mouthKind !== 'grin') head.add(sph(0.03, '#e8687a', 0, -0.155, 0.22, 1.3, 0.5, 0.5));
  }

  // ---- extras (sometimes): an old towel over the shoulder, a frayed straw hat, a head cloth, a woven bag
  const extra = F.extra || pick(['none', 'none', 'towel', 'hat', 'cloth', 'bag']);
  if (extra === 'towel') { const tc = pick(['#d8d0bc', '#8fa6c0', '#b0705e']); const t = mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 16), mat(tc), 0, 0.56, 0); t.rotation.x = Math.PI / 2; body.add(t); body.add(box(0.06, 0.16, 0.03, mat(tc), 0.08, 0.47, 0.13)); }
  if (extra === 'hat') {
    const st = mat('#c9a660'), h = new THREE.Group(); h.position.y = hair === 'curly' ? 0.31 : 0.2; h.rotation.z = (rnd() - 0.5) * 0.3;
    h.add(mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.022, seg[0]), st, 0, 0.04, 0)); h.add(mesh(new THREE.CylinderGeometry(0.19, 0.24, 0.13, seg[0]), st, 0, 0.11, 0));
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; h.add(mesh(new THREE.ConeGeometry(0.012, 0.05, 3), st, Math.cos(a) * 0.41, 0.03, Math.sin(a) * 0.41)); } // frayed straw edge
    head.add(h);
  }
  if (extra === 'cloth') { const cc = pick(['#e6dfcc', '#a86a5e', '#7f93a8']); const w = mesh(new THREE.TorusGeometry(0.235, 0.045, 8, seg[0]), mat(cc), 0, 0.13, -0.02); w.rotation.x = Math.PI / 2 - 0.15; head.add(w); head.add(sph(0.05, mat(cc), 0.2, 0.13, -0.12)); } // a cloth tied round the head for field work
  if (extra === 'bag') { const b = box(0.13, 0.15, 0.06, mat('#9a7a4a'), 0.21, 0.33, 0.02); b.rotation.z = 0.12; body.add(b); }

  parts.desc = [hair + ' hair', top, low, slippers ? 'slippers' : 'bare feet', extra, glasses ? 'glasses' : 'none'].filter((x) => x !== 'none').join(', ');
  return { body, parts };
};

// a whole number from any text (an outfit key or a name): the same text gives the same villager everywhere
VM.villagerSeed = (text) => { let h = 2166136261; for (const c of String(text)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return Math.abs(h) || 1; };

// named villagers with a fixed look (everyone else is random)
VM.VILLAGER_LOOKS = {
  // Damindu: big curly black hair, brown skin, a dark worn shirt, a faded blue checked sarong, a wide toothy grin
  damindu: { skin: '#a8714e', grey: false, hair: 'curly', top: 'shirt', topC: '#3a3b42', low: 'sarong', lowC: '#4a62a0', rolled: false, mouth: 'grin', extra: 'none', slippers: true },
};
