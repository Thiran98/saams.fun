# Sams Gama

A browser-based social deduction game set in a Sri Lankan village, for 8 to 12 players and about 15 minutes a match.
(The folder is still called `village-mafia`; the game is called **Sams Gama**.)

**Current stage: Phase 3, the core game (online matches with secret roles), 10 Nov 2026.** Offline the village is a
single-player practice game with 7 computer villagers. What works:

- A big village: lake with jetties and boats, mountains in the north, a jungle in the east and south, paddy fields,
  temple, village square, well, cowshed farm, chicken pen, workshop, cooking hut and the Kade (the only shop).
- Smooth "bean" villagers from the character sheet. Everyone has their **own colour and own identical house** with a
  vegetable garden. A **village map** (M) shows every house; it never shows where other players are.
- **Jobs with a guide arrow** and a "Your task" banner. **Food**: everyone must eat each day.
- **Trading** between villagers (E next to someone) to **get rich**. "What I have" counts everything you own.
  Other people's money is private; the "Richest villagers" list shows only the ranking.
- **Boats** for fishing. Falling into the water: another villager must pull you out.
- **Dusk and night**: go home and sleep before dark (the screen goes black). Elephants trample the paddy and roam the
  village, and kill anyone outside. Anyone outside at night is a black shape with no name.
- **Stealing** at night (from houses, or a cow or chicken for meat): an ordinary villager who steals is named to everyone.

The architecture, hosting check, deployment plan and costs are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 1. Software to install (all free)

| Software | Why | Where |
|---|---|---|
| **Node.js (LTS version)** | Runs the small test server now and the game server from Phase 2 | https://nodejs.org (choose "LTS") |
| **Visual Studio Code** | A free code editor to open and change the files | https://code.visualstudio.com |
| **Google Chrome** (or Edge) | To play and test. Press F12 to see errors. | You probably have it |
| **Git** (optional now) | Saves versions of your work so you can undo mistakes | https://git-scm.com |

This computer already has Node.js 24, npm 11 and Git 2.56, so nothing needs installing here.

To check on another computer, open **PowerShell** (Start menu → type "PowerShell") and run:

```bash
node --version
```

If you see a version number such as `v24.16.0`, Node.js is installed.

## 2. Folder structure

```
village-mafia/
├── README.md              ← this guide
├── package.json           ← project name and the "npm start" command
├── serve.js               ← tiny test web server (no extra packages)
├── docs/
│   └── ARCHITECTURE.md    ← architecture, hosting limits, deployment, costs
├── client/                ← THE GAME (these files go to your website later)
│   ├── index.html         ← the page: game area, panels, touch buttons
│   ├── css/style.css      ← look of the panels and buttons
│   ├── assets/            ← your artwork goes here later (PNG files)
│   └── src/
│       ├── config.js      ← settings: map size, speeds, match schedule, prices, outfits
│       ├── textures.js    ← draws all pictures with code (placeholders for real art)
│       ├── map.js         ← the village layout: lake, forest, paddy, roads, buildings
│       ├── tasks.js       ← what each place does (well, shop, paddy…)
│       ├── ui.js          ← clock, basket, messages, progress bar
│       ├── input.js       ← phone joystick and Use button
│       ├── VillageScene.js← the game itself: movement, collisions, tasks, day/night
│       └── main.js        ← starts Phaser
├── server/                ← Phase 2: the Colyseus multiplayer server (empty for now)
└── wordpress-plugin/      ← Phase 5: connects the game to your WordPress site (empty for now)
```

## 3. Run the game on your computer

1. Open **PowerShell**.
2. Go to the project folder (copy this line exactly, including the quotes):

   ```bash
   cd "D:\IELTS Gym\village-mafia"
   ```

3. Start the test server:

   ```bash
   npm start
   ```

   You should see `Village Mafia prototype running: http://localhost:8080`.
4. Open **http://localhost:8080** in Chrome.
5. To stop the server, click the PowerShell window and press **Ctrl + C**.

No internet? The game loads Phaser from cdnjs.cloudflare.com, so the first load needs internet. If it fails, the page
tells you.

## 4. How to test it

