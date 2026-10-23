'use strict';
// Test integracyjny serwera gry Magnesy: uruchamia serwer na wolnym porcie i gra dwoma "graczami" przez HTTP.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { server, hooks, rooms, FIELDS, CODE_LEN, LIMITS } = require('./server');
const E = require('./public/engine');

let base, n = 0;
const ok = m => console.log('  ok', ++n, m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const post = async (p, body, headers) => { const r = await fetch(base + p, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const get = async p => { const r = await fetch(base + p); return { status: r.status, body: await r.json() }; };

async function newRoom(opts) {
  const a = (await post('/api/create', opts || {})).body;
  const b = (await post('/api/join', { code: a.code })).body;
  const P = [{ code: a.code, token: a.token }, { code: b.code, token: b.token }];       // P[seat]
  const st = async seat => (await get(`/api/state?code=${P[seat].code}&token=${P[seat].token}`)).body;
  const s0 = await st(0), room = rooms.get(a.code), shapes = E.makeShapes(s0.seed);
  const place = (seat, id, x, y, ang) => post('/api/place', Object.assign({ id, x, y, a: ang === undefined ? 0 : ang }, P[seat]));
  const axis = id => { const sh = E.shapeOf(shapes, id); return -Math.atan2(sh.poles[1].y - sh.poles[0].y, sh.poles[1].x - sh.poles[0].x); };   // kąt, przy którym oś N->S jest pozioma
  return { P, st, place, room, shapes, axis, code: a.code, first: s0.turn, dims: E.P.fields[opts && opts.field || 'm'] };
}

async function main() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
  const ORIG = { create: LIMITS.createPer10Min, join: LIMITS.joinPerMin };
  LIMITS.createPer10Min = 1000; LIMITS.joinPerMin = 1000;   // test zakłada wiele pokoi z jednego adresu; limity sprawdzamy osobno niżej

  // ---------- statyki, nagłówki ----------
  let r = await fetch(base + '/'); assert.strictEqual(r.status, 200); assert.ok((await r.text()).includes('Magnesy')); ok('strona główna serwowana');
  assert.ok(/script-src 'self'/.test(r.headers.get('content-security-policy')) && r.headers.get('x-frame-options') === 'DENY'); ok('nagłówki bezpieczeństwa (CSP, DENY)');
  r = await fetch(base + '/..%2fserver.js'); assert.notStrictEqual(r.status, 200);
  r = await fetch(base + '/server.js'); assert.notStrictEqual(r.status, 200); ok('brak wyjścia poza katalog public, server.js nie jest serwowany');
  r = await fetch(base + '/engine.js'); assert.strictEqual(r.status, 200); assert.ok(/javascript/.test(r.headers.get('content-type'))); ok('engine.js jest serwowany klientom (rysowanie i podgląd sił używają tej samej fizyki)');

  // ---------- pokoje i ustawienia ----------
  const info0 = (await get('/api/info')).body;
  assert.deepStrictEqual(info0.fields, ['s', 'm', 'l']); assert.strictEqual(info0.defaultField, 'm'); assert.strictEqual(info0.perPlayer, 10); ok('/api/info: wielkości pola i liczba magnesów');
  for (const bad of [{ field: 'xxl' }, { field: 5 }, { field: '__proto__' }, { field: null }]) assert.strictEqual((await post('/api/create', bad)).status, 400);
  ok('nieprawidłowa wielkość pola odrzucona (także __proto__)');
  const wait = (await post('/api/create', {})).body;
  let sw = (await get(`/api/state?code=${wait.code}&token=${wait.token}`)).body;
  assert.strictEqual(sw.phase, 'waiting'); assert.strictEqual(sw.opponentJoined, false); assert.strictEqual(sw.fieldKey, 'm'); assert.deepStrictEqual(sw.field, []); assert.deepStrictEqual(sw.dims, E.P.fields.m); ok('pokój czeka na przeciwnika (domyślnie pole średnie)');
  assert.strictEqual((await post('/api/join', { code: 'ZZZZZZ' })).status, 404);
  assert.strictEqual((await post('/api/join', { code: 'ABCD' })).status, 404);
  assert.strictEqual((await post('/api/join', { code: 12345 })).status, 404); ok('zły kod pokoju odrzucony');
  assert.strictEqual((await get(`/api/state?code=${wait.code}&token=zly`)).status, 404); ok('zły token odrzucony');
  const wj = (await post('/api/join', { code: wait.code.toLowerCase() })).body;
  assert.strictEqual(wj.you, 1);
  assert.strictEqual((await post('/api/join', { code: wait.code })).status, 400); ok('trzecia osoba nie wejdzie');

  // ---------- start partii ----------
  for (const k of FIELDS) { const x = await newRoom({ field: k }); const s = await x.st(0); assert.deepStrictEqual(s.dims, E.P.fields[k]); }
  ok('pola S/M/L mają wymiary z silnika');
  const R = await newRoom({});
  const s0 = await R.st(0), s1 = await R.st(1);
  assert.strictEqual(s0.phase, 'playing'); assert.ok([0, 1].includes(s0.turn)); assert.strictEqual(s0.seed, s1.seed); assert.ok(s0.seed > 0);
  assert.deepStrictEqual(s0.hands[0], [...Array(10).keys()]); assert.deepStrictEqual(s0.hands[1], [...Array(10).keys()].map(i => i + 10)); assert.deepStrictEqual(s0.field, []); assert.deepStrictEqual(s0.taken, [0, 0]); assert.strictEqual(s0.last, null); assert.strictEqual(s0.lastId, 0);
  assert.deepStrictEqual(s0.hands, s1.hands); ok('po dołączeniu gra startuje: obaj mają po 10 magnesów (te same kształty), puste pole, ten sam seed');
  assert.deepStrictEqual(E.makeShapes(s0.seed), R.shapes); ok('klient odtworzy te same kształty z seeda');

  // ---------- walidacja stawiania ----------
  const second = 1 - R.first, c = [R.dims[0] / 2, R.dims[1] / 2], myId = s0.hands[R.first][0], hisId = s0.hands[second][0];
  assert.strictEqual((await R.place(second, hisId, c[0], c[1])).body.code, 'not_your_turn'); ok('stawianie poza kolejką odrzucone');
  for (const body of [{}, { id: 'a', x: 200, y: 200, a: 0 }, { id: myId, x: null, y: 200, a: 0 }, { id: myId, x: 200, a: 0 }, { id: myId, x: 1e999, y: 200, a: 0 }, { id: myId, x: '200', y: 200, a: 0 }, { id: 1.5, x: 200, y: 200, a: 0 }, { id: myId, x: 200, y: 200, a: 'x' }]) {
    const x = await post('/api/place', Object.assign({}, body, R.P[R.first])); assert.strictEqual(x.status, 400); assert.ok(['bad_request', 'no_magnet'].includes(x.body.code), JSON.stringify(body));
  }
  ok('brak/nieliczbowe/nieskończone/niecałkowite parametry odrzucone');
  assert.strictEqual((await R.place(R.first, hisId, c[0], c[1])).body.code, 'no_magnet'); assert.strictEqual((await R.place(R.first, 99, c[0], c[1])).body.code, 'no_magnet'); assert.strictEqual((await R.place(R.first, -1, c[0], c[1])).body.code, 'no_magnet'); ok('cudzy lub nieistniejący magnes: no_magnet');
  for (const [x, y] of [[2, 2], [R.dims[0] - 2, 200], [200, R.dims[1] + 30], [-50, -50]]) assert.strictEqual((await R.place(R.first, myId, x, y)).body.code, 'blocked');
  ok('poza polem lub przy samej bandzie: blocked');
  assert.strictEqual((await R.st(0)).lastId, 0); ok('odrzucone ruchy niczego nie zmieniają');

  // ---------- pierwszy ruch ----------
  const t1 = await R.place(R.first, myId, c[0], c[1], R.axis(myId));
  assert.strictEqual(t1.status, 200); assert.strictEqual(t1.body.returned, 0);
  const a = await R.st(R.first), b = await R.st(second);
  assert.deepStrictEqual(a.field.map(m => m.id), [myId]); assert.strictEqual(a.field[0].owner, R.first); assert.ok(Math.abs(a.field[0].x - c[0]) < 0.06 && Math.abs(a.field[0].y - c[1]) < 0.06);
  assert.strictEqual(a.hands[R.first].length, 9); assert.ok(!a.hands[R.first].includes(myId)); assert.strictEqual(a.hands[second].length, 10); assert.strictEqual(a.taken[R.first], 1); ok('magnes trafia na pole, znika z ręki, licznik ruchów rośnie');
  assert.deepStrictEqual(a.field, b.field); assert.deepStrictEqual(a.hands, b.hands); assert.strictEqual(a.last.id, 1); assert.strictEqual(a.last.by, R.first); assert.strictEqual(a.lastId, 1); assert.deepStrictEqual(a.last.placed, { id: myId, x: Math.round(c[0] * 10) / 10, y: Math.round(c[1] * 10) / 10, a: a.last.placed.a, owner: R.first }); ok('obaj gracze widzą ten sam stan; opis ruchu (kto, który magnes, gdzie)');
  assert.strictEqual(a.turn, second); assert.ok(a.busyMs > 0); assert.strictEqual((await R.place(second, hisId, 100, 100, 0)).body.code, 'busy'); ok('po ruchu kolej przechodzi na drugiego, a w trakcie odtwarzania serwer odpowiada busy');
  assert.ok(Array.isArray(a.last.phases) && a.last.phases.length >= 1 && a.last.returned.length === 0); ok('ruch niesie fazy do odtworzenia (klatki, zdarzenia) i listę zwróconych magnesów');
  R.room.busyUntil = 0;
  const near = await R.place(second, hisId, c[0], c[1], 0); assert.strictEqual(near.body.code, 'blocked'); ok('magnes na innym magnesie: blocked');
  const sh0 = E.shapeOf(R.shapes, myId);
  const dxAt = want => { const m1 = E.body(sh0, { id: myId, x: c[0], y: c[1], a: R.axis(myId) }); for (let d = 0; d < 300; d += 0.25) if (E.gap(m1, E.body(E.shapeOf(R.shapes, hisId), { id: hisId, x: c[0] + d, y: c[1], a: 0 })) >= want) return d; return 300; };
  assert.strictEqual((await R.place(second, hisId, c[0] + dxAt(1.5), c[1], 0)).body.code, 'blocked'); ok('zbyt mały odstęp (1,5 jedn.) od innego magnesu: blocked');

  // ---------- połączenie: zwrot magnesów do gracza, który je wywołał ----------
  const J = await newRoom({});
  const jf = J.first, js = 1 - jf, idA = (await J.st(0)).hands[jf][2], idB = (await J.st(0)).hands[js][3];
  const shA = E.shapeOf(J.shapes, idA), ang = J.axis(idA);
  assert.strictEqual((await J.place(jf, idA, 200, 200, ang)).status, 200); J.room.busyUntil = 0;
  const rj = await J.place(js, idB, 200 + shA.R + E.shapeOf(J.shapes, idB).R + 24, 200, J.axis(idB));
  assert.strictEqual(rj.status, 200);
  const j1 = await J.st(0);
  if (rj.body.returned > 0) {
    assert.strictEqual(rj.body.returned, 2); assert.deepStrictEqual(j1.field, []); assert.strictEqual(j1.hands[js].length, 11); assert.ok(j1.hands[js].includes(idA) && j1.hands[js].includes(idB)); assert.strictEqual(j1.hands[jf].length, 9); assert.ok(!j1.hands[jf].includes(idA));
    assert.deepStrictEqual(j1.last.returned, [idA, idB].sort((x, y) => x - y)); assert.strictEqual(j1.last.phases[0].removed.length, 2); assert.strictEqual(j1.turn, jf); ok('magnesy, które się połączyły (także magnes przeciwnika), wracają do gracza, który je wywołał: ma 9+2 = 11, przeciwnik 9');
  } else { throw new Error('magnesy nie połączyły się w teście: ' + JSON.stringify(j1.last && j1.last.phases.map(p => p.seconds))); }
  assert.deepStrictEqual(j1.hands[0].concat(j1.hands[1]).sort((x, y) => x - y), [...Array(20).keys()].filter(i => i !== idA && i !== idB).concat([idA, idB]).sort((x, y) => x - y)); ok('żaden magnes nie ginie: razem w rękach i na polu zawsze 20');

  // ---------- zasada "magnesy daleko = nic się nie dzieje" ----------
  const Fq = await newRoom({}); const fidA = (await Fq.st(0)).hands[Fq.first][0], fidB = (await Fq.st(0)).hands[1 - Fq.first][0];
  await Fq.place(Fq.first, fidA, 100, 100, 0); Fq.room.busyUntil = 0;
  const fr = await Fq.place(1 - Fq.first, fidB, 480, 300, 2); assert.strictEqual(fr.body.returned, 0);
  const fs1 = await Fq.st(0); assert.strictEqual(fs1.field.length, 2); assert.strictEqual(fs1.last.phases[0].ids.length, 0); assert.ok(fs1.last.seconds <= 0.4); ok('daleko od siebie magnesy leżą spokojnie: bez ruchu, bez połączenia, ruch kończy się od razu');

  // ---------- wygrana: pusta ręka ----------
  const W = await newRoom({}), wp = W.first;
  W.room.hands[wp] = [W.room.hands[wp][4]]; const lastId = W.room.hands[wp][0];
  const wr = await W.place(wp, lastId, 150, 150, 1); assert.strictEqual(wr.status, 200);
  const ws = await W.st(1); assert.strictEqual(ws.phase, 'over'); assert.strictEqual(ws.winner, wp); assert.strictEqual(ws.reason, 'empty'); assert.strictEqual(ws.draw, false); assert.strictEqual(ws.turn, null); ok('pozbycie się ostatniego magnesu (bez połączenia) wygrywa partię');
  W.room.busyUntil = 0; assert.strictEqual((await W.place(1 - wp, W.room.hands[1 - wp][0], 400, 300, 0)).body.code, 'not_playing'); ok('po końcu gry nie da się stawiać');
  // ostatni magnes, który się połączy, nie wygrywa: wraca do ręki
  const W2 = await newRoom({}), p2 = W2.first, q2 = 1 - p2, st2 = await W2.st(0), idX = st2.hands[p2][1], idY = st2.hands[q2][1];
  await W2.place(q2 === W2.first ? q2 : p2, 99, 1, 1);                                                 // (ruch niepoprawny, nic nie zmienia)
  W2.room.field = [{ id: idY, x: 250, y: 200, a: W2.axis(idY), owner: q2 }]; W2.room.hands[q2] = W2.room.hands[q2].filter(i => i !== idY); W2.room.hands[p2] = [idX];
  const lr = await W2.place(p2, idX, 250 + E.shapeOf(W2.shapes, idX).R + E.shapeOf(W2.shapes, idY).R + 24, 200, W2.axis(idX));
  const l2 = await W2.st(0);
  assert.strictEqual(lr.body.returned, 2); assert.strictEqual(l2.phase, 'playing'); assert.strictEqual(l2.hands[p2].length, 2); ok('ostatni magnes, który się połączy, nie daje wygranej: wraca do ręki (z magnesem przeciwnika)');

  // ---------- limit ruchów i blokada ----------
  const M = await newRoom({}), mp = M.first;
  M.room.taken = [E.P.maxTurns - 1, E.P.maxTurns]; M.room.turn = 0; M.room.busyUntil = 0; M.room.hands[0] = M.room.hands[0].slice(0, 5); M.room.hands[1] = M.room.hands[1].slice(0, 7);
  await M.place(0, M.room.hands[0][0], 100, 100, 0);
  const ms = await M.st(0); assert.strictEqual(ms.phase, 'over'); assert.strictEqual(ms.reason, 'limit'); assert.strictEqual(ms.winner, 0); ok('limit ruchów obu graczy: wygrywa ten, kto ma mniej magnesów w ręku');
  const M2 = await newRoom({}); M2.room.taken = [E.P.maxTurns - 1, E.P.maxTurns]; M2.room.turn = 0; M2.room.busyUntil = 0; M2.room.hands[0] = M2.room.hands[0].slice(0, 6); M2.room.hands[1] = M2.room.hands[1].slice(0, 5);
  await M2.place(0, M2.room.hands[0][0], 100, 100, 0);
  const m2s = await M2.st(0); assert.strictEqual(m2s.draw, true); assert.strictEqual(m2s.winner, null); ok('limit ruchów przy równej liczbie magnesów: remis');
  const B = await newRoom({}); B.room.busyUntil = 0; const bp = B.first;
  B.room.hands[1 - bp] = [];                                                                          // przeciwnik nie ma czym stawiać = nie ma legalnego ruchu
  await B.place(bp, B.room.hands[bp][0], 100, 100, 0);
  const bs = await B.st(0); assert.strictEqual(bs.phase, 'over'); assert.strictEqual(bs.reason, 'blocked'); ok('brak legalnego ruchu kończy partię (wygrywa mniej magnesów w ręku)');

  // ---------- poddanie ----------
  const Q = await newRoom({});
  assert.strictEqual((await post('/api/resign', Q.P[1 - Q.first])).status, 200);
  const qs = await Q.st(Q.first);
  assert.strictEqual(qs.phase, 'over'); assert.strictEqual(qs.reason, 'resign'); assert.strictEqual(qs.winner, Q.first); ok('poddanie: wygrywa przeciwnik (nawet poza swoją kolejką)');
  assert.strictEqual((await post('/api/resign', Q.P[Q.first])).body.code, 'not_playing');

  // ---------- rewanż ----------
  const oldSeed = qs.seed;
  assert.strictEqual((await post('/api/rematch', Q.P[0])).status, 200);
  assert.strictEqual((await Q.st(0)).phase, 'over'); assert.strictEqual((await Q.st(1)).opponentWantsRematch, true);
  assert.strictEqual((await post('/api/rematch', Q.P[1])).status, 200);
  const rs = await Q.st(0);
  assert.strictEqual(rs.phase, 'playing'); assert.deepStrictEqual(rs.field, []); assert.deepStrictEqual(rs.taken, [0, 0]); assert.strictEqual(rs.lastId, 0); assert.strictEqual(rs.hands[0].length, 10); assert.strictEqual(rs.hands[1].length, 10); assert.strictEqual(rs.turn, 1 - Q.first); assert.notStrictEqual(rs.seed, oldSeed); ok('rewanż: puste pole, 10 magnesów każdy, nowe kształty, zaczyna drugi gracz');
  assert.strictEqual((await post('/api/rematch', Q.P[0])).body.code, 'not_over');

  // ---------- long-poll ----------
  LIMITS.pollMs = 400;
  const LP = await newRoom({});
  const v0 = (await LP.st(0)).v;
  const poll = async (P, v) => { const t0 = Date.now(); const rr = await get(`/api/poll?code=${P.code}&token=${P.token}&v=${v}`); return { ...rr, ms: Date.now() - t0 }; };
  let lp1 = await poll(LP.P[0], v0 - 1); assert.ok(lp1.ms < 300); ok('long-poll: starsza wersja -> odpowiedź od razu');
  let lp2 = await poll(LP.P[0], v0); assert.strictEqual(lp2.body.v, v0); assert.ok(lp2.ms >= 350); ok('long-poll: bez zmian czeka i po limicie czasu odpowiada');
  const other = 1 - LP.first, waiter = poll(LP.P[other], v0); await sleep(100);
  await LP.place(LP.first, (await LP.st(0)).hands[LP.first][0], 150, 150, 0.5);
  const woke = await waiter; assert.ok(woke.ms < 350 && woke.body.v > v0 && woke.body.last && woke.body.last.id === 1 && woke.body.field.length === 1); ok('long-poll: ruch przeciwnika budzi oczekujące żądanie od razu i niesie opis ruchu');
  LIMITS.pollMs = 20000;

  // ---------- czat ----------
  const C = await newRoom({});
  const say = (seat, text) => post('/api/chat', Object.assign({ text }, C.P[seat]));
  assert.strictEqual((await say(0, 'Cześć <b>x</b>')).status, 200);
  const cs = await C.st(1); assert.strictEqual(cs.chat[0].text, 'Cześć <b>x</b>'); assert.strictEqual(cs.chat[0].by, 0); ok('czat: wiadomość dociera do przeciwnika');
  assert.strictEqual((await say(1, 'a\u0000b‮c   d')).status, 200);
  assert.strictEqual((await C.st(0)).chat[1].text, 'a b c d'); ok('czat: znaki sterujące usuwane, spacje zwijane');
  assert.strictEqual((await say(0, 'Ahoj 🧲 👨‍👩‍👧')).status, 200); assert.strictEqual((await C.st(1)).chat[2].text, 'Ahoj 🧲 👨‍👩‍👧'); ok('czat: złożone emoji zachowane');
  for (const bad of ['', '  ', 'x'.repeat(201), 5, null]) assert.strictEqual((await say(0, bad)).body.code, 'chat_invalid');
  ok('czat: puste/za długie/nie-tekstowe odrzucone');
  let rl = 0; for (let i = 0; i < 10; i++) if ((await say(1, 'm' + i)).status === 429) rl++;
  assert.ok(rl >= 3); ok('czat: limit wiadomości (429)');

  // ---------- ochrona przed zalewaniem ----------
  const FL = await newRoom({});
  const codes = []; for (let i = 0; i < 4; i++) codes.push((await FL.place(1 - FL.first, 10 * (1 - FL.first) + 0, 200, 200, 0)).body.code);
  assert.ok(codes.every(c2 => c2 === 'not_your_turn')); ok('stawianie poza kolejką dostaje czytelny błąd (nie blokuje gracza)');
  const hid = (await FL.st(0)).hands[FL.first][0], accepted = []; for (let i = 0; i < 4; i++) accepted.push((await FL.place(FL.first, hid, 200, 200, 0)).status);
  assert.strictEqual(accepted[0], 200); assert.ok(accepted.slice(1).every(c2 => c2 === 400)); ok('pierwszy ruch przechodzi, kolejne w trakcie odtwarzania są odrzucane, więc serwer nie liczy fizyki w pętli');

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
  const sandbox = { navigator: { language: 'pl' }, localStorage: { getItem: () => null, setItem() {} }, document: { documentElement: {}, querySelectorAll: () => [] } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'public', 'i18n.js'), 'utf8') + ';this.I18N = I18N;', sandbox);
  const { pl, en } = sandbox.I18N;
  assert.deepStrictEqual([Object.keys(pl).filter(k => !(k in en)), Object.keys(en).filter(k => !(k in pl))], [[], []]); ok('tłumaczenia: te same klucze po polsku i angielsku (' + Object.keys(pl).length + ')');
  const tutSrc = fs.readFileSync(path.join(__dirname, 'public', 'tutorial.js'), 'utf8');
  const tutIds = [...tutSrc.matchAll(/\{ id: '(\w+)', scene:/g)].map(m => m[1]);
  assert.ok(tutIds.length >= 5, 'za mało kroków samouczka');
  for (const id of tutIds) for (const part of ['title', 'text']) for (const Lg of [pl, en]) assert.ok(typeof Lg[`tut.${id}.${part}`] === 'string' && Lg[`tut.${id}.${part}`].length > (part === 'title' ? 2 : 10), `brak tut.${id}.${part}`);
  for (const k of ['tut.btn', 'tut.btnTitle', 'tut.step', 'tut.goto', 'tut.prev', 'tut.next', 'tut.done', 'tut.close']) assert.ok(pl[k] && en[k], 'brak ' + k);
  assert.strictEqual(pl['tut.step'](2, 6), 'Krok 2 z 6'); assert.strictEqual(en['tut.step'](2, 6), 'Step 2 of 6');
  ok(`samouczek: ${tutIds.length} kroków ma tytuły i teksty po polsku i angielsku`);
  for (const Lg of [pl, en]) for (const k of Object.keys(Lg)) if (/^tut\..+\.text$/.test(k)) assert.ok(!/<[a-z]/i.test(Lg[k]), 'HTML w tekście samouczka: ' + k);
  ok('samouczek: teksty bez znaczników HTML (wstawiane jako zwykły tekst)');
  for (const Lg of [pl, en]) assert.ok(Lg['tut.turns.text'].includes(String(E.P.perPlayer)) && Lg['tut.turns.text'].includes(String(E.P.maxTurns)), 'liczby w samouczku nie zgadzają się z silnikiem'); ok('samouczek podaje aktualne liczby (magnesów na gracza: ' + E.P.perPlayer + ', limit ruchów: ' + E.P.maxTurns + ')');
  for (const k of FIELDS) assert.ok(pl['field.' + k] && en['field.' + k]); ok('nazwy wielkości pola przetłumaczone');
  for (const code of ['not_playing', 'not_your_turn', 'busy', 'blocked', 'no_magnet', 'bad_request', 'rate_limited', 'room_full', 'no_room', 'no_game', 'forbidden', 'chat_invalid']) assert.ok(pl['err.' + code] && en['err.' + code], 'brak tłumaczenia błędu ' + code);
  ok('kody błędów serwera mają tłumaczenia');
  const pageHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  assert.ok(pageHtml.includes('id="tutorial"') && pageHtml.includes('id="tutBtn"') && pageHtml.indexOf('tutorial.js') > 0 && pageHtml.indexOf('tutorial.js') < pageHtml.indexOf('app.js'));
  assert.ok(pageHtml.indexOf('engine.js') > 0 && pageHtml.indexOf('engine.js') < pageHtml.indexOf('board.js') && pageHtml.indexOf('engine.js') < pageHtml.indexOf('tutorial.js'));
  ok('index.html: samouczek, a engine.js ładowany przed board.js i tutorial.js');
  const used = new Set([...pageHtml.matchAll(/data-i18n(?:-title|-aria|-placeholder)?="([^"]+)"/g)].map(m => m[1]));
  for (const k of used) assert.ok(k in pl, 'brak klucza w słowniku: ' + k); ok('każdy data-i18n w stronie ma tłumaczenie (' + used.size + ')');
  for (const f of ['tutorial.js', 'board.js', 'field.js', 'music.js', 'app.js', 'style.css']) assert.strictEqual((await fetch(base + '/' + f)).status, 200, f); ok('skrypty i style klienta są serwowane z własnego serwera (zgodnie z CSP)');

  // ---------- zamykanie ----------
  LIMITS.createPer10Min = 1000; LIMITS.joinPerMin = 1000;      // dalsze testy znów zakładają pokoje z jednego adresu
  const infoLocal = (await get('/api/info')).body;
  assert.ok(/^[0-9a-f]{32}$/.test(infoLocal.adminToken)); ok('/api/info: lokalna przeglądarka dostaje token administratora');
  const remote = await (await fetch(base + '/api/info', { headers: { 'CF-Connecting-IP': '198.51.100.5' } })).json();
  assert.strictEqual(remote.adminToken, null); assert.deepStrictEqual(remote.lan, []); ok('/api/info: klient z internetu nie dostaje tokenu ani adresów sieci domowej');
  let exitCode = null; hooks.exit = c2 => { exitCode = c2; };
  const quit = headers => fetch(base + '/api/shutdown', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: '{}' });
  assert.strictEqual((await quit({})).status, 403);
  assert.strictEqual((await quit({ 'X-Admin-Token': 'zly' })).status, 403);
  assert.strictEqual((await quit({ 'X-Admin-Token': infoLocal.adminToken, 'CF-Connecting-IP': '198.51.100.5' })).status, 403);
  assert.strictEqual((await quit({ 'X-Admin-Token': infoLocal.adminToken, Origin: 'http://zlosliwa.example' })).status, 403);
  assert.strictEqual(exitCode, null); ok('zamykanie: bez tokenu, zły token, przez tunel i z obcej strony -> 403');
  const Z = await newRoom({}); const zv = (await Z.st(0)).v;
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
