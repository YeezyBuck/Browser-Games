'use strict';
// Testy komputera-przeciwnika (bot.js): flota zgodna z regułami, legalne strzały bez powtórek, uczciwość (bot nie zna floty przeciwnika)
// i siła (trudny kontra łatwy). Uruchom: node bot.test.js. Wyniki są powtarzalne (ustalone ziarno losowości).
const assert = require('assert');
const Bot = require('./bot');
const { SIZE } = Bot;

let n = 0;
const ok = m => console.log('  ok', ++n, m);
function mulberry32(a) { return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const key = (x, y) => x + ',' + y;
const cellsOf = s => Array.from({ length: s.len }, (_, k) => [s.x + (s.horiz ? k : 0), s.y + (s.horiz ? 0 : k)]);

function build(fleet) { const ships = fleet.map(cellsOf), cell = new Map(); ships.forEach((c, i) => c.forEach(([x, y]) => cell.set(key(x, y), i))); return { ships, cell, hit: new Set(), shots: [], fired: new Set() }; }
const isSunk = (target, c) => c.every(([x, y]) => target.hit.has(key(x, y)));
const sunkOf = target => target.ships.filter(c => isSunk(target, c));
function fire(side, target, x, y) {
  const i = target.cell.get(key(x, y)); side.fired.add(key(x, y));
  if (i === undefined) { side.shots.push({ x, y, result: 'miss' }); return 'miss'; }
  target.hit.add(key(x, y)); const s = isSunk(target, target.ships[i]); side.shots.push({ x, y, result: s ? 'sunk' : 'hit' }); return s ? 'sunk' : 'hit';
}
const allSunk = target => target.ships.every(c => isSunk(target, c));

// ---------- flota ----------
{
  const rng = mulberry32(1); let bad = 0;
  for (let i = 0; i < 300; i++) {
    const fleet = Bot.makeFleet(rng), counts = {}, occ = new Map();
    if (fleet.length !== 10) bad++;
    fleet.forEach((s, idx) => {
      counts[s.len] = (counts[s.len] || 0) + 1;
      if (typeof s.horiz !== 'boolean' || !Number.isInteger(s.x) || !Number.isInteger(s.y)) bad++;
      for (const [x, y] of cellsOf(s)) { if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) bad++; occ.set(key(x, y), idx); }
    });
    for (const len of [4, 3, 2, 1]) if (counts[len] !== ({ 4: 1, 3: 2, 2: 3, 1: 4 })[len]) bad++;
    if (occ.size !== 20) bad++;                                                                  // brak nakładania
    for (const [k, idx] of occ) { const [x, y] = k.split(',').map(Number); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const j = occ.get(key(x + dx, y + dy)); if (j !== undefined && j !== idx) bad++; } }
  }
  assert.strictEqual(bad, 0); ok('300 losowych flot bota: 1×4, 2×3, 3×2, 4×1, w planszy, bez nakładania i bez stykania się (także rogami)');
  const s = new Set(); for (let i = 0; i < 40; i++) s.add(JSON.stringify(Bot.makeFleet(rng))); assert.ok(s.size >= 39); ok('floty są losowe (40 różnych)');
}

// ---------- strzały ----------
function solo(level, rng) {
  const side = build(Bot.makeFleet(rng)), target = build(Bot.makeFleet(rng)); let nShots = 0, repeats = 0, invalid = 0;
  while (!allSunk(target)) {
    const m = Bot.chooseShot({ shots: side.shots, sunk: sunkOf(target) }, level, rng);
    if (!m || !Number.isInteger(m.x) || !Number.isInteger(m.y) || m.x < 0 || m.y < 0 || m.x >= SIZE || m.y >= SIZE) { invalid++; break; }
    if (side.fired.has(key(m.x, m.y))) { repeats++; break; }
    fire(side, target, m.x, m.y); nShots++;
    if (nShots > 100) break;
  }
  return { nShots, repeats, invalid };
}
{
  const rng = mulberry32(3); const res = { easy: [], hard: [] };
  for (const level of ['easy', 'hard']) for (let i = 0; i < 200; i++) res[level].push(solo(level, rng));
  for (const level of ['easy', 'hard']) assert.ok(res[level].every(r => r.repeats === 0 && r.invalid === 0 && r.nShots <= 100)); ok('bot nigdy nie strzela poza planszę ani w to samo pole dwa razy, a każda flota w końcu tonie (400 partii solo)');
  const avg = l => res[l].reduce((s, r) => s + r.nShots, 0) / res[l].length;
  assert.ok(avg('hard') < 62 && avg('easy') > 62 && avg('hard') < avg('easy') - 8); ok(`trudny topi flotę średnio w ${avg('hard').toFixed(1)} strzałach, łatwy w ${avg('easy').toFixed(1)} (łatwy jest wyraźnie słabszy)`);
}

