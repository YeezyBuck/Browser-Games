'use strict';
// Gra w statki dla dwóch osób przez przeglądarkę.
// Serwer jest "sędzią": trzyma pozycje statków i nigdy nie wysyła przeciwnikowi
// położenia niezatopionych statków (poza ujawnieniem planszy po zakończeniu gry).
// Bez zależności zewnętrznych: statyczne pliki + SSE (serwer -> klient) + POST (klient -> serwer).

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const readline = require('readline');
const net = require('net');

const PORT = Number(process.env.PORT) || 3000;
const SIZE = 10;
const FLEET = { 4: 1, 3: 2, 2: 3, 1: 4 };      // długość -> ile sztuk (1x4, 2x3, 3x2, 4x1 masztów)
const SHIPS_TOTAL = Object.values(FLEET).reduce((a, b) => a + b, 0);
const KEEP_TURN_ON_HIT = false;                 // false: jeden strzał i zmiana gracza; true: po trafieniu strzelasz dalej
const ALLOW_TOUCHING = false;                   // klasyczna zasada: statki nie mogą się stykać (także rogami)
const PUBLIC_DIR = path.join(__dirname, 'public');
const ROOM_TTL_MS = 3 * 60 * 60 * 1000;

// ---------- limity bezpieczeństwa (dla gry wystawionej do internetu) ----------
const CODE_LEN = 6;                              // 24^6 ≈ 190 mln kodów – nie do zgadnięcia przy limicie prób
const LIMITS = {
  maxRooms: 300,                                 // łącznie pokoi na serwerze
  requestsPerMin: 600,                           // żądań HTTP na adres IP (strona + API)
  joinPerMin: 12,                                // prób dołączenia na adres IP
  createPer10Min: 10,                            // zakładanych pokoi na adres IP
  sseConnsPerIp: 8,                              // jednoczesnych połączeń na żywo na adres IP
  connsPerPlayer: 3,                             // połączeń na żywo na gracza
  pollMs: 20000,                                 // jak długo serwer wstrzymuje long-poll, jeśli nic się nie zmienia
  chatMaxLen: 200,                               // znaków w jednej wiadomości
  chatPer10s: 6,                                 // wiadomości na gracza na 10 s
  chatKeep: 100,                                 // ile wiadomości pamięta pokój
  presenceMs: 10000,                             // gracz bez żadnej aktywności dłużej niż tyle jest uznany za rozłączonego
};

const rooms = new Map();

// ---------- pomocnicze ----------
const key = (x, y) => x + ',' + y;
const inBoard = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < SIZE && y < SIZE;

function makeCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let c = '';
    for (let i = 0; i < CODE_LEN; i++) c += letters[crypto.randomInt(letters.length)];
    if (!rooms.has(c)) return c;
  }
}

// Sprawdza flotę z klienta i zamienia ją na listę statków z komórkami.
function parseFleet(input) {
  if (!Array.isArray(input) || input.length !== SHIPS_TOTAL) return { error: 'fleet_count' };
  const counts = {}, owner = new Map(), ships = [];
  for (let i = 0; i < input.length; i++) {
    const s = input[i];
    if (!s || !Number.isInteger(s.x) || !Number.isInteger(s.y) || !FLEET[s.len] || typeof s.horiz !== 'boolean')
      return { error: 'fleet_ship' };
    const cells = [];
    for (let k = 0; k < s.len; k++) {
      const x = s.x + (s.horiz ? k : 0), y = s.y + (s.horiz ? 0 : k);
      if (!inBoard(x, y)) return { error: 'fleet_bounds' };
      if (owner.has(key(x, y))) return { error: 'fleet_overlap' };
      owner.set(key(x, y), i);
      cells.push([x, y]);
    }
    counts[s.len] = (counts[s.len] || 0) + 1;
    ships.push({ cells });
  }
  for (const len of Object.keys(FLEET)) {
    if (counts[len] !== FLEET[len]) return { error: 'fleet_mix' };
  }
  if (!ALLOW_TOUCHING) {
    for (const [k, i] of owner) {
      const [x, y] = k.split(',').map(Number);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const j = owner.get(key(x + dx, y + dy));
        if (j !== undefined && j !== i) return { error: 'fleet_touch' };
      }
    }
  }
  return { ships };
}

