'use strict';
// Testy komputera-przeciwnika (bot.js): legalność ruchów, szybkość, branie przejęcia, obrona przed przejęciem, siła (trudny kontra łatwy)
// i odpowiedź na propozycję zakończenia gry. Uruchom: node bot.test.js. Partie bot kontra bot mają ustalone ziarno losowości.
const assert = require('assert');
const E = require('./engine');
const Bot = require('./bot');

let n = 0;
const ok = m => console.log('  ok', ++n, m);
function mulberry32(a) { return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Budowanie pozycji: lista ruchów [kolor, x, y] zagranych po kolei (muszą być legalne).
function position(w, h, moves) { let g = E.createGame(w, h); for (const [c, x, y] of moves) { const r = E.tryMove(g, c, x, y); assert.ok(r.ok, `ruch ${c},${x},${y}: ${r.error}`); g = r.game; } return g; }

// Partia bot kontra bot (czerwony zaczyna), maksymalnie `cap` ruchów łącznie. levels[seat]; seat czerwonego to `redSeat`.
function game(levels, size, cap, redSeat, rng) {
  let g = E.createGame(size[0], size[1]), color = E.RED, maxMs = 0, bad = 0, moves = 0;
  const seatOf = { [E.RED]: redSeat, [E.BLUE]: 1 - redSeat };
  for (let m = 0; m < cap; m++) {
    const t0 = Date.now(), mv = Bot.chooseMove(g, color, levels[seatOf[color]], rng); maxMs = Math.max(maxMs, Date.now() - t0);
    if (!mv) break;
    const r = E.tryMove(g, color, mv.x, mv.y); if (!r.ok) { bad++; break; }
    g = r.game; moves++; color = E.other(color); if (!E.hasMove(g, color)) break;
  }
  return { g, seatOf, maxMs, bad, moves };
}

// ---------- legalność i szybkość ----------
{
  const rng = mulberry32(3); let bad = 0, maxMs = 0, decisions = 0;
  for (const level of ['easy', 'hard']) for (let k = 0; k < 4; k++) {
    const size = [[15, 15], [20, 20], [30, 20], [15, 15]][k], r = game([level, level], size, 90, k % 2, rng);
    bad += r.bad; maxMs = Math.max(maxMs, r.maxMs); decisions += r.moves;
  }
  assert.strictEqual(bad, 0); ok(`bot zawsze wybiera legalny ruch (puste, niezablokowane pole, nie samobójstwo): ${decisions} decyzji w 8 partiach (łatwy i trudny, 3 rozmiary planszy)`);
  assert.ok(maxMs < 800); ok(`szybkość: najdłuższa decyzja ${maxMs} ms (serwer nie zawiesza się)`);
  const g0 = E.createGame(15, 15), first = Bot.chooseMove(g0, E.RED, 'hard', rng); assert.ok(first && E.tryMove(g0, E.RED, first.x, first.y).ok && Math.abs(first.x - 7) <= 3 && Math.abs(first.y - 7) <= 3); ok('na pustej planszy bot zaczyna w okolicy środka');
}

// ---------- przejęcie ----------
{
  // niebieska kropka (5,5) otoczona z trzech stron: czerwony zamyka romb w (4,5)
  const g = position(15, 15, [[E.RED, 5, 4], [E.BLUE, 5, 5], [E.RED, 6, 5], [E.BLUE, 1, 1], [E.RED, 5, 6], [E.BLUE, 1, 3]]);
  const mv = Bot.chooseMove(g, E.RED, 'hard', mulberry32(1)); assert.deepStrictEqual(mv, { x: 4, y: 5 });
  const r = E.tryMove(g, E.RED, mv.x, mv.y); assert.strictEqual(r.captured.length, 1); ok('trudny bot zamyka romb i przejmuje kropkę przeciwnika (gdy jest taka możliwość)');
  let took = 0; for (let i = 0; i < 40; i++) { const m = Bot.chooseMove(g, E.RED, 'easy', mulberry32(100 + i)); if (m.x === 4 && m.y === 5) took++; }
  assert.ok(took >= 28 && took <= 40); ok(`łatwy bot też zwykle bierze przejęcie (${took}/40, ale nie zawsze: czasem je przeoczy)`);
}

// ---------- obrona ----------
{
  // czerwona kropka (5,5) otoczona z trzech stron przez niebieskich: niebieski zamknąłby romb w (4,5); bot (czerwony) zajmuje to pole
  const g = position(15, 15, [[E.RED, 5, 5], [E.BLUE, 5, 4], [E.RED, 1, 1], [E.BLUE, 6, 5], [E.RED, 1, 3], [E.BLUE, 5, 6]]);
  assert.strictEqual(E.tryMove(g, E.BLUE, 4, 5).captured.length, 1);
  const mv = Bot.chooseMove(g, E.RED, 'hard', mulberry32(1)); assert.deepStrictEqual(mv, { x: 4, y: 5 }); ok('trudny bot zagradza pole, w którym przeciwnik przejąłby jego kropkę (obrona)');
  let defended = 0; for (let i = 0; i < 40; i++) { const m = Bot.chooseMove(g, E.RED, 'easy', mulberry32(300 + i)); if (m.x === 4 && m.y === 5) defended++; }
  assert.ok(defended <= 12); ok(`łatwy bot rzadko się broni (${defended}/40): to wyraźna słabość tego poziomu`);
}

// ---------- siła ----------
{
  let hardWins = 0, M = 12, diff = 0;
  const rng = mulberry32(5);
  for (let i = 0; i < M; i++) {
    const hardSeat = i % 2, levels = hardSeat === 0 ? ['hard', 'easy'] : ['easy', 'hard'], r = game(levels, i < 8 ? [15, 15] : [20, 20], i < 8 ? 110 : 140, (i >> 1) % 2, rng);
    assert.strictEqual(r.bad, 0);
    const hardColor = r.seatOf[E.RED] === hardSeat ? E.RED : E.BLUE, a = r.g.score[hardColor], b = r.g.score[E.other(hardColor)];
    if (a > b) hardWins++; diff += a - b;
  }
  assert.ok(hardWins >= 11, 'trudny wygrał ' + hardWins + '/' + M); ok(`trudny wygrywa z łatwym ${hardWins}/${M} partii (średnio +${(diff / M).toFixed(1)} przejętych kropek)`);
  const r1 = game(['hard', 'easy'], [15, 15], 60, 0, mulberry32(8)), r2 = game(['hard', 'easy'], [15, 15], 60, 0, mulberry32(8));
  assert.deepStrictEqual([...r1.g.owner], [...r2.g.owner]); ok('decyzje bota są deterministyczne przy tym samym ziarnie losowości');
}

// ---------- propozycja zakończenia ----------
{
  const g = E.createGame(15, 15); g.score[E.RED] = 3; g.score[E.BLUE] = 1;
  assert.strictEqual(Bot.answerOffer(g, E.RED), true); assert.strictEqual(Bot.answerOffer(g, E.BLUE), false);
  g.score[E.BLUE] = 3; assert.strictEqual(Bot.answerOffer(g, E.BLUE), true); ok('bot zgadza się na zakończenie, gdy nie przegrywa (prowadzi albo remisuje), a odmawia, gdy przegrywa');
}

console.log('\nWszystkie testy bota przeszły (' + n + ').');
