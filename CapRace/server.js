'use strict';
// Wyścig kapsli dla dwóch osób przez przeglądarkę.
// Serwer jest "sędzią": losuje tor, liczy fizykę każdego pstryknięcia (silnik w public/engine.js, ten sam kod ma klient do rysowania
// i podglądu), pilnuje kolejki i mety, a graczom wysyła gotową trajektorię do odtworzenia.
// Bez zależności zewnętrznych: statyczne pliki + SSE (serwer -> klient) z zapasowym long-pollingiem + POST (klient -> serwer).

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const readline = require('readline');
const net = require('net');
const E = require('./public/engine');

const PORT = Number(process.env.PORT) || 3200;
const LENGTHS = Object.keys(E.LENGTHS);             // s | m | l: długość toru
const DEFAULT_LEN = 'm';
const RULES = ['last', 'alternate'];                 // last: pstryka ten, kto jest dalej od mety; alternate: na zmianę
const DEFAULT_RULE = 'last';
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
  shotsPerSec: 3,                                // pstryknięć na gracza na sekundę (ochrona przed zalewaniem)
};

const rooms = new Map();

function makeCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let c = '';
    for (let i = 0; i < CODE_LEN; i++) c += letters[crypto.randomInt(letters.length)];
    if (!rooms.has(c)) return c;
  }
}

function newPlayer(token) {
  return { token, seen: Date.now(), conns: new Set(), rematch: false };
}

// ---------- logika gry ----------
// Start (albo rewanż) partii: nowy losowy tor, kapsle na starcie, zaczyna gracz `starter`. Kapsel gracza 0 i 1 to kapsel 0 i 1.
function startGame(room, starter) {
  room.track = E.generateTrack(crypto.randomInt(0x7fffffff), room.lenKey);
  room.caps = E.startPositions(room.track);
  room.shots = [0, 0]; room.lastShooter = null; room.shot = null; room.busyUntil = 0;
  room.starter = starter; room.turn = starter; room.phase = 'playing';
  room.winner = null; room.draw = false; room.reason = null;
  for (const p of room.players) p.rematch = false;
}

function finish(room, winnerSeat, reason) {
  room.phase = 'over'; room.turn = null; room.reason = reason;
  room.winner = winnerSeat; room.draw = winnerSeat === null;
}

const progressOf = (room, i) => E.progress(room.track, room.caps[i]);

// Pstryknięcie: (hx,hy) – punkt uderzenia na kapslu (-1..1), (px,py) – odciągnięcie kursora. Zwraca { error } albo wynik.
function shoot(room, pi, body) {
  if (room.phase !== 'playing') return { error: 'not_playing' };
  if (room.turn !== pi) return { error: 'not_your_turn' };
  if (Date.now() < room.busyUntil) return { error: 'busy' };               // poprzednie pstryknięcie jeszcze się odtwarza
  if (!body || ![body.hx, body.hy, body.px, body.py].every(v => typeof v === 'number' && Number.isFinite(v))) return { error: 'bad_request' };
  const shot = E.shotFromInput(body.hx, body.hy, body.px, body.py);
  if (!shot) return { error: 'too_weak' };
  if (!allow('shot', room.code + ':' + pi, LIMITS.shotsPerSec, 1000)) return { error: 'rate_limited' };
  const sim = E.simulate(room.track, room.caps, pi, shot);
  room.caps = sim.final; room.shots[pi]++; room.lastShooter = pi;
  room.shot = { id: ++room.seq, by: pi, t0: Date.now(), seconds: sim.seconds, frames: sim.frames, events: sim.events, spin0: sim.spin0 };
  room.busyUntil = room.shot.t0 + sim.seconds * 1000 + 300;
  if (sim.finishedBy !== null) finish(room, sim.finishedBy, 'finish');
  else if (room.shots[0] >= E.P.maxShots && room.shots[1] >= E.P.maxShots) {
    const a = progressOf(room, 0), b = progressOf(room, 1);
    finish(room, Math.abs(a - b) < 1 ? null : (a > b ? 0 : 1), 'limit');
  } else room.turn = E.nextShooter(room.track, room.caps, room.rule, room.lastShooter, room.shots);
  return { ok: true, seconds: sim.seconds };
}

function resign(room, pi) {
  if (room.phase !== 'playing') return 'not_playing';
  finish(room, 1 - pi, 'resign');
  return null;
}

function rematch(room, pi) {
  if (room.phase !== 'over') return 'not_over';
  room.players[pi].rematch = true;
  if (room.players.length === 2 && room.players.every(p => p.rematch)) startGame(room, 1 - room.starter);   // zaczyna drugi gracz
  return null;
}

// Gracz jest "na linii", jeśli ma otwarty strumień/long-poll albo niedawno cokolwiek wysłał (tunel nie przepuszcza SSE).
function isOnline(room, pi) {
  const p = room.players[pi];
  if (!p) return false;
  return p.conns.size > 0 || (room.waiters || []).some(w => w.pi === pi) || Date.now() - p.seen < LIMITS.presenceMs;
}

