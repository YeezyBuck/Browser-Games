'use strict';
// Silnik wyścigu kapsli: losowy tor (z liczby seed) i fizyka pstryknięcia. Ten sam plik działa w Node.js (serwer jest sędzią
// i liczy każde pstryknięcie) oraz w przeglądarce (rysowanie toru i podgląd toru lotu), więc obie strony liczą identycznie.
//
// Świat: jednostki umowne, oś y w dół (jak na ekranie). Tor to korytarz wokół krzywej środkowej (łamanej o stałym kroku DS);
// kapsel jest "w torze", póki jego środek jest bliżej krzywej niż halfW - capR. Dzięki temu bandy są okrągłe, a skrótów nie ma.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CapEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const P = {
    capR: 18,            // promień kapsla
    halfW: 64,           // połowa szerokości toru
    ds: 8,               // odstęp punktów krzywej środkowej
    dt: 1 / 120,         // krok symulacji
    sample: 4,           // co ile kroków zapisujemy klatkę (120/4 = 30 klatek na sekundę)
    maxT: 14,            // najdłuższy lot (s)
    maxPull: 220,        // odciągnięcie myszy dające pełną siłę
    minPull: 14,         // krótsze odciągnięcie to anulowanie
    vMax: 1000,          // prędkość startowa przy pełnej sile
    mu: 300, drag: 0.6,  // tarcie: stałe i proporcjonalne do prędkości
    stop: 6,             // poniżej tej prędkości kapsel staje
    turn: 0.5,           // maks. skręt toru lotu od rotacji (rad/s)
    spinDecay: 1.1,      // zanikanie rotacji (1/s)
    wallE: 0.6,          // sprężystość bandy
    capE: 0.9,           // sprężystość zderzenia kapsli
    startS: 70,          // odległość startu kapsli od początku krzywej
    laneOff: 26,         // rozstawienie kapsli na starcie (w poprzek toru)
    finishRun: 130,      // wybieg za metą
    maxShots: 40,        // limit pstryknięć na gracza
  };
  const LENGTHS = { s: 2800, m: 4200, l: 6200 };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const r1 = v => Math.round(v * 10) / 10;

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- tor ----------
  // Składa tor z prostych i łuków (promień >= 130, czyli łagodniej niż szerokość toru wymaga) i próbkuje go co ds.
  function buildTrack(seed, lenKey) {
    const rnd = mulberry32(seed >>> 0), target = LENGTHS[lenKey] || LENGTHS.m;
    const pieces = [{ len: 200, k: 0 }];
    let total = 200, heading = 0;
    while (total < target) {
      const left = target - total;                                               // ostatni element nie przekracza celu
      if (rnd() < 0.3) { const len = Math.min(120 + rnd() * 210, Math.max(60, left)); pieces.push({ len, k: 0 }); total += len; continue; }
      const R = 130 + rnd() * 200, ang = Math.min((35 + rnd() * 75) * Math.PI / 180, Math.max(0.35, left / R));
      const back = Math.abs(heading) > 0.5 && rnd() < 0.7;                       // częściej prostuj niż zawijaj w spiralę
      const sign = back ? (heading > 0 ? -1 : 1) : (rnd() < 0.5 ? -1 : 1);
      pieces.push({ len: R * ang, k: sign / R }); total += R * ang; heading += sign * ang;
    }
    pieces.push({ len: 200, k: 0 }); total += 200;
    const n = Math.floor(total / P.ds) + 1, xs = new Float64Array(n), ys = new Float64Array(n);
    let x = 0, y = 0, h = 0, pi = 0, acc = pieces[0].len;
    for (let i = 1; i < n; i++) {
      const s = (i - 0.5) * P.ds;
      while (pi < pieces.length - 1 && s > acc) { pi++; acc += pieces[pi].len; }
      h += pieces[pi].k * P.ds;
      x += Math.cos(h) * P.ds; y += Math.sin(h) * P.ds;
      xs[i] = x; ys[i] = y;
    }
    const length = (n - 1) * P.ds;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) { x0 = Math.min(x0, xs[i]); y0 = Math.min(y0, ys[i]); x1 = Math.max(x1, xs[i]); y1 = Math.max(y1, ys[i]); }
    const track = { seed: seed >>> 0, lenKey: LENGTHS[lenKey] ? lenKey : 'm', n, xs, ys, length, halfW: P.halfW,
      sStart: P.startS, sFinish: length - P.finishRun, bbox: [x0 - P.halfW, y0 - P.halfW, x1 + P.halfW, y1 + P.halfW] };
    return track;
  }

  // Czy korytarze różnych odcinków toru są od siebie dość daleko (brak przecięć i skrótów)?
  function trackClear(track) {
    const { n, xs, ys } = track, minD = 2 * P.halfW + 2 * P.capR + 20, skip = Math.ceil(300 / P.ds), min2 = minD * minD;
    for (let i = 0; i < n; i += 2) for (let j = i + skip; j < n; j += 2) {
      const dx = xs[i] - xs[j], dy = ys[i] - ys[j];
      if (dx * dx + dy * dy < min2) return false;
    }
    return true;
  }

  // Tor dla podanej liczby seed: jeśli wylosowany się przecina, próbujemy kolejnych liczb. Zwracany seed jest "efektywny":
  // buildTrack(track.seed, len) daje ten sam tor bez sprawdzania, więc klient odtwarza go z samej liczby.
  function generateTrack(seed, lenKey) {
    for (let a = 0; a < 400; a++) {
      const tr = buildTrack((seed + a * 7919) >>> 0, lenKey);
      if (trackClear(tr)) return tr;
    }
    return buildTrack(0x1234, lenKey);       // nie powinno się zdarzyć; bezpieczny zapas
  }

  // Najbliższy punkt krzywej środkowej: odległość, długość łuku s i kierunek "na zewnątrz" (od krzywej do punktu).
  function nearest(track, x, y, hint) {
    const { n, xs, ys } = track;
    let lo = 0, hi = n - 2;
    if (hint !== undefined && hint >= 0) { lo = Math.max(0, hint - 30); hi = Math.min(n - 2, hint + 30); }
    let best = Infinity, bi = lo, bt = 0;
    for (let i = lo; i <= hi; i++) {
      const ax = xs[i], ay = ys[i], dx = xs[i + 1] - ax, dy = ys[i + 1] - ay;
      const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
      const ex = x - (ax + dx * t), ey = y - (ay + dy * t), d2 = ex * ex + ey * ey;
      if (d2 < best) { best = d2; bi = i; bt = t; }
    }
    const cx = xs[bi] + (xs[bi + 1] - xs[bi]) * bt, cy = ys[bi] + (ys[bi + 1] - ys[bi]) * bt, d = Math.sqrt(best);
    return { d, s: (bi + bt) * P.ds, i: bi, ox: d > 1e-9 ? (x - cx) / d : 0, oy: d > 1e-9 ? (y - cy) / d : 0 };
  }

  // Punkt toru o długości łuku s, przesunięty o off w poprzek (w lewo względem kierunku jazdy: dodatni).
  function pointAt(track, s, off) {
    const f = clamp(s / P.ds, 0, track.n - 1.0001), i = Math.floor(f), t = f - i;
    const dx = track.xs[i + 1] - track.xs[i], dy = track.ys[i + 1] - track.ys[i], l = Math.hypot(dx, dy);
    return { x: track.xs[i] + dx * t + (dy / l) * (off || 0), y: track.ys[i] + dy * t - (dx / l) * (off || 0), ang: Math.atan2(dy, dx) };
  }
  function startPositions(track) {
    return [-P.laneOff, P.laneOff].map(o => { const p = pointAt(track, track.sStart, o); return { x: r1(p.x), y: r1(p.y) }; });
  }
  const progress = (track, cap) => nearest(track, cap.x, cap.y).s;

  // ---------- pstryknięcie ----------
  // Wejście z myszy: (hx,hy) to punkt uderzenia na kapslu (-1..1 od środka), (px,py) to odciągnięcie kursora od tego punktu.
  // Kapsel leci w stronę przeciwną do odciągnięcia; uderzenie z boku nadaje rotację, która wygina tor lotu.
  function shotFromInput(hx, hy, px, py) {
    if (![hx, hy, px, py].every(Number.isFinite)) return null;
    const pl = Math.hypot(px, py);
    if (pl < P.minPull) return null;
    const hl = Math.hypot(hx, hy), k = hl > 1 ? 1 / hl : 1;
    hx *= k; hy *= k;
    const dx = -px / pl, dy = -py / pl, power = clamp(pl / P.maxPull, 0, 1);
    const spin = clamp(dx * hy - dy * hx, -1, 1) * (0.5 + 0.5 * power);
    return { dx, dy, power, spin };
  }

  // Symulacja lotu. caps: [{x,y}, ...] (jeden lub dwa kapsle), shooter: indeks pstrykającego, track: tor albo null (podgląd bez band).
  // Zwraca klatki (co 1/30 s: [x0,y0,x1,y1]), zdarzenia dźwiękowe [klatka, typ(1=banda,2=kapsle), siła 0..1], pozycje końcowe
  // i numer kapsla, który minął metę (albo null).
  function simulate(track, caps, shooter, shot, opts) {
    opts = opts || {};
    const dt = P.dt, nCaps = caps.length;
    const c = caps.map(p => ({ x: p.x, y: p.y, vx: 0, vy: 0, sp: 0, hint: -1, lastWall: -99 }));
    const sh = c[shooter], v0 = P.vMax * clamp(shot.power, 0, 1);
    sh.vx = shot.dx * v0; sh.vy = shot.dy * v0; sh.sp = clamp(shot.spin, -1, 1);
    const maxSteps = Math.round((opts.maxT || P.maxT) / dt), frames = [], events = [];
    const frame = () => { const f = []; for (const k of c) f.push(r1(k.x), r1(k.y)); frames.push(f); };
    frame();
    const inner = P.halfW - P.capR;
    let finishedBy = null, endAt = -1, step = 0;
    for (; step < maxSteps; step++) {
      let moving = false;
      for (const k of c) {
        let sp = Math.hypot(k.vx, k.vy);
        if (sp > 0) {
          let ns = sp - (P.mu + P.drag * sp) * dt;
          if (ns < P.stop) { k.vx = k.vy = 0; k.sp = 0; continue; }
          if (k.sp !== 0) {
            const phi = -P.turn * k.sp * Math.min(1, ns / 200) * dt, cs = Math.cos(phi), sn = Math.sin(phi);
            const vx = k.vx * cs - k.vy * sn, vy = k.vx * sn + k.vy * cs;
            k.vx = vx; k.vy = vy;
            k.sp *= Math.exp(-P.spinDecay * dt); if (Math.abs(k.sp) < 0.01) k.sp = 0;
          }
          const f = ns / sp; k.vx *= f; k.vy *= f;
          k.x += k.vx * dt; k.y += k.vy * dt;
          moving = true;
        }
      }
      if (track) for (const k of c) {                                   // bandy: korytarz wokół krzywej środkowej
        const q = nearest(track, k.x, k.y, k.hint);
        k.hint = q.i;
        if (q.d > inner) {
          k.x -= q.ox * (q.d - inner); k.y -= q.oy * (q.d - inner);
          const vn = k.vx * q.ox + k.vy * q.oy;
          if (vn > 0) {
            k.vx -= (1 + P.wallE) * vn * q.ox; k.vy -= (1 + P.wallE) * vn * q.oy; k.sp *= 0.5;
            if (vn > 40 && step - k.lastWall > 6) { events.push([frames.length, 1, r1(Math.min(1, vn / 600))]); k.lastWall = step; }
          }
        }
      }
      for (let a = 0; a < nCaps; a++) for (let b = a + 1; b < nCaps; b++) {   // zderzenia kapsli
        const A = c[a], B = c[b], dx = B.x - A.x, dy = B.y - A.y, dist = Math.hypot(dx, dy);
        if (dist >= 2 * P.capR || dist === 0) continue;
        const nx = dx / dist, ny = dy / dist, push = (2 * P.capR - dist) / 2;
        A.x -= nx * push; A.y -= ny * push; B.x += nx * push; B.y += ny * push;
        const vn = (A.vx - B.vx) * nx + (A.vy - B.vy) * ny;
        if (vn > 0) {
          const j = (1 + P.capE) * vn / 2;
          A.vx -= j * nx; A.vy -= j * ny; B.vx += j * nx; B.vy += j * ny; A.sp *= 0.5; B.sp = 0;
          if (vn > 30) events.push([frames.length, 2, r1(Math.min(1, vn / 700))]);
        }
      }
      if ((step + 1) % P.sample === 0) frame();
      if (track && finishedBy === null) {                                // meta: pierwszy środek kapsla za linią
        let bestS = -1;
        c.forEach((k, i) => { const s = nearest(track, k.x, k.y, k.hint).s; if (s >= track.sFinish && s > bestS) { bestS = s; finishedBy = i; } });
        if (finishedBy !== null) endAt = step + 36;                        // jeszcze chwila dojazdu na oczach graczy
      }
      if (endAt >= 0 && step >= endAt) { step++; break; }
      if (!moving && !c.some(k => k.vx || k.vy)) { step++; break; }
    }
    if (step % P.sample !== 0) frame();
    const last = frames[frames.length - 1];
    return {
      frames, events,
      final: c.map((k, i) => ({ x: last[i * 2], y: last[i * 2 + 1] })),
      finishedBy, spin0: r1(shot.spin), seconds: r1(step * dt),
    };
  }

  // Który kapsel ma teraz pstrykać: "last" – ten, który jest dalej od mety (przy remisie na zmianę), "alternate" – na zmianę.
  function nextShooter(track, caps, rule, lastShooter, shots) {
    if (rule === 'alternate') return lastShooter === null ? 0 : 1 - lastShooter;
    const s = caps.map(k => progress(track, k));
    if (Math.abs(s[0] - s[1]) < 1) return lastShooter === null ? 0 : 1 - lastShooter;
    return s[0] < s[1] ? 0 : 1;
  }

  return { P, LENGTHS, buildTrack, generateTrack, trackClear, nearest, pointAt, startPositions, progress, shotFromInput, simulate, nextShooter, mulberry32 };
});