function newPlayer(token) {
  return { token, seen: Date.now(), conns: new Set(), ships: null, cellMap: new Map(), ready: false, received: new Map(), fired: new Map(), rematch: false };
}

function resetForRematch(room) {
  for (const p of room.players) {
    p.ships = null; p.cellMap = new Map(); p.ready = false; p.received = new Map(); p.fired = new Map(); p.rematch = false;
  }
  room.phase = 'placing'; room.turn = null; room.winner = null; room.last = null;
}

const shipSunk = (ship, shotsAtMe) => ship.cells.every(([x, y]) => shotsAtMe.has(key(x, y)));

// Gracz jest "na linii", jeśli ma otwarty strumień/long-poll albo niedawno cokolwiek wysłał (tunel nie przepuszcza SSE).
function isOnline(room, pi) {
  const p = room.players[pi];
  if (!p) return false;
  return p.conns.size > 0 || (room.waiters || []).some(w => w.pi === pi) || Date.now() - p.seen < LIMITS.presenceMs;
}

// ---------- stan widoczny dla konkretnego gracza ----------
function viewFor(room, pi) {
  const me = room.players[pi], opp = room.players[1 - pi];
  const over = room.phase === 'over';
  const oppSunk = opp && opp.ships ? opp.ships.filter(s => shipSunk(s, opp.received)) : [];
  const mySunk = me.ships ? me.ships.filter(s => shipSunk(s, me.received)) : [];
  return {
    code: room.code,
    you: pi,
    phase: room.phase,                       // waiting | placing | playing | over
    turn: room.turn,
    winner: room.winner,
    opponentJoined: !!opp,
    opponentConnected: !!opp && isOnline(room, 1 - pi),
    v: room.version || 0,
    chat: (room.chat || []).slice(-50),
    closed: !!room.closed,
    youReady: me.ready,
    opponentReady: !!opp && opp.ready,
    youWantRematch: me.rematch,
    opponentWantsRematch: !!opp && opp.rematch,
    mine: {
      ships: me.ships ? me.ships.map(s => s.cells) : [],
      shots: [...me.received].map(([k, hit]) => { const [x, y] = k.split(',').map(Number); return { x, y, hit }; }),
      sunk: mySunk.map(s => s.cells),
    },
    target: {
      shots: [...me.fired].map(([k, result]) => { const [x, y] = k.split(',').map(Number); return { x, y, result }; }),
      sunk: oppSunk.map(s => s.cells),
      reveal: over && opp && opp.ships ? opp.ships.map(s => s.cells) : null,
    },
    left: {
      mine: me.ships ? me.ships.length - mySunk.length : null,
      opponent: opp && opp.ships ? opp.ships.length - oppSunk.length : null,
    },
    last: room.last,
  };
}

function broadcast(room) {
  room.updated = Date.now();
  room.version = (room.version || 0) + 1;
  room.players.forEach((p, pi) => {
    const data = 'data: ' + JSON.stringify(viewFor(room, pi)) + '\n\n';
    for (const res of p.conns) { try { res.write(data); } catch (e) { /* martwe połączenie nie może zablokować reszty */ } }
  });
  const waiting = room.waiters || [];
  room.waiters = [];
  for (const w of waiting) { clearTimeout(w.timer); try { sendJson(w.res, 200, viewFor(room, w.pi)); } catch (e) { /* j.w. */ } }
}

// ---------- logika gry ----------
function place(room, pi, input) {
  if (room.phase !== 'placing') return 'not_placing';
  const me = room.players[pi];
  if (me.ready) return 'already_ready';
  const parsed = parseFleet(input);
  if (parsed.error) return parsed.error;
  me.ships = parsed.ships;
  me.cellMap = new Map();
  me.ships.forEach(s => s.cells.forEach(([x, y]) => me.cellMap.set(key(x, y), s)));
  me.ready = true;
  if (room.players.length === 2 && room.players.every(p => p.ready)) {
    room.phase = 'playing';
    room.turn = crypto.randomInt(2);
  }
  return null;
}