// ---------- uczciwość ----------
{
  // bot dostaje wyłącznie wyniki swoich strzałów i zatopione okręty: dwie różne floty z tymi samymi wynikami dają ten sam strzał
  const shots = [{ x: 4, y: 4, result: 'miss' }, { x: 5, y: 5, result: 'hit' }, { x: 0, y: 9, result: 'miss' }];
  const a = Bot.chooseShot({ shots, sunk: [] }, 'hard', mulberry32(9)), b = Bot.chooseShot({ shots, sunk: [], fleetOfOpponent: 'tajne', ships: [[1, 1]] }, 'hard', mulberry32(9));
  assert.deepStrictEqual(a, b); ok('strzał zależy tylko od wyników strzałów i zatopionych okrętów (dodatkowe dane o flocie przeciwnika są ignorowane)');
  const src = require('fs').readFileSync(require('path').join(__dirname, 'bot.js'), 'utf8');
  assert.ok(!/\.ships|cellMap|received/.test(src.replace(/\/\/.*$/gm, ''))); ok('kod bota nie sięga do ustawienia floty przeciwnika (brak ships/cellMap/received)');
  // dobijanie: po trafieniu bot trafia w sąsiednie pole (trudny: zawsze w pobliżu trafienia)
  let near = 0, total = 0, rng = mulberry32(5);
  for (let i = 0; i < 60; i++) {
    const x = 2 + Math.floor(rng() * 6), y = 2 + Math.floor(rng() * 6), m = Bot.chooseShot({ shots: [{ x, y, result: 'hit' }], sunk: [] }, 'hard', rng);
    total++; if (Math.abs(m.x - x) + Math.abs(m.y - y) === 1) near++;
  }
  assert.strictEqual(near, total); ok('trudny po trafieniu zawsze strzela w sąsiednie pole (dobija okręt)');
  // zatopiony okręt: pola wokół niego są puste, więc bot tam nie strzela
  const sunkShip = [[3, 3], [4, 3]], sh = [{ x: 3, y: 3, result: 'hit' }, { x: 4, y: 3, result: 'sunk' }];
  let around = 0; for (let i = 0; i < 40; i++) { const m = Bot.chooseShot({ shots: sh, sunk: [sunkShip] }, 'hard', rng); if (m.x >= 2 && m.x <= 5 && m.y >= 2 && m.y <= 4) around++; }
  assert.strictEqual(around, 0); ok('po zatopieniu okrętu trudny nie marnuje strzałów na pola przylegające do niego (okręty się nie stykają)');
}

// ---------- siła w całych partiach ----------
{
  const rng = mulberry32(7); let hardWins = 0, M = 200, unfinished = 0;
  for (let g = 0; g < M; g++) {
    const sides = [build(Bot.makeFleet(rng)), build(Bot.makeFleet(rng))], lv = g % 2 === 0 ? ['hard', 'easy'] : ['easy', 'hard'];
    let turn = (g >> 1) % 2, winner = -1;
    for (let k = 0; k < 400 && winner < 0; k++) {
      const me = sides[turn], opp = sides[1 - turn], m = Bot.chooseShot({ shots: me.shots, sunk: sunkOf(opp) }, lv[turn], rng);
      fire(me, opp, m.x, m.y); if (allSunk(opp)) winner = turn; turn = 1 - turn;
    }
    if (winner < 0) unfinished++; else if (winner === lv.indexOf('hard')) hardWins++;
  }
  assert.strictEqual(unfinished, 0); assert.ok(hardWins >= 170, 'trudny wygrał ' + hardWins + '/' + M); ok(`trudny wygrywa z łatwym ${hardWins}/${M} partii, wszystkie się kończą`);
  const r1 = solo('hard', mulberry32(11)), r2 = solo('hard', mulberry32(11)); assert.deepStrictEqual(r1, r2); ok('decyzje bota są deterministyczne przy tym samym ziarnie losowości');
}

console.log('\nWszystkie testy bota przeszły (' + n + ').');
