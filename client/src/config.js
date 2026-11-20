// Game settings in one place. Change numbers here rather than inside the scene code.
window.VM = window.VM || {};

VM.GAME_NAME = 'Sams Gama';

// Map size: tiles are 32 x 32 pixels.
VM.TILE = 32;
VM.MAP_W = 80;
VM.MAP_H = 54;

// Ground tile types (their pictures are drawn in textures.js, in this order).
VM.T = {
  GRASS: 0, GRASS2: 1, FLOWERS: 2, PATH: 3, PADDY: 4, BUND: 5, WATER: 6,
  PLANKS: 7, SAND: 8, GARDEN: 9, STUBBLE: 10, PLAZA: 11, FOREST: 12,
};
VM.TILE_COUNT = 13;

VM.PLAYER_SPEED = 150;
VM.HUNGRY_SPEED = 90;  // walking speed when your food bar is empty
VM.BOT_SPEED = 55;
VM.BOT_COUNT = 7;      // computer-controlled villagers, so the village feels like an 8-player match

// Match schedule from the design brief (15 minutes in total).
// In Phase 2 the game server runs this clock so every player sees the same time.
VM.SCHEDULE = [
  { label: 'Roles being dealt', seconds: 55, night: false }, // online: the bus ride and the black screen with your role
  { label: 'Day 1', seconds: 120, night: false }, // each day is 2 minutes
  { label: 'Night 1', seconds: 90, night: true },
  { label: 'Day 2', seconds: 120, night: false },
  { label: 'Night 2', seconds: 90, night: true },
  { label: 'Final day and meeting', seconds: 120, night: false },
  { label: 'Final resolution', seconds: 60, night: false },
];

// Phase 3: secret roles (dealt by the game server; nobody else's role is ever sent to your browser).
VM.ROLES = {
  thief: { name: 'Thief', colour: '#d63a2f', short: 'You start with nothing, and honest work gives you nothing (you can only pretend). At night, kill (Rs 100), rob houses (Rs 60) and take animals (Rs 80) to fill the thieves\' loot bag. Fill it, or outnumber the villagers, to win. Don\'t get voted out.' },
  police: { name: 'Police', colour: '#3e7bfa', short: 'Once a day (or night), question someone standing next to you, or at their door: you learn if they are a thief.' },
  doctor: { name: 'Doctor', colour: '#30a46c', short: 'Each night, guard one villager (stand next to them or at their door). A thief cannot kill the person you guard.' },
  villager: { name: 'Villager', colour: '#8a6d3b', short: 'Work, trade, get rich, watch the others and vote the thieves out at village meetings.' },
};
// How many of each role a match gets, from the number of players
VM.roleCounts = (n) => ({ thief: n <= 5 ? 1 : n <= 9 ? 2 : 3, police: n >= 4 ? 1 : 0, doctor: n >= 5 ? 1 : 0 });
VM.MIN_PLAYERS = 4;        // a match can start with this many players (the server allows 3 when testing)
VM.ACTION_RANGE = 60;      // pixels: how close you must be to kill, guard or question
VM.KILL_LOOT = 100;        // rupees a thief takes from a victim (PROTOTYPE: real money moves to the server in Phase 4)
VM.MEETING_SECONDS = 75;   // a village meeting: talk and vote
VM.BELL_RANGE = 70;        // ring the village bell under the big tree in the square
VM.bellSpot = (world) => {
  const t = world.objects.find((o) => o.type === 'bigtree');
  return { x: t.x + 34, y: t.y + 46 }; // the bell post stands just in front of the big tree, to the right
};

// Every player has their own colour: on their house roof, their name tag and the ring under their feet.
// 12 colours for up to 12 players.
VM.PLAYER_COLORS = [
  { key: 'red', name: 'Red', hex: '#e5484d' },
  { key: 'blue', name: 'Blue', hex: '#3e7bfa' },
  { key: 'green', name: 'Green', hex: '#30a46c' },
  { key: 'yellow', name: 'Yellow', hex: '#f5c518' },
  { key: 'orange', name: 'Orange', hex: '#f76b15' },
  { key: 'purple', name: 'Purple', hex: '#8e4ec6' },
  { key: 'pink', name: 'Pink', hex: '#e93d82' },
  { key: 'teal', name: 'Teal', hex: '#12a594' },
  { key: 'brown', name: 'Brown', hex: '#a0692e' },
  { key: 'white', name: 'White', hex: '#f2f2f2', roof: '#e2e2e2' },
  { key: 'black', name: 'Black', hex: '#2b2b2b', roof: '#3a3a3a' },
  { key: 'lime', name: 'Lime', hex: '#8fd14f' },
];