function shoot(room, pi, x, y) {
  if (room.phase !== 'playing') return { error: 'not_playing' };
  if (room.turn !== pi) return { error: 'not_your_turn' };
  if (!inBoard(x, y)) return { error: 'out_of_board' };
  const me = room.players[pi], opp = room.players[1 - pi];
  const k = key(x, y);
  if (me.fired.has(k)) return { error: 'already_shot' };
  const ship = opp.cellMap.get(k);
  let result = 'miss';
  if (ship) {
    opp.received.set(k, true);
    result = shipSunk(ship, opp.received) ? 'sunk' : 'hit';
  } else {
    opp.received.set(k, false);
  }
  me.fired.set(k, result);
  if (opp.ships.every(s => shipSunk(s, opp.received))) {
    room.phase = 'over';
    room.winner = pi;
    room.turn = null;
  } else if (result === 'miss' || !KEEP_TURN_ON_HIT) {
    room.turn = 1 - pi;
  }
  room.last = { by: pi, x, y, result, seq: ++room.seq };
  return { result };
}

// Czyści wiadomość: bez znaków sterujących i niewidocznych (w tym przełączających kierunek tekstu), pojedyncze spacje.
function cleanChat(text) {
  if (typeof text !== 'string') return '';
  // ZWJ/ZWNJ (\u200C, \u200D) zostaj\u0105 \u2013 bez nich rozpadaj\u0105 si\u0119 z\u0142o\u017Cone emoji, np. \uD83C\uDFF4\u200D\u2620\uFE0F.
  return text.replace(/[\u0000-\u001F\u007F\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, ' ').replace(/\s+/g, ' ').trim();
}

function chat(room, pi, text) {
  if (room.players.length < 2) return 'no_opponent';
  const msg = cleanChat(text);
  if (!msg || [...msg].length > LIMITS.chatMaxLen) return 'chat_invalid';
  if (!allow('chat', room.code + ':' + pi, LIMITS.chatPer10s, 10000)) return 'rate_limited';
  room.chat.push({ id: ++room.chatSeq, by: pi, text: msg, ts: Date.now() });
  if (room.chat.length > LIMITS.chatKeep) room.chat.splice(0, room.chat.length - LIMITS.chatKeep);
  return null;
}

function rematch(room, pi) {
  if (room.phase !== 'over') return 'not_over';
  room.players[pi].rematch = true;
  if (room.players.length === 2 && room.players.every(p => p.rematch)) resetForRematch(room);
  return null;
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

// ---------- adres klienta, limity, nagłówki ----------
const stripV6 = a => String(a || '').replace(/^::ffff:/, '');
const isLoopback = a => a === '127.0.0.1' || a === '::1';
const isPrivate = a => isLoopback(a) || /^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a) || /^(fe80|fc|fd)/i.test(a);

// Prawdziwy adres klienta. Nagłówkom proxy ufamy tylko, gdy połączenie przyszło z tego komputera (tunel Cloudflare).
function clientIp(req) {
  const remote = stripV6(req.socket.remoteAddress);
  if (isLoopback(remote)) {
    const h = req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (h) return stripV6(h);
  }
  return remote;
}
// Czy żądanie pochodzi z komputera/sieci domowej (a nie z internetu przez tunel)?
function isLocalClient(req) {
  const remote = stripV6(req.socket.remoteAddress);
  return isPrivate(remote) && !req.headers['cf-connecting-ip'] && !req.headers['x-forwarded-for'];
}

const windows = new Map();                       // "nazwa|ip" -> znaczniki czasu
function allow(name, ip, limit, windowMs) {
  const k = name + '|' + ip, now = Date.now();
  const arr = (windows.get(k) || []).filter(t => now - t < windowMs);
  if (arr.length >= limit) { windows.set(k, arr); return false; }
  arr.push(now); windows.set(k, arr);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of windows) if (!arr.length || now - arr[arr.length - 1] > 15 * 60 * 1000) windows.delete(k);
}, 5 * 60 * 1000).unref();
const sseByIp = new Map();

function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

