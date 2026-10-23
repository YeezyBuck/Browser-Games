'use strict';
// Testy komputera-przeciwnika (bot.js): legalność ruchów, szybkość, zasada "bezpieczne miejsce" i siła (trudny kontra łatwy). Uruchom: node bot.test.js
// Partie bot kontra bot używają ustalonych seedów, więc wynik jest powtarzalny.
const assert = require('assert');
const E = require('./public/engine');
const Bot = require('./bot');
const { P } = E;

let n = 0;
const ok = m => console.log('  ok', ++n, m);

// Jedna partia bot kontra bot według reguł serwera. levels[seat]; zwraca wynik i statystyki.
function game(seed, levels, fieldKey, starter, rng, onMove) {
  const shapes = E.makeShapes(seed), dims = P.fields[fieldKey];
  let field = [], hands = [[...Array(10).keys()], [...Array(10).keys()].map(i => i + 10)], turn = starter, taken = [0, 0], maxMs = 0, bad = 0;
  for (let t = 0; t < 300; t++) {
    const t0 = Date.now(), mv = Bot.chooseMove({ shapes, field, dims, hand: hands[turn], oppHand: hands[1 - turn] }, levels[turn], rng), ms = Date.now() - t0;
    maxMs = Math.max(maxMs, ms);
    if (!mv || !hands[turn].includes(mv.id) || !E.validPlacement(shapes, field, dims, mv.id, mv.x, mv.y, mv.a)) { bad++; return { bad, turns: t }; }
    if (onMove) onMove({ shapes, field, dims, mv, turn, t, hands, level: levels[turn] });
    const res = E.playTurn(shapes, field, dims, Object.assign({ owner: turn }, mv));
    hands[turn] = [...new Set(hands[turn].filter(i => i !== mv.id).concat(res.returned))]; hands[1 - turn] = hands[1 - turn].filter(i => !res.returned.includes(i));
    field = res.final; taken[turn]++;
    const byHand = () => (hands[0].length < hands[1].length ? 0 : hands[0].length > hands[1].length ? 1 : null);
    if (hands[turn].length === 0) return { winner: turn, turns: t + 1, bad, maxMs };
    if (taken[0] >= P.maxTurns && taken[1] >= P.maxTurns) return { winner: byHand(), turns: t + 1, limit: true, bad, maxMs };
    if (!E.hasPlacement(shapes, field, dims, hands[1 - turn])) return { winner: byHand(), turns: t + 1, blocked: true, bad, maxMs };
    turn = 1 - turn;
  }
  return { winner: null, turns: 300, bad, maxMs };
}
function match(fieldKey, nGames, seed0, rngSeed) {
  const rng = E.mulberry32(rngSeed); let hardWins = 0, finished = 0, bad = 0, maxMs = 0, turns = 0;
  for (let g = 0; g < nGames; g++) {
    const seat = g % 2, levels = seat === 0 ? ['hard', 'easy'] : ['easy', 'hard'], r = game(seed0 + g, levels, fieldKey, (g >> 1) % 2, rng);
    bad += r.bad; maxMs = Math.max(maxMs, r.maxMs || 0); turns += r.turns; if (r.winner !== undefined && r.turns < 300) finished++; if (r.winner === seat) hardWins++;
  }
  return { hardWins, finished, bad, maxMs, avgTurns: turns / nGames };
}

// ---------- legalność ----------
{
  const rng = E.mulberry32(5);
  let bad = 0, decisions = 0, maxMs = { easy: 0, hard: 0 };
  for (const level of ['easy', 'hard']) for (let g = 0; g < 4; g++) {
    const r = game(900 + g, level === 'hard' ? ['hard', 'hard'] : ['easy', 'easy'], ['s', 'm', 'l', 'm'][g], g % 2, rng, ctx => { decisions++; });
    bad += r.bad; maxMs[level] = Math.max(maxMs[level], r.maxMs || 0);
    assert.ok(r.turns < 300 && r.winner !== undefined, 'partia się nie skończyła');
  }
  assert.strictEqual(bad, 0); ok(`bot zawsze wybiera legalny ruch (magnes z jego ręki, miejsce wolne i w polu): ${decisions} decyzji w 8 pełnych partiach (łatwy i trudny)`);
  assert.ok(maxMs.hard < 2500 && maxMs.easy < 1500); ok(`szybkość: najdłuższa decyzja trudnego ${maxMs.hard} ms, łatwego ${maxMs.easy} ms (serwer nie zawiesza się)`);
}

// ---------- zasada bezpiecznego miejsca ----------
{
  const rng = E.mulberry32(21); let checked = 0, unsafe = 0;
  for (let g = 0; g < 3; g++) game(300 + g, ['hard', 'hard'], 'm', g % 2, rng, ctx => {
    if (ctx.t >= 8) return;                                                                          // na początku partii bezpieczne miejsca są zawsze
    checked++; if (E.preview(ctx.shapes, ctx.field, ctx.dims, ctx.mv.id, ctx.mv.x, ctx.mv.y, ctx.mv.a).moves) unsafe++;
  });
  assert.ok(checked >= 20 && unsafe === 0); ok(`trudny bot na początku partii zawsze stawia magnes w bezpiecznym miejscu (${checked} ruchów, 0 ryzykownych)`);
}
{
  // gdy bezpiecznych miejsc nie ma, bot nadal zwraca dozwolony ruch (ryzykowny), a nie zawiesza się
  const shapes = E.makeShapes(8), dims = [160, 110];
  const field = []; for (let i = 0; i < 4; i++) { const p = { id: i, x: 28 + (i % 2) * 52 + 14, y: 24 + Math.floor(i / 2) * 50, a: i * 1.3 }; if (E.validPlacement(shapes, field, dims, p.id, p.x, p.y, p.a)) field.push(p); }
  const mv = Bot.chooseMove({ shapes, field, dims, hand: [14, 15], oppHand: [16, 17] }, 'hard', E.mulberry32(3));
  assert.ok(mv === null || E.validPlacement(shapes, field, dims, mv.id, mv.x, mv.y, mv.a)); ok('na ciasnym polu bot zwraca dozwolony ruch albo null (nie zawiesza się i nie oszukuje)');
}

// ---------- siła ----------
{
  const a = match('m', 10, 100, 11), s = match('s', 6, 200, 12), l = match('l', 6, 300, 13);
  assert.strictEqual(a.bad + s.bad + l.bad, 0); assert.ok(a.finished === 10 && s.finished === 6 && l.finished === 6, 'nie wszystkie partie się skończyły');
  assert.ok(a.hardWins >= 9, 'trudny wygrał ' + a.hardWins + '/10'); ok(`pole średnie: trudny wygrywa z łatwym ${a.hardWins}/10, partie kończą się (śr. ${a.avgTurns.toFixed(1)} ruchów)`);
  assert.ok(s.hardWins >= 5 && l.hardWins >= 5, `małe ${s.hardWins}/6, duże ${l.hardWins}/6`); ok(`pole małe: ${s.hardWins}/6, duże: ${l.hardWins}/6 wygranych trudnego`);
}
{
  const r1 = game(77, ['hard', 'easy'], 'm', 0, E.mulberry32(4)), r2 = game(77, ['hard', 'easy'], 'm', 0, E.mulberry32(4));
  delete r1.maxMs; delete r2.maxMs; assert.deepStrictEqual(r1, r2); ok('decyzje bota są deterministyczne przy tym samym ziarnie losowości (powtarzalne testy)');
}

console.log('\nWszystkie testy bota przeszły (' + n + ').');
