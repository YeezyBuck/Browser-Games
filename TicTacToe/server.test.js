'use strict';
// Test integracyjny serwera kółka i krzyżyka: uruchamia serwer na wolnym porcie i gra dwoma "graczami" przez HTTP.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { server, hooks, rooms, CODE_LEN, LIMITS, inlineHashes, winnerOf, FILES } = require('./server');

let base, n = 0;
const ok = m => console.log('  ok', ++n, m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const post = async (p, body, headers) => { const r = await fetch(base + p, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const get = async p => { const r = await fetch(base + p); return { status: r.status, body: await r.json() }; };

async function newRoom() {
  const a = (await post('/api/create', {})).body, b = (await post('/api/join', { code: a.code })).body;
  const P = [{ code: a.code, token: a.token }, { code: b.code, token: b.token }];       // P[seat]
  const st = async seat => (await get(`/api/state?code=${P[seat].code}&token=${P[seat].token}`)).body;
  const s0 = await st(0), xSeat = s0.marks[0] === 'X' ? 0 : 1;
  const mv = (seat, cell) => post('/api/move', Object.assign({ cell }, P[seat]));
  return { P, st, mv, code: a.code, xSeat, oSeat: 1 - xSeat, room: rooms.get(a.code) };
}

async function main() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
  const ORIG = { create: LIMITS.createPer10Min, join: LIMITS.joinPerMin };
  LIMITS.createPer10Min = 1000; LIMITS.joinPerMin = 1000;   // test zakłada wiele pokoi z jednego adresu; limity sprawdzamy osobno niżej
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

  // ---------- statyki i Content-Security-Policy ----------
  let r = await fetch(base + '/'); assert.strictEqual(r.status, 200); assert.ok((await r.text()).includes('Kółko i krzyżyk')); ok('strona główna serwowana');
  const csp = r.headers.get('content-security-policy');
  assert.ok(!/unsafe-inline|unsafe-eval/.test(csp)); assert.ok(r.headers.get('x-frame-options') === 'DENY' && r.headers.get('x-content-type-options') === 'nosniff'); ok('nagłówki bezpieczeństwa: CSP bez unsafe-inline/unsafe-eval, DENY, nosniff');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]), styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]);
  const h = s => "'sha256-" + crypto.createHash('sha256').update(s, 'utf8').digest('base64') + "'";
  assert.strictEqual(scripts.length, 3); assert.ok(scripts.every(s => csp.includes(h(s)))); assert.ok(styles.length === 1 && csp.includes(h(styles[0]))); ok('CSP zawiera skróty SHA-256 wszystkich 3 wbudowanych skryptów i stylu strony (zgodne z plikiem)');
  assert.ok(/script-src 'self' 'sha256-/.test(csp) && /style-src 'self' 'sha256-/.test(csp) && /connect-src 'self'/.test(csp) && /frame-ancestors 'none'/.test(csp)); ok('CSP: skrypty i style tylko własne lub z podanym skrótem, połączenia tylko do siebie');
  assert.deepStrictEqual(inlineHashes().scripts.split(' ').length, 3); ok('inlineHashes() liczy skróty z pliku');
  for (const p of ['/online.js', '/vendor/qrcode.js']) { r = await fetch(base + p); assert.strictEqual(r.status, 200); assert.ok(/javascript/.test(r.headers.get('content-type'))); }
  ok('online.js i vendor/qrcode.js są serwowane jako JavaScript');
  for (const p of ['/server.js', '/server.test.js', '/test.js', '/package.json', '/uruchom.bat', '/README.md', '/vendor/', '/vendor/README.txt', '/..%2fserver.js', '/%2e%2e/server.js', '/index.html%00', '/online.js/../server.js', '/__proto__', '/constructor']) {
    r = await fetch(base + p); assert.notStrictEqual(r.status, 200, p);
  }
  ok('serwowane są tylko pliki z listy (server.js, testy, package.json, bat, README, wyjście poza katalog, __proto__ – nie)');
  assert.deepStrictEqual(Object.keys(FILES).sort(), ['/', '/index.html', '/online.js', '/vendor/qrcode.js']); ok('lista serwowanych plików jest krótka i jawna');

  // ---------- pokoje ----------
  const info0 = (await get('/api/info')).body; assert.strictEqual(info0.game, 'tictactoe'); ok('/api/info: strona rozpoznaje serwer kółka i krzyżyka (game: tictactoe)');
  const wait = (await post('/api/create', {})).body;
  const sw = (await get(`/api/state?code=${wait.code}&token=${wait.token}`)).body;
  assert.strictEqual(sw.phase, 'waiting'); assert.strictEqual(sw.opponentJoined, false); assert.deepStrictEqual(sw.board, Array(9).fill(null)); assert.deepStrictEqual(sw.wins, [0, 0]); ok('pokój czeka na przeciwnika');
  assert.strictEqual((await post('/api/join', { code: 'ZZZZZZ' })).status, 404); assert.strictEqual((await post('/api/join', { code: 'ABCD' })).status, 404); assert.strictEqual((await post('/api/join', { code: 12345 })).status, 404); ok('zły kod pokoju odrzucony');
  assert.strictEqual((await get(`/api/state?code=${wait.code}&token=zly`)).status, 404); ok('zły token odrzucony');
  assert.strictEqual((await post('/api/join', { code: wait.code.toLowerCase() })).body.you, 1); assert.strictEqual((await post('/api/join', { code: wait.code })).status, 400); ok('drugi gracz dołącza, trzeci nie wejdzie');

  // ---------- start ----------
  const R = await newRoom(), s0 = await R.st(0), s1 = await R.st(1);
  assert.strictEqual(s0.phase, 'playing'); assert.deepStrictEqual([...s0.marks].sort(), ['O', 'X']); assert.deepStrictEqual(s0.marks, s1.marks); assert.strictEqual(s0.turn, R.xSeat); assert.deepStrictEqual(s0.board, Array(9).fill(null)); ok('po dołączeniu: jeden gracz ma X, drugi O, zaczyna X');
  const seats = new Set(); for (let i = 0; i < 30; i++) seats.add((await (await newRoom()).st(0)).marks[0]); assert.strictEqual(seats.size, 2); ok('kto dostaje X, jest losowy (w 30 grach obie możliwości)');

  // ---------- walidacja ruchów ----------
  assert.strictEqual((await R.mv(R.oSeat, 4)).body.code, 'not_your_turn'); ok('ruch poza kolejką odrzucony');
  for (const c of [-1, 9, 1.5, '3', null, undefined, NaN, 1e999, {}, [4]]) { const x = await post('/api/move', Object.assign({ cell: c }, R.P[R.xSeat])); assert.strictEqual(x.status, 400); assert.strictEqual(x.body.code, 'bad_cell'); }
  ok('pole spoza planszy, ułamkowe, tekstowe i inne nieprawidłowe odrzucone (bad_cell)');
  assert.strictEqual((await R.st(0)).turn, R.xSeat); ok('odrzucone ruchy nie zmieniają kolejki');
  assert.strictEqual((await R.mv(R.xSeat, 4)).status, 200);
  const a = await R.st(R.xSeat), b = await R.st(R.oSeat);
  assert.strictEqual(a.board[4], 'X'); assert.deepStrictEqual(a.board, b.board); assert.strictEqual(a.turn, R.oSeat); assert.strictEqual(a.last.cell, 4); assert.strictEqual(a.last.by, R.xSeat); ok('ruch X: obaj widzą znak, kolejka przechodzi na O, jest opis ostatniego ruchu');
  assert.strictEqual((await R.mv(R.oSeat, 4)).body.code, 'occupied'); ok('zajęte pole odrzucone');

  // ---------- wygrana ----------
  for (const [seat, c] of [[R.oSeat, 0], [R.xSeat, 1], [R.oSeat, 2], [R.xSeat, 7]]) assert.strictEqual((await R.mv(seat, c)).status, 200);     // X: 4,1,7 (kolumna 1,4,7)
  const win = await R.st(R.xSeat);
  assert.strictEqual(win.phase, 'over'); assert.strictEqual(win.winner, R.xSeat); assert.deepStrictEqual(win.line, [1, 4, 7]); assert.strictEqual(win.reason, 'line'); assert.strictEqual(win.draw, false); assert.strictEqual(win.turn, null); assert.strictEqual(win.wins[R.xSeat], 1); ok('trzy w linii wygrywają: stan over, linia [1,4,7], wynik serii 1:0');
  assert.strictEqual((await R.mv(R.oSeat, 8)).body.code, 'not_playing'); ok('po końcu gry nie da się grać');

  // ---------- rewanż: znaki się zamieniają ----------
  assert.strictEqual((await post('/api/rematch', R.P[0])).status, 200);
  assert.strictEqual((await R.st(0)).phase, 'over'); assert.strictEqual((await R.st(1)).opponentWantsRematch, true);
  assert.strictEqual((await post('/api/rematch', R.P[1])).status, 200);
  const rs = await R.st(0);
  assert.strictEqual(rs.phase, 'playing'); assert.deepStrictEqual(rs.board, Array(9).fill(null)); assert.strictEqual(rs.marks[R.xSeat], 'O'); assert.strictEqual(rs.marks[R.oSeat], 'X'); assert.strictEqual(rs.turn, R.oSeat); ok('rewanż: znaki zamieniają się (dawny X gra teraz O), nowy X zaczyna, plansza pusta');
  assert.deepStrictEqual(rs.wins, win.wins); ok('wynik serii zostaje po rewanżu');
  assert.strictEqual((await post('/api/rematch', R.P[0])).body.code, 'not_over');
  // druga gra: wygrywa dawny O (teraz X), wynik liczony na graczach, nie na znakach
  const x2 = R.oSeat, o2 = R.xSeat;
  for (const [seat, c] of [[x2, 0], [o2, 3], [x2, 1], [o2, 4], [x2, 2]]) assert.strictEqual((await R.mv(seat, c)).status, 200);
  const w2 = await R.st(0); assert.strictEqual(w2.winner, x2); assert.deepStrictEqual(w2.line, [0, 1, 2]); assert.deepStrictEqual(w2.wins, [1, 1]); ok('wynik liczony na graczach: po dwóch grach 1:1 mimo zamiany znaków');
  // trzecia gra: znaki wracają
  await post('/api/rematch', R.P[0]); await post('/api/rematch', R.P[1]);
  const r3 = await R.st(0); assert.strictEqual(r3.marks[R.xSeat], 'X'); assert.strictEqual(r3.turn, R.xSeat); ok('kolejny rewanż: znaki znów się zamieniają (X wraca do pierwszego gracza)');

  // ---------- remis ----------
  const D = await newRoom();
  const order = [0, 1, 2, 4, 3, 5, 7, 6, 8];                                                      // X O X O X O X O X, bez wygranej
  order.forEach((_, i) => {}); let turnSeat = D.xSeat;
  for (const c of order) { assert.strictEqual((await D.mv(turnSeat, c)).status, 200); turnSeat = 1 - turnSeat; }
  const ds = await D.st(0); assert.strictEqual(ds.phase, 'over'); assert.strictEqual(ds.draw, true); assert.strictEqual(ds.winner, null); assert.strictEqual(ds.reason, 'full'); assert.strictEqual(ds.draws, 1); assert.deepStrictEqual(ds.wins, [0, 0]); ok('pełna plansza bez wygranej: remis, licznik remisów 1');

  // ---------- poddanie ----------
  const Q = await newRoom();
  assert.strictEqual((await post('/api/resign', Q.P[Q.oSeat])).status, 200);
  const qs = await Q.st(Q.xSeat); assert.strictEqual(qs.phase, 'over'); assert.strictEqual(qs.reason, 'resign'); assert.strictEqual(qs.winner, Q.xSeat); assert.strictEqual(qs.wins[Q.xSeat], 1); ok('poddanie: wygrywa przeciwnik (także poza swoją kolejką), wynik serii rośnie');
  assert.strictEqual((await post('/api/resign', Q.P[Q.xSeat])).body.code, 'not_playing');

  // ---------- reguła wygranej (funkcja) ----------
  for (const l of [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]]) { const b9 = Array(9).fill(null); l.forEach(i => { b9[i] = 'O'; }); const w = winnerOf(b9); assert.ok(w && w.mark === 'O' && w.line.join() === l.join()); }
  assert.strictEqual(winnerOf(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']), null); ok('wszystkie 8 linii wygrywają, a znana pozycja remisowa nie');

  // ---------- long-poll ----------
  LIMITS.pollMs = 400;
  const LP = await newRoom(), v0 = (await LP.st(0)).v;
  const poll = async (P, v) => { const t0 = Date.now(); const rr = await get(`/api/poll?code=${P.code}&token=${P.token}&v=${v}`); return { ...rr, ms: Date.now() - t0 }; };
  const lp1 = await poll(LP.P[0], v0 - 1); assert.ok(lp1.ms < 300); ok('long-poll: starsza wersja -> odpowiedź od razu');
  const lp2 = await poll(LP.P[0], v0); assert.strictEqual(lp2.body.v, v0); assert.ok(lp2.ms >= 350); ok('long-poll: bez zmian czeka i po limicie czasu odpowiada');
  const waiter = poll(LP.P[LP.oSeat], v0); await sleep(100); await LP.mv(LP.xSeat, 0);
  const woke = await waiter; assert.ok(woke.ms < 350 && woke.body.v > v0 && woke.body.board[0] === 'X'); ok('long-poll: ruch przeciwnika budzi oczekujące żądanie od razu');
  LIMITS.pollMs = 20000;

  // ---------- czat ----------
  const C = await newRoom(), say = (seat, text) => post('/api/chat', Object.assign({ text }, C.P[seat]));
  assert.strictEqual((await say(0, 'Cześć <b>x</b>')).status, 200);
  const cs = await C.st(1); assert.strictEqual(cs.chat[0].text, 'Cześć <b>x</b>'); assert.strictEqual(cs.chat[0].by, 0); ok('czat: wiadomość dociera do przeciwnika (jako tekst)');
  assert.strictEqual((await say(1, 'a\u0000b‮c   d')).status, 200); assert.strictEqual((await C.st(0)).chat[1].text, 'a b c d'); ok('czat: znaki sterujące usuwane, spacje zwijane');
  for (const bad of ['', '  ', 'x'.repeat(201), 5, null]) assert.strictEqual((await say(0, bad)).body.code, 'chat_invalid'); ok('czat: puste/za długie/nie-tekstowe odrzucone');
  let rl = 0; for (let i = 0; i < 10; i++) if ((await say(1, 'm' + i)).status === 429) rl++; assert.ok(rl >= 3); ok('czat: limit wiadomości (429)');

  // ---------- ochrona przed zalewaniem ----------
  const F = await newRoom(), res = []; for (let i = 0; i < LIMITS.movesPerSec + 4; i++) res.push((await F.mv(F.oSeat, 0)).body.code);
  assert.ok(res.every(c => c === 'not_your_turn')); ok('ruchy poza kolejką dostają czytelny błąd, nie blokują gracza');
  const F2 = await newRoom(); const codes = [];
  for (let i = 0; i < LIMITS.movesPerSec + 3; i++) { const cell = i % 9; codes.push((await post('/api/move', Object.assign({ cell: 'x' }, F2.P[F2.xSeat]))).status); }
  assert.ok(codes.every(c => c === 400)); ok('nieprawidłowe ruchy nie przechodzą ani nie zmieniają stanu');

  // ---------- limity i zabezpieczenia ----------
  LIMITS.createPer10Min = ORIG.create; LIMITS.joinPerMin = ORIG.join;
  const asIp = ip => ({ 'CF-Connecting-IP': ip });
  let last; for (let i = 0; i < LIMITS.joinPerMin + 2; i++) last = (await post('/api/join', { code: 'AAAAAA' }, asIp('203.0.113.7'))).status;
  assert.strictEqual(last, 429); ok('limit prób dołączenia (zgadywanie kodów) – 429');
  assert.strictEqual((await post('/api/join', { code: 'AAAAAA' }, asIp('203.0.113.99'))).status, 404); ok('limit jest per adres IP');
  let created = 0, c429 = 0;
  for (let i = 0; i < LIMITS.createPer10Min + 3; i++) { const x = await post('/api/create', {}, asIp('203.0.113.8')); if (x.status === 200) created++; else if (x.status === 429) c429++; }
  assert.strictEqual(created, LIMITS.createPer10Min); assert.ok(c429 >= 3); ok('limit zakładania pokoi na IP');

  // ---------- zamykanie ----------
  LIMITS.createPer10Min = 1000; LIMITS.joinPerMin = 1000;
  const infoLocal = (await get('/api/info')).body;
  assert.ok(/^[0-9a-f]{32}$/.test(infoLocal.adminToken)); ok('/api/info: lokalna przeglądarka dostaje token administratora');
  const remote = await (await fetch(base + '/api/info', { headers: { 'CF-Connecting-IP': '198.51.100.5' } })).json();
  assert.strictEqual(remote.adminToken, null); assert.deepStrictEqual(remote.lan, []); ok('/api/info: klient z internetu nie dostaje tokenu ani adresów sieci domowej');
  let exitCode = null; hooks.exit = c => { exitCode = c; };
  const quit = headers => fetch(base + '/api/shutdown', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: '{}' });
  assert.strictEqual((await quit({})).status, 403); assert.strictEqual((await quit({ 'X-Admin-Token': 'zly' })).status, 403);
  assert.strictEqual((await quit({ 'X-Admin-Token': infoLocal.adminToken, 'CF-Connecting-IP': '198.51.100.5' })).status, 403);
  assert.strictEqual((await quit({ 'X-Admin-Token': infoLocal.adminToken, Origin: 'http://zlosliwa.example' })).status, 403);
  assert.strictEqual(exitCode, null); ok('zamykanie: bez tokenu, zły token, przez tunel i z obcej strony -> 403');
  const Z = await newRoom(), zv = (await Z.st(0)).v; LIMITS.pollMs = 5000;
  const zw = get(`/api/poll?code=${Z.P[1].code}&token=${Z.P[1].token}&v=${zv}`); await sleep(100);
  assert.strictEqual((await quit({ 'X-Admin-Token': infoLocal.adminToken, Origin: base })).status, 200);
  assert.strictEqual((await zw).body.closed, true); ok('zamykanie: poprawny token -> 200, gracze dostają stan "closed"');
  await sleep(1000); assert.strictEqual(exitCode, 0); ok('zamykanie: serwer kończy proces (kod 0)');

  console.log('\nWszystkie testy serwera przeszły (' + n + ').');
  server.close(); process.exit(0);
}

main().catch(e => { console.error('\nBŁĄD TESTU:', e); process.exit(1); });
