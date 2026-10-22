'use strict';
// Testy silnika wyścigu kapsli: losowe tory i fizyka pstryknięcia. Uruchom: node engine.test.js
const assert = require('assert');
const E = require('./public/engine');
const { P } = E;

let n = 0;
const ok = m => console.log('  ok', ++n, m);
const rng = E.mulberry32(12345);

// ---------- tory ----------
{
  const a = E.generateTrack(777, 'm'), b = E.generateTrack(777, 'm'), c = E.generateTrack(778, 'm');
  assert.deepStrictEqual(Array.from(a.xs), Array.from(b.xs)); assert.deepStrictEqual(Array.from(a.ys), Array.from(b.ys));
  assert.notDeepStrictEqual(Array.from(a.xs), Array.from(c.xs));
  ok('ten sam seed daje ten sam tor, inny seed inny tor');
  const rebuilt = E.buildTrack(a.seed, 'm');
  assert.deepStrictEqual(Array.from(rebuilt.xs), Array.from(a.xs));
  ok('klient odtwarza tor z efektywnego seeda bez sprawdzania (buildTrack == generateTrack)');
}
{
  let bad = 0, shifted = 0, minLen = Infinity, maxLen = 0;
  const per = { s: 150, m: 150, l: 150 };
  for (const key of Object.keys(per)) for (let i = 0; i < per[key]; i++) {
    const seed = (rng() * 4294967296) >>> 0, t = E.generateTrack(seed, key);
    if (t.seed !== seed) shifted++;
    const want = E.LENGTHS[key];
    if (!(t.length > want * 0.95 && t.length < want + 500)) bad++;
    if (!E.trackClear(t)) bad++;
    for (let k = 0; k < t.n; k++) if (!Number.isFinite(t.xs[k]) || !Number.isFinite(t.ys[k])) bad++;
    minLen = Math.min(minLen, t.length / want); maxLen = Math.max(maxLen, t.length / want);
    // krok krzywej jest stały, a kąt między odcinkami łagodny (promień >= 130 przy kroku 8 => ~0.06 rad)
    let maxTurn = 0;
    for (let k = 1; k < t.n - 1; k++) {
      const a1 = Math.atan2(t.ys[k] - t.ys[k - 1], t.xs[k] - t.xs[k - 1]), a2 = Math.atan2(t.ys[k + 1] - t.ys[k], t.xs[k + 1] - t.xs[k]);
      let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d; maxTurn = Math.max(maxTurn, d);
      const step = Math.hypot(t.xs[k + 1] - t.xs[k], t.ys[k + 1] - t.ys[k]); if (Math.abs(step - P.ds) > 1e-6) bad++;
    }
    if (maxTurn > P.ds / 120) bad++;
  }
  assert.strictEqual(bad, 0);
  ok(`450 losowych torów (S/M/L): długość w normie, korytarze się nie przecinają, krzywa gładka (przesunięte seedy: ${shifted}, długość ${minLen.toFixed(2)}-${maxLen.toFixed(2)} celu)`);
}
{
  const t = E.generateTrack(42, 'm');
  for (let k = 0; k < t.n; k += 7) {
    const q = E.nearest(t, t.xs[k], t.ys[k]);
    assert.ok(q.d < 1e-6 && Math.abs(q.s - k * P.ds) < 1e-3);
  }
  const q = E.nearest(t, t.xs[100] + 10, t.ys[100] + 10, 98);
  assert.ok(q.d > 0 && Math.abs(q.s - 800) < 40); ok('nearest: punkty krzywej mają odległość 0 i właściwą długość łuku (także z podpowiedzią)');
  const [a, b] = E.startPositions(t);
  const qa = E.nearest(t, a.x, a.y), qb = E.nearest(t, b.x, b.y);
  assert.ok(Math.abs(qa.d - P.laneOff) < 0.5 && Math.abs(qb.d - P.laneOff) < 0.5 && Math.abs(qa.s - P.startS) < 1 && Math.abs(qb.s - P.startS) < 1);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 2 * P.capR + 10); ok('start: dwa kapsle obok siebie na linii startu, bez nachodzenia');
  assert.ok(t.sFinish > t.sStart + 1000 && t.sFinish < t.length - 100); ok('meta leży przed końcem toru, jest wybieg');
}

// ---------- pstryknięcie: wejście ----------
{
  assert.strictEqual(E.shotFromInput(0, 0, 3, 3), null); ok('zbyt krótkie odciągnięcie to anulowanie');
  assert.strictEqual(E.shotFromInput(NaN, 0, 50, 0), null); assert.strictEqual(E.shotFromInput(0, 0, Infinity, 0), null);
  assert.strictEqual(E.shotFromInput('a', 0, 50, 0), null); ok('nieprawidłowe liczby odrzucone');
  const s = E.shotFromInput(0, 0, -110, 0);       // odciągnięcie w lewo => lot w prawo, połowa siły
  assert.ok(Math.abs(s.dx - 1) < 1e-9 && Math.abs(s.dy) < 1e-9 && Math.abs(s.power - 0.5) < 1e-9 && s.spin === 0); ok('kierunek przeciwny do odciągnięcia, siła proporcjonalna, środek = brak rotacji');
  assert.strictEqual(E.shotFromInput(0, 0, -9999, 0).power, 1); ok('siła obcięta do 1');
  const right = E.shotFromInput(1, 0, 0, 220), left = E.shotFromInput(-1, 0, 0, 220);   // lot w górę (y w dół), uderzenie w prawą/lewą stronę
  assert.ok(right.spin > 0 && left.spin < 0 && Math.abs(right.spin + left.spin) < 1e-9); ok('uderzenie z boku daje rotację, strony przeciwne – przeciwne znaki');
  const far = E.shotFromInput(5, 5, 0, 220); assert.ok(Math.abs(far.spin) <= 1); ok('punkt uderzenia poza kapslem jest przycinany do krawędzi');
}