const ADMIN_TOKEN = crypto.randomBytes(16).toString('hex');       // nowy przy każdym starcie serwera
// Połączenie z tego samego komputera (127.0.0.1 / ::1) bez nagłówków proxy – nie przez tunel i nie z sieci domowej.
function isLoopbackClient(req) {
  return isLoopback(stripV6(req.socket.remoteAddress)) && !req.headers['cf-connecting-ip'] && !req.headers['x-forwarded-for'];
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ---------- tunel Cloudflare (gra przez internet) ----------
const TUNNEL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
// status: off | starting | install_prompt | installing | on | not_installed | error
const tunnel = { requested: false, url: null, status: 'off', child: null, log: [] };
const CLOUDFLARED_DOCS = 'https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/';
const KNOWN_CLOUDFLARED = ['C:/Program Files (x86)/cloudflared/cloudflared.exe', 'C:/Program Files/cloudflared/cloudflared.exe'];

const runs = (cmd, args) => { try { return spawnSync(cmd, args, { stdio: 'ignore', windowsHide: true }).status === 0; } catch (e) { return false; } };

// Szuka programu cloudflared: zmienna CLOUDFLARED, PATH, a na Windows typowe foldery instalacji
// (po świeżej instalacji PATH w już otwartych oknach bywa nieaktualny).
function findCloudflared() {
  if (process.env.CLOUDFLARED) return process.env.CLOUDFLARED;
  if (runs('cloudflared', ['--version'])) return 'cloudflared';
  if (process.platform === 'win32') { const f = KNOWN_CLOUDFLARED.find(x => fs.existsSync(x)); if (f) return f; }
  return null;
}

// Czym da się zainstalować cloudflared na tym systemie (albo null, gdy trzeba ręcznie).
function pickInstaller() {
  if (process.platform === 'win32' && runs('winget', ['--version']))
    return { cmd: 'winget', args: ['install', '--id', 'Cloudflare.cloudflared', '--exact', '--accept-package-agreements', '--accept-source-agreements'], text: 'winget install Cloudflare.cloudflared' };
  if (process.platform === 'darwin' && runs('brew', ['--version']))
    return { cmd: 'brew', args: ['install', 'cloudflared'], text: 'brew install cloudflared' };
  return null;
}

function askYesNo(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('SIGINT', () => { rl.close(); process.exit(0); });
    rl.on('close', () => resolve(false));                                   // zamknięty wejście bez odpowiedzi = nie
    rl.question(question, ans => { resolve(!/^\s*(n|nie|no)\b/i.test(ans)); rl.close(); });   // Enter = tak
  });
}

function runInstaller(inst) {
  return new Promise(resolve => {
    let child;
    try { child = spawn(inst.cmd, inst.args, { stdio: 'inherit' }); } catch (e) { return resolve(false); }
    child.on('error', () => resolve(false));
    child.on('exit', code => resolve(code === 0));
  });
}

// Zwraca ścieżkę do cloudflared albo null. Gdy programu nie ma, proponuje instalację:
// pyta w konsoli (Enter = tak) albo instaluje od razu przy fladze --yes / CLOUDFLARED_AUTO_INSTALL=1.
// Bez konsoli interaktywnej (np. serwer w tle) niczego nie instaluje bez zgody – tylko podpowiada polecenie.
async function ensureCloudflared(deps = {}) {
  const find = deps.find || findCloudflared, pick = deps.pickInstaller || pickInstaller;
  const ask = deps.ask || askYesNo, install = deps.install || runInstaller;
  const found = find();
  if (found) { console.log('cloudflared jest zainstalowany.'); return found; }
  console.log('Nie znaleziono programu cloudflared (potrzebnego do gry przez internet).');
  const inst = pick();
  if (!inst) { console.log(`Zainstaluj go ręcznie: ${CLOUDFLARED_DOCS}`); return null; }
  const auto = deps.auto !== undefined ? deps.auto : (process.env.CLOUDFLARED_AUTO_INSTALL === '1' || process.argv.includes('--yes'));
  const interactive = deps.interactive !== undefined ? deps.interactive : !!process.stdin.isTTY;
  if (!auto) {
    if (!interactive) { console.log(`Zainstaluj go poleceniem: ${inst.text}  (albo uruchom serwer z flagą --yes, by zainstalować automatycznie)`); return null; }
    tunnel.status = 'install_prompt';
    if (!(await ask(`Zainstalować go teraz poleceniem "${inst.text}"? [T/n] `))) { console.log('Pomijam instalację – gra przez internet nie będzie dostępna.'); return null; }
  }
  tunnel.status = 'installing';
  console.log(`Instaluję cloudflared: ${inst.text}\n(Windows może poprosić o zgodę w osobnym oknie – zatwierdź ją.)\n`);
  const ok = await install(inst);
  const found2 = ok ? find() : null;
  if (!found2) { console.log(`Instalacja nie powiodła się. Zainstaluj ręcznie: ${inst.text}`); return null; }
  console.log('cloudflared zainstalowany.\n');
  return found2;
}

