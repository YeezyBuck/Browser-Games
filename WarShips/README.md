# ⚓ Battleships – a two-player browser game

🇵🇱 [Wersja polska](README.pl.md)

The classic Battleships game for **two players**: on your home network or **over the internet**. It has a built-in chat, a QR code for joining from a phone, Polish and English interface, an animated background with pirate ships fighting each other, music, and the sounds *boom* (hit), *splash* (miss) and a heavy multi-part explosion when a ship is sunk. Hits show explosions on the ship, and the winner gets fireworks.

You can play **against a friend** or **against the computer** (easy or hard). No libraries to install: all you need is **Node.js**. The server acts as the referee and never sends your opponent the positions of your ships.

<p align="center">
  <img src="../docs/screenshots/warships-battle.jpg" width="48%" alt="WarShips: an explosion on a hit ship">
  <img src="../docs/screenshots/warships-sunk.jpg" width="48%" alt="WarShips: a ship is sunk">
</p>

---

## Contents
1. [What you need](#1-what-you-need)
2. [Installation, step by step](#2-installation-step-by-step)
3. [Starting the server](#3-starting-the-server)
4. [How to play, step by step](#4-how-to-play-step-by-step)
5. [Playing over the internet (Cloudflare tunnel)](#5-playing-over-the-internet-cloudflare-tunnel)
6. [Game rules](#6-game-rules)
7. [Controls and features](#7-controls-and-features)
8. [Stopping the server](#8-stopping-the-server)
9. [Troubleshooting](#9-troubleshooting)
10. [Settings and security](#10-settings-and-security)
11. [Tests](#11-tests)
12. [Project structure (for developers)](#12-project-structure-for-developers)

---

## 1. What you need

| Item | Purpose | Required? |
|---|---|---|
| **Node.js 18 or newer** | runs the game server | yes |
| A modern browser (Chrome, Edge, Firefox, Safari) | the game runs in the browser, for both players | yes |
| **cloudflared** (Cloudflare program) | tunnel for playing over the internet | only for internet play |

No accounts (Cloudflare, GitHub, etc.) are needed. The game works on Windows, macOS and Linux; the included `.bat` files are for Windows.

## 2. Installation, step by step

1. **Install Node.js.** Download the LTS version from <https://nodejs.org> and install it with the default settings.
2. **Check the installation.** Open a terminal (Windows: PowerShell or Command Prompt) and type:
   ```
   node --version
   ```
   You should see a version number, e.g. `v22.11.0`. If you get a "command not recognized" error, close the terminal and open it again, or restart the computer (the PATH has changed).
3. **Get the game.**
   - with git: `git clone https://github.com/YeezyBuck/Browser-Games.git`; the game is in the `WarShips` folder (`Browser-Games/WarShips`),
   - or download the repository from GitHub as a ZIP and unpack it.
4. *(Internet play only)* **install cloudflared**, described in [section 5](#5-playing-over-the-internet-cloudflare-tunnel).

The game itself needs no installation or build: there is no `npm install`.

## 3. Starting the server

Pick one of the options. After startup the console shows the game address.

### Windows – double-click (easiest)
- **`uruchom.bat`** (the main one): checks cloudflared (offers to install it if needed), starts the tunnel, then the game and the browser. The game works on your home network **and over the internet**.
- **`uruchom-bez-tunelu.bat`**: home network only (no cloudflared, no internet link or QR code).

A console window opens: **do not close it while playing**. The game page opens **automatically in your browser** (`http://localhost:3000`). If Node.js is not in the PATH, the `.bat` files try `C:\Program Files\nodejs\node.exe`. To finish, use the **⏻ Quit game** button in the game (see [section 8](#8-stopping-the-server)); the console window closes by itself.

### Terminal (Windows, macOS, Linux)
```
cd WarShips
node server.js            # home network only
node server.js --tunnel   # with a Cloudflare tunnel (internet play)
node server.js --open     # additionally open the game in your browser
```
`npm` shortcuts: `npm start` (with tunnel, like `uruchom.bat`) and `npm run local` (no tunnel).

### What you will see in the console
```
Statki działają: http://localhost:3000
  w sieci lokalnej: http://192.168.1.50:3000
```
(The console messages are in Polish: "Statki działają" means "The game is running" and "w sieci lokalnej" means "on the local network".)
- `http://localhost:3000`: for the person who started the server (same computer),
- the "local network" address: for other devices on the same Wi-Fi/LAN.

Different port: `PORT=8080 node server.js` (Windows PowerShell: `$env:PORT=8080; node server.js`).

## 4. How to play, step by step

You need two people (or two browser tabs to try it out alone).

### Player 1 – creates the game
1. Open the address from the console in your browser (`http://localhost:3000`).
2. *(Optional)* choose the language with the **Polski / English** buttons at the top.
3. Click **Create game**. A **6-letter game code** appears, together with ready-made links to give your opponent:
   - 🌐 **Opponent over the internet**, shown when the tunnel is running, together with a **QR code**: the opponent can scan it with a phone and join straight away,
   - 🏠 **Opponent on the same Wi-Fi/LAN**.
4. Send your friend the right link (use the **Copy** button) and wait for them to join.

**Playing against the computer:** on the start screen set **Opponent: Computer** and pick the **level** (easy or hard). You go straight to placing your ships (the computer has already placed its fleet), and the game starts as soon as you click **Ready**. There is no code, link, QR code or chat, and the computer always agrees to a rematch.

### Player 2 – joins
- open the link from player 1 (the code fills in automatically), **or**
- open the game address, type the 6-letter code into **Join a game** and click **Join**.

### Placing ships (both players)
1. Pick a ship from the "Your fleet" list (the longest is selected by default).
2. Click a cell on the board to place it. **Rotate (R)** switches horizontal/vertical.
3. Click an already placed ship to pick it up. **Random** places the whole fleet for you, **Clear** removes everything.
4. When all 10 ships are placed, click **Ready**. The game starts when both players are ready; a randomly chosen player goes first.

Fleet: **1 × four-cell ship, 2 × three-cell, 3 × two-cell, 4 × one-cell.** Ships may not touch, not even diagonally.

### Playing
- You have **two boards**: *Your board* (your ships and your opponent's shots) and *Opponent's board* (where you fire).
- On **your turn**, click a cell on the opponent's board. You hear **boom** for a hit, **splash** for a miss, and a much bigger, longer **explosion** (double blast, rumble, creaking hull, bubbles) when a ship is **sunk**. Every hit also shows an **explosion on the hit ship**, on the board that was hit (fireball, shockwave, sparks, debris, smoke and a shaking board); sinking a ship sets off a chain of explosions along its whole length and a huge finale.
- **Each player fires one shot, then it is the opponent's turn** (also after a hit).
- Markers: ✕ hit, dot miss. Cells around a sunk ship are marked as water automatically.
- The "Opponent's ships: X/10" counter shows how many they have left.
- **The first player to sink all of the opponent's ships wins.** The winner's screen gets a **fireworks** show (the 🎆 button replays it).
- After the game the opponent's board is revealed. **Play again**: both players click the button and the boards reset.

## 5. Playing over the internet (Cloudflare tunnel)

If your opponent is outside your home network, use the tunnel. No account and no router setup needed.

### Installing cloudflared
**Automatic (recommended):** you do not have to install anything by hand. When you start with the tunnel, the server **checks whether cloudflared is present**. If it is missing, it offers to install it (Windows: `winget`, macOS: `brew`) and asks in the console window:
```
Nie znaleziono programu cloudflared (potrzebnego do gry przez internet).
Zainstalować go teraz poleceniem "winget install Cloudflare.cloudflared"? [T/n]
```
("Not found... Install it now with the command…? [Y/n]".) Press **Enter** (or `T`) to install, `n` to skip. Windows may ask for permission in a separate window: confirm it. While this is happening, the game panel shows a matching hint. To install without being asked, start with `node server.js --tunnel --yes` (or set `CLOUDFLARED_AUTO_INSTALL=1`). When the server runs without an interactive console (e.g. in the background) it never installs anything on its own; it only prints the command. On Linux, or without winget/brew, it prints a link to the instructions.

**Manual** (if you prefer):
- **Windows:** in PowerShell run `winget install Cloudflare.cloudflared`
- **macOS:** `brew install cloudflared`
- **Linux:** see <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>

After installing, open a new terminal window. (The server also checks the typical Windows install folders on its own.)

### Starting it
1. Start **`uruchom.bat`** (Windows) or `npm start`.
2. The start goes in three steps, shown in the console: **[1/3]** it checks whether cloudflared is installed (and offers to install it, see above), **[2/3]** it starts the tunnel and waits for its address, **[3/3]** only then it starts the game and opens the browser. So the page already knows the internet address when it opens. If the tunnel fails to start, the game still starts (home network only). It takes a few seconds; a box appears in the console:
   ```
   ==================================================================
     GRA PRZEZ INTERNET – przekaż przeciwnikowi ten adres:

         https://something-random.trycloudflare.com
   ==================================================================
   ```
   ("Game over the internet – give your opponent this address".)
3. Open the game on your side and click **Create game**. The panel shows **🌐 Opponent over the internet – send this address**, a link that already contains the room code.
4. Copy it (**Copy**) and send it to your friend. As soon as they open it, they are in your game.

### Good to know
- **Which address for whom?** 🌐 the tunnel address for people outside your network, 🏠 the local-network address for people at home.
- **QR code:** next to the 🌐 link there is a QR code with the same link (room code included). Your friend points the phone camera at it and opens the game, no typing needed. It appears only when the tunnel is running.
- The tunnel address is **temporary**; it changes every time the tunnel starts. The computer running the server must stay **on** for the whole game.
- The free tunnel does not pass live streams (SSE). After about 3 s the game **switches to a fallback transport** (long-polling) by itself. Players do not notice.
- Anyone who knows the link **and** the code can join as the second player, so do not post it publicly.
- A "quick" tunnel is meant for trying things out and has no uptime guarantee.

## 6. Game rules

- 10 × 10 board, columns A–J, rows 1–10.
- Ships may not touch (also diagonally). Code setting: `ALLOW_TOUCHING`.
- One shot per turn. Code setting: `KEEP_TURN_ON_HIT` (`true` = you keep firing after a hit).
- The starting player is chosen at random. Games after "Play again" also pick the starter at random.
- You cannot fire at the same cell twice.

## 7. Controls and features

| Feature | How |
|---|---|
| Language | **Polski / English** buttons at the top; the choice is remembered (default follows the browser language) |
| Tutorial | **❓ How to play** button at the top; it also opens by itself on your first visit. Six short steps with animations (goal, fleet, placing, firing, sinking, extras), in Polish and English; arrow keys and Esc work |
| Computer opponent | **Opponent: Computer** when creating a game, level **Easy** or **Hard**; the computer thinks for a moment before each shot |
| Chat | 💬 button at the bottom left (after the opponent joins); Enter sends, Esc closes; red badge = unread; up to 200 characters |
| Music | 🎵 button mutes/unmutes; starts after the first click on the page (browser requirement) |
| Sound effects (boom, splash, ship-sunk explosion, chat beep) | 🔊 button |
| Rotating a ship | **Rotate** button or the **R** key |
| Fireworks | shown automatically on the winner's screen; **🎆 Fireworks** button replays them |
| Quitting the game | **⏻ Quit game** button at the top; it shuts down the server and the tunnel (visible only in the browser on the computer running the server) |
| Copying the link | **Copy** button in the waiting panel or **Copy link** at the top |
| Joining from a phone | scan the **QR code** shown in the waiting panel (internet link) |
| Refreshing the page | does not kick you out: the session is remembered in the browser tab |

The language and mute choices are remembered in the browser. The background animation, explosions and fireworks are turned off if your system has "reduce motion" enabled.

## 8. Stopping the server

- **Easiest:** click **⏻ Quit game** at the top of the game page (on the computer where the server runs) and confirm. The server and tunnel shut down, the console window closes, the browser tab closes itself too, and your opponent sees the message "The game has been closed". (Browsers only allow a page to close its own tab in some cases: Chrome, Edge and Brave usually do when the game was opened by the `.bat` file; Firefox and Safari usually do not, and then the page asks you to close the tab manually.) The button is deliberately **not** available to your opponent or through the tunnel.
- Alternatively, in the console window press **Ctrl+C** (or close the window).
- Stopping the server **ends all games in progress** (rooms are kept in memory only), and the tunnel closes with it.

## 9. Troubleshooting

| Problem | Solution |
|---|---|
| `node` is not recognized | Install Node.js ([section 2](#2-installation-step-by-step)), open a **new** terminal or restart the computer. |
| `EADDRINUSE` (port in use) | Another program (or a second copy of the game) is using port 3000. Close it or use another port: `PORT=3001 node server.js`. |
| Opponent at home cannot open the address | Use the "local network" address, not `localhost`. Both devices must be on the same network. If Windows Firewall asks, allow Node.js on private networks. |
| No "over the internet" address in the panel | The server runs without a tunnel (e.g. it was started with `uruchom-bez-tunelu.bat`): quit the game (**⏻ Quit game**) and start **`uruchom.bat`** / `npm start`. The panel hints at what to do (e.g. "tunnel is starting", "install cloudflared"). |
| "cloudflared not found" | Install it ([section 5](#5-playing-over-the-internet-cloudflare-tunnel)) and start the server again. |
| The tunnel address stopped working | The tunnel or server was stopped. Start it again to get a **new** address, and create a new game. |
| "This game no longer exists" | The server was restarted (rooms are in memory) or the room expired after 3 hours of inactivity. Create a new game. |
| No sound or music | Click anything on the page (browsers block audio until the first interaction) and check the 🎵 and 🔊 buttons. |
| Opponent's moves appear about 3 s late right after joining via the tunnel | Normal: it is switching to the fallback transport. Later updates are instant. |
| "Too many requests" | A safety limit kicked in (e.g. many join attempts). Wait a minute. |
| The page looks old after an update | Refresh without cache: **Ctrl+F5**. |
| The tab did not close after "Quit game" | The browser blocked it (it only lets a page close tabs that were opened by script or have no navigation history). The page says so; close the tab manually. |
| The browser did not open by itself | Open `http://localhost:3000` manually. Automatic opening works only when started with a `.bat` file or with the `--open` flag. |
| No **⏻ Quit game** button | It is shown only in the browser on the computer running the server, opened via `localhost`/`127.0.0.1`. Use Ctrl+C in the console instead. |
| The install question did not appear | The server is not running in an interactive console (e.g. it was started in the background). Start `uruchom.bat`, or use the `--yes` flag. |

## 10. Settings and security

### Environment variables and flags
| Setting | Effect |
|---|---|
| `PORT` | server port (default 3000) |
| `--tunnel` or `TUNNEL=1` | start the Cloudflare tunnel |
| `CLOUDFLARED` | full path to the `cloudflared` program if it is not in the PATH |
| `--yes` or `CLOUDFLARED_AUTO_INSTALL=1` | install cloudflared without asking if it is missing |
| `--open` or `OPEN_BROWSER=1` | open the game in the default browser after start (the `.bat` files do this) |

Constants in `server.js`: `KEEP_TURN_ON_HIT`, `ALLOW_TOUCHING`, `CODE_LEN` (code length, default 6) and the `LIMITS` object.

### Security
- **6-letter room code** (about 190 million combinations) and a limit on join attempts (12/min per IP address).
- **Per-IP limits:** 600 requests/min, 10 new rooms per 10 min, 8 live connections; at most 300 rooms on the server; rooms expire after 3 hours of inactivity.
- **Chat:** up to 200 characters, 6 messages per 10 s, shown as plain text (no HTML), control and invisible characters removed.
- **The computer opponent plays by the same rules:** it runs on the server, places its fleet and fires through the same checked path as a human, and it only sees what a human sees (the results of its own shots and the ships it has sunk), never your fleet. Its token never reaches the browser.
- **The server decides everything:** you only learn the ship positions after the game ends; all moves are validated on the server.
- **Security headers:** Content-Security-Policy (own scripts only), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`.
- **Behind the tunnel** the real client address is taken from the Cloudflare header only for connections coming from this computer. Home-network addresses are shown to the host only.
- Player tokens are compared in constant time; requests have size and time limits.
- **Quit button:** the shutdown request is accepted only from the computer running the server (not through the tunnel, not from the home network), with a one-time secret token that only the local browser receives, and only from the game's own page (the `Origin` header must match). A foreign web page, your opponent or a visitor via the tunnel cannot shut the server down.
- **No accounts or passwords:** anyone who knows the room code can join as the second player. Do not expose the game to the internet other than through the tunnel (HTTPS).

## 11. Tests

```
cd WarShips
npm test            # = node bot.test.js && node test.js
```
`bot.test.js` (10 tests) checks the computer opponent: its fleets obey the rules (300 random fleets), it never fires outside the board or twice at the same cell, it finishes off a hit ship and does not waste shots next to a sunk one, it does not use the opponent's fleet at all, and strength (hard sinks a fleet in about 55 shots, easy in about 70; hard wins 188 of 200 games against easy). `test.js` starts the server on a free port and plays a complete game with two "players" over HTTP. It checks, among other things: fleet validation, turn order, hidden ships, rematch, chat, limits, long-polling, the QR library, the tunnel and cloudflared installation (using stand-in programs) and shutting down. At the end it prints `Wszystkie testy przeszły (N)` ("All tests passed (N)").

## 12. Project structure (for developers)

```
WarShips/
├── server.js            HTTP server: game rules, rooms, limits, tunnel (no dependencies)
├── bot.js               the computer opponent (server side): random fleet, probability-based shooting
├── bot.test.js          computer opponent tests
├── test.js              integration test (node test.js)
├── package.json         scripts: start, tunnel, test
├── uruchom.bat              main start (Windows): cloudflared → tunnel → game → browser
├── uruchom-bez-tunelu.bat   start without a tunnel, home network only (Windows)
└── public/              browser files
    ├── index.html       page skeleton
    ├── style.css        styling
    ├── app.js           client logic: screens, boards, chat, transport
    ├── i18n.js          PL/EN translations
    ├── tutorial.js      in-game tutorial: steps and animations
    ├── music.js         music generated with Web Audio
    ├── sea.js           animated background (sea, pirate ships)
    ├── blast.js         explosions on the boards (hits and sinking)
    ├── fireworks.js     fireworks on the winner's screen
    └── vendor/qrcode.js QR code generator (qrcode-generator, MIT license, bundled unchanged)
```

**The computer opponent (`bot.js`).** The computer places a random fleet that obeys the rules. When shooting it knows only what a human knows. The **hard** level counts, for every unknown cell, how many of the ships still afloat could lie across it (respecting the rule that ships do not touch, and weighting layouts that fit the unresolved hits much more strongly), so it finishes off a ship efficiently and skips cells next to sunk ships. The **easy** level hunts at random and follows a hit most of the time, without any counting.

**How it works.** The server keeps room state in memory and is the single source of truth. The client sends commands as plain POST requests and receives state changes through an **SSE** stream. If the stream does not arrive within 3 s (e.g. through a tunnel), it switches to **long-polling** (`/api/poll`). Each player receives only their own view of the state.

**HTTP interface:**

| Method and address | Description |
|---|---|
| `POST /api/create` (`{vs: friend/bot, level: easy/hard}`), `/api/join` | create a room and join it (code → player token) |
| `POST /api/place`, `/api/shoot`, `/api/rematch` | place the fleet, fire a shot, rematch |
| `POST /api/chat` | chat message |
| `POST /api/shutdown` | shut down the server and tunnel (local computer only, needs the secret token) |
| `GET /api/events` | live state stream (SSE) |
| `GET /api/poll` | fallback transport: long-polling |
| `GET /api/state` | one-off state read |
| `GET /api/info` | tunnel address, local-network addresses (host only), code length |

Errors look like `{ "code": "…", "error": "…" }`; the client translates the code into the selected language.

## License

Released under the **MIT** license (see [LICENSE](../LICENSE)). The bundled QR code library has its own MIT license: see [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
