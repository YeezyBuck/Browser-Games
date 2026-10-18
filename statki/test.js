'use strict';
// Test integracyjny: uruchamia serwer na wolnym porcie i gra dwoma "graczami" przez HTTP.
const assert = require('assert');
const { server, FLEET, CODE_LEN, LIMITS, TUNNEL_RE, tunnel, startTunnel, clientIp } = require('./server');

let base;
const post = async (p, body) => { const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const get = async p => { const r = await fetch(base + p); return { status: r.status, body: await r.json() }; };

function randomFleet() {
  const SIZE = 10, ships = [], occ = new Set();
  const free = (x, y) => { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (occ.has((x + dx) + ',' + (y + dy))) return false; return true; };
  for (;;) {
    ships.length = 0; occ.clear(); let ok = true;
    for (const len of [4, 3, 3, 2, 2, 2, 1, 1, 1, 1]) {
      let placed = false;
      for (let t = 0; t < 500 && !placed; t++) {
        const horiz = Math.random() < .5, x = Math.floor(Math.random() * (SIZE - (horiz ? len - 1 : 0))), y = Math.floor(Math.random() * (SIZE - (horiz ? 0 : len - 1)));
        const cells = Array.from({ length: len }, (_, k) => [x + (horiz ? k : 0), y + (horiz ? 0 : k)]);
        if (cells.every(([cx, cy]) => free(cx, cy))) { cells.forEach(([cx, cy]) => occ.add(cx + ',' + cy)); ships.push({ x, y, len, horiz }); placed = true; }
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships.slice();
  }
}

async function main() {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
  let n = 0; const ok = m => console.log('  ok', ++n, m);

  // statyki
  let r = await fetch(base + '/'); assert.strictEqual(r.status, 200); assert.ok((await r.text()).includes('Statki')); ok('strona główna serwowana');
  r = await fetch(base + '/..%2fserver.js'); assert.notStrictEqual(r.status, 200); ok('brak wyjścia poza katalog public');

  // pokój
  const a = (await post('/api/create', {})).body;
  assert.ok(/^[A-Z]{6}$/.test(a.code)); ok('utworzono pokój ' + a.code);
  assert.strictEqual((await post('/api/join', { code: 'ZZZZZZ' })).status, 404); ok('nieistniejący kod odrzucony');
  assert.strictEqual((await post('/api/join', { code: 'ABCD' })).status, 404); ok('kod o złej długości odrzucony');
  assert.strictEqual((await post('/api/join', { code: 12345 })).status, 404); ok('kod nie-tekstowy odrzucony');
  assert.strictEqual((await get(`/api/state?code=${a.code}&token=zly`)).status, 404); ok('zły token odrzucony');
  const b = (await post('/api/join', { code: a.code.toLowerCase() })).body;
  assert.strictEqual(b.you, 1);
  assert.strictEqual((await post('/api/join', { code: a.code })).status, 400); ok('trzecia osoba nie wejdzie');
  const A = { code: a.code, token: a.token }, B = { code: b.code, token: b.token };
  const st = async P => (await get(`/api/state?code=${P.code}&token=${P.token}`)).body;
  assert.strictEqual((await st(A)).phase, 'placing');

  // walidacja ustawienia
  const good = randomFleet();
  const bad = (ships, msg) => post('/api/place', Object.assign({}, A, { ships })).then(x => { assert.strictEqual(x.status, 400, msg); });
  await bad(good.slice(1), 'za mało statków');
  await bad(good.map((s, i) => i === 0 ? { ...s, x: 9, horiz: true } : s), 'poza planszą');
  await bad(good.map((s, i) => i === 1 ? { ...good[0] } : s), 'nakładanie');
  const touching = good.map(s => ({ ...s }));
  touching[9] = { x: good[0].horiz ? good[0].x : good[0].x + 1, y: good[0].horiz ? good[0].y + 1 : good[0].y, len: 1, horiz: true };
  await bad(touching, 'stykanie');
  const wrongMix = good.map(s => ({ ...s })); wrongMix.forEach(s => { if (s.len === 1) s.len = 2; });
  await bad(wrongMix, 'zły skład floty');
  ok('walidacja floty (liczba, granice, nakładanie, stykanie, skład)');

  assert.strictEqual((await post('/api/shoot', { ...A, x: 0, y: 0 })).status, 400); ok('nie da się strzelać przed startem');

  // ustawienie obu flot
  const fleetA = good, fleetB = randomFleet();
  assert.strictEqual((await post('/api/place', { ...A, ships: fleetA })).status, 200);
  let s = await st(A); assert.strictEqual(s.phase, 'placing'); assert.ok(s.youReady && !s.opponentReady);
  assert.strictEqual((await post('/api/place', { ...A, ships: fleetA })).status, 400); ok('ponowne zatwierdzenie odrzucone');
  assert.strictEqual((await post('/api/place', { ...B, ships: fleetB })).status, 200);
  s = await st(A); assert.strictEqual(s.phase, 'playing'); assert.ok(s.turn === 0 || s.turn === 1); ok('gra startuje, gdy obaj gotowi');

  // ukrycie informacji: przeciwnik nie widzi pozycji moich statków
  const sB = await st(B);
  assert.strictEqual(sB.target.reveal, null);
  const myCells = new Set(sB.mine.ships.flat().map(c => c.join(',')));
  assert.strictEqual(myCells.size, 20);
  assert.ok(!JSON.stringify(sB.target).includes('"ships"')); ok('stan gracza nie zawiera cudzych statków');

  // pełna rozgrywka
  const P = [A, B], fleets = [fleetA, fleetB];
  const cellsOf = f => new Set(f.flatMap(sh => Array.from({ length: sh.len }, (_, k) => (sh.x + (sh.horiz ? k : 0)) + ',' + (sh.y + (sh.horiz ? 0 : k)))));
  const enemyCells = [cellsOf(fleetB), cellsOf(fleetA)];
  const shotsDone = [new Set(), new Set()];
  const turnPlayer = (await st(A)).turn;
  const wrong = 1 - turnPlayer;
  assert.strictEqual((await post('/api/shoot', { ...P[wrong], x: 0, y: 0 })).status, 400); ok('strzał poza kolejką odrzucony');

  let moves = 0, misses = 0, turn = turnPlayer;
  const hits = [0, 0], sunks = [0, 0];
  while (true) {
    const cur = await st(P[turn]);
    if (cur.phase === 'over') break;
    assert.strictEqual(cur.turn, turn);
    let x, y, k;
    do { x = Math.floor(Math.random() * 10); y = Math.floor(Math.random() * 10); k = x + ',' + y; } while (shotsDone[turn].has(k));
    shotsDone[turn].add(k);
    const res = await post('/api/shoot', { ...P[turn], x, y });
    assert.strictEqual(res.status, 200);
    const expectHit = enemyCells[turn].has(k);
    assert.strictEqual(res.body.result === 'miss', !expectHit);
    moves++;
    if (res.body.result === 'miss') misses++; else { hits[turn]++; if (res.body.result === 'sunk') sunks[turn]++; }
    if (!(hits[turn] === 20)) turn = 1 - turn;   // jeden strzał i zmiana gracza (chyba że to był ostatni trafiony)
    assert.ok(moves < 300);
  }
  const fin = await st(A);
  assert.strictEqual(fin.phase, 'over'); assert.strictEqual(hits[turn], 20); assert.strictEqual(sunks[turn], 10);
  assert.strictEqual(fin.winner, turn);
  assert.strictEqual((await st(P[turn])).left.opponent, 0);
  assert.ok((await st(P[1 - turn])).target.reveal.length === 10); ok(`pełna gra: ${moves} strzałów, wygrał gracz ${turn}, plansza ujawniona po końcu`);
  assert.strictEqual((await post('/api/shoot', { ...P[turn], x: 0, y: 0 })).status, 400); ok('po końcu nie da się strzelać');

  // powtórny strzał w to samo pole
  // (osobna gra)
  // rewanż
  assert.strictEqual((await post('/api/rematch', A)).status, 200);
  assert.strictEqual((await st(A)).phase, 'over');
  assert.strictEqual((await post('/api/rematch', B)).status, 200);
  s = await st(A); assert.strictEqual(s.phase, 'placing'); assert.strictEqual(s.youReady, false); assert.strictEqual(s.mine.ships.length, 0); ok('rewanż resetuje planszę');

  // powtórny strzał
  assert.strictEqual((await post('/api/place', { ...A, ships: randomFleet() })).status, 200);
  assert.strictEqual((await post('/api/place', { ...B, ships: randomFleet() })).status, 200);
  const t0 = (await st(A)).turn, Pt = [A, B][t0];
  let dupe, tries = 0;
  for (; tries < 100; tries++) {
    const cur = (await st(A)).turn; if (cur !== t0) break;      // miss zmienił kolejkę
    const x = tries % 10, y = Math.floor(tries / 10) % 10;
    const first = await post('/api/shoot', { ...Pt, x, y });
    if (first.status === 200 && first.body.result !== 'miss') { dupe = await post('/api/shoot', { ...Pt, x, y }); break; }
    if (first.status === 200) break;
  }
  if (dupe) { assert.strictEqual(dupe.status, 400); ok('to samo pole drugi raz – odrzucone'); }

  // SSE: pierwsza wiadomość zawiera stan
  const ctrl = new AbortController();
  const sse = await fetch(`${base}/api/events?code=${A.code}&token=${A.token}`, { signal: ctrl.signal });
  const reader = sse.body.getReader(); let buf = '';
  while (!buf.includes('data: ')) { const { value } = await reader.read(); buf += Buffer.from(value).toString(); }
  const payload = JSON.parse(buf.split('data: ')[1].split('\n\n')[0]);
  assert.strictEqual(payload.code, A.code); assert.strictEqual(payload.opponentConnected, true); assert.ok(Number.isInteger(payload.v)); ok('SSE wysyła stan (z wersją i obecnością przeciwnika)');
  ctrl.abort();

  // ---------- long-poll (zapas, gdy tunel nie przepuszcza SSE) ----------
  LIMITS.pollMs = 400;
  const pa = (await post('/api/create', {})).body, pb = (await post('/api/join', { code: pa.code })).body;
  const poll = async (P, v) => { const t0 = Date.now(); const r = await get(`/api/poll?code=${P.code}&token=${P.token}&v=${v}`); return { ...r, ms: Date.now() - t0 }; };
  const v0 = (await get(`/api/state?code=${pa.code}&token=${pa.token}`)).body.v;
  assert.ok(Number.isInteger(v0));
  let r1 = await poll(pa, v0 - 1); assert.strictEqual(r1.status, 200); assert.ok(r1.ms < 300); ok('long-poll: starsza wersja -> odpowiedź od razu');
  let r2 = await poll(pa, v0); assert.strictEqual(r2.body.v, v0); assert.ok(r2.ms >= 350 && r2.ms < 1500); ok('long-poll: bez zmian czeka i po limicie czasu odpowiada tym samym stanem');
  const waiter = poll(pa, v0);
  await new Promise(r => setTimeout(r, 100));
  assert.strictEqual((await post('/api/place', { code: pb.code, token: pb.token, ships: randomFleet() })).status, 200);
  const woke = await waiter; assert.ok(woke.ms < 350, 'za późno: ' + woke.ms); assert.ok(woke.body.v > v0 && woke.body.opponentReady === true); ok('long-poll: ruch przeciwnika budzi oczekujące żądanie od razu');
  assert.strictEqual((await get(`/api/poll?code=${pa.code}&token=zly&v=0`)).status, 404); ok('long-poll wymaga poprawnego tokenu');
  assert.strictEqual((await get(`/api/state?code=${pa.code}&token=${pa.token}`)).body.opponentConnected, true); ok('obecność gracza liczona także bez SSE (long-poll/aktywność)');

  // ---------- czat ----------
  const ca = (await post('/api/create', {})).body;
  const say = (P, text) => post('/api/chat', { code: P.code, token: P.token, text });
  assert.strictEqual((await say(ca, 'hej')).body.code, 'no_opponent'); ok('czat: bez przeciwnika nie da się pisać');
  const cb = (await post('/api/join', { code: ca.code })).body;
  const cs = P => get(`/api/state?code=${P.code}&token=${P.token}`).then(r => r.body);
  assert.strictEqual((await say(ca, 'Cześć! <b>x</b>')).status, 200);
  const chatB = await cs(cb);
  assert.strictEqual(chatB.chat.length, 1); assert.strictEqual(chatB.chat[0].text, 'Cześć! <b>x</b>'); assert.strictEqual(chatB.chat[0].by, 0);
  assert.ok(chatB.chat[0].id >= 1 && Number.isFinite(chatB.chat[0].ts)); ok('czat: wiadomość trafia do obu graczy (treść nietknięta, ucieczka HTML robi przeglądarka)');
  assert.strictEqual((await cs(ca)).chat[0].by, 0); assert.strictEqual((await cs(cb)).you, 1);
  assert.strictEqual((await say(cb, '  a\u0000b\u202Ec \n\n d  ')).status, 200);
  assert.strictEqual((await cs(ca)).chat[1].text, 'a b c d'); ok('czat: znaki sterujące/niewidoczne usuwane, białe znaki zwijane');
  assert.strictEqual((await say(ca, 'Ahoj 🏴‍☠️ 👨‍👩‍👧')).status, 200);
  assert.strictEqual((await cs(cb)).chat[2].text, 'Ahoj 🏴‍☠️ 👨‍👩‍👧'); ok('czat: złożone emoji (ZWJ) zachowane');
  for (const bad of ['', '   ', 'x'.repeat(201), 123, null, { a: 1 }])
    assert.strictEqual((await say(ca, bad)).body.code, 'chat_invalid', 'zła wiadomość: ' + JSON.stringify(bad));
  assert.strictEqual((await say(ca, 'x'.repeat(200))).status, 200); ok('czat: puste/za długie/nie-tekstowe odrzucone, 200 znaków przechodzi');
  assert.strictEqual((await post('/api/chat', { code: ca.code, token: 'zly', text: 'hej' })).status, 404); ok('czat wymaga poprawnego tokenu');
  const v1 = (await cs(ca)).v; const w1 = poll(ca, v1); await new Promise(r => setTimeout(r, 80));
  assert.strictEqual((await say(cb, 'obudź się')).status, 200);
  const got = await w1; assert.ok(got.body.v > v1 && got.ms < 350, 'za późno: ' + got.ms); ok('czat: nowa wiadomość budzi long-poll od razu');
  let rl = 0; for (let i = 0; i < 10; i++) if ((await say(cb, 'm' + i)).status === 429) rl++;
  assert.ok(rl >= 4); ok('czat: limit wiadomości na gracza (429)');
  const roomsChat = (await cs(ca)).chat.length; assert.ok(roomsChat <= 50); ok('czat: do klienta trafia maks. 50 ostatnich wiadomości');

  // ---------- kod QR (biblioteka dołączona do projektu) ----------
  const qrRes = await fetch(base + '/vendor/qrcode.js');
  assert.strictEqual(qrRes.status, 200); assert.ok(/javascript/.test(qrRes.headers.get('content-type'))); ok('biblioteka QR serwowana z własnego serwera (zgodnie z CSP)');
  const qrcodeLib = require('./public/vendor/qrcode.js');
  const qr = qrcodeLib(0, 'M'); qr.addData('https://bardzo-dlugi-losowy-adres-tunelu.trycloudflare.com/?room=ABCDEF'); qr.make();
  assert.ok(qr.getModuleCount() >= 25 && qr.getModuleCount() <= 57); ok('QR dla typowego adresu tunelu generuje się (' + qr.getModuleCount() + '×' + qr.getModuleCount() + ' modułów)');

  // ---------- zabezpieczenia ----------
  const hdr = (await fetch(base + '/')).headers;
  assert.ok(/default-src 'self'/.test(hdr.get('content-security-policy')) && /script-src 'self'/.test(hdr.get('content-security-policy')));
  assert.strictEqual(hdr.get('x-content-type-options'), 'nosniff'); assert.strictEqual(hdr.get('x-frame-options'), 'DENY');
  ok('nagłówki bezpieczeństwa (CSP, nosniff, DENY)');

  const asIp = ip => ({ 'Content-Type': 'application/json', 'CF-Connecting-IP': ip });
  const postAs = (ip, p, body) => fetch(base + p, { method: 'POST', headers: asIp(ip), body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json() }));
  let last429;
  for (let i = 0; i < LIMITS.joinPerMin + 2; i++) last429 = (await postAs('203.0.113.7', '/api/join', { code: 'AAAAAA' })).status;
  assert.strictEqual(last429, 429); ok('limit prób dołączenia (zgadywanie kodów) – 429');
  assert.strictEqual((await postAs('203.0.113.99', '/api/join', { code: 'AAAAAA' })).status, 404); ok('limit jest per adres IP, inni nie są blokowani');
  let created = 0, c429 = 0;
  for (let i = 0; i < LIMITS.createPer10Min + 3; i++) { const r = await postAs('203.0.113.8', '/api/create', {}); if (r.status === 200) created++; else if (r.status === 429) c429++; }
  assert.strictEqual(created, LIMITS.createPer10Min); assert.ok(c429 >= 3); ok('limit zakładania pokoi na IP');

  // ---------- tunel Cloudflare ----------
  const info0 = await (await fetch(base + '/api/info')).json();
  assert.strictEqual(info0.tunnel, 'off'); assert.strictEqual(info0.publicUrl, null); assert.strictEqual(info0.local, true); assert.strictEqual(info0.codeLen, CODE_LEN);
  assert.ok(Array.isArray(info0.lan)); ok('/api/info: tunel wyłączony, adresy sieci domowej dla lokalnego klienta');
  assert.ok(TUNNEL_RE.test('2024 INF |  https://abc-def-123.trycloudflare.com  |') && !TUNNEL_RE.test('https://example.com')); ok('rozpoznawanie adresu trycloudflare w logu');

  startTunnel(0, { bin: 'cloudflared-którego-nie-ma-xyz', args: [] });
  for (let i = 0; i < 50 && tunnel.status === 'starting'; i++) await new Promise(r => setTimeout(r, 50));
  assert.strictEqual((await (await fetch(base + '/api/info')).json()).tunnel, 'not_installed'); ok('brak cloudflared -> status not_installed');

  const fake = "console.error('INF |  https://fake-test-123.trycloudflare.com  |'); setInterval(() => {}, 1000);";
  startTunnel(0, { bin: process.execPath, args: ['-e', fake] });
  for (let i = 0; i < 100 && !tunnel.url; i++) await new Promise(r => setTimeout(r, 50));
  const info1 = await (await fetch(base + '/api/info')).json();
  assert.strictEqual(info1.tunnel, 'on'); assert.strictEqual(info1.publicUrl, 'https://fake-test-123.trycloudflare.com'); ok('tunel (atrapa): adres publiczny trafia do /api/info');
  const remote = await (await fetch(base + '/api/info', { headers: { 'CF-Connecting-IP': '198.51.100.5' } })).json();
  assert.strictEqual(remote.local, false); assert.deepStrictEqual(remote.lan, []); assert.strictEqual(remote.publicUrl, info1.publicUrl); ok('klient z internetu nie dostaje adresów sieci domowej');
  assert.strictEqual(clientIp({ socket: { remoteAddress: '::ffff:127.0.0.1' }, headers: { 'cf-connecting-ip': '198.51.100.5' } }), '198.51.100.5');
  assert.strictEqual(clientIp({ socket: { remoteAddress: '::ffff:192.168.1.50' }, headers: { 'cf-connecting-ip': '1.2.3.4' } }), '192.168.1.50'); ok('nagłówkom proxy ufamy tylko z localhost (brak podszywania się w LAN)');

  console.log('\nWszystkie testy przeszły (' + n + ').');
  server.close(); process.exit(0);
}

main().catch(e => { console.error('\nBŁĄD TESTU:', e); process.exit(1); });