async function startTunnel(port, opts = {}) {
  tunnel.requested = true; tunnel.status = 'starting'; tunnel.url = null;
  const bin = opts.bin || await ensureCloudflared(opts.deps);
  if (!bin) { tunnel.status = 'not_installed'; return; }
  tunnel.status = 'starting';
  const args = opts.args || ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`];
  let child;
  try {
    child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  } catch (e) { tunnel.status = 'error'; console.log('Nie udało się uruchomić tunelu:', e.message); return; }
  tunnel.child = child;
  const onData = chunk => {
    String(chunk).split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => { tunnel.log.push(l); if (tunnel.log.length > 30) tunnel.log.shift(); });
    const m = String(chunk).match(TUNNEL_RE);
    if (m && !tunnel.url) {
      tunnel.url = m[0]; tunnel.status = 'on';
      const line = '='.repeat(66);
      console.log(`\n${line}\n  GRA PRZEZ INTERNET – przekaż przeciwnikowi ten adres:\n\n      ${tunnel.url}\n\n  (pełny link z kodem pokoju pokaże się w grze po utworzeniu gry)\n${line}\n`);
    }
  };
  child.stdout.on('data', onData); child.stderr.on('data', onData);
  child.on('error', err => {
    tunnel.child = null;
    if (err.code === 'ENOENT') {
      tunnel.status = 'not_installed';
      console.log(`Nie znaleziono programu cloudflared. Zainstaluj go: winget install Cloudflare.cloudflared (więcej: ${CLOUDFLARED_DOCS}).`);
    } else { tunnel.status = 'error'; console.log('Błąd tunelu:', err.message); }
  });
  child.on('exit', code => {
    if (tunnel.child === child) { tunnel.child = null; tunnel.url = null; }
    if (tunnel.status !== 'not_installed' && tunnel.child === null) { tunnel.status = 'error'; console.log('Tunel Cloudflare zakończył pracę (kod ' + code + ').'); }
  });
  const stop = () => { try { child.kill(); } catch (e) {} };
  process.on('exit', stop);
  process.on('SIGINT', () => { stop(); process.exit(0); });
  process.on('SIGTERM', () => { stop(); process.exit(0); });
}

// Adresy w sieci domowej (bez kart wirtualnych: Hyper-V, WSL, VMware, VirtualBox, Docker).
function lanUrls() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces()))
    if (!/vethernet|virtual|vmware|vbox|wsl|docker|hyper-v|loopback|tailscale/i.test(name))
      for (const n of list || []) if (n.family === 'IPv4' && !n.internal) out.push(`http://${n.address}:${PORT}`);
  return out;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

// Błędy zwracamy jako kod (klient tłumaczy go na wybrany język) plus polski opis jako zapas.
const ERR_PL = {
  fleet_count: 'Nieprawidłowa liczba statków.', fleet_ship: 'Nieprawidłowy statek.', fleet_bounds: 'Statek wychodzi poza planszę.',
  fleet_overlap: 'Statki nachodzą na siebie.', fleet_mix: 'Zły skład floty.', fleet_touch: 'Statki nie mogą się stykać.',
  not_placing: 'Teraz nie można ustawiać statków.', already_ready: 'Statki są już zatwierdzone.', not_playing: 'Gra nie trwa.',
  not_your_turn: 'To nie Twoja kolej.', out_of_board: 'Pole poza planszą.', already_shot: 'W to pole już strzelałeś.',
  not_over: 'Gra jeszcze trwa.', rate_limited: 'Zbyt wiele żądań – spróbuj za chwilę.', forbidden: 'Brak uprawnień.', chat_invalid: 'Nieprawidłowa wiadomość.', no_opponent: 'Przeciwnik jeszcze nie dołączył.', too_many_rooms: 'Serwer ma za dużo gier – spróbuj później.', too_many_conns: 'Zbyt wiele połączeń.', room_full: 'W tej grze są już dwie osoby.', bad_request: 'Błędne żądanie.',
  no_room: 'Nie ma gry o takim kodzie.', no_game: 'Nie ma takiej gry.', unknown_cmd: 'Nieznane polecenie.',
};
const fail = (res, status, code) => sendJson(res, status, { code, error: ERR_PL[code] || code });

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 20000) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// Zwraca { room, pi } po sprawdzeniu kodu pokoju i tokenu gracza.
function auth(code, token) {
  const room = typeof code === 'string' ? rooms.get(code.toUpperCase()) : null;
  if (!room) return null;
  const pi = room.players.findIndex(p => typeof token === 'string' && safeEqual(p.token, token));
  if (pi < 0) return null;
  room.players[pi].seen = Date.now();
  return { room, pi };
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Nie znaleziono'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  const ip = clientIp(req);
  if (!allow('req', ip, LIMITS.requestsPerMin, 60000)) return fail(res, 429, 'rate_limited');
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    if (req.method === 'GET' && p === '/api/info') {
      const local = isLocalClient(req);
      return sendJson(res, 200, { publicUrl: tunnel.url, tunnel: tunnel.requested ? tunnel.status : 'off', lan: local ? lanUrls() : [], local, codeLen: CODE_LEN, adminToken: isLoopbackClient(req) ? ADMIN_TOKEN : null });
    }
    if (req.method === 'GET' && p === '/api/events') {
      const a = auth(url.searchParams.get('code'), url.searchParams.get('token'));
      if (!a) { res.writeHead(404); return res.end(); }
      const player = a.room.players[a.pi];
      if (player.conns.size >= LIMITS.connsPerPlayer || (sseByIp.get(ip) || 0) >= LIMITS.sseConnsPerIp) return fail(res, 429, 'too_many_conns');
      sseByIp.set(ip, (sseByIp.get(ip) || 0) + 1);
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 2000\n\n');
      player.conns.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => {
        clearInterval(ping); player.conns.delete(res); broadcast(a.room);
        const left = (sseByIp.get(ip) || 1) - 1; if (left > 0) sseByIp.set(ip, left); else sseByIp.delete(ip);
      });
      broadcast(a.room);
      return;
    }
    if (req.method === 'GET' && p === '/api/poll') {
      // Zapasowy transport dla sieci/tuneli, które nie przepuszczają SSE: żądanie czeka, aż stan się zmieni.
      const a = auth(url.searchParams.get('code'), url.searchParams.get('token'));
      if (!a) return fail(res, 404, 'no_game');
      const room = a.room, since = Number(url.searchParams.get('v'));
      if (!Number.isFinite(since) || since < (room.version || 0)) return sendJson(res, 200, viewFor(room, a.pi));
      room.waiters = room.waiters || [];
      const mine = room.waiters.filter(w => w.pi === a.pi);
      if (mine.length >= 2) {                         // zbyt wiele oczekujących – najstarsze odpowiada od razu
        const old = mine[0]; clearTimeout(old.timer); room.waiters.splice(room.waiters.indexOf(old), 1); sendJson(old.res, 200, viewFor(room, a.pi));
      }
      const w = { res, pi: a.pi, timer: null };
      w.timer = setTimeout(() => {
        const i = room.waiters.indexOf(w); if (i >= 0) room.waiters.splice(i, 1);
        a.room.players[a.pi].seen = Date.now();
        sendJson(res, 200, viewFor(room, a.pi));
      }, LIMITS.pollMs);
      room.waiters.push(w);
      req.on('close', () => { clearTimeout(w.timer); const i = room.waiters.indexOf(w); if (i >= 0) room.waiters.splice(i, 1); });
      if (!room.pres) room.pres = '';
      broadcastPresenceIfChanged(room);
      return;
    }
    if (req.method === 'GET' && p === '/api/state') {
      const a = auth(url.searchParams.get('code'), url.searchParams.get('token'));
      if (!a) return fail(res, 404, 'no_game');
      return sendJson(res, 200, viewFor(a.room, a.pi));
    }
    if (req.method === 'POST' && p.startsWith('/api/')) {
      const body = await readJson(req);
      if (p === '/api/shutdown') {
        // Wyłączenie serwera: tylko z tego komputera (nie przez tunel ani z sieci domowej), z tokenem, który widzi
        // wyłącznie lokalna przeglądarka, i tylko z naszej strony (nagłówek Origin musi pasować do Host).
        const origin = req.headers.origin;
        let sameOrigin = true;
        if (origin) { try { sameOrigin = new URL(origin).host === req.headers.host; } catch (e) { sameOrigin = false; } }
        const token = req.headers['x-admin-token'];
        if (!isLoopbackClient(req) || !sameOrigin || typeof token !== 'string' || !safeEqual(token, ADMIN_TOKEN)) return fail(res, 403, 'forbidden');
        sendJson(res, 200, { ok: true });
        shutdown();
        return;
      }
      if (p === '/api/create') {
        if (!allow('create', ip, LIMITS.createPer10Min, 10 * 60000)) return fail(res, 429, 'rate_limited');
        if (rooms.size >= LIMITS.maxRooms) return fail(res, 503, 'too_many_rooms');
        const room = { code: makeCode(), phase: 'waiting', turn: null, winner: null, last: null, seq: 0, chat: [], chatSeq: 0, updated: Date.now(), players: [] };
        const token = crypto.randomBytes(16).toString('hex');
        room.players.push(newPlayer(token));
        rooms.set(room.code, room);
        return sendJson(res, 200, { code: room.code, token, you: 0 });
      }
      if (p === '/api/join') {
        if (!allow('join', ip, LIMITS.joinPerMin, 60000)) return fail(res, 429, 'rate_limited');
        const code = typeof body.code === 'string' ? body.code.toUpperCase() : '';
        const room = /^[A-Z]+$/.test(code) && code.length === CODE_LEN ? rooms.get(code) : null;
        if (!room) return fail(res, 404, 'no_room');
        if (room.players.length >= 2) return fail(res, 400, 'room_full');
        const token = crypto.randomBytes(16).toString('hex');
        room.players.push(newPlayer(token));
        room.phase = 'placing';
        broadcast(room);
        return sendJson(res, 200, { code: room.code, token, you: 1 });
      }
      const a = auth(body.code, body.token);
      if (!a) return fail(res, 404, 'no_game');
      if (p === '/api/chat') {
        const err = chat(a.room, a.pi, body.text);
        if (err) return fail(res, err === 'rate_limited' ? 429 : 400, err);
        broadcast(a.room);
        return sendJson(res, 200, { ok: true });
      }
      if (p === '/api/place') {
        const err = place(a.room, a.pi, body.ships);
        if (err) return fail(res, 400, err);
        broadcast(a.room);
        return sendJson(res, 200, { ok: true });
      }
      if (p === '/api/shoot') {
        const r = shoot(a.room, a.pi, body.x, body.y);
        if (r.error) return fail(res, 400, r.error);
        broadcast(a.room);
        return sendJson(res, 200, r);
      }
      if (p === '/api/rematch') {
        const err = rematch(a.room, a.pi);
        if (err) return fail(res, 400, err);
        broadcast(a.room);
        return sendJson(res, 200, { ok: true });
      }
      return fail(res, 404, 'unknown_cmd');
    }
    if (req.method === 'GET') return serveStatic(req, res, decodeURIComponent(p));
    res.writeHead(405); res.end();
  } catch (e) {
    if (!res.headersSent) fail(res, 400, 'bad_request');
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) if (now - room.updated > ROOM_TTL_MS) rooms.delete(code);
}, 10 * 60 * 1000).unref();

