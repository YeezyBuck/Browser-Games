'use strict';
// Testy silnika gry "Kropki": node engine.test.js
const assert = require('assert');
const E = require('./engine');
const { RED, BLUE } = E;

let n = 0;
const ok = m => console.log('  ok', ++n, m);
const idx = (g, x, y) => y * g.w + x;

// kolejno stawia kropki (silnik nie pilnuje kolejki – to robi serwer); zwraca ostatni wynik
function play(g, moves) {
  let res;
  for (const [c, x, y] of moves) {
    res = E.tryMove(g, c, x, y);
    assert.ok(res.ok, `ruch ${c} (${x},${y}) powinien być legalny, a jest: ${res.error}`);
    g = res.game;
  }
  return { g, res };
}

// 1) rombowa pętla 4 kropek (sąsiedztwo po przekątnej) przejmuje kropkę w środku
{
  let { g } = play(E.createGame(10, 10), [[BLUE, 5, 5], [RED, 5, 4], [RED, 6, 5], [RED, 5, 6]]);
  assert.strictEqual(g.score[RED], 0); assert.strictEqual(g.dead[idx(g, 5, 5)], 0);
  const r = play(g, [[RED, 4, 5]]);
  assert.deepStrictEqual(r.res.captured, [idx(g, 5, 5)]);
  assert.strictEqual(r.g.score[RED], 1); assert.strictEqual(r.g.dead[idx(g, 5, 5)], 1);
  ok('romb z 4 kropek przejmuje kropkę przeciwnika (+1 punkt)');
}

// 2) luka w pętli = brak przejęcia
{
  const { g } = play(E.createGame(10, 10), [[BLUE, 5, 5], [RED, 5, 4], [RED, 6, 5], [RED, 5, 6], [RED, 3, 5]]);
  assert.strictEqual(g.score[RED], 0); assert.strictEqual(g.dead[idx(g, 5, 5)], 0);
  ok('luka w pętli: kropka nie jest przejmowana');
}

// 3) większy obszar: przejęcie blokuje wolne pola w środku
{
  const ring = [];
  for (let k = 2; k <= 6; k++) { ring.push([RED, k, 2], [RED, k, 6]); if (k > 2 && k < 6) ring.push([RED, 2, k], [RED, 6, k]); }
  const lastIdx = ring.findIndex(m => m[1] === 6 && m[2] === 5), last = ring.splice(lastIdx, 1)[0];   // brakujące ogniwo z boku (róg nie jest potrzebny)
  let { g } = play(E.createGame(10, 10), [[BLUE, 4, 4], ...ring]);
  assert.strictEqual(g.score[RED], 0);
  const r = play(g, [last]);
  assert.strictEqual(r.g.score[RED], 1);
  let lockedCount = 0; for (let i = 0; i < r.g.locked.length; i++) if (r.g.locked[i] === RED) lockedCount++;
  assert.strictEqual(lockedCount, 8);                                              // 3x3 wnętrze bez przejętej kropki
  assert.strictEqual(E.tryMove(r.g, BLUE, 3, 3).error, 'locked'); assert.strictEqual(E.tryMove(r.g, RED, 5, 5).error, 'locked');
  ok('duża pętla przejmuje kropkę i blokuje 8 wolnych pól w środku');
}

// 4) brzeg planszy nie jest ścianą
{
  const { g } = play(E.createGame(6, 6), [[BLUE, 0, 0], [RED, 1, 0], [RED, 0, 1]]);
  assert.strictEqual(g.score[RED], 0); assert.strictEqual(g.dead[idx(g, 0, 0)], 0);
  ok('brzeg planszy nie służy za ścianę (róg nie da się otoczyć dwiema kropkami)');
}

// 5) samobójstwo: kropka w polu już otoczonym przez przeciwnika jest zabroniona
{
  const { g } = play(E.createGame(10, 10), [[RED, 5, 4], [RED, 6, 5], [RED, 5, 6], [RED, 4, 5]]);
  assert.strictEqual(E.tryMove(g, BLUE, 5, 5).error, 'suicide');
  assert.strictEqual(E.tryMove(g, RED, 5, 5).ok, true);                           // własna kropka we własnej pętli jest dozwolona
  ok('zakaz samobójstwa: kropka w polu otoczonym przez przeciwnika jest nielegalna');
}

