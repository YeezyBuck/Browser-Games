# 🧲 Magnets – a two-player magnet game in the browser

🇵🇱 [Wersja polska](README.pl.md)

A game of nerve and magnetism for **two players**: on your home network or **over the internet**. Each of you has **10 irregular magnets**, and the field is small. You take turns placing **one magnet** on the field, but magnets attract and repel each other. When magnets **join** after everything has settled, the whole group **returns to the hand of the player who caused it**, even your opponent's magnets. **Whoever gets rid of all their magnets first wins.** The game has a built-in chat, a QR code for joining from a phone, a Polish and English interface, a steel-plate board with a faint magnetic-field background, a calm "lab" music track, sound effects and fireworks for the winner.

You can play **against a friend** or **against the computer** (easy or hard). No libraries to install: all you need is **Node.js**. The server is the referee: it computes the physics of every magnet you place, finds the joined groups and tells both players the result. The game is built on top of [WarShips](../WarShips/README.md), [Dots](../Dots/README.md) and [CapRace](../CapRace/README.md) and shares their infrastructure (rooms, Cloudflare tunnel, chat, security).

<p align="center">
  <img src="../docs/screenshots/magnets-aim.jpg" width="48%" alt="Magnets: placing a magnet next to an opponent's magnet, with the force lines and the warning">
  <img src="../docs/screenshots/magnets-win.jpg" width="48%" alt="Magnets: the winner has an empty hand and fireworks">
</p>
<p align="center">
  <img src="../docs/screenshots/magnets-tutorial.jpg" width="48%" alt="Magnets: the in-game tutorial with the map of safe spots">
  <img src="../docs/screenshots/magnets-mobile.jpg" width="22%" alt="Magnets on a phone">
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

