// Every picture in this prototype is drawn here with code, so no image files are needed yet.
// Pictures are drawn at 2-3 times their size and shown smaller, so they look smooth when zoomed in.
// Later, real artwork (PNG files in client/assets/) can replace any of these by using the same name.

(function () {
  VM.ART = 2;      // detail of buildings, trees and animals
  VM.CHAR_ART = 3; // detail of villagers

  // Repeatable random numbers, so the village looks the same every time.
  VM.rng = function (seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Make a colour lighter (amount > 0) or darker (amount < 0).
  VM.shade = function (hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
    return '#' + [n >> 16, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('');
  };

  // A canvas drawn at "scale" times the size, so the drawing code can use normal sizes.
  function canvas(scene, key, w, h, scale = VM.ART) {
    const tex = scene.textures.createCanvas(key, Math.round(w * scale), Math.round(h * scale));
    const ctx = tex.getContext();
    ctx.scale(scale, scale);
    return { tex, ctx };
  }
  function rect(ctx, color, x, y, w, h) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
  function ellipse(ctx, color, x, y, rx, ry, rot = 0) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill(); }
  function circle(ctx, color, x, y, r) { ellipse(ctx, color, x, y, r, r); }
  function rounded(ctx, color, x, y, w, h, r) { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }
  function poly(ctx, color, points) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.closePath(); ctx.fill();
  }
  function shadow(ctx, x, y, rx, ry) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx); ctx.translate(-x, -y);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  // Soft left-to-right shading: lit from the top left, like the reference renders.
  function sideShade(ctx, color, x0, x1, light = 0.2, dark = -0.25) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, VM.shade(color, light)); g.addColorStop(0.45, color); g.addColorStop(1, VM.shade(color, dark));
    return g;
  }
  function roundShade(ctx, color, cx, cy, r) {
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.15);
    g.addColorStop(0, VM.shade(color, 0.3)); g.addColorStop(0.5, color); g.addColorStop(1, VM.shade(color, -0.3));
    return g;
  }

  // ------------------------------------------------------------------ ground tiles (crisp, 1x)
  function drawTiles(scene) {
    const S = VM.TILE, T = VM.T, r = VM.rng(7);
    const { tex, ctx } = canvas(scene, 'tiles', S * VM.TILE_COUNT, S, 1);
    const at = (i) => i * S;
    const speckle = (i, color, n, w = 2, h = 2) => {
      for (let k = 0; k < n; k++) rect(ctx, color, at(i) + Math.floor(r() * (S - w)), Math.floor(r() * (S - h)), w, h);
    };
    const grass = (i, base) => { rect(ctx, base, at(i), 0, S, S); speckle(i, VM.shade(base, -0.1), 14); speckle(i, VM.shade(base, 0.1), 8); };

    grass(T.GRASS, '#6fae46');
    grass(T.GRASS2, '#72b148');
    for (let k = 0; k < 5; k++) { const x = at(T.GRASS2) + 3 + Math.floor(r() * 26), y = 4 + Math.floor(r() * 24); rect(ctx, '#558f35', x, y, 1, 3); rect(ctx, '#558f35', x + 2, y + 1, 1, 2); }
    grass(T.FLOWERS, '#6fae46');
    ['#fff6d8', '#ffd54a', '#f59ab8', '#fff6d8'].forEach((c) => {
      const x = at(T.FLOWERS) + 3 + Math.floor(r() * 25), y = 3 + Math.floor(r() * 25);
      rect(ctx, c, x - 1, y, 3, 1); rect(ctx, c, x, y - 1, 1, 3); rect(ctx, '#e0a020', x, y, 1, 1);
    });

    rect(ctx, '#d4a96a', at(T.PATH), 0, S, S); speckle(T.PATH, '#c49a5e', 12); speckle(T.PATH, '#e0bb84', 8); speckle(T.PATH, '#a89070', 4, 3, 2);

    rect(ctx, '#7fbf45', at(T.PADDY), 0, S, S);
    speckle(T.PADDY, '#9fd6d0', 5, 4, 1);
    for (let y = 2; y < S; y += 6) for (let x = 1; x < S; x += 5) { rect(ctx, '#4a8f22', at(T.PADDY) + x, y, 1, 4); rect(ctx, '#62aa2e', at(T.PADDY) + x + 1, y + 1, 1, 3); rect(ctx, '#a5d655', at(T.PADDY) + x + 2, y, 1, 2); }

    rect(ctx, '#a48a52', at(T.BUND), 0, S, S); speckle(T.BUND, '#86a843', 18); speckle(T.BUND, '#bba068', 6);

    rect(ctx, '#2f9bd0', at(T.WATER), 0, S, S); speckle(T.WATER, '#5cc0e8', 6, 6, 1); speckle(T.WATER, '#2384b8', 5, 5, 1);

    rect(ctx, '#2f9bd0', at(T.PLANKS), 0, S, S);
    rect(ctx, '#a8743e', at(T.PLANKS), 1, S, 30);
    for (let x = 0; x < S; x += 8) rect(ctx, '#7f522a', at(T.PLANKS) + x, 1, 1, 30);
    for (let y = 1; y < 31; y += 10) rect(ctx, '#bf8a50', at(T.PLANKS), y, S, 1);

    rect(ctx, '#e8d29a', at(T.SAND), 0, S, S); speckle(T.SAND, '#d6bd82', 14); speckle(T.SAND, '#f6e6bd', 8);

    rect(ctx, '#7a4e2d', at(T.GARDEN), 0, S, S);
    for (let y = 4; y < S; y += 8) rect(ctx, '#64401f', at(T.GARDEN), y + 3, S, 2);
    for (let y = 2; y < S; y += 8) for (let x = 3; x < S; x += 8) { circle(ctx, '#4f9a3a', at(T.GARDEN) + x + 1.5, y + 1.5, 2.5); rect(ctx, '#7cc152', at(T.GARDEN) + x + 1, y, 1, 1); }

    rect(ctx, '#c8b25e', at(T.STUBBLE), 0, S, S);
    for (let y = 2; y < S; y += 6) for (let x = 1; x < S; x += 5) rect(ctx, '#9a8236', at(T.STUBBLE) + x, y + 2, 1, 2);

    rect(ctx, '#e2c48e', at(T.PLAZA), 0, S, S); speckle(T.PLAZA, '#d2b27a', 10); speckle(T.PLAZA, '#efd7a8', 10);

    grass(T.FOREST, '#4f8a35'); speckle(T.FOREST, '#3b6e27', 10, 3, 2); speckle(T.FOREST, '#7a5a34', 3, 2, 1);

    tex.refresh();
  }

  // ------------------------------------------------------------------ villagers
  // Soft, rounded "bean" villagers from the owner's character sheet.
  // 9 frames in one row: facing down x3, up x3, side x3 (standing, step, other step).
  const CW = 28, CH = 40;
  VM.CHAR_W = CW; VM.CHAR_H = CH;
  const SKIN = '#f1d3aa', HAIR = '#1d1714', SHOE = '#3e2c22';

  // The bean-shaped body: round head on top, slightly wider at the bottom.
  function bodyPath(ctx, half) {
    ctx.beginPath();
    ctx.moveTo(14 - half, 13);
    ctx.arc(14, 13, half, Math.PI, 0);
    ctx.bezierCurveTo(14 + half + 0.6, 22, 14 + half + 1, 30, 14 + half - 0.5, 33);
    ctx.quadraticCurveTo(14 + half - 1.5, 36.2, 14 + half - 5, 36.2);
    ctx.lineTo(14 - half + 5, 36.2);
    ctx.quadraticCurveTo(14 - half + 1.5, 36.2, 14 - half + 0.5, 33);
    ctx.bezierCurveTo(14 - half - 1, 30, 14 - half - 0.6, 22, 14 - half, 13);
    ctx.closePath();
  }

  function flower(ctx, x, y, color) {
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; circle(ctx, color, x + Math.cos(a) * 1.1, y + Math.sin(a) * 1.1, 0.9); }
    circle(ctx, '#f2c230', x, y, 0.6);
  }

  function drawVillager(ctx, o, dir, step) {
    const sw = step === 1 ? 1 : step === 2 ? -1 : 0; // walking stride
    const side = dir === 'side', back = dir === 'up';
    const half = side ? 7 : 8;
    const L = 14 - half, R = 14 + half;

    shadow(ctx, 14, 37.6, 10, 2.8);

    // feet
    const foot = (x, y) => { ellipse(ctx, roundShade(ctx, SHOE, x, y, 3.4), x, y, 3.5, 2.2); };
    if (side) { foot(12 + sw * 2, 36.6); foot(16.5 - sw * 2, 36.6); }
    else { foot(10.2, sw > 0 ? 35.8 : 36.6); foot(17.8, sw < 0 ? 35.8 : 36.6); }

    // hair bun sits behind the head
    if (o.kind === 'woman' && !back) {
      const bx = side ? L - 0.5 : L - 1.5;
      circle(ctx, roundShade(ctx, HAIR, bx, 11, 4), bx, 11, 4);
      flower(ctx, bx - 1.5, 14.5, o.flower || '#fff7e8');
      flower(ctx, bx + 1.2, 15.6, VM.shade(o.flower || '#fff7e8', -0.05));
    }

    // body with soft shading
    bodyPath(ctx, half);
    const skin = ctx.createRadialGradient(11, 10, 1, 14, 18, 24);
    skin.addColorStop(0, '#fdebd2'); skin.addColorStop(0.5, SKIN); skin.addColorStop(1, '#cfa77a');
    ctx.fillStyle = skin; ctx.fill();

    ctx.save();
    bodyPath(ctx, half); ctx.clip();
    if (o.kind === 'woman') drawSaree(ctx, o, dir, L, R); else drawShirtSarong(ctx, o, dir, L, R);
    if (o.kind === 'woman') drawHair(ctx, dir, L, R);
    // a soft darker edge on the right side for roundness
    const edge = ctx.createLinearGradient(R - 4, 0, R + 1, 0);
    edge.addColorStop(0, 'rgba(60,30,10,0)'); edge.addColorStop(1, 'rgba(60,30,10,0.22)');
    ctx.fillStyle = edge; ctx.fillRect(R - 4, 0, 6, 40);
    ctx.restore();

    bodyPath(ctx, half);
    ctx.strokeStyle = 'rgba(70,45,30,0.35)'; ctx.lineWidth = 0.5; ctx.stroke();

    // eyes: tall black ovals with a tiny shine
    if (!back) {
      const eye = (x, rx) => { ellipse(ctx, '#121212', x, 15, rx, 2.9); circle(ctx, 'rgba(255,255,255,0.75)', x - 0.5, 13.9, 0.45); };
      if (side) { eye(16.2, 1.5); eye(20.2, 1.35); } else { eye(11, 1.7); eye(17, 1.7); }
    }

    // stubby arms (sleeve colour at the top for shirts)
    const arm = (x, y) => {
      ellipse(ctx, roundShade(ctx, SKIN, x, y, 4), x, y, 2.9, 4.3);
      if (o.kind === 'man') { ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, 2.9, 4.3, 0, 0, Math.PI * 2); ctx.clip(); rect(ctx, sideShade(ctx, o.top, x - 3, x + 3), x - 3, y - 5, 6, 3.6); ctx.restore(); }
    };
    if (side) arm(14 + sw * 2, 25.5);
    else { arm(L - 1.6, 25 + sw * 0.8); arm(R + 1.6, 25 - sw * 0.8); }

    if (o.extra === 'towel') drawTowel(ctx, o, dir, L, R);
    if (o.extra === 'bag') drawBag(ctx, o, dir, L, R);
    if (o.extra === 'hat') drawHat(ctx, o, side);
    if (o.extra === 'cap') drawCap(ctx, o, dir, half);
  }

  function pattern(ctx, o, color, x, y, w, h) {
    if (o.pattern === 'check') {
      ctx.globalAlpha = 0.4;
      for (let yy = y + 1.5; yy < y + h; yy += 2.6) rect(ctx, color, x, yy, w, 0.5);
      for (let xx = x + 1.5; xx < x + w; xx += 3.2) rect(ctx, color, xx, y, 0.5, h);
      ctx.globalAlpha = 1;
    } else if (o.pattern === 'floral') {
      ctx.globalAlpha = 0.75;
      let i = 0;
      for (let yy = y + 1.5; yy < y + h; yy += 3.2) for (let xx = x + (i++ % 2 ? 1 : 2.6); xx < x + w; xx += 3.4) {
        circle(ctx, color, xx, yy, 0.9); circle(ctx, color, xx + 0.9, yy + 0.6, 0.7);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawShirtSarong(ctx, o, dir, L, R) {
    const side = dir === 'side', back = dir === 'up';
    rect(ctx, sideShade(ctx, o.top, L, R), L - 1, 19, R - L + 2, 11);
    if (o.pattern === 'floral') pattern(ctx, o, VM.shade(o.top, 0.45), L, 19, R - L, 11);
    if (!back && !side) {
      const collar = o.collar || VM.shade(o.top, 0.25);
      poly(ctx, collar, [9, 18.6, 14, 22.6, 13.3, 18.6]); poly(ctx, collar, [19, 18.6, 14, 22.6, 14.7, 18.6]);
      rect(ctx, 'rgba(0,0,0,0.12)', 14, 22.5, 0.6, 7.5);
      circle(ctx, VM.shade(o.top, -0.3), 15.2, 24.5, 0.45); circle(ctx, VM.shade(o.top, -0.3), 15.2, 27.2, 0.45);
    }
    if (side) { poly(ctx, o.collar || VM.shade(o.top, 0.25), [12, 18.6, 18, 18.6, 16.5, 21]); }
    const s = o.bottom;
    rect(ctx, sideShade(ctx, s, L, R), L - 1, 29.5, R - L + 2, 8);
    if (o.pattern === 'check') pattern(ctx, o, VM.shade(s, 0.6), L, 29.5, R - L, 8);
    rect(ctx, 'rgba(0,0,0,0.18)', L - 1, 29.5, R - L + 2, 0.8); // waist fold
    rect(ctx, VM.shade(s, 0.35), L - 1, 34.2, R - L + 2, 0.6);  // hem stripe
    if (!back) rect(ctx, 'rgba(0,0,0,0.16)', side ? R - 4 : 15.6, 30, 0.6, 7);
  }

  function drawSaree(ctx, o, dir, L, R) {
    const side = dir === 'side', back = dir === 'up';
    rect(ctx, sideShade(ctx, o.top, L, R), L - 1, 17.5, R - L + 2, 6);           // blouse
    rect(ctx, sideShade(ctx, o.bottom, L, R, 0.15, -0.2), L - 1, 23, R - L + 2, 15); // saree
    if (o.pattern === 'floral') pattern(ctx, o, VM.shade(o.trim, -0.05), L, 23, R - L, 15);
    rect(ctx, o.trim, L - 1, 33.4, R - L + 2, 1.4);
    if (!back && !side) for (let x = L + 3; x < R - 5; x += 2.2) rect(ctx, 'rgba(0,0,0,0.08)', x, 27, 0.6, 10);
    // pallu: the end of the saree over the left shoulder, crossing the body
    const pallu = VM.shade(o.bottom, 0.12);
    ctx.fillStyle = pallu; ctx.beginPath();
    if (back) { ctx.moveTo(L, 17); ctx.lineTo(L + 7, 17); ctx.lineTo(R + 1, 31); ctx.lineTo(R + 1, 37); ctx.lineTo(R - 4, 37); }
    else if (side) { ctx.moveTo(L + 4, 17); ctx.lineTo(L + 10, 17); ctx.lineTo(L + 8, 31); ctx.lineTo(L + 2, 31); }
    else { ctx.moveTo(R + 1, 16.5); ctx.lineTo(R + 1, 22.5); ctx.lineTo(L - 1, 32); ctx.lineTo(L - 1, 26); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = o.trim; ctx.lineWidth = 0.9; ctx.beginPath();
    if (back) { ctx.moveTo(L + 7, 17); ctx.lineTo(R + 1, 31); }
    else if (side) { ctx.moveTo(L + 10, 17); ctx.lineTo(L + 8, 31); }
    else { ctx.moveTo(R + 1, 22.4); ctx.lineTo(L - 1, 31.9); ctx.moveTo(R + 1, 17); ctx.lineTo(L - 1, 26.4); }
    ctx.stroke();
  }

  function drawHair(ctx, dir, L, R) {
    const g = ctx.createRadialGradient(11, 6, 0.5, 14, 9, 11);
    g.addColorStop(0, '#5a4a40'); g.addColorStop(0.35, '#2a211c'); g.addColorStop(1, HAIR);
    ctx.fillStyle = g;
    ctx.beginPath();
    if (dir === 'up') { ctx.rect(L - 1, 4, R - L + 2, 13); }
    else if (dir === 'side') { ctx.ellipse(13, 8, 9, 5, 0, 0, Math.PI * 2); ctx.rect(L - 1, 8, 5, 8); }
    else { ctx.ellipse(14, 7.6, 9.5, 5.2, 0, 0, Math.PI * 2); ctx.rect(L - 1, 8, 2.6, 7); ctx.rect(R - 1.6, 8, 2.6, 7); }
    ctx.fill();
    if (dir === 'up') { circle(ctx, roundShade(ctx, HAIR, 14, 12, 4.5), 14, 12, 4.5); flower(ctx, 11, 12, '#fff7e8'); flower(ctx, 17, 11.2, '#f6c1d0'); }
  }

  function drawTowel(ctx, o, dir, L, R) {
    const c = o.extraColor;
    const x = dir === 'up' ? R - 4.5 : dir === 'side' ? L + 3 : L - 1.2;
    ctx.save();
    rounded(ctx, '#f7f5ef', x, 17.5, 5.2, 11, 1.4);
    ctx.beginPath(); ctx.roundRect(x, 17.5, 5.2, 11, 1.4); ctx.clip();
    for (let yy = 18.5; yy < 29; yy += 2.2) rect(ctx, c, x, yy, 5.2, 0.7);
    for (let xx = x + 1; xx < x + 5.2; xx += 2) rect(ctx, c, xx, 17.5, 0.6, 11);
    rect(ctx, 'rgba(0,0,0,0.12)', x + 4, 17.5, 1.2, 11);
    ctx.restore();
  }

  function drawBag(ctx, o, dir, L, R) {
    const c = o.extraColor;
    ctx.strokeStyle = VM.shade(c, -0.25); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(dir === 'up' ? L + 2 : R - 1.5, 18.5); ctx.lineTo(dir === 'up' ? R - 2 : L + 3, 29); ctx.stroke();
    if (dir === 'up') return;
    rounded(ctx, sideShade(ctx, c, L - 3, L + 6), L - 3, 27.5, 8.5, 7, 1.8);
    rounded(ctx, VM.shade(c, -0.15), L - 3, 27.5, 8.5, 3, 1.5);
    circle(ctx, '#d9b25f', L + 1.2, 30.3, 0.6);
  }

  function drawHat(ctx, o) {
    const c = o.extraColor;
    ellipse(ctx, sideShade(ctx, c, 2, 26, 0.25, -0.2), 14, 9.6, 12, 3.1);
    rounded(ctx, sideShade(ctx, c, 7, 21), 7.5, 0.8, 13, 9.4, [6, 6, 2, 2]);
    rect(ctx, VM.shade(c, -0.3), 7.5, 7.2, 13, 1.2);
    ctx.globalAlpha = 0.25;
    for (let x = 9; x < 20; x += 2.2) rect(ctx, VM.shade(c, -0.4), x, 1.5, 0.5, 5.6);
    ctx.globalAlpha = 1;
  }

  function drawCap(ctx, o, dir, half) {
    const c = o.extraColor;
    ctx.beginPath(); ctx.arc(14, 12, half + 0.6, Math.PI, 0); ctx.closePath();
    ctx.fillStyle = sideShade(ctx, c, 14 - half, 14 + half, 0.3, -0.25); ctx.fill();
    circle(ctx, VM.shade(c, 0.2), 14, 3.6, 0.8);
    if (dir === 'side') ellipse(ctx, VM.shade(c, -0.2), 22.2, 11.6, 5, 1.6);
    else if (dir === 'down') ellipse(ctx, VM.shade(c, -0.2), 14, 12, 8, 1.9);
  }

  function drawVillagerSheet(scene, o) {
    const { tex, ctx } = canvas(scene, 'char-' + o.key, CW * 9, CH, VM.CHAR_ART);
    ['down', 'up', 'side'].forEach((dir, d) => {
      for (let step = 0; step < 3; step++) {
        const f = d * 3 + step;
        ctx.save(); ctx.translate(f * CW, 0); drawVillager(ctx, o, dir, step); ctx.restore();
        tex.add(f, 0, f * CW * VM.CHAR_ART, 0, CW * VM.CHAR_ART, CH * VM.CHAR_ART);
      }
    });
    tex.refresh();
  }

  // ------------------------------------------------------------------ buildings and objects
  function roof(ctx, color, x, y, w, h, overhang) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, VM.shade(color, 0.15)); g.addColorStop(1, VM.shade(color, -0.15));
    poly(ctx, g, [x - overhang, y + h, x + w + overhang, y + h, x + w - 14, y, x + 14, y]);
    for (let yy = y + 5; yy < y + h; yy += 5) {
      const grow = ((yy - y) / h) * (14 + overhang); // the roof gets wider towards the bottom
      rect(ctx, VM.shade(color, -0.22), x + 14 - grow, yy, w - 28 + grow * 2, 0.8);
    }
    rect(ctx, VM.shade(color, -0.35), x + 12, y - 2, w - 24, 4);
    rect(ctx, 'rgba(0,0,0,0.18)', x - overhang, y + h - 1.5, w + overhang * 2, 1.5);
  }

  // A family house. Every player's house has the same shape; the roof and door show the owner's colour.
  function house(scene, key, roofColor, doorColor) {
    const { tex, ctx } = canvas(scene, key, 100, 92);
    shadow(ctx, 50, 87, 48, 6);
    rect(ctx, '#f3e8d0', 14, 46, 72, 38);
    rect(ctx, 'rgba(120,90,60,0.14)', 70, 46, 16, 38);
    rect(ctx, '#9b7a5a', 12, 82, 76, 5);
    rounded(ctx, doorColor, 42, 56, 16, 28, [3, 3, 0, 0]);
    rect(ctx, 'rgba(255,255,255,0.18)', 44, 58, 5, 24); circle(ctx, '#e6c25a', 55, 71, 1.2);
    [[20, 56], [66, 56]].forEach(([x, y]) => {
      rounded(ctx, doorColor, x - 1.5, y - 1.5, 17, 15, 2); rect(ctx, '#33261c', x, y, 14, 12);
      rect(ctx, '#8fc3e0', x + 1, y + 1, 5, 4); rect(ctx, doorColor, x + 6, y, 2, 12);
    });
    roof(ctx, roofColor, 10, 14, 80, 34, 6);
    tex.refresh();
  }

  function thatch(ctx, x, y, w, h, color) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, VM.shade(color, 0.15)); g.addColorStop(1, VM.shade(color, -0.12));
    poly(ctx, g, [x, y + h, x + w, y + h, x + w - 12, y, x + 12, y]);
    for (let yy = y + 4; yy < y + h; yy += 4) rect(ctx, VM.shade(color, -0.18), x + 6, yy, w - 12, 0.8);
    for (let xx = x + 4; xx < x + w - 4; xx += 3) rect(ctx, VM.shade(color, -0.25), xx, y + h - 2, 0.8, 3);
  }

  function drawObjects(scene) {
    let c;

    // houses: one per player colour, plus a plain one for empty houses
    VM.PLAYER_COLORS.forEach((p) => house(scene, 'house-' + p.key, p.roof || p.hex, VM.shade(p.hex, -0.15)));
    house(scene, 'house-empty', '#9a8f80', '#6b5d4c');

    // cowshed: open thatched shed with hay
    c = canvas(scene, 'cowshed', 140, 96);
    shadow(c.ctx, 70, 91, 66, 6);
    rect(c.ctx, '#5a3b22', 16, 44, 108, 44);
    rect(c.ctx, '#d9b44a', 22, 66, 40, 22); rect(c.ctx, '#c49e38', 22, 66, 40, 3);
    rounded(c.ctx, '#8a8a8a', 82, 76, 18, 10, 2); rect(c.ctx, '#bfbfbf', 84, 74, 14, 3);
    [14, 66, 120].forEach((x) => rect(c.ctx, '#6b4322', x, 40, 6, 50));
    thatch(c.ctx, 2, 10, 136, 36, '#c9a456');
    c.tex.refresh();

    // granary: raised storage house with sacks
    c = canvas(scene, 'granary', 110, 104);
    shadow(c.ctx, 55, 99, 52, 6);
    [16, 50, 86].forEach((x) => rect(c.ctx, '#5a3b22', x, 76, 8, 24));
    rect(c.ctx, '#9a6a3a', 10, 40, 90, 40);
    for (let x = 10; x < 100; x += 9) rect(c.ctx, '#7f552d', x, 40, 1, 40);
    rect(c.ctx, '#5a3b22', 44, 52, 22, 28);
    [[14, 88], [26, 90], [76, 90], [88, 88]].forEach(([x, y]) => { rounded(c.ctx, '#e3cf9c', x - 6, y - 8, 12, 12, 4); rect(c.ctx, '#b89d62', x - 6, y - 5, 12, 1); });
    roof(c.ctx, '#8d4a2c', 6, 10, 98, 32, 6);
    c.tex.refresh();

    // stupa on a terraced platform
    c = canvas(scene, 'stupa', 150, 156);
    shadow(c.ctx, 75, 149, 70, 7);
    rect(c.ctx, '#d6cfc2', 8, 128, 134, 22); rect(c.ctx, '#c4bcae', 8, 146, 134, 4);
    rect(c.ctx, '#c4bcae', 62, 132, 26, 18); for (let y = 134; y < 150; y += 4) rect(c.ctx, '#e8e2d6', 62, y, 26, 2);
    rect(c.ctx, '#ebe6dc', 20, 116, 110, 12); rect(c.ctx, '#f3efe7', 30, 106, 90, 10);
    const dome = c.ctx.createRadialGradient(60, 75, 4, 75, 95, 52);
    dome.addColorStop(0, '#ffffff'); dome.addColorStop(0.6, '#f4f1ea'); dome.addColorStop(1, '#d8d2c6');
    c.ctx.beginPath(); c.ctx.ellipse(75, 108, 40, 48, 0, Math.PI, 0); c.ctx.fillStyle = dome; c.ctx.fill();
    rect(c.ctx, '#e3bd4e', 36, 104, 78, 3);
    rect(c.ctx, '#f1ede4', 65, 52, 20, 10); rect(c.ctx, '#e3bd4e', 65, 52, 20, 2);
    poly(c.ctx, '#e3bd4e', [67, 52, 83, 52, 75, 14]);
    for (let y = 44; y > 20; y -= 6) rect(c.ctx, '#c79d33', 75 - (y - 14) * 8 / 38, y, (y - 14) * 16 / 38, 1.5);
    circle(c.ctx, '#ffe58a', 75, 12, 3);
    c.tex.refresh();

    // the big village tree with a round stone seat
    c = canvas(scene, 'bigtree', 160, 150);
    shadow(c.ctx, 80, 138, 74, 10);
    ellipse(c.ctx, '#b8ad9a', 80, 136, 44, 10); ellipse(c.ctx, '#d2c8b4', 80, 133, 40, 8);
    rect(c.ctx, '#6b4a2e', 70, 80, 20, 54); rect(c.ctx, '#5a3d25', 84, 80, 6, 54);
    poly(c.ctx, '#6b4a2e', [70, 126, 58, 136, 72, 134]); poly(c.ctx, '#6b4a2e', [90, 126, 104, 136, 88, 134]);
    [[80, 52, 52, '#3b7a30'], [44, 66, 32, '#3f8434'], [116, 66, 32, '#3f8434'], [62, 38, 32, '#4f953f'], [100, 40, 30, '#4f953f'], [80, 28, 28, '#5fa64a']]
      .forEach(([x, y, r, col]) => circle(c.ctx, roundShade(c.ctx, col, x, y, r), x, y, r));
    const lr = VM.rng(11);
    for (let i = 0; i < 70; i++) ellipse(c.ctx, lr() > 0.5 ? 'rgba(130,200,100,0.7)' : 'rgba(30,80,30,0.5)', 20 + lr() * 120, 6 + lr() * 86, 2, 1.3);
    // Buddhist flag colours on a string
    c.ctx.strokeStyle = '#6b5a4a'; c.ctx.lineWidth = 0.7; c.ctx.beginPath(); c.ctx.moveTo(14, 92); c.ctx.quadraticCurveTo(80, 108, 146, 92); c.ctx.stroke();
    ['#2a5bd7', '#f2c230', '#d63a2f', '#ffffff', '#f08a24'].forEach((col, i, all) => {
      for (let k = i; k < 18; k += all.length) { const t = (k + 0.5) / 18, x = 14 + t * 132, y = 92 + Math.sin(t * Math.PI) * 8; rect(c.ctx, col, x - 2, y, 4, 5); }
    });
    c.tex.refresh();

    // well
    c = canvas(scene, 'well', 48, 46);
    shadow(c.ctx, 24, 41, 22, 4);
    rect(c.ctx, '#8b877e', 6, 24, 36, 12); ellipse(c.ctx, '#8b877e', 24, 36, 18, 6);
    for (let x = 8; x < 40; x += 7) rect(c.ctx, '#76726a', x, 26, 1, 12);
    ellipse(c.ctx, '#aaa69c', 24, 24, 18, 7); ellipse(c.ctx, '#1f3b52', 24, 24, 12, 4.5);
    rect(c.ctx, '#6b4322', 4, 4, 3, 22); rect(c.ctx, '#6b4322', 41, 4, 3, 22); rect(c.ctx, '#7f552d', 3, 3, 42, 3);
    rect(c.ctx, '#d9c9a3', 23.5, 6, 0.8, 10); rounded(c.ctx, '#8f8f8f', 20, 15, 7, 5, 1); rect(c.ctx, '#bdbdbd', 20, 15, 7, 1);
    c.tex.refresh();

    // workshop: open shed with a workbench and tools
    c = canvas(scene, 'workshop', 124, 92);
    shadow(c.ctx, 62, 87, 60, 6);
    rect(c.ctx, '#4f3520', 12, 42, 100, 42);
    rect(c.ctx, '#9a6a3a', 22, 62, 50, 6); rect(c.ctx, '#6b4322', 26, 68, 4, 14); rect(c.ctx, '#6b4322', 64, 68, 4, 14);
    rect(c.ctx, '#b0b0b0', 30, 56, 2, 6); rect(c.ctx, '#8a5a32', 38, 58, 14, 3); rect(c.ctx, '#c9c9c9', 50, 55, 6, 4);
    c.ctx.strokeStyle = '#c9c9c9'; c.ctx.lineWidth = 2; c.ctx.beginPath(); c.ctx.arc(92, 54, 7, Math.PI * 1.1, Math.PI * 1.9); c.ctx.stroke();
    rect(c.ctx, '#8a5a32', 91, 54, 2, 12);
    [[80, 82], [98, 80]].forEach(([x, y]) => rounded(c.ctx, '#a8743e', x - 6, y - 8, 12, 10, 2));
    [10, 58, 108].forEach((x) => rect(c.ctx, '#6b4322', x, 38, 6, 48));
    roof(c.ctx, '#7a5236', 6, 12, 112, 30, 4);
    c.tex.refresh();

    // market stalls with striped awnings
    [['stall-red', '#d8433a'], ['stall-blue', '#3a72d8']].forEach(([key, col]) => {
      c = canvas(scene, key, 68, 64);
      shadow(c.ctx, 34, 59, 32, 5);
      rect(c.ctx, '#8a5a32', 8, 38, 52, 18); rect(c.ctx, '#a8743e', 6, 36, 56, 4);
      [[16, '#f2c230'], [28, '#d63a2f'], [40, '#7cc152'], [52, '#f08a24']].forEach(([x, f]) => circle(c.ctx, roundShade(c.ctx, f, x, 33, 4), x, 33, 4));
      rect(c.ctx, '#6b4322', 6, 14, 3, 44); rect(c.ctx, '#6b4322', 59, 14, 3, 44);
      for (let i = 0; i < 8; i++) poly(c.ctx, i % 2 ? '#fbf6ea' : col, [2 + i * 8, 6, 10 + i * 8, 6, 12 + i * 8, 22, 4 + i * 8, 22]);
      for (let i = 0; i < 8; i++) { c.ctx.beginPath(); c.ctx.arc(8 + i * 8, 22, 4, 0, Math.PI); c.ctx.fillStyle = i % 2 ? '#fbf6ea' : col; c.ctx.fill(); }
      c.tex.refresh();
    });

    // village shop (kade)
    c = canvas(scene, 'kade', 108, 94);
    shadow(c.ctx, 54, 89, 52, 6);
    rect(c.ctx, '#e9d9a8', 12, 44, 84, 42); rect(c.ctx, '#d8c590', 80, 44, 16, 42);
    rect(c.ctx, '#3a2a1e', 20, 52, 54, 20);
    for (let x = 22; x < 72; x += 7) { rounded(c.ctx, ['#f2c230', '#d63a2f', '#7cc152', '#ffffff', '#f08a24'][(x / 7) % 5 | 0], x, 56, 5, 6, 1); rect(c.ctx, '#c9b07a', x, 64, 5, 6); }
    rect(c.ctx, '#8a5a32', 16, 72, 62, 12); rect(c.ctx, '#a8743e', 14, 70, 66, 3);
    rect(c.ctx, '#5a3b22', 80, 56, 12, 28);
    poly(c.ctx, '#9aa3a8', [2, 46, 106, 46, 96, 18, 12, 18]);
    for (let x = 8; x < 104; x += 5) rect(c.ctx, '#b9c1c5', x, 19, 2, 27);
    rounded(c.ctx, '#1f6f5c', 30, 4, 48, 14, 2); rect(c.ctx, '#f6efe0', 32, 6, 44, 10);
    c.ctx.fillStyle = '#1f6f5c'; c.ctx.font = 'bold 9px Arial, sans-serif'; c.ctx.textAlign = 'center'; c.ctx.fillText('KADE', 54, 14.5);
    c.tex.refresh();

    // cooking hut with a clay pot over a fire
    c = canvas(scene, 'cookhut', 104, 90);
    shadow(c.ctx, 52, 85, 50, 6);
    rect(c.ctx, '#c89a62', 18, 46, 68, 36); rect(c.ctx, '#a87a46', 18, 46, 68, 4);
    rect(c.ctx, '#3a2a1e', 30, 56, 18, 26);
    [[64, 74], [72, 70], [56, 70]].forEach(([x, y]) => rect(c.ctx, '#5a3b22', x, y, 10, 3));
    circle(c.ctx, '#f08a24', 66, 72, 5); circle(c.ctx, '#ffd25a', 66, 73, 2.5);
    ellipse(c.ctx, roundShade(c.ctx, '#8a4a2a', 66, 64, 9), 66, 64, 9, 7); rect(c.ctx, '#6b3520', 59, 57, 14, 3);
    thatch(c.ctx, 6, 12, 92, 38, '#b8934a');
    c.tex.refresh();

    // chicken coop
    c = canvas(scene, 'coop', 72, 58);
    shadow(c.ctx, 36, 53, 34, 4);
    rect(c.ctx, '#a8743e', 12, 26, 48, 24); rect(c.ctx, '#3a2a1e', 28, 36, 14, 14);
    rect(c.ctx, '#e3cf9c', 46, 36, 10, 6);
    thatch(c.ctx, 4, 6, 64, 22, '#c9a456');
    c.tex.refresh();

    // fences (horizontal piece and vertical piece)
    c = canvas(scene, 'fence-h', 32, 16);
    rect(c.ctx, '#7f552d', 0, 5, 32, 2); rect(c.ctx, '#7f552d', 0, 10, 32, 2);
    rounded(c.ctx, '#6b4322', 2, 2, 3, 13, 1); rounded(c.ctx, '#6b4322', 18, 2, 3, 13, 1);
    c.tex.refresh();
    c = canvas(scene, 'fence-v', 10, 34);
    rect(c.ctx, '#7f552d', 4, 0, 2, 32); rounded(c.ctx, '#6b4322', 3, 2, 4, 6, 1); rounded(c.ctx, '#6b4322', 3, 18, 4, 6, 1);
    c.tex.refresh();

    // coconut palm
    c = canvas(scene, 'palm', 60, 100);
    shadow(c.ctx, 30, 95, 14, 4);
    for (let i = 0; i < 18; i++) { const t = i / 17, x = 28 + Math.sin(t * 1.6) * 6, y = 96 - t * 66; rounded(c.ctx, i % 2 ? '#8a6a44' : '#76583a', x - 3, y - 4, 6, 5, 1.5); }
    c.ctx.lineCap = 'round';
    [[-1, 0.2], [-0.8, -0.5], [-0.2, -0.9], [0.4, -0.85], [0.9, -0.4], [1, 0.25], [0.2, 0.5], [-0.5, 0.45]].forEach(([dx, dy]) => {
      c.ctx.strokeStyle = '#2f7a2e'; c.ctx.lineWidth = 5; c.ctx.beginPath(); c.ctx.moveTo(34, 30); c.ctx.quadraticCurveTo(34 + dx * 16, 30 + dy * 16 - 6, 34 + dx * 26, 30 + dy * 22 + 6); c.ctx.stroke();
      c.ctx.strokeStyle = '#59ad44'; c.ctx.lineWidth = 2; c.ctx.stroke();
    });
    [[31, 33], [36, 34], [33, 37]].forEach(([x, y]) => circle(c.ctx, roundShade(c.ctx, '#7a5a2a', x, y, 3), x, y, 3));
    c.tex.refresh();

    // forest trees (two shades)
    [['tree', '#3b7a30', '#4f953f'], ['tree2', '#2f6a2a', '#3f8434']].forEach(([key, a, b]) => {
      c = canvas(scene, key, 64, 76);
      shadow(c.ctx, 32, 71, 26, 6);
      rect(c.ctx, '#5a3d25', 28, 46, 8, 26);
      circle(c.ctx, roundShade(c.ctx, a, 32, 34, 26), 32, 34, 26);
      circle(c.ctx, roundShade(c.ctx, b, 24, 26, 15), 24, 26, 15);
      circle(c.ctx, roundShade(c.ctx, b, 40, 24, 13), 40, 24, 13);
      circle(c.ctx, roundShade(c.ctx, VM.shade(b, 0.15), 30, 16, 10), 30, 16, 10);
      c.tex.refresh();
    });

    // banana plant, bush, haystack, bench, boat, lamp post
    c = canvas(scene, 'banana', 40, 48);
    shadow(c.ctx, 20, 44, 11, 3);
    rect(c.ctx, '#7da34a', 18, 22, 5, 22);
    [[-1, -0.3], [1, -0.4], [-0.6, -1], [0.6, -1], [0, -1.2]].forEach(([dx, dy]) => { c.ctx.save(); c.ctx.translate(20, 22); c.ctx.rotate(Math.atan2(dy, dx)); ellipse(c.ctx, '#5fae3e', 10, 0, 11, 4); rect(c.ctx, '#8cc35a', 1, -0.4, 18, 0.8); c.ctx.restore(); });
    c.tex.refresh();

    c = canvas(scene, 'bush', 32, 24);
    shadow(c.ctx, 16, 20, 15, 4);
    circle(c.ctx, roundShade(c.ctx, '#3f8434', 10, 14, 8), 10, 14, 8); circle(c.ctx, roundShade(c.ctx, '#3f8434', 22, 14, 8), 22, 14, 8); circle(c.ctx, roundShade(c.ctx, '#4f953f', 16, 10, 8), 16, 10, 8);
    circle(c.ctx, '#e8534a', 13, 9, 1.2); circle(c.ctx, '#e8534a', 22, 13, 1.2);
    c.tex.refresh();

    c = canvas(scene, 'haystack', 36, 40);
    shadow(c.ctx, 18, 36, 17, 4);
    rect(c.ctx, '#6b4322', 17, 0, 2, 10);
    c.ctx.beginPath(); c.ctx.ellipse(18, 36, 15, 28, 0, Math.PI, 0); c.ctx.fillStyle = sideShade(c.ctx, '#d9b44a', 3, 33); c.ctx.fill();
    for (let y = 14; y < 36; y += 5) rect(c.ctx, '#c49e38', 6, y, 24, 0.8);
    c.tex.refresh();

    c = canvas(scene, 'bench', 30, 16);
    rounded(c.ctx, '#8a5a32', 0, 4, 30, 5, 1.5); rect(c.ctx, '#6b4322', 3, 9, 3, 6); rect(c.ctx, '#6b4322', 24, 9, 3, 6);
    c.tex.refresh();

    c = canvas(scene, 'boat', 60, 24);
    c.ctx.beginPath(); c.ctx.moveTo(2, 8); c.ctx.quadraticCurveTo(30, 30, 58, 8); c.ctx.closePath(); c.ctx.fillStyle = '#8a5a32'; c.ctx.fill();
    rect(c.ctx, '#a8743e', 6, 7, 48, 3); rect(c.ctx, '#6b4322', 20, 9, 3, 7); rect(c.ctx, '#6b4322', 38, 9, 3, 7);
    c.tex.refresh();

    c = canvas(scene, 'lamp', 16, 46);
    shadow(c.ctx, 8, 44, 6, 2);
    rect(c.ctx, '#4a3428', 7, 10, 3, 34);
    rect(c.ctx, '#2f2a26', 3, 4, 10, 2); rounded(c.ctx, '#ffd98a', 4, 6, 8, 7, 1); rect(c.ctx, '#2f2a26', 4, 13, 8, 2);
    c.tex.refresh();

    // animals
    c = canvas(scene, 'cow', 36, 26);
    shadow(c.ctx, 18, 23, 15, 3);
    [6, 11, 24, 29].forEach((x) => rounded(c.ctx, '#5a4030', x, 16, 3, 8, 1));
    rounded(c.ctx, '#f4f1ea', 3, 6, 26, 13, 6);
    ellipse(c.ctx, '#2b2522', 11, 11, 5, 4); ellipse(c.ctx, '#2b2522', 22, 14, 4, 3);
    rounded(c.ctx, '#f4f1ea', 25, 3, 10, 10, 4);
    rounded(c.ctx, '#f0b0a0', 31, 9, 4, 4, 1.5); circle(c.ctx, '#151515', 29.6, 7, 0.9); rect(c.ctx, '#d9c9a3', 26, 1, 2, 3); rect(c.ctx, '#d9c9a3', 32, 1, 2, 3);
    rect(c.ctx, '#2b2522', 2, 8, 2, 8);
    c.tex.refresh();

    c = canvas(scene, 'chicken', 14, 14);
    shadow(c.ctx, 7, 12.5, 6, 1.6);
    ellipse(c.ctx, '#f6f1e6', 6, 8, 5, 4); circle(c.ctx, '#f6f1e6', 10, 4, 3);
    rounded(c.ctx, '#e0402f', 9, 0, 3, 2, 1); poly(c.ctx, '#f2a52e', [12, 3.6, 14, 4.4, 12, 5.2]); circle(c.ctx, '#151515', 10.4, 3.4, 0.5);
    rect(c.ctx, '#f2a52e', 5, 11, 0.8, 2); rect(c.ctx, '#f2a52e', 8, 11, 0.8, 2);
    c.tex.refresh();

    // ---- boundaries and jungle

    // mountain: green hills with rocky faces, like the central highlands
    c = canvas(scene, 'mountain', 230, 160);
    const hill = (pts, color) => {
      const g = c.ctx.createLinearGradient(0, 10, 0, 160);
      g.addColorStop(0, VM.shade(color, 0.15)); g.addColorStop(1, VM.shade(color, -0.25));
      c.ctx.fillStyle = g; c.ctx.beginPath(); c.ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 4) c.ctx.quadraticCurveTo(pts[i], pts[i + 1], pts[i + 2], pts[i + 3]);
      c.ctx.closePath(); c.ctx.fill();
    };
    hill([0, 160, 40, 40, 95, 22, 130, 8, 170, 50, 210, 90, 230, 160], '#5f8f6a');
    hill([20, 160, 70, 60, 120, 44, 160, 34, 190, 90, 215, 120, 225, 160], '#4f8a3f');
    poly(c.ctx, 'rgba(120,120,110,0.55)', [118, 50, 132, 46, 146, 70, 128, 86, 112, 72]);
    poly(c.ctx, 'rgba(120,120,110,0.45)', [70, 90, 84, 84, 92, 104, 72, 110]);
    const mr = VM.rng(5);
    for (let i = 0; i < 40; i++) { const x = 30 + mr() * 175, y = 70 + mr() * 85; circle(c.ctx, roundShade(c.ctx, mr() > 0.5 ? '#3b7a30' : '#2f6a2a', x, y, 5), x, y, 4 + mr() * 3); }
    c.tex.refresh();

    // rocks (two shapes)
    c = canvas(scene, 'rock', 40, 30);
    shadow(c.ctx, 20, 26, 18, 4);
    c.ctx.beginPath(); c.ctx.moveTo(3, 26); c.ctx.quadraticCurveTo(2, 10, 14, 6); c.ctx.quadraticCurveTo(28, 2, 35, 12); c.ctx.quadraticCurveTo(40, 22, 36, 26); c.ctx.closePath();
    c.ctx.fillStyle = roundShade(c.ctx, '#8d8a82', 18, 14, 18); c.ctx.fill();
    ellipse(c.ctx, 'rgba(110,150,70,0.6)', 14, 8, 6, 2);
    c.tex.refresh();
    c = canvas(scene, 'rock2', 44, 30);
    shadow(c.ctx, 22, 26, 20, 4);
    ellipse(c.ctx, roundShade(c.ctx, '#7f7b73', 14, 18, 12), 14, 19, 12, 8);
    ellipse(c.ctx, roundShade(c.ctx, '#9a968c', 28, 16, 13), 28, 17, 12, 10);
    ellipse(c.ctx, roundShade(c.ctx, '#8a867e', 36, 23, 6), 36, 23, 6, 4);
    c.tex.refresh();

    // big jungle tree
    c = canvas(scene, 'jungletree', 84, 100);
    shadow(c.ctx, 42, 95, 34, 7);
    rect(c.ctx, '#4a3220', 37, 56, 10, 40); poly(c.ctx, '#4a3220', [37, 92, 28, 98, 38, 96]); poly(c.ctx, '#4a3220', [47, 92, 56, 98, 46, 96]);
    [[42, 44, 34, '#24572a'], [22, 54, 18, '#2b6530'], [62, 52, 20, '#2b6530'], [32, 28, 20, '#347a36'], [54, 26, 18, '#347a36'], [42, 16, 14, '#3f8a3e']]
      .forEach(([x, y, rr, col]) => circle(c.ctx, roundShade(c.ctx, col, x, y, rr), x, y, rr));
    c.tex.refresh();

    // bamboo clump
    c = canvas(scene, 'bamboo', 40, 80);
    shadow(c.ctx, 20, 76, 14, 3);
    [[10, 6], [16, 0], [22, 3], [28, 8], [13, 12], [25, 14]].forEach(([x, top]) => {
      rect(c.ctx, sideShade(c.ctx, '#8fae3e', x, x + 4), x, top + 8, 4, 70 - top);
      for (let y = top + 16; y < 76; y += 10) rect(c.ctx, '#5f7a25', x, y, 4, 1);
      ellipse(c.ctx, '#5fa04a', x + 6, top + 10, 7, 2.2, -0.4); ellipse(c.ctx, '#4f9040', x - 3, top + 16, 6, 2, 0.5);
    });
    c.tex.refresh();

    // fern
    c = canvas(scene, 'fern', 34, 24);
    shadow(c.ctx, 17, 21, 13, 3);
    [-1.2, -0.7, -0.25, 0.25, 0.7, 1.2].forEach((a) => { c.ctx.save(); c.ctx.translate(17, 21); c.ctx.rotate(a - Math.PI / 2); ellipse(c.ctx, '#3f8a34', 9, 0, 10, 3); rect(c.ctx, '#6fb050', 0, -0.4, 18, 0.8); c.ctx.restore(); });
    c.tex.refresh();

    // elephant watch hut on stilts (pela)
    c = canvas(scene, 'watchtower', 60, 110);
    shadow(c.ctx, 30, 105, 26, 5);
    [10, 46].forEach((x) => rect(c.ctx, '#5a3b22', x, 40, 5, 66));
    for (let y = 52; y < 104; y += 12) rect(c.ctx, '#7f552d', 12, y, 36, 2);
    rect(c.ctx, '#8a5a32', 6, 40, 48, 6);
    rect(c.ctx, '#a8743e', 10, 26, 40, 14);
    thatch(c.ctx, 2, 4, 56, 24, '#c9a456');
    c.tex.refresh();

    // scarecrow in the paddy
    c = canvas(scene, 'scarecrow', 30, 44);
    shadow(c.ctx, 15, 41, 8, 2);
    rect(c.ctx, '#6b4322', 14, 10, 2, 32); rect(c.ctx, '#6b4322', 4, 18, 22, 2);
    rounded(c.ctx, '#c0533a', 8, 16, 14, 14, 3);
    circle(c.ctx, roundShade(c.ctx, '#efe2c4', 15, 10, 5), 15, 10, 5);
    ellipse(c.ctx, '#d9b25f', 15, 6, 9, 2.4); rounded(c.ctx, '#c9a24f', 10, 1, 10, 6, 3);
    c.tex.refresh();

    // frangipani (araliya) tree with white flowers
    c = canvas(scene, 'araliya', 64, 70);
    shadow(c.ctx, 32, 66, 22, 5);
    c.ctx.strokeStyle = '#7a6a5a'; c.ctx.lineWidth = 4; c.ctx.lineCap = 'round';
    c.ctx.beginPath(); c.ctx.moveTo(32, 66); c.ctx.lineTo(32, 40); c.ctx.moveTo(32, 46); c.ctx.lineTo(18, 30); c.ctx.moveTo(32, 44); c.ctx.lineTo(46, 28); c.ctx.stroke();
    [[18, 26, 13], [46, 24, 13], [32, 18, 14]].forEach(([x, y, rr]) => circle(c.ctx, roundShade(c.ctx, '#4f953f', x, y, rr), x, y, rr));
    const ar = VM.rng(3);
    for (let i = 0; i < 16; i++) { const x = 8 + ar() * 48, y = 8 + ar() * 28; flower(c.ctx, x, y, '#fffaf0'); }
    c.tex.refresh();

    // clay pots beside the cooking hut
    c = canvas(scene, 'pots', 34, 22);
    shadow(c.ctx, 17, 20, 15, 2.5);
    [[9, 13, 7], [22, 14, 6], [15, 16, 5]].forEach(([x, y, rr]) => { ellipse(c.ctx, roundShade(c.ctx, '#a0522d', x, y, rr), x, y, rr, rr * 0.85); ellipse(c.ctx, '#5a2e18', x, y - rr * 0.7, rr * 0.5, 1.2); });
    c.tex.refresh();

    // deer (faces right)
    c = canvas(scene, 'deer', 34, 30);
    shadow(c.ctx, 17, 27, 12, 2.5);
    [8, 12, 22, 26].forEach((x) => rect(c.ctx, '#7a4e2d', x, 18, 2, 10));
    rounded(c.ctx, sideShade(c.ctx, '#b07040', 6, 28), 6, 10, 22, 10, 5);
    for (let i = 0; i < 5; i++) circle(c.ctx, '#f2e2c4', 11 + i * 3.5, 13 + (i % 2) * 2, 0.9);
    rounded(c.ctx, '#b07040', 24, 4, 8, 9, 3);
    circle(c.ctx, '#151515', 29.5, 7, 0.8); rect(c.ctx, '#7a4e2d', 25, 0, 1, 5); rect(c.ctx, '#7a4e2d', 28, 0, 1, 5);
    rect(c.ctx, '#f2e2c4', 4, 11, 3, 3);
    c.tex.refresh();

    // elephant (faces right)
    c = canvas(scene, 'elephant', 92, 70);
    shadow(c.ctx, 46, 66, 38, 5);
    const ele = '#7d7a80';
    [[18, 50], [30, 52], [54, 52], [66, 50]].forEach(([x, y]) => rounded(c.ctx, sideShade(c.ctx, ele, x, x + 10), x, y - 14, 10, 30 - (y - 50), 4));
    ellipse(c.ctx, roundShade(c.ctx, ele, 40, 32, 30), 40, 34, 32, 20);
    ellipse(c.ctx, roundShade(c.ctx, ele, 72, 26, 14), 72, 28, 14, 13);
    c.ctx.strokeStyle = ele; c.ctx.lineWidth = 6; c.ctx.lineCap = 'round';
    c.ctx.beginPath(); c.ctx.moveTo(82, 32); c.ctx.quadraticCurveTo(90, 46, 84, 60); c.ctx.stroke();
    ellipse(c.ctx, VM.shade(ele, -0.12), 64, 28, 8, 11);
    poly(c.ctx, '#f4efe2', [78, 38, 88, 44, 78, 42]);
    circle(c.ctx, '#151515', 76, 23, 1.2);
    rect(c.ctx, VM.shade(ele, -0.2), 8, 30, 2, 12);
    c.tex.refresh();

    // tractor (faces right): the only way to chase elephants back to the jungle
    c = canvas(scene, 'tractor', 76, 54);
    shadow(c.ctx, 38, 50, 34, 4);
    rounded(c.ctx, sideShade(c.ctx, '#d9472b', 26, 70), 26, 22, 44, 16, 4);       // engine hood
    rounded(c.ctx, '#b53a22', 30, 25, 36, 3, 1);
    for (let x = 48; x < 66; x += 4) rect(c.ctx, '#7a2414', x, 30, 2, 6);          // grille slots
    rect(c.ctx, '#3a3a3a', 56, 8, 3, 15); rect(c.ctx, '#222', 55, 6, 5, 3);        // exhaust pipe
    rounded(c.ctx, sideShade(c.ctx, '#c23e25', 10, 34), 10, 18, 24, 22, 3);        // cab / seat body
    rect(c.ctx, '#2b2b2b', 30, 14, 2, 10); ellipse(c.ctx, '#2b2b2b', 32, 14, 5, 1.6); // steering wheel
    circle(c.ctx, '#ffe58a', 70, 28, 2.2);                                          // headlight
    const wheel = (x, y, r) => { circle(c.ctx, '#1f1f1f', x, y, r); circle(c.ctx, '#555', x, y, r * 0.55); circle(c.ctx, '#e6c25a', x, y, r * 0.25); };
    wheel(20, 38, 13); wheel(60, 44, 7);
    c.tex.refresh();

    // splash rings when someone falls into the water
    c = canvas(scene, 'splash', 40, 16);
    c.ctx.strokeStyle = 'rgba(255,255,255,0.85)'; c.ctx.lineWidth = 1.6;
    c.ctx.beginPath(); c.ctx.ellipse(20, 8, 17, 6, 0, 0, Math.PI * 2); c.ctx.stroke();
    c.ctx.strokeStyle = 'rgba(255,255,255,0.5)'; c.ctx.beginPath(); c.ctx.ellipse(20, 8, 11, 3.6, 0, 0, Math.PI * 2); c.ctx.stroke();
    c.tex.refresh();

    // warning sign over elephants
    c = canvas(scene, 'alert', 18, 18);
    circle(c.ctx, '#ffffff', 9, 9, 8.5); circle(c.ctx, '#e5484d', 9, 9, 7.2);
    rounded(c.ctx, '#ffffff', 7.8, 4, 2.4, 6.5, 1.2); circle(c.ctx, '#ffffff', 9, 12.8, 1.3);
    c.tex.refresh();

    // the floating arrow over the place you can use
    c = canvas(scene, 'marker', 14, 12);
    poly(c.ctx, '#1d1d1d', [0, 0, 14, 0, 7, 12]); poly(c.ctx, '#ffd25a', [2, 1.5, 12, 1.5, 7, 9.5]);
    c.tex.refresh();

    // the guide arrow that points to your next job (points right; the game rotates it)
    c = canvas(scene, 'guide', 24, 18);
    poly(c.ctx, '#1d1d1d', [0, 4, 13, 4, 13, 0, 24, 9, 13, 18, 13, 14, 0, 14]);
    poly(c.ctx, '#ffd25a', [2, 6, 15, 6, 15, 3.5, 21, 9, 15, 14.5, 15, 12, 2, 12]);
    c.tex.refresh();

    // the coloured ring under each villager's feet (white, tinted with the player's colour)
    c = canvas(scene, 'ring', 30, 12);
    c.ctx.strokeStyle = '#ffffff'; c.ctx.lineWidth = 2.4;
    c.ctx.beginPath(); c.ctx.ellipse(15, 6, 12.5, 4.2, 0, 0, Math.PI * 2); c.ctx.stroke();
    c.tex.refresh();

    // soft light used for lamps at night
    c = canvas(scene, 'glow', 128, 128, 1);
    const grad = c.ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,214,140,0.95)'); grad.addColorStop(0.35, 'rgba(255,180,90,0.45)'); grad.addColorStop(1, 'rgba(255,160,60,0)');
    c.ctx.fillStyle = grad; c.ctx.fillRect(0, 0, 128, 128);
    c.tex.refresh();
  }

  // Size of the solid part at the bottom of each object [width, height], in pixels.
  // Characters cannot walk through this part, but they can walk behind the top of the picture.
  VM.FOOTPRINTS = {
    house: [76, 26],
    cowshed: [116, 30], granary: [92, 26], stupa: [136, 40], bigtree: [44, 16],
    well: [36, 14], workshop: [104, 26], 'stall-red': [56, 16], 'stall-blue': [56, 16],
    kade: [88, 26], cookhut: [72, 24], coop: [50, 16],
    'fence-h': [32, 6], 'fence-v': [6, 32],
    palm: [10, 8], tree: [16, 10], tree2: [16, 10], banana: [8, 6], bush: [22, 8], haystack: [26, 10],
    lamp: [6, 4],
    mountain: [210, 70], rock: [32, 12], rock2: [38, 12], jungletree: [18, 12], bamboo: [24, 10], fern: [0, 0],
    watchtower: [44, 10], scarecrow: [6, 4], araliya: [10, 8], pots: [28, 8],
  };

  VM.makeTextures = function (scene) {
    if (scene.textures.exists('tiles')) return;
    drawTiles(scene);
    scene.textures.get('tiles').setFilter(Phaser.Textures.FilterMode.NEAREST);
    VM.OUTFITS.forEach((o) => drawVillagerSheet(scene, o));
    drawObjects(scene);
  };
})();
