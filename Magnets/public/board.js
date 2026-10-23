'use strict';
// Pole z magnesami: rysowanie stalowej płyty i magnesów, "duch" stawianego magnesu z podglądem sił, odtwarzanie tury
// (upadek, ruch, sklejenie i zwrot do ręki) oraz sterowanie myszą i dotykiem. Fizykę i reguły liczy serwer
// (public/engine.js jest wspólny), tu tylko rysujemy i zbieramy parametry postawienia.
const Board = (function () {
  const cv = document.getElementById('board'), ctx = cv.getContext('2d');
  const E = MagEngine, P = E.P, TAU = Math.PI * 2, M = 26;             // M: margines płyty wokół pola (jednostki świata)
  const OWN = ['#ffb347', '#46d6e3'];                                  // obwódka magnesów postawionych przez gracza 0 i 1
  const STEP = Math.PI / 12;                                           // krok obrotu: 15 stopni
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let W = 300, H = 200, dpr = 1, scale = 1, dims = [640, 400];
  let shapes = E.makeShapes(1), mags = new Map(), particles = [];
  let me = 0, turn = null, canPlace = false, selId = null, ang = 0, pointer = null, ghost = null, active = false;
  let anim = null, raf = 0, last = 0;
  let onPlace = null, onEvent = null, onRemoved = null;
  const lastEv = { wall: -1, hit: -1 };

  // ---------- układ ----------
  function setDims(d) {
    dims = d;
    cv.style.aspectRatio = `${d[0] + 2 * M} / ${d[1] + 2 * M}`;
    cv.style.maxWidth = (d[0] + 2 * M) * 1.9 + 'px';
    cv.style.width = `min(100%, calc(62vh * ${((d[0] + 2 * M) / (d[1] + 2 * M)).toFixed(4)}))`;      // plansza nie wyższa niż ok. 62% okna, żeby ręka z magnesami była widoczna
    resize();
  }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(160, cv.clientWidth); H = Math.max(120, cv.clientHeight);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    scale = W / (dims[0] + 2 * M);
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (cv.clientWidth) resize(); }).observe(cv);
  addEventListener('resize', () => { if (cv.clientWidth) resize(); });
  const shapeOf = id => E.shapeOf(shapes, id);
  const fieldList = () => [...mags.values()].filter(m => !m.leaving).map(m => ({ id: m.id, x: m.x, y: m.y, a: m.a }));

  // ---------- rysowanie magnesu ----------
  function drawMagnet(g, sh, x, y, a, o) {
    o = o || {};
    const [pn, ps] = sh.poles;
    g.save(); g.translate(x, y); g.rotate(a); if (o.scale) g.scale(o.scale, o.scale);
    g.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    if (!o.noShadow) { g.fillStyle = 'rgba(0,0,0,0.34)'; for (const k of sh.circles) { g.beginPath(); g.arc(k.x + 2.5, k.y + 4, k.r + 1.2, 0, TAU); g.fill(); } }
    if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = 16; }
    g.fillStyle = o.ring || '#0d1219'; for (const k of sh.circles) { g.beginPath(); g.arc(k.x, k.y, k.r + 2.4, 0, TAU); g.fill(); }
    g.shadowBlur = 0;
    g.fillStyle = '#0d1219'; for (const k of sh.circles) { g.beginPath(); g.arc(k.x, k.y, k.r + 0.9, 0, TAU); g.fill(); }
    const gr = g.createLinearGradient(pn.x, pn.y, ps.x, ps.y);                       // czerwony koniec N, niebieski koniec S
    gr.addColorStop(0, '#ff7a6e'); gr.addColorStop(0.42, '#d9473c'); gr.addColorStop(0.58, '#3d6fd6'); gr.addColorStop(1, '#6fa2ff');
    g.fillStyle = gr; for (const k of sh.circles) { g.beginPath(); g.arc(k.x, k.y, k.r, 0, TAU); g.fill(); }
    g.restore();
    const c = Math.cos(a), s = Math.sin(a), al = o.alpha === undefined ? 1 : o.alpha;
    g.save(); g.globalAlpha = al;                                                    // blask (światło z lewej góry, niezależny od obrotu) i znaczniki biegunów
    g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 1.5; g.lineCap = 'round';
    for (const k of sh.circles) { g.beginPath(); g.arc(x + c * k.x - s * k.y, y + s * k.x + c * k.y, k.r * 0.7, Math.PI * 1.05, Math.PI * 1.55); g.stroke(); }
    g.font = 'bold 8.5px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const p of sh.poles) {
      const px = x + c * p.x - s * p.y, py = y + s * p.x + c * p.y;
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(px, py, 5.2, 0, TAU); g.fill();
      g.fillStyle = p.q > 0 ? '#c0352b' : '#2457b8'; g.fillText(p.q > 0 ? 'N' : 'S', px, py + 0.5);
    }
    g.restore();
  }

  // Mały rysunek magnesu (do przycisków w ręku): oś N-S pozioma.
  function drawMini(canvas, id) {
    const g = canvas.getContext('2d'), sh = shapeOf(id), w = canvas.width, h = canvas.height;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
    const a = -Math.atan2(sh.poles[1].y - sh.poles[0].y, sh.poles[1].x - sh.poles[0].x), k = Math.min(w, h) / (2 * sh.R + 14);
    g.translate(w / 2, h / 2); g.scale(k, k);
    drawMagnet(g, sh, 0, 0, a, { noShadow: true });
  }

  // ---------- płyta ----------
  function drawPlate() {
    const [fw, fh] = dims;
    ctx.fillStyle = '#0a0f15'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-M + 4, -M + 4, fw + 2 * M - 8, fh + 2 * M - 8, 18) : ctx.rect(-M + 4, -M + 4, fw + 2 * M - 8, fh + 2 * M - 8); ctx.fill();
    const g = ctx.createLinearGradient(0, 0, fw, fh); g.addColorStop(0, '#46566b'); g.addColorStop(0.5, '#38475a'); g.addColorStop(1, '#2d3a4b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, fw, fh);
    ctx.strokeStyle = 'rgba(255,255,255,0.045)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 40; x < fw; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, fh); }
    for (let y = 40; y < fh; y += 40) { ctx.moveTo(0, y); ctx.lineTo(fw, y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 6; ctx.strokeRect(0, 0, fw, fh);                       // wewnętrzny cień krawędzi
    ctx.strokeStyle = 'rgba(190,215,240,0.28)'; ctx.lineWidth = 1.5; ctx.strokeRect(-1, -1, fw + 2, fh + 2);
    ctx.fillStyle = 'rgba(190,215,240,0.35)';
    for (const [x, y] of [[-M / 2, -M / 2], [fw + M / 2, -M / 2], [-M / 2, fh + M / 2], [fw + M / 2, fh + M / 2]]) { ctx.beginPath(); ctx.arc(x, y, 3.2, 0, TAU); ctx.fill(); }
  }

  // ---------- cząstki ----------
  function sparks(x, y, n, color) {
    if (reduced()) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = 50 + Math.random() * 130;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.35 + Math.random() * 0.5, size: 1.6 + Math.random() * 1.8, color });
    }
    particles.push({ x, y, vx: 0, vy: 0, life: 0, max: 0.45, ring: true, color });
  }
  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life += dt;
      if (p.life >= p.max) { particles.splice(i, 1); continue; }
      const a = 1 - p.life / p.max;
      if (p.ring) { ctx.strokeStyle = `rgba(${p.color},${a * 0.85})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p.x, p.y, 10 + 46 * p.life / p.max, 0, TAU); ctx.stroke(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93;
      ctx.fillStyle = `rgba(${p.color},${a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.7), 0, TAU); ctx.fill();
    }
  }

  // ---------- odtwarzanie tury ----------
  const DROP = 0.45, FADE = 0.7;
  // last: opis ruchu z serwera ({ placed, phases, returned, age }); onEnd wywołujemy po zakończeniu.
  function play(lastTurn, onEnd) {
    const pl = lastTurn.placed;
    mags.set(pl.id, { id: pl.id, x: pl.x, y: pl.y, a: pl.a, owner: pl.owner, alpha: 0, scale: 1.35 });
    anim = { lt: lastTurn, stage: 'drop', t: 0, phase: 0, ev: 0, onEnd, silent: true };
    let skip = Math.max(0, (lastTurn.age || 0) / 1000);                                    // odświeżenie strony w trakcie ruchu: dołączamy w połowie
    while (anim && skip > 0) { const d = Math.min(skip, 1 / 30); skip -= d; advance(d); }
    if (anim) anim.silent = false;
    if (reduced() && anim) { let guard = 0; while (anim && guard++ < 5000) advance(0.05); }
  }
  function stop() { anim = null; }
  function setPhasePositions(ph, f) {
    ph.ids.forEach((id, k) => { const m = mags.get(id), fr = ph.frames[f][k]; if (m && fr) { m.x = fr[0]; m.y = fr[1]; m.a = fr[2]; } });
  }
  function finishAnim() { const a = anim, end = a.onEnd; anim = null; if (end) end(); }
  function nextPhase() { anim.phase++; anim.t = 0; anim.ev = 0; anim.stage = 'phase'; if (anim.phase >= anim.lt.phases.length) finishAnim(); }
  function advance(dt) {
    const a = anim, lt = a.lt;
    if (a.stage === 'drop') {
      a.t += dt; const k = clamp(a.t / DROP, 0, 1), m = mags.get(lt.placed.id);
      if (m) { m.alpha = k; m.scale = 1.35 - 0.35 * k * k; }
      if (a.t >= DROP) { if (m) { m.alpha = 1; m.scale = 1; } if (!a.silent && onEvent) onEvent('place', 0.6); a.stage = 'phase'; a.t = 0; a.phase = 0; a.ev = 0; if (!lt.phases.length) finishAnim(); }
      return;
    }
    const ph = lt.phases[a.phase];
    if (a.stage === 'phase') {
      a.t += dt;
      const f = Math.min(Math.floor(a.t * 30), ph.frames.length - 1), u = Math.min(a.t * 30, ph.frames.length - 1) - f, f2 = Math.min(f + 1, ph.frames.length - 1);
      ph.ids.forEach((id, k) => {                                                       // interpolacja między klatkami
        const m = mags.get(id), A = ph.frames[f][k], B = ph.frames[f2][k];
        if (m && A && B) { m.x = A[0] + (B[0] - A[0]) * u; m.y = A[1] + (B[1] - A[1]) * u; m.a = A[2] + (B[2] - A[2]) * u; }
      });
      while (a.ev < ph.events.length && ph.events[a.ev][0] / 30 <= a.t) {
        const e = ph.events[a.ev++], kind = e[1] === 2 ? 'hit' : 'wall', nowS = performance.now();
        if (!a.silent && onEvent && nowS - lastEv[kind] > 70) { lastEv[kind] = nowS; onEvent(kind, e[2]); }
      }
      if (a.t >= ph.seconds) {
        setPhasePositions(ph, ph.frames.length - 1);
        if (ph.removed.length) {                                                        // połączone magnesy: błysk, potem odlatują do ręki
          a.stage = 'remove'; a.t = 0;
          for (const id of ph.removed) { const m = mags.get(id); if (m) { m.leaving = true; if (!a.silent) sparks(m.x, m.y, 14, '255,236,170'); } }
          if (!a.silent && onEvent) onEvent('join', Math.min(1, ph.removed.length / 4));
        } else nextPhase();
      }
      return;
    }
    if (a.stage === 'remove') {
      a.t += dt; const k = clamp(a.t / FADE, 0, 1);
      for (const id of ph.removed) { const m = mags.get(id); if (m) { m.alpha = 1 - k; m.scale = 1 + 0.3 * k; m.glow = true; } }
      if (a.t >= FADE) {
        for (const id of ph.removed) mags.delete(id);
        if (!a.silent && onRemoved) onRemoved(ph.removed);
        nextPhase();
      }
    }
  }

  // ---------- duch stawianego magnesu ----------
  function updateGhost() {
    if (!canPlace || selId === null || !pointer) { ghost = null; return; }
    const x = pointer.x, y = pointer.y, list = fieldList();
    const valid = E.validPlacement(shapes, list, dims, selId, x, y, ang);
    ghost = { x, y, a: ang, valid, pv: valid ? E.preview(shapes, list, dims, selId, x, y, ang) : null };
  }
  // Współrzędne świata pod kursorem. Dla dotyku magnes jest pokazywany nieco nad palcem, żeby palec go nie zasłaniał.
  function world(e) {
    const r = cv.getBoundingClientRect(), lift = e.pointerType === 'mouse' ? 0 : 46 / scale;
    return { x: (e.clientX - r.left) / scale - M, y: (e.clientY - r.top) / scale - M - lift };
  }
  function tryPlace() {
    if (!canPlace || selId === null || !ghost || !ghost.valid) return false;
    if (onPlace) onPlace({ id: selId, x: ghost.x, y: ghost.y, a: ghost.a });
    return true;
  }
  cv.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons) { pointer = world(e); updateGhost(); } });
  cv.addEventListener('pointerdown', e => {
    if (!canPlace || (e.pointerType === 'mouse' && e.button !== 0)) return;
    pointer = world(e); updateGhost();
    if (e.pointerType === 'mouse') tryPlace();                                          // mysz i touchpad: kliknięcie stawia
    else { try { cv.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); }   // dotyk: przeciągasz magnes, puszczenie palca go stawia
  });
  cv.addEventListener('pointerup', e => {
    if (e.pointerType === 'mouse' || !canPlace) return;
    pointer = world(e); updateGhost();
    tryPlace();
    pointer = null; ghost = null;                                                       // niedozwolone miejsce: nic się nie dzieje, próbujesz od nowa
  });
  cv.addEventListener('pointercancel', e => { if (e.pointerType !== 'mouse') { pointer = null; ghost = null; } });
  cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { pointer = null; ghost = null; } });
  cv.addEventListener('wheel', e => { if (canPlace) { e.preventDefault(); rotate(e.deltaY > 0 ? STEP : -STEP); } }, { passive: false });
  cv.addEventListener('contextmenu', e => { if (canPlace) { e.preventDefault(); rotate(STEP); } });
  addEventListener('keydown', e => {
    if (!canPlace || /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '')) return;
    if (e.key === 'ArrowLeft' || e.key === 'q' || e.key === 'Q') { e.preventDefault(); rotate(-STEP); }
    else if (e.key === 'ArrowRight' || e.key === 'e' || e.key === 'E') { e.preventDefault(); rotate(STEP); }
  });
  function rotate(d) { ang = (ang + d + TAU) % TAU; updateGhost(); }

  function drawGhost() {
    const g = ghost, sh = shapeOf(selId);
    if (g.pv) {
      for (const l of g.pv.links) {                                                       // linie oddziaływania biegunów
        const strong = clamp(Math.abs(l.f) / 4000, 0.15, 1);
        ctx.strokeStyle = l.f < 0 ? `rgba(110,225,150,${0.25 + 0.6 * strong})` : `rgba(255,120,120,${0.25 + 0.6 * strong})`;
        ctx.lineWidth = 1 + 2.2 * strong; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(l.ax, l.ay); ctx.lineTo(l.bx, l.by); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    drawMagnet(ctx, sh, g.x, g.y, g.a, { alpha: g.valid ? 0.82 : 0.55, ring: g.valid ? OWN[me] : '#ff4d4d' });
    if (g.pv && g.pv.accel > P.mu) {                                                     // strzałka siły wypadkowej na stawianym magnesie
      const l = Math.hypot(g.pv.fx, g.pv.fy) || 1, len = clamp(g.pv.accel * 0.12, 18, 70), ux = g.pv.fx / l, uy = g.pv.fy / l;
      ctx.strokeStyle = ctx.fillStyle = '#ffd24d'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x + ux * len, g.y + uy * len); ctx.stroke();
      const ex = g.x + ux * len, ey = g.y + uy * len, aa = Math.atan2(uy, ux);
      ctx.beginPath(); ctx.moveTo(ex + Math.cos(aa) * 8, ey + Math.sin(aa) * 8); ctx.lineTo(ex + Math.cos(aa + 2.5) * 7, ey + Math.sin(aa + 2.5) * 7); ctx.lineTo(ex + Math.cos(aa - 2.5) * 7, ey + Math.sin(aa - 2.5) * 7); ctx.closePath(); ctx.fill();
    }
  }
  function pill(text, color) {
    ctx.font = 'bold 14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 24;
    ctx.fillStyle = 'rgba(10,14,20,0.78)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(W / 2 - w / 2, 8, w, 28, 14) : ctx.rect(W / 2 - w / 2, 8, w, 28); ctx.fill();
    ctx.fillStyle = color; ctx.fillText(text, W / 2, 22.5);
  }

  // ---------- pętla rysowania ----------
  function frame(now) {
    raf = active ? requestAnimationFrame(frame) : 0;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    if (!cv.clientWidth) return;
    if (cv.width !== Math.round(cv.clientWidth * dpr)) resize();
    if (anim) advance(dt);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * M * scale, dpr * M * scale);
    drawPlate();
    const order = [...mags.values()].sort((a, b) => a.id - b.id);
    for (const m of order) drawMagnet(ctx, shapeOf(m.id), m.x, m.y, m.a, { ring: OWN[m.owner] || '#0d1219', alpha: m.alpha === undefined ? 1 : m.alpha, scale: m.scale, glow: m.glow ? '#fff3b0' : null });
    if (!anim && ghost && canPlace && selId !== null) drawGhost();
    drawParticles(dt);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!anim && canPlace && selId !== null && ghost) {
      if (!ghost.valid) pill(t('hud.blocked'), '#ff8a8a');
      else if (ghost.pv && ghost.pv.moves) pill(t('hud.moves'), '#ffd24d');
      else pill(t('hud.safe'), '#7be3a0');
    } else if (!anim && canPlace && selId === null) pill(t('hud.hint'), '#eaf0f6');
  }

  return {
    setDims, drawMini, draw: drawMagnet, ring: OWN,
    setShapes(seed) { shapes = E.makeShapes(seed); },
    setField(list) { mags = new Map((list || []).map(m => [m.id, { id: m.id, x: m.x, y: m.y, a: m.a, owner: m.owner }])); updateGhost(); },
    setMe(i) { me = i; },
    setTurn(i) { turn = i; },
    setSelected(id) { selId = id; if (id !== null && ang === 0) ang = 0; updateGhost(); },
    setCanPlace(b) { canPlace = !!b; cv.classList.toggle('can-place', canPlace); if (!canPlace) ghost = null; else updateGhost(); },
    rotate, play, stop, confirm: tryPlace,
    setActive(b) { active = b; if (b && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } },
    onPlace(fn) { onPlace = fn; }, onEvent(fn) { onEvent = fn; }, onRemoved(fn) { onRemoved = fn; },
    get animating() { return !!anim; },
    info() { return { W, H, scale, dims, count: mags.size, canPlace, animating: !!anim, ghost: ghost ? { x: ghost.x, y: ghost.y, a: ghost.a, valid: ghost.valid, moves: ghost.pv ? ghost.pv.moves : null } : null, ids: [...mags.keys()] }; },
    // do testów: współrzędne ekranowe (względem strony) punktu świata
    toScreen(x, y) { const r = cv.getBoundingClientRect(); return { x: r.left + (x + M) * scale, y: r.top + (y + M) * scale }; },
    fieldPositions() { return [...mags.values()].map(m => ({ id: m.id, x: m.x, y: m.y, a: m.a })); },
  };
})();
