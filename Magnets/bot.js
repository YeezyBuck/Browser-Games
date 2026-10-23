'use strict';
// Komputer jako przeciwnik w Magnesach. Działa po stronie serwera i zwraca to samo, co wysyła człowiek: { id, x, y, a }
// (numer magnesu z ręki, środek ciężkości, kąt), więc serwer sprawdza jego ruch tak samo jak każdy inny: bot nie może oszukiwać.
//
// Pomysł. Magnes położony w "bezpiecznym miejscu" (podgląd silnika: żaden magnes nie przekracza tarcia spoczynkowego) nie rusza się
// i nie może się z niczym połączyć, więc zmniejsza rękę o jeden. Bezpiecznych miejsc ubywa z każdym magnesem, a kto musi ruszać, gdy
// ich nie ma, ryzykuje połączenie (i powiększenie ręki). Dlatego:
//   trudny: stawia najbardziej "kłopotliwy" magnes (ten, który ma najmniej bezpiecznych miejsc) w takim bezpiecznym miejscu,
//           które zostawia przeciwnikowi jak najmniej bezpiecznych miejsc; gdy bezpiecznych nie ma, symuluje ryzykowne ruchy
//           (pełną fizyką) i wybiera ten o najmniejszej stracie;
//   łatwy:  stawia losowy magnes w losowym bezpiecznym miejscu, a co trzeci ruch popełnia błąd (losowe dozwolone miejsce).
const E = require('./public/engine');
const { P } = E;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Bezpieczne miejsca dla magnesu `id`: siatka pozycji x kąty. step: gęstość siatki, nAng: liczba kątów.
function safeSpots(shapes, field, dims, id, step, nAng, off) {
  const out = [], sh = E.shapeOf(shapes, id), m = Math.ceil(sh.R) + 4;
  for (let x = m + (off || 0); x < dims[0] - m; x += step) for (let y = m + (off || 0); y < dims[1] - m; y += step) for (let k = 0; k < nAng; k++) {
    const a = (k + 0.37) * Math.PI * 2 / nAng;
    if (!E.validPlacement(shapes, field, dims, id, x, y, a)) continue;
    if (!E.preview(shapes, field, dims, id, x, y, a).moves) out.push({ id, x, y, a });
  }
  return out;
}

// Ile bezpiecznych miejsc zostaje po dołożeniu `placed` na pole: liczone zgrubnie dla kilku różnych magnesów przeciwnika.
function opponentSafeCount(shapes, field, dims, placed, oppIds) {
  const f = field.concat([{ id: placed.id, x: placed.x, y: placed.y, a: placed.a }]);
  let n = 0;
  for (const id of oppIds) n += safeSpots(shapes, f, dims, id, 40, 3, 7).length;
  return n;
}

const distinct = (shapes, ids) => { const seen = new Set(), out = []; for (const id of ids) { const k = id % shapes.length; if (!seen.has(k)) { seen.add(k); out.push(id); } } return out; };
const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

// Dowolne dozwolone miejsce (losowe próbkowanie).
function randomPlacement(shapes, field, dims, id, rnd) {
  for (let k = 0; k < 500; k++) {
    const x = 12 + rnd() * (dims[0] - 24), y = 12 + rnd() * (dims[1] - 24), a = rnd() * Math.PI * 2;
    if (E.validPlacement(shapes, field, dims, id, x, y, a)) return { id, x, y, a };
  }
  return null;
}

// ctx: { shapes, field, dims, hand (id magnesów bota), oppHand (id magnesów przeciwnika) }. Zwraca { id, x, y, a } albo null.
function chooseMove(ctx, level, rnd) {
  rnd = rnd || Math.random;
  const { shapes, field, dims, hand, oppHand } = ctx, hard = level === 'hard';
  const ids = distinct(shapes, hand);
  if (!ids.length) return null;

  if (!hard) {                                                                                  // łatwy
    if (rnd() > 0.33) {
      for (const id of ids.slice().sort(() => rnd() - 0.5)) {
        const spots = safeSpots(shapes, field, dims, id, 30, 4, Math.floor(rnd() * 12));
        if (spots.length) return pick(spots, rnd);
      }
    }
    for (const id of ids.slice().sort(() => rnd() - 0.5)) { const m = randomPlacement(shapes, field, dims, id, rnd); if (m) return m; }
    return null;
  }

  // trudny: który magnes ma najmniej bezpiecznych miejsc (jego trzeba pozbyć się najpierw)
  const coarse = ids.map(id => ({ id, spots: safeSpots(shapes, field, dims, id, 36, 3, 5) })).filter(c => c.spots.length);
  if (coarse.length) {
    coarse.sort((a, b) => a.spots.length - b.spots.length);
    const id = coarse[0].id, spots = safeSpots(shapes, field, dims, id, 18, 6, 0);              // gęsta siatka dla wybranego magnesu
    const oppIds = distinct(shapes, oppHand).slice(0, 2);
    const cand = [];
    for (let i = 0; i < Math.min(16, spots.length); i++) cand.push(spots.splice(Math.floor(rnd() * spots.length), 1)[0]);
    let best = null;
    for (const c of cand) {
      const left = oppIds.length ? opponentSafeCount(shapes, field, dims, c, oppIds) : 0;
      if (!best || left < best.left) best = { left, c };
    }
    if (best) return best.c;
  }

  // bezpiecznych miejsc nie ma: ryzykujemy, ale wybieramy ruch o najmniejszej stracie (pełna symulacja)
  let best = null;
  for (const id of ids.slice(0, 4)) for (let k = 0; k < 8; k++) {
    const m = randomPlacement(shapes, field, dims, id, rnd);
    if (!m) continue;
    const res = E.playTurn(shapes, field, dims, Object.assign({ owner: 1 }, m));
    const gain = res.returned.length ? res.returned.length - 1 : -1;                           // ile magnesów przybędzie do ręki (-1 = pozbywam się jednego)
    const oppReturned = res.returned.length ? 0 : 0;
    const score = -gain * 100 - oppReturned + rnd();
    if (!best || score > best.score) best = { score, m };
  }
  return best ? best.m : null;
}

module.exports = { chooseMove, safeSpots, randomPlacement };
