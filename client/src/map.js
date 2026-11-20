// The village layout: which ground tile goes where, and where buildings, trees and animals stand.
// Positions are in tiles (1 tile = 32 pixels). Layout follows the owner's concept map:
// lake in the west, mountains in the north, jungle in the east and south, paddy fields north-east,
// village square in the middle. Every house has its own vegetable garden.

VM.buildMap = function () {
  const W = VM.MAP_W, H = VM.MAP_H, T = VM.T, S = VM.TILE;
  const OY = 4;          // the top 4 rows are the mountain range; layout rows below start at 0
  const LH = H - OY;     // layout height
  const r = VM.rng(2026);

  // 1. Start with grass everywhere. (All positions below are layout positions; OY is added for you.)
  const g = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) { const v = r(); row.push(v < 0.06 ? T.FLOWERS : v < 0.3 ? T.GRASS2 : T.GRASS); }
    g.push(row);
  }
  const inside = (x, y) => x >= 0 && y + OY >= 0 && x < W && y + OY < H;
  const set = (x, y, t) => { if (inside(x, y)) g[y + OY][x] = t; };
  const get = (x, y) => (inside(x, y) ? g[y + OY][x] : -1);
  const fill = (x0, y0, x1, y1, t) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, t); };

  // 2. Jungle: the forest in the north-west, the big jungle in the east and south, and the mountain foothills.
  fill(0, -OY, W - 1, -1, T.FOREST);
  for (let x = 9; x <= 24; x++) { const bottom = 8 + Math.round(r() * 2.5); for (let y = 0; y <= bottom; y++) set(x, y, T.FOREST); }
  for (let y = -OY; y < LH; y++) { const edge = 65 + Math.round(Math.sin(y / 3) * 1.4 + Math.sin(y / 7)); for (let x = edge; x < W; x++) set(x, y, T.FOREST); }
  for (let x = 0; x < W; x++) { const edge = 46 + Math.round(Math.sin(x / 4) * 1.2); for (let y = edge; y < LH; y++) set(x, y, T.FOREST); }

  // 3. Lake on the west side, with a sandy shore.
  const shore = (y) => 6 + Math.round(Math.sin(y / 4) * 1.5 + Math.sin(y / 9));
  for (let y = -OY; y < LH; y++) {
    const e = shore(y);
    for (let x = 0; x <= e; x++) set(x, y, T.WATER);
    set(e + 1, y, T.SAND); set(e + 2, y, T.SAND);
  }

  // 4. Paddy fields in the north-east, divided by earth ridges (bunds), and the irrigation canal.
  for (let y = 1; y <= 13; y++) for (let x = 38; x <= 62; x++) {
    const bund = (x - 38) % 6 === 0 || (y - 1) % 4 === 0 || x === 62 || y === 13;
    set(x, y, bund ? T.BUND : T.PADDY);
  }
  fill(33, 14, 64, 15, T.WATER); // the canal (river): 2 tiles wide

  // 5. Temple courtyard of white sand.
  fill(43, 16, 51, 24, T.SAND);

  // 6. Roads and paths.
  fill(9, 27, 74, 28, T.PATH);   // main road, west to east, ending in a jungle trail
  fill(30, 9, 31, 39, T.PATH);   // main road, north to south
  fill(9, 38, 62, 39, T.PATH);   // southern lane
  fill(8, 22, 29, 23, T.PATH);   // lane from the jetty to the houses
  fill(40, 14, 41, 26, T.PATH);  // path up to the paddy fields
  fill(57, 14, 58, 26, T.PATH);  // path to the storage house
  fill(46, 24, 47, 26, T.PATH);  // path to the temple
  fill(22, 12, 29, 12, T.PATH);  // path to the cowshed
  [[40, 14], [41, 14], [57, 14], [58, 14], [40, 15], [41, 15], [57, 15], [58, 15]].forEach(([x, y]) => set(x, y, T.PLANKS)); // bridges over the canal
  for (let y = 24; y <= 31; y++) for (let x = 72; x <= 78; x++) if ((x - 75) ** 2 + (y - 27.5) ** 2 <= 9) set(x, y, T.GRASS); // jungle clearing

  // 7. Village square: a round open space where the roads meet.
  for (let y = 22; y <= 33; y++) for (let x = 25; x <= 36; x++) {
    if ((x - 30.5) ** 2 + (y - 27.5) ** 2 <= 4.6 ** 2) set(x, y, T.PLAZA);
  }

  // 8. Fishing jetties into the lake (wooden planks you can walk on).
  for (let x = 1; x <= shore(22) + 2; x++) set(x, 22, T.PLANKS);
  for (let x = 1; x <= shore(23) + 2; x++) set(x, 23, T.PLANKS);
  for (let x = 2; x <= shore(33) + 2; x++) set(x, 33, T.PLANKS);

  // ---------------------------------------------------------------- objects
  const objects = [];
  const used = new Set(); // tiles already covered by something
  const occupy = (tx, ty, wt, ht) => {
    for (let y = Math.floor(ty - ht); y <= Math.ceil(ty); y++)
      for (let x = Math.floor(tx - wt / 2); x <= Math.ceil(tx + wt / 2); x++) used.add(x + ',' + y);
  };
  // Roads stay clear: plants and rocks are never placed on a road, path, jetty or the square.
  const ROAD = [T.PATH, T.PLAZA, T.PLANKS];
  const PLANTS = ['palm', 'bush', 'fern', 'rock', 'rock2', 'tree', 'tree2', 'jungletree', 'bamboo', 'banana', 'haystack'];
  const onRoad = (tx, ty) => { const yy = Math.floor(ty - 0.3); return [Math.floor(tx - 0.4), Math.floor(tx + 0.4)].some((x) => ROAD.includes(get(x, yy))); };
  // tx, ty = the point where the object touches the ground (bottom centre), in layout tiles
  const add = (type, tx, ty, wt = 1, ht = 1, extra = {}) => {
    if (PLANTS.includes(type) && onRoad(tx, ty)) return;
    objects.push(Object.assign({ type, x: tx * S, y: (ty + OY) * S }, extra));
    occupy(tx, ty, wt, ht);
  };
  const free = (tx, ty) => !used.has(tx + ',' + ty);
  const grassy = (t) => t === T.GRASS || t === T.GRASS2 || t === T.FLOWERS;
  const px = (tx, ty) => ({ x: tx * S, y: (ty + OY) * S });

  // Houses: 12 identical family houses, each with its own vegetable garden (garden = top-left tile of a 2 x 2 plot)
  const houses = [
    [13, 22, 15, 20], [19, 22, 21, 20], [25, 22, 27, 20], [13, 14, 9, 12], [18, 14, 16, 15], [14, 34, 16, 32],
    [20, 34, 22, 32], [36, 22, 38, 20], [54, 22, 52, 17], [27, 37, 24, 35], [38, 43, 41, 41], [60, 43, 62, 41],
  ].map(([hx, hy, gx, gy]) => {
    for (let y = gy; y <= gy + 1; y++) for (let x = gx; x <= gx + 1; x++) if (get(x, y) !== T.PATH) set(x, y, T.GARDEN); // never on a road
    occupy(hx, hy, 3, 3); occupy(gx + 1, gy + 1, 2, 2);
    return { x: hx * S, y: (hy + OY) * S, garden: { x: gx, y: gy + OY, w: 2, h: 2 } };
  });

  // Village buildings
  add('cowshed', 25, 9.2, 5, 3);
  add('granary', 61, 25, 4, 3);
  add('stupa', 47, 23.5, 5, 5);
  add('bigtree', 30.5, 28.3, 2, 2);
  add('well', 24, 32, 2, 2);
  add('workshop', 53, 26.9, 4, 3);
  add('kade', 44, 26.9, 4, 3);
  add('cookhut', 35, 35, 3, 3);
  add('pots', 37.6, 35.4);
  add('coop', 60, 34, 2, 2);
  add('bench', 26.5, 31.2); add('bench', 34.5, 31.2);
  add('watchtower', 64.3, 12.6, 2, 3);           // elephant watch hut at the jungle edge
  add('scarecrow', 44, 7.6); add('scarecrow', 56, 11.6); add('scarecrow', 50, 3.6);
  add('araliya', 42, 23.6, 2, 2); add('araliya', 52.2, 15.6, 2, 2);

  // Fences around the cow pen (the farm) and the chicken pen, with a gap people can walk through
  const fenceRow = (x0, x1, ty, gaps) => { for (let x = x0; x <= x1; x++) if (!gaps.includes(x)) add('fence-h', x + 0.5, ty + 0.25, 1, 0); };
  const fenceCol = (tx, y0, y1) => { for (let y = y0; y <= y1; y++) add('fence-v', tx, y + 1, 0, 1); };
  fenceRow(21, 28, 4, []); fenceRow(21, 28, 13, [24, 25]); fenceCol(21, 4, 12); fenceCol(29, 4, 12);
  fenceRow(55, 62, 31, []); fenceRow(55, 62, 37, [57, 58]); fenceCol(55, 31, 36); fenceCol(63, 31, 36);
  for (let y = 4; y <= 13; y++) for (let x = 21; x <= 29; x++) used.add(x + ',' + y);
  for (let y = 31; y <= 37; y++) for (let x = 55; x <= 63; x++) used.add(x + ',' + y);
  // Gates only animals bump into, so cows and chickens stay in their pens
  const gates = [{ x: 25 * S, y: (13 + OY) * S + 8, w: 64, h: 10 }, { x: 58 * S, y: (37 + OY) * S + 8, w: 64, h: 10 }];

  // Haystacks near the paddy fields
  add('haystack', 34, 10); add('haystack', 36, 8); add('haystack', 34.5, 6);

  // Lamp posts (they glow at night)
  [[12, 26.9], [20, 26.9], [37, 26.9], [50, 26.9], [60, 26.9], [17, 29.9], [36, 30], [55, 29.9],
    [29.4, 15], [32.6, 20], [29.4, 35], [32.6, 41], [9, 21.6], [44, 24.8], [51, 24.8], [26, 37.6], [45, 37.6], [66, 26.8]]
    .forEach(([x, y]) => add('lamp', x, y, 0, 0));

  // Fishing boats tied up next to the jetties (centre of a water tile)
  const boats = [[3, 21], [3, 24], [4, 34]].map(([x, y]) => ({ x: (x + 0.5) * S, y: (y + OY + 0.5) * S }));

  // BOUNDARIES: a mountain range along the north edge, rocks along the jungle edges
  for (let x = 2; x < W + 2; x += 5.2) add('mountain', x + (r() - 0.5), 0.2 + r() * 0.4, 7, 4);
  for (let y = -2; y < LH; y += 1.6) add(r() > 0.5 ? 'rock' : 'rock2', W - 0.8 - r() * 0.6, y + 1, 1, 1);
  for (let x = 6; x < W - 2; x += 1.7) add(r() > 0.5 ? 'rock' : 'rock2', x + r() * 0.6, LH - 0.2 - r() * 0.4, 1, 1);

  // Jungle: trees, bamboo, ferns and rocks on the forest ground, leaving trails and a clearing to walk through
  const trail = (x, y) => get(x, y) === T.PATH || get(x, y) === T.GRASS;
  for (let ty = 1; ty <= LH - 1; ty += 1.55) for (let tx = 9; tx <= W - 2; tx += 1.65) {
    const x = tx + (r() - 0.5) * 1.1, y = ty + (r() - 0.5) * 0.8;
    const cx = Math.floor(x), cy = Math.floor(y) - 1;
    if (get(cx, cy) !== T.FOREST || !free(cx, cy) || trail(cx, cy) || trail(cx, cy + 1) || trail(cx + 1, cy)) continue;
    const v = r();
    const type = v < 0.34 ? 'jungletree' : v < 0.6 ? 'tree' : v < 0.78 ? 'tree2' : v < 0.88 ? 'bamboo' : v < 0.95 ? 'fern' : 'rock';
    add(type, x, y, 1, 1);
  }

  // Coconut palms along the shore and around the village
  for (let y = 2; y < LH - 4; y += 3) {
    if (Math.abs(y - 22.5) < 2 || Math.abs(y - 33) < 2) continue;
    add('palm', shore(y) + 2.2 + r() * 0.6, y + 1, 1, 2);
  }
  [[33, 4], [36.5, 11.5], [27, 37], [38.5, 36], [54, 30.5], [62.5, 29.8], [54.5, 42], [63, 20], [35, 17], [38, 21], [23.5, 17], [8.8, 30], [48, 43], [33, 43]]
    .forEach(([x, y]) => { if (free(Math.floor(x), Math.floor(y) - 1)) add('palm', x, y, 1, 2); });

  // Rocks and ferns scattered around the village edges
  [[35.5, 2.5], [37, 15.6], [64, 22], [63.5, 35], [10.5, 44], [22, 44.5], [52, 45], [8.6, 12.5]].forEach(([x, y]) => {
    if (free(Math.floor(x), Math.floor(y) - 1)) add(r() > 0.5 ? 'rock' : 'rock2', x, y);
  });

  // Bushes on free grass
  let bushes = 0;
  for (let tries = 0; tries < 600 && bushes < 34; tries++) {
    const x = Math.floor(r() * W), y = Math.floor(r() * LH);
    if (!grassy(get(x, y)) || !free(x, y) || !free(x, y - 1) || !free(x - 1, y) || !free(x + 1, y)) continue;
    add(r() > 0.75 ? 'fern' : 'bush', x + 0.5, y + 1); bushes++;
  }

  // Animals: cows stay in the farm pen, chickens in their pen, deer in the jungle
  const animals = [
    { type: 'cow', ...px(23, 11.2) }, { type: 'cow', ...px(27, 11.6) }, { type: 'cow', ...px(25, 10.6) }, { type: 'cow', ...px(22.6, 12.4) },
    { type: 'chicken', ...px(57, 33) }, { type: 'chicken', ...px(58, 35) }, { type: 'chicken', ...px(61.5, 35.5) }, { type: 'chicken', ...px(56.5, 35.6) },
    { type: 'deer', ...px(75, 26) }, { type: 'deer', ...px(74, 29) }, { type: 'deer', ...px(70, 40) },
  ];

  return {
    grid: g,
    objects,
    animals,
    houses,
    gates,
    boats,
    tractor: px(34.2, 25.4),                              // parked in the village square
    elephantStarts: [px(69, 3), px(69, 7.5), px(70, 11)],
    paddy: { x0: 38, x1: 62, y0: 1 + OY, y1: 13 + OY },  // in tiles, for the elephants
    jungle: px(68, 27),                                   // where the firewood job arrow points
    fields: px(44, 7),                                    // where the paddy job arrow points
  };
};
