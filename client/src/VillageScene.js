// The main game scene: draws the village, moves the villagers, handles places you can use,
// the day/night clock, elephants, boats, food, rescues and the camera.

// Names shown over the main places (like the concept map). Hidden at night.
VM.PLACE_LABELS = {
  cowshed: 'Cowshed (milk)', granary: 'Storage (grain)', stupa: 'Temple', bigtree: 'Village square',
  well: 'Well (water)', workshop: 'Workshop (tools)', kade: 'Kade (shop)', cookhut: 'Cooking hut (food)',
  coop: 'Chickens (eggs)', watchtower: 'Elephant watch hut',
};
const TREE_TYPES = ['tree', 'tree2', 'jungletree'];
const SWAY_TYPES = ['palm', 'bamboo', 'banana', 'araliya'];

class VillageScene extends Phaser.Scene {
  constructor() {
    super('village');
  }

  create() {
    VM.makeTextures(this);
    this.makeSmallTextures();
    VM.ui.init();

    const S = VM.TILE;
    const world = VM.buildMap();
    this.world = world;
    this.grid = world.grid;
    this.worldW = VM.MAP_W * S;
    this.worldH = VM.MAP_H * S;

    // Ground (a tilemap made from the grid in map.js). Water stops villagers and animals, but you can fall in.
    const map = this.make.tilemap({ data: world.grid, tileWidth: S, tileHeight: S });
    const tiles = map.addTilesetImage('tiles', 'tiles', S, S, 0, 0);
    this.ground = map.createLayer(0, tiles, 0, 0).setDepth(-100);
    this.ground.setCollision([VM.T.WATER]);
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);

    this.solids = this.physics.add.staticGroup();
    this.gates = this.physics.add.staticGroup();
    world.gates.forEach((g) => this.gates.add(this.add.zone(g.x, g.y, g.w, g.h)));
    this.spots = [];
    this.lights = [];
    this.placeLabels = [];
    world.objects.forEach((o) => this.placeObject(o));

    // Villagers. Everyone gets their own colour and their own house.
    // Offline: you plus computer villagers. Online: the server chooses your colour, clothes and house,
    // and the other real players appear as they join (see syncNet).
    VM.OUTFITS.forEach((o) => this.makeAnims(o.key));
    this.online = !!VM.net.room;
    VM.sound.ambient('day'); // birds and a breeze (crickets at night)
    this.gardenOwner = new Map();
    this.houseObjs = world.houses.map((h, i) => this.placeHouse(h, i));
    this.owners = [];
    if (this.online) {
      const p = VM.net.myState();
      this.owners.push({
        name: 'You', realName: p.name, colour: VM.colourByKey(p.colour), outfit: VM.outfitByKey(p.outfit),
        isPlayer: true, money: VM.START_MONEY, houseIndex: p.house, inv: {},
      });
    } else {
      const colours = Phaser.Utils.Array.Shuffle(VM.PLAYER_COLORS.slice());
      const outfits = [VM.OUTFITS[0], ...Phaser.Utils.Array.Shuffle(VM.OUTFITS.slice(1))];
      const homes = Phaser.Utils.Array.Shuffle(world.houses.map((h, i) => i));
      for (let i = 0; i < 1 + VM.BOT_COUNT; i++) {
        const o = { name: i === 0 ? 'You' : outfits[i].name, colour: colours[i], outfit: outfits[i], isPlayer: i === 0, money: VM.START_MONEY, houseIndex: homes[i], inv: {} };
        if (i > 0) {
          // each computer villager has plenty of one thing and a little of another, to trade with you
          const spec = VM.SPECIALTIES[(i - 1) % VM.SPECIALTIES.length];
          const extra = VM.SPECIALTIES[(i + 2) % VM.SPECIALTIES.length];
          o.inv[spec] = 4 + Math.floor(Math.random() * 4);
          o.inv[extra] = 1 + Math.floor(Math.random() * 2);
          o.money = 100 + Math.floor(Math.random() * 16) * 10;
        }
        this.owners.push(o);
      }
    }
    this.owners.forEach((o) => { o.house = world.houses[o.houseIndex]; this.claimHouse(o.houseIndex, o); });

    this.villagers = this.owners.map((o) => {
      const start = this.online ? VM.net.myState() : { x: o.house.x, y: o.house.y + 26 };
      const v = this.makeVillager(o, start.x, start.y);
      o.sprite = v;
      return v;
    });
    this.player = this.villagers[0];
    this.me = this.owners[0];
    this.bots = this.villagers.slice(1);
    this.remotes = new Map();       // other real players (online)
    this.outfitIndex = Math.max(0, VM.OUTFITS.indexOf(this.me.outfit));

    this.animals = world.animals.map((a) => this.makeAnimal(a));
    // the cows belong to the villager who has milk to trade, the chickens to the one who has eggs
    const farm = { name: 'the farm', inv: {}, money: 0 };
    this.farmOwner = this.owners.find((o) => !o.isPlayer && o.inv.milk >= 4) || this.owners[1] || farm;
    this.henOwner = this.owners.find((o) => !o.isPlayer && o.inv.eggs >= 4) || this.owners[2] || farm;
    this.elephants = [];
    this.boats = world.boats.map((b) => {
      const img = this.add.image(b.x, b.y, 'boat').setScale(1 / VM.ART).setDepth(b.y);
      this.tweens.add({ targets: img, angle: { from: -2, to: 2 }, duration: 1800 + Math.random() * 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      return img;
    });
    this.inBoat = null;
    this.tractor = this.add.image(world.tractor.x, world.tractor.y, 'tractor').setOrigin(0.5, 1).setScale(1 / VM.ART).setDepth(world.tractor.y);
    this.inTractor = false;
    this.tractorLabel = this.addPlaceLabel(world.tractor.x, world.tractor.y - 34, 'Tractor (chases elephants)');

    this.physics.add.collider([...this.bots, ...this.animals], this.ground);
    this.physics.add.collider([...this.villagers, ...this.animals], this.solids);
    this.physics.add.collider(this.animals, this.gates);

    // Camera follows you
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.worldW, this.worldH);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setRoundPixels(true);
    this.fitZoom();
    this.scale.on('resize', this.fitZoom, this);

    // Night: a dark blue layer over the village, with lamp light and fireflies on top
    this.nightLayer = this.add.rectangle(0, 0, this.worldW, this.worldH, 0x0b1745, 0.64).setOrigin(0).setDepth(100000).setAlpha(0);
    this.playerLight = this.add.image(0, 0, 'glow').setDepth(100001).setBlendMode(Phaser.BlendModes.ADD).setScale(1.5).setAlpha(0);
    this.isNight = false;
    this.makeAmbience();

    this.marker = this.add.image(0, 0, 'marker').setScale(1 / VM.ART).setDepth(200000).setVisible(false);
    this.guide = this.add.image(0, 0, 'guide').setScale(1 / VM.ART).setDepth(200000).setVisible(false);
    this.splash = this.add.image(0, 0, 'splash').setScale(1 / VM.ART).setDepth(5).setVisible(false);
    this.helpBubble = this.add.text(0, 0, 'Help!', {
      fontFamily: 'Segoe UI, Arial, sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#1d1d1d',
      backgroundColor: '#ffffff', padding: { x: 5, y: 2 },
    }).setOrigin(0.5, 1).setResolution(2).setDepth(200001).setVisible(false);

    // Keyboard
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE,C,N,H,F,M');
    this.keys.C.on('down', () => { if (!VM.helpOpen) this.changeClothes(); });
    this.keys.N.on('down', () => { if (!VM.helpOpen) this.nextPhase(); });
    this.keys.H.on('down', () => VM.showHelp());
    this.keys.F.on('down', () => { if (!VM.helpOpen) this.eat(); });
    this.keys.M.on('down', () => VM.ui.toggleBigMap());

    this.task = null;               // the task you are doing right now
    this.drowning = null;           // set while you are in the water waiting for help
    this.cooldowns = new Map();     // place -> time it can be used again
    this.regrow = [];               // harvested or trampled paddy that grows back
    this.jobsDone = new Set();
    this.sleeping = false;          // in bed in your house
    this.ghost = false;             // killed by an elephant (back next morning in this test version)
    this.isDusk = false;
    this.trading = null;            // the villager you are trading with
    VM.ui.onTraded = () => this.completeJob('trade');

    VM.ui.setPlayer(this.me);
    VM.ui.initMap(this);
    VM.ui.jobs(this.jobsDone);
    VM.ui.food(VM.state.food);
    this.phaseIndex = -1;
    if (this.online) {
      const st = VM.net.room.state;
      this.setPhase(st.phase, true);
      this.phaseLeft = st.phaseLeft;
      VM.net.onSnap = (m) => this.player.setPosition(m.x, m.y); // the server refused a move
      this.initRoles(); // Phase 3 (roles.js)
    } else this.setPhase(0, true);
    if (VM.firstTaskPending) { VM.firstTaskPending = false; VM.ui.showTask(this.jobsDone); }
  }

  // ------------------------------------------------------------------ building the world
  makeSmallTextures() {
    if (this.textures.exists('sparkle')) return;
    const g = this.make.graphics({ add: false });
    g.fillStyle(0xffffff, 1).fillEllipse(6, 2, 12, 3).fillEllipse(6, 2, 3, 4);
    g.generateTexture('sparkle', 12, 4);
    g.clear().fillStyle(0xcfc8bd, 1).fillCircle(8, 8, 8);
    g.generateTexture('puff', 16, 16);
    g.destroy();
  }

  placeObject(o) {
    const img = this.add.image(o.x, o.y, o.type).setOrigin(0.5, 1).setScale(1 / VM.ART).setDepth(o.flat ? -50 : o.y);
    const fp = VM.FOOTPRINTS[o.type];
    if (fp && fp[0] > 0) this.solids.add(this.add.zone(o.x, o.y - fp[1] / 2, fp[0], fp[1]));
    const task = VM.task(o.type);
    if (task) this.spots.push({ name: o.type, key: o.type + '@' + o.x + ',' + o.y, task, x: o.x, y: o.y + 10, r: fp ? Math.max(38, fp[0] / 2 + 18) : 40, img });
    if (o.type === 'lamp') this.lights.push(this.addLight(o.x, o.y - 38, 0.9));
    if (o.type === 'cookhut') { this.fire = this.addLight(o.x + 14, o.y - 16, 0.8); this.lights.push(this.fire); this.firePos = { x: o.x + 14, y: o.y - 30 }; }
    if (SWAY_TYPES.includes(o.type)) {
      img.setAngle(-1.2);
      this.tweens.add({ targets: img, angle: 1.2, duration: 1800 + Math.random() * 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Math.random() * 1500 });
    }
    if (VM.PLACE_LABELS[o.type]) this.addPlaceLabel(o.x, o.y - img.displayHeight - 6, VM.PLACE_LABELS[o.type]);
  }

