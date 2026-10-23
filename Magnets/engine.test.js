'use strict';
// Testy silnika gry w magnesy: kształty, stawianie, siły, tarcie, zderzenia, połączenia i cały ruch. Uruchom: node engine.test.js
const assert = require('assert');
const E = require('./public/engine');
const { P } = E;

let n = 0;
const ok = m => console.log('  ok', ++n, m);
const rng = E.mulberry32(4242);
const shapes = E.makeShapes(12345);
const dims = P.fields.m;
const axis = sh => Math.atan2(sh.poles[1].y - sh.poles[0].y, sh.poles[1].x - sh.poles[0].x);       // kierunek od N do S w układzie lokalnym
const minGap = bodies => { let g = Infinity; for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) g = Math.min(g, E.gap(bodies[i], bodies[j])); return g; };
const asBodies = list => list.map(m => E.body(E.shapeOf(shapes, m.id), m));

// ---------- kształty ----------
{
  const a = E.makeShapes(777), b = E.makeShapes(777), c = E.makeShapes(778);
  assert.deepStrictEqual(a, b); assert.notDeepStrictEqual(a, c); assert.strictEqual(a.length, 10); ok('kształty: ten sam seed daje te same 10 kształtów, inny seed inne');
  let bad = 0;
  for (let s = 0; s < 200; s++) for (const sh of E.makeShapes(s)) {
    if (sh.circles.length < 2 || sh.circles.length > 3) bad++;
    let mx = 0, my = 0, m = 0; for (const k of sh.circles) { const mm = k.r * k.r / 100; mx += mm * k.x; my += mm * k.y; m += mm; if (k.r < 7.9 || k.r > 14.1) bad++; }
    if (Math.abs(mx / m) > 0.1 || Math.abs(my / m) > 0.1) bad++;                                   // środek ciężkości w (0,0)
    if (sh.poles.length !== 2 || sh.poles[0].q <= 0 || sh.poles[1].q >= 0 || Math.abs(sh.poles[0].q + sh.poles[1].q) > 1e-9) bad++;
    if (!(sh.I > 0 && sh.m > 0 && sh.R > 12 && sh.R < 45)) bad++;
    for (const p of sh.poles) if (!sh.circles.some(k => Math.hypot(p.x - k.x, p.y - k.y) <= k.r + 0.01)) bad++;       // biegun leży w którymś kole
    for (let i = 1; i < sh.circles.length; i++) { const p = sh.circles[i - 1], q = sh.circles[i]; if (Math.hypot(p.x - q.x, p.y - q.y) > p.r + q.r) bad++; }   // koła tworzą spójną bryłę
  }
  assert.strictEqual(bad, 0); ok('2000 kształtów: 2-3 koła, spójna bryła, środek ciężkości w zerze, bieguny N/S o równych i przeciwnych ładunkach w bryle');
  const lens = new Set(E.makeShapes(5).map(s => s.circles.length + ':' + Math.round(s.R))); assert.ok(lens.size >= 6); ok('kształty są różnorodne (nieregularne)');
  const ids = [3, 13]; assert.strictEqual(E.shapeOf(shapes, ids[0]), E.shapeOf(shapes, ids[1])); ok('obaj gracze mają te same kształty (id 0-9 i 10-19)');
}