// ---------- stan widoczny dla konkretnego gracza ----------
function viewFor(room, pi) {
  const opp = room.players[1 - pi], tr = room.track, sh = room.shot;
  const pct = i => tr ? Math.max(0, Math.min(1, (progressOf(room, i) - tr.sStart) / (tr.sFinish - tr.sStart))) : 0;
  const recent = sh && Date.now() - sh.t0 < sh.seconds * 1000 + 4000;            // trajektorię wysyłamy tylko świeżą
  return {
    code: room.code,
    you: pi,
    phase: room.phase,                       // waiting | playing | over
    lenKey: room.lenKey, rule: room.rule,
    track: tr ? { seed: tr.seed, lenKey: tr.lenKey } : null,
    caps: room.caps || null,                 // pozycje kapsli po ostatnim pstryknięciu (kapsel 0 i 1 = gracz 0 i 1)
    progress: [pct(0), pct(1)],              // 0..1 drogi od startu do mety
    shots: room.shots || [0, 0], maxShots: E.P.maxShots,
    turn: room.turn,
    winner: room.winner,                     // numer gracza (0/1) albo null
    draw: !!room.draw,
    reason: room.reason,                     // finish | limit | resign
    shot: recent ? { id: sh.id, by: sh.by, age: Date.now() - sh.t0, seconds: sh.seconds, frames: sh.frames, events: sh.events, spin0: sh.spin0 } : null,
    shotId: sh ? sh.id : 0,
    busyMs: Math.max(0, (room.busyUntil || 0) - Date.now()),
    opponentJoined: !!opp,
    opponentConnected: !!opp && isOnline(room, 1 - pi),
    v: room.version || 0,
    chat: (room.chat || []).slice(-50),
    closed: !!room.closed,
    youWantRematch: room.players[pi].rematch,
    opponentWantsRematch: !!opp && opp.rematch,
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
  not_playing: 'Gra nie trwa.', not_your_turn: 'To nie Twoja kolej.', busy: 'Poczekaj, aż kapsel się zatrzyma.',
  too_weak: 'Za słabe pstryknięcie – odciągnij mysz dalej.',
  not_over: 'Gra jeszcze trwa.', rate_limited: 'Zbyt wiele żądań – spróbuj za chwilę.', forbidden: 'Brak uprawnień.',
  chat_invalid: 'Nieprawidłowa wiadomość.', no_opponent: 'Przeciwnik jeszcze nie dołączył.', too_many_rooms: 'Serwer ma za dużo gier – spróbuj później.',
  too_many_conns: 'Zbyt wiele połączeń.', room_full: 'W tej grze są już dwie osoby.', bad_request: 'Błędne żądanie.',
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
      return sendJson(res, 200, { publicUrl: tunnel.url, tunnel: tunnel.requested ? tunnel.status : 'off', lan: local ? lanUrls() : [], local, codeLen: CODE_LEN, lengths: LENGTHS, defaultLen: DEFAULT_LEN, rules: RULES, defaultRule: DEFAULT_RULE, adminToken: isLoopbackClient(req) ? ADMIN_TOKEN : null });
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
        const lenKey = body.len === undefined ? DEFAULT_LEN : body.len, rule = body.rule === undefined ? DEFAULT_RULE : body.rule;
        if (typeof lenKey !== 'string' || !LENGTHS.includes(lenKey) || typeof rule !== 'string' || !RULES.includes(rule)) return fail(res, 400, 'bad_request');
        const room = { code: makeCode(), lenKey, rule, phase: 'waiting', track: null, caps: null, shots: [0, 0], lastShooter: null, shot: null, busyUntil: 0, turn: null, winner: null, draw: false, reason: null, starter: 0, seq: 0, chat: [], chatSeq: 0, updated: Date.now(), players: [] };
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
        startGame(room, crypto.randomInt(2));
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
      if (p === '/api/shoot') {
        const r = shoot(a.room, a.pi, body);
        if (r.error) return fail(res, r.error === 'rate_limited' ? 429 : 400, r.error);
        broadcast(a.room);
        return sendJson(res, 200, r);
      }
      if (p === '/api/resign') {
        const err = resign(a.room, a.pi);
        if (err) return fail(res, 400, err);
        broadcast(a.room);
        return sendJson(res, 200, { ok: true });
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
    console.log(`\nWyścig kapsli działa: http://localhost:${PORT}`);
    lanUrls().forEach(u => console.log(`  w sieci lokalnej: ${u}`));
    if (tunnel.url) console.log(`  przez internet:   ${tunnel.url}   (link z kodem pokoju zobaczysz w grze)`);
    else if (!wantTunnel) console.log('Gra przez internet: uruchom serwer plikiem uruchom.bat (albo npm start), a nie uruchom-bez-tunelu.bat.');
    if (open) openBrowser(`http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  main().catch(e => { console.log('Błąd uruchamiania:', e.message); process.exit(1); });
}

module.exports = { server, hooks, rooms, waitForTunnel, checkPortFree, findCloudflared, pickInstaller, cleanChat, LENGTHS, RULES, CODE_LEN, LIMITS, TUNNEL_RE, tunnel, startTunnel, ensureCloudflared, clientIp };