// Zmiana obecności gracza (np. long-poll przestał pukać) wysyłana do drugiego gracza.
function broadcastPresenceIfChanged(room) {
  if (room.players.length < 2) return;
  const sig = [0, 1].map(i => isOnline(room, i) ? 1 : 0).join('');
  if (sig !== room.pres) { const first = room.pres === undefined || room.pres === ''; room.pres = sig; if (!first) broadcast(room); }
}
setInterval(() => { for (const room of rooms.values()) broadcastPresenceIfChanged(room); }, 4000).unref();

// Zamknięcie gry: informuje graczy (stan "closed"), zatrzymuje tunel i kończy proces.
const hooks = { exit: code => process.exit(code) };
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\nZamykam grę: wyłączam serwer i tunel…');
  for (const room of rooms.values()) { room.closed = true; try { broadcast(room); } catch (e) { /* jeden zepsuty pokój nie może przerwać zamykania reszty */ } }
  if (tunnel.child) { try { tunnel.child.kill(); } catch (e) {} }
  setTimeout(() => { try { server.close(); } catch (e) {} hooks.exit(0); }, 700);
}

// Otwiera stronę w domyślnej przeglądarce (flaga --open lub OPEN_BROWSER=1).
function openBrowser(url) {
  try {
    const [cmd, args] = process.platform === 'win32' ? ['cmd.exe', ['/c', 'start', '', url]]
      : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    const c = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true });
    c.on('error', () => console.log('Nie udało się otworzyć przeglądarki – otwórz ręcznie: ' + url));
    c.unref();
    console.log('Otwieram przeglądarkę: ' + url);
  } catch (e) { console.log('Nie udało się otworzyć przeglądarki – otwórz ręcznie: ' + url); }
}