| Test | What you should see |
|---|---|
| Press **Start playing** | A "Your task" banner and a yellow arrow show your first job |
| Walk with **W A S D** or the **arrow keys** | You can't walk through houses, trees, fences, rocks or mountains |
| Stand next to the **well** and press **E** | A progress bar, then Water goes up in "What I have" |
| Walk to a **boat** at a jetty, press **E**, row onto the lake, press **E** | You fish from the boat. Steer onto land to get out. |
| Walk into the lake without a boat | You fall in. A villager runs over and pulls you out. |
| Pick vegetables in someone else's garden | You pay the owner Rs 30 |
| Walk up to a villager and press **E** | The trade window: buy and sell goods |
| Cook at the **cooking hut**, then press **F** | Needs paddy, vegetables, firewood and water. Eating fills the food bar. |
| Press **N** until the clock turns orange (dusk) | A warning banner; the arrow points home. Press **E** at your house to sleep: the screen goes black. |
| Stay outside at night | Elephants come out of the jungle. One that catches you kills you (you come back in the morning in this test version). |
| At night, press **E** at someone else's house or next to a cow | You steal, and your name is shown in red |
| Press **M** | The village map |
| Phone or a narrow window | A joystick (left) and a **Use** button (right) appear |
| Add `?debug=1` to the address | Shows the solid boxes used for collisions |

To test on your phone on the same Wi-Fi: find your computer's IP address (PowerShell: `ipconfig`, look for "IPv4
Address", e.g. 192.168.1.20) and open `http://192.168.1.20:8080` on the phone. Windows may ask to allow Node.js
through the firewall; allow it for **private networks** only.

## 5. Changing things yourself

- Match times, prices, walking speed, villager outfits: `client/src/config.js`.
- Where buildings and trees stand: `client/src/map.js` (positions are in tiles; one tile = 32 pixels).
- What a place does and how long it takes: `client/src/tasks.js`.
- After any change, save the file and reload the page in Chrome (F5). No restart needed.
- If the page goes blank, press **F12** → **Console** to see the error, and paste it to Claude.

## 6. Using your own artwork (the concept art)

The pictures are drawn by code for now so the prototype needs no image files. To use your real art:

1. Export each item as a **PNG with a transparent background**, viewed from the same top-down angle as the map.
2. Villagers: a sprite sheet with 9 frames in one row (down ×3, up ×3, side ×3), each frame the same size.
   Buildings: one PNG each.
