// What every player's browser is told about the match. Colyseus sends only the changes, many times a second.
// Private things (money, goods, secret roles) are NOT in here, so no player can read them from the network.

const { Schema, MapSchema, defineTypes } = require('@colyseus/schema');

class Player extends Schema {
  constructor() {
    super();
    this.name = '';
    this.outfit = '';      // clothes (key from VM.OUTFITS)
    this.colour = '';      // player colour (key from VM.PLAYER_COLORS)
    this.house = 0;        // index into the village's houses
    this.x = 0;
    this.y = 0;
    this.facing = 'down';  // down | up | side
    this.flip = false;     // facing left when side
    this.moving = false;
    this.weak = false;     // starving: their body looks weak to everyone
    this.asleep = false;   // in bed (hidden)
    this.inBoat = false;
    this.inTractor = false;
    this.connected = true; // false while we wait for them to reconnect
    // Phase 3
    this.alive = true;     // false: killed, trampled or voted out (a ghost that only watches)
    this.exposed = false;  // an ordinary villager who stole: everyone sees their name, even at night
    this.voted = false;    // has voted in the current meeting (not who for)
    this.bell = false;     // has already rung the meeting bell this match
    this.bot = false;      // a computer player (moved by the server)
    this.inWater = false;  // fell in the water: anyone next to them can pull them out
    this.fencePaddy = false;  // electric fence around their paddy plot (Rs 50)
    this.fenceGarden = false; // electric fence around their vegetable garden (Rs 50)
    this.land = false;     // bought the land next to their house (online: Rs 50), so they can grow vegetables
    this.injured = 0;      // seconds left: attacked by a thief, lying down; the doctor can still save them
    this.paint = 0;        // paint marks from ghosts who think this player is a thief
    this.dx = 0; this.dy = 0; // where they died (a trophy marks the spot)
  }
}
defineTypes(Player, {
  name: 'string', outfit: 'string', colour: 'string', house: 'uint8',
  x: 'number', y: 'number', facing: 'string', flip: 'boolean', moving: 'boolean',
  asleep: 'boolean', weak: 'boolean', inBoat: 'boolean', inTractor: 'boolean', connected: 'boolean',
  alive: 'boolean', exposed: 'boolean', voted: 'boolean', bell: 'boolean', bot: 'boolean', inWater: 'boolean', injured: 'uint8', land: 'boolean', fencePaddy: 'boolean', fenceGarden: 'boolean', paint: 'uint8', dx: 'number', dy: 'number',
});

class VillageState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.queues = new MapSchema();
    this.paddy = new MapSchema(); // paddy plot number (0-5) -> owner id
    this.drops = new MapSchema(); // goods on the ground: id -> JSON { x, y, by, items }
    this.tractorX = 0; this.tractorY = 0; // the one tractor everyone shares
    this.tractorBy = '';   // who is driving it ('' = parked) // place (well, cookhut, kade) -> player ids in line, front first, joined by commas
    this.phase = 0;        // index into VM.SCHEDULE
    this.phaseLeft = 0;    // whole seconds left in this part of the match
    // Phase 3
    this.stage = 'lobby';  // lobby (waiting for players) | playing | meeting | ended
    this.host = '';        // sessionId of the player who can start the match
    this.meetingLeft = 0;  // seconds left to vote
    this.meetingBy = '';   // who rang the bell ('' = the final meeting)
    this.winner = '';      // '' | villagers | thieves
    this.code = '';        // '' = the public bus; 4 letters = a private bus that friends join with this code
    this.mode = 'walk';     // walk (walk around, act in real time) | mafia (Classic Mafia: turns and a narrator)
    this.mstep = '';       // Classic Mafia: '' (bus ride) | night | morning | talk | vote
    this.mleft = 0;        // Classic Mafia: seconds left in this step
    this.mround = 0;       // Classic Mafia: night number
    this.spoiled = '';     // places a thief spoiled last night (well, cookhut): closed for today
    this.waitLeft = 300;   // seconds until the bus leaves by itself (or, after a match, until the bus stand)
    this.minPlayers = 3;   // players needed before the host can start the bus
  }
}
defineTypes(VillageState, {
  players: { map: Player }, queues: { map: 'string' }, paddy: { map: 'string' }, drops: { map: 'string' }, tractorX: 'number', tractorY: 'number', tractorBy: 'string', phase: 'uint8', phaseLeft: 'uint16',
  stage: 'string', host: 'string', meetingLeft: 'uint8', meetingBy: 'string', winner: 'string', minPlayers: 'uint8', waitLeft: 'uint16', spoiled: 'string', mode: 'string', code: 'string', mstep: 'string', mleft: 'uint16', mround: 'uint8',
});

module.exports = { Player, VillageState };