// Czeka, aż tunel poda adres (albo zakończy się porażką, albo minie limit czasu). Zwraca true, gdy tunel działa.
function waitForTunnel(ms) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const failed = tunnel.status === 'error' || tunnel.status === 'not_installed';
      if (tunnel.status === 'on' || failed || Date.now() - t0 > ms) { clearInterval(iv); resolve(tunnel.status === 'on'); }
    }, 200);
  });
}

// Czy port jest wolny? (sprawdzamy przed uruchomieniem tunelu, żeby nie zostawiać go bez gry)
function checkPortFree(port) {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '0.0.0.0');
  });
}

// Kolejność startu z tunelem: 1) sprawdzenie cloudflared (ewentualna instalacja), 2) tunel i jego adres, 3) gra i przeglądarka.
async function main() {
  const wantTunnel = process.argv.includes('--tunnel') || process.env.TUNNEL === '1';
  const open = process.argv.includes('--open') || process.env.OPEN_BROWSER === '1';
  if (!(await checkPortFree(PORT))) {
    console.log(`Port ${PORT} jest zajęty (czy gra już działa?). Zamknij ją albo użyj innego portu, np. PORT=${PORT + 1} node server.js`);
    process.exit(1);
  }
  const steps = wantTunnel ? 3 : 1;
  if (wantTunnel) {
    console.log(`[1/${steps}] Sprawdzam, czy jest cloudflared (potrzebny do gry przez internet)…`);
    await startTunnel(PORT);                                    // sprawdzenie, ewentualna instalacja i start tunelu
    console.log(`[2/${steps}] Uruchamiam tunel i czekam na jego adres…`);
    if (!(await waitForTunnel(45000))) {
      console.log('\n!!! Tunel nie wystartował – gra uruchomi się tylko w sieci domowej (bez linku i kodu QR do gry przez internet).');
      if (tunnel.status === 'starting') console.log('    Cloudflare nie odpowiedział w 45 s. Sprawdź połączenie z internetem i zaporę, potem uruchom grę ponownie.');
      if (tunnel.log.length) console.log('    Ostatnie komunikaty cloudflared:\n      ' + tunnel.log.slice(-8).join('\n      '));
      console.log('');
    }
  }
  console.log(`[${steps}/${steps}] Uruchamiam grę…`);
  server.headersTimeout = 15000;
  server.requestTimeout = 30000;
  server.once('error', e => {
    console.log('Nie udało się uruchomić serwera gry:', e.message);
    if (tunnel.child) { try { tunnel.child.kill(); } catch (x) {} }
    process.exit(1);
  });
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\nStatki działają: http://localhost:${PORT}`);
    lanUrls().forEach(u => console.log(`  w sieci lokalnej: ${u}`));
    if (tunnel.url) console.log(`  przez internet:   ${tunnel.url}   (link z kodem pokoju zobaczysz w grze)`);
    else if (!wantTunnel) console.log('Gra przez internet: uruchom serwer plikiem uruchom.bat (albo npm start), a nie uruchom-bez-tunelu.bat.');
    if (open) openBrowser(`http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  main().catch(e => { console.log('Błąd uruchamiania:', e.message); process.exit(1); });
}

module.exports = { server, hooks, waitForTunnel, checkPortFree, findCloudflared, pickInstaller, cleanChat, parseFleet, FLEET, CODE_LEN, LIMITS, TUNNEL_RE, tunnel, startTunnel, ensureCloudflared, clientIp };