  addPlaceLabel(x, y, text, colour) {
    const t = this.add.text(x, y, text, {
      fontFamily: 'Segoe UI, Arial, sans-serif', fontSize: '11px', fontStyle: 'bold',
      color: colour ? this.textColourOn(colour.hex) : '#ffffff', backgroundColor: colour ? colour.hex : 'rgba(25,25,25,0.78)',
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5, 1).setResolution(2).setDepth(160000);
    this.placeLabels.push(t);
    return t;
  }

  // Every family house looks the same; the roof and door show the owner's colour.
  placeHouse(h, index) {
    const img = this.add.image(h.x, h.y, 'house-empty').setOrigin(0.5, 1).setScale(1 / VM.ART).setDepth(h.y);
    const fp = VM.FOOTPRINTS.house;
    this.solids.add(this.add.zone(h.x, h.y - fp[1] / 2, fp[0], fp[1]));
    return { h, index, img, owner: null, label: null, spot: null };
  }

  // A villager moves into house number i: roof and door in their colour, name label, garden and house spot.
  claimHouse(index, owner) {
    const ho = this.houseObjs[index];
    if (!ho) return;
    this.releaseHouse(index);
    const h = ho.h, g = h.garden;
    ho.owner = owner;
    ho.img.setTexture('house-' + owner.colour.key);
    for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) this.gardenOwner.set(x + ',' + y, owner);
    owner.gardenCentre = { x: (g.x + g.w / 2) * VM.TILE, y: (g.y + g.h / 2) * VM.TILE + 8 };
    ho.spot = { name: owner.isPlayer ? 'home' : 'house', key: 'house@' + h.x + ',' + h.y, task: VM.task(owner.isPlayer ? 'home' : 'house'), x: h.x, y: h.y + 12, r: 44, img: ho.img, owner };
    if (!owner.isPlayer) ho.spot.label = owner.name + "'s house";
    this.spots.push(ho.spot);
    if (owner.isPlayer) this.homeSpot = ho.spot;
    if (this.online && !ho.sign) {
      const gc = owner.gardenCentre;
      ho.sign = this.add.text(gc.x, gc.y, 'FOR SALE\nRs ' + VM.LAND_PRICE, { fontFamily: 'Segoe UI, Arial, sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#1d1d1d', align: 'center', backgroundColor: '#ffd25a', padding: { x: 5, y: 2 } })
        .setOrigin(0.5, 0.5).setResolution(2).setDepth(gc.y + 40).setVisible(false);
      // land for sale: bare soil with small seedlings (grown vegetables once someone buys it)
      const g = h.garden, S = VM.TILE, sp = this.add.graphics().setDepth(g.y * S + 1);
      sp.fillStyle(0x7a5232); sp.fillRect(g.x * S, g.y * S, g.w * S, g.h * S);
      sp.fillStyle(0x6a4528);
      for (let y = 0; y < g.h * 2; y++) sp.fillRect(g.x * S + 2, g.y * S + y * S / 2 + S / 4 - 1, g.w * S - 4, 3);
      for (let y = 0; y < g.h * 2; y++) for (let x = 0; x < g.w * 2; x++) {
        const px = g.x * S + x * S / 2 + S / 4, py = g.y * S + y * S / 2 + S / 4;
        sp.fillStyle(0x5fbf3f); sp.fillEllipse(px - 2, py - 2, 4, 3); sp.fillEllipse(px + 2, py - 2, 4, 3);
        sp.fillStyle(0x3f8f2a); sp.fillRect(px - 0.5, py - 2, 1, 3);
      }
      ho.sprouts = sp;
    }
    ho.label = this.addPlaceLabel(h.x, h.y - ho.img.displayHeight - 4, owner.isPlayer ? 'Your house' : owner.name + "'s house", owner.colour);
    if (this.isNight) ho.label.setVisible(false);
  }

