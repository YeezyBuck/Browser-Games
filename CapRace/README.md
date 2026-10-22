# 🏁 Cap Race – a two-player bottle-cap racing game in the browser

🇵🇱 [Wersja polska](README.pl.md)

The playground classic, **bottle-cap racing**, for **two players**: on your home network or **over the internet**. Each player has one bottle cap and the two of you race along a **randomly generated track** drawn in chalk on the asphalt. You flick your cap with the mouse (or a finger): **where you hit it** decides the spin and **how far you pull the cursor back** decides the power. The first cap over the finish line wins. The game has a built-in chat, a QR code for joining from a phone, a Polish and English interface, chalk drawings on the track and in the background, driving electronic racing music, sound effects and fireworks for the winner.

No libraries to install: all you need is **Node.js**. The server is the referee: it generates the track, computes the physics of every flick and tells both players the result. The game is built on top of [WarShips](../WarShips/README.md) and [Dots](../Dots/README.md) and shares their infrastructure (rooms, Cloudflare tunnel, chat, security).

<p align="center">
  <img src="../docs/screenshots/caprace-aim.jpg" width="48%" alt="Cap Race: aiming a flick, with the preview of the flight path">
  <img src="../docs/screenshots/caprace-finish.jpg" width="48%" alt="Cap Race: the winner's cap behind the finish line and fireworks">
</p>
<p align="center">
  <img src="../docs/screenshots/caprace-tutorial.jpg" width="48%" alt="Cap Race: the in-game tutorial">
  <img src="../docs/screenshots/caprace-mobile.jpg" width="22%" alt="Cap Race on a phone">
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

- Two players, one **bottle cap** each (the cap of player one is red, of player two blue). You race along a **random track**: a winding road with chalk walls, a start line and a chequered finish line. Every new game, and every rematch, has a **different track**. Length (chosen when creating the game): **short**, **medium** or **long**.
- **Flicking.** On your turn press your cap and pull the cursor back like a slingshot; the cap flies the **opposite way**. The **power** is the length of the pull (the arrow and the HUD show it live; pulling beyond the maximum gives full power). Release to flick. Esc or a pull that is too short cancels.
- **Spin.** The spot where you press the cap decides the spin: hit the **right** side (looking along the flight) and the flight **curves left**, hit the **left** side and it curves right; the middle flies straight. A dotted preview shows the beginning of the flight (without walls and without the other cap).
- **Walls and no shortcuts.** The cap bounces off the chalk walls (losing some speed and spin) and never leaves the track, so you have to cover the whole course.
- **Collisions.** The caps collide: you can knock your rival away or push them into a wall.
- **Who flicks.** Default rule: **the player who is farther from the finish** (like in the real playground game): whoever is behind catches up, the leader waits. Equal distance: taking turns. Alternatively pick plain **taking turns** when creating the game.
- **The winner** is the cap that **first crosses the finish line**, even if your rival pushed it there. After **40 flicks each**, whoever is closer to the finish wins (equal distance: a draw). You can also **resign**.
- After a game you can play a **rematch**: a new track is generated and the other player starts.

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
3. Get the repository: `git clone https://github.com/YeezyBuck/Browser-Games.git` (the game is in the `CapRace` folder) or download the ZIP from GitHub and unpack it.

The game needs no installation or build: there is no `npm install`.

## 3. Starting the server

Pick one of the options. After startup the console shows the game address. The default port is **3200** (WarShips uses 3000 and Dots 3100, so all games can run at the same time).

### Windows – double-click (easiest)
- **`uruchom.bat`** (the main one): checks cloudflared (offers to install it if needed), starts the tunnel, then the game and the browser. The game works on your home network **and over the internet**.
- **`uruchom-bez-tunelu.bat`**: home network only (no cloudflared, no internet link or QR code).

