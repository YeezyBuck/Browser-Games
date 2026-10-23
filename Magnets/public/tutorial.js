'use strict';
// Samouczek: okno z krokami (tekst + krótka animacja na canvasie), otwierane przyciskiem "Jak grać" oraz automatycznie
// przy pierwszej wizycie. Teksty pochodzą z i18n (klucze tut.<id>.title i tut.<id>.text), więc działa po polsku i angielsku.
// Animacje nie zawierają napisów (tylko znaki graficzne), więc są takie same w obu językach. Cztery z nich liczy prawdziwy
// silnik gry (MagEngine): przyciąganie i odpychanie, podgląd stawiania, sklejenie z powrotem do ręki i mapa bezpiecznych miejsc.
// Nawigacja: przyciski, kropki kroków, strzałki lewo/prawo, Esc zamyka.
const Tutorial = (function () {
  const SEEN_KEY = 'magnets-tutorial-seen';
  const W = 320, H = 220;
  const root = document.getElementById('tutorial');
  const els = {
    title: document.getElementById('tutTitle'), step: document.getElementById('tutStep'), text: document.getElementById('tutText'),
    canvas: document.getElementById('tutCanvas'), dots: document.getElementById('tutDots'),
    prev: document.getElementById('tutPrev'), next: document.getElementById('tutNext'), close: document.getElementById('tutClose'),
  };
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
  const TAU = Math.PI * 2;
  const E = MagEngine, SH = E.makeShapes(31), OWN = Board.ring;
  const FW = 300, FH = 150;                                            // pole w animacjach (jednostki świata)
  let idx = 0, raf = 0, opener = null;

  // ---------- pomocnicze ----------
  const axisAng = sh => -Math.atan2(sh.poles[1].y - sh.poles[0].y, sh.poles[1].x - sh.poles[0].x);       // kąt, przy którym oś N->S jest pozioma
  const mag = (ctx, id, x, y, a, owner, extra) => Board.draw(ctx, E.shapeOf(SH, id), x, y, a, Object.assign({ ring: owner === undefined ? '#0d1219' : OWN[owner] }, extra));
  // Umieszcza pole świata (FW x FH) na canvasie i zwraca skalę; ctx jest przesunięty i przeskalowany.
  function plate(ctx, w, h, oy, fw, fh) {
    fw = fw || FW; fh = fh || FH;
    const k = Math.min((w - 20) / fw, (h - 20 - (oy || 0)) / fh);
    ctx.translate((w - fw * k) / 2, 10 + (oy || 0)); ctx.scale(k, k);
    const g = ctx.createLinearGradient(0, 0, fw, fh); g.addColorStop(0, '#46566b'); g.addColorStop(1, '#2d3a4b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, fw, fh);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 30; x < fw; x += 30) { ctx.moveTo(x, 0); ctx.lineTo(x, fh); }
    for (let y = 30; y < fh; y += 30) { ctx.moveTo(0, y); ctx.lineTo(fw, y); }
    ctx.stroke(); ctx.strokeStyle = 'rgba(190,215,240,0.4)'; ctx.lineWidth = 2 / k; ctx.strokeRect(0, 0, fw, fh);
    return k;
  }
  function polePos(sh, x, y, a) { return sh.poles.map(p => ({ x: x + Math.cos(a) * p.x - Math.sin(a) * p.y, y: y + Math.sin(a) * p.x + Math.cos(a) * p.y, q: p.q })); }
  function link(ctx, p, q, alpha) {                                    // zielona = przyciąganie, czerwona = odpychanie
    ctx.strokeStyle = p.q * q.q < 0 ? `rgba(110,225,150,${alpha})` : `rgba(255,120,120,${alpha})`; ctx.lineWidth = 2.2; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.setLineDash([]);
  }
  function cursor(ctx, x, y) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 15); ctx.lineTo(4, 11.5); ctx.lineTo(7, 18); ctx.lineTo(9.6, 16.8); ctx.lineTo(6.6, 10.6); ctx.lineTo(11.6, 10.6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function confetti(ctx, x, y, t) {
    for (let i = 0; i < 18; i++) {
      const a = i * 0.7 + t * 0.003, d = 10 + ((t * 0.05 + i * 9) % 46);
      ctx.fillStyle = ['#ffd66b', '#ff6a5e', '#4f8dff', '#fff'][i % 4]; ctx.fillRect(x + Math.cos(a) * d * 1.4, y + Math.sin(a) * d * 0.8 - 6, 3, 3);
    }
  }
  // Trajektoria magnesów z silnika: pozycja (x,y,a) i-tego ciała w czasie t [s]
  function trajectory(bodies, dims) {
    const init = bodies.map(b => ({ x: b.x, y: b.y, a: b.a })), res = E.settle(bodies, dims);
    return { init, res, at(i, t) {
      const k = res.moved.indexOf(i);
      if (k < 0) return init[i];
      const f = Math.min(t * 30, res.frames.length - 1), a = Math.floor(f), u = f - a, A = res.frames[a][k], B = res.frames[Math.min(a + 1, res.frames.length - 1)][k];
      return { x: A[0] + (B[0] - A[0]) * u, y: A[1] + (B[1] - A[1]) * u, a: A[2] + (B[2] - A[2]) * u };
    }, seconds: res.seconds };
  }

  // ---------- 1. cel: na zmianę stawiamy magnesy, wygrywa ten, kto pozbędzie się wszystkich ----------
  const GOAL = [[0, 52, 38, 0.4, 0], [1, 128, 44, 2.2, 1], [2, 205, 36, 1.1, 0], [3, 262, 70, 3.0, 1], [4, 60, 108, 5.1, 0], [5, 140, 112, 0.6, 1], [6, 215, 112, 2.6, 0], [7, 262, 124, 1.5, 1]];
  function sceneGoal(ctx, t, w, h) {
    ctx.fillStyle = '#232d3b'; ctx.fillRect(0, 0, w, h);
    const placed = Math.min(GOAL.length, Math.max(0, Math.floor((t - 400) / 650) + 1)), left = [10 - Math.ceil(placed / 2), 10 - Math.floor(placed / 2)];
    for (let p = 0; p < 2; p++) for (let i = 0; i < 10; i++) {                                             // dwie "ręce": rzędy znaczników
      ctx.fillStyle = i < left[p] ? OWN[p] : 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.arc(24 + i * 16, 14 + p * 14, 5, 0, TAU); ctx.fill();
    }
    ctx.save(); plate(ctx, w, h, 34);
    GOAL.slice(0, placed).forEach(([id, x, y, a, o], i) => { const age = clamp((t - 400 - i * 650) / 350, 0, 1); mag(ctx, id, x, y, a, o, { alpha: age, scale: 1.3 - 0.3 * ease(age) }); });
    ctx.restore();
    if (t > 5600) { ctx.font = '40px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🏆', 285, 34); confetti(ctx, 285, 30, t - 5600); }
  }

  // ---------- 2. bieguny: przyciąganie i odpychanie (prawdziwa fizyka) ----------
  const PFW = 190, PFH = 110;                                          // mniejsze pole = większe magnesy w tej animacji
  let poleDemo = null;
  function getPoleDemo() {
    if (poleDemo) return poleDemo;
    const dims = [PFW, PFH], sh = SH[1], a0 = axisAng(sh), R = sh.R, cy = PFH / 2;
    const mk = (flip, gapPx) => { const A = E.body(sh, { id: 1, x: PFW / 2 - gapPx / 2 - R, y: cy, a: a0 }), B = E.body(sh, { id: 11, x: PFW / 2 + gapPx / 2 + R, y: cy, a: a0 + (flip ? Math.PI : 0) }); return trajectory([A, B], dims); };
    poleDemo = { attract: mk(false, 40), repel: mk(true, 10) };
    return poleDemo;
  }
  function scenePoles(ctx, t, w, h) {
    ctx.fillStyle = '#232d3b'; ctx.fillRect(0, 0, w, h);
    const d = getPoleDemo(), part = t < 3600 ? d.attract : d.repel, tt = (t < 3600 ? t : t - 3600) / 1000, k = Math.max(0, tt - 0.5);
    ctx.save(); plate(ctx, w, h, 20, PFW, PFH);
    const sh = SH[1], P0 = part.at(0, k), P1 = part.at(1, k);
    const pa = polePos(sh, P0.x, P0.y, P0.a), pb = polePos(sh, P1.x, P1.y, P1.a);
    for (const p of pa) for (const q of pb) { const dist = Math.hypot(p.x - q.x, p.y - q.y); if (dist < 120 && (tt < 0.5 || k < part.seconds + 0.2)) link(ctx, p, q, clamp(1.15 - dist / 120, 0.1, 0.9)); }
    mag(ctx, 1, P0.x, P0.y, P0.a, 0); mag(ctx, 11, P1.x, P1.y, P1.a, 1);
    if (t < 3600 && k > part.seconds - 0.1) { const f = clamp((k - part.seconds + 0.1) / 0.5, 0, 1); ctx.strokeStyle = `rgba(255,236,170,${1 - f})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc((P0.x + P1.x) / 2, (P0.y + P1.y) / 2, 14 + 36 * f, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }

  // ---------- 3. stawianie: duch, obrót i podgląd ("nic się nie ruszy" / "coś się poruszy") ----------
  const PLACE_FIELD = [{ id: 2, x: 70, y: 60, a: 0.9 }, { id: 3, x: 215, y: 56, a: 4.0 }, { id: 6, x: 150, y: 118, a: 2.2 }];
  function scenePlace(ctx, t, w, h) {
    ctx.fillStyle = '#232d3b'; ctx.fillRect(0, 0, w, h);
    const path = [[0, 230, 130, 0.2], [1200, 190, 98, 0.2], [2200, 190, 98, 2.4], [3200, 262, 112, 2.4], [4300, 262, 112, 2.4]];
    let i = 0; while (i < path.length - 2 && t > path[i + 1][0]) i++;
    const A = path[i], B = path[i + 1], k = ease((t - A[0]) / (B[0] - A[0])), gx = A[1] + (B[1] - A[1]) * k, gy = A[2] + (B[2] - A[2]) * k, ga = A[3] + (B[3] - A[3]) * k;
    const placed = t > 4300, pv = E.preview(SH, PLACE_FIELD, [FW, FH], 0, gx, gy, ga), valid = E.validPlacement(SH, PLACE_FIELD, [FW, FH], 0, gx, gy, ga);
    ctx.save(); plate(ctx, w, h);
    PLACE_FIELD.forEach(m => mag(ctx, m.id, m.x, m.y, m.a, 1));
    if (!placed) {
      if (valid) for (const l of pv.links) { ctx.strokeStyle = l.f < 0 ? 'rgba(110,225,150,0.8)' : 'rgba(255,120,120,0.8)'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(l.ax, l.ay); ctx.lineTo(l.bx, l.by); ctx.stroke(); ctx.setLineDash([]); }
      mag(ctx, 0, gx, gy, ga, 0, { alpha: valid ? 0.8 : 0.45 });
      cursor(ctx, gx + 6, gy + 4);
    } else { const d = ease((t - 4300) / 300); mag(ctx, 0, gx, gy, ga, 0, { scale: 1 + 0.25 * (1 - d) }); }
    ctx.restore();
    const ok = valid && !pv.moves, col = !valid ? '#ff6b6b' : ok ? '#58d68d' : '#ffd24d';                  // kontrolka: bezpiecznie / coś się poruszy / nie wolno
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(24, 24, 11, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#10151c'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath();
    if (!valid) { ctx.moveTo(19, 19); ctx.lineTo(29, 29); ctx.moveTo(29, 19); ctx.lineTo(19, 29); } else if (ok) { ctx.moveTo(18.5, 24.5); ctx.lineTo(22.5, 28.5); ctx.lineTo(30, 20); } else { ctx.moveTo(24, 18); ctx.lineTo(24, 25); ctx.moveTo(24, 29.5); ctx.lineTo(24, 30); }
    ctx.stroke();
    if (t > 1200 && t < 2300) { ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(w - 30, 28, 11, -0.5, 4.4); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(w - 21, 17); ctx.lineTo(w - 33, 15); ctx.lineTo(w - 22, 27); ctx.closePath(); ctx.fill(); }   // ikona obrotu
  }

  // ---------- 4. połączenie: grupa schodzi z pola i wraca do ręki (prawdziwa fizyka) ----------
  let joinDemo = null;
  function getJoinDemo() {
    if (joinDemo) return joinDemo;
    const sh = SH[4], a0 = axisAng(sh), R = sh.R;
    const field = [{ id: 4, x: 90, y: 70, a: a0, owner: 1 }, { id: 8, x: 250, y: 125, a: 1.3, owner: 1 }], placed = { id: 14, x: 90 + 2 * R + 26, y: 70, a: a0, owner: 0 };
    joinDemo = { field, placed, res: E.playTurn(SH, field, [FW, FH], placed) };
    return joinDemo;
  }
  function sceneJoin(ctx, t, w, h) {
    ctx.fillStyle = '#232d3b'; ctx.fillRect(0, 0, w, h);
    const d = getJoinDemo(), ph = d.res.phases[0], DROP = 450, run = ph.seconds * 1000, GLOW = 800, FLY = 700;
    const tRun = t - DROP, tGlow = tRun - run, tFly = tGlow - GLOW;
    const pos = id => {
      const k = ph.ids.indexOf(id);
      if (k < 0) return (d.field.find(m => m.id === id) || d.placed);
      const f = Math.min(Math.max(0, tRun) / 1000 * 30, ph.frames.length - 1), a = Math.floor(f), u = f - a, A = ph.frames[a][k], B = ph.frames[Math.min(a + 1, ph.frames.length - 1)][k];
      return { x: A[0] + (B[0] - A[0]) * u, y: A[1] + (B[1] - A[1]) * u, a: A[2] + (B[2] - A[2]) * u };
    };
    const removed = ph.removed, gone = tFly > FLY;
    ctx.save(); const k = plate(ctx, w, h, 0), ox = (w - FW * k) / 2, oy = 10;
    d.field.forEach(m => { if (!removed.includes(m.id)) { const q = pos(m.id); mag(ctx, m.id, q.x, q.y, q.a, m.owner); } });
    if (tRun > -DROP * 0.0 && !gone && tFly <= 0) {
      for (const id of removed) {
        const p = pos(id), own = id === d.placed.id ? 0 : 1;
        if (id === d.placed.id) mag(ctx, id, p.x, p.y, p.a, own, { alpha: clamp((t) / DROP, 0, 1), scale: 1.3 - 0.3 * ease(t / DROP), glow: tGlow > 0 ? '#fff3b0' : null });
        else mag(ctx, id, p.x, p.y, p.a, own, { glow: tGlow > 0 ? '#fff3b0' : null });
      }
      if (tGlow > 0) { const f = clamp(tGlow / GLOW, 0, 1), c = pos(removed[0]); ctx.strokeStyle = `rgba(255,236,170,${1 - f})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(c.x, c.y, 16 + 60 * f, 0, TAU); ctx.stroke(); }
    }
    ctx.restore();
    // ręka gracza (dolny pasek): magnesy z pola lecą tutaj
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(0, h - 40, w, 40);
    ctx.fillStyle = OWN[0]; ctx.fillRect(0, h - 40, w, 2);
    const slots = [[w / 2 - 56, h - 20], [w / 2 + 14, h - 20], [w / 2 + 84, h - 20]], filled = reducedProgress(tFly);
    removed.forEach((id, i) => {
      if (tFly > 0) {
        const p = pos(id), sx = ox + p.x * k, sy = oy + p.y * k, f = ease(tFly / FLY), x = sx + (slots[i][0] - sx) * f, y = sy + (slots[i][1] - sy) * f;
        ctx.save(); ctx.translate(x, y); ctx.scale(0.5 + 0.5 * (1 - f) * k * 0 + 0.55 * (1 - f) * 0.5, 0.5 + 0.55 * (1 - f) * 0.5); ctx.translate(-x, -y); mag(ctx, id, x, y, p.a * (1 - f) + axisAng(E.shapeOf(SH, id)) * f, 0, { noShadow: true }); ctx.restore();
      }
    });
    if (filled) { ctx.fillStyle = '#fff'; ctx.font = 'bold 20px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('+2', w - 36, h - 14); }
  }
  const reducedProgress = tFly => tFly > 650;

  // ---------- 5. tury i koniec: ręce, powrót magnesów, zwycięzca ----------
  const TURNS = [[600, 0, -1], [1250, 1, -1], [1900, 0, -1], [2550, 1, 2], [3200, 0, -1]];                  // [czas, gracz, zmiana liczby magnesów w ręku]
  function sceneTurns(ctx, t, w, h) {
    ctx.fillStyle = '#232d3b'; ctx.fillRect(0, 0, w, h);
    const hand = [3, 3], flash = [0, 0, 0, 0];
    TURNS.forEach(([at, p, dlt]) => { if (t >= at) { hand[p] += dlt; if (t - at < 500) flash[p] = 1 - (t - at) / 500; } });
    const lastAt = TURNS.filter(x => t >= x[0]).pop(), turnP = lastAt ? 1 - lastAt[1] : 0;
    for (let p = 0; p < 2; p++) {
      const y = 62 + p * 90;
      ctx.strokeStyle = p === turnP && t < 3700 ? '#fff' : 'rgba(255,255,255,0.18)'; ctx.lineWidth = p === turnP && t < 3700 ? 3 : 1.5; ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(14, y - 34, w - 28, 68, 12) : ctx.rect(14, y - 34, w - 28, 68); ctx.fill(); ctx.stroke();
      ctx.fillStyle = OWN[p]; ctx.beginPath(); ctx.arc(34, y - 18, 7, 0, TAU); ctx.fill();
      for (let i = 0; i < hand[p]; i++) {
        const fresh = p === 1 && hand[p] > 3 && i >= hand[p] - 2 && flash[p] > 0;
        mag(ctx, 1 + (i % 4), 70 + i * 42, y + 6, 0.2 + i * 0.9, undefined, { scale: 0.62 + (fresh ? 0.2 * flash[p] : 0), noShadow: true, glow: fresh ? '#fff3b0' : null });
      }
    }
    if (t > 3300) { ctx.font = '40px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🏆', w - 40, 60); confetti(ctx, w - 40, 56, t - 3300); }
    if (t > 2550 && t < 3200) { ctx.fillStyle = '#fff'; ctx.font = 'bold 18px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('+2', w - 36, 150); }
  }

  // ---------- 6. wskazówki: mapa bezpiecznych miejsc (prawdziwy podgląd z silnika) ----------
  const TFW = 520, TFH = 260, TIP_FIELD = [{ id: 1, x: 105, y: 70, a: 0.6 }, { id: 5, x: 410, y: 85, a: 2.5 }, { id: 2, x: 255, y: 195, a: 4.4 }];
  let tipMap = null;
  function getTipMap() {
    if (tipMap) return tipMap;
    const cells = [], step = 13;
    for (let y = step; y < TFH; y += step) for (let x = step; x < TFW; x += step) {
      if (!E.validPlacement(SH, TIP_FIELD, [TFW, TFH], 3, x, y, 0.3)) continue;
      cells.push([x, y, E.preview(SH, TIP_FIELD, [TFW, TFH], 3, x, y, 0.3).moves]);
    }
    return (tipMap = { cells, step });
  }
  function sceneTips(ctx, t, w, h) {
    ctx.fillStyle = '#232d3b'; ctx.fillRect(0, 0, w, h);
    const d = getTipMap();
    ctx.save(); plate(ctx, w, h, 0, TFW, TFH);
    for (const [x, y, moves] of d.cells) { ctx.fillStyle = moves ? 'rgba(255,180,60,0.38)' : 'rgba(80,220,140,0.45)'; ctx.fillRect(x - d.step / 2, y - d.step / 2, d.step, d.step); }
    TIP_FIELD.forEach(m => mag(ctx, m.id, m.x, m.y, m.a, 1));
    const u = (t % 4200) / 4200, gx = 30 + (TFW - 60) * u, gy = TFH / 2 + Math.sin(u * TAU * 1.5) * 70;
    if (E.validPlacement(SH, TIP_FIELD, [TFW, TFH], 3, gx, gy, 0.3)) mag(ctx, 3, gx, gy, 0.3, 0, { alpha: 0.75 });
    cursor(ctx, gx + 4, gy + 3);
    ctx.restore();
  }

  const PAGES = [
    { id: 'goal', scene: sceneGoal, loop: 7600, still: 6400 },
    { id: 'poles', scene: scenePoles, loop: 7200, still: 2600 },
    { id: 'place', scene: scenePlace, loop: 5600, still: 3000 },
    { id: 'join', scene: sceneJoin, loop: 6600, still: 5200 },
    { id: 'turns', scene: sceneTurns, loop: 5600, still: 4400 },
    { id: 'tips', scene: sceneTips, loop: 4200, still: 1800 },
  ];

  // ---------- tekst: akapity, punktory ("• ") i pogrubienia (**tekst**), wszystko jako węzły DOM (bez innerHTML) ----------
  function inline(node, s) {
    s.split('**').forEach((part, i) => {
      if (!part) return;
      if (i % 2) { const b = document.createElement('strong'); b.textContent = part; node.appendChild(b); }
      else node.appendChild(document.createTextNode(part));
    });
  }
  function fillText(el, text) {
    el.textContent = '';
    let list = null;
    text.split('\n').forEach(line => {
      const bullet = line.startsWith('• ');
      const node = document.createElement(bullet ? 'li' : 'p');
      inline(node, bullet ? line.slice(2) : line);
      if (bullet) { if (!list) { list = document.createElement('ul'); el.appendChild(list); } list.appendChild(node); }
      else { list = null; el.appendChild(node); }
    });
  }

  // ---------- animacja ----------
  function stopAnim() { cancelAnimationFrame(raf); raf = 0; }
  function startAnim() {
    stopAnim();
    const page = PAGES[idx], cv = els.canvas;
    cv.hidden = !page.scene;
    if (!page.scene) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d');
    const t0 = performance.now();
    const frame = now => {
      const t = reduced() ? page.still : Math.max(0, now - t0) % page.loop;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      ctx.save(); page.scene(ctx, t, W, H); ctx.restore();
      raf = reduced() ? 0 : requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  // ---------- okno ----------
  function render() {
    const page = PAGES[idx];
    els.title.textContent = t('tut.' + page.id + '.title');
    els.step.textContent = t('tut.step', idx + 1, PAGES.length);
    fillText(els.text, t('tut.' + page.id + '.text'));
    els.dots.textContent = '';
    PAGES.forEach((p, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tut-dot' + (i === idx ? ' active' : '');
      b.setAttribute('aria-label', t('tut.goto', i + 1));
      if (i === idx) b.setAttribute('aria-current', 'step');
      b.addEventListener('click', () => go(i));
      els.dots.appendChild(b);
    });
    els.prev.disabled = idx === 0;
    els.next.textContent = t(idx === PAGES.length - 1 ? 'tut.done' : 'tut.next');
    startAnim();
  }
  function go(i) { idx = clamp(i, 0, PAGES.length - 1); render(); }
  function open(start) {
    opener = document.activeElement;
    idx = clamp(start || 0, 0, PAGES.length - 1);
    root.hidden = false;
    render();
    els.next.focus();
  }
  function close() {
    root.hidden = true;
    stopAnim();
    try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) {}
    if (opener && opener.focus) opener.focus();
  }
  const isOpen = () => !root.hidden;

  els.next.addEventListener('click', () => { if (idx >= PAGES.length - 1) close(); else go(idx + 1); });
  els.prev.addEventListener('click', () => go(idx - 1));
  els.close.addEventListener('click', close);
  root.addEventListener('click', e => { if (e.target === root) close(); });          // kliknięcie w tło zamyka
  addEventListener('keydown', e => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); if (idx < PAGES.length - 1) go(idx + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); }
    else if (e.key === 'Tab') {                                                      // fokus zostaje wewnątrz okna
      const f = [...root.querySelectorAll('button:not([disabled])')];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  const btn = document.getElementById('tutBtn');
  if (btn) btn.addEventListener('click', () => open(0));

  return {
    open, close, isOpen,
    refresh() { if (isOpen()) render(); },                                           // po zmianie języka
    // Pierwsza wizyta: pokazujemy samouczek raz. Bez dostępu do pamięci przeglądarki nie otwieramy go sami (żeby nie męczyć).
    autoOpen() {
      let seen = true;
      try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch (e) { seen = true; }
      if (!seen) setTimeout(() => { if (!isOpen()) open(0); }, 500);
    },
    get page() { return idx; }, get pages() { return PAGES.length; },
  };
})();
