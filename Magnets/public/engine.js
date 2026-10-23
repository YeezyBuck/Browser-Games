'use strict';
// Silnik gry w magnesy: nieregularne magnesy (kilka złączonych kół z biegunami N i S), siły magnetyczne, tarcie,
// zderzenia i wykrywanie połączeń. Ten sam plik działa w Node.js (serwer jest sędzią i liczy każdy ruch) oraz w przeglądarce
// (rysowanie, podgląd sił), więc obie strony liczą identycznie.
//
// Świat: jednostki umowne, oś y w dół. Magnes to bryła sztywna: pozycja (x,y), kąt a, prędkość (vx,vy) i prędkość kątowa w.
// Kształt: koła o promieniach r (masa ~ r^2) i dwa bieguny: N (ładunek +q) i S (ładunek -q). Bieguny różnoimienne się
// przyciągają, jednoimienne odpychają (prawo odwrotnych kwadratów z wygładzeniem). Stół ma tarcie: magnes rusza dopiero wtedy,
// gdy siła przekroczy tarcie spoczynkowe, więc odległe magnesy leżą spokojnie.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MagEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const P = {
    dt: 1 / 240,           // krok symulacji
    sample: 8,             // co ile kroków zapisujemy klatkę (240/8 = 30 klatek na sekundę)
    maxT: 5,               // najdłuższa jedna faza ruchu (s)
    quiet: 0.25,           // tyle sekund ciszy (wszystkie magnesy stoją) kończy fazę
    fields: { s: [460, 290], m: [540, 340], l: [640, 400] },
    perPlayer: 10,         // magnesów na gracza
    maxTurns: 40,          // limit ruchów na gracza
    K: 2.0e6, eps: 7,      // siła magnetyczna: K*q1*q2/(d^2+eps^2)
    mu: 40, muR: 10,       // tarcie: stałe opóźnienie (jedn./s^2) i kątowe (rad/s^2)
    damp: 2.2, dampR: 5,   // tłumienie lepkie (1/s)
    eWall: 0.3, eMag: 0.12, fric: 0.5,   // sprężystość band i magnesów, tarcie przy zetknięciu
    touch: 1.6,            // szczelina, poniżej której magnesy uznajemy za połączone
    clear: 3, wallClear: 2,// wymagany odstęp przy stawianiu
    vStop: 3, wStop: 0.2,  // prędkości uznawane za spoczynek
    vContact: 14, wContact: 1.2,  // drgania sklejonych magnesów poniżej tych wartości też uznajemy za spoczynek
    maxRounds: 5,          // ile razy po usunięciu połączonych grup liczymy ruch od nowa
  };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const r1 = v => Math.round(v * 10) / 10;
  const r2 = v => Math.round(v * 100) / 100;

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- kształty ----------
  // Jeden kształt: 2-3 koła w łańcuchu (nieregularny, ale zwarty), bieguny na końcach, środek ciężkości w (0,0).
  function makeShape(rnd) {
    const n = rnd() < 0.55 ? 2 : 3;
    const cs = [];
    let ang = rnd() * Math.PI * 2, x = 0, y = 0, r = 8 + rnd() * 6;
    cs.push({ x, y, r });
    for (let i = 1; i < n; i++) {
      const nr = 8 + rnd() * 6;
      ang += (rnd() - 0.5) * 1.5;
      const d = (r + nr) * (0.74 + rnd() * 0.24);
      x += Math.cos(ang) * d; y += Math.sin(ang) * d; r = nr;
      cs.push({ x, y, r });
    }
    let m = 0, cx = 0, cy = 0;
    for (const c of cs) { c.m = c.r * c.r / 100; m += c.m; cx += c.m * c.x; cy += c.m * c.y; }
    cx /= m; cy /= m;
    for (const c of cs) { c.x = r2(c.x - cx); c.y = r2(c.y - cy); }
    let I = 0, R = 0;
    for (const c of cs) { I += c.m * (c.r * c.r / 2 + c.x * c.x + c.y * c.y); R = Math.max(R, Math.hypot(c.x, c.y) + c.r); }
    const q = 0.85 + rnd() * 0.4, a = cs[0], b = cs[cs.length - 1], c1 = cs[1];
    const cn = cs[cs.length - 2];
    const out = (c, next) => { const dx = c.x - next.x, dy = c.y - next.y, l = Math.hypot(dx, dy) || 1; return { x: r2(c.x + dx / l * c.r * 0.45), y: r2(c.y + dy / l * c.r * 0.45) }; };
    const pn = out(a, c1), ps = out(b, cn);
    return { circles: cs.map(c => ({ x: c.x, y: c.y, r: r2(c.r) })), poles: [{ x: pn.x, y: pn.y, q: r2(q) }, { x: ps.x, y: ps.y, q: -r2(q) }], m: r2(m), I: r2(I), R: r2(R) };
  }
  function makeShapes(seed, n) {
    const rnd = mulberry32((seed >>> 0) ^ 0x51ed270b), out = [];
    for (let i = 0; i < (n || P.perPlayer); i++) out.push(makeShape(rnd));
    return out;
  }
  // Numer kształtu magnesu o danym id: obaj gracze dostają te same kształty (id 0-9 i 10-19).
  const shapeOf = (shapes, id) => shapes[id % shapes.length];

  // ---------- geometria ----------
  const body = (sh, m) => ({ id: m.id, sh, x: m.x, y: m.y, a: m.a, vx: 0, vy: 0, w: 0, c: Math.cos(m.a), s: Math.sin(m.a), fx: 0, fy: 0, tq: 0, owner: m.owner });
  const wx = (b, lx, ly) => b.x + b.c * lx - b.s * ly;
  const wy = (b, lx, ly) => b.y + b.s * lx + b.c * ly;

  function inside(sh, x, y, a, W, H, wallClear) {
    const c = Math.cos(a), s = Math.sin(a);
    for (const k of sh.circles) {
      const px = x + c * k.x - s * k.y, py = y + s * k.x + c * k.y;
      if (px - k.r < wallClear || px + k.r > W - wallClear || py - k.r < wallClear || py + k.r > H - wallClear) return false;
    }
    return true;
  }
  // Najmniejsza szczelina między dwoma magnesami (ujemna = nachodzą na siebie).
  function gap(a, b) {
    let g = Infinity;
    for (const ka of a.sh.circles) {
      const ax = wx(a, ka.x, ka.y), ay = wy(a, ka.x, ka.y);
      for (const kb of b.sh.circles) g = Math.min(g, Math.hypot(ax - wx(b, kb.x, kb.y), ay - wy(b, kb.x, kb.y)) - ka.r - kb.r);
    }
    return g;
  }
  // Czy można tu postawić magnes: wewnątrz pola i z odstępem od pozostałych.
  function validPlacement(shapes, field, dims, id, x, y, a) {
    if (![x, y, a].every(Number.isFinite)) return false;
    const sh = shapeOf(shapes, id);
    if (!inside(sh, x, y, a, dims[0], dims[1], P.wallClear)) return false;
    const me = body(sh, { id, x, y, a });
    for (const m of field) if (gap(me, body(shapeOf(shapes, m.id), m)) < P.clear) return false;
    return true;
  }
  // Czy którykolwiek z magnesów (ids) da się gdzieś postawić? (przeszukiwanie siatki i kątów)
  function hasPlacement(shapes, field, dims, ids) {
    const bodies = field.map(m => body(shapeOf(shapes, m.id), m));
    const seen = new Set();
    for (const id of ids) {
      const sh = shapeOf(shapes, id), key = id % shapes.length;
      if (seen.has(key)) continue; seen.add(key);
      for (let x = 14; x < dims[0]; x += 12) for (let y = 14; y < dims[1]; y += 12) for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3 + 0.3;
        if (!inside(sh, x, y, a, dims[0], dims[1], P.wallClear)) continue;
        const me = body(sh, { id, x, y, a });
        if (bodies.every(b => gap(me, b) >= P.clear)) return true;
      }
    }
    return false;
  }

  // ---------- siły ----------
  function forces(bodies, extra) {
    for (const b of bodies) { b.fx = 0; b.fy = 0; b.tq = 0; }
    const K = P.K, e2 = P.eps * P.eps;
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const A = bodies[i], B = bodies[j];
      for (const pa of A.sh.poles) {
        const ax = wx(A, pa.x, pa.y), ay = wy(A, pa.x, pa.y);
        for (const pb of B.sh.poles) {
          const bx = wx(B, pb.x, pb.y), by = wy(B, pb.x, pb.y), dx = ax - bx, dy = ay - by, d2 = dx * dx + dy * dy + e2, d = Math.sqrt(d2);
          const f = K * pa.q * pb.q / d2 / d, fx = f * dx, fy = f * dy;                   // dodatni iloczyn ładunków = odpychanie
          A.fx += fx; A.fy += fy; B.fx -= fx; B.fy -= fy;
          A.tq += (ax - A.x) * fy - (ay - A.y) * fx;
          B.tq -= (bx - B.x) * fy - (by - B.y) * fx;
        }
      }
    }
  }
  // Siła i moment na próbnym magnesie (podgląd) oraz informacja, czy cokolwiek się poruszy po postawieniu.
  function preview(shapes, field, dims, id, x, y, a) {
    const bodies = field.map(m => body(shapeOf(shapes, m.id), m)), me = body(shapeOf(shapes, id), { id, x, y, a });
    bodies.push(me);
    forces(bodies);
    let moves = false;
    for (const b of bodies) if (Math.hypot(b.fx, b.fy) / b.sh.m > P.mu || Math.abs(b.tq) / b.sh.I > P.muR) { moves = true; break; }
    const links = [];                                                                         // wpływ pojedynczych biegunów (do rysowania linii)
    for (const pa of me.sh.poles) for (const m of field) {
      const B = body(shapeOf(shapes, m.id), m);
      for (const pb of B.sh.poles) {
        const dx = wx(me, pa.x, pa.y) - wx(B, pb.x, pb.y), dy = wy(me, pa.x, pa.y) - wy(B, pb.x, pb.y), d2 = dx * dx + dy * dy + P.eps * P.eps;
        const f = P.K * pa.q * pb.q / d2;
        if (Math.abs(f) / me.sh.m > P.mu * 0.35) links.push({ ax: r1(wx(me, pa.x, pa.y)), ay: r1(wy(me, pa.x, pa.y)), bx: r1(wx(B, pb.x, pb.y)), by: r1(wy(B, pb.x, pb.y)), f: r1(f) });
      }
    }
    return { fx: r1(me.fx), fy: r1(me.fy), tq: r1(me.tq), accel: r1(Math.hypot(me.fx, me.fy) / me.sh.m), moves, links };
  }

  // ---------- zderzenia ----------
  function impulse(A, B, px, py, nx, ny, e) {            // B może być null (ściana); n skierowana od A do B
    const rax = px - A.x, ray = py - A.y, ima = 1 / A.sh.m, iIa = 1 / A.sh.I;
    let rvx = -(A.vx - A.w * ray), rvy = -(A.vy + A.w * rax), denom = ima + (rax * ny - ray * nx) ** 2 * iIa, rbx = 0, rby = 0;
    if (B) { rbx = px - B.x; rby = py - B.y; rvx += B.vx - B.w * rby; rvy += B.vy + B.w * rbx; denom += 1 / B.sh.m + (rbx * ny - rby * nx) ** 2 / B.sh.I; }
    const vn = rvx * nx + rvy * ny;
    if (vn > 0) return 0;                                  // rozchodzą się
    const j = -(1 + e) * vn / denom, jx = j * nx, jy = j * ny;
    A.vx -= jx * ima; A.vy -= jy * ima; A.w -= (rax * jy - ray * jx) * iIa;
    if (B) { B.vx += jx / B.sh.m; B.vy += jy / B.sh.m; B.w += (rbx * jy - rby * jx) / B.sh.I; }
    // tarcie styczne (ograniczone przez normalny impuls)
    const tx = -ny, ty = nx;
    let rtx = -(A.vx - A.w * ray), rty = -(A.vy + A.w * rax);
    if (B) { rtx += B.vx - B.w * rby; rty += B.vy + B.w * rbx; }
    const vt = rtx * tx + rty * ty;
    let dt2 = ima + (rax * ty - ray * tx) ** 2 * iIa; if (B) dt2 += 1 / B.sh.m + (rbx * ty - rby * tx) ** 2 / B.sh.I;
    const jt = clamp(-vt / dt2, -P.fric * j, P.fric * j), kx = jt * tx, ky = jt * ty;
    A.vx -= kx * ima; A.vy -= ky * ima; A.w -= (rax * ky - ray * kx) * iIa;
    if (B) { B.vx += kx / B.sh.m; B.vy += ky / B.sh.m; B.w += (rbx * ky - rby * kx) / B.sh.I; }
    return -vn;
  }
  function collide(bodies, W, H, hits) {
    for (const b of bodies) for (const k of b.sh.circles) {                                  // bandy
      const cx = wx(b, k.x, k.y), cy = wy(b, k.x, k.y);
      let nx = 0, ny = 0, pen = 0;
      if (cx - k.r < 0) { nx = -1; pen = k.r - cx; } else if (cx + k.r > W) { nx = 1; pen = cx + k.r - W; }
      if (cy - k.r < 0) { ny = -1; pen = Math.max(pen, k.r - cy); } else if (cy + k.r > H) { ny = 1; pen = Math.max(pen, cy + k.r - H); }
      if (nx || ny) {
        const l = Math.hypot(nx, ny); nx /= l; ny /= l;
        b.x -= nx * pen; b.y -= ny * pen;
        const sp = impulse(b, null, cx + nx * k.r, cy + ny * k.r, nx, ny, P.eWall);
        if (sp > 25 && hits) hits.push([1, b.id, sp]);
      }
    }
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const A = bodies[i], B = bodies[j];
      if (Math.hypot(A.x - B.x, A.y - B.y) > A.sh.R + B.sh.R) continue;
      for (const ka of A.sh.circles) for (const kb of B.sh.circles) {
        const ax = wx(A, ka.x, ka.y), ay = wy(A, ka.x, ka.y), bx = wx(B, kb.x, kb.y), by = wy(B, kb.x, kb.y);
        let dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
        const pen = ka.r + kb.r - d;
        if (pen <= 0) continue;
        if (d < 1e-9) { dx = 1; dy = 0; d = 1; }
        const nx = dx / d, ny = dy / d, wa = B.sh.m / (A.sh.m + B.sh.m), wb = 1 - wa;
        A.x -= nx * pen * wa; A.y -= ny * pen * wa; B.x += nx * pen * wb; B.y += ny * pen * wb;
        const sp = impulse(A, B, ax + nx * (ka.r - pen / 2), ay + ny * (ka.r - pen / 2), nx, ny, P.eMag);
        if (sp > 25 && hits) hits.push([2, A.id, sp, B.id]);
      }
    }
    for (const b of bodies) { b.c = Math.cos(b.a); b.s = Math.sin(b.a); }
  }

  // Zjednoczenie magnesów, które się dotykają (szczelina <= touch): lista grup (tablice id), tylko grupy >= 2.
  function groups(bodies) {
    const par = bodies.map((_, i) => i), find = i => (par[i] === i ? i : (par[i] = find(par[i])));
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++)
      if (Math.hypot(bodies[i].x - bodies[j].x, bodies[i].y - bodies[j].y) <= bodies[i].sh.R + bodies[j].sh.R + P.touch && gap(bodies[i], bodies[j]) <= P.touch) par[find(i)] = find(j);
    const map = new Map();
    bodies.forEach((b, i) => { const r = find(i); if (!map.has(r)) map.set(r, []); map.get(r).push(b.id); });
    return [...map.values()].filter(g => g.length >= 2).map(g => g.sort((x, y) => x - y));
  }

  // Jedna faza ruchu aż do uspokojenia (albo do limitu czasu). Zwraca klatki tylko dla magnesów, które się poruszyły.
  function settle(bodies, dims, startFrame) {
    const dt = P.dt, W = dims[0], H = dims[1], maxSteps = Math.round(P.maxT / dt), quietSteps = Math.round(P.quiet / dt);
    const start = bodies.map(b => ({ x: b.x, y: b.y, a: b.a })), frames = [], events = [];
    const snap = () => frames.push(bodies.map(b => [b.x, b.y, b.a]));
    snap();
    let quiet = 0, step = 0;
    for (; step < maxSteps; step++) {
      forces(bodies);
      let active = false;
      for (const b of bodies) {
        const m = b.sh.m, I = b.sh.I, ax = b.fx / m, ay = b.fy / m, al = b.tq / I, sp = Math.hypot(b.vx, b.vy);
        if (sp < 1e-6) {                                                                    // spoczynek: tarcie spoczynkowe trzyma, jeśli siła jest mała
          const am = Math.hypot(ax, ay);
          if (am > P.mu) { b.vx = (ax - P.mu * ax / am) * dt; b.vy = (ay - P.mu * ay / am) * dt; }
        } else {
          const ovx = b.vx, ovy = b.vy;
          b.vx += (ax - P.mu * ovx / sp) * dt; b.vy += (ay - P.mu * ovy / sp) * dt;
          if (b.vx * ovx + b.vy * ovy <= 0) { b.vx = 0; b.vy = 0; if (Math.hypot(ax, ay) > P.mu) { const am = Math.hypot(ax, ay); b.vx = (ax - P.mu * ax / am) * dt; b.vy = (ay - P.mu * ay / am) * dt; } }
        }
        if (Math.abs(b.w) < 1e-6) { if (Math.abs(al) > P.muR) b.w = (al - P.muR * Math.sign(al)) * dt; }
        else { const ow = b.w; b.w += (al - P.muR * Math.sign(ow)) * dt; if (b.w * ow <= 0) b.w = Math.abs(al) > P.muR ? (al - P.muR * Math.sign(al)) * dt : 0; }
        const dv = Math.exp(-P.damp * dt), dw = Math.exp(-P.dampR * dt);
        b.vx *= dv; b.vy *= dv; b.w *= dw;
        b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.w * dt; b.c = Math.cos(b.a); b.s = Math.sin(b.a);
      }
      const hits = [];
      collide(bodies, W, H, hits); collide(bodies, W, H, null);
      for (const h of hits) events.push([frames.length, h[0], r1(Math.min(1, h[2] / 220)), h[1], h[3] === undefined ? -1 : h[3]]);
      for (const b of bodies) {
        const sp = Math.hypot(b.vx, b.vy);
        if (sp <= P.vStop && Math.abs(b.w) <= P.wStop) continue;
        // drobne drgania sklejonych magnesów (siła magnetyczna wciąż je dociska) nie przedłużają ruchu
        if (sp <= P.vContact && Math.abs(b.w) <= P.wContact && bodies.some(o => o !== b && gap(b, o) <= P.touch)) continue;
        active = true; break;
      }
      quiet = active ? 0 : quiet + 1;
      if ((step + 1) % P.sample === 0) snap();
      if (quiet >= quietSteps) { step++; break; }
    }
    let resV = 0, resW = 0; for (const b of bodies) { resV = Math.max(resV, Math.hypot(b.vx, b.vy)); resW = Math.max(resW, Math.abs(b.w)); }
    for (const b of bodies) { b.vx = b.vy = b.w = 0; }
    if (step % P.sample !== 0) snap();
    // które magnesy się poruszyły (dla nich wysyłamy klatki)
    const moved = [];
    bodies.forEach((b, i) => { if (Math.hypot(b.x - start[i].x, b.y - start[i].y) > 0.3 || Math.abs(b.a - start[i].a) > 0.01) moved.push(i); });
    return { moved, frames: frames.map(f => moved.map(i => [r1(f[i][0]), r1(f[i][1]), r2(f[i][2])])), events, seconds: r2(step * dt), resV, resW };
  }

  // Cały ruch gracza: postawienie magnesu, ruch do uspokojenia, usunięcie połączonych grup (wracają do gracza),
  // ponowny ruch pozostałych (po usunięciu grupy siły się zmieniają) itd.
  // field: [{id,x,y,a,owner}], placed: {id,x,y,a,owner}. Zwraca fazy do odtworzenia, nowe pole i listę zwróconych id.
  function playTurn(shapes, field, dims, placed) {
    const bodies = field.concat([placed]).map(m => body(shapeOf(shapes, m.id), m));
    const phases = [], returned = [];
    for (let round = 0; round < P.maxRounds && bodies.length; round++) {
      const res = settle(bodies, dims);
      const gs = groups(bodies);
      const ids = res.moved.map(i => bodies[i].id);
      const removed = [].concat(...gs);
      phases.push({ ids, frames: res.frames, events: res.events.map(e => [e[0], e[1], e[2], e[3], e[4]]), seconds: res.seconds, removed, groups: gs, resV: r1(res.resV), resW: r2(res.resW) });
      if (!removed.length) break;
      returned.push(...removed);
      for (let i = bodies.length - 1; i >= 0; i--) if (removed.includes(bodies[i].id)) bodies.splice(i, 1);
    }
    const final = bodies.map(b => ({ id: b.id, x: r1(b.x), y: r1(b.y), a: r2(b.a), owner: b.owner }));
    return { phases, final, returned: returned.sort((x, y) => x - y) };
  }

  return { P, makeShape, makeShapes, shapeOf, validPlacement, hasPlacement, preview, playTurn, settle, groups, gap, body, forces, mulberry32, inside };
});