A console window opens: **do not close it while playing**. The game page opens by itself in your browser (`http://localhost:3200`). To finish, use the **⏻ Quit game** button (see [section 7](#7-stopping-the-server)).

### Terminal (Windows, macOS, Linux)
```
cd CapRace
node server.js            # home network only
node server.js --tunnel   # with a Cloudflare tunnel (internet play)
node server.js --open     # additionally open the game in your browser
```
`npm` shortcuts: `npm start` (with tunnel and browser, like `uruchom.bat`) and `npm run local` (no tunnel). Different port: `PORT=3300 node server.js` (PowerShell: `$env:PORT=3300; node server.js`).

## 4. How to play, step by step

You need two people (or two browser tabs to try it out alone).

### Player 1 – creates the game
1. Open the game page (`http://localhost:3200`) and, if you like, pick the language with the **Polski / English** buttons.
2. Choose the **track length** and **who flicks**, then click **Create game**. A **6-letter game code** appears, with ready-made links to give your opponent (🌐 over the internet together with a QR code, 🏠 on the home network).
3. Send your friend the right link (**Copy**) and wait for them to join.

### Player 2 – joins
Open the link from player 1 (the code fills in automatically), or open the game page, type the code into **Join a game** and click **Join**. On a phone you can scan the QR code.

### Playing
1. The game starts right after the opponent joins: both caps stand on the start line. At the top you see two cards with each player's **progress towards the finish** and the number of flicks; the glowing card shows **whose turn it is**. A minimap of the whole track is in the corner of the board, and the camera follows the action by itself.
2. On your turn **press your cap** (the spot you press is the hit spot) and **pull the mouse back**. A coloured arrow shows the direction and the power, the HUD shows the percentages and the curve, and the dotted preview shows the beginning of the flight. Release to flick.
3. Both players watch the cap fly (the server computed it) and hear the flick, the bounces off the walls and the clink of colliding caps. Then it is the next player's turn.
4. Cross the finish line first. The winner gets **fireworks** (the 🎆 button replays them). Click **Play again** for a rematch (both players click).

## 5. Playing over the internet (Cloudflare tunnel and QR code)

If your opponent is outside your home network, use the tunnel. No account and no router setup needed.

**Automatic cloudflared installation.** When you start with the tunnel (`uruchom.bat`, `npm start`), the server checks whether cloudflared is installed. If not, it offers to install it (Windows: `winget`, macOS: `brew`) and asks in the console (Enter = yes). With the `--yes` flag (or `CLOUDFLARED_AUTO_INSTALL=1`) it installs without asking. Without an interactive console (background server) it never installs anything on its own. Manually: `winget install Cloudflare.cloudflared`, `brew install cloudflared`, or the instructions at <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>.

**Start order:** `[1/3]` check cloudflared, `[2/3]` tunnel and its address, `[3/3]` the game and the browser. If the tunnel fails to start, the game still starts on the home network and the console shows why.

While waiting for your opponent the game shows **which address to give to whom**: 🌐 the tunnel address (`https://….trycloudflare.com/?room=CODE`) together with a **QR code** that your opponent can scan with a phone, and 🏠 the home-network address.

Good to know: the tunnel address is **temporary** (it changes every time), and the computer running the server must stay **on**. The free tunnel does not pass live streams (SSE), so after about 3 s the game **switches to a fallback transport** (long-polling) by itself; players do not notice. The game is turn-based, so the delay of the tunnel does not matter: the flight is computed on the server and replayed on both screens. Anyone who knows the link **and** the code can join as the second player.

## 6. Controls and features

| Feature | How |
|---|---|
| Flicking | press your cap and pull the mouse (or finger) back; release to flick; **Esc** (or a right click) cancels |
| Power / spin | pull length / the spot you press on the cap (see section 1) |
| Resigning | **Resign** (with confirmation) |
| Rematch | **Play again (new track)** after the game |
| Language | **Polski / English** buttons at the top (remembered) |
| Tutorial | **❓ How to play** button at the top; it also opens by itself on your first visit. Six short steps with animations (goal, flicking, spin, track and walls, turns and collisions, tips), in Polish and English; arrow keys and Esc work |
| Chat | 💬 button at the bottom left; Enter sends, Esc closes; up to 200 characters |
| Music / effects | 🎵 / 🔊 buttons (remembered); music: an original electronic "race" track generated in the browser (about 126 bpm); sounds: flick, wall bounce, clink of caps, finish |
| Copying the link | **Copy** in the waiting panel or **Copy link** at the top |
| Quitting the game | **⏻ Quit game** (only in the browser on the computer running the server) |
| Refreshing the page | does not kick you out: the session is remembered in the tab, and a flight in progress is joined where it is |

The chalk drawings (on the track: arrows, stars, smileys, hopscotch, skid marks, "GO!" after the start; beside it: small doodles on the asphalt) are only decoration: they are placed from the track seed, so both players see the same ones, and they do not affect the physics. The background doodles are drawn once, without animation. The particle effects and fireworks are turned off if your system has "reduce motion" enabled. On narrow screens the board keeps a minimum scale, so the cap stays big enough to touch.

## 7. Stopping the server

- **Easiest:** click **⏻ Quit game** at the top of the page (on the computer where the server runs) and confirm. The server and tunnel shut down, the console window closes, the browser tab tries to close too (Chrome/Edge/Brave usually manage it for tabs opened by the `.bat` file; Firefox and Safari usually do not), and your opponent sees "The game has been closed".
- Alternatively, press **Ctrl+C** in the console window.
- Stopping the server **ends all games in progress** (rooms are kept in memory only).

## 8. Troubleshooting

| Problem | Solution |
|---|---|
| `node` is not recognized | Install Node.js, open a **new** terminal or restart the computer. |
| `Port 3200 is in use` (`EADDRINUSE`) | The game is already running or another program uses the port. Close it (**⏻ Quit game**) or use another port: `PORT=3300 node server.js`. |
| Opponent at home cannot open the address | Use the "local network" address, not `localhost`; both devices on the same network; if Windows Firewall asks, allow Node.js on private networks. |
| No "over the internet" address or QR code | The server runs without a tunnel: quit the game and start **`uruchom.bat`** / `npm start`. The panel hints at what to do. |
| "cloudflared not found" | Agree to the installation at startup or install it manually (section 5). |
| I cannot grab my cap | It must be your turn (the card glows and the banner says so); press **on the cap** or very close to it; wait until the previous flight ends. |
| "Pull the mouse farther to flick" | The pull was too short (below about 15 pixels it counts as a cancel). Pull the mouse a bit farther. |
| "This game no longer exists" | The server was restarted (rooms are in memory) or the room expired after 3 hours of inactivity. Create a new game. |
| No sound or music | Click anything on the page (browsers block audio until the first interaction) and check 🎵 and 🔊. |
| The page looks old after an update | Refresh without cache: **Ctrl+F5**. |
| "Too many requests" | A safety limit kicked in. Wait a moment. |

## 9. Settings and security

| Setting | Effect |
|---|---|
| `PORT` | server port (default 3200) |
| `--tunnel` / `TUNNEL=1` | start the Cloudflare tunnel |
| `--open` / `OPEN_BROWSER=1` | open the game in the default browser after start |
| `--yes` / `CLOUDFLARED_AUTO_INSTALL=1` | install cloudflared without asking |
| `CLOUDFLARED` | full path to the `cloudflared` program |

Physics constants (cap size, track width, friction, spin, flick limit) are in the `P` object of `public/engine.js`, and server limits in the `LIMITS` object of `server.js`.

- **The server decides everything:** it draws the track seed, computes the whole flight of every flick and the finish; the client only sends the hit spot and the pull and replays the result, so it cannot cheat. Every number from the client is checked (finite numbers only, clamped), a flick is accepted only on your turn and only after the previous flight has ended.
- **6-letter room code**, join-attempt limit (12/min per IP), room-creation limit (10 per 10 min per IP), at most 300 rooms, request limit (600/min per IP), flick limit (3/s per player), live-connection limit; rooms expire after 3 hours of inactivity.
- **Chat:** up to 200 characters, 6 messages per 10 s, plain text only (no HTML), control and invisible characters removed.
- **Security headers:** Content-Security-Policy (own scripts only), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`.
- **Behind the tunnel** the real client address is taken from the Cloudflare header only for connections from this computer; home-network addresses are shown to the host only.
- **Quit button:** the shutdown request is accepted only from the computer running the server, with a secret token visible only to the local browser, and only from the game's own page.
- **No accounts or passwords:** anyone who knows the room code can join as the second player. Do not expose the game to the internet other than through the tunnel (HTTPS).
- **Note:** `public/engine.js` is served to browsers on purpose (the client draws the track from the seed and previews the flight with the same physics). It contains no secrets: the server never trusts the client's computation.

## 10. Tests

```
cd CapRace
npm test                 # = node engine.test.js && node test.js
```
- `engine.test.js` (31 tests): the engine: the same seed gives the same track, 450 random tracks (length, no overlapping corridors, smooth curve), the flick input (cancel, clamping, spin sign), the range and the curve of a flick, collisions (momentum, no energy gain, caps never overlap), 1000 random flicks on 40 tracks (the cap never leaves the track), the finish, determinism, who flicks, and the chalk drawings (deterministic, on the track and clear of the walls).
- `test.js` (61 tests): the server over HTTP: rooms and settings, flick validation, the busy lock, both turn rules, the finish, the flick limit, resigning, rematch, long-polling, chat, limits, security, shutdown, and the translations and tutorial.

## 11. Project structure (for developers)

```
CapRace/
├── engine.test.js         engine tests
├── server.js              HTTP server: rooms, turns, limits, tunnel, shutdown (no dependencies)
├── test.js                server integration test
├── package.json           scripts: start, local, test
├── uruchom.bat            main start (Windows): cloudflared → tunnel → game → browser
├── uruchom-bez-tunelu.bat start without a tunnel, home network only (Windows)
└── public/                browser files (and the shared engine)
    ├── engine.js          engine used by BOTH the server and the browser: track generator and flick physics
    ├── index.html, style.css
    ├── app.js             client logic: screens, transport, chat, flight playback, game sounds
    ├── board.js           canvas board: track, caps, camera, minimap, aiming with mouse/touch
    ├── i18n.js            PL/EN translations
    ├── tutorial.js        in-game tutorial: steps and animations (one uses the real engine)
    ├── music.js, chalk.js electronic racing music (generated) and the chalk-doodle background
    ├── fireworks.js       winner's fireworks
    └── vendor/qrcode.js   QR code generator (qrcode-generator, MIT, bundled unchanged)
```

**How it works.** The track is a centre curve built from straights and gentle arcs (radius at least 130, so it is never sharper than the track is wide) sampled every 8 units; the generator retries with the next seed if two parts of the track come close. A cap is "on the track" while its centre is closer than `halfW - capR` to the curve, so the walls are round and there are no shortcuts. Physics (120 steps per second): constant plus proportional friction, a heading that turns with the decaying spin, impulses for collisions with the walls (restitution 0.6) and between caps (0.9). The server sends the room state with the track **seed** (the client rebuilds the same track) and, after a flick, the **trajectory** sampled at 30 frames per second plus sound events; clients interpolate it. The server keeps room state in memory; clients receive changes through an **SSE** stream (or **long-polling** when the stream does not arrive, e.g. through a tunnel).

**HTTP interface:**

| Method and address | Description |
|---|---|
| `POST /api/create` (`{len: s/m/l, rule: last/alternate}`), `/api/join` | create a room and join it (code → player token) |
| `POST /api/shoot` (`{hx, hy, px, py}`: hit spot on the cap −1..1, pull vector) | flick the cap |
| `POST /api/resign`, `/api/rematch` | resign, rematch (new track) |
| `POST /api/chat` | chat message |
| `POST /api/shutdown` | shut down the server and tunnel (local computer only, secret token) |
| `GET /api/events` / `/api/poll` / `/api/state` | live state (SSE) / fallback long-polling / one-off read |
| `GET /api/info` | tunnel address, local-network addresses, lengths and rules, shutdown token (local browser only) |

Errors look like `{ "code": "…", "error": "…" }`; the client translates the code into the selected language.

## License

Released under the **MIT** license (see [LICENSE](../LICENSE)). The bundled QR code library has its own MIT license: see [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