// ---------- fizyka bez toru ----------
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
{
  const full = E.simulate(null, [{ x: 0, y: 0 }], 0, E.shotFromInput(0, 0, -220, 0));
  const d = dist(full.final[0], { x: 0, y: 0 });
  assert.ok(d > 700 && d < 800, 'zasięg przy pełnej sile: ' + d);
  assert.ok(Math.abs(full.final[0].y) < 0.2 && full.seconds > 1.5 && full.seconds < 2.4);
  ok(`pełna siła: zasięg ${d.toFixed(0)} jedn., czas ${full.seconds} s, lot po prostej`);
  const dists = [0.2, 0.4, 0.6, 0.8, 1].map(p => dist(E.simulate(null, [{ x: 0, y: 0 }], 0, E.shotFromInput(0, 0, -220 * p, 0)).final[0], { x: 0, y: 0 }));
  for (let i = 1; i < dists.length; i++) assert.ok(dists[i] > dists[i - 1] * 1.2);
  assert.ok(dists[0] > 3 && dists[0] < 60); ok('większa siła to dalszy lot (rosnąco), słabe pstryknięcie jest krótkie: ' + dists.map(v => v.toFixed(0)).join(' / '));
  // klatki: 30 na sekundę, pierwsza to start, ostatnia to pozycja końcowa
  assert.ok(Math.abs(full.frames.length - full.seconds * 30) < 3 && full.frames[0][0] === 0);
  const lastF = full.frames[full.frames.length - 1]; assert.deepStrictEqual({ x: lastF[0], y: lastF[1] }, full.final[0]); ok('klatki: 30/s, pierwsza w punkcie startu, ostatnia równa pozycji końcowej');
}
{
  // rotacja wygina tor lotu w stronę zgodną ze znakiem, symetrycznie
  const lat = h => E.simulate(null, [{ x: 0, y: 0 }], 0, E.shotFromInput(h, 0, 0, 220)).final[0];   // lot w górę (-y)
  const r = lat(1), l = lat(-1), z = lat(0);
  assert.ok(Math.abs(z.x) < 0.2 && r.x < -20 && l.x > 20 && Math.abs(r.x + l.x) < 0.5); ok(`uderzenie w prawą stronę skręca w lewo (x=${r.x.toFixed(0)}), w lewą w prawo (x=${l.x.toFixed(0)}), środek leci prosto`);
  assert.ok(Math.abs(r.x) < 160 && Math.abs(r.x) > 60, 'skręt nie przesadzony'); ok('skręt jest umiarkowany (nie robi pętli)');
}
{
  // zderzenie czołowe: pstryknięty kapsel oddaje ruch stojącemu
  const sim = E.simulate(null, [{ x: 0, y: 0 }, { x: 100, y: 0 }], 0, E.shotFromInput(0, 0, -150, 0));
  const a = sim.final[0], b = sim.final[1];
  assert.ok(b.x > 100 + 40 && a.x < b.x - 2 * P.capR + 1 && Math.abs(b.y) < 1 && sim.events.some(e => e[1] === 2)); ok('zderzenie czołowe: stojący kapsel odjeżdża, jest zdarzenie dźwiękowe');
  const alone = dist(E.simulate(null, [{ x: 0, y: 0 }], 0, E.shotFromInput(0, 0, -150, 0)).final[0], { x: 0, y: 0 });
  assert.ok(b.x - 100 + a.x < alone * 1.05); ok('zderzenie nie dodaje energii (suma dróg <= droga bez zderzenia)');
  const oblique = E.simulate(null, [{ x: 0, y: 0 }, { x: 70, y: 20 }], 0, E.shotFromInput(0, 0, -200, 0));
  assert.ok(Math.abs(oblique.final[1].y) > 5 && Math.abs(oblique.final[0].y) > 0.5); ok('zderzenie ukośne rozprasza oba kapsle w bok');
  const frames = oblique.frames; for (const f of frames) assert.ok(Math.hypot(f[0] - f[2], f[1] - f[3]) >= 2 * P.capR - 0.5);
  ok('kapsle nigdy nie nachodzą na siebie');
}

