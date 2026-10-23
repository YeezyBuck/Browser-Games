'use strict';
// Testy komputera-przeciwnika (bot.js): legalność ruchów, szybkość, kończenie wyścigu i siła (trudny kontra łatwy). Uruchom: node bot.test.js
// Partie bot kontra bot używają ustalonych seedów, więc wynik jest powtarzalny.
const assert = require('assert');
const E = require('./public/engine');
const Bot = require('./bot');
const { P } = E;

let n = 0;
const ok = m => console.log('  ok', ++n, m);

// ---------- legalność i szybkość ----------
{
  const rng = E.mulberry32(77);
  let bad = 0, maxMs = { easy: 0, hard: 0 }, sumMs = { easy: 0, hard: 0 }, cnt = 0;
  for (let i = 0; i < 40; i++) {
    const track = E.generateTrack((rng() * 4294967296) >>> 0, ['s', 'm', 'l'][i % 3]);
    const caps = [E.pointAt(track, 80 + rng() * (track.sFinish - 200), (rng() - 0.5) * 60), E.pointAt(track, 80 + rng() * (track.sFinish - 200), (rng() - 0.5) * 60)].map(p => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
    if (Math.hypot(caps[0].x - caps[1].x, caps[0].y - caps[1].y) < 2 * P.capR + 2) continue;
    for (const level of ['easy', 'hard']) for (const rule of ['last', 'alternate']) {
      const seat = i % 2, t0 = Date.now(), inp = Bot.chooseShot({ track, caps, seat, rule, shots: [3, 3], lastShooter: 1 - seat }, level, rng), ms = Date.now() - t0;
      maxMs[level] = Math.max(maxMs[level], ms); sumMs[level] += ms; if (level === 'hard' && rule === 'last') cnt++;
      if (![inp.hx, inp.hy, inp.px, inp.py].every(Number.isFinite)) bad++;
      if (Math.hypot(inp.hx, inp.hy) > 1.0001) bad++;                                              // punkt uderzenia leży na kapslu
      if (Math.hypot(inp.px, inp.py) > P.maxPull + 1e-6 || Math.hypot(inp.px, inp.py) < P.minPull) bad++;
      const shot = E.shotFromInput(inp.hx, inp.hy, inp.px, inp.py); if (!shot) bad++;
    }
  }
  assert.strictEqual(bad, 0); ok('bot zawsze zwraca legalne pstryknięcie (skończone liczby, punkt na kapslu, siła w granicach, przyjmuje je silnik): 320 decyzji');
  assert.ok(maxMs.hard < 900 && maxMs.easy < 300); ok(`szybkość: trudny max ${maxMs.hard} ms, łatwy max ${maxMs.easy} ms na decyzję (serwer nie zawiesza się)`);
}

// ---------- meta w zasięgu ----------
{
  const track = E.generateTrack(31, 's'), p = E.pointAt(track, track.sFinish - 90, 0), other = E.startPositions(track)[1];
  const caps = [{ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }, other];
  const inp = Bot.chooseShot({ track, caps, seat: 0, rule: 'alternate', shots: [5, 5], lastShooter: 1 }, 'hard', E.mulberry32(1));
  const sim = E.simulate(track, caps, 0, E.shotFromInput(inp.hx, inp.hy, inp.px, inp.py));
  assert.strictEqual(sim.finishedBy, 0); ok('trudny bot, mając metę w zasięgu, ją przekracza');
}

// ---------- całe partie bot kontra bot ----------
function game(seed, levels, rule, starter, lenKey, rng) {
  const track = E.generateTrack(seed, lenKey);
  let caps = E.startPositions(track), shots = [0, 0], last = null, turn = starter;
  for (let k = 0; k < 400; k++) {
    const inp = Bot.chooseShot({ track, caps, seat: turn, rule, shots, lastShooter: last }, levels[turn], rng), shot = E.shotFromInput(inp.hx, inp.hy, inp.px, inp.py);
    assert.ok(shot, 'bot zagrał nielegalnie');
    const sim = E.simulate(track, caps, turn, shot); caps = sim.final; shots[turn]++; last = turn;
    if (sim.finishedBy !== null) return { winner: sim.finishedBy, shots, ended: true };
    if (shots[0] >= P.maxShots && shots[1] >= P.maxShots) return { winner: E.progress(track, caps[0]) > E.progress(track, caps[1]) ? 0 : 1, shots, ended: true, limit: true };
    turn = E.nextShooter(track, caps, rule, last, shots);
  }
  return { ended: false, shots };
}
function match(rule, n, seed0, rngSeed) {
  const rng = E.mulberry32(rngSeed); let hardWins = 0, ended = 0, shots = 0;
  for (let g = 0; g < n; g++) {
    const seat = g % 2, levels = seat === 0 ? ['hard', 'easy'] : ['easy', 'hard'], r = game(seed0 + g, levels, rule, (g >> 1) % 2, ['s', 'm', 'l'][g % 3], rng);
    if (r.ended) ended++; if (r.winner === seat) hardWins++; shots += r.shots[0] + r.shots[1];
  }
  return { hardWins, ended, avgShots: shots / n };
}
{
  const a = match('alternate', 16, 1000, 5);
  assert.strictEqual(a.ended, 16); assert.ok(a.hardWins >= 14, 'trudny wygrał tylko ' + a.hardWins + '/16'); ok(`zasada "na zmianę": trudny wygrywa z łatwym ${a.hardWins}/16, partie kończą się (śr. ${a.avgShots.toFixed(1)} pstryknięć)`);
  const l = match('last', 24, 3000, 5);
  assert.strictEqual(l.ended, 24); assert.ok(l.hardWins >= 17, 'trudny wygrał tylko ' + l.hardWins + '/24'); ok(`zasada "kto z tyłu": trudny wygrywa z łatwym ${l.hardWins}/24 , partie kończą się`);
  const e = match('alternate', 6, 5000, 9);
  assert.strictEqual(e.ended, 6); ok('partie łatwy kontra łatwy i trudny kontra trudny też się kończą');
}
{
  const r1 = game(77, ['hard', 'easy'], 'alternate', 0, 'm', E.mulberry32(3)), r2 = game(77, ['hard', 'easy'], 'alternate', 0, 'm', E.mulberry32(3));
  assert.deepStrictEqual(r1, r2); ok('decyzje bota są deterministyczne przy tym samym ziarnie losowości (powtarzalne testy)');
}

console.log('\nWszystkie testy bota przeszły (' + n + ').');