VM.colourByKey = (key) => VM.PLAYER_COLORS.find((c) => c.key === key) || VM.PLAYER_COLORS[0];
VM.outfitByKey = (key) => VM.OUTFITS.find((o) => o.key === key) || VM.OUTFITS[0];

// Village goods and their selling price at the shop (Sri Lankan rupees).
// food = how much it fills your food bar when you eat it (0 = cannot be eaten).
VM.ITEMS = {
  paddy: { label: 'Paddy', price: 50, food: 0 },
  water: { label: 'Water', price: 10, food: 0 },
  fish: { label: 'Fish', price: 80, food: 40 },  // good food
  milk: { label: 'Milk', price: 60, food: 20 },
  eggs: { label: 'Eggs', price: 15, food: 15 },
  veg: { label: 'Vegetables', price: 40, food: 15 },
  wood: { label: 'Firewood', price: 25, food: 0 },
  coconut: { label: 'Coconut', price: 40, food: 25 },
  meal: { label: 'Rice and curry', price: 150, food: 100 },
  meat: { label: 'Meat', price: 120, food: 50 },
  rice: { label: 'Plain rice', price: 30, food: 15 }, // rice alone: fills you a little (low nutrition)
};
VM.START_MONEY = 100;
VM.LAND_PRICE = 50;        // online: everyone starts with Rs 50 and buys the land next to their house with it
VM.KADE_RATE = 0.6;        // the Kade (the only shop) pays only 60% of the price: trading with villagers pays more
// What each computer villager has plenty of (they trade it with you)
VM.SPECIALTIES = ['fish', 'paddy', 'milk', 'veg', 'coconut', 'eggs', 'wood'];
VM.STORE_GOAL = 20;        // paddy the village wants in the storage house
VM.GARDEN_PRICE = 10;      // picking vegetables from someone else's land (pushes players to buy their own)

// Food: everyone must eat every day. The bar drops slowly and empties in about one day and night.
VM.FOOD_START = 100; // everyone starts a match with a full stomach (full energy)
VM.FOOD_PER_SECOND = 100 / 240;
VM.STARVE_SECONDS = 60; // online: this long with an empty food bar and you die of hunger

// Night: everyone must be in bed before dark. Elephants come out of the jungle, trample the paddy
// and roam the village. An elephant that reaches someone outside kills them.
// Online, people wait in a line at these places (one uses it at a time); you can cut in front of someone
VM.QUEUE_PLACES = { well: 'well', cookhut: 'cooking hut', kade: 'Kade' };
// Online farming: the paddy area is 6 plots (Rs 40 each, one per player); paddy grows back in 6 minutes;
// every morning each living player gets Aswasuma: a random Rs 5-20
VM.PADDY_PRICE = 40;
VM.PADDY_REGROW_MS = 6 * 60 * 1000;
VM.ASWASUMA = [5, 20];
// plot number (0-5) of a paddy tile: 3 plots across, 2 down
VM.paddyPlotAt = (world, tx, ty) => {
  const p = world.paddy;
  if (tx < p.x0 || tx >= p.x1 || ty < p.y0 || ty >= p.y1) return -1;
  const col = Math.min(2, Math.floor((tx - p.x0) / ((p.x1 - p.x0) / 3))), row = Math.min(1, Math.floor((ty - p.y0) / ((p.y1 - p.y0) / 2)));
  return row * 3 + col;
};
VM.paddyPlotCentre = (world, i) => {
  const p = world.paddy, w = (p.x1 - p.x0) / 3, h = (p.y1 - p.y0) / 2;
  return { x: (p.x0 + (i % 3 + 0.5) * w) * VM.TILE, y: (p.y0 + (Math.floor(i / 3) + 0.5) * h) * VM.TILE };
};
VM.FENCE_PRICE = 50; // an electric fence around your paddy plot or your vegetable garden
// the tiles of paddy plot i
VM.paddyPlotRect = (world, i) => {
  const p = world.paddy, w = (p.x1 - p.x0) / 3, h = (p.y1 - p.y0) / 2;
  const x0 = Math.round(p.x0 + (i % 3) * w), y0 = Math.round(p.y0 + Math.floor(i / 3) * h);
  return { x: x0, y: y0, w: Math.round(p.x0 + (i % 3 + 1) * w) - x0, h: Math.round(p.y0 + (Math.floor(i / 3) + 1) * h) - y0 };
};
// my own house, vegetable land (once bought) and paddy plot (once bought), in tiles, for the map and the 3D markers
VM.myThings = (scene) => {
  const out = [], me = scene.me;
  if (!me || !me.house) return out;
  const h = me.house;
  out.push({ kind: 'house', icon: '🏠', label: 'Your house', short: 'Home', x: h.x / VM.TILE - 1.5, y: h.y / VM.TILE - 2, w: 3, h: 2 });
  if (scene.landOwned && h.garden) out.push({ kind: 'land', icon: '🥬', label: 'Your vegetables', short: 'Veg', x: h.garden.x, y: h.garden.y, w: h.garden.w, h: h.garden.h });
  let plot = scene.myPlot;
  if (scene.online && VM.net.room) { plot = undefined; VM.net.room.state.paddy.forEach((owner, i) => { if (owner === VM.net.room.sessionId) plot = Number(i); }); }
  if (plot !== undefined && plot >= 0) { const r = VM.paddyPlotRect(scene.world, plot); out.push({ kind: 'paddy', icon: '🌾', label: 'Your paddy', short: 'Paddy', x: r.x, y: r.y, w: r.w, h: r.h }); }
  return out;
};
VM.TRACTOR_SECONDS = 15; // one tractor ride lasts this long
VM.SELF_RESCUE_SECONDS = 30; // fallen in the water: you climb out by yourself after this long (or someone pulls you out)
VM.ELEPHANTS_PER_NIGHT = 5;   // the first 3 go to the paddy fields, the rest roam the village
VM.DUSK_SECONDS = 25;         // warning time at the end of a day before night falls
VM.ELEPHANT_SEES = 260;       // how far (pixels) an elephant notices someone outside at night
VM.ELEPHANT_KILLS = 26;       // how close it must get to kill