// ---------- fizyka na torze ----------
function randomShot() {
  const ang = rng() * 6.283, pull = P.minPull + rng() * (P.maxPull - P.minPull), hx = rng() * 2 - 1, hy = rng() * 2 - 1;
  return E.shotFromInput(hx, hy, Math.cos(ang) * pull, Math.sin(ang) * pull);
}
{
  let shots = 0, outside = 0, walls = 0, nonFinite = 0, finishes = 0;
  for (let i = 0; i < 40; i++) {
    const t = E.generateTrack((rng() * 4294967296) >>> 0, ['s', 'm', 'l'][i % 3]);
    let caps = E.startPositions(t);
    for (let k = 0; k < 25; k++) {
      const shot = randomShot(); if (!shot) continue;
      const who = k % 2, sim = E.simulate(t, caps, who, shot); shots++;
      for (const f of sim.frames) for (let c = 0; c < 2; c++) {
        if (!Number.isFinite(f[c * 2]) || !Number.isFinite(f[c * 2 + 1])) { nonFinite++; continue; }
        if (E.nearest(t, f[c * 2], f[c * 2 + 1]).d > P.halfW - P.capR + 0.6) outside++;
      }
      walls += sim.events.filter(e => e[1] === 1).length;
      caps = sim.final;
      if (sim.finishedBy !== null) { finishes++; break; }
    }
  }
  assert.strictEqual(nonFinite, 0); assert.strictEqual(outside, 0); assert.ok(walls > 20);
  ok(`${shots} losowych pstryknięć na 40 torach: kapsle zawsze w torze (banda ich zatrzymuje), ${walls} odbić od band, brak NaN`);
}
{
  const t = E.generateTrack(2024, 'm');
  const sim = E.simulate(t, E.startPositions(t), 0, E.shotFromInput(0, 0, -220, 0));       // w prawo, wzdłuż pierwszej prostej
  assert.ok(sim.final[0].x > 400 && sim.final[1].x === E.startPositions(t)[1].x && sim.finishedBy === null); ok('pstryknięcie wzdłuż startu: kapsel jedzie do przodu, drugi stoi, nikt nie wygrywa od razu');
  const again = E.simulate(t, E.startPositions(t), 0, E.shotFromInput(0, 0, -220, 0));
  assert.deepStrictEqual(again.frames, sim.frames); assert.deepStrictEqual(again.events, sim.events); ok('symulacja jest deterministyczna (te same dane, te same klatki)');
}
{
  // meta: kapsel ustawiony tuż przed linią i pstryknięty wzdłuż toru przekracza ją
  const t = E.generateTrack(31, 's'), p = E.pointAt(t, t.sFinish - 60, 0), ang = p.ang;
  const shot = { dx: Math.cos(ang), dy: Math.sin(ang), power: 0.7, spin: 0 };
  const sim = E.simulate(t, [{ x: p.x, y: p.y }, E.pointAt(t, t.sStart, 0)], 0, shot);
  assert.strictEqual(sim.finishedBy, 0); assert.ok(E.progress(t, sim.final[0]) >= t.sFinish); ok('kapsel, który minie linię mety, wygrywa; symulacja kończy się chwilę po mecie');
  assert.ok(sim.seconds < 3);
  // pstryknięcie, które nie dochodzi do mety
  const sh = E.simulate(t, [E.pointAt(t, t.sFinish - 400, 0), E.pointAt(t, t.sStart, 0)], 0, { dx: Math.cos(E.pointAt(t, t.sFinish - 400).ang), dy: Math.sin(E.pointAt(t, t.sFinish - 400).ang), power: 0.3, spin: 0 });
  assert.strictEqual(sh.finishedBy, null); ok('słabe pstryknięcie przed metą nie daje zwycięstwa');
}
{
  // kto pstryka: "last" – kapsel z tyłu, remis – na zmianę, "alternate" – na zmianę
  const t = E.generateTrack(9, 'm'), A = E.pointAt(t, 500, 0), B = E.pointAt(t, 900, 0);
  assert.strictEqual(E.nextShooter(t, [A, B], 'last', 1, 5), 0); assert.strictEqual(E.nextShooter(t, [B, A], 'last', 0, 5), 1);
  assert.strictEqual(E.nextShooter(t, [A, A], 'last', 0, 5), 1); assert.strictEqual(E.nextShooter(t, [A, A], 'last', null, 0), 0);
  assert.strictEqual(E.nextShooter(t, [A, B], 'alternate', 0, 5), 1); assert.strictEqual(E.nextShooter(t, [A, B], 'alternate', 1, 5), 0);
  ok('kolejność: "last" – pstryka ten z tyłu (remis: na zmianę), "alternate" – na zmianę');
}
{
  const t = Date.now(); for (let i = 0; i < 20; i++) E.simulate(E.generateTrack(5 + i, 'l'), E.startPositions(E.generateTrack(5 + i, 'l')), 0, E.shotFromInput(0.3, 0, -220, 20));
  const per = (Date.now() - t) / 20; assert.ok(per < 150, 'zbyt wolno: ' + per + ' ms'); ok(`wydajność: generowanie toru L + pełne pstryknięcie ≈ ${per.toFixed(0)} ms`);
}

console.log('\nWszystkie testy silnika przeszły (' + n + ').');
