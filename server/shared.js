// Loads the game's own settings and village map into Node.js, so the server and the browser use exactly
// the same numbers (match schedule, colours, outfits, house positions). One source of truth: client/src/.

const path = require('path');

global.window = global; // the client files write to window.VM
const src = path.join(__dirname, '..', 'client', 'src');
require(path.join(src, 'config.js'));
require(path.join(src, 'textures.js')); // only for VM.rng; it draws nothing until a Phaser scene asks
require(path.join(src, 'map.js'));

const VM = global.VM;
const world = VM.buildMap();

module.exports = {
  VM,
  world,
  worldW: VM.MAP_W * VM.TILE,
  worldH: VM.MAP_H * VM.TILE,
  // where a villager stands in front of house number i
  door: (i) => ({ x: world.houses[i].x, y: world.houses[i].y + 26 }),
};
