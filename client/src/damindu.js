// "Customise your Damindu" on the menu: a little turning 3D preview, 🎲 Shuffle, and ✏️ Customise (hair, skin,
// clothes, colours, extras, face, feet: never man or woman). The choice is VM.myDamindu (a look code), kept on this
// device, sent to the server when you join, and used for your villager in practice mode at once.

// three.js from the CDN, loaded once for the menu preview and the 3D village
let threeP = null;
VM.loadThree = () => threeP || (threeP = window.THREE ? Promise.resolve(window.THREE) : new Promise((res, rej) => {
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  s.onload = () => res(window.THREE); s.onerror = () => { threeP = null; rej(new Error('3D library did not load')); };
  document.head.appendChild(s);
}));

VM.myDamindu = (() => {
  try { const c = localStorage.getItem('sams-gama-damindu'); if (c && VM.lookToForce(c)) return c; } catch (e) { /* private mode */ }
  return VM.randomLook();
})();
try { localStorage.setItem('sams-gama-damindu', VM.myDamindu); } catch (e) { /* private mode */ }

window.addEventListener('load', () => {
  const box = document.getElementById('dam'); if (!box) return;
  const D = VM.DAMINDU, pic = document.getElementById('dam-pic'), rows = document.getElementById('dam-rows');
  const LABELS = ['Skin', 'Hair', 'Top', 'Top colour', 'Bottom', 'Bottom colour', 'Extra', 'Face', 'Feet', 'Glasses'];
  const nums = () => { const n = VM.myDamindu.split('.').map(Number); while (n.length < D.parts.length) n.push(0); return n; };
  const valueHtml = (i, n) => {
    const p = D.parts[i], item = D[p][n];
    if (p === 'skins' || p === 'colours') return '<i style="background:' + item + '"></i>';
    return item[item.length - 1];
  };
  // the rows of choices
  rows.innerHTML = LABELS.map((l, i) => '<div class="dam-row" data-i="' + i + '"><div class="dam-cell" style="flex:1"><b>' + l + '</b><div style="display:flex;align-items:center;gap:4px"><button type="button" data-d="-1" aria-label="Previous ' + l + '">◀</button><span class="dam-val"></span><button type="button" data-d="1" aria-label="Next ' + l + '">▶</button></div></div></div>').join('');
  const showRows = () => { const n = nums(); rows.querySelectorAll('.dam-row').forEach((r) => { r.querySelector('.dam-val').innerHTML = valueHtml(+r.dataset.i, n[+r.dataset.i]); }); };
  const set = (code) => {
    VM.myDamindu = code;
    try { localStorage.setItem('sams-gama-damindu', code); } catch (e) { /* private mode */ }
    showRows(); rebuild();
    if (VM.net && VM.net.room) VM.net.send('look', code);   // already in the village: everyone sees the new look
  };
  rows.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const i = +b.closest('.dam-row').dataset.i, n = nums(), len = D[D.parts[i]].length;
    n[i] = (n[i] + Number(b.dataset.d) + len) % len;
    set(n.join('.'));
    if (VM.sound) VM.sound.play('click');
  });
  document.getElementById('dam-shuffle').addEventListener('click', () => { set(VM.randomLook()); if (VM.sound) VM.sound.play('seat'); });
  const edit = document.getElementById('dam-edit');
  edit.addEventListener('click', () => { rows.hidden = !rows.hidden; edit.setAttribute('aria-expanded', rows.hidden ? 'false' : 'true'); });
  showRows();

  // ---- the little turning 3D preview (its own small renderer, freed as soon as the game starts)
  let renderer = null, scene = null, camera = null, cur = null, done = false;
  const help = document.getElementById('help');
  function rebuild() {
    if (!scene) return;
    if (cur) scene.remove(cur.body);
    cur = VM.buildVillager(VM.villagerSeed('L' + VM.myDamindu), 1, VM.lookToForce(VM.myDamindu));
    scene.add(cur.body);
  }
  function start() {
    try { renderer = new THREE.WebGLRenderer({ canvas: pic, antialias: true, alpha: true }); } catch (e) { pic.hidden = true; return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(pic.clientWidth || 96, pic.clientHeight || 112, false);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(30, (pic.clientWidth || 96) / (pic.clientHeight || 112), 0.1, 20);
    camera.position.set(0, 0.85, 2.55); camera.lookAt(0, 0.58, 0);
    scene.add(new THREE.HemisphereLight('#ffffff', '#9ccf7a', 0.9));
    const sun = new THREE.DirectionalLight('#fff4dc', 0.7); sun.position.set(2, 3, 3); scene.add(sun);
    rebuild();
    const frame = (now) => {
      if (done) return;
      if (help && help.hidden) { done = true; try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) { /* gone */ } return; } // the game started: free it
      if (cur) {
        const p = cur.parts;
        cur.body.rotation.y = Math.sin(now / 1800) * 0.7;
        cur.body.position.y = Math.abs(Math.sin(now / 380)) * 0.03;
        p.pupils.forEach((q, i) => { const d = q.userData; q.position.x = d.x + Math.sin(now / (170 + i * 60)) * d.r * 0.3; q.position.y = d.y + Math.cos(now / (230 + i * 40)) * d.r * 0.26; });
        p.arms.forEach((a) => { a.rotation.z = a.userData.s * (0.3 + Math.sin(now / 190) * 0.3); });
      }
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  // three.js comes from the CDN (the 3D village loads the same file later, from the cache)
  VM.loadThree().then(start).catch(() => { pic.hidden = true; });
});