  // The house is empty again (a player left the match).
  releaseHouse(index) {
    const ho = this.houseObjs[index];
    if (!ho || !ho.owner) return;
    const g = ho.h.garden;
    for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) this.gardenOwner.set(x + ',' + y, null);
    this.spots = this.spots.filter((s) => s !== ho.spot);
    this.placeLabels = this.placeLabels.filter((l) => l !== ho.label);
    ho.label.destroy();
    ho.img.setTexture('house-empty');
    if (ho.sign) { ho.sign.destroy(); ho.sign = null; }
    if (ho.sprouts) { ho.sprouts.destroy(); ho.sprouts = null; }
    ho.owner = null; ho.label = null; ho.spot = null;
  }

  addLight(x, y, scale) {
    return this.add.image(x, y, 'glow').setDepth(100001).setBlendMode(Phaser.BlendModes.ADD).setScale(scale).setAlpha(0);
  }

  makeAnims(key) {
    ['down', 'up', 'side'].forEach((dir, d) => {
      this.anims.create({
        key: key + '-' + dir,
        frames: [1, 0, 2, 0].map((n) => ({ key: 'char-' + key, frame: d * 3 + n })),
        frameRate: 8,
        repeat: -1,
      });
    });
  }

  textColourOn(hex) {
    const n = parseInt(hex.slice(1), 16);
    const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    return lum > 160 ? '#1d1d1d' : '#ffffff';
  }

  makeVillager(owner, x, y) {
    const A = VM.CHAR_ART;
    const v = this.physics.add.sprite(x, y, 'char-' + owner.outfit.key, 0).setOrigin(0.5, 1).setScale(1 / A);
    v.body.setSize(14 * A, 8 * A).setOffset(7 * A, 31 * A);
    v.owner = owner;
    v.outfit = owner.outfit;
    v.facing = 'down';
    v.nextTurn = 0;
    v.ring = this.add.image(x, y, 'ring').setScale(1 / VM.ART).setTint(parseInt(owner.colour.hex.slice(1), 16));
    v.label = this.add.text(x, y - 44, owner.name, {
      fontFamily: 'Segoe UI, Arial, sans-serif', fontSize: '11px', fontStyle: 'bold',
      color: this.textColourOn(owner.colour.hex), backgroundColor: owner.colour.hex, padding: { x: 5, y: 1 },
    }).setOrigin(0.5, 1).setResolution(2).setDepth(150000);
    return v;
  }

  makeAnimal(a) {
    const A = VM.ART;
    const s = this.physics.add.sprite(a.x, a.y, a.type).setOrigin(0.5, 1).setScale(1 / A);
    if (a.type === 'cow') { s.body.setSize(24 * A, 8 * A).setOffset(6 * A, 16 * A); s.speed = 18; }
    else if (a.type === 'deer') { s.body.setSize(20 * A, 6 * A).setOffset(7 * A, 22 * A); s.speed = 40; }
    else { s.body.setSize(8 * A, 4 * A).setOffset(3 * A, 9 * A); s.speed = 30; }
    s.nextTurn = 0;
    s.isAnimal = true;
    return s;
  }

  // Moving water sparkles, cooking smoke and fireflies
  makeAmbience() {
    this.time.addEvent({ delay: 120, loop: true, callback: () => this.sparkle() });
    this.time.addEvent({ delay: 650, loop: true, callback: () => this.smokePuff() });
    if (this.fire) this.tweens.add({ targets: this.fire, scale: 0.95, duration: 180, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.fireflies = [];
    const r = VM.rng(99);
    for (let i = 0; i < 46; i++) {
      // near the jungle edges and the paddy fields
      const spots = [[66 + r() * 10, 6 + r() * 44], [38 + r() * 25, 5 + r() * 13], [9 + r() * 15, 4 + r() * 8], [10 + r() * 55, 48 + r() * 4]];
      const [tx, ty] = spots[i % spots.length];
      const f = this.add.image(tx * VM.TILE, ty * VM.TILE, 'glow').setScale(0.06).setBlendMode(Phaser.BlendModes.ADD).setDepth(100002).setAlpha(0).setTint(0xd8ff7a);
      f.baseX = f.x; f.baseY = f.y; f.phase = r() * Math.PI * 2;
      this.fireflies.push(f);
    }
  }

  sparkle() {
    const view = this.cameras.main.worldView;
    const S = VM.TILE;
    const tx = Math.floor((view.x + Math.random() * view.width) / S), ty = Math.floor((view.y + Math.random() * view.height) / S);
    if (this.tileAt(tx, ty) !== VM.T.WATER) return;
    const s = this.add.image(tx * S + Math.random() * S, ty * S + Math.random() * S, 'sparkle').setDepth(-40).setAlpha(0).setScale(0.6);
    this.tweens.add({ targets: s, alpha: this.isNight ? 0.35 : 0.85, scaleX: 1.1, duration: 500, yoyo: true, onComplete: () => s.destroy() });
  }

  smokePuff() {
    if (!this.firePos || !this.cameras.main.worldView.contains(this.firePos.x, this.firePos.y)) return;
    const p = this.add.image(this.firePos.x + (Math.random() - 0.5) * 4, this.firePos.y, 'puff').setScale(0.3).setAlpha(0.55).setDepth(this.firePos.y + 40);
    this.tweens.add({ targets: p, y: p.y - 46, x: p.x + 10, scale: 0.9, alpha: 0, duration: 2600, onComplete: () => p.destroy() });
  }

  fitZoom() {
    // a bit closer than before so people and places are easy to see; phones get 1.5x
    let z = Phaser.Math.Clamp(Math.min(this.scale.width / 820, this.scale.height / 460), 1, 3); // PC: as before
    if (this.scale.width < 700) z = Math.max(z, 1.5);
    else if (this.scale.height < 520) z = Math.max(z, 1.25); // phones held sideways
    this.cameras.main.setZoom(Math.round(z * 4) / 4);
  }

  // ------------------------------------------------------------------ every frame
  update(time, delta) {
    const dt = delta / 1000;
    // the 3D view: built only once the bus ride is over (online) so the phone never holds three 3D scenes at once
    if (VM.USE3D && !VM.journeyOn && (!this.online || (VM.net.room && VM.net.room.state && VM.net.room.state.stage !== 'lobby'))) { VM.view3d.init(this); VM.view3d.update(dt); }
    this.updateClock(dt);
    this.updateFood(dt);
    this.movePlayer(time);
    this.bots.forEach((b) => {
      if (this.drowning && this.drowning.helper === b) return;
      if (this.trading && this.trading.sprite === b) { b.setVelocity(0, 0); this.walkAnim(b, 0, 0); return; }
      if (b.beeFrom && time < b.beeUntil) { const ax = b.x - b.beeFrom.x, ay = b.y - b.beeFrom.y, ad = Math.hypot(ax, ay) || 1; b.setVelocity(ax / ad * 120, ay / ad * 120); this.walkAnim(b, ax, ay); return; } // stung: run away
      this.wander(b, time, VM.BOT_SPEED);
    });
    this.animals.forEach((a) => this.wander(a, time, a.speed));
    this.updateElephants(time);
    this.updateBees(time, delta);
    this.updateOtherBees(time, delta);
    this.updateTractor();
    this.updateRescue(time);
    if (this.trading && Phaser.Math.Distance.Between(this.player.x, this.player.y, this.trading.sprite.x, this.trading.sprite.y) > 70) VM.ui.closeTrade();

    for (const v of this.villagers) {
      v.setDepth(v.y);
      v.label.setPosition(Math.round(v.x), Math.round(v.y - 44)).setVisible(v.visible && (!this.isNight || !!v.exposed));
      v.ring.setPosition(v.x, v.y - 2).setDepth(v.y - 1).setVisible(v.visible && !this.isNight);
    }
    if (time - (this.lastRich || 0) > 1000) {
      this.lastRich = time;
      VM.ui.richest(this.owners.filter((o) => !o.remote).map((o) => ({
        name: o.name, colour: o.colour.hex, isPlayer: o.isPlayer,
        wealth: o.isPlayer ? VM.wealth(VM.state.inv.money, VM.state.inv, VM.state.home) : VM.wealth(o.money, o.inv),
      })));
    }
    this.animals.forEach((a) => a.setDepth(a.y));
    if (this.inBoat) this.inBoat.setPosition(this.player.x, this.player.y - 6).setDepth(this.player.y + 2);
    this.playerLight.setPosition(this.player.x, this.player.y - 20);
    if (this.isNight) this.fireflies.forEach((f) => f.setPosition(f.baseX + Math.sin(time / 900 + f.phase) * 14, f.baseY + Math.cos(time / 700 + f.phase) * 9));

    if (this.online) this.syncNet(time, dt);
    if (time > (this.areaCheck || 0)) { this.areaCheck = time + 1000; VM.sound.area(this.areaHere()); }
    this.updateRegrow(time);
    this.updateInteraction(time, dt);
    if (this.online) this.updateRoleAction(time);
    this.updateGuide(time);
    VM.ui.updateMap(this, time);
  }

  movePlayer(time) {
    const k = this.keys;
    let x = (k.LEFT.isDown || k.A.isDown ? -1 : 0) + (k.RIGHT.isDown || k.D.isDown ? 1 : 0);
    let y = (k.UP.isDown || k.W.isDown ? -1 : 0) + (k.DOWN.isDown || k.S.isDown ? 1 : 0);
    if (Math.hypot(VM.input.x, VM.input.y) > 0.2) { x = VM.input.x; y = VM.input.y; }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    if (VM.helpOpen || this.drowning || this.sleeping || this.trading || this.blocked || this.injured) { x = 0; y = 0; }

    let speed = this.ghost ? 230 : VM.state.food <= 0 ? VM.HUNGRY_SPEED : VM.PLAYER_SPEED; // ghosts fly
    if (this.inTractor) {
      speed = 185;
      // the tractor cannot drive into water
      const S = VM.TILE, ahead = this.tileAt(Math.floor((this.player.x + x * 18) / S), Math.floor((this.player.y - 3 + y * 18) / S));
      if (ahead === VM.T.WATER) { x = 0; y = 0; }
    } else if (this.inBoat) {
      speed = 95;
      // steering onto land or a jetty takes you out of the boat
      const S = VM.TILE, ahead = this.tileAt(Math.floor((this.player.x + x * 14) / S), Math.floor((this.player.y - 3 + y * 14) / S));
      if (len > 0 && ahead !== VM.T.WATER) this.leaveBoat();
    }
    // the one villager who can swim moves slowly through water instead of falling in
    const swimming = !!this.canSwim && !this.inBoat && !this.inTractor && !this.ghost && this.feetTile(this.player) === VM.T.WATER;
    if (swimming) speed = 80;
    if (swimming !== !!this.swimming) {
      this.swimming = swimming;
      if (swimming) { this.player.setCrop(0, 0, VM.CHAR_W * VM.CHAR_ART, VM.CHAR_H * VM.CHAR_ART * 0.6); this.splash.setVisible(true); VM.sound.play('splash'); }
      else if (!this.drowning) { this.player.setCrop(); this.splash.setVisible(false); }
    }
    if (swimming) this.splash.setPosition(this.player.x, this.player.y - 14).setAlpha(0.5 + Math.sin(time / 200) * 0.3);
    this.player.setVelocity(x * speed, y * speed);
    this.walkAnim(this.player, x, y);

    // Walking into water without a boat: you fall in
    if (!this.inBoat && !this.drowning && !this.ghost && !this.canSwim && !VM.helpOpen && this.feetTile(this.player) === VM.T.WATER) this.fallIn(time);
  }

  feetTile(s) {
    return this.tileAt(Math.floor(s.x / VM.TILE), Math.floor((s.y - 3) / VM.TILE));
  }

  walkAnim(v, x, y) {
    if (Math.abs(x) < 0.01 && Math.abs(y) < 0.01) {
      v.anims.stop();
      v.setFrame({ down: 0, up: 3, side: 6 }[v.facing]);
      return;
    }
    if (Math.abs(x) > Math.abs(y)) { v.facing = 'side'; v.setFlipX(x < 0); }
    else { v.facing = y < 0 ? 'up' : 'down'; v.setFlipX(false); }
    v.anims.play(v.outfit.key + '-' + v.facing, true);
  }

  // Simple wandering for computer villagers and animals. At dusk villagers go home and sleep.
  wander(c, time, speed) {
    const b = c.body.blocked;
    if (!c.isAnimal && c.asleep) return;
    if (!c.isAnimal && (this.isNight || this.isDusk)) {
      const home = c.owner.house, dx = home.x - c.x, dy = home.y + 26 - c.y, d = Math.hypot(dx, dy);
      if (d <= 50 || (this.isNight && time - this.nightStart > 15000)) { this.botSleep(c); return; }
      if (time > c.nextTurn) { c.setVelocity((dx / d) * speed * 1.6 + (Math.random() - 0.5) * 30, (dy / d) * speed * 1.6 + (Math.random() - 0.5) * 30); c.nextTurn = time + 600; }
    } else if (time > c.nextTurn || b.left || b.right || b.up || b.down) {
      if (Math.random() < 0.35) c.setVelocity(0, 0);
      else { const a = Math.random() * Math.PI * 2; c.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed); }
      c.nextTurn = time + 800 + Math.random() * 2200;
    }
    const vx = c.body.velocity.x, vy = c.body.velocity.y;
    if (c.isAnimal) { if (Math.abs(vx) > 1) c.setFlipX(vx < 0); }
    else this.walkAnim(c, vx / speed, vy / speed);
  }

  // Which part of the village you are in, for the background sound: count the ground around you
  areaHere() {
    const p = this.player, S = VM.TILE, tx = Math.floor(p.x / S), ty = Math.floor(p.y / S), T = VM.T;
    const n = {};
    for (let y = ty - 3; y <= ty + 3; y++) for (let x = tx - 3; x <= tx + 3; x++) { const t = this.tileAt(x, y); n[t] = (n[t] || 0) + 1; }
    if (this.inBoat || (n[T.WATER] || 0) >= 8) return (n[T.SAND] || 0) >= 5 ? 'beach' : 'river';
    if ((n[T.FOREST] || 0) >= 12) return 'jungle';
    if (!this.farmSpots) this.farmSpots = this.world.objects.filter((o) => o.type === 'cowshed' || o.type === 'coop');
    if (this.farmSpots.some((o) => Phaser.Math.Distance.Between(p.x, p.y, o.x, o.y) < 170)) return 'farm';
    if ((n[T.PADDY] || 0) + (n[T.STUBBLE] || 0) + (n[T.BUND] || 0) >= 14) return 'fields';
    if ((n[T.PLAZA] || 0) >= 6) return 'square';
    return 'village';
  }

  // ------------------------------------------------------------------ water: boats and rescues
  boardBoat(boat) {
    this.inBoat = boat;
    this.tweens.killTweensOf(boat);
    boat.setAngle(0);
    this.player.setPosition(boat.x, boat.y + 8);
    return 'You are in the boat. Row onto the lake and press E to fish. Steer onto land to get out.';
  }

  leaveBoat() {
    const boat = this.inBoat;
    this.inBoat = null;
    boat.setDepth(boat.y);
    this.tweens.add({ targets: boat, angle: { from: -2, to: 2 }, duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  fallIn(time) {
    const S = VM.TILE;
    const tx = Math.floor(this.player.x / S), ty = Math.floor((this.player.y - 3) / S);
    const landing = this.nearestLand(tx, ty);
    let helper = null, best = Infinity;
    for (const b of this.bots) {
      if (b.asleep) continue; // sleeping villagers cannot hear you
      const d = Phaser.Math.Distance.Between(b.x, b.y, landing.x, landing.y);
      if (d < best) { best = d; helper = b; }
    }
    this.drowning = { since: time, helper, landing };
    this.task = null; VM.ui.progress(null);
    this.player.setVelocity(0, 0);
    this.player.setCrop(0, 0, VM.CHAR_W * VM.CHAR_ART, VM.CHAR_H * VM.CHAR_ART * 0.6);
    this.splash.setVisible(true);
    VM.ui.toast('You fell into the water! Someone must come and pull you out (or wait 30 seconds).');
    if (!this.online) VM.ui.toast(helper ? helper.owner.name + ' is coming to help you.' : 'Everyone is asleep… keep shouting!');
    VM.sound.play('splash');
  }

  // Closest tile that is not water (where the helper stands)
  nearestLand(tx, ty) {
    const seen = new Set([tx + ',' + ty]), queue = [[tx, ty]];
    while (queue.length) {
      const [x, y] = queue.shift();
      if (this.tileAt(x, y) !== VM.T.WATER && this.tileAt(x, y) !== -1) return { x: x * VM.TILE + 16, y: y * VM.TILE + 26 };
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = (x + dx) + ',' + (y + dy);
        if (!seen.has(k)) { seen.add(k); queue.push([x + dx, y + dy]); }
      }
    }
    return { x: this.player.x, y: this.player.y };
  }

  updateRescue(time) {
    const d = this.drowning;
    if (!d) { this.helpBubble.setVisible(false); return; }
    this.splash.setPosition(this.player.x, this.player.y - 14).setAlpha(0.6 + Math.sin(time / 200) * 0.3);
    this.helpBubble.setVisible(true).setPosition(this.player.x, this.player.y - 48 + Math.sin(time / 150) * 2);
    this.player.y += Math.sin(time / 260) * 0.15; // bobbing in the water

    const h = d.helper;
    if (!h) {
      // nobody is coming: after 2 minutes you reach the shore yourself (online, another player can pull you out first)
      const left = VM.SELF_RESCUE_SECONDS - (time - d.since) / 1000;
      if (left > 0) {
        const sec = Math.ceil(left);
        VM.ui.progress(1 - left / VM.SELF_RESCUE_SECONDS, 'In the water: someone can pull you out, or you climb out in ' + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'));
        return;
      }
    } else {
      const dist = Phaser.Math.Distance.Between(h.x, h.y, d.landing.x, d.landing.y);
      if (dist > 18 && time - d.since < 12000) {
        const a = Math.atan2(d.landing.y - h.y, d.landing.x - h.x);
        h.setVelocity(Math.cos(a) * VM.BOT_SPEED * 2.2, Math.sin(a) * VM.BOT_SPEED * 2.2);
        this.walkAnim(h, Math.cos(a), Math.sin(a));
        return;
      }
      // the helper has reached the shore (or found another way): pull you out
      h.setPosition(d.landing.x + 18, d.landing.y).setVelocity(0, 0);
      h.nextTurn = time + 1500;
    }
    this.pullOut(h ? h.owner.name : null);
  }

  // Out of the water, onto the nearest shore (pulled out by someone, or by yourself when "by" is empty)
  pullOut(by) {
    const d = this.drowning;
    if (!d) return;
    this.player.setPosition(d.landing.x, d.landing.y);
    if (this.online) VM.net.send('move', { x: d.landing.x, y: d.landing.y, facing: 'down', flip: false, moving: false });
    this.player.setCrop();
    this.splash.setVisible(false);
    this.drowning = null;
    VM.ui.progress(null);
    VM.ui.toast(by ? by + ' pulled you out of the water!' : 'At last you reached the shore by yourself.');
  }

  // ------------------------------------------------------------------ elephants
  makeElephant(x, y, home) {
    const A = VM.ART;
    const e = this.physics.add.sprite(x, y, 'elephant').setOrigin(0.5, 1).setScale(1 / A);
    e.body.setSize(50 * A, 10 * A).setOffset(20 * A, 58 * A);
    e.home = home || { x: this.world.elephantStarts[0].x + 80, y: this.world.elephantStarts[0].y };
    e.alert = this.add.image(e.x, e.y - 40, 'alert').setScale(1 / A).setDepth(100003);
    e.nextTrample = 0;
    this.elephants.push(e);
    return e;
  }

  spawnElephants() {
    const starts = this.world.elephantStarts;
    const staying = this.elephants.filter((e) => !e.leaving && !e.inGarden).length; // left over from last night
    VM.sound.play('elephant');   // they trumpet as they come out of the jungle
    for (let i = Math.min(staying, 3); i < VM.ELEPHANTS_PER_NIGHT; i++) {
      const p = starts[i % starts.length];
      const e = this.makeElephant(p.x + i * 24, p.y + (i % 2) * 40, { x: p.x + 80, y: p.y });
      e.roams = i >= 3;  // the first three go to the paddy, the rest roam the village
      this.pickElephantTarget(e);
    }
  }

  // Getting up in the middle of the night (for example to steal): an elephant walks into your garden and eats
  // your vegetables until you scare it away or the morning comes. Original thieves are not punished this way.
  elephantInMyGarden() {
    if (this.elephants.some((e) => e.inGarden && !e.leaving)) return;
    const me = this.online && VM.net.myState();
    if (me && me.fenceGarden) { VM.ui.toast('⚡ An elephant came for your garden, but your electric fence zapped it away!'); return; }
    const g = this.me.house.garden, S = VM.TILE;
    const c = this.me.gardenCentre;
    const jungle = this.world.elephantStarts[1];
    const e = this.makeElephant(c.x + 10, c.y + 12, { x: jungle.x + 80, y: jungle.y });
    e.inGarden = { x0: g.x * S, x1: (g.x + g.w) * S, y0: g.y * S + 16, y1: (g.y + g.h) * S + 16 };
    this.pickElephantTarget(e);
    VM.ui.banner('You got up in the night', 'An elephant came into your garden!', 'It is eating your vegetables. Scare it away (E near it), and watch out for the others.', true);
  }

  // PROTOTYPE: everyone is a villager until roles arrive in Phase 3.
  isOriginalThief() {
    return this.me.role === 'thief';
  }

  pickElephantTarget(e) {
    const S = VM.TILE;
    if (e.inGarden) { const g = e.inGarden; e.target = { x: g.x0 + Math.random() * (g.x1 - g.x0), y: g.y0 + Math.random() * (g.y1 - g.y0) }; return; }
    if (e.roams) { e.target = { x: (10 + Math.random() * 52) * S, y: (9 + Math.random() * 40) * S }; return; }
    // by day an elephant still in the village goes for the vegetable gardens half of the time
    if (!this.isNight && Math.random() < 0.5) {
      const gs = (this.houseObjs || []).map((ho) => ho.h && ho.h.garden).filter((g) => g && !this.fencedAt(g.x, g.y));
      if (gs.length) { const g = gs[Math.floor(Math.random() * gs.length)]; e.target = { x: (g.x + Math.random() * g.w) * S, y: (g.y + Math.random() * g.h) * S + 8 }; return; }
    }
    const p = this.world.paddy;
    for (let i = 0; i < 8; i++) { // never aim inside an electric fence
      e.target = { x: (p.x0 + 1 + Math.random() * (p.x1 - p.x0 - 2)) * S, y: (p.y0 + 1 + Math.random() * (p.y1 - p.y0 - 2)) * S };
      if (!this.fencedAt(Math.floor(e.target.x / S), Math.floor(e.target.y / S))) break;
    }
  }

  // You are in danger at night when you are outside: not in bed, not a ghost, not in a boat.
  playerOutside() {
    return !this.sleeping && !this.ghost && !this.inBoat && !this.inTractor && !this.drowning && !VM.helpOpen;
  }

  updateElephants(time) {
    const p = this.player;
    this.elephants = this.elephants.filter((e) => {
      let goal = e.leaving ? e.home : e.target;
      let speed = e.leaving ? 95 : e.inGarden ? 12 : VM.ELEPHANT_WALK;
      // while it stands in your garden, nobody can pick vegetables there
      if (e.inGarden && !e.leaving) {
        const g = this.me.house.garden;
        for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) this.cooldowns.set('garden@' + x + ',' + y, time + 20000);
      }
      // an elephant that sees someone outside at night charges at them
      const toPlayer = Phaser.Math.Distance.Between(e.x, e.y, p.x, p.y);
      const sees = toPlayer < VM.ELEPHANT_SEES || (e.charging && toPlayer < VM.ELEPHANT_SEES * 1.6 && time < e.chaseUntil);
      if (!e.leaving && !e.inGarden && this.isNight && this.playerOutside() && sees) {
        goal = { x: p.x, y: p.y };
        speed = VM.ELEPHANT_CHARGE;
        if (toPlayer < VM.ELEPHANT_SEES) e.chaseUntil = time + VM.ELEPHANT_MEMORY;   // it keeps chasing a little after losing sight of you
        if (!e.charging) { e.charging = true; VM.sound.play('trumpet'); this.cameras.main.shake(250, 0.004); VM.ui.toast('🐘 An elephant has seen you! Run home or scare it away (E)!'); }
        if (toPlayer < VM.ELEPHANT_KILLS) this.killPlayer('An elephant trampled you!');
      } else e.charging = false;
      // you hear its heavy steps when it is near (louder and faster while it charges)
      if (!e.leaving && toPlayer < 300 && time > (e.nextStep || 0)) { e.nextStep = time + (e.charging ? 380 : 750); if (toPlayer < 180 || e.charging) VM.sound.play('stomp'); }
      if (!e.leaving && !e.charging && toPlayer < 400 && time > (e.nextCall || 0)) { if (e.nextCall) VM.sound.play(toPlayer < 200 ? 'trumpet' : 'elephant'); e.nextCall = time + 9000 + Math.random() * 12000; }
      const dx = goal.x - e.x, dy = goal.y - e.y, d = Math.hypot(dx, dy) || 1;
      if (e.leaving && d < 20) { e.alert.destroy(); e.destroy(); return false; }
      if (!e.leaving && !e.charging && d < 10) this.pickElephantTarget(e);
      e.setVelocity((dx / d) * speed, (dy / d) * speed);
      e.setFlipX(dx < 0);
      e.setDepth(e.y);
      e.alert.setPosition(e.x, e.y - 40 + Math.sin(time / 200) * 2).setVisible(!e.leaving);
      // trample the paddy under its feet
      if (!e.leaving && time > e.nextTrample) {
        e.nextTrample = time + (this.isNight ? VM.ELEPHANT_EAT_NIGHT : VM.ELEPHANT_EAT_DAY); // by day it eats three times faster
        const tx = Math.floor(e.x / VM.TILE), ty = Math.floor((e.y - 4) / VM.TILE), here = this.tileAt(tx, ty);
        if (this.fencedAt(tx, ty)) { // the electric fence zaps it: it turns away
          if (!e.leaving && time > (e.nextZap || 0)) { e.nextZap = time + 2500; this.zap(e); this.pickElephantTarget(e); }
        } else if (here === VM.T.PADDY) { this.setTile(tx, ty, VM.T.STUBBLE); this.regrow.push({ x: tx, y: ty, at: time + VM.PADDY_REGROW_MS }); } // eaten: 6 minutes to grow back
        else if (here === VM.T.GARDEN) { // vegetables eaten: bare for 3 minutes
          this.setTile(tx, ty, VM.T.STUBBLE); this.regrow.push({ x: tx, y: ty, at: time + VM.GARDEN_REGROW_MS, tile: VM.T.GARDEN });
          const ow = this.gardenOwner.get(tx + ',' + ty);
          if (ow && ow.isPlayer && time > (this.eatenNote || 0)) { this.eatenNote = time + 15000; VM.ui.toast('🐘 An elephant is eating your vegetables! Chase it away (E with 2 people, or the tractor).'); }
        }
      }
      return true;
    });
  }

  // ---- the tractor: the only way to chase elephants back to the jungle
  driveTractor() {
    if (this.online) VM.net.send('tractor', { drive: true }); // there is one tractor for everyone
    this.inTractor = true;
    this.tractorUntil = this.time.now + VM.TRACTOR_SECONDS * 1000; // a ride lasts 15 seconds
    this.tractorLabel.setAlpha(0); // the label would cover the driver
    this.player.setPosition(this.tractor.x - 8, this.tractor.y - 10);
    return 'You are driving the tractor for 15 seconds. Drive into an elephant to chase it back to the jungle.';
  }

  leaveTractor() {
    if (this.online) VM.net.send('tractor', { drive: false });
    this.inTractor = false;
    VM.ui.progress(null);
    this.tractorLabel.setAlpha(1);
    this.player.setCrop();
    this.tractor.setDepth(this.tractor.y);
    this.player.setPosition(this.tractor.x, this.tractor.y + 20);
    return 'You parked the tractor.';
  }

  updateTractor() {
    if (!this.inTractor) return;
    const p = this.player;
    // the ride is over after 15 seconds: get out (the tractor is free for someone else)
    const left = Math.ceil((this.tractorUntil - this.time.now) / 1000);
    if (left <= 0) { VM.ui.progress(null); VM.ui.toast(this.leaveTractor() + ' Your 15 seconds are up.'); return; }
    VM.ui.progress(left / VM.TRACTOR_SECONDS, 'Tractor: ' + left + ' s left');
    if (Math.abs(p.body.velocity.x) > 1) this.tractor.setFlipX(p.body.velocity.x < 0);
    const flip = this.tractor.flipX;
    this.tractor.setPosition(p.x + (flip ? -10 : 10), p.y + 12).setDepth(p.y + 5);
    this.tractorLabel.setPosition(this.tractor.x, this.tractor.y - 34);
    // the driver sits in the cab: only the top of the villager shows above the tractor
    p.setCrop(0, 0, VM.CHAR_W * VM.CHAR_ART, VM.CHAR_H * VM.CHAR_ART * 0.7);
    for (const e of this.elephants) {
      if (!e.leaving && Phaser.Math.Distance.Between(this.tractor.x, this.tractor.y, e.x, e.y) < 75) VM.ui.toast(this.scareElephant(e));
    }
  }

  scareElephant(e) {
    e.leaving = true;
    if (e.inGarden) {
      // vegetables it did not eat can be picked again
      const g = this.me.house.garden, now = this.time.now;
      for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) this.cooldowns.set('garden@' + x + ',' + y, now);
      return 'The tractor chased the elephant out of your garden!';
    }
    return 'The tractor chased the elephant back into the jungle!';
  }

  // ------------------------------------------------------------------ food
  updateFood(dt) {
    if (VM.helpOpen || this.ghost) return;
    const before = VM.state.food;
    VM.state.food = Math.max(0, before - VM.FOOD_PER_SECOND * dt);
    if (Math.floor(before) !== Math.floor(VM.state.food)) VM.ui.food(VM.state.food);
    if (before > 25 && VM.state.food <= 25) VM.ui.toast('You are getting hungry. Eat something (press F).');
    if (before > 0 && VM.state.food <= 0) {
      if (this.online) VM.ui.banner('Starving', 'You are getting weak!', 'Eat something within ' + VM.STARVE_SECONDS + ' seconds or you will die of hunger.', true);
      else VM.ui.toast('You are starving! You walk slowly until you eat.');
    }
    this.updateStarving(dt);
  }

  // online: an empty food bar for too long kills you; your body looks weak (to everyone) while you starve
  updateStarving(dt) {
    const starving = this.online && this.stage === 'playing' && !this.ghost && VM.state.food <= 0;
    if (!starving) {
      if (this.starveLeft !== undefined) { this.starveLeft = undefined; VM.ui.progress(null); }
      this.setWeak(false);
      return;
    }
    if (this.starveLeft === undefined) this.starveLeft = VM.STARVE_SECONDS;
    const before = this.starveLeft;
    this.starveLeft -= dt;
    this.setWeak(true);
    if (!this.task) VM.ui.progress(Math.max(0, this.starveLeft) / VM.STARVE_SECONDS, 'Starving: eat within ' + Math.ceil(Math.max(0, this.starveLeft)) + ' s');
    if (before > 30 && this.starveLeft <= 30) { VM.ui.banner('Starving', '30 seconds left!', 'Eat now (press F). Fish, meat, rice or a coconut.', true); VM.sound.play('kill'); }
    if (before > 10 && this.starveLeft <= 10) { VM.ui.banner('Starving', '10 seconds left!', 'Eat something now or you will die.', true); VM.sound.play('kill'); }
    if (this.starveLeft <= 0) {
      this.starveLeft = undefined; VM.ui.progress(null); this.setWeak(false);
      this.deathMessage = 'You died of hunger.';
      VM.net.send('died', { cause: 'hunger' });
      this.becomeGhost('You died of hunger.');
      VM.fx.funeral(VM.net.myState() ? VM.net.myState().name : '');
    }
  }

  setWeak(on) {
    if (!!this.weak === on) return;
    this.weak = on;
    if (on) {
      this.player.setTint(0xb8b0a0);
      this.weakTween = this.tweens.add({ targets: this.player, angle: { from: -6, to: 6 }, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else {
      if (this.weakTween) { this.weakTween.stop(); this.weakTween = null; }
      if (!this.ghost) this.player.clearTint();
      if (!this.injured) this.player.setAngle(0);
    }
  }

  eat() {
    if (this.ghost) { VM.ui.toast('Ghosts do not eat. Do your ghost jobs instead.'); return; }
    const result = VM.eat();
    VM.ui.toast(result.message);
    if (result.ok) this.completeJob('eat');
  }

  // ------------------------------------------------------------------ places you can use
  tileAt(tx, ty) {
    return ty >= 0 && ty < VM.MAP_H && tx >= 0 && tx < VM.MAP_W ? this.grid[ty][tx] : -1;
  }

  setTile(tx, ty, type) {
    this.grid[ty][tx] = type;
    this.ground.putTileAt(type, tx, ty);
    VM.ui.mapDirty = true;
  }

  queueAt(place) {
    const st = VM.net.room && VM.net.room.state;
    const v = st && st.queues && st.queues.get(place);
    return v ? v.split(',').filter(Boolean) : [];
  }

  // a ghost haunts places instead of working there
  findSpot() {
    if (this.online && !this.ghost && this.dropSprites) {
      for (const [id, d] of this.dropSprites) {
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, d.x, d.y) < 50) {
          return { name: 'pickup', key: 'pickup@' + id, x: d.x, y: d.y, img: d.img, task: { label: 'Pick up the goods ' + d.by + ' dropped', seconds: 1, done: () => { VM.net.send('pickup', { id }); return null; } } };
        }
      }
    }
    const s = this.findSpotBase();
    if (s && s.name === 'home' && this.online && !this.ghost) return this.fenceOffer(s) || s;
    if (!this.ghost || !s) return s;
    const place = TREE_TYPES.includes(s.name) ? null : s.name, h = VM.GHOST_HAUNTS[place];
    if (!h) return s.name === 'home' ? null : s;
    return Object.assign({}, s, { name: 'haunt', key: 'haunt@' + place, task: { label: h[0], seconds: 2, done: () => { this.completeJob(place); return h[1]; } } });
  }

  // upgrade your house: an electric fence around your paddy plot or garden (when you own one without a fence)
  fenceOffer(s) {
    const st = VM.net.room.state, me = VM.net.myState(), id = VM.net.room.sessionId;
    if (!me || VM.state.inv.money < VM.FENCE_PRICE) return null;
    const what = [...st.paddy.values()].includes(id) && !me.fencePaddy ? 'paddy' : me.land && !me.fenceGarden ? 'garden' : null;
    if (!what) return null;
    const name = what === 'paddy' ? 'paddy plot' : 'vegetable garden';
    return Object.assign({}, s, { name: 'fence', key: 'fence-' + what, task: { label: 'Upgrade: electric fence around your ' + name + ' (Rs ' + VM.FENCE_PRICE + ')', seconds: 2,
      check: () => (VM.state.inv.money >= VM.FENCE_PRICE ? null : 'You need Rs ' + VM.FENCE_PRICE + '.'),
      done: () => { VM.net.send('buyFence', { what }); this.pendingFence = what; return null; } } });
  }

  findSpotBase() {
    const p = this.player;
    if (this.drowning || this.sleeping || this.trading || this.blocked || this.injured) return null; // ghosts can do tasks too
    if (this.online && !this.ghost) {
      // another player in the water next to you: pull them out
      for (const [id, r] of this.remotes) {
        if (!r.inWater || Phaser.Math.Distance.Between(p.x, p.y, r.sprite.x, r.sprite.y) > 80) continue;
        const name = r.owner.name;
        return { name: 'rescue', key: 'rescue@' + id, img: r.sprite, task: { label: 'Pull ' + name + ' out of the water', seconds: 1.5, done: () => { VM.net.send('rescue', { target: id }); return 'You pulled ' + name + ' out of the water!'; } } };
      }
      // someone in a line next to you: cut in front of them (swap places)
      for (const place of Object.keys(VM.QUEUE_PLACES)) {
        const q = this.queueAt(place), mine = q.indexOf(VM.net.room.sessionId);
        for (let k = 0; k < q.length; k++) {
          const r = this.remotes.get(q[k]);
          if (!r || (mine >= 0 && mine < k) || Phaser.Math.Distance.Between(p.x, p.y, r.sprite.x, r.sprite.y) > 45) continue;
          const id = q[k], who = r.owner.name;
          return { name: 'cut', key: 'cut@' + id, img: r.sprite, task: { label: 'Cut in front of ' + who + ' (steal their place in the line)', seconds: 0, cooldown: 20, done: () => { VM.net.send('qcut', { place, target: id }); return null; } } };
        }
      }
      // a player next to you: swap goods (online there is no money)
      const st = VM.net.room.state;
      for (const [id, r] of this.remotes) {
        const rp = st.players.get(id);
        if (!rp || !rp.alive || rp.injured || rp.asleep || Phaser.Math.Distance.Between(p.x, p.y, r.sprite.x, r.sprite.y) > 36) continue;
        const name = r.owner.name;
        return { name: 'swap', key: 'swap@' + id, img: r.sprite, task: { label: 'Swap goods with ' + name, seconds: 0, done: () => { VM.swap.open(id, name); return null; } } };
      }
      const o = this.findOnlineSpot(); if (o) return o; // the village bell (roles.js)
    }
    if (this.inBoat) {
      // next to land or a jetty: get out of the boat (E / Use); out on the water: fish
      const S = VM.TILE, tx = Math.floor(p.x / S), ty = Math.floor((p.y - 3) / S);
      let land = null;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const t = this.tileAt(tx + dx, ty + dy);
        if (t >= 0 && t !== VM.T.WATER) { land = { x: (tx + dx + 0.5) * S, y: (ty + dy + 0.5) * S + 4 }; break; }
      }
      if (land) return { name: 'leaveBoat', key: 'leaveBoat', task: { label: 'Get out of the boat', seconds: 0, done: () => { this.leaveBoat(); this.player.body.reset(land.x, land.y); return 'You got out of the boat.'; } } };
      return { name: 'fish', key: 'fish', task: VM.task('fish') };
    }
    if (this.inTractor) return { name: 'tractorOut', key: 'tractorOut', task: VM.task('tractorOut') };
    if (!this.ghost && Phaser.Math.Distance.Between(p.x, p.y, this.tractor.x, this.tractor.y) < 50) {
      const st = this.online && VM.net.room && VM.net.room.state;
      const driver = st && st.tractorBy && st.tractorBy !== VM.net.room.sessionId && st.players.get(st.tractorBy);
      if (driver) return { name: 'tractorBusy', key: 'tractorBusy', img: this.tractor, task: { label: driver.name + ' is driving the tractor', seconds: 0, done: () => driver.name + ' is driving the tractor. There is only one.' } };
      return { name: 'tractor', key: 'tractor', task: VM.task('tractor'), img: this.tractor };
    }

    // Your house at dusk or night: go to bed
    if (this.homeSpot && (this.isDusk || this.isNight) && Phaser.Math.Distance.Between(p.x, p.y, this.homeSpot.x, this.homeSpot.y) < 50) {
      return { name: 'sleep', key: 'sleep', task: VM.task('sleep'), img: this.homeSpot.img };
    }
    // Someone else's house or animals at night: you could steal (and your name will be shown)
    if (this.isNight && !this.ghost) {
      for (const a of this.animals) {
        const owner = a.texture.key === 'cow' ? this.farmOwner : a.texture.key === 'chicken' ? this.henOwner : null;
        if (owner && Phaser.Math.Distance.Between(p.x, p.y, a.x, a.y) < 36) {
          return { name: 'stealAnimal', key: 'stealAnimal', task: VM.task('stealAnimal'), animal: a, owner, img: a, label: this.isOriginalThief() ? `Steal ${owner.name}'s ${a.texture.key} (Rs 80 for the thieves)` : `Steal ${owner.name}'s ${a.texture.key} for meat (your name will be shown)` };
        }
      }
      for (const s of this.spots) {
        if (s.name === 'house' && Phaser.Math.Distance.Between(p.x, p.y, s.x, s.y) < 50) {
          return { name: 'steal', key: 'steal@' + s.key, task: VM.task('steal'), owner: s.owner, img: s.img, label: this.isOriginalThief() ? `Rob ${s.owner.name}'s house (Rs 60 for the thieves)` : `Steal from ${s.owner.name}'s house (your name will be shown)` };
        }
      }
    }
    // A villager next to you: trade
    for (const b of this.bots) {
      if (!b.asleep && Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y) < 34) {
        return { name: 'trade', key: 'trade', task: VM.task('trade'), owner: b.owner, label: 'Trade with ' + b.owner.name, img: b };
      }
    }

    for (const e of this.elephants) {
      if (!e.leaving && Phaser.Math.Distance.Between(p.x, p.y, e.x, e.y) < 80) return { name: 'elephant', key: 'elephant', task: VM.task('elephant'), elephant: e, img: e, scene: this };
    }
    for (const b of this.boats) {
      if (Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y) < 46) return { name: 'boat', key: 'boat', task: VM.task('boat'), boat: b, img: b };
    }
    let best = null, bestDist = Infinity;
    for (const s of this.spots) {
      const d = Phaser.Math.Distance.Between(p.x, p.y, s.x, s.y);
      if (d < s.r && d < bestDist) { best = s; bestDist = d; }
    }
    if (best && this.online && VM.QUEUE_PLACES[best.name]) {
      const q = this.queueAt(best.name), me = VM.net.room.sessionId, k = q.indexOf(me);
      if (k > 0) return Object.assign({}, best, { label: 'Wait for your turn: you are number ' + (k + 1) + ' in the line' });
      if (k < 0 && q.length) return Object.assign({}, best, { label: 'Join the line at the ' + VM.QUEUE_PLACES[best.name] + ' (' + q.length + ' waiting)' });
    }
    if (best) return best;

    // Otherwise, look at the ground under your feet
    const S = VM.TILE, tx = Math.floor(p.x / S), ty = Math.floor((p.y - 3) / S);
    const here = this.tileAt(tx, ty);
    if (here === VM.T.PADDY || here === VM.T.STUBBLE) {
      // online: the paddy area is 6 plots; only the owner harvests a plot
      const plot = VM.paddyPlotAt(this.world, tx, ty);
      if (plot >= 0 && !this.ghost && !this.online) {
        if (this.myPlot === undefined) return { name: 'buyPaddy', key: 'buyPaddy', tile: { x: tx, y: ty }, task: { label: 'Buy this paddy plot for Rs ' + VM.PADDY_PRICE, seconds: 0,
          check: () => (VM.state.inv.money >= VM.PADDY_PRICE ? null : 'You need Rs ' + VM.PADDY_PRICE + ' to buy a paddy plot.'),
          done: () => { VM.give('money', -VM.PADDY_PRICE); this.myPlot = plot; return 'You bought a paddy plot! Harvest it, and it grows back in 6 minutes.'; } } };
        if (plot !== this.myPlot) return { name: 'notYours', key: 'notYours', tile: { x: tx, y: ty }, task: { label: 'Paddy plot (you already own one)', seconds: 0, done: () => 'You can own only one paddy plot. Harvest your own.' } };
        if (here === VM.T.STUBBLE) return { name: 'growing', key: 'growing', tile: { x: tx, y: ty }, task: { label: 'Your paddy is growing (6 minutes)', seconds: 0, done: () => 'This paddy is still growing. It takes 6 minutes.' } };
      }
      if (plot >= 0 && !this.ghost && this.online) {
        const st = VM.net.room.state, owner = st.paddy.get(String(plot)), me = VM.net.room.sessionId;
        if (!owner) {
          const mine = [...st.paddy.values()].includes(me);
          return { name: 'buyPaddy', key: 'buyPaddy', tile: { x: tx, y: ty }, task: { label: mine ? 'Paddy plot for sale (you already own one)' : 'Buy this paddy plot for Rs ' + VM.PADDY_PRICE, seconds: 0,
            check: () => (mine ? 'You already own a paddy plot. One each.' : VM.state.inv.money >= VM.PADDY_PRICE ? null : 'You need Rs ' + VM.PADDY_PRICE + '. Aswasuma money comes every morning.'),
            done: () => { VM.net.send('buyPaddy', { plot }); this.pendingPaddy = plot; return null; } } };
        }
        if (owner !== me) {
          const name = (st.players.get(owner) || {}).name || 'Someone';
          return { name: 'notYours', key: 'notYours', tile: { x: tx, y: ty }, task: { label: name + "'s paddy", seconds: 0, done: () => 'This is ' + name + "'s paddy plot. Swap with them for paddy." } };
        }
        if (here === VM.T.STUBBLE) return { name: 'growing', key: 'growing', tile: { x: tx, y: ty }, task: { label: 'Your paddy is growing (6 minutes)', seconds: 0, done: () => 'This paddy is still growing. It takes 6 minutes.' } };
      }
      if (here === VM.T.PADDY) return { name: 'paddy', key: 'paddy@' + tx + ',' + ty, task: VM.task('paddy'), tile: { x: tx, y: ty } };
    }
    // the jungle: hunt for wild meat
    if (here === VM.T.FOREST && !this.ghost) return { name: 'hunt', key: 'hunt', task: VM.task('hunt'), tile: { x: tx, y: ty } };
    if (here === VM.T.STUBBLE && this.gardenOwner.has(tx + ',' + ty)) return { name: 'eaten', key: 'eaten', tile: { x: tx, y: ty }, task: { label: 'An elephant ate these vegetables', seconds: 0, done: () => 'An elephant ate the vegetables here. They grow back in 3 minutes.' } };
    if (here === VM.T.GARDEN) {
      const owner = this.gardenOwner.get(tx + ',' + ty) || null;
      if (owner && owner.deadLand) return { name: 'deadLand', key: 'deadLand', tile: { x: tx, y: ty }, task: { label: 'Birds ate everything here', seconds: 0, done: () => 'Birds ate all the vegetables. Nothing grows here any more.' } };
      if (owner && owner.isPlayer && !this.landOwned && !this.ghost) {
        return { name: 'buyLand', key: 'buyLand', tile: { x: tx, y: ty }, task: { label: 'Buy this land for Rs ' + VM.LAND_PRICE + ' (then grow vegetables here)', seconds: 0,
          check: () => (VM.state.inv.money >= VM.LAND_PRICE ? null : 'You need Rs ' + VM.LAND_PRICE + ' to buy this land.'),
          done: () => { VM.give('money', -VM.LAND_PRICE); this.landOwned = true; if (this.online) VM.net.send('buyLand'); this.completeJob('garden'); return 'You bought your land! Grow vegetables here, then swap them with other villagers.'; } } };
      }
      if (this.online && owner && !owner.isPlayer && !this.ghost) {
        const op = owner.id && VM.net.room && VM.net.room.state.players.get(owner.id);
        if (!op || !op.land) return { name: 'notYours', key: 'notYours', tile: { x: tx, y: ty }, task: { label: owner.name + "'s land (not bought yet)", seconds: 0, done: () => 'Nothing grows here yet: ' + owner.name + ' has not bought this land. Buy your own land (Rs ' + VM.LAND_PRICE + ') by your house.' } };
        // someone else's land: you may pick, but it costs Rs 10 each time (buying your own land pays off)
      }
      const label = !owner ? 'Pick vegetables' : owner.isPlayer ? 'Pick vegetables (your garden)' : `Pick vegetables (${owner.name}'s garden, pay Rs ${VM.GARDEN_PRICE})`;
      return { name: 'garden', key: 'garden@' + tx + ',' + ty, task: VM.task('garden'), owner, label, tile: { x: tx, y: ty } };
    }
    return null;
  }

  updateInteraction(time, dt) {
    const pressed = Phaser.Input.Keyboard.JustDown(this.keys.E) || Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || VM.input.action;
    VM.input.action = false;
    if (VM.input.eat) { VM.input.eat = false; if (!VM.helpOpen) this.eat(); }
    if (VM.helpOpen) { VM.ui.prompt(null); this.marker.setVisible(false); return; }

    if (this.task) {
      if (this.player.body.speed > 1) {
        this.task = null;
        VM.ui.progress(null);
        VM.ui.toast('Stand still to finish a task.');
      } else {
        this.task.elapsed += dt;
        const t = this.task.spot.task;
        const f = this.task.elapsed / t.seconds;
        VM.ui.progress(Math.min(1, f), (this.task.spot.label || t.label) + '…');
        if (f >= 1) { const spot = this.task.spot; this.task = null; VM.ui.progress(null); this.finish(spot, time); }
      }
    }

    const spot = this.task ? null : this.findSpot();
    if (!spot) { VM.ui.prompt(null); this.marker.setVisible(false); return; }

    const wait = Math.ceil(((this.cooldowns.get(spot.key) || 0) - time) / 1000);
    const label = spot.label || spot.task.label;
    VM.ui.prompt(wait > 0 ? label + ' (ready in ' + wait + ' s)' : label);
    if (spot.img) this.marker.setVisible(true).setPosition(spot.img.x, spot.img.y - spot.img.displayHeight - 4 + Math.sin(time / 180) * 3);
    else this.marker.setVisible(false);

    if (pressed) this.begin(spot, time);
  }

  begin(spot, time) {
    const t = spot.task;
    if (this.online && !this.ghost && VM.QUEUE_PLACES[spot.name]) {
      const q = this.queueAt(spot.name), me = VM.net.room.sessionId, k = q.indexOf(me);
      if (k < 0) {
        VM.net.send('qjoin', { place: spot.name });
        if (q.length) { VM.ui.toast('You joined the line at the ' + VM.QUEUE_PLACES[spot.name] + '. Wait for your turn.'); return; }
      } else if (k > 0) { VM.ui.toast('Wait for your turn: you are number ' + (k + 1) + '.'); return; }
    }
    const readyAt = this.cooldowns.get(spot.key) || 0;
    if (time < readyAt) { VM.ui.toast('Not ready yet. Try again in ' + Math.ceil((readyAt - time) / 1000) + ' s.'); return; }
    const reason = t.check && t.check(spot);
    if (reason) { VM.ui.toast(reason); VM.sound.play('error'); return; }
    if (!t.seconds) { this.finish(spot, time); return; }
    this.task = { spot, elapsed: 0 };
  }

  finish(spot, time) {
    const t = spot.task;
    // online, a thief only pretends to do honest work: it looks the same to the others, but gives nothing
    const pretend = this.online && this.me.role === 'thief' && VM.HONEST_WORK.includes(spot.name);
    const message = pretend ? VM.pretendMessage(spot) : t.done(this, spot);
    if (this.online && !this.ghost && VM.QUEUE_PLACES[spot.name]) VM.net.send('qdone', { place: spot.name });
    if (message) { VM.ui.toast(message); VM.sound.play('task'); }
    if (t.cooldown) this.cooldowns.set(spot.key, time + t.cooldown * 1000);
    if (spot.name === 'paddy') {
      this.setTile(spot.tile.x, spot.tile.y, VM.T.STUBBLE);
      this.regrow.push({ x: spot.tile.x, y: spot.tile.y, at: time + VM.PADDY_REGROW_MS });
    }
    const job = { well: 'well', paddy: 'paddy', cookhut: 'cookhut', tree: 'wood', tree2: 'wood', jungletree: 'wood' }[spot.name];
    if (job) this.completeJob(job);
    if (spot.name === 'garden' && spot.owner && spot.owner.isPlayer) this.completeJob('garden');
  }

  // an electric fence around a block of tiles: posts, wires and small sparks
  drawFence(r) {
    const S = VM.TILE, x0 = r.x * S + 2, y0 = r.y * S + 2, x1 = (r.x + r.w) * S - 2, y1 = (r.y + r.h) * S - 2;
    const g = this.add.graphics().setDepth(y1 + 1);
    g.lineStyle(3, 0x2b2b2b, 0.9); g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    g.lineStyle(2, 0xffe14a, 1); g.strokeRect(x0, y0 - 3, x1 - x0, y1 - y0);
    g.fillStyle(0x5a3a1e);
    for (let x = x0; x <= x1; x += 20) { g.fillRect(x - 2.5, y0 - 10, 5, 14); g.fillRect(x - 2.5, y1 - 10, 5, 14); }
    for (let y = y0; y <= y1; y += 20) { g.fillRect(x0 - 2.5, y - 10, 5, 14); g.fillRect(x1 - 2.5, y - 10, 5, 14); }
    g.fillStyle(0xffe14a); [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].forEach(([x, y]) => g.fillCircle(x, y - 10, 3)); // warning lights on the corners
    const bolt = this.add.text(x1, y0, '⚡', { fontSize: '14px' }).setOrigin(0.5).setDepth(y1 + 2);
    this.tweens.add({ targets: bolt, alpha: 0.2, duration: 400, yoyo: true, repeat: -1 });
    this.fenceGfx.push(g, bolt);
  }

  // is this tile inside an electric fence?
  fencedAt(tx, ty) {
    if (!this.online || !this.fencedPlots) return false;
    if (this.fencedPlots.has(VM.paddyPlotAt(this.world, tx, ty))) return true;
    const owner = this.gardenOwner.get(tx + ',' + ty);
    if (!owner) return false;
    for (const hi of this.fencedHouses) { const ho = this.houseObjs[hi]; if (ho && ho.owner === owner) return true; }
    return false;
  }

  zap(e) {
    const t = this.add.text(e.x, e.y - 50, '⚡ Bzzt!', { fontFamily: 'Segoe UI, Arial, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#ffe14a', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(e.y + 100);
    this.tweens.add({ targets: t, y: t.y - 24, alpha: 0, duration: 900, onComplete: () => t.destroy() });
    e.setTint(0xffff66); this.time.delayedCall(250, () => e.active && e.clearTint());
  }

  // is the player close enough to read a FOR SALE sign?
  nearSign(sign, dist) {
    return Phaser.Math.Distance.Between(this.player.x, this.player.y, sign.x, sign.y) < (dist || 90);
  }

  updateRegrow(time) {
    this.regrow = this.regrow.filter((g) => {
      if (time < g.at) return true;
      this.setTile(g.x, g.y, g.tile || VM.T.PADDY);
      return false;
    });
  }

  // ------------------------------------------------------------------ first jobs and the guide arrow
  completeJob(id) {
    if (this.jobsDone.has(id)) return;
    this.jobsDone.add(id);
    VM.ui.jobs(this.jobsDone);
    if (this.jobsDone.size === VM.JOBS.length) VM.ui.toast(this.ghost ? 'All ghost jobs done! Keep watching the thieves.' : 'All first jobs done! Now you know the village.');
    else VM.ui.showTask(this.jobsDone);
  }

  jobTarget() {
    const job = VM.JOBS.find((j) => !this.jobsDone.has(j.id));
    if (!job) return null;
    const spotOf = (name) => this.spots.find((s) => s.name === name);
    switch (job.id) {
      case 'home': return this.homeSpot;
      case 'paddy': return this.world.fields;
      case 'garden': return this.me.gardenCentre;
      case 'wood': {
        let best = this.world.jungle, bd = Infinity;
        for (const s of this.spots) if (TREE_TYPES.includes(s.name)) { const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, s.x, s.y); if (d < bd) { bd = d; best = s; } }
        return best;
      }
      case 'eat': return null;
      case 'sleep': return this.homeSpot;
      case 'trade': {
        let best = null, bd = Infinity;
        for (const b of this.bots) if (!b.asleep) { const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, b.x, b.y); if (d < bd) { bd = d; best = b; } }
        return best;
      }
      default: return spotOf(job.id);
    }
  }

  updateGuide(time) {
    if (this.homeSpot && !this.jobsDone.has('home') && Phaser.Math.Distance.Between(this.player.x, this.player.y, this.homeSpot.x, this.homeSpot.y) < 70) {
      this.completeJob('home');
      VM.ui.toast(this.ghost ? 'The white flags flutter for you.' : 'This is your house. Your garden is next to it.');
    }
    if (time - (this.lastGuide || 0) > 250) { this.lastGuide = time; this.guideTarget = this.jobTarget(); }
    // at dusk the arrow always points home
    const t = (this.isDusk || this.isNight) && this.playerOutside() ? this.homeSpot : this.guideTarget;
    const p = this.player;
    if (!t || VM.helpOpen || this.sleeping || Phaser.Math.Distance.Between(p.x, p.y, t.x, t.y) < 80) { this.guide.setVisible(false); return; }
    const a = Math.atan2(t.y - p.y, t.x - p.x);
    const bob = 40 + Math.sin(time / 200) * 3;
    this.guide.setVisible(true).setRotation(a).setPosition(p.x + Math.cos(a) * bob, p.y - 18 + Math.sin(a) * bob);
  }

  changeClothes() {
    this.outfitIndex = (this.outfitIndex + 1) % VM.OUTFITS.length;
    const o = VM.OUTFITS[this.outfitIndex];
    this.player.outfit = o;
    this.player.anims.stop();
    this.player.setTexture('char-' + o.key, { down: 0, up: 3, side: 6 }[this.player.facing]);
    VM.net.send('outfit', o.key);
    VM.ui.toast('New clothes. Clothes never show a secret role.');
  }

  // ------------------------------------------------------------------ day and night
  // PROTOTYPE: this clock runs on your computer. In Phase 2 the server runs it for everyone.
  // N key (testing): offline the clock skips here; online the server's clock is the only clock, so we ask it.
  nextPhase() {
    if (this.online) { VM.net.send('skipPhase'); return; }
    this.setPhase((this.phaseIndex + 1) % VM.SCHEDULE.length);
  }

  setPhase(index, first) {
    this.phaseIndex = index;
    const p = VM.SCHEDULE[this.phaseIndex];
    this.phaseLeft = p.seconds;
    this.setNight(p.night);
    VM.ui.clock(p.label, this.phaseLeft, p.night);
    if (first) return;
    if (this.phaseIndex === 0) VM.ui.toast('New match. In the full game, secret roles are dealt now.');
    else if (p.night) VM.ui.toast(p.label + ': everyone looks the same in the dark. Thieves move at night.');
    else if (this.phaseIndex === VM.SCHEDULE.length - 1) VM.ui.toast('Final resolution. Results come in Phase 3.');
    else VM.ui.toast(p.label + ' begins. Remember to eat today.');
  }

  setNight(on) {
    if (on === this.isNight) return;
    this.isNight = on;
    this.isDusk = false;
    this.nightStart = this.time.now;
    VM.sound.play(on ? 'night' : 'morning');
    VM.sound.ambient(on ? 'night' : 'day');
    this.tweens.add({ targets: this.nightLayer, alpha: on ? 1 : 0, duration: 2000 });
    this.tweens.add({ targets: this.lights, alpha: on ? 0.85 : 0, duration: 2000 });
    this.tweens.add({ targets: this.playerLight, alpha: on ? 0.5 : 0, duration: 2000 });
    this.fireflies.forEach((f, i) => this.tweens.add({ targets: f, alpha: on ? 0.9 : 0, duration: 1500 + i * 20 }));
    // At night anyone outside is a black shape: no names, no colours, nobody knows who is who.
    for (const v of this.villagers) { if (on) v.setTintFill(0x0c0c10); else v.clearTint(); }
    if (this.ghost) this.player.setTint(0x9fd8ff);
    this.placeLabels.forEach((l) => l.setVisible(!on));
    const mafia = this.online && VM.net.room && VM.net.room.state.mode === 'mafia';
    if (on && !mafia) {
      this.spawnElephants();
      if (this.playerOutside()) VM.ui.banner('Night', 'You are outside!', 'Elephants are coming. Run home and sleep (E at your house).', true);
    } else if (!on) {
      // At dawn the elephants that roamed the village go back to the jungle.
      // The ones in the paddy fields and in gardens stay until 2 people chase them away.
      this.elephants.forEach((e) => { if (e.roams) e.leaving = true; });
      this.morning();
      if (this.elephants.some((e) => !e.leaving)) {
        VM.ui.toast('Elephants are still in the fields. It takes 2 people to chase one back to the jungle.');
      }
    }
  }

  updateClock(dt) {
    if (VM.helpOpen && !this.online) return;
    // online the clock waits in the lobby, during meetings and after the match (roles.js shows those)
    if (this.online && this.stage && this.stage !== 'playing') { VM.ui.clockEl.classList.remove('dusk'); this.lastShown = null; return; }
    if (this.online && VM.net.room.state.mode === 'mafia' && VM.net.room.state.mstep) return; // Classic Mafia: mafia.js shows the clock
    this.phaseLeft = Math.max(0, this.phaseLeft - dt);
    if (this.phaseLeft <= 0 && !this.online) this.nextPhase(); // online: wait for the server's next phase
    const p = VM.SCHEDULE[this.phaseIndex];
    const next = VM.SCHEDULE[this.phaseIndex + 1];

    // Dusk: the last seconds of a day before a night. The sky darkens and everyone must go to bed.
    const dusk = !p.night && next && next.night && this.phaseLeft < VM.DUSK_SECONDS;
    if (dusk && !this.isDusk) {
      this.isDusk = true;
      if (this.playerOutside()) VM.ui.banner('Night is coming', 'Go home and sleep', 'Be in bed before dark, or the elephants may kill you.', true);
    }
    if (dusk && !this.isNight) this.nightLayer.setAlpha((1 - this.phaseLeft / VM.DUSK_SECONDS) * 0.45);
    VM.ui.clockEl.classList.toggle('dusk', dusk);

    const shown = Math.ceil(this.phaseLeft);
    if (shown !== this.lastShown) { this.lastShown = shown; VM.ui.clock(p.label, this.phaseLeft, p.night); }
  }

  // ------------------------------------------------------------------ sleeping, elephants killing, mornings
  sleep() {
    this.sleeping = true;
    this.task = null;
    this.player.setVelocity(0, 0).setVisible(false);
    this.completeJob('sleep');
    VM.ui.sleep(true, () => this.wakeUp(true));
    return 'Good night. You are safe in your house.';
  }

  wakeUp(early) {
    if (!this.sleeping) return;
    this.sleeping = false;
    VM.ui.sleep(false);
    this.player.setVisible(true).setPosition(this.me.house.x, this.me.house.y + 26);
    VM.net.send('respawn');
    VM.ui.toast(early ? 'You went outside in the dark. Watch out for elephants!' : 'Good morning! You slept safely.');
    if (early && this.isNight && !this.isOriginalThief()) this.elephantInMyGarden();
  }

  botSleep(b) {
    b.asleep = true;
    b.setVelocity(0, 0).setVisible(false);
    b.body.enable = false;
  }

  killPlayer(message) {
    if (this.ghost) return;
    // online a death is for the rest of the match: tell the server (it checks it is night and you are outside)
    if (this.online) {
      if (this.stage !== 'playing') return; // no deaths in the lobby
      this.deathMessage = message;
      VM.net.send('died', { cause: 'elephant' });
      // everything you carried falls on the ground
      const items = {};
      for (const [k, v] of Object.entries(VM.state.inv)) if (v > 0) { items[k] = v; VM.state.inv[k] = 0; }
      if (Object.keys(items).length) { VM.net.send('drop', { x: Math.round(this.player.x), y: Math.round(this.player.y), items }); VM.ui.inventory(); }
      this.becomeGhost(message);
      VM.fx.funeral(VM.net.myState() ? VM.net.myState().name : ''); // the same funeral screen and violin as any death
      return;
    }
    VM.fx.funeral(this.me.realName || this.me.name);
    this.ghost = true;
    this.task = null; VM.ui.progress(null);
    VM.ui.closeTrade();
    this.player.setTint(0x9fd8ff).setAlpha(0.55);
    VM.ui.banner('You are out', message, 'You are a ghost until morning (test version). In the real game you watch until the match ends.', true);
  }

  morning() {
    if (this.sleeping) this.wakeUp(false);
    // practice mode: Aswasuma when you wake up (online the server sends it to everyone)
    if (!this.online && !this.ghost) this.time.delayedCall(2500, () => { const amount = VM.ASWASUMA[0] + Math.floor(Math.random() * (VM.ASWASUMA[1] - VM.ASWASUMA[0] + 1)); VM.give('money', amount); VM.sound.play('loot'); VM.aswasuma(amount); });
    if (this.ghost && !this.online) {
      this.ghost = false;
      this.player.clearTint().setAlpha(1).setPosition(this.me.house.x, this.me.house.y + 26);
      VM.net.send('respawn');
      VM.ui.toast('Morning: you are back in the village (test version only).');
    }
    for (const b of this.bots) {
      if (!b.asleep) continue;
      b.asleep = false;
      b.body.enable = true;
      b.setVisible(true).setPosition(b.owner.house.x, b.owner.house.y + 26);
      b.nextTurn = 0;
    }
  }

  removeAnimal(a) {
    this.animals = this.animals.filter((x) => x !== a);
    a.disableBody(true, true); // hidden and switched off (safer than destroying it while colliders use it)
  }

  // A villager (not an original thief) who steals: their name is shown to everyone, even at night.
  exposeStealer(v, victim) {
    v.exposed = true;
    v.label.setText(v.owner.name + ' · stole!').setBackgroundColor('#d63a2f').setColor('#ffffff');
    VM.ui.toast(`${victim.name}'s house was robbed by ${v.owner.isPlayer ? 'you' : v.owner.name}. Everyone knows.`);
  }

  // ------------------------------------------------------------------ multiplayer (Phase 2)
  // Every frame: show the other real players where the server says they are, follow the server's clock,
  // and tell the server where you are (about 15 times a second).
  syncNet(time, dt) {
    const room = VM.net.room;
    if (!room || !room.state || !room.state.players) return; // reconnecting: keep playing locally
    const seen = new Set();
    room.state.players.forEach((p, id) => {
      if (id === room.sessionId) return;
      seen.add(id);
      const r = this.remotes.get(id) || this.addRemote(id, p);
      const s = r.sprite;
      if (s.outfit.key !== p.outfit) { s.outfit = VM.outfitByKey(p.outfit); s.setTexture('char-' + s.outfit.key, 0); }
      const dx = p.x - s.x, dy = p.y - s.y;
      if (Math.hypot(dx, dy) > 300) s.setPosition(p.x, p.y);           // far away (respawn): jump
      else { const k = Math.min(1, dt * 12); s.setPosition(s.x + dx * k, s.y + dy * k); } // smooth
      s.facing = p.facing;
      s.setFlipX(p.flip);
      if (p.moving) s.anims.play(s.outfit.key + '-' + p.facing, true);
      else { s.anims.stop(); s.setFrame({ down: 0, up: 3, side: 6 }[p.facing] || 0); }
      s.setVisible(!p.asleep);
      s.setAlpha(p.connected ? 1 : 0.45);
      if (p.inWater !== !!r.inWater) {
        r.inWater = p.inWater;
        if (p.inWater) s.setCrop(0, 0, VM.CHAR_W * VM.CHAR_ART, VM.CHAR_H * VM.CHAR_ART * 0.6); else s.setCrop();
        if (!r.help) r.help = this.add.text(0, 0, 'Help!', { fontFamily: 'Segoe UI, Arial, sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#1d1d1d', backgroundColor: '#ffffff', padding: { x: 5, y: 2 } }).setOrigin(0.5, 1).setResolution(2).setDepth(200001);
        r.help.setVisible(p.inWater);
      }
      if (r.inWater && r.help) r.help.setPosition(s.x, s.y - 48 + Math.sin(time / 150) * 2);
    });
    for (const id of [...this.remotes.keys()]) if (!seen.has(id)) this.removeRemote(id);
    // the vegetable land: FOR SALE, or the owner's name once bought
    const day = room.state.stage === 'playing' && !this.isNight;
    room.state.players.forEach((p, id) => {
      const ho = this.houseObjs[p.house];
      if (!ho || !ho.sign) return;
      const text = p.land ? (id === room.sessionId ? 'Your vegetables' : p.name + "'s vegetables") : 'FOR SALE · Rs ' + VM.LAND_PRICE;
      if (ho.sign.text !== text) ho.sign.setText(text).setBackgroundColor(p.land ? VM.colourByKey(p.colour).hex : '#ffd25a').setFontSize(p.land ? 10 : 12).setAlpha(p.land ? 0.85 : 1);
      ho.sign.setVisible(day && (p.land || this.nearSign(ho.sign)));
      if (ho.sprouts) ho.sprouts.setVisible(!p.land);
    });
    // the paddy plots
    if (!this.paddySigns) {
      this.paddySigns = [];
      for (let i = 0; i < 6; i++) {
        const c = VM.paddyPlotCentre(this.world, i);
        this.paddySigns.push(this.add.text(c.x, c.y, '', { fontFamily: 'Segoe UI, Arial, sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#1d1d1d', align: 'center', padding: { x: 5, y: 2 } }).setOrigin(0.5).setResolution(2).setDepth(c.y + 60));
      }
    }
    this.paddySigns.forEach((sg, i) => {
      const owner = room.state.paddy.get(String(i)), op = owner && room.state.players.get(owner);
      const text = op ? (owner === room.sessionId ? 'Your paddy' : op.name + "'s paddy") : 'FOR SALE · Rs ' + VM.PADDY_PRICE;
      if (sg.text !== text) sg.setText(text).setBackgroundColor(op ? VM.colourByKey(op.colour).hex : '#ffd25a').setFontSize(op ? 10 : 12).setAlpha(op ? 0.85 : 1);
      sg.setVisible(day && (!!op || this.nearSign(sg, 150)));
    });
    // goods dropped on the ground (a sack where an elephant trampled someone)
    if (!this.dropSprites) this.dropSprites = new Map();
    room.state.drops.forEach((raw, id) => {
      if (this.dropSprites.has(id)) return;
      const d = JSON.parse(raw);
      const img = this.add.text(d.x, d.y, '💰', { fontSize: '22px' }).setOrigin(0.5, 1).setDepth(d.y);
      this.tweens.add({ targets: img, y: d.y - 4, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.dropSprites.set(id, { x: d.x, y: d.y, by: d.by, img });
    });
    for (const [id, d] of this.dropSprites) if (!room.state.drops.has(id)) { d.img.destroy(); this.dropSprites.delete(id); }
    // electric fences (everyone sees them)
    const mine = room.state.players.get(room.sessionId);
    if (this.pendingFence && mine && (this.pendingFence === 'paddy' ? mine.fencePaddy : mine.fenceGarden)) {
      VM.give('money', -VM.FENCE_PRICE);
      VM.ui.toast('Electric fence built around your ' + (this.pendingFence === 'paddy' ? 'paddy plot' : 'vegetable garden') + '! Elephants cannot eat it now.');
      VM.sound.play('task'); this.pendingFence = null;
    }
    this.fencedPlots = new Set(); this.fencedHouses = new Set();
    room.state.players.forEach((p, pid) => {
      if (p.fenceGarden) this.fencedHouses.add(p.house);
      if (p.fencePaddy) room.state.paddy.forEach((owner, plot) => { if (owner === pid) this.fencedPlots.add(Number(plot)); });
    });
    const fenceKey = [...this.fencedPlots].join(',') + '|' + [...this.fencedHouses].join(',');
    if (fenceKey !== this.fenceKey) {
      this.fenceKey = fenceKey;
      (this.fenceGfx || []).forEach((o) => o.destroy());
      this.fenceGfx = [];
      this.fencedPlots.forEach((i) => this.drawFence(VM.paddyPlotRect(this.world, i)));
      this.fencedHouses.forEach((hi) => { const ho = this.houseObjs[hi]; if (ho && ho.h && ho.h.garden) this.drawFence(ho.h.garden); });
    }
    // my paddy plot was bought: pay for it
    if (this.pendingPaddy !== undefined && room.state.paddy.get(String(this.pendingPaddy)) === room.sessionId) {
      VM.give('money', -VM.PADDY_PRICE); this.pendingPaddy = undefined;
      VM.ui.toast('You bought a paddy plot! Harvest it, and it grows back in 6 minutes.');
    }
    // the one tractor: where the server says it is (unless I am driving it)
    const stt = room.state;
    if (!this.inTractor && stt.tractorX) {
      const k = Math.min(1, dt * 10);
      this.tractor.setPosition(this.tractor.x + (stt.tractorX - this.tractor.x) * k, this.tractor.y + (stt.tractorY - this.tractor.y) * k).setDepth(this.tractor.y);
      this.tractorLabel.setPosition(this.tractor.x, this.tractor.y - 34).setAlpha(stt.tractorBy ? 0 : 1);
      if (stt.tractorBy && stt.tractorBy !== room.sessionId) { // someone else drives it: chase elephants here too
        for (const e of this.elephants) if (!e.leaving && Phaser.Math.Distance.Between(this.tractor.x, this.tractor.y, e.x, e.y) < 75) this.scareElephant(e);
      }
    }
    this.netReady = true; // from now on, new players get a "joined" message

    // the server's clock is the match clock
    if (room.state.phase !== this.phaseIndex) { this.setPhase(room.state.phase); this.phaseLeft = room.state.phaseLeft; }
    if (Math.abs(this.phaseLeft - room.state.phaseLeft) > 1.5) this.phaseLeft = room.state.phaseLeft;

    // my position
    const pl = this.player;
    const moving = pl.body.speed > 1;
    if (time - (this.lastSend || 0) > 66 && (moving || this.wasMoving)) {
      this.lastSend = time;
      VM.net.send('move', { x: Math.round(pl.x * 10) / 10, y: Math.round(pl.y * 10) / 10, facing: pl.facing, flip: pl.flipX, moving });
      this.wasMoving = moving;
    }
    const status = (this.sleeping ? 1 : 0) + (this.inBoat ? 2 : 0) + (this.inTractor ? 4 : 0) + (this.drowning ? 8 : 0) + (this.weak ? 16 : 0);
    if (status !== this.lastStatus) {
      this.lastStatus = status;
      VM.net.send('status', { asleep: this.sleeping, inBoat: !!this.inBoat, inTractor: this.inTractor, inWater: !!this.drowning, weak: !!this.weak });
    }
    VM.ui.netStatus(VM.net.status, room.state.players.size);
    this.syncRoles(room); // Phase 3 (roles.js)
  }

  addRemote(id, p) {
    const owner = {
      id, name: p.name, colour: VM.colourByKey(p.colour), outfit: VM.outfitByKey(p.outfit), isPlayer: false, remote: true,
      money: 0, inv: {}, houseIndex: p.house, house: this.world.houses[p.house],
    };
    const s = this.makeVillager(owner, p.x, p.y);
    owner.sprite = s;
    if (this.isNight) s.setTintFill(0x0c0c10);
    this.owners.push(owner);
    this.villagers.push(s);
    this.claimHouse(p.house, owner);
    const r = { owner, sprite: s };
    this.remotes.set(id, r);
    if (this.netReady) VM.ui.toast(p.name + ' joined the village.');
    return r;
  }

  removeRemote(id) {
    const r = this.remotes.get(id);
    if (!r) return;
    this.remotes.delete(id);
    this.releaseHouse(r.owner.houseIndex);
    this.owners = this.owners.filter((o) => o !== r.owner);
    this.villagers = this.villagers.filter((v) => v !== r.sprite);
    r.sprite.label.destroy();
    r.sprite.ring.destroy();
    if (r.help) r.help.destroy();
    r.sprite.destroy();
    VM.ui.toast(r.owner.name + ' left the village.');
  }

  openTrade(owner) {
    this.trading = owner;
    VM.ui.openTrade(owner, () => { this.trading = null; });
  }
}

// ---- bees: a swarm from the jungle chases you until you hide in any house
Object.assign(VillageScene.prototype, {
  startBees() {
    const p = this.player, now = this.time.now;
    this.bees = { x: p.x + 50, y: p.y - 40, until: now + VM.BEE_SECONDS * 1000, nextSting: now + 1500, nextBuzz: 0 };
    if (!this.beeG) this.beeG = this.add.graphics().setDepth(100002);
    VM.sound.play('buzz');
    VM.ui.banner('Bees!', 'You disturbed a bees\' nest!', 'Run to the village and hide in anyone\'s house: just reach a house door. Every sting costs food.', true);
  },
  stopBees(message) {
    if (this.bees && this.online) VM.net.send('bees', { on: false });
    this.bees = null;
    if (this.beeG) this.beeG.clear();
    if (message) VM.ui.toast(message);
  },
  updateBees(time, delta) {
    const b = this.bees; if (!b) return;
    const p = this.player;
    if (this.ghost || this.sleeping || (this.online && this.stage && this.stage !== 'playing')) return this.stopBees();
    if (time > b.until) return this.stopBees('The bees gave up and flew back to the jungle.');
    // hiding: reach any house door
    for (const ho of this.houseObjs || []) {
      const h = ho.h; if (!h) continue;
      if (Math.abs(p.x - h.x) < 40 && p.y > h.y - 10 && p.y < h.y + 46) {
        const who = ho.owner ? (ho.owner.isPlayer ? 'your' : ho.owner.name + "'s") : 'an empty';
        return this.stopBees('🏠 You hid in ' + who + ' house. The bees flew away!');
      }
    }
    const dt = Math.min(0.05, (delta || 16) / 1000);
    const dx = p.x - b.x, dy = (p.y - 20) - b.y, d = Math.hypot(dx, dy) || 1;
    b.x += dx / d * VM.BEE_SPEED * dt; b.y += dy / d * VM.BEE_SPEED * dt;
    if (time > b.nextBuzz) { b.nextBuzz = time + 520; if (d < 400) VM.sound.play('buzz'); }
    if (d < 34 && time > b.nextSting) {
      b.nextSting = time + 1100;
      VM.state.food = Math.max(0, VM.state.food - VM.BEE_STING_FOOD); VM.ui.food(VM.state.food);
      VM.sound.play('sting'); this.cameras.main.shake(120, 0.003);
      if (time > (b.nextNote || 0)) { b.nextNote = time + 5000; VM.ui.toast('🐝 Ouch! The bees are stinging you (-' + VM.BEE_STING_FOOD + ' food each). Hide in a house!'); }
    }
    // the swarm: little yellow-and-black dots buzzing round a centre
    const g = this.beeG; g.clear();
    for (let i = 0; i < 16; i++) {
      const a = time / 90 + i * 2.1, r = 8 + (i % 4) * 5;
      const x = b.x + Math.cos(a * (1 + i % 3 * 0.3)) * r, y = b.y + Math.sin(a * 1.3 + i) * r * 0.7;
      g.fillStyle(0x1c1c1c); g.fillCircle(x, y, 2.2); g.fillStyle(0xffc21a); g.fillCircle(x + 1, y, 1.4);
    }
    // everyone near the swarm is attacked too: computer villagers run, other players see it on their screen
    for (const bot of this.bots || []) {
      if (bot.active && bot.visible !== false && Phaser.Math.Distance.Between(bot.x, bot.y, b.x, b.y + 20) < 60) {
        if (!(time < bot.beeUntil) && bot.label) VM.ui.toast('🐝 The bees are attacking ' + (bot.owner ? bot.owner.name : 'a villager') + ' too!');
        bot.beeFrom = { x: b.x, y: b.y }; bot.beeUntil = time + 2500;
      }
    }
    if (this.online && time > (b.nextSend || 0)) { b.nextSend = time + 200; VM.net.send('bees', { on: true, x: Math.round(b.x), y: Math.round(b.y) }); }
  },
  // someone else's swarm (online)
  remoteBees(m) {
    if (!this.otherBees) this.otherBees = new Map();
    if (!m.on) { this.otherBees.delete(m.id); return; }
    let o = this.otherBees.get(m.id);
    if (!o) {
      o = { x: m.x, y: m.y, name: m.name, nextSting: 0 }; this.otherBees.set(m.id, o);
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, m.x, m.y) < 500) VM.ui.toast('🐝 ' + m.name + ' brought angry bees from the jungle! Stay away or hide in a house.');
    }
    o.tx = m.x; o.ty = m.y; o.seen = this.time.now;
  },
  updateOtherBees(time, delta) {
    if (!this.otherBees || !this.otherBees.size) { if (this.otherBeeG) this.otherBeeG.clear(); return; }
    if (!this.otherBeeG) this.otherBeeG = this.add.graphics().setDepth(100002);
    const g = this.otherBeeG, p = this.player, k = Math.min(1, (delta || 16) / 120);
    g.clear();
    for (const [id, o] of this.otherBees) {
      if (time - o.seen > 2500) { this.otherBees.delete(id); continue; }
      o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k;
      for (let i = 0; i < 16; i++) {
        const a = time / 90 + i * 2.1, r = 8 + (i % 4) * 5, x = o.x + Math.cos(a * (1 + i % 3 * 0.3)) * r, y = o.y + Math.sin(a * 1.3 + i) * r * 0.7;
        g.fillStyle(0x1c1c1c); g.fillCircle(x, y, 2.2); g.fillStyle(0xffc21a); g.fillCircle(x + 1, y, 1.4);
      }
      const d = Phaser.Math.Distance.Between(p.x, p.y - 20, o.x, o.y);
      if (d < 400 && time > (o.nextBuzz || 0)) { o.nextBuzz = time + 600; VM.sound.play('buzz'); }
      // it stings me too, unless I am safe (in bed, a ghost, in a boat, or at a house door)
      const atDoor = (this.houseObjs || []).some((ho) => ho.h && Math.abs(p.x - ho.h.x) < 40 && p.y > ho.h.y - 10 && p.y < ho.h.y + 46);
      if (d < 40 && time > o.nextSting && !this.ghost && !this.sleeping && !this.inBoat && !atDoor) {
        o.nextSting = time + 1100;
        VM.state.food = Math.max(0, VM.state.food - VM.BEE_STING_FOOD); VM.ui.food(VM.state.food);
        VM.sound.play('sting'); this.cameras.main.shake(120, 0.003);
        if (time > (o.nextNote || 0)) { o.nextNote = time + 5000; VM.ui.toast('🐝 ' + o.name + "'s bees are stinging you! Hide in a house!"); }
      }
    }
  },
});