// First jobs that teach the village. The yellow arrow points to the next one.
VM.JOBS = [
  { id: 'home', text: 'Find your house (follow the arrow)' },
  { id: 'well', text: 'Draw water at the well' },
  { id: 'paddy', text: 'Buy a paddy plot (Rs 40) and harvest it' },
  { id: 'garden', text: 'Buy your land (Rs 50) and pick vegetables' },
  { id: 'wood', text: 'Gather firewood in the jungle' },
  { id: 'cookhut', text: 'Cook rice and curry at the cooking hut' },
  { id: 'eat', text: 'Eat your meal (press F or tap Eat)' },
  { id: 'trade', text: 'Trade with a villager (walk up to them, press E)' },
  { id: 'sleep', text: 'Before dark: go home and sleep (E at your house)' },
];

VM.LIVING_JOBS = VM.JOBS;
// a ghost's jobs (the id is the place to haunt; ghosts never eat)
VM.GHOST_JOBS = [
  { id: 'home', text: 'Visit the white flags at your house' },
  { id: 'well', text: 'Haunt the well (rattle the bucket)' },
  { id: 'paddy', text: 'Float over the paddy fields' },
  { id: 'stupa', text: 'Light a lamp at the temple' },
  { id: 'cowshed', text: 'Scare the cows in the cow shed' },
  { id: 'granary', text: 'Count the paddy in the granary' },
  { id: 'workshop', text: 'Bang the tools in the workshop' },
  { id: 'bigtree', text: 'Whisper secrets at the big tree' },
  { id: 'paint', text: 'Paint someone you think is a thief' },
];
VM.GHOST_HAUNTS = {
  well: ['Rattle the bucket', 'Clank! The bucket swings by itself.'],
  paddy: ['Float over the paddy', 'The paddy sways as you drift over it.'],
  stupa: ['Light a lamp', 'A small oil lamp flickers at the temple.'],
  cowshed: ['Scare the cows', 'Mooo! The cows jump.'],
  granary: ['Count the paddy', 'You count every sack. Nobody sees you.'],
  workshop: ['Bang the tools', 'Bang! A hammer falls off the wall.'],
  bigtree: ['Whisper secrets', 'The leaves of the big tree rustle.'],
};

