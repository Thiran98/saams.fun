// Sams Gama game server. One program does two jobs:
//  1. serves the game files (the client folder) to the browser, and
//  2. runs the live multiplayer matches over WebSockets (Colyseus).
// Start it with:  npm start   (inside this server folder)   then open http://localhost:2567

const path = require('path');
const fs = require('fs');
// settings in server/.env (for example OPENAI_API_KEY=... for the narrator voice). This file is never uploaded.
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (e) { /* no .env file */ }
const http = require('http');
const express = require('express');
const { Server, matchMaker } = require('colyseus');
const { WebSocketTransport } = require('@colyseus/ws-transport');
const { VillageRoom } = require('./rooms/VillageRoom');
const tts = require('./tts');

const PORT = Number(process.env.PORT) || 2567;
const app = express();

// the browser part of Colyseus, served from this computer (no outside website needed)
app.get('/lib/colyseus.js', (req, res) => res.sendFile(path.join(__dirname, 'node_modules', 'colyseus.js', 'dist', 'colyseus.js')));
// the game page on saams.fun talks to this server from another address: allow it
app.use((req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); });
app.get('/health', (req, res) => res.json({ ok: true }));
tts.routes(app); // the narrator voice (OpenAI), only with a key

// A temporary bus song: server/private-music/bus-song.mp3 plays on the bus ride until the time in until.txt,
// then the file is deleted and the game's own tune plays again. (Kept only on this computer; never uploaded.)
const SONG_DIR = path.join(__dirname, 'private-music');
const SONG = path.join(SONG_DIR, 'bus-song.mp3');
const songUntil = () => { try { return Number(fs.readFileSync(path.join(SONG_DIR, 'until.txt'), 'utf8')) || 0; } catch (e) { return 0; } };
const songOn = () => fs.existsSync(SONG) && Date.now() < songUntil();
const songCleanup = () => {
  if (fs.existsSync(SONG) && Date.now() >= songUntil()) {
    try { fs.unlinkSync(SONG); fs.unlinkSync(path.join(SONG_DIR, 'until.txt')); console.log('The temporary bus song has expired and was deleted.'); } catch (e) { /* try again later */ }
  }
};
songCleanup();
setInterval(songCleanup, 10 * 60 * 1000);
app.get('/bus-song-status', (req, res) => res.set('Cache-Control', 'no-store').json({ on: songOn(), until: songOn() ? songUntil() : 0 }));
app.get('/bus-song', (req, res) => { if (!songOn()) return res.status(404).end(); res.set('Cache-Control', 'no-store').type('audio/mpeg').sendFile(SONG); });
// for the saams.fun front page: is the village open, and how many people are playing (any website may ask)
app.get('/status', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*').set('Cache-Control', 'no-store');
  let rooms = [];
  try { rooms = await matchMaker.query({ name: 'village' }); } catch (e) { /* none yet */ }
  res.json({ ok: true, players: rooms.reduce((n, r) => n + r.clients, 0), waiting: rooms.filter((r) => !r.locked).reduce((n, r) => n + r.clients, 0), matches: rooms.filter((r) => r.locked).length });
});
// changes every time the server starts (after every update); open game pages reload themselves when it changes
const BUILD = String(Date.now());
app.get('/version', (req, res) => res.set('Cache-Control', 'no-store').json({ build: BUILD }));
app.use(express.static(path.join(__dirname, '..', 'client'), {
  setHeaders: (res) => res.set('Cache-Control', 'no-store'),
}));

const server = http.createServer(app);
// a player whose connection goes quiet (slow network, phone in the background) keeps their seat for about 30 s
// instead of 6 s: fewer drops and freezes
const gameServer = new Server({ transport: new WebSocketTransport({ server, pingInterval: 5000, pingMaxRetries: 6 }) });
// buses are matched by their code: PUBLIC = the public bus, 4 letters = a private bus (only people with the code)
gameServer.define('village', VillageRoom).filterBy(['code']);

gameServer.listen(PORT).then(() => {
  console.log(`Sams Gama server running: http://localhost:${PORT}`);
  console.log('Open that address in several browser tabs to test multiplayer. Press Ctrl + C to stop.');
  console.log(tts.on ? 'Narrator voice: OpenAI.' : 'Narrator voice: the browser (no OPENAI_API_KEY in server/.env).');
});
