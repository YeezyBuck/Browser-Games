# ● Dots – a two-player dots game in the browser

🇵🇱 [Wersja polska](README.pl.md)

The classic Polish **Dots** game (surround and capture) for **two players**: on your home network or **over the internet**. Players take turns placing dots on a grid, and a closed loop of your own dots around your opponent's dots captures them. The game has a built-in chat, a QR code for joining from a phone, Polish and English interface, a night sky with constellations in the background, calm music, sound effects and fireworks for the winner.

You can play **against a friend** or **against the computer** (easy or hard). No libraries to install: all you need is **Node.js**. The server is the referee and enforces all the rules. The game is built on top of [WarShips](../WarShips/README.md) and shares its infrastructure (rooms, Cloudflare tunnel, chat, security).

<p align="center">
  <img src="../docs/screenshots/dots-capture.jpg" width="48%" alt="Dots: capturing an enemy dot">
  <img src="../docs/screenshots/dots-fireworks.jpg" width="48%" alt="Dots: the winner's fireworks">
</p>

---

## Contents
1. [Game rules](#1-game-rules)
2. [What you need and installation](#2-what-you-need-and-installation)
3. [Starting the server](#3-starting-the-server)
4. [How to play, step by step](#4-how-to-play-step-by-step)
5. [Playing over the internet (Cloudflare tunnel and QR code)](#5-playing-over-the-internet-cloudflare-tunnel-and-qr-code)
6. [Controls and features](#6-controls-and-features)
7. [Stopping the server](#7-stopping-the-server)
8. [Troubleshooting](#8-troubleshooting)
9. [Settings and security](#9-settings-and-security)
10. [Tests](#10-tests)
11. [Project structure (for developers)](#11-project-structure-for-developers)

---

## 1. Game rules

- The board is a grid of **line intersections**. Sizes (chosen when creating the game): **small 15×15**, **medium 20×20**, **large 30×20**.
- Two players: **red** and **blue**. They take turns placing **one dot** of their colour on a free intersection. Red starts; the server picks at random who is red.
- **Capturing.** Dots of the same colour connect when they are neighbours horizontally, vertically **or diagonally**. A closed loop of such dots surrounds part of the board. All **live enemy dots inside** are captured and give the capturer one point each. The smallest loop is a diamond of 4 dots around a single enemy dot.
- **The board edge is not a wall**: a loop has to fit entirely on the board.
- **Locked area.** Free spots inside a loop that captured something become locked: nobody may place a dot there.
- **No "suicide".** You may not place a dot in a spot that is already surrounded by your opponent. Exception: a move that itself captures something and thereby breaks the enclosure is allowed.
- **The game ends** when the player to move has no legal move (e.g. the board is full); when **both players agree to stop** ("End game and count points"); or when someone **resigns**.
- **The winner** is whoever captured **more** enemy dots. Equal scores are a draw.
- After a game you can play a **rematch**: the board is cleared and the other player starts.

## 2. What you need and installation

| Item | Purpose | Required? |
|---|---|---|
| **Node.js 18 or newer** | runs the game server | yes |
| A modern browser (Chrome, Edge, Firefox, Safari, Brave) | the game runs in the browser, for both players | yes |
| **cloudflared** (Cloudflare program) | tunnel for playing over the internet | only for internet play; **installation is automatic** (see section 5) |

No accounts (Cloudflare, GitHub, etc.) are needed. The game works on Windows, macOS and Linux; the included `.bat` files are for Windows.

**Installation, step by step:**
1. Install Node.js: download the LTS version from <https://nodejs.org> and install it with the default settings.
2. Check in a terminal: `node --version` (you should see e.g. `v22.11.0`). On a "command not recognized" error, close and reopen the terminal or restart the computer.
3. Get the repository: `git clone https://github.com/YeezyBuck/Browser-Games.git` (the game is in the `Dots` folder: `Browser-Games/Dots`) or download the ZIP from GitHub and unpack it.

The game needs no installation or build: there is no `npm install`.

## 3. Starting the server

Pick one of the options. After startup the console shows the game address. The default port is **3100** (WarShips uses 3000, so both games can run at the same time).

### Windows – double-click (easiest)
- **`uruchom.bat`** (the main one): checks cloudflared (offers to install it if needed), starts the tunnel, then the game and the browser. The game works on your home network **and over the internet**.
- **`uruchom-bez-tunelu.bat`**: home network only (no cloudflared, no internet link or QR code).

A console window opens: **do not close it while playing**. The game page opens by itself in your browser (`http://localhost:3100`). To finish, use the **⏻ Quit game** button (see [section 7](#7-stopping-the-server)).

### Terminal (Windows, macOS, Linux)
```
cd Dots
node server.js            # home network only
node server.js --tunnel   # with a Cloudflare tunnel (internet play)
node server.js --open     # additionally open the game in your browser
```
`npm` shortcuts: `npm start` (with tunnel and browser, like `uruchom.bat`) and `npm run local` (no tunnel). Different port: `PORT=3200 node server.js` (PowerShell: `$env:PORT=3200; node server.js`).

## 4. How to play, step by step

You need two people (or two browser tabs to try it out alone).

### Player 1 – creates the game
1. Open the game page (`http://localhost:3100`) and, if you like, pick the language with the **Polski / English** buttons.
2. Choose the **board size** and click **Create game**. A **6-letter game code** appears, with ready-made links to give your opponent (🌐 over the internet together with a QR code, 🏠 on the home network).
3. Send your friend the right link (**Copy**) and wait for them to join.

**Playing against the computer:** in the same panel set **Opponent: Computer** and pick the **level** (easy or hard). The game starts at once: there is no code, link, QR code or chat, and the computer always agrees to a rematch. When you propose to end the game and count the points, the computer agrees if it is not losing and declines otherwise.

### Player 2 – joins
Open the link from player 1 (the code fills in automatically), or open the game page, type the code into **Join a game** and click **Join**. On a phone you can scan the QR code.

### Playing
1. The game starts right after the opponent joins. At the top you see two cards with the score (each player's colour and number of captured dots); the glowing card shows **whose turn it is**.
2. On your turn, **click a line intersection** on the board. A translucent dot in your colour follows the cursor, and the last move is marked with a pulsing ring.
3. When you close a loop around enemy dots you see a capture effect, hear a chime, and the captured area is tinted in your colour. Captured dots are dimmed with a dot in the capturer's colour.
4. To finish early, click **End game and count points**. Your opponent receives the proposal and can **agree** or **decline**; making a move also cancels it. You can also **resign**.
5. At the end you see the result. The winner gets **fireworks** (the 🎆 button replays them). Click **Play again** for a rematch (both players click).

## 5. Playing over the internet (Cloudflare tunnel and QR code)

If your opponent is outside your home network, use the tunnel. No account and no router setup needed.

**Automatic cloudflared installation.** When you start with the tunnel (`uruchom.bat`, `npm start`), the server checks whether cloudflared is installed. If not, it offers to install it (Windows: `winget`, macOS: `brew`) and asks in the console (Enter = yes). With the `--yes` flag (or `CLOUDFLARED_AUTO_INSTALL=1`) it installs without asking. Without an interactive console (background server) it never installs anything on its own. Manually: `winget install Cloudflare.cloudflared`, `brew install cloudflared`, or the instructions at <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>.

**Start order:** `[1/3]` check cloudflared, `[2/3]` tunnel and its address, `[3/3]` the game and the browser. If the tunnel fails to start, the game still starts on the home network and the console shows why.

While waiting for your opponent the game shows **which address to give to whom**: 🌐 the tunnel address (`https://….trycloudflare.com/?room=CODE`) together with a **QR code** that your opponent can scan with a phone, and 🏠 the home-network address.

Good to know: the tunnel address is **temporary** (it changes every time), and the computer running the server must stay **on**. The free tunnel does not pass live streams (SSE), so after about 3 s the game **switches to a fallback transport** (long-polling) by itself; players do not notice. Anyone who knows the link **and** the code can join as the second player.

## 6. Controls and features

| Feature | How |
|---|---|
| Placing a dot | click (or tap) the nearest intersection on your turn |
| Ending by agreement | **End game and count points**; opponent: **Agree** / **Decline**; the proposer can **Withdraw** |
| Resigning | **Resign** (with confirmation) |
| Rematch | **Play again** after the game |
| Language | **Polski / English** buttons at the top (remembered) |
| Tutorial | **❓ How to play** button at the top; it also opens by itself on your first visit. Six short steps with animations (goal, connecting, capturing, locked spots, ending, tips), in Polish and English; arrow keys and Esc work |
| Computer opponent | **Opponent: Computer** when creating a game, level **Easy** or **Hard**; the computer thinks for a moment before each move |
| Chat | 💬 button at the bottom left; Enter sends, Esc closes; up to 200 characters |
| Music / effects | 🎵 / 🔊 buttons (remembered); sounds: placing a dot, capture, end of game |
| Copying the link | **Copy** in the waiting panel or **Copy link** at the top |
| Quitting the game | **⏻ Quit game** (only in the browser on the computer running the server) |
| Refreshing the page | does not kick you out: the session is remembered in the tab |

Animations (background, capture effects, fireworks) are turned off if your system has "reduce motion" enabled. On narrow screens the board fits the window width (at least about 16 px between intersections).

## 7. Stopping the server

- **Easiest:** click **⏻ Quit game** at the top of the page (on the computer where the server runs) and confirm. The server and tunnel shut down, the console window closes, the browser tab tries to close too (Chrome/Edge/Brave usually manage it for tabs opened by the `.bat` file; Firefox and Safari usually do not), and your opponent sees "The game has been closed".
- Alternatively, press **Ctrl+C** in the console window.
- Stopping the server **ends all games in progress** (rooms are kept in memory only).

## 8. Troubleshooting

| Problem | Solution |
|---|---|
| `node` is not recognized | Install Node.js, open a **new** terminal or restart the computer. |
| `Port 3100 is in use` (`EADDRINUSE`) | The game is already running or another program uses the port. Close it (**⏻ Quit game**) or use another port: `PORT=3200 node server.js`. |
| Opponent at home cannot open the address | Use the "local network" address, not `localhost`; both devices on the same network; if Windows Firewall asks, allow Node.js on private networks. |
| No "over the internet" address or QR code | The server runs without a tunnel: quit the game and start **`uruchom.bat`** / `npm start`. The panel hints at what to do. |
| "cloudflared not found" | Agree to the installation at startup or install it manually (section 5). |
| "You cannot place a dot in a spot surrounded by your opponent" / "locked" | That spot is already surrounded or locked after a capture (section 1). Choose another. |
| "This game no longer exists" | The server was restarted (rooms are in memory) or the room expired after 3 hours of inactivity. Create a new game. |
| No sound or music | Click anything on the page (browsers block audio until the first interaction) and check 🎵 and 🔊. |
| The board does not fit a small screen | The board shrinks the spacing to a minimum; pick a smaller size for comfort. You can also scroll the board horizontally. |
| The page looks old after an update | Refresh without cache: **Ctrl+F5**. |
| "Too many requests" | A safety limit kicked in. Wait a moment. |

## 9. Settings and security

| Setting | Effect |
|---|---|
| `PORT` | server port (default 3100) |
| `--tunnel` / `TUNNEL=1` | start the Cloudflare tunnel |
| `--open` / `OPEN_BROWSER=1` | open the game in the default browser after start |
| `--yes` / `CLOUDFLARED_AUTO_INSTALL=1` | install cloudflared without asking |
| `CLOUDFLARED` | full path to the `cloudflared` program |

Board sizes are set in `server.js` (the `SIZES` constant) and limits in the `LIMITS` object.

- **The computer opponent plays by the same rules:** it runs on the server and places its dots through the same checked path as a human move, and it sees only the board, like a human. Its token never reaches the browser.
- **The server decides everything:** every move is validated on the server by the game engine; the client cannot cheat. The engine (`engine.js`) is not served to browsers.
- **6-letter room code**, join-attempt limit (12/min per IP), room-creation limit (10 per 10 min per IP), at most 300 rooms, request limit (600/min per IP), move limit (8/s per player), live-connection limit; rooms expire after 3 hours of inactivity.
- **Chat:** up to 200 characters, 6 messages per 10 s, plain text only (no HTML), control and invisible characters removed.
- **Security headers:** Content-Security-Policy (own scripts only), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`.
- **Behind the tunnel** the real client address is taken from the Cloudflare header only for connections from this computer; home-network addresses are shown to the host only.
- **Quit button:** the shutdown request is accepted only from the computer running the server, with a secret token visible only to the local browser, and only from the game's own page.
- **No accounts or passwords:** anyone who knows the room code can join as the second player. Do not expose the game to the internet other than through the tunnel (HTTPS).

## 10. Tests

```
cd Dots
npm test                 # = node engine.test.js && node bot.test.js && node test.js
```
- `bot.test.js` (10 tests): the computer opponent: every decision is a legal move, speed (at most about 0.1 s), hard closes a loop and captures when it can and blocks a spot where the opponent would capture, easy usually captures but rarely defends, hard beats easy in 12 of 12 games (fixed seeds), determinism, and the answer to an "end the game" proposal.
- `engine.test.js` (11 tests): the game rules: capture by a diamond, a gap in the loop, locking, the board edge, the no-suicide rule and its exception, end of game, and 12 random games checking invariants.
- `test.js` (64 tests): the server over HTTP: rooms and sizes, a room against the computer (instant start, no chat, the computer moves by itself, it answers end proposals, rematch), moves and validation, capture, end proposals, resigning, draw, rematch, ending by no moves, long-polling, chat, limits, security, shutdown, and the translations and tutorial.

## 11. Project structure (for developers)

```
Dots/
├── engine.js              game engine (pure functions): captures, locks, suicide, end of game
├── bot.js                 the computer opponent (server side): scores every move with the engine, 2-ply look-ahead on the hard level
├── bot.test.js            computer opponent tests
├── engine.test.js         engine tests
├── server.js              HTTP server: rooms, turns, limits, tunnel, shutdown (no dependencies)
├── test.js                server integration test
├── package.json           scripts: start, local, test
├── uruchom.bat            main start (Windows): cloudflared → tunnel → game → browser
├── uruchom-bez-tunelu.bat start without a tunnel, home network only (Windows)
└── public/                browser files
    ├── index.html, style.css
    ├── app.js             client logic: screens, transport, chat, proposals, game sounds
    ├── board.js           canvas board: drawing, clicks, capture effects
    ├── i18n.js            PL/EN translations
    ├── tutorial.js        in-game tutorial: steps and animations
    ├── music.js, sky.js   ambient music and the animated sky with constellations
    ├── fireworks.js       winner's fireworks
    └── vendor/qrcode.js   QR code generator (qrcode-generator, MIT, bundled unchanged)
```

**The computer opponent (`bot.js`).** The engine can cheaply check any move (`tryMove` returns the new board and the captured dots), so the computer scores every empty spot near the dots: how many dots the move captures, how many dots the opponent would capture there (occupying that spot blocks the loop), and a little for shape (neighbours of its own dots). The **hard** level also looks one move further for its best candidates: it subtracts what the opponent could capture in reply and rewards creating two different capture threats at once (the opponent can block only one). The **easy** level captures when it sees a capture (in about 80% of its moves), otherwise puts a dot next to other dots, and does not defend.

**How it works.** The server keeps room state in memory. The client sends moves as plain POST requests and receives changes through an **SSE** stream (or, when the stream does not arrive, e.g. through a tunnel, it switches to **long-polling**). Enclosure is computed by flood-filling the board from the outside in 4 directions while avoiding the live dots of one colour: cells that cannot be reached are enclosed.

**HTTP interface:**

| Method and address | Description |
|---|---|
| `POST /api/create` (`{size: s/m/l, vs: friend/bot, level: easy/hard}`), `/api/join` | create a room and join it (code → player token) |
| `POST /api/move` (`{x, y}`) | place a dot |
| `POST /api/offer` (`{action: offer/accept/reject/cancel}`), `/api/resign`, `/api/rematch` | end by agreement, resign, rematch |
| `POST /api/chat` | chat message |
| `POST /api/shutdown` | shut down the server and tunnel (local computer only, secret token) |
| `GET /api/events` / `/api/poll` / `/api/state` | live state (SSE) / fallback long-polling / one-off read |
| `GET /api/info` | tunnel address, local-network addresses, sizes, shutdown token (local browser only) |

Errors look like `{ "code": "…", "error": "…" }`; the client translates the code into the selected language.

## License

Released under the **MIT** license (see [LICENSE](../LICENSE)). The bundled QR code library has its own MIT license: see [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