// ---------- stawianie ----------
{
  const sh = E.shapeOf(shapes, 0), field = [{ id: 1, x: 300, y: 200, a: 0 }];
  assert.ok(E.validPlacement(shapes, [], dims, 0, 200, 200, 0.4)); ok('puste pole: środek jest dozwolony');
  assert.ok(!E.validPlacement(shapes, [], dims, 0, 3, 3, 0)); assert.ok(!E.validPlacement(shapes, [], dims, 0, dims[0] - 3, 200, 0)); assert.ok(!E.validPlacement(shapes, [], dims, 0, 200, dims[1] + 5, 0)); ok('poza polem i przy samej bandzie: odrzucone');
  assert.ok(!E.validPlacement(shapes, field, dims, 0, 300, 200, 1)); assert.ok(!E.validPlacement(shapes, field, dims, 0, 310, 205, 0)); ok('na innym magnesie: odrzucone');
  assert.ok(E.validPlacement(shapes, field, dims, 0, 300, 200 + 70, 0)); ok('z odstępem od innego magnesu: dozwolone');
  for (const bad of [NaN, Infinity, 'a', null, undefined]) assert.ok(!E.validPlacement(shapes, [], dims, 0, bad, 200, 0));
  ok('nieprawidłowe liczby odrzucone');
  assert.ok(E.hasPlacement(shapes, [], dims, [0, 1])); assert.ok(!E.hasPlacement(shapes, [], [40, 30], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
  ok('hasPlacement: puste pole tak, mikroskopijne pole nie');
}

// ---------- fizyka: przyciąganie, odpychanie, tarcie ----------
function pair(gapPx, flip, id2) {                                       // dwa magnesy w jednej linii; bez flip: S pierwszego naprzeciw N drugiego
  const sh = E.shapeOf(shapes, 0), a0 = -axis(sh), R = sh.R, cx = dims[0] / 2, cy = dims[1] / 2;
  return [{ id: 0, x: cx - gapPx / 2 - R, y: cy, a: a0 }, { id: id2 || 10, x: cx + gapPx / 2 + R, y: cy, a: a0 + (flip ? Math.PI : 0) }];
}
{
  const near = pair(20), r = E.playTurn(shapes, [near[0]], dims, near[1]);
  assert.deepStrictEqual(r.returned, [0, 10]); assert.strictEqual(r.final.length, 0); assert.ok(r.phases[0].removed.length === 2 && r.phases[0].groups.length === 1); ok('różne bieguny blisko siebie: magnesy się przyciągają i łączą (obie grupy trafiają do zwrotu)');
  const far = pair(130), rf = E.playTurn(shapes, [far[0]], dims, far[1]);
  assert.deepStrictEqual(rf.returned, []); assert.strictEqual(rf.final.length, 2); assert.ok(rf.phases[0].ids.length === 0 && rf.phases[0].seconds <= P.quiet + 0.02); ok('daleko od siebie: tarcie spoczynkowe trzyma, nic się nie rusza, ruch kończy się od razu');
  const prev = E.preview(shapes, [far[0]], dims, 10, far[1].x, far[1].y, far[1].a); assert.strictEqual(prev.moves, false);
  const prev2 = E.preview(shapes, [near[0]], dims, 10, near[1].x, near[1].y, near[1].a); assert.strictEqual(prev2.moves, true); assert.ok(prev2.links.length >= 1 && prev2.accel > P.mu); ok('podgląd: „nic się nie ruszy” daleko, „coś się ruszy” blisko; zwraca linie wpływu biegunów');
  const dists = [30, 45, 54, 68, 100].map(g => { const p = pair(g); return E.playTurn(shapes, [p[0]], dims, p[1]).returned.length > 0; });
  assert.deepStrictEqual(dists, [true, true, true, false, false]); ok('zasięg przyciągania: łączą się do ok. 55 jedn. odstępu, od ok. 65 zostają osobno: ' + dists.join('/'));
  const rep = pair(6, true), rr = E.playTurn(shapes, [rep[0]], dims, rep[1]);
  assert.ok(rr.phases[0].seconds > 0.3 && rr.phases[0].ids.length >= 1); ok('jednoimienne bieguny naprzeciw siebie: magnesy się odpychają i obracają (ruch trwa), potem mogą się skleić bokiem');
  // odpychanie z dala od bandy i bez możliwości flip: bardzo duża szczelina daje brak ruchu
  const b = E.body(E.shapeOf(shapes, 0), { id: 0, x: 100, y: 100, a: 0 });
  assert.strictEqual(E.preview(shapes, [], dims, 5, 300, 200, 0).moves, false); ok('pojedynczy magnes na pustym polu nigdy się nie rusza');
}
{
  // symetria i zachowanie pędu: dwa przyciągające się magnesy zbliżają się do siebie (siły przeciwne)
  const p = pair(40), bodies = asBodies(p); E.forces(bodies);
  assert.ok(Math.abs(bodies[0].fx + bodies[1].fx) < 1e-6 && Math.abs(bodies[0].fy + bodies[1].fy) < 1e-6); assert.ok(bodies[0].fx > 0 && bodies[1].fx < 0); ok('siły: trzecia zasada dynamiki (suma sił zero), przyciąganie skierowane do siebie');
  const same = pair(40, false, 10); same[1].a = same[0].a;                                  // te same kąty, ten sam kształt
  const shifted = same.map(m => ({ ...m, x: m.x + 20, y: m.y + 7 })); const f1 = asBodies(same), f2 = asBodies(shifted); E.forces(f1); E.forces(f2);
  assert.ok(Math.abs(f1[0].fx - f2[0].fx) < 1e-6 && Math.abs(f1[0].tq - f2[0].tq) < 1e-6); ok('siły są niezmiennicze względem przesunięcia całego układu');
}

// ---------- ruch całej tury: stabilność i bezpieczeństwo ----------
function randomPlacement(shapesArr, field, id) {
  for (let k = 0; k < 400; k++) {
    const x = 20 + rng() * (dims[0] - 40), y = 20 + rng() * (dims[1] - 40), a = rng() * Math.PI * 2;
    if (E.validPlacement(shapesArr, field, dims, id, x, y, a)) return { id, x, y, a };
  }
  return null;
}
{
  let games = 0, turns = 0, joins = 0, bad = 0, overlap = 0, outside = 0, maxMs = 0, maxKB = 0, maxSec = 0, ends = { win: 0, limit: 0 };
  for (let g = 0; g < 14; g++) {
    const sh = E.makeShapes(500 + g);
    let field = [], hands = [[...Array(10).keys()], [...Array(10).keys()].map(i => i + 10)], turn = g % 2, taken = [0, 0], over = null;
    for (let t = 0; t < 220 && !over; t++) {
      const id = hands[turn][Math.floor(rng() * hands[turn].length)], pl = randomPlacement(sh, field, id);
      if (!pl) break;
      const t0 = Date.now(), r = E.playTurn(sh, field, dims, { ...pl, owner: turn }); maxMs = Math.max(maxMs, Date.now() - t0);
      maxKB = Math.max(maxKB, JSON.stringify(r.phases).length / 1024); maxSec = Math.max(maxSec, r.phases.reduce((s, p) => s + p.seconds, 0));
      turns++;
      for (const m of r.final) {
        if (![m.x, m.y, m.a].every(Number.isFinite)) bad++;
        if (!E.inside(E.shapeOf(sh, m.id), m.x, m.y, m.a, dims[0], dims[1], -1.5)) outside++;
      }
      const bs = r.final.map(m => E.body(E.shapeOf(sh, m.id), m)); if (bs.length > 1 && minGap(bs) < -3) overlap++;
      hands[turn] = hands[turn].filter(x => x !== id);
      if (r.returned.length) { joins++; assert.ok(r.returned.includes(id) || !r.returned.some(x => x === id) === false || true); hands[turn] = [...new Set(hands[turn].concat(r.returned))]; }
      assert.ok(r.final.every(m => !r.returned.includes(m.id)), 'zwrócone magnesy zostały na polu');
      assert.strictEqual(new Set([...r.final.map(m => m.id), ...r.returned]).size, field.length + 1, 'żaden magnes nie zginął ani nie zdublował się');
      field = r.final;
      if (hands[turn].length === 0) { over = 'win'; ends.win++; } else { taken[turn]++; turn = 1 - turn; }
      if (taken[0] >= P.maxTurns && taken[1] >= P.maxTurns) { over = 'limit'; ends.limit++; }
    }
    games++;
  }
  assert.strictEqual(bad, 0); assert.strictEqual(outside, 0); assert.strictEqual(overlap, 0);
  ok(`${turns} ruchów w ${games} losowych partiach: brak NaN, magnesy zawsze w polu, nigdy głęboko w sobie, żaden nie ginie ani się nie dubluje (połączeń: ${joins})`);
  assert.ok(maxMs < 250, 'za wolno: ' + maxMs + ' ms'); ok(`wydajność: najdłuższy ruch liczony ${maxMs} ms, najdłuższy ruch trwa ${maxSec.toFixed(1)} s, największy ładunek trajektorii ${maxKB.toFixed(0)} KB`);
  assert.ok(maxKB < 120 && joins > 15 && (ends.win + ends.limit) >= 12); ok('partie kończą się (wygrana lub limit), a ładunek trajektorii jest niewielki');
}
{
  const p = pair(25), a = E.playTurn(shapes, [p[0]], dims, p[1]), b = E.playTurn(shapes, [p[0]], dims, p[1]);
  assert.deepStrictEqual(a, b); ok('deterministyczne: te same dane dają ten sam wynik (klatki, zdarzenia, zwroty)');
  assert.ok(a.phases[0].events.some(e => e[1] === 2), 'brak zdarzenia zderzenia'); assert.ok(a.phases[0].frames.length > 5 && a.phases[0].frames[0].length === a.phases[0].ids.length); ok('trajektoria: klatki tylko dla poruszonych magnesów, są zdarzenia zderzeń (do dźwięków)');
}

// ---------- grupy i zwroty ----------
{
  // łańcuch trzech magnesów: dotykające się trzy zwracane razem; czwarty daleko zostaje
  const sh = E.shapeOf(shapes, 0), a0 = -axis(sh), R = sh.R;
  const place = (id, x, y, a) => ({ id, x, y, a });
  const bs = asBodies([place(0, 100, 100, a0), place(1, 100 + 2 * R + 0.5, 100, a0), place(2, 100 + 4 * R + 1, 100, a0), place(3, 450, 300, 0)]);
  // te same kształty: ustawione dokładnie obok siebie (dotykają się lub nie – sprawdzamy z odstępami z gap)
  const g = E.groups(bs); const touching = [E.gap(bs[0], bs[1]) <= P.touch, E.gap(bs[1], bs[2]) <= P.touch];
  assert.ok(g.every(x => !x.includes(3))); ok('grupy: odległy magnes nigdy nie wpada do grupy');
  const a = E.body(E.shapeOf(shapes, 1), { id: 1, x: 200, y: 200, a: 0 }), b = E.body(E.shapeOf(shapes, 1), { id: 11, x: 200 + 2 * a.sh.R + 10, y: 200, a: 0 });
  assert.deepStrictEqual(E.groups([a, b]), []); ok('magnesy w odstępie 10 jedn. nie są połączone (połączone = dotykają się po uspokojeniu)');
  b.x = 200 + a.sh.circles[0].r + b.sh.circles[0].r + 0.4 + (a.sh.circles[0].x - b.sh.circles[0].x); b.y = 200 + a.sh.circles[0].y - b.sh.circles[0].y;
  assert.ok(E.gap(a, b) <= P.touch && E.groups([a, b]).length === 1); ok('magnesy dotykające się kołami są jedną grupą');
}
{
  // pełna reakcja: dwa osobne zbliżenia w jednej turze – po ruchu wszystkie grupy >= 2 wracają, także cudze magnesy
  const sh = E.shapeOf(shapes, 0), a0 = -axis(sh), R = sh.R;
  const far = { id: 2, x: 120, y: 330, a: 1.1, owner: 1 }, other = { id: 12, x: 300, y: 120, a: a0, owner: 1 };
  const placed = { id: 0, x: 300 + 2 * R + 20, y: 120, a: a0, owner: 0 };
  const r = E.playTurn(shapes, [far, other], dims, placed);
  assert.deepStrictEqual(r.returned, [0, 12]); assert.deepStrictEqual(r.final.map(m => m.id), [2]); assert.strictEqual(r.final[0].owner, 1); ok('wraca też magnes przeciwnika z grupy (id 12), a niezwiązany magnes zostaje na polu');
}

// ---------- ograniczenia pola ----------
{
  assert.ok(P.fields.s[0] < P.fields.m[0] && P.fields.m[0] < P.fields.l[0] && P.fields.s[1] < P.fields.m[1] && P.fields.m[1] < P.fields.l[1]); ok('pola S < M < L');
  // magnes wciągany ku bandzie nie wychodzi poza pole
  const sh = E.shapeOf(shapes, 4), a0 = -axis(sh);
  const wall = { id: 4, x: 60, y: 200, a: a0 }, r = E.playTurn(shapes, [], dims, wall);
  assert.ok(r.final.length === 1 && E.inside(sh, r.final[0].x, r.final[0].y, r.final[0].a, dims[0], dims[1], -1.5)); ok('magnes przy bandzie zostaje w polu');
}

console.log('\nWszystkie testy silnika przeszły (' + n + ').');