3. Put them in `client/assets/` and ask Claude to switch that item from code-drawn to your PNG (a few lines in
   `VillageScene.js` using Phaser's `preload`).

## 7. Putting the prototype on your website (optional)

The `client` folder is plain static files, which your Hostinger Business hosting serves fine:

1. In hPanel → **File Manager**, open `public_html` and create a folder `play`.
2. Upload everything **inside** `client` (index.html, css, src, assets) into `public_html/play/`.
3. Open `https://yourdomain/play/`.

This is only a single-player demo of the map. The real multiplayer server needs a separate server from Phase 2, as
explained in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 8. Multiplayer on your computer (Phase 2)

```bash
cd "D:\IELTS Gym\village-mafia\server"
```

```bash
npm start
```

Open **http://localhost:2567** in two browser tabs, type a different name in each and press **Join the village**. You see
each other walk, share the same clock, and keep your house if the connection drops. Details: [server/README.md](server/README.md).
`npm start` in the main folder (port 8080) still runs the offline version with computer villagers.

## 9. Playing with friends over the internet (free test link)

```bash
cd "D:IELTS Gymillage-mafia"
```

```bash
powershell -ExecutionPolicy Bypass -File .play-online.ps1
```

It starts the game server (a second window) and a free Cloudflare quick tunnel, and prints a link like
`https://some-words.trycloudflare.com`. Send it to your friends: each player types a name and presses **Join the village**.
The link only works while both windows stay open and your computer is on, and it is new every time. A brand-new link can
take a minute before every phone network finds it. For a permanent address (e.g. play.saams.fun) the server needs a
small VPS (see docs/ARCHITECTURE.md).

## 9b. saams.fun front page

- **Walk-mode changes (19 Nov 2026):** days are 2 minutes; warnings are a small strip at the top; one tractor shared by
  everyone (state.tractorX/Y/By, message tractor); online there is no money: players swap goods (swapOffer/swapReply,
  VM.swap; the Kade is closed, gardens are free, the workshop gives firewood); ghosts do tasks, fly fast and can paint
  one suspect a day (paint, shown as 🎨 on the name); the police have a gun with 3 bullets a night against elephants
  (shoot -> shot, all clients scare elephants near it); a thief's attack injures (Player.injured, 20 s) and the
  doctor can heal (heal); if nobody does, the player dies; a 🏆 trophy marks where someone died (Player.dx/dy).
  Connections: pingInterval 5000, pingMaxRetries 6 (a quiet player keeps their seat for about 30 s).

- **Start menu** (client/index.html #menu): name, PLAY (public bus), "Play with friends (private bus)" (code), How to play,
  Settings. How to play (#howto) opens automatically before a player's first game (localStorage sams-gama-seen-howto)
  and with H. During the game the ☰ button opens the menu (#gamemenu): sound effects, bus music, narrator voice
  (default ballad), how to play, leave the game. If the browser still blocks sound when the bus leaves,
  "🔊 Tap for bus music" appears.
- `publish-site.ps1 -Only src/mafia.js` uploads just those game files to play/ and practice/.

- **saams.fun/play/** is the live game served from the website: the page reads saams.fun/server.json to find the game
  server (VM.net.locate()) and connects there; the address bar stays on saams.fun. The game server must still run on
  this PC (with the tunnel) for anyone to play. PLAY on the front page opens play/.
- The bus looks like the red SLTB bus (red roof, silver window frames with a bar, white-blue-white stripe, "SLTB"
  lettering; no official emblem). The ride goes day (leaving Pettah) -> evening -> night with disco lights in the
  windows (Kandy in the dark) -> sunrise at the jungle village, with the original bus-DJ loop playing.

- `site/index.html`: the game menu on https://saams.fun (green forest look, PLAY, practise alone, how it works). It reads
  `server.json` (the live village's address) and asks that address's `/status` whether the village is open and how
  many are playing. PLAY goes to the live village; closed = PLAY greyed out.
- `saams.fun/practice/`: the single-player game (the client folder).
- `publish-site.ps1` uploads all of it (`-FrontOnly` = only index.html and server.json); backs up the old home page in
  backups/. Run it in a normal terminal window (the FTP password box opens there).
- `play-online.ps1` starts the server and tunnel and uploads the new address to saams.fun/server.json.
- After an upload, plain https://saams.fun may show the old page until the caches are flushed: hPanel → Performance →
  CDN → Flush cache, and wp-admin → LiteSpeed Cache → Toolbox → Purge All.

## 10. A match (Phase 3)

1. **Bus stand:** players who join take a window seat in a red Langama-style bus (6 windows, 12 seats; no SLTB logo or name). The first player "starts the bus" and sees
   **Let's go to Sams Gama!** (at least 4 players, 3 when testing; best with 8–12). "Copy invite link" copies the
   address. A 13th player gets a new, empty bus.
   **Nobody waits forever:** the bus stand counts down 5 minutes; at 0 the bus leaves by itself if enough players are
   on board (otherwise it waits another 5 minutes). After a match, everyone goes back to the bus stand after 5 minutes
   if the host has not pressed New match. `WAIT_SECONDS=12` (env) shortens both for testing.
   **Computer players:** the host can press "+ Add a computer player" or "Fill the bus". They are moved by the server
   (`botTick()` in VillageRoom.js): by day they walk between houses and the square, at night they go home to sleep
   (a computer thief goes out to attack someone after 15 s), a computer police officer questions one person a day,
   a computer doctor guards their own house, and they vote at meetings (a known thief, someone seen stealing, often
   whoever is ahead, else at random; never "skip" in the final vote). On Day 2, if nobody has rung the bell, a
   computer villager calls a meeting. A real player who joins a full bus takes a computer player's seat.
   Balance note: in all-computer test matches the thieves usually win (3 thieves at 12 players); tune later.
   **Thieves (online):** start with Rs 0 and no goods; honest work only "pretends" (VM.HONEST_WORK, no reward).
   At night they fill the thieves' secret loot bag (only thieves see it): kill Rs 100, rob a sleeping player's house
   Rs 60 (each house once a night), take an animal Rs 80 (25 s apart). Goal: Rs 250 + 250 per thief; reaching it wins.
   Tricks (T key / Trick button): hide stolen goods at a player's house (that player is named in the morning),
   throw mud in the well or put out the cooking fire (closed the whole next day, state.spoiled). Computer thieves
   rob, frame and spoil too. Test-only server commands (local DEV only): devRole, devMove.
   **Classic Mafia mode** (host picks "Classic Mafia" at the bus stand; `client/src/mafia.js`, "Classic Mafia mode" in
   VillageRoom.js): night 45 s (everyone asleep; thieves choose a victim together from a list or hide stolen goods at
   a house, the doctor protects someone, the police check someone) → morning 10 s (news) → discussion 100 s around the
   big tree (host can start the vote early) → vote → night again, until one side wins. Computer players choose and vote.
   **Narrator:** the server writes every line ("narrate"). With OPENAI_API_KEY in `server/.env` (never uploaded; see
   server/.gitignore) the lines are spoken by OpenAI `gpt-4o-mini-tts` (`server/tts.js`: only lines the game wrote,
   each made once per voice and saved in server/tts-cache/, at most TTS_MAX_PER_DAY new lines a day). Without a key
   the browser's own voice reads them. The 🗣 button (bottom left) chooses the voice.
   **Ride music:** an original bus-DJ-style loop (Web Audio) plays during the ride, with black diesel smoke.
   **River:** fallen in, you climb out by yourself after 30 seconds (VM.SELF_RESCUE_SECONDS); any player (or computer
   player) next to you can pull you out. **One villager can swim** (chosen by the server each match, told on the role
   card): swims slowly through water and never falls in.
   **Private buses:** the join screen has "Join the public bus", "Join with code" and "Create a private bus" (a random
   4-letter code). Buses are matched by code (filterBy code; the public bus uses PUBLIC). The bus stand shows the code,
   and "Copy invite link" adds ?code=XXXX, which opens the page ready to join that bus.
   **Area sounds:** river, beach, jungle, paddy fields, farm, village square.
   **Newspaper:** the bus stand has "The Sams Gama Times" with the rules, to read while the bus fills up.
   **Sound** (`client/src/sound.js`): made in the browser with Web Audio, no sound files. Birds by day, crickets and
   frogs at night, bus engine and horn, bell, attacks, coins, tricks, votes, morning, win/lose. Speaker button
   bottom left turns it off (remembered).
2. **The ride** (`client/src/journey.js`, about 23 s, everyone at once): Colombo bus stand → Nelum Kuluna → paddy fields
   and wewas → a temple → Deniyaya's tea hills → the jungle → the gate of Berala Panathara. Then a black screen tells
   each player their secret role, and the village starts on Day 1 (the first part of the match is 40 s for this).
3. **Secret roles:** the server deals them; only you see yours (black screen after the ride, "Secret role" button top right).
   - 4–5 players: 1 thief, 6–9: 2 thieves, 10–12: 3 thieves. Police from 4 players, doctor from 5.
   - **Thief:** at night press **R** next to a villager outside, or at the door of someone asleep, to kill them and take
     Rs 100. One attack per thief per night. Thieves know each other and can steal without being named.
   - **Doctor:** at night press **R** next to someone or at their door (or your own door) to guard them: a thief's
     attack on them fails, and you hear about it in the morning.
   - **Police:** once between two mornings, press **R** next to someone (or at their door) to learn if they are a thief.
   - **Villager:** work, trade, watch, vote.
3. **Morning:** everyone hears who was killed or trampled in the night.
4. **Meetings:** by day, anyone alive can ring the **village bell** under the big tree in the square (E), once per match.
   Everyone stops and votes (75 s); the most votes leaves the village and everyone learns if they were a thief.
   Tie or "skip" wins: nobody leaves. After the final day there is always a **final vote**.
5. **Winning:** villagers win when every thief is out. Thieves win when they are as many as everyone else, or when a
   thief is still in the village after the final vote. The end screen shows every role; the host presses **New match**.
6. **Out of the match:** killed, trampled (outside at night) or voted-out players become ghosts who watch.

Not yet on the server (Phase 4): money, goods and trading still live in each browser, so stealing goods from another
real player's house does not work online yet (their basket looks empty); stealing animals does.

Tests run on 10 Nov 2026: a robot match with 5 players (28 checks: roles, police, doctor's guard, one attack per night,
kill at a door, morning news, ghosts can't ring or vote, bell meeting, vote out, win, new match) and a browser match
(lobby, Start, role card, bell, meeting screen, vote, final vote, end screen, New match rejoins by itself, the thief's R).

## Next: Phase 4

The village economy on the server: money, goods, trading, stealing and the village store decided by the server, so
nobody can cheat and thieves really take the victim's money.