// 6) wyjątek: ruch w otoczone pole jest legalny, jeśli sam przejmuje i rozrywa otoczenie
{
  const base = [[RED, 5, 4], [RED, 6, 5], [RED, 5, 6], [RED, 4, 5], [BLUE, 6, 4], [BLUE, 4, 4]];
  let { g } = play(E.createGame(12, 12), base);
  assert.strictEqual(E.tryMove(g, BLUE, 5, 5).error, 'suicide');                  // bez trzeciej kropki wciąż samobójstwo
  g = play(g, [[BLUE, 5, 3]]).g;
  const r = E.tryMove(g, BLUE, 5, 5);
  assert.ok(r.ok, 'ruch przejmujący powinien być legalny'); assert.deepStrictEqual(r.captured, [idx(g, 5, 4)]);
  assert.strictEqual(r.game.score[BLUE], 1); assert.strictEqual(r.game.dead[idx(g, 5, 4)], 1);
  ok('wyjątek od samobójstwa: ruch, który przejmuje i rozrywa otoczenie, jest legalny');
}

// 7) zajęte i poza planszą
{
  const { g } = play(E.createGame(5, 5), [[RED, 2, 2]]);
  assert.strictEqual(E.tryMove(g, BLUE, 2, 2).error, 'occupied');
  for (const [x, y] of [[-1, 0], [0, -1], [5, 0], [0, 5], [1.5, 1], ['1', 1], [NaN, 0]]) assert.strictEqual(E.tryMove(g, RED, x, y).error, 'out');
  ok('zajęte pole i współrzędne poza planszą/nieprawidłowe są odrzucane');
}

// 8) hasMove i wynik
{
  const g = E.createGame(3, 3);
  assert.strictEqual(E.hasMove(g, RED), true);
  for (let i = 0; i < 9; i++) g.owner[i] = RED;
  assert.strictEqual(E.hasMove(g, BLUE), false); ok('pełna plansza: brak ruchów');
  const g2 = E.createGame(4, 4); g2.score = [0, 3, 1]; assert.strictEqual(E.leader(g2), RED);
  g2.score = [0, 1, 4]; assert.strictEqual(E.leader(g2), BLUE); g2.score = [0, 2, 2]; assert.strictEqual(E.leader(g2), 0); ok('wynik: wygrana czerwonego, niebieskiego i remis');
}

// 9) render do tekstu
{
  let { g } = play(E.createGame(4, 3), [[RED, 0, 0], [BLUE, 3, 2]]);
  g.dead[idx(g, 0, 0)] = 1; g.locked[idx(g, 1, 1)] = BLUE;
  const r = E.render(g);
  assert.deepStrictEqual(r.board, ['R...', '....', '...b']); assert.deepStrictEqual(r.terr, ['....', '.b..', '....']);
  ok('render: żywe/przejęte kropki i terytorium jako tekst');
}

// 10) losowe partie: niezmienniki i zgodność hasMove z pełnym przeglądem
{
  let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const legalAll = (g, c) => { const out = []; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (E.tryMove(g, c, x, y).ok) out.push([x, y]); return out; };
  let games = 0, totalMoves = 0, captures = 0;
  for (let t = 0; t < 12; t++) {
    let g = E.createGame(8, 8), c = RED;
    for (let step = 0; step < 200; step++) {
      const moves = legalAll(g, c);
      assert.strictEqual(E.hasMove(g, c), moves.length > 0, 'hasMove niezgodne z przeglądem');
      if (!moves.length) break;
      const [x, y] = moves[Math.floor(rnd() * moves.length)];
      const r = E.tryMove(g, c, x, y); assert.ok(r.ok);
      g = r.game; totalMoves++; if (r.captured.length) captures++;
      // niezmienniki
      let dead = 0; for (let i = 0; i < g.dead.length; i++) dead += g.dead[i];
      assert.strictEqual(g.score[RED] + g.score[BLUE], dead, 'suma punktów = liczba przejętych kropek');
      for (const col of [RED, BLUE]) {
        const e = E.enclosed(g, E.other(col));
        for (let i = 0; i < g.owner.length; i++) if (g.owner[i] === col && !g.dead[i]) assert.ok(e.comp[i] < 0, 'żywa kropka nie może być otoczona przez przeciwnika');
      }
      for (let i = 0; i < g.locked.length; i++) if (g.locked[i]) assert.strictEqual(g.owner[i], 0, 'zablokowane pole musi być puste');
      c = E.other(c);
    }
    games++;
  }
  ok(`12 losowych partii (${totalMoves} ruchów, ${captures} przejęć): niezmienniki i hasMove zgodne z pełnym przeglądem`);
}

console.log('\nTesty silnika przeszły (' + n + ').');
