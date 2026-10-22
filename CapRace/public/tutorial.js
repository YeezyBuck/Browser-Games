'use strict';
// Samouczek: okno z krokami (tekst + krótka animacja na canvasie), otwierane przyciskiem "Jak grać" oraz automatycznie
// przy pierwszej wizycie. Teksty pochodzą z i18n (klucze tut.<id>.title i tut.<id>.text), więc działa po polsku i angielsku.
// Animacje nie zawierają napisów (tylko znaki graficzne), więc są takie same w obu językach. Animacja "tor i bandy"
// korzysta z prawdziwego silnika gry (CapEngine), więc pokazuje dokładnie to, co dzieje się w partii.
// Nawigacja: przyciski, kropki kroków, strzałki lewo/prawo, Esc zamyka.
const Tutorial = (function () {
  const SEEN_KEY = 'caprace-tutorial-seen';
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
  let idx = 0, raf = 0, opener = null;

  // ---------- rysowanie ----------
  const C = { red: '#e8433a', blue: '#3b8ff0', chalk: '#f4f1e8', road: '#3a3d45', asphalt: '#2c2f36' };
  function bg(ctx, w, h) { ctx.fillStyle = C.asphalt; ctx.fillRect(0, 0, w, h); }
  function road(ctx, pts, halfW) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = 'rgba(244,241,232,0.92)'; ctx.lineWidth = 2 * halfW + 4; ctx.stroke();
    ctx.strokeStyle = C.road; ctx.lineWidth = 2 * halfW - 2; ctx.stroke();
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16), f = c => clamp(Math.round(c + amt), 0, 255);
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
  function cap(ctx, x, y, r, color, rot) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x + r * 0.2, y + r * 0.28, r, r * 0.94, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = shade(color, -60); ctx.beginPath(); ctx.arc(x, y, r * 1.03, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 1, x, y, r);
    g.addColorStop(0, shade(color, 70)); g.addColorStop(0.6, color); g.addColorStop(1, shade(color, -35));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 0.84, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 3; i++) { const a = (rot || 0) + i * TAU / 3; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.4, r * 0.1, 0, TAU); ctx.fill(); }
  }
  function checker(ctx, x, y, ang, halfW, cell) {                  // szachownica mety w poprzek toru
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const rows = Math.ceil(2 * halfW / cell);
    for (let r = 0; r < rows; r++) for (let c = 0; c < 2; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#15161a' : '#f4f1e8';
      ctx.fillRect(c * cell - cell, -halfW + r * cell, cell, Math.min(cell, halfW - (-halfW + r * cell)));
    }
    ctx.restore();
  }
  function cursor(ctx, x, y, down) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 17); ctx.lineTo(4.5, 13); ctx.lineTo(8, 20); ctx.lineTo(11, 18.5); ctx.lineTo(7.5, 12); ctx.lineTo(13, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (down) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(0, 0, 9 + 2, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }
  function arrow(ctx, x, y, ang, len, color, wd) {
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = wd || 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ex + Math.cos(ang) * 10, ey + Math.sin(ang) * 10); ctx.lineTo(ex + Math.cos(ang + 2.5) * 9, ey + Math.sin(ang + 2.5) * 9); ctx.lineTo(ex + Math.cos(ang - 2.5) * 9, ey + Math.sin(ang - 2.5) * 9); ctx.closePath(); ctx.fill();
  }
  function confetti(ctx, x, y, t) {
    for (let i = 0; i < 18; i++) {
      const a = i * 0.7 + t * 0.003, d = 10 + ((t * 0.05 + i * 9) % 46);
      ctx.fillStyle = ['#ffd66b', C.red, C.blue, '#fff'][i % 4]; ctx.fillRect(x + Math.cos(a) * d * 1.4, y + Math.sin(a) * d * 0.8 - 6, 3, 3);
    }
  }
  const hue = p => `hsl(${Math.round(120 - 120 * p)},90%,58%)`;

  // ---------- 1. cel: wyścig po krętym torze ----------
  const GOAL_PTS = []; for (let i = 0; i <= 48; i++) { const u = i / 48; GOAL_PTS.push([30 + 260 * u, 112 + 48 * Math.sin(u * 5.4)]); }
  const goalAt = u => { const f = clamp(u, 0, 1) * 48, i = Math.min(47, Math.floor(f)), k = f - i; return [GOAL_PTS[i][0] + (GOAL_PTS[i + 1][0] - GOAL_PTS[i][0]) * k, GOAL_PTS[i][1] + (GOAL_PTS[i + 1][1] - GOAL_PTS[i][1]) * k]; };
  const flicks = (list, t) => list.reduce((s, [at, gain]) => s + gain * ease((t - at) / 650), 0);
  function sceneGoal(ctx, t, w, h) {
    bg(ctx, w, h); road(ctx, GOAL_PTS, 26);
    const e = GOAL_PTS[48], p = GOAL_PTS[47]; checker(ctx, e[0], e[1], Math.atan2(e[1] - p[1], e[0] - p[0]), 26, 10);
    const ur = flicks([[500, 0.23], [1700, 0.24], [2900, 0.25], [4100, 0.27]], t), ub = flicks([[1100, 0.22], [2300, 0.22], [3500, 0.21], [4700, 0.2]], t);
    const [bx, by] = goalAt(Math.min(ub, 0.9)), [rx, ry] = goalAt(Math.min(ur, 0.985));
    cap(ctx, bx, by + 9, 10, C.blue, ub * 30); cap(ctx, rx, ry - 9, 10, C.red, ur * 30);
    if (ur >= 0.97) confetti(ctx, 285, 100, t - 4800);
  }

  // ---------- 2. pstrykanie: naciśnij, odciągnij, puść ----------
  function sceneFlick(ctx, t, w, h) {
    bg(ctx, w, h); road(ctx, [[20, 150], [300, 70]], 44);
    const cx = 120, cy = 128, hitX = cx + 8, hitY = cy - 6, pull = [-62, 38];                       // kursor odciągany w lewo-dół, kapsel poleci w prawo-góra
    const dirX = -pull[0], dirY = -pull[1], dl = Math.hypot(dirX, dirY), ang = Math.atan2(dirY, dirX);
    const kPull = ease((t - 1100) / 1500), released = t >= 2900, fly = ease((t - 2900) / 1100);
    let x = cx, y = cy;
    if (released) { x = cx + (dirX / dl) * 150 * fly; y = cy + (dirY / dl) * 150 * fly; }
    if (t < 2900) {                                                                                  // przed puszczeniem: strzałka, gumka, pasek mocy
      const px = hitX + pull[0] * kPull, py = hitY + pull[1] * kPull;
      if (t >= 1000) { ctx.strokeStyle = 'rgba(244,241,232,0.7)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(hitX, hitY); ctx.lineTo(px, py); ctx.stroke(); ctx.setLineDash([]); }
      if (kPull > 0.05) arrow(ctx, cx + dirX / dl * 22, cy + dirY / dl * 22, ang, 20 + 70 * kPull, hue(kPull), 4);
      cap(ctx, cx, cy, 20, C.red, 0);
      ctx.fillStyle = '#ffe14d'; ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(hitX, hitY, 3.5, 0, TAU); ctx.fill(); ctx.stroke();
      const cur = t < 600 ? [hitX + 70 - 70 * ease(t / 600), hitY + 40 - 40 * ease(t / 600)] : [px, py];
      cursor(ctx, cur[0], cur[1], t >= 600);
    } else {
      for (let i = 1; i < 6; i++) { const f = fly * i / 6; ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - i / 6)})`; ctx.beginPath(); ctx.arc(cx + dirX / dl * 150 * f, cy + dirY / dl * 150 * f, 2.5, 0, TAU); ctx.fill(); }
      cap(ctx, x, y, 20, C.red, fly * 6);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(40, 196, 240, 9);                          // pasek mocy
    const pw = t < 2900 ? kPull : (1 - ease((t - 3000) / 600)) * 1;
    ctx.fillStyle = hue(clamp(pw, 0, 1)); ctx.fillRect(40, 196, 240 * clamp(pw, 0, 1), 9);
  }

  // ---------- 3. rotacja: uderzenie z boku wygina tor ----------
  function curve(sgn) {
    const pts = []; let x = 0, y = 0, hd = -Math.PI / 2;
    for (let i = 0; i <= 40; i++) { const u = i / 40; pts.push([x, y]); hd = -Math.PI / 2 + sgn * 1.05 * (1 - Math.pow(1 - u, 2)); const step = 3.6 * (1 - u * 0.75); x += Math.cos(hd) * step * 1.0; y += Math.sin(hd) * step; }
    return pts;
  }
  const CURVES = { L: curve(-1), R: curve(1) };
  function sceneSpin(ctx, t, w, h) {
    bg(ctx, w, h);
    [{ ox: 80, pts: CURVES.L, dot: 1 }, { ox: 240, pts: CURVES.R, dot: -1 }].forEach(panel => {
      const sx = panel.ox, sy = 176, k = ease((t % 3600 - 300) / 1600), n = panel.pts.length - 1;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      panel.pts.forEach(([px, py], i) => { if (i % 2 === 0 && i > 1) { ctx.beginPath(); ctx.arc(sx + px, sy + py, 2.2, 0, TAU); ctx.fill(); } });
      const [px, py] = panel.pts[Math.min(n, Math.round(k * n))];
      const moving = k > 0 && k < 1;
      if (k <= 0 || t % 3600 > 2800) {                                                              // kapsel na starcie z zaznaczonym punktem uderzenia
        const a = t % 3600 > 2800 ? Math.min(1, (t % 3600 - 2800) / 300) : 1;
        ctx.globalAlpha = a; cap(ctx, sx, sy, 17, C.red, 0);
        ctx.fillStyle = '#ffe14d'; ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx + panel.dot * 11, sy + 3, 3.4, 0, TAU); ctx.fill(); ctx.stroke(); ctx.globalAlpha = 1;
      } else cap(ctx, sx + px, sy + py, 17, C.red, k * 14 * -panel.dot);
      if (moving || k >= 1) { /* kapsel już zatrzymany na końcu krzywej */ }
    });
    ctx.fillStyle = 'rgba(244,241,232,0.35)'; ctx.fillRect(159, 20, 2, 180);
  }

  // ---------- 4. tor i bandy: prawdziwa symulacja silnika ----------
  let demo = null;
  function getDemo() {
    if (demo) return demo;
    const tr = CapEngine.generateTrack(11, 's'), starts = CapEngine.startPositions(tr), base = CapEngine.pointAt(tr, tr.sStart, 0).ang;
    let best = null;
    for (let k = 0; k < 80 && !best; k++) {
      const a = base + (k % 2 ? 1 : -1) * (0.06 + 0.035 * k);
      const sim = CapEngine.simulate(tr, [starts[0]], 0, { dx: Math.cos(a), dy: Math.sin(a), power: 0.85, spin: 0 });
      if (sim.events.filter(e => e[1] === 1).length >= 2 && sim.seconds > 1.4) best = sim;
    }
    if (!best) best = CapEngine.simulate(tr, [starts[0]], 0, { dx: Math.cos(base), dy: Math.sin(base), power: 0.85, spin: 0 });
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const f of best.frames) { x0 = Math.min(x0, f[0]); y0 = Math.min(y0, f[1]); x1 = Math.max(x1, f[0]); y1 = Math.max(y1, f[1]); }
    const m = CapEngine.P.halfW + 6; x0 -= m; y0 -= m; x1 += m; y1 += m;
    const k = Math.min((W - 16) / (x1 - x0), (H - 16) / (y1 - y0));
    demo = { tr, sim: best, k, ox: W / 2 - (x0 + x1) / 2 * k, oy: H / 2 - (y0 + y1) / 2 * k };
    return demo;
  }
  function sceneTrack(ctx, t, w, h) {
    bg(ctx, w, h);
    const d = getDemo(), P = CapEngine.P, fr = d.sim.frames, loop = d.sim.seconds * 1000 + 1600;
    ctx.save(); ctx.translate(d.ox, d.oy); ctx.scale(d.k, d.k);
    const pts = []; for (let i = 0; i < d.tr.n; i++) pts.push([d.tr.xs[i], d.tr.ys[i]]);
    road(ctx, pts, P.halfW);
    const tt = Math.min(t, d.sim.seconds * 1000) / 1000, f = Math.min(tt * 30, fr.length - 1), i = Math.floor(f), u = f - i, A = fr[i], B = fr[Math.min(i + 1, fr.length - 1)];
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2 / d.k; ctx.setLineDash([6 / d.k, 7 / d.k]); ctx.beginPath();     // ślad kapsla
    for (let j = 0; j <= i; j++) j ? ctx.lineTo(fr[j][0], fr[j][1]) : ctx.moveTo(fr[j][0], fr[j][1]); ctx.stroke(); ctx.setLineDash([]);
    const x = A[0] + (B[0] - A[0]) * u, y = A[1] + (B[1] - A[1]) * u;
    d.sim.events.filter(e => e[1] === 1 && e[0] / 30 <= tt && tt - e[0] / 30 < 0.35).forEach(e => {    // kurz kredy przy uderzeniu w bandę
      const p = fr[Math.min(e[0], fr.length - 1)], k = (tt - e[0] / 30) / 0.35;
      for (let q = 0; q < 8; q++) { const a = q * 0.8 + e[0]; ctx.fillStyle = `rgba(244,241,232,${0.8 * (1 - k)})`; ctx.beginPath(); ctx.arc(p[0] + Math.cos(a) * 30 * k, p[1] + Math.sin(a) * 30 * k, 3.5 / d.k * (1 - k * 0.5), 0, TAU); ctx.fill(); }
    });
    cap(ctx, x, y, P.capR, C.red, tt * 8);
    ctx.restore();
    if (t > loop) ctx.clearRect(0, 0, 0, 0);
  }
  const trackLoop = () => getDemo().sim.seconds * 1000 + 1600;

  // ---------- 5. kolejka i zderzenia ----------
  function sceneRules(ctx, t, w, h) {
    bg(ctx, w, h); road(ctx, [[20, 112], [300, 112]], 32);
    checker(ctx, 272, 112, Math.PI / 2 * 0 + 0, 32, 10);
    const hit = ease((t - 1500) / 450), rolled = ease((t - 1950) / 1100);
    const bx = 70 + 100 * hit, rx = 190 + 90 * rolled;
    if (t < 1500) {                                                                                  // pulsujący pierścień: pstryka kapsel z tyłu
      ctx.strokeStyle = `rgba(255,255,255,${0.55 + 0.35 * Math.sin(t * 0.012)})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(bx, 112, 19 + Math.sin(t * 0.012) * 2, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); const by = 70 + Math.sin(t * 0.01) * 3; ctx.moveTo(bx - 8, by - 6); ctx.lineTo(bx + 8, by - 6); ctx.lineTo(bx, by + 6); ctx.closePath(); ctx.fill();
    }
    cap(ctx, bx, 112, 14, C.blue, hit * 8); cap(ctx, rx, 112, 14, C.red, rolled * 9);
    if (t > 1900 && t < 2300) { const k = (t - 1900) / 400; ctx.strokeStyle = `rgba(255,214,107,${1 - k})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(bx + 14, 112, 10 + 22 * k, 0, TAU); ctx.stroke(); }
    if (rx >= 270) confetti(ctx, 272, 100, t - 2800);
  }

  // ---------- 6. wskazówki: czat i kod QR ----------
  const QR = [[1,1,1,0,1,1,1],[1,0,1,1,0,0,1],[1,1,1,0,1,0,1],[0,1,0,1,1,1,0],[1,0,1,0,0,1,1],[1,0,0,1,1,0,1],[1,1,1,0,1,1,1]];
  function sceneTips(ctx, t, w, h) {
    bg(ctx, w, h);
    const bub = (x, y, wd, hd, color, tail, dots, tk) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, wd, hd, 12) : ctx.rect(x, y, wd, hd); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + (tail > 0 ? wd - 18 : 18), y + hd - 1); ctx.lineTo(x + (tail > 0 ? wd - 8 : 8), y + hd + 10); ctx.lineTo(x + (tail > 0 ? wd - 30 : 30), y + hd - 1); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < dots; i++) { const s = 1 + 0.35 * Math.sin(tk * 0.008 + i * 1.3); ctx.beginPath(); ctx.arc(x + 20 + i * 14, y + hd / 2, 3.2 * s, 0, TAU); ctx.fill(); }
    };
    bub(24, 28, 104, 44, '#555a66', -1, 3, t); bub(70, 88, 116, 44, '#d9482e', 1, 4, t + 400);
    const qx = 206, qy = 40, c = 11;
    ctx.fillStyle = '#fff'; ctx.fillRect(qx - 8, qy - 8, 7 * c + 16, 7 * c + 16);
    ctx.fillStyle = '#000'; QR.forEach((row, r) => row.forEach((v, q) => { if (v) ctx.fillRect(qx + q * c, qy + r * c, c, c); }));
    const k = (t % 2400) / 2400; ctx.fillStyle = 'rgba(255,90,79,0.55)'; ctx.fillRect(qx - 8, qy - 8 + (7 * c + 12) * k, 7 * c + 16, 3);       // linia skanera
    ctx.font = '26px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('📱', 250, 168);
    ctx.fillText('💬', 70, 172);
  }

  const PAGES = [
    { id: 'goal', scene: sceneGoal, loop: 6400, still: 5600 },
    { id: 'flick', scene: sceneFlick, loop: 5200, still: 1800 },
    { id: 'spin', scene: sceneSpin, loop: 3600, still: 1200 },
    { id: 'track', scene: sceneTrack, get loop() { return trackLoop(); }, still: 1200 },
    { id: 'rules', scene: sceneRules, loop: 5200, still: 4200 },
    { id: 'tips', scene: sceneTips, loop: 2400, still: 600 },
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const t0 = performance.now();
    const frame = now => {
      const t = reduced() ? page.still : Math.max(0, now - t0) % page.loop;
      ctx.clearRect(0, 0, W, H);
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