// Villager outfits, based on the owner's character sheet. Roles are secret,
// so clothes never show a role. man: shirt (top) + sarong (bottom).
// woman: blouse (top) + saree (bottom) with a border colour (trim) and flowers in the hair bun.
VM.OUTFITS = [
  { key: 'ruwan', name: 'Ruwan', kind: 'man', top: '#f6f3ea', bottom: '#2f55b5', pattern: 'check', extra: 'towel', extraColor: '#6f8fe0' },
  { key: 'nimal', name: 'Nimal', kind: 'man', top: '#efe3c8', collar: '#6b3a22', bottom: '#8e1f2a', pattern: 'check', extra: 'none' },
  { key: 'kasun', name: 'Kasun', kind: 'man', top: '#9cc2ea', bottom: '#4a4a6e', pattern: 'check', extra: 'none' },
  { key: 'saman', name: 'Saman', kind: 'man', top: '#93c06e', bottom: '#ece3cc', pattern: 'plain', extra: 'hat', extraColor: '#b98a4e' },
  { key: 'lahiru', name: 'Lahiru', kind: 'man', top: '#f2b630', bottom: '#2b2522', pattern: 'floral', extra: 'none' },
  { key: 'ajith', name: 'Ajith', kind: 'man', top: '#f6f3ea', bottom: '#8d8f96', pattern: 'check', extra: 'bag', extraColor: '#7a4a2a' },
  { key: 'dinesh', name: 'Dinesh', kind: 'man', top: '#a9c6ec', bottom: '#c8ad80', pattern: 'floral', extra: 'none' },
  { key: 'chamara', name: 'Chamara', kind: 'man', top: '#2f6a3a', bottom: '#ece3cc', pattern: 'plain', extra: 'cap', extraColor: '#22252e' },
  { key: 'ravi', name: 'Ravi', kind: 'man', top: '#d9726f', bottom: '#d8c3a0', pattern: 'plain', extra: 'none' },
  { key: 'bandara', name: 'Bandara', kind: 'man', top: '#f6f3ea', bottom: '#a07a4a', pattern: 'check', extra: 'hat', extraColor: '#efe2c4' },
  { key: 'mahesh', name: 'Mahesh', kind: 'man', top: '#a77bd6', bottom: '#2f55b5', pattern: 'plain', extra: 'bag', extraColor: '#7a4a2a' },
  { key: 'gamini', name: 'Gamini', kind: 'man', top: '#f6f3ea', bottom: '#2f55b5', pattern: 'check', extra: 'towel', extraColor: '#2b3550' },
  { key: 'kamala', name: 'Kamala', kind: 'woman', top: '#b8343a', bottom: '#f3e7d2', trim: '#c9573a', pattern: 'plain', flower: '#fff7e8' },
  { key: 'sita', name: 'Sita', kind: 'woman', top: '#7a3a1e', bottom: '#e0a52e', trim: '#b97a18', pattern: 'plain', flower: '#fff7e8' },
  { key: 'malini', name: 'Malini', kind: 'woman', top: '#2f4f9a', bottom: '#f1f0ea', trim: '#3f6fc8', pattern: 'floral', flower: '#fff7e8' },
  { key: 'dilani', name: 'Dilani', kind: 'woman', top: '#9b7fc4', bottom: '#b79be0', trim: '#8e6cc0', pattern: 'plain', flower: '#e9b6f0' },
  { key: 'nirosha', name: 'Nirosha', kind: 'woman', top: '#3d6b2a', bottom: '#93b84e', trim: '#5f8a2e', pattern: 'floral', flower: '#fff7e8' },
  { key: 'kusum', name: 'Kusum', kind: 'woman', top: '#e8835e', bottom: '#f09a76', trim: '#f7d2a8', pattern: 'floral', flower: '#f2e27a' },
  { key: 'anoma', name: 'Anoma', kind: 'woman', top: '#e88aa2', bottom: '#f2a9bb', trim: '#fbe0e6', pattern: 'floral', flower: '#f6c1d0' },
  { key: 'priya', name: 'Priya', kind: 'woman', top: '#2f5a2a', bottom: '#f3ecd8', trim: '#3f7a35', pattern: 'plain', flower: '#fff7e8' },
];

// Classic Mafia mode: the same roles, explained for turns and lists instead of walking around
VM.MAFIA_ROLES = {
  thief: { short: 'Each night, choose a victim together with the other thieves from a list. You can also hide stolen goods at someone\'s house so they look guilty. By day, act innocent and don\'t get voted out.', key: 'Thieves win when they are as many as the honest villagers left.' },
  police: { short: 'Each night, choose one person to check: you learn if they are a thief. Use what you know in the discussion, carefully.', key: 'If the thieves find out who you are, you are next.' },
  doctor: { short: 'Each night, choose one person to protect (yourself too). If the thieves choose them, they survive.', key: 'You learn in the morning if you saved someone.' },
  villager: { short: 'You sleep at night. By day, listen, ask questions and vote out the thieves.', key: 'Villagers win when every thief has been voted out.' },
};
VM.roleText = (role) => {
  const st = VM.net && VM.net.room && VM.net.room.state;
  return st && st.mode === 'mafia' ? VM.MAFIA_ROLES[role] : null;
};