- Two players, **10 magnets** each. The shapes are irregular (2-3 joined discs), **both players get the same ten shapes**, and the shapes are drawn again for every game. Each magnet has a **red N pole** and a **blue S pole**. **Different poles attract, like poles repel**, and the closer, the stronger.
- **The field** is a steel plate (chosen when creating the game): **small** 460×290 (harder), **medium** 540×340 or **large** 640×400 (easier). The table has **friction**: a magnet that lies far enough from the others stays put. Place it closer and it starts to slide, turn and snap towards its neighbours.
- **A turn.** On your turn pick a magnet from your hand, choose its position and rotation and place it. You cannot place it on another magnet or right against the wall. Then all the magnets move until they settle (at most a few seconds).
- **Joining.** After everything has settled, magnets that **touch** are joined. **Every** joined group (including your opponent's magnets in it) leaves the field and **goes to the hand of the player who caused it**. If removing a group lets other magnets move, they move again and any new joins are returned the same way.
- **The winner** is whoever gets **rid of all their magnets first** (empty hand after their move). If your last magnet joins others, it comes back to your hand and the game goes on.
- After **40 moves each**, or when the next player has nowhere left to place a magnet, the player with **fewer magnets in hand** wins (equal numbers: a draw). You can also **resign**.
- After a game you can play a **rematch**: new shapes, an empty field, and the other player starts.

## 2. What you need and installation

| Item | Purpose | Required? |
|---|---|---|
| **Node.js 18 or newer** | runs the game server | yes |
| A modern browser (Chrome, Edge, Firefox, Safari, Brave) | the game runs in the browser, for both players; a mouse or a touch screen | yes |
| **cloudflared** (Cloudflare program) | tunnel for playing over the internet | only for internet play; **installation is automatic** (see section 5) |

No accounts (Cloudflare, GitHub, etc.) are needed. The game works on Windows, macOS and Linux; the included `.bat` files are for Windows.

**Installation, step by step:**
1. Install Node.js: download the LTS version from <https://nodejs.org> and install it with the default settings.
2. Check in a terminal: `node --version` (you should see e.g. `v22.11.0`). On a "command not recognized" error, close and reopen the terminal or restart the computer.
3. Get the repository: `git clone https://github.com/YeezyBuck/Browser-Games.git` (the game is in the `Magnets` folder) or download the ZIP from GitHub and unpack it.

The game needs no installation or build: there is no `npm install`.

## 3. Starting the server

Pick one of the options. After startup the console shows the game address. The default port is **3300** (WarShips uses 3000, Dots 3100 and CapRace 3200, so all games can run at the same time).

### Windows – double-click (easiest)
- **`uruchom.bat`** (the main one): checks cloudflared (offers to install it if needed), starts the tunnel, then the game and the browser. The game works on your home network **and over the internet**.
- **`uruchom-bez-tunelu.bat`**: home network only (no cloudflared, no internet link or QR code).

A console window opens: **do not close it while playing**. The game page opens by itself in your browser (`http://localhost:3300`). To finish, use the **⏻ Quit game** button (see [section 7](#7-stopping-the-server)).

### Terminal (Windows, macOS, Linux)
```
cd Magnets
node server.js            # home network only
node server.js --tunnel   # with a Cloudflare tunnel (internet play)
node server.js --open     # additionally open the game in your browser
```
`npm` shortcuts: `npm start` (with tunnel and browser, like `uruchom.bat`) and `npm run local` (no tunnel). Different port: `PORT=3400 node server.js` (PowerShell: `$env:PORT=3400; node server.js`).

## 4. How to play, step by step

You need two people (or two browser tabs to try it out alone).

### Player 1 – creates the game
1. Open the game page (`http://localhost:3300`) and, if you like, pick the language with the **Polski / English** buttons.
2. Choose the **field size** and click **Create game**. A **6-letter game code** appears, with ready-made links to give your opponent (🌐 over the internet together with a QR code, 🏠 on the home network).
3. Send your friend the right link (**Copy**) and wait for them to join.

**Playing against the computer:** in the same panel set **Opponent: Computer** and pick the **level** (easy or hard). The game starts at once: there is no code, link, QR code or chat, and the computer always agrees to a rematch.

### Player 2 – joins
Open the link from player 1 (the code fills in automatically), or open the game page, type the code into **Join a game** and click **Join**. On a phone you can scan the QR code.

### Playing
1. The game starts right after the opponent joins. At the top two cards show **how many magnets each player has in hand** and how many moves they have made; the glowing card shows **whose turn it is**. Under the field there is your **hand**: small pictures of your magnets.
2. On your turn **click a magnet in your hand**, then **move the mouse over the field**. A translucent magnet follows the cursor. **Rotate** it with the mouse wheel, the ← → keys (or Q and E), a right click or the ⟲ ⟳ buttons. Click to place it.
3. Before you place it, the game helps you: **green and red lines** show how the poles of your magnet act on the neighbours (attraction and repulsion), a yellow arrow shows the force on your magnet, and the label above the field says **"Nothing will move"** (a safe spot), **"Something will move"** (risky) or **"You cannot place here"**.
4. After you place it, everyone watches the magnets move (the server computed it), hears the clacks and the "ding" of a join. If magnets joined, they glow, leave the field and fly back to the hand of the player who caused it.
5. Get rid of all your magnets first. The winner gets **fireworks** (the 🎆 button replays them). Click **Play again** for a rematch (both players click).

On a touch screen: touch the field and drag, the magnet follows your finger (shown just above it); lift your finger to place it. If the spot is not allowed, nothing happens and you can try again.

## 5. Playing over the internet (Cloudflare tunnel and QR code)

If your opponent is outside your home network, use the tunnel. No account and no router setup needed.

**Automatic cloudflared installation.** When you start with the tunnel (`uruchom.bat`, `npm start`), the server checks whether cloudflared is installed. If not, it offers to install it (Windows: `winget`, macOS: `brew`) and asks in the console (Enter = yes). With the `--yes` flag (or `CLOUDFLARED_AUTO_INSTALL=1`) it installs without asking. Without an interactive console (background server) it never installs anything on its own. Manually: `winget install Cloudflare.cloudflared`, `brew install cloudflared`, or the instructions at <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>.

**Start order:** `[1/3]` check cloudflared, `[2/3]` tunnel and its address, `[3/3]` the game and the browser. If the tunnel fails to start, the game still starts on the home network and the console shows why.

While waiting for your opponent the game shows **which address to give to whom**: 🌐 the tunnel address (`https://….trycloudflare.com/?room=CODE`) together with a **QR code** that your opponent can scan with a phone, and 🏠 the home-network address.

Good to know: the tunnel address is **temporary** (it changes every time), and the computer running the server must stay **on**. The free tunnel does not pass live streams (SSE), so after about 3 s the game **switches to a fallback transport** (long-polling) by itself; players do not notice. The game is turn-based, so the delay of the tunnel does not matter: the movement is computed on the server and replayed on both screens. Anyone who knows the link **and** the code can join as the second player.

## 6. Controls and features

| Feature | How |
|---|---|
| Picking a magnet | click it in your hand under the field |
| Placing | move the mouse over the field and click (touch screen: drag and lift your finger) |
| Rotating | mouse wheel, ← → or Q / E, right click, or the ⟲ ⟳ buttons (15° steps) |
| Hints before placing | green/red lines of the poles, a yellow force arrow, and the label "Nothing will move / Something will move / You cannot place here" |
| Resigning | **Resign** (with confirmation) |
| Rematch | **Play again** after the game |
| Language | **Polski / English** buttons at the top (remembered) |
| Tutorial | **❓ How to play** button at the top; it also opens by itself on your first visit. Six short steps with animations (goal, poles, placing, joining, turns and the end, tips), in Polish and English; four of the animations are computed by the real game engine (including a map of safe spots); arrow keys and Esc work |
| Computer opponent | **Opponent: Computer** when creating a game, level **Easy** or **Hard**; the computer thinks for a moment before each move |
| Chat | 💬 button at the bottom left; Enter sends, Esc closes; up to 200 characters |
| Music / effects | 🎵 / 🔊 buttons (remembered); music: an original calm "lab" track generated in the browser (92 bpm); sounds: placing, clack of magnets, bump on the wall, "ding" of a join, magnets returning, end of game |
| Copying the link | **Copy** in the waiting panel or **Copy link** at the top |
| Quitting the game | **⏻ Quit game** (only in the browser on the computer running the server) |
| Refreshing the page | does not kick you out: the session is remembered in the tab |

The background (faint magnetic-field lines) is drawn once, without animation. The sparks are turned off, and a move is shown at once, if your system has "reduce motion" enabled.

## 7. Stopping the server

- **Easiest:** click **⏻ Quit game** at the top of the page (on the computer where the server runs) and confirm. The server and tunnel shut down, the console window closes, the browser tab tries to close too (Chrome/Edge/Brave usually manage it for tabs opened by the `.bat` file; Firefox and Safari usually do not), and your opponent sees "The game has been closed".
- Alternatively, press **Ctrl+C** in the console window.
- Stopping the server **ends all games in progress** (rooms are kept in memory only).

## 8. Troubleshooting

| Problem | Solution |
|---|---|
| `node` is not recognized | Install Node.js, open a **new** terminal or restart the computer. |
| `Port 3300 is in use` (`EADDRINUSE`) | The game is already running or another program uses the port. Close it (**⏻ Quit game**) or use another port: `PORT=3400 node server.js`. |
| Opponent at home cannot open the address | Use the "local network" address, not `localhost`; both devices on the same network; if Windows Firewall asks, allow Node.js on private networks. |
| No "over the internet" address or QR code | The server runs without a tunnel: quit the game and start **`uruchom.bat`** / `npm start`. The panel hints at what to do. |
| "cloudflared not found" | Agree to the installation at startup or install it manually (section 5). |
| I cannot place a magnet | It must be your turn (the card glows and the banner says so); pick a magnet in your hand; wait until the previous move finishes; the spot must not be on another magnet or right at the wall (the label says "You cannot place here"). |
| The magnets do something I did not expect | That is the game: after you place a magnet, nearby magnets slide and turn. Use the hints (lines and the label) and the safe spots. |
| "This game no longer exists" | The server was restarted (rooms are in memory) or the room expired after 3 hours of inactivity. Create a new game. |
| No sound or music | Click anything on the page (browsers block audio until the first interaction) and check 🎵 and 🔊. |
| The page looks old after an update | Refresh without cache: **Ctrl+F5**. |
| "Too many requests" | A safety limit kicked in. Wait a moment. |

## 9. Settings and security

| Setting | Effect |
|---|---|
| `PORT` | server port (default 3300) |
| `--tunnel` / `TUNNEL=1` | start the Cloudflare tunnel |
| `--open` / `OPEN_BROWSER=1` | open the game in the default browser after start |
| `--yes` / `CLOUDFLARED_AUTO_INSTALL=1` | install cloudflared without asking |
| `CLOUDFLARED` | full path to the `cloudflared` program |

Physics constants (strength of the magnets, friction, field sizes, the number of magnets, the move limit) are in the `P` object of `public/engine.js`, and server limits in the `LIMITS` object of `server.js`.

- **The computer opponent plays by the same rules:** it runs on the server and places its magnets through the same checked path as a human move, so it cannot cheat. Its token never reaches the browser.
- **The server decides everything:** it computes the whole movement after each placed magnet and finds the joined groups; the client only sends the magnet number, the position and the angle and replays the result, so it cannot cheat. Every number from the client is checked (finite numbers only, the magnet must be in your hand, the spot must be free), and a move is accepted only on your turn and only after the previous movement has ended.
- **6-letter room code**, join-attempt limit (12/min per IP), room-creation limit (10 per 10 min per IP), at most 300 rooms, request limit (600/min per IP), move limit (3/s per player), live-connection limit; rooms expire after 3 hours of inactivity.
- **Chat:** up to 200 characters, 6 messages per 10 s, plain text only (no HTML), control and invisible characters removed.
- **Security headers:** Content-Security-Policy (own scripts only), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`.
- **Behind the tunnel** the real client address is taken from the Cloudflare header only for connections from this computer; home-network addresses are shown to the host only.
- **Quit button:** the shutdown request is accepted only from the computer running the server, with a secret token visible only to the local browser, and only from the game's own page.
- **No accounts or passwords:** anyone who knows the room code can join as the second player. Do not expose the game to the internet other than through the tunnel (HTTPS).
- **Note:** `public/engine.js` is served to browsers on purpose (the client draws the magnets from the seed and shows the hints with the same physics). It contains no secrets: the server never trusts the client's computation. Both players' hands are public by design (the shapes are the same for both).

## 10. Tests

```
cd Magnets
npm test                 # = node engine.test.js && node bot.test.js && node test.js
```
- `bot.test.js` (7 tests): the computer opponent: every decision is a legal move, speed (hard at most about 0.8 s), at the start of a game hard always places in a safe spot, whole bot-vs-bot games with fixed seeds (hard beats easy in 22 of 22 games on all three fields), determinism.
- `engine.test.js` (29 tests): the engine: shapes (2000 random shapes are valid, solid, balanced, with N/S poles inside the body), placing (field, wall, clearance, invalid numbers), forces (Newton's third law, translation invariance), attraction range, friction that holds distant magnets, repulsion, the joined-group detection, returns including the opponent's magnets, determinism, and 14 random full games (no NaN, magnets stay in the field and never sink into each other, none is lost or duplicated, speed and payload size).
- `test.js` (71 tests): the server over HTTP: rooms and field sizes, a room against the computer (instant start, no chat, the computer places by itself, rematch), move validation, placing, joins and returns to the hand, winning with an empty hand, the move limit, a blocked field, resigning, rematch, long-polling, chat, limits, security, shutdown, and the translations and tutorial.

## 11. Project structure (for developers)

```
Magnets/
├── bot.js                 the computer opponent (server side): safe spots, denial of safe spots, simulation of risky moves
├── bot.test.js            computer opponent tests
├── engine.test.js         engine tests
├── server.js              HTTP server: rooms, turns, hands, limits, tunnel, shutdown (no dependencies)
├── test.js                server integration test
├── package.json           scripts: start, local, test
├── uruchom.bat            main start (Windows): cloudflared → tunnel → game → browser
├── uruchom-bez-tunelu.bat start without a tunnel, home network only (Windows)
└── public/                browser files (and the shared engine)
    ├── engine.js          engine used by BOTH the server and the browser: shapes, forces, collisions, joins, one whole turn
    ├── index.html, style.css
    ├── app.js             client logic: screens, transport, chat, hand, turn playback, game sounds
    ├── board.js           canvas field: steel plate, magnets, ghost with hints, playback, mouse/touch
    ├── i18n.js            PL/EN translations
    ├── tutorial.js        in-game tutorial: steps and animations (four use the real engine)
    ├── music.js, field.js calm generated music and the magnetic-field background
    ├── fireworks.js       winner's fireworks
    └── vendor/qrcode.js   QR code generator (qrcode-generator, MIT, bundled unchanged)
```

**The computer opponent (`bot.js`).** A magnet placed in a "safe spot" (the engine's preview says nothing exceeds the static friction) does not move and cannot join anything, so it shrinks the hand by one; safe spots run out as the field fills, and whoever has to move when there are none risks a join. The **hard** computer therefore places its most awkward magnet (the one with the fewest safe spots) in the safe spot that leaves the opponent the fewest safe spots, and when there is no safe spot it simulates risky moves with the full physics and picks the cheapest one. The **easy** computer puts a random magnet in a random safe spot and makes a random mistake every third move.

**How it works.** A magnet is a rigid body made of 2-3 discs (mass proportional to area) with two point poles of opposite charge. Between the poles of every pair of magnets acts a force `K·q₁·q₂ / (d² + ε²)` (attraction for opposite signs); it also produces a torque. The table gives dry friction: a magnet at rest moves only when its acceleration exceeds a threshold, so distant magnets lie still. The simulation runs at 240 steps per second with impulse-based collisions (restitution, tangential friction) and walls. A phase ends when everything is quiet (small tremors of already joined magnets do not count). Then the server finds groups of **touching** magnets, removes all of them to the hand of the player who caused them, and runs the movement of the remaining magnets again (up to five rounds). The server sends the room state with the **seed** (the client rebuilds the same shapes) and, after a move, **phases** with the frames (30 per second, only for magnets that moved) and the sound events; clients interpolate them. The server keeps room state in memory; clients receive changes through an **SSE** stream (or **long-polling** when the stream does not arrive, e.g. through a tunnel).

**HTTP interface:**

| Method and address | Description |
|---|---|
| `POST /api/create` (`{field: s/m/l, vs: friend/bot, level: easy/hard}`), `/api/join` | create a room and join it (code → player token) |
| `POST /api/place` (`{id, x, y, a}`: magnet number from your hand, centre of mass, angle in radians) | place a magnet |
| `POST /api/resign`, `/api/rematch` | resign, rematch (new shapes) |
| `POST /api/chat` | chat message |
| `POST /api/shutdown` | shut down the server and tunnel (local computer only, secret token) |
| `GET /api/events` / `/api/poll` / `/api/state` | live state (SSE) / fallback long-polling / one-off read |
| `GET /api/info` | tunnel address, local-network addresses, field sizes, shutdown token (local browser only) |

Errors look like `{ "code": "…", "error": "…" }`; the client translates the code into the selected language.

## License

Released under the **MIT** license (see [LICENSE](../LICENSE)). The bundled QR code library has its own MIT license: see [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
