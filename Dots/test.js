'use strict';
// Test integracyjny serwera gry Kropki: uruchamia serwer na wolnym porcie i gra dwoma "graczami" przez HTTP.
const assert = require('assert');
const { server, hooks, rooms, SIZES, CODE_LEN, LIMITS, tunnel } = require('./server');

let base, n = 0;
const ok = m => console.log('  ok', ++n, m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const post = async (p, body, headers) => { const r = await fetch(base + p, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const get = async p => { const r = await fetch(base + p); return { status: r.status, body: await r.json() }; };

async function newRoom(size) {
  const a = (await post('/api/create', size ? { size } : {})).body;
  const b = (await post('/api/join', { code: a.code })).body;
  const P = [{ code: a.code, token: a.token }, { code: b.code, token: b.token }];       // P[seat]
  const st = async seat => (await get(`/api/state?code=${P[seat].code}&token=${P[seat].token}`)).body;
  const s0 = await st(0);
  const red = s0.colors[0] === 1 ? 0 : 1;                                                // miejsce czerwonego (zaczyna)
  const mv = (seat, x, y) => post('/api/move', Object.assign({ x, y }, P[seat]));
  return { P, st, red, blue: 1 - red, mv, code: a.code };
}

async function main() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
  const MOVES_LIMIT = LIMITS.movesPerSec;
  LIMITS.movesPerSec = 1000;                      // test wysyła ruchy z prędkością, jakiej człowiek nie osiągnie
  const ORIG = { create: LIMITS.createPer10Min, join: LIMITS.joinPerMin };
  LIMITS.createPer10Min = 1000; LIMITS.joinPerMin = 1000;   // test zakłada wiele pokoi z jednego adresu; limity sprawdzamy osobno niżej

  // ---------- statyki, nagłówki ----------
  let r = await fetch(base + '/'); assert.strictEqual(r.status, 200); assert.ok((await r.text()).includes('Kropki')); ok('strona główna serwowana');
  assert.ok(/script-src 'self'/.test(r.headers.get('content-security-policy')) && r.headers.get('x-frame-options') === 'DENY'); ok('nagłówki bezpieczeństwa (CSP, DENY)');
  r = await fetch(base + '/..%2fserver.js'); assert.notStrictEqual(r.status, 200); ok('brak wyjścia poza katalog public');
  r = await fetch(base + '/engine.js'); assert.notStrictEqual(r.status, 200); ok('silnik gry (engine.js) nie jest serwowany klientom');

  // ---------- pokoje i rozmiary ----------
  const info0 = (await get('/api/info')).body;
  assert.deepStrictEqual(info0.sizes, ['s', 'm', 'l']); assert.strictEqual(info0.defaultSize, 'm'); ok('/api/info: dostępne rozmiary planszy');
  assert.strictEqual((await post('/api/create', { size: 'xxl' })).status, 400);
  assert.strictEqual((await post('/api/create', { size: 5 })).status, 400);
  assert.strictEqual((await post('/api/create', { size: '__proto__' })).status, 400); ok('nieprawidłowy rozmiar planszy odrzucony (także __proto__)');
  for (const [k, [w, h]] of Object.entries({ s: [15, 15], m: [20, 20], l: [30, 20] })) {
    const c = (await post('/api/create', { size: k })).body, j = (await post('/api/join', { code: c.code })).body;
    const s = (await get(`/api/state?code=${c.code}&token=${c.token}`)).body;
    assert.strictEqual(s.w, w); assert.strictEqual(s.h, h); assert.strictEqual(s.board.length, h); assert.strictEqual(s.board[0].length, w);
    assert.ok(j.token);
  }
  ok('rozmiary planszy S 15x15, M 20x20, L 30x20');
  const wait = (await post('/api/create', {})).body;
  let sw = (await get(`/api/state?code=${wait.code}&token=${wait.token}`)).body;
  assert.strictEqual(sw.phase, 'waiting'); assert.strictEqual(sw.opponentJoined, false); assert.strictEqual(sw.w, 20); ok('pokój czeka na przeciwnika (domyślnie plansza 20x20)');
  assert.strictEqual((await post('/api/join', { code: 'ZZZZZZ' })).status, 404);
  assert.strictEqual((await post('/api/join', { code: 'ABCD' })).status, 404);
  assert.strictEqual((await post('/api/join', { code: 12345 })).status, 404); ok('zły kod pokoju odrzucony');
  assert.strictEqual((await get(`/api/state?code=${wait.code}&token=zly`)).status, 404); ok('zły token odrzucony');
  const wj = (await post('/api/join', { code: wait.code.toLowerCase() })).body;
  assert.strictEqual(wj.you, 1);
  assert.strictEqual((await post('/api/join', { code: wait.code })).status, 400); ok('trzecia osoba nie wejdzie');

  // ---------- start partii ----------
  const R = await newRoom('m');
  const s0 = await R.st(0), s1 = await R.st(1);
  assert.strictEqual(s0.phase, 'playing'); assert.deepStrictEqual(s0.colors, s1.colors);
  assert.deepStrictEqual([...s0.colors].sort(), [1, 2]); assert.strictEqual(s0.turn, R.red); ok('po dołączeniu gra startuje: kolory przydzielone, zaczyna czerwony');
  assert.ok(s0.board.every(row => /^\.+$/.test(row))); assert.strictEqual(s0.moves, 0);

  // ---------- walidacja ruchów ----------
  assert.strictEqual((await R.mv(R.blue, 3, 3)).body.code, 'not_your_turn'); ok('ruch poza kolejką odrzucony');
  for (const [x, y] of [[-1, 0], [20, 0], [0, 20], [1.5, 1], ['1', 1], [null, null]]) assert.strictEqual((await R.mv(R.red, x, y)).body.code, 'out_of_board');
  ok('współrzędne poza planszą/nieprawidłowe odrzucone');
  assert.strictEqual((await R.mv(R.red, 5, 4)).status, 200);
  assert.strictEqual((await R.mv(R.red, 5, 5)).body.code, 'not_your_turn');
  assert.strictEqual((await R.mv(R.blue, 5, 4)).body.code, 'occupied'); ok('zajęte pole odrzucone, kolejka przechodzi po ruchu');

  // ---------- przejęcie kropki: romb wokół niebieskiej ----------
  assert.strictEqual((await R.mv(R.blue, 5, 5)).status, 200);          // niebieska kropka w środku przyszłego rombu
  await R.mv(R.red, 6, 5); await R.mv(R.blue, 0, 0); await R.mv(R.red, 5, 6); await R.mv(R.blue, 0, 2);
  const cap = await R.mv(R.red, 4, 5);
  assert.strictEqual(cap.status, 200); assert.strictEqual(cap.body.captured, 1);
  let sr = await R.st(R.red), sb = await R.st(R.blue);
  assert.strictEqual(sr.board[5][5], 'B'); assert.strictEqual(sr.scores[R.red], 1); assert.strictEqual(sr.scores[R.blue], 0);
  assert.deepStrictEqual(sr.last.captured, [[5, 5]]); assert.strictEqual(sr.last.by, R.red); assert.strictEqual(sr.turn, R.blue);
  assert.deepStrictEqual(sr.board, sb.board); ok('romb z 4 kropek przejmuje kropkę: plansza, wynik i szczegóły przejęcia widoczne dla obu graczy');
  assert.strictEqual((await R.mv(R.blue, 5, 5)).body.code, 'occupied'); ok('przejęta kropka zajmuje pole');

  // ---------- samobójstwo i zablokowane pole ----------
  const S = await newRoom('m');
  for (const [seat, x, y] of [[S.red, 5, 4], [S.blue, 0, 0], [S.red, 6, 5], [S.blue, 0, 2], [S.red, 5, 6], [S.blue, 0, 4], [S.red, 4, 5]]) assert.strictEqual((await S.mv(seat, x, y)).status, 200);
  assert.strictEqual((await S.mv(S.blue, 5, 5)).body.code, 'suicide'); ok('kropka w polu otoczonym przez przeciwnika jest odrzucona (samobójstwo)');
  assert.strictEqual((await S.st(S.blue)).turn, S.blue); ok('odrzucony ruch nie zmienia kolejki');

  // ---------- propozycje zakończenia ----------
  assert.strictEqual((await post('/api/offer', Object.assign({ action: 'accept' }, R.P[R.red]))).body.code, 'no_offer'); ok('zgoda bez propozycji odrzucona');
  assert.strictEqual((await post('/api/offer', Object.assign({ action: 'wat' }, R.P[R.red]))).body.code, 'bad_action');
  assert.strictEqual((await post('/api/offer', Object.assign({ action: 'offer' }, R.P[R.red]))).status, 200);
  assert.strictEqual((await R.st(R.blue)).endOffer, R.red); ok('propozycja zakończenia widoczna dla przeciwnika');
  assert.strictEqual((await post('/api/offer', Object.assign({ action: 'reject' }, R.P[R.blue]))).status, 200);
  assert.strictEqual((await R.st(R.red)).endOffer, null); ok('odrzucenie propozycji ją kasuje');
  await post('/api/offer', Object.assign({ action: 'offer' }, R.P[R.red]));
  await post('/api/offer', Object.assign({ action: 'cancel' }, R.P[R.red]));
  assert.strictEqual((await R.st(R.red)).endOffer, null); ok('proponujący może wycofać propozycję');
  await post('/api/offer', Object.assign({ action: 'offer' }, R.P[R.red]));
  assert.strictEqual((await R.mv(R.blue, 1, 1)).status, 200);
  assert.strictEqual((await R.st(R.red)).endOffer, null); ok('ruch przeciwnika kasuje propozycję');
  await post('/api/offer', Object.assign({ action: 'offer' }, R.P[R.blue]));         // kolej czerwonego, niebieski proponuje
  assert.strictEqual((await post('/api/offer', Object.assign({ action: 'accept' }, R.P[R.blue]))).body.code, 'no_offer');   // nie można zaakceptować własnej
  assert.strictEqual((await post('/api/offer', Object.assign({ action: 'accept' }, R.P[R.red]))).status, 200);
  const over = await R.st(R.red);
  assert.strictEqual(over.phase, 'over'); assert.strictEqual(over.reason, 'agreed'); assert.strictEqual(over.winner, R.red); assert.strictEqual(over.draw, false); ok('zgoda kończy grę i liczy punkty (wygrywa czerwony 1:0)');
  assert.strictEqual((await R.mv(R.red, 9, 9)).body.code, 'not_playing'); ok('po końcu gry nie da się grać');

  // ---------- poddanie ----------
  const Q = await newRoom('s');
  assert.strictEqual((await post('/api/resign', Q.P[Q.blue])).status, 200);
  const qs = await Q.st(Q.red);
  assert.strictEqual(qs.phase, 'over'); assert.strictEqual(qs.reason, 'resign'); assert.strictEqual(qs.winner, Q.red); ok('poddanie: wygrywa przeciwnik (nawet poza swoją kolejką)');
  assert.strictEqual((await post('/api/resign', Q.P[Q.red])).body.code, 'not_playing');

  // ---------- remis przy równym wyniku ----------
  const D = await newRoom('s');
  await post('/api/offer', Object.assign({ action: 'offer' }, D.P[D.red]));
  await post('/api/offer', Object.assign({ action: 'accept' }, D.P[D.blue]));
  const ds = await D.st(D.red);
  assert.strictEqual(ds.draw, true); assert.strictEqual(ds.winner, null); ok('równy wynik (0:0) to remis');

  // ---------- rewanż ----------
  assert.strictEqual((await post('/api/rematch', D.P[D.red])).status, 200);
  assert.strictEqual((await D.st(D.red)).phase, 'over'); assert.strictEqual((await D.st(D.blue)).opponentWantsRematch, true);
  assert.strictEqual((await post('/api/rematch', D.P[D.blue])).status, 200);
  const rs = await D.st(D.red);
  assert.strictEqual(rs.phase, 'playing'); assert.ok(rs.board.every(row => /^\.+$/.test(row))); assert.strictEqual(rs.turn, D.blue);
  assert.strictEqual(rs.colors[D.blue], 1); ok('rewanż: czysta plansza, zaczyna drugi gracz (dostaje kolor czerwony)');
  assert.strictEqual((await post('/api/rematch', D.P[D.red])).body.code, 'not_over');

  // ---------- koniec gry przez brak ruchów (plansza 2x2 wstawiona na potrzeby testu) ----------
  SIZES.t = [2, 2];
  const T = await newRoom('t');
  let seat = T.red;
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { assert.strictEqual((await T.mv(seat, x, y)).status, 200); seat = 1 - seat; }
  const ts = await T.st(T.red);
  assert.strictEqual(ts.phase, 'over'); assert.strictEqual(ts.reason, 'nomoves'); assert.strictEqual(ts.draw, true); ok('brak ruchów (pełna plansza) kończy grę: remis 0:0');
  delete SIZES.t;

  // ---------- komputer jako przeciwnik ----------
  for (const bad of [{ vs: 'x' }, { vs: 5 }, { vs: 'bot', level: 'zz' }, { vs: 'bot', level: 7 }, { vs: 'bot', level: '__proto__' }, { vs: null }]) assert.strictEqual((await post('/api/create', bad)).status, 400);
  ok('nieprawidłowy przeciwnik lub poziom komputera odrzucony (także __proto__)');
  const botRoom = async (level, size) => { const c = (await post('/api/create', { vs: 'bot', level, size: size || 's' })).body; const P = { code: c.code, token: c.token }; return { P, st: async () => (await get(`/api/state?code=${P.code}&token=${P.token}`)).body, mv: (x, y) => post('/api/move', Object.assign({ x, y }, P)), room: rooms.get(c.code) }; };
  const BR = await botRoom('hard');
  let bst = await BR.st();
  assert.strictEqual(bst.vsBot, true); assert.strictEqual(bst.botLevel, 'hard'); assert.strictEqual(bst.phase, 'playing'); assert.strictEqual(bst.opponentJoined, true); assert.strictEqual(bst.opponentConnected, true); assert.strictEqual(bst.you, 0); ok('pokój z komputerem: gra startuje od razu, przeciwnik jest dołączony i zawsze "na linii"');
  assert.strictEqual((await post('/api/join', { code: BR.P.code })).body.code, 'room_full'); ok('do pokoju z komputerem nikt trzeci nie dołączy');
  assert.strictEqual((await post('/api/chat', Object.assign({ text: 'hej' }, BR.P))).body.code, 'no_opponent'); ok('z komputerem nie ma czatu');
  assert.ok(!JSON.stringify(bst).includes(BR.room.players[1].token)); ok('token komputera nigdy nie trafia do gracza');
  const tb = Date.now();
  if (bst.turn === 1) assert.ok(await (async () => { for (let k = 0; k < 60; k++) { bst = await BR.st(); if (bst.moves >= 1) return true; await sleep(100); } return false; })(), 'komputer zaczynający nie ruszył');
  else {
    assert.strictEqual((await BR.mv(7, 7)).status, 200);
    assert.ok(await (async () => { for (let k = 0; k < 60; k++) { bst = await BR.st(); if (bst.moves >= 2 && bst.turn === 0) return true; await sleep(100); } return false; })(), 'komputer nie odpowiedział ruchem');
  }
  assert.ok(bst.moves >= 1 && bst.last && bst.last.by === 1); ok(`komputer sam stawia kropkę po chwili namysłu (${((Date.now() - tb) / 1000).toFixed(1)} s), a ruch trafia do gracza jak każdy inny`);
  assert.ok(Date.now() - tb >= 600); ok('komputer nie odpowiada natychmiast (jest chwila "namysłu")');
  // kilka wymian: komputer za każdym razem gra legalnie, a kropki rosną
  for (let i = 0; i < 3; i++) {
    bst = await BR.st(); if (bst.turn !== 0) { for (let k = 0; k < 60 && bst.turn !== 0; k++) { await sleep(100); bst = await BR.st(); } }
    const free = []; for (let y = 0; y < bst.h && free.length < 1; y++) for (let x = 0; x < bst.w; x++) if (bst.board[y][x] === '.') { free.push([x, y]); break; }
    await BR.mv(free[0][0], free[0][1]);
    for (let k = 0; k < 80; k++) { await sleep(100); bst = await BR.st(); if (bst.turn === 0) break; }
  }
  const dots = bst.board.join('').replace(/\./g, '').length; assert.ok(dots >= 6 && bst.phase === 'playing'); ok('po kilku wymianach plansza ma ' + dots + ' kropek, a gra trwa bez błędów');
  // propozycja zakończenia: przy remisie komputer się zgadza
  clearTimeout(BR.room.botTimer); BR.room.botTimer = null;
  for (let k = 0; k < 80 && bst.turn !== 0; k++) { await sleep(100); bst = await BR.st(); }
  BR.room.game.score[1] = 0; BR.room.game.score[2] = 0;
  assert.strictEqual((await post('/api/offer', Object.assign({ action: 'offer' }, BR.P))).status, 200);
  assert.ok(await (async () => { for (let k = 0; k < 60; k++) { bst = await BR.st(); if (bst.phase === 'over') return true; await sleep(100); } return false; })(), 'komputer nie odpowiedział na propozycję'); assert.strictEqual(bst.reason, 'agreed'); ok('komputer zgadza się na zakończenie gry i policzenie punktów, gdy nie przegrywa (przy remisie)');
  // rewanż: komputer zgadza się od razu
  assert.strictEqual((await post('/api/rematch', BR.P)).status, 200); bst = await BR.st();
  assert.strictEqual(bst.phase, 'playing'); assert.strictEqual(bst.moves, 0); ok('rewanż z komputerem startuje od razu po jednym kliknięciu (komputer zgadza się zawsze)');
  clearTimeout(BR.room.botTimer);
  // odmowa, gdy komputer przegrywa
  const LR = await botRoom('easy'); let lst = await LR.st();
  for (let k = 0; k < 80 && lst.turn !== 0; k++) { await sleep(100); lst = await LR.st(); }
  const humanColor = lst.colors[0], botColor = lst.colors[1]; LR.room.game.score[humanColor] = 3; LR.room.game.score[botColor] = 0;
  assert.strictEqual((await post('/api/offer', Object.assign({ action: 'offer' }, LR.P))).status, 200);
  assert.ok(await (async () => { for (let k = 0; k < 60; k++) { lst = await LR.st(); if (lst.endOffer === null) return true; await sleep(100); } return false; })()); assert.strictEqual(lst.phase, 'playing'); ok('komputer odmawia zakończenia gry, gdy przegrywa (propozycja znika, gra trwa dalej)');
  clearTimeout(LR.room.botTimer);

  // ---------- long-poll ----------
  LIMITS.pollMs = 400;
  const L = await newRoom('m');
  const v0 = (await L.st(0)).v;
  const poll = async (P, v) => { const t0 = Date.now(); const rr = await get(`/api/poll?code=${P.code}&token=${P.token}&v=${v}`); return { ...rr, ms: Date.now() - t0 }; };
  let p1 = await poll(L.P[0], v0 - 1); assert.ok(p1.ms < 300); ok('long-poll: starsza wersja -> odpowiedź od razu');
  let p2 = await poll(L.P[0], v0); assert.strictEqual(p2.body.v, v0); assert.ok(p2.ms >= 350); ok('long-poll: bez zmian czeka i po limicie czasu odpowiada');
  const waiter = poll(L.P[L.blue], v0); await sleep(100);
  await L.mv(L.red, 3, 3);
  const woke = await waiter; assert.ok(woke.ms < 350 && woke.body.v > v0 && woke.body.board[3][3] === 'r'); ok('long-poll: ruch przeciwnika budzi oczekujące żądanie od razu');
  LIMITS.pollMs = 20000;

  // ---------- czat ----------
  const C = await newRoom('m');
  const say = (seat, text) => post('/api/chat', Object.assign({ text }, C.P[seat]));
  assert.strictEqual((await say(0, 'Cześć <b>x</b>')).status, 200);
  const cs = await C.st(1); assert.strictEqual(cs.chat[0].text, 'Cześć <b>x</b>'); assert.strictEqual(cs.chat[0].by, 0); ok('czat: wiadomość dociera do przeciwnika');
  assert.strictEqual((await say(1, 'a\u0000b‮c   d')).status, 200);
  assert.strictEqual((await C.st(0)).chat[1].text, 'a b c d'); ok('czat: znaki sterujące usuwane, spacje zwijane');
  assert.strictEqual((await say(0, 'Ahoj 🏴‍☠️ 👨‍👩‍👧')).status, 200); assert.strictEqual((await C.st(1)).chat[2].text, 'Ahoj 🏴‍☠️ 👨‍👩‍👧'); ok('czat: złożone emoji zachowane');
  for (const bad of ['', '  ', 'x'.repeat(201), 5, null]) assert.strictEqual((await say(0, bad)).body.code, 'chat_invalid');
  ok('czat: puste/za długie/nie-tekstowe odrzucone');
  let rl = 0; for (let i = 0; i < 10; i++) if ((await say(1, 'm' + i)).status === 429) rl++;
  assert.ok(rl >= 3); ok('czat: limit wiadomości (429)');

  // ---------- ochrona przed zalewaniem ruchami ----------
  const F = await newRoom('l');
  const results = [];
  for (let i = 0; i < 4; i++) results.push((await F.mv(F.blue, 1, 1)).body.code);       // nie ich kolejka: zawsze odrzucone, ale nie 429
  assert.ok(results.every(c => c === 'not_your_turn')); ok('ruchy poza kolejką dostają czytelny błąd (nie blokują gracza)');
  LIMITS.movesPerSec = MOVES_LIMIT;
  const flood = []; for (let i = 0; i < MOVES_LIMIT + 4; i++) flood.push((await F.mv(F.red, 99, 99)).status);
  assert.ok(flood.slice(0, MOVES_LIMIT).every(c => c === 400) && flood.slice(MOVES_LIMIT).every(c => c === 429)); ok(`limit ${MOVES_LIMIT} ruchów/s na gracza: nadmiar dostaje 429`);
  LIMITS.movesPerSec = 1000;

  // ---------- limity i zabezpieczenia ----------
  LIMITS.createPer10Min = ORIG.create; LIMITS.joinPerMin = ORIG.join;
  const asIp = ip => ({ 'CF-Connecting-IP': ip });
  let last; for (let i = 0; i < LIMITS.joinPerMin + 2; i++) last = (await post('/api/join', { code: 'AAAAAA' }, asIp('203.0.113.7'))).status;
  assert.strictEqual(last, 429); ok('limit prób dołączenia (zgadywanie kodów) – 429');
  assert.strictEqual((await post('/api/join', { code: 'AAAAAA' }, asIp('203.0.113.99'))).status, 404); ok('limit jest per adres IP');
  let created = 0, c429 = 0;
  for (let i = 0; i < LIMITS.createPer10Min + 3; i++) { const x = await post('/api/create', {}, asIp('203.0.113.8')); if (x.status === 200) created++; else if (x.status === 429) c429++; }
  assert.strictEqual(created, LIMITS.createPer10Min); assert.ok(c429 >= 3); ok('limit zakładania pokoi na IP');

  // ---------- tłumaczenia i samouczek ----------
  const vm = require('vm'), fs = require('fs'), path = require('path');
  const sandbox = { navigator: { language: 'pl' }, localStorage: { getItem: () => null, setItem() {} }, document: { documentElement: {}, querySelectorAll: () => [] } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'public', 'i18n.js'), 'utf8') + ';this.I18N = I18N;', sandbox);
  const { pl, en } = sandbox.I18N;
  assert.deepStrictEqual([Object.keys(pl).filter(k => !(k in en)), Object.keys(en).filter(k => !(k in pl))], [[], []]); ok('tłumaczenia: te same klucze po polsku i angielsku');
  const tutSrc = fs.readFileSync(path.join(__dirname, 'public', 'tutorial.js'), 'utf8');
  const tutIds = [...tutSrc.matchAll(/\{ id: '(\w+)', scene:/g)].map(m => m[1]);
  assert.ok(tutIds.length >= 5, 'za mało kroków samouczka');
  for (const id of tutIds) for (const part of ['title', 'text']) for (const L of [pl, en]) assert.ok(typeof L[`tut.${id}.${part}`] === 'string' && L[`tut.${id}.${part}`].length > (part === 'title' ? 2 : 10), `brak tut.${id}.${part}`);
  for (const k of ['tut.btn', 'tut.btnTitle', 'tut.step', 'tut.goto', 'tut.prev', 'tut.next', 'tut.done', 'tut.close']) assert.ok(pl[k] && en[k], 'brak ' + k);
  assert.strictEqual(pl['tut.step'](2, 6), 'Krok 2 z 6'); assert.strictEqual(en['tut.step'](2, 6), 'Step 2 of 6');
  ok(`samouczek: ${tutIds.length} kroków ma tytuły i teksty po polsku i angielsku`);
  for (const L of [pl, en]) for (const k of Object.keys(L)) if (/^tut\..+\.text$/.test(k)) assert.ok(!/<[a-z]/i.test(L[k]), 'HTML w tekście samouczka: ' + k);
  ok('samouczek: teksty bez znaczników HTML (wstawiane jako zwykły tekst)');
  const pageHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  assert.ok(pageHtml.includes('id="tutorial"') && pageHtml.includes('id="tutBtn"') && pageHtml.indexOf('tutorial.js') > 0 && pageHtml.indexOf('tutorial.js') < pageHtml.indexOf('app.js'));
  ok('index.html: okno i przycisk samouczka, tutorial.js ładowany przed app.js');
  assert.strictEqual((await fetch(base + '/tutorial.js')).status, 200); ok('tutorial.js jest serwowany z własnego serwera (zgodnie z CSP)');

  // ---------- zamykanie ----------
  LIMITS.createPer10Min = 1000; LIMITS.joinPerMin = 1000;      // dalsze testy znów zakładają pokoje z jednego adresu
  const infoLocal = (await get('/api/info')).body;
  assert.ok(/^[0-9a-f]{32}$/.test(infoLocal.adminToken)); ok('/api/info: lokalna przeglądarka dostaje token administratora');
  const remote = await (await fetch(base + '/api/info', { headers: { 'CF-Connecting-IP': '198.51.100.5' } })).json();
  assert.strictEqual(remote.adminToken, null); assert.deepStrictEqual(remote.lan, []); ok('/api/info: klient z internetu nie dostaje tokenu ani adresów sieci domowej');
  let exitCode = null; hooks.exit = c => { exitCode = c; };
  const quit = headers => fetch(base + '/api/shutdown', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: '{}' });
  assert.strictEqual((await quit({})).status, 403);
  assert.strictEqual((await quit({ 'X-Admin-Token': 'zly' })).status, 403);
  assert.strictEqual((await quit({ 'X-Admin-Token': infoLocal.adminToken, 'CF-Connecting-IP': '198.51.100.5' })).status, 403);
  assert.strictEqual((await quit({ 'X-Admin-Token': infoLocal.adminToken, Origin: 'http://zlosliwa.example' })).status, 403);
  assert.strictEqual(exitCode, null); ok('zamykanie: bez tokenu, zły token, przez tunel i z obcej strony -> 403');
  const Z = await newRoom('m'); const zv = (await Z.st(0)).v;
  LIMITS.pollMs = 5000;
  const zw = get(`/api/poll?code=${Z.P[1].code}&token=${Z.P[1].token}&v=${zv}`); await sleep(100);
  const qr = await quit({ 'X-Admin-Token': infoLocal.adminToken, Origin: base });
  assert.strictEqual(qr.status, 200);
  const zr = await zw;
  assert.strictEqual(zr.body.closed, true); ok('zamykanie: poprawny token -> 200, gracze dostają stan "closed"');
  await sleep(1000); assert.strictEqual(exitCode, 0); ok('zamykanie: serwer kończy proces (kod 0)');

  console.log('\nWszystkie testy przeszły (' + n + ').');
  server.close(); process.exit(0);
}

main().catch(e => { console.error('\nBŁĄD TESTU:', e); process.exit(1); });
