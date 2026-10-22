'use strict';
// Test integracyjny serwera gry Wyścig kapsli: uruchamia serwer na wolnym porcie i gra dwoma "graczami" przez HTTP.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { server, hooks, rooms, LENGTHS, RULES, CODE_LEN, LIMITS } = require('./server');
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
  const s0 = await st(0);
  const room = rooms.get(a.code);
  // pstryknięcie wzdłuż pierwszej prostej (tor zaczyna się w prawo): pull w lewo = lot w prawo
  const shoot = (seat, px, py, hx, hy) => post('/api/shoot', Object.assign({ hx: hx || 0, hy: hy || 0, px: px === undefined ? -60 : px, py: py || 0 }, P[seat]));
  return { P, st, shoot, room, code: a.code, first: s0.turn };
}

async function main() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
  const ORIG = { create: LIMITS.createPer10Min, join: LIMITS.joinPerMin };
  LIMITS.createPer10Min = 1000; LIMITS.joinPerMin = 1000;   // test zakłada wiele pokoi z jednego adresu; limity sprawdzamy osobno niżej

  // ---------- statyki, nagłówki ----------
  let r = await fetch(base + '/'); assert.strictEqual(r.status, 200); assert.ok((await r.text()).includes('Wyścig kapsli')); ok('strona główna serwowana');
  assert.ok(/script-src 'self'/.test(r.headers.get('content-security-policy')) && r.headers.get('x-frame-options') === 'DENY'); ok('nagłówki bezpieczeństwa (CSP, DENY)');
  r = await fetch(base + '/..%2fserver.js'); assert.notStrictEqual(r.status, 200);
  r = await fetch(base + '/server.js'); assert.notStrictEqual(r.status, 200); ok('brak wyjścia poza katalog public, server.js nie jest serwowany');
  r = await fetch(base + '/engine.js'); assert.strictEqual(r.status, 200); assert.ok(/javascript/.test(r.headers.get('content-type'))); ok('engine.js jest serwowany klientom (podgląd toru lotu i rysowanie toru używają tej samej fizyki)');

  // ---------- pokoje i ustawienia ----------
  const info0 = (await get('/api/info')).body;
  assert.deepStrictEqual(info0.lengths, ['s', 'm', 'l']); assert.strictEqual(info0.defaultLen, 'm'); assert.deepStrictEqual(info0.rules, ['last', 'alternate']); assert.strictEqual(info0.defaultRule, 'last'); ok('/api/info: długości toru i zasady kolejki');
  for (const bad of [{ len: 'xxl' }, { len: 5 }, { len: '__proto__' }, { rule: 'wat' }, { rule: 7 }, { rule: '__proto__' }]) assert.strictEqual((await post('/api/create', bad)).status, 400);
  ok('nieprawidłowa długość toru/zasada odrzucone (także __proto__)');
  const wait = (await post('/api/create', {})).body;
  let sw = (await get(`/api/state?code=${wait.code}&token=${wait.token}`)).body;
  assert.strictEqual(sw.phase, 'waiting'); assert.strictEqual(sw.opponentJoined, false); assert.strictEqual(sw.lenKey, 'm'); assert.strictEqual(sw.rule, 'last'); assert.strictEqual(sw.track, null); assert.strictEqual(sw.caps, null); ok('pokój czeka na przeciwnika (domyślnie tor średni, zasada "kto z tyłu")');
  assert.strictEqual((await post('/api/join', { code: 'ZZZZZZ' })).status, 404);
  assert.strictEqual((await post('/api/join', { code: 'ABCD' })).status, 404);
  assert.strictEqual((await post('/api/join', { code: 12345 })).status, 404); ok('zły kod pokoju odrzucony');
  assert.strictEqual((await get(`/api/state?code=${wait.code}&token=zly`)).status, 404); ok('zły token odrzucony');
  const wj = (await post('/api/join', { code: wait.code.toLowerCase() })).body;
  assert.strictEqual(wj.you, 1);
  assert.strictEqual((await post('/api/join', { code: wait.code })).status, 400); ok('trzecia osoba nie wejdzie');

  // ---------- start partii ----------
  const R = await newRoom({ len: 's', rule: 'alternate' });
  const s0 = await R.st(0), s1 = await R.st(1);
  assert.strictEqual(s0.phase, 'playing'); assert.ok([0, 1].includes(s0.turn)); assert.deepStrictEqual(s0.track, s1.track); assert.deepStrictEqual(s0.caps, s1.caps);
  assert.strictEqual(s0.lenKey, 's'); assert.strictEqual(s0.rule, 'alternate'); assert.deepStrictEqual(s0.shots, [0, 0]); assert.strictEqual(s0.maxShots, E.P.maxShots); assert.strictEqual(s0.shot, null); assert.strictEqual(s0.shotId, 0); ok('po dołączeniu gra startuje: ten sam tor i kapsle u obu graczy, nikt jeszcze nie pstryknął');
  const tr = E.buildTrack(s0.track.seed, s0.track.lenKey);
  assert.deepStrictEqual(s0.caps, E.startPositions(tr)); assert.ok(tr.length > 2800 * 0.95 && tr.length < 2800 + 500); ok('klient odtworzy ten sam tor z seeda (kapsle stoją na linii startu, tor krótki ≈ 2800)');
  assert.deepStrictEqual(s0.progress, [0, 0]); assert.ok(s0.busyMs === 0);

  // ---------- walidacja pstryknięć ----------
  const second = 1 - R.first;
  assert.strictEqual((await R.shoot(second)).body.code, 'not_your_turn'); ok('pstryknięcie poza kolejką odrzucone');
  for (const body of [{}, { hx: 0, hy: 0, px: 'a', py: 0 }, { hx: null, hy: 0, px: -50, py: 0 }, { hx: 0, hy: 0, px: -50 }, { hx: 0, hy: 0, px: 1e999, py: 0 }, { hx: '0', hy: 0, px: -50, py: 0 }]) {
    const x = await post('/api/shoot', Object.assign({}, body, R.P[R.first])); assert.strictEqual(x.status, 400); assert.strictEqual(x.body.code, 'bad_request');
  }
  ok('brak/nieliczbowe/nieskończone parametry odrzucone (bad_request)');
  assert.strictEqual((await R.shoot(R.first, -5, 0)).body.code, 'too_weak'); assert.strictEqual((await R.shoot(R.first, 0, 0)).body.code, 'too_weak'); ok('zbyt krótkie odciągnięcie to too_weak');
  assert.strictEqual((await R.st(R.first)).shotId, 0); ok('odrzucone pstryknięcia niczego nie zmieniają');

  // ---------- pstryknięcie ----------
  const before = (await R.st(R.first)).caps;
  const shot = await R.shoot(R.first, -80, 0);
  assert.strictEqual(shot.status, 200); assert.ok(shot.body.seconds > 0.2 && shot.body.seconds < 2);
  const a = await R.st(R.first), b = await R.st(second);
  assert.ok(a.caps[R.first].x > before[R.first].x + 50 && Math.abs(a.caps[R.first].y - before[R.first].y) < 1); assert.deepStrictEqual(a.caps[second], before[second]); ok('pstryknięty kapsel jedzie wzdłuż prostej, drugi stoi');
  assert.deepStrictEqual(a.caps, b.caps); assert.deepStrictEqual(a.shot, Object.assign({}, b.shot, { age: a.shot.age })); assert.strictEqual(a.shot.id, 1); assert.strictEqual(a.shotId, 1); assert.strictEqual(a.shots[R.first], 1); assert.strictEqual(a.shots[second], 0); ok('obaj gracze widzą ten sam wynik, liczniki pstryknięć i numer ruchu');
  assert.ok(a.shot.by === R.first && Math.abs(a.shot.frames.length - a.shot.seconds * 30) < 3); assert.deepStrictEqual(a.shot.frames[0], [before[0].x, before[0].y, before[1].x, before[1].y]);
  const lf = a.shot.frames[a.shot.frames.length - 1]; assert.deepStrictEqual([{ x: lf[0], y: lf[1] }, { x: lf[2], y: lf[3] }], a.caps); ok('trajektoria: klatki od pozycji startowej do końcowej (do odtworzenia u obu graczy)');
  assert.ok(a.progress[R.first] > 0 && a.progress[second] === 0 && a.busyMs > 0); ok('postęp do mety i blokada na czas lotu');
  assert.strictEqual(a.turn, second); ok('zasada "na zmianę": po pstryknięciu kolej przechodzi na drugiego');
  assert.strictEqual((await R.shoot(second, -60, 0)).body.code, 'busy'); ok('następne pstryknięcie w trakcie lotu: busy');
  await sleep(shot.body.seconds * 1000 + 450);
  assert.strictEqual((await R.shoot(second, -60, 0)).status, 200); assert.strictEqual((await R.st(0)).turn, R.first); ok('po zatrzymaniu kapsla można pstryknąć; kolej wraca (na zmianę)');

  // ---------- zasada "kto z tyłu" ----------
  const L = await newRoom({ len: 'm' });                 // domyślnie rule = last
  const lead = L.first, back = 1 - lead;
  L.room.busyUntil = 0;
  assert.strictEqual((await L.shoot(lead, -80, 0)).status, 200); L.room.busyUntil = 0;
  assert.strictEqual((await L.st(0)).turn, back); ok('"kto z tyłu": po pstryknięciu pierwszego pstryka ten, który został z tyłu');
  assert.strictEqual((await L.shoot(back, -30, 0)).status, 200); L.room.busyUntil = 0;
  assert.strictEqual((await L.st(0)).turn, back); ok('słabe pstryknięcie nie dogania prowadzącego: ten sam gracz pstryka dalej');
  assert.strictEqual((await L.shoot(back, -150, 0)).status, 200); L.room.busyUntil = 0;
  const ls = await L.st(0); assert.ok(ls.progress[back] > ls.progress[lead]); assert.strictEqual(ls.turn, lead); ok('po wyprzedzeniu kolej wraca do gracza, który teraz jest z tyłu');

  // ---------- meta ----------
  const F = await newRoom({ len: 's' });
  const tf = E.buildTrack((await F.st(0)).track.seed, 's'), fp = E.pointAt(tf, tf.sFinish - 40, 0);
  F.room.caps = [{ x: Math.round(fp.x * 10) / 10, y: Math.round(fp.y * 10) / 10 }, E.startPositions(tf)[1]];
  F.room.turn = 0; F.room.busyUntil = 0;
  const fr = await F.shoot(0, -Math.cos(fp.ang) * 110, -Math.sin(fp.ang) * 110);
  assert.strictEqual(fr.status, 200);
  const fs1 = await F.st(1);
  assert.strictEqual(fs1.phase, 'over'); assert.strictEqual(fs1.reason, 'finish'); assert.strictEqual(fs1.winner, 0); assert.strictEqual(fs1.draw, false); assert.strictEqual(fs1.turn, null); assert.ok(fs1.progress[0] >= 1); ok('kapsel, który minie linię mety, wygrywa; stan "over" z powodem finish');
  assert.strictEqual((await F.shoot(0, -60, 0)).body.code, 'not_playing'); assert.strictEqual((await F.shoot(1, -60, 0)).body.code, 'not_playing'); ok('po mecie nie da się pstrykać');

  // ---------- limit pstryknięć ----------
  const M = await newRoom({ len: 's', rule: 'alternate' });
  M.room.shots = [E.P.maxShots - 1, E.P.maxShots]; M.room.turn = 0; M.room.busyUntil = 0;
  await M.shoot(0, -80, 0);
  const ms = await M.st(0); assert.strictEqual(ms.phase, 'over'); assert.strictEqual(ms.reason, 'limit'); assert.strictEqual(ms.winner, 0); ok('limit pstryknięć obu graczy: wygrywa ten, kto jest bliżej mety');
  const M2 = await newRoom({ len: 's', rule: 'alternate' });
  M2.room.shots = [E.P.maxShots - 1, E.P.maxShots]; M2.room.turn = 0; M2.room.busyUntil = 0;
  M2.room.caps = [E.pointAt(E.buildTrack(M2.room.track.seed, 's'), 800, 0), E.pointAt(E.buildTrack(M2.room.track.seed, 's'), 1500, 0)].map(p => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
  await M2.shoot(0, -30, 0);
  assert.strictEqual((await M2.st(0)).winner, 1); ok('limit pstryknięć: wygrywa dalszy kapsel także wtedy, gdy ostatni ruch zrobił przegrywający');

  // ---------- poddanie ----------
  const Q = await newRoom({});
  assert.strictEqual((await post('/api/resign', Q.P[1 - Q.first])).status, 200);
  const qs = await Q.st(Q.first);
  assert.strictEqual(qs.phase, 'over'); assert.strictEqual(qs.reason, 'resign'); assert.strictEqual(qs.winner, Q.first); ok('poddanie: wygrywa przeciwnik (nawet poza swoją kolejką)');
  assert.strictEqual((await post('/api/resign', Q.P[Q.first])).body.code, 'not_playing');

  // ---------- rewanż ----------
  const oldSeed = qs.track.seed;
  assert.strictEqual((await post('/api/rematch', Q.P[0])).status, 200);
  assert.strictEqual((await Q.st(0)).phase, 'over'); assert.strictEqual((await Q.st(1)).opponentWantsRematch, true);
  assert.strictEqual((await post('/api/rematch', Q.P[1])).status, 200);
  const rs = await Q.st(0);
  assert.strictEqual(rs.phase, 'playing'); assert.deepStrictEqual(rs.shots, [0, 0]); assert.strictEqual(rs.shotId, 0); assert.strictEqual(rs.turn, 1 - Q.first); assert.notStrictEqual(rs.track.seed, oldSeed);
  assert.deepStrictEqual(rs.caps, E.startPositions(E.buildTrack(rs.track.seed, rs.track.lenKey))); ok('rewanż: nowy losowy tor, kapsle na starcie, zaczyna drugi gracz');
  assert.strictEqual((await post('/api/rematch', Q.P[0])).body.code, 'not_over');

  // ---------- tory są losowe ----------
  const seeds = new Set(); for (let i = 0; i < 12; i++) { const x = await newRoom({ len: 's' }); seeds.add((await x.st(0)).track.seed); }
  assert.ok(seeds.size >= 11); ok('każda nowa gra ma inny tor (12 gier: ' + seeds.size + ' różnych)');
  for (const k of LENGTHS) { const x = await newRoom({ len: k }); const s = await x.st(0), t2 = E.buildTrack(s.track.seed, k); assert.ok(t2.length > E.LENGTHS[k] * 0.95 && t2.length < E.LENGTHS[k] + 500); }
  ok('długości toru S/M/L zgodne z ustawieniem');

  // ---------- long-poll ----------
  LIMITS.pollMs = 400;
  const LP = await newRoom({ rule: 'alternate' });
  const v0 = (await LP.st(0)).v;
  const poll = async (P, v) => { const t0 = Date.now(); const rr = await get(`/api/poll?code=${P.code}&token=${P.token}&v=${v}`); return { ...rr, ms: Date.now() - t0 }; };
  let p1 = await poll(LP.P[0], v0 - 1); assert.ok(p1.ms < 300); ok('long-poll: starsza wersja -> odpowiedź od razu');
  let p2 = await poll(LP.P[0], v0); assert.strictEqual(p2.body.v, v0); assert.ok(p2.ms >= 350); ok('long-poll: bez zmian czeka i po limicie czasu odpowiada');
  const other = 1 - LP.first, waiter = poll(LP.P[other], v0); await sleep(100);
  await LP.shoot(LP.first, -70, 0);
  const woke = await waiter; assert.ok(woke.ms < 350 && woke.body.v > v0 && woke.body.shot && woke.body.shot.id === 1 && woke.body.shot.frames.length > 5); ok('long-poll: pstryknięcie przeciwnika budzi oczekujące żądanie od razu i niesie trajektorię');
  LIMITS.pollMs = 20000;

  // ---------- czat ----------
  const C = await newRoom({});
  const say = (seat, text) => post('/api/chat', Object.assign({ text }, C.P[seat]));
  assert.strictEqual((await say(0, 'Cześć <b>x</b>')).status, 200);
  const cs = await C.st(1); assert.strictEqual(cs.chat[0].text, 'Cześć <b>x</b>'); assert.strictEqual(cs.chat[0].by, 0); ok('czat: wiadomość dociera do przeciwnika');
  assert.strictEqual((await say(1, 'a\u0000b‮c   d')).status, 200);
  assert.strictEqual((await C.st(0)).chat[1].text, 'a b c d'); ok('czat: znaki sterujące usuwane, spacje zwijane');
  assert.strictEqual((await say(0, 'Ahoj 🏁 👨‍👩‍👧')).status, 200); assert.strictEqual((await C.st(1)).chat[2].text, 'Ahoj 🏁 👨‍👩‍👧'); ok('czat: złożone emoji zachowane');
  for (const bad of ['', '  ', 'x'.repeat(201), 5, null]) assert.strictEqual((await say(0, bad)).body.code, 'chat_invalid');
  ok('czat: puste/za długie/nie-tekstowe odrzucone');
  let rl = 0; for (let i = 0; i < 10; i++) if ((await say(1, 'm' + i)).status === 429) rl++;
  assert.ok(rl >= 3); ok('czat: limit wiadomości (429)');

  // ---------- ochrona przed zalewaniem pstryknięciami ----------
  const FL = await newRoom({});
  const codes = []; for (let i = 0; i < 4; i++) codes.push((await FL.shoot(1 - FL.first, -60, 0)).body.code);
  assert.ok(codes.every(c => c === 'not_your_turn')); ok('pstryknięcia poza kolejką dostają czytelny błąd (nie blokują gracza)');
  const accepted = []; for (let i = 0; i < 5; i++) accepted.push((await FL.shoot(FL.first, -40, 0)).status);
  assert.strictEqual(accepted[0], 200); ok('pierwsze pstryknięcie przechodzi, kolejne w trakcie lotu są odrzucane (busy/not_your_turn), więc serwer nie liczy fizyki w pętli');
  assert.ok(accepted.slice(1).every(c => c === 400));

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
  for (const Lg of [pl, en]) assert.ok(Lg['tut.rules.text'].includes(String(E.P.maxShots)), 'limit pstryknięć w samouczku nie zgadza się z silnikiem'); ok('samouczek podaje aktualny limit pstryknięć (' + E.P.maxShots + ')');
  for (const k of Object.keys(info0.lengths)) assert.ok(pl['len.' + info0.lengths[k]] && en['len.' + info0.lengths[k]]);
  for (const ru of RULES) assert.ok(pl['rule.' + ru] && en['rule.' + ru]); ok('nazwy długości toru i zasad kolejki przetłumaczone');
  for (const code of ['not_playing', 'not_your_turn', 'busy', 'too_weak', 'bad_request', 'rate_limited', 'room_full', 'no_room', 'no_game', 'forbidden', 'chat_invalid']) assert.ok(pl['err.' + code] && en['err.' + code], 'brak tłumaczenia błędu ' + code);
  ok('kody błędów serwera mają tłumaczenia');
  const pageHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  assert.ok(pageHtml.includes('id="tutorial"') && pageHtml.includes('id="tutBtn"') && pageHtml.indexOf('tutorial.js') > 0 && pageHtml.indexOf('tutorial.js') < pageHtml.indexOf('app.js'));
  assert.ok(pageHtml.indexOf('engine.js') > 0 && pageHtml.indexOf('engine.js') < pageHtml.indexOf('board.js') && pageHtml.indexOf('engine.js') < pageHtml.indexOf('tutorial.js'));
  ok('index.html: samouczek, a engine.js ładowany przed board.js i tutorial.js');
  const used = new Set([...pageHtml.matchAll(/data-i18n(?:-title|-aria|-placeholder)?="([^"]+)"/g)].map(m => m[1]));
  for (const k of used) assert.ok(k in pl, 'brak klucza w słowniku: ' + k); ok('każdy data-i18n w stronie ma tłumaczenie (' + used.size + ')');
  assert.strictEqual((await fetch(base + '/tutorial.js')).status, 200); assert.strictEqual((await fetch(base + '/board.js')).status, 200); assert.strictEqual((await fetch(base + '/chalk.js')).status, 200); ok('skrypty klienta są serwowane z własnego serwera (zgodnie z CSP)');

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
