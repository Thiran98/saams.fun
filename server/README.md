# Sams Gama game server (Phases 2 and 3)

Node.js + Colyseus 0.16 (free, open source). One program serves the game files **and** runs the live matches.

## Run it on your computer

```bash
cd "D:\IELTS Gym\village-mafia\server"
```

```bash
npm install
```

(only the first time, about 2 minutes)

```bash
npm start
```

Open **http://localhost:2567** in two or more browser tabs (or another computer/phone on the same Wi-Fi:
`http://<your computer's IPv4 address>:2567`). Type a name in each tab and press **Join the village**.

## What the server decides (Phase 2)

- Who is in the room (up to 12 players; a 13th player gets a new room).
- Each player's **colour** and **house** (never two the same) and their clothes.
- The **match clock**: every player sees the same phase and time. N (testing) asks the server to skip.
- **Movement checks**: a position that is outside the village or faster than anyone can move is refused, and the player
  is put back (`snap`). Waking up / coming back as a ghost asks the server to put you at your own door (`respawn`).
- **Leaving and reconnecting**: if a connection drops (Wi-Fi, phone sleeping, page reload) the seat, colour and house are
  kept for 30 seconds, and the browser reconnects by itself.

Since Phase 3 it also runs the match: the lobby (the host starts it; `MIN_PLAYERS` env, default 4, 3 when testing),
secret roles (kept only on the server, each sent to its owner), night kills, the doctor's guard, police questions,
stealing that names ordinary villagers, elephant deaths, morning news, the village bell, meetings, votes and the winner.
The room is locked during a match (newcomers get a new village). Money and goods still live in each browser (Phase 4).
With `NODE_ENV=production` the N key (skip phase) is switched off.

## Files

- `index.js`: starts the web server and the game server (port 2567, or `PORT`).
- `shared.js`: loads `client/src/config.js` and `map.js`, so the server uses the same schedule, colours and houses.
- `rooms/schema.js`: what each browser is told (players' positions, colours, houses, the clock).
- `rooms/VillageRoom.js`: the rules above.
