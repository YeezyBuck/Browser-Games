# ⚓ Battleships – a two-player browser game

🇵🇱 [Wersja polska](README.pl.md)

The classic Battleships game for **two players**: on your home network or **over the internet**. It has a built-in chat, Polish and English interface, an animated background with pirate ships fighting each other, music, and the sounds *boom* (hit) and *splash* (miss).

No libraries to install: all you need is **Node.js**. The server acts as the referee and never sends your opponent the positions of your ships.

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
   - with git: `git clone https://github.com/YeezyBuck/Development.git`; the game is in the `Development/statki` folder,
   - or download the repository from GitHub as a ZIP and unpack it.
4. *(Internet play only)* **install cloudflared**, described in [section 5](#5-playing-over-the-internet-cloudflare-tunnel).

The game itself needs no installation or build: there is no `npm install`.

## 3. Starting the server

Pick one of the options. After startup the console shows the game address.

### Windows – double-click (easiest)
- **`uruchom.bat`**: play on your home network only.
- **`uruchom-tunel.bat`**: play on your home network **and over the internet** (needs cloudflared).

A console window opens: **do not close it while playing**. If Node.js is not in the PATH, the `.bat` files try `C:\Program Files\nodejs\node.exe`.

### Terminal (Windows, macOS, Linux)
```
cd statki
node server.js            # home network only
node server.js --tunnel   # with a Cloudflare tunnel (internet play)
```
`npm` shortcuts: `npm start` (no tunnel) and `npm run tunnel` (with tunnel).

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
   - 🌐 **Opponent over the internet**, shown when the tunnel is running,
   - 🏠 **Opponent on the same Wi-Fi/LAN**.
4. Send your friend the right link (use the **Copy** button) and wait for them to join.

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
- On **your turn**, click a cell on the opponent's board. You hear **boom** for a hit or **splash** for a miss.
- **Each player fires one shot, then it is the opponent's turn** (also after a hit).
- Markers: ✕ hit, dot miss. Cells around a sunk ship are marked as water automatically.
- The "Opponent's ships: X/10" counter shows how many they have left.
- **The first player to sink all of the opponent's ships wins.**
- After the game the opponent's board is revealed. **Play again**: both players click the button and the boards reset.

## 5. Playing over the internet (Cloudflare tunnel)

If your opponent is outside your home network, use the tunnel. No account and no router setup needed.

### One-time cloudflared installation
- **Windows:** in PowerShell run `winget install Cloudflare.cloudflared`
- **macOS:** `brew install cloudflared`
- **Linux:** see <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>

After installing, open a new terminal window. (The server also checks the typical Windows install folders on its own.)

### Starting it
1. Start **`uruchom-tunel.bat`** (Windows) or `npm run tunnel`.
2. Wait a few seconds. A box appears in the console:
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
| Chat | 💬 button at the bottom left (after the opponent joins); Enter sends, Esc closes; red badge = unread; up to 200 characters |
| Music | 🎵 button mutes/unmutes; starts after the first click on the page (browser requirement) |
| Sound effects (boom, splash, chat beep) | 🔊 button |
| Rotating a ship | **Rotate** button or the **R** key |
| Copying the link | **Copy** button in the waiting panel or **Copy link** at the top |
| Refreshing the page | does not kick you out: the session is remembered in the browser tab |

The language and mute choices are remembered in the browser. The background animation is turned off if your system has "reduce motion" enabled.

## 8. Stopping the server

- Started with a `.bat` file or in a terminal: press **Ctrl+C** in the console window (or close the window).
- Stopping the server **ends all games in progress** (rooms are kept in memory only), and the tunnel closes with it.

## 9. Troubleshooting

| Problem | Solution |
|---|---|
| `node` is not recognized | Install Node.js ([section 2](#2-installation-step-by-step)), open a **new** terminal or restart the computer. |
| `EADDRINUSE` (port in use) | Another program (or a second copy of the game) is using port 3000. Close it or use another port: `PORT=3001 node server.js`. |
| Opponent at home cannot open the address | Use the "local network" address, not `localhost`. Both devices must be on the same network. If Windows Firewall asks, allow Node.js on private networks. |
| No "over the internet" address in the panel | The server has no tunnel: start **`uruchom-tunel.bat`** / `npm run tunnel`. The panel hints at what to do (e.g. "tunnel is starting", "install cloudflared"). |
| "cloudflared not found" | Install it ([section 5](#5-playing-over-the-internet-cloudflare-tunnel)) and start the server again. |
| The tunnel address stopped working | The tunnel or server was stopped. Start it again to get a **new** address, and create a new game. |
| "This game no longer exists" | The server was restarted (rooms are in memory) or the room expired after 3 hours of inactivity. Create a new game. |
| No sound or music | Click anything on the page (browsers block audio until the first interaction) and check the 🎵 and 🔊 buttons. |
| Opponent's moves appear about 3 s late right after joining via the tunnel | Normal: it is switching to the fallback transport. Later updates are instant. |
| "Too many requests" | A safety limit kicked in (e.g. many join attempts). Wait a minute. |
| The page looks old after an update | Refresh without cache: **Ctrl+F5**. |

## 10. Settings and security

### Environment variables and flags
| Setting | Effect |
|---|---|
| `PORT` | server port (default 3000) |
| `--tunnel` or `TUNNEL=1` | start the Cloudflare tunnel |
| `CLOUDFLARED` | full path to the `cloudflared` program if it is not in the PATH |

Constants in `server.js`: `KEEP_TURN_ON_HIT`, `ALLOW_TOUCHING`, `CODE_LEN` (code length, default 6) and the `LIMITS` object.

### Security
- **6-letter room code** (about 190 million combinations) and a limit on join attempts (12/min per IP address).
- **Per-IP limits:** 600 requests/min, 10 new rooms per 10 min, 8 live connections; at most 300 rooms on the server; rooms expire after 3 hours of inactivity.
- **Chat:** up to 200 characters, 6 messages per 10 s, shown as plain text (no HTML), control and invisible characters removed.
- **The server decides everything:** you only learn the ship positions after the game ends; all moves are validated on the server.
- **Security headers:** Content-Security-Policy (own scripts only), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`.
- **Behind the tunnel** the real client address is taken from the Cloudflare header only for connections coming from this computer. Home-network addresses are shown to the host only.
- Player tokens are compared in constant time; requests have size and time limits.
- **No accounts or passwords:** anyone who knows the room code can join as the second player. Do not expose the game to the internet other than through the tunnel (HTTPS).

## 11. Tests

```
cd statki
node test.js        # or: npm test
```
The test starts the server on a free port and plays a complete game with two "players" over HTTP. It checks, among other things: fleet validation, turn order, hidden ships, rematch, chat, limits, long-polling and the tunnel (using a stand-in program). At the end it prints `Wszystkie testy przeszły (N)` ("All tests passed (N)").

## 12. Project structure (for developers)

```
statki/
├── server.js            HTTP server: game rules, rooms, limits, tunnel (no dependencies)
├── test.js              integration test (node test.js)
├── package.json         scripts: start, tunnel, test
├── uruchom.bat          start the server (Windows)
├── uruchom-tunel.bat    start the server with a Cloudflare tunnel (Windows)
└── public/              browser files
    ├── index.html       page skeleton
    ├── style.css        styling
    ├── app.js           client logic: screens, boards, chat, transport
    ├── i18n.js          PL/EN translations
    ├── music.js         music generated with Web Audio
    └── sea.js           animated background (sea, pirate ships)
```

**How it works.** The server keeps room state in memory and is the single source of truth. The client sends commands as plain POST requests and receives state changes through an **SSE** stream. If the stream does not arrive within 3 s (e.g. through a tunnel), it switches to **long-polling** (`/api/poll`). Each player receives only their own view of the state.

**HTTP interface:**

| Method and address | Description |
|---|---|
| `POST /api/create`, `/api/join` | create a room and join it (code → player token) |
| `POST /api/place`, `/api/shoot`, `/api/rematch` | place the fleet, fire a shot, rematch |
| `POST /api/chat` | chat message |
| `GET /api/events` | live state stream (SSE) |
| `GET /api/poll` | fallback transport: long-polling |
| `GET /api/state` | one-off state read |
| `GET /api/info` | tunnel address, local-network addresses (host only), code length |

Errors look like `{ "code": "…", "error": "…" }`; the client translates the code into the selected language.
