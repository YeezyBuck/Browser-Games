'use strict';
// Plansza gry w kropki rysowana na <canvas>: siatka, połączenia kropek tego samego koloru, przejęte obszary, kropki,
// znacznik ostatniego ruchu, podgląd kropki pod kursorem i efekty przejęcia. Plansza skaluje się do szerokości okna.
const Board = (function () {
  const cv = document.getElementById('board');
  const ctx = cv.getContext('2d');
  const COL = { r: '#ff5d73', b: '#4aa8ff' };
  const TINT = { r: 'rgba(255,93,115,0.22)', b: 'rgba(74,168,255,0.22)' };
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PAD = 22;
  let st = null, myCh = null, canMove = false, onMove = null;
  let gap = 30, dpr = 1, cssW = 0, cssH = 0, hover = null, fx = [], raf = 0, laidOut = '';

  const px = x => PAD + x * gap, py = y => PAD + y * gap;
  const lower = ch => ch.toLowerCase();

  function layout() {
    if (!st) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const section = cv.closest('section') || document.body;
    const avail = Math.max(280, Math.min(section.clientWidth - 24, innerWidth - 40));
    gap = Math.max(16, Math.min(32, Math.floor((avail - 2 * PAD) / (st.w - 1))));
    cssW = 2 * PAD + (st.w - 1) * gap; cssH = 2 * PAD + (st.h - 1) * gap;
    cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    laidOut = st.w + 'x' + st.h + '@' + avail;
  }

  function draw(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    if (!st) return;
    const { w, h, board, terr } = st, t = now / 1000;

    // siatka
    ctx.strokeStyle = 'rgba(170,185,255,0.14)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x < w; x++) { ctx.moveTo(px(x) + 0.5, py(0)); ctx.lineTo(px(x) + 0.5, py(h - 1)); }
    for (let y = 0; y < h; y++) { ctx.moveTo(px(0), py(y) + 0.5); ctx.lineTo(px(w - 1), py(y) + 0.5); }
    ctx.stroke();

    // przejęte obszary: zablokowane pola i przejęte kropki (kolor zdobywcy)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let tint = terr[y][x] !== '.' ? terr[y][x] : null;
      const c = board[y][x];
      if (c === 'R') tint = 'b'; else if (c === 'B') tint = 'r';       // martwa czerwona = przejęta przez niebieskiego i odwrotnie
      if (tint) { ctx.fillStyle = TINT[tint]; ctx.fillRect(px(x) - gap / 2, py(y) - gap / 2, gap, gap); }
    }

    // połączenia żywych kropek tego samego koloru (też po przekątnej)
    ctx.lineWidth = Math.max(2, gap * 0.09); ctx.lineCap = 'round';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = board[y][x];
      if (c !== 'r' && c !== 'b') continue;
      ctx.strokeStyle = COL[c]; ctx.globalAlpha = 0.85; ctx.beginPath();
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny < h && nx < w && board[ny][nx] === c) { ctx.moveTo(px(x), py(y)); ctx.lineTo(px(nx), py(ny)); }
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // kropki
    const r = Math.max(4, Math.min(7.5, gap * 0.24));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = board[y][x];
      if (c === '.') continue;
      const alive = c === 'r' || c === 'b', key = lower(c);
      if (alive) {
        ctx.shadowColor = COL[key]; ctx.shadowBlur = 9;
        ctx.fillStyle = COL[key]; ctx.beginPath(); ctx.arc(px(x), py(y), r, 0, 6.283); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(px(x) - r * 0.3, py(y) - r * 0.3, r * 0.3, 0, 6.283); ctx.fill();
      } else {                                                          // przejęta: przygaszona, z kropką w kolorze zdobywcy
        ctx.fillStyle = COL[key]; ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.arc(px(x), py(y), r * 0.85, 0, 6.283); ctx.fill();
        ctx.globalAlpha = 1; ctx.fillStyle = COL[key === 'r' ? 'b' : 'r']; ctx.beginPath(); ctx.arc(px(x), py(y), r * 0.38, 0, 6.283); ctx.fill();
      }
    }

    // ostatni ruch: pulsujący pierścień
    if (st.last && board[st.last.y] && board[st.last.y][st.last.x] !== '.') {
      const pulse = reduced() ? 0 : Math.sin(t * 5) * 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px(st.last.x), py(st.last.y), r + 4 + pulse, 0, 6.283); ctx.stroke();
    }

    // podgląd kropki pod kursorem
    if (canMove && hover && board[hover.y][hover.x] === '.' && terr[hover.y][hover.x] === '.') {
      ctx.globalAlpha = 0.5; ctx.fillStyle = COL[myCh]; ctx.beginPath(); ctx.arc(px(hover.x), py(hover.y), r, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 0.9; ctx.strokeStyle = COL[myCh]; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px(hover.x), py(hover.y), r + 4, 0, 6.283); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // efekty przejęcia
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i], age = (now - f.t0) / 1000;
      if (age < 0) continue;
      if (age >= f.life) { fx.splice(i, 1); continue; }
      const k = age / f.life, a = 1 - k;
      if (f.type === 'ring') {
        ctx.strokeStyle = f.color; ctx.globalAlpha = 0.8 * a; ctx.lineWidth = 3 * a + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.max * Math.sqrt(k), 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1;
      } else {
        const x = f.x + f.vx * age, y = f.y + f.vy * age + 180 * age * age;
        ctx.fillStyle = f.color; ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(x, y, f.size * (1 - 0.5 * k), 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
      }
    }
  }

  function loop(now) {
    draw(now);
    raf = document.hidden ? 0 : requestAnimationFrame(loop);
  }
  function ensureLoop() { if (!raf && !document.hidden) raf = requestAnimationFrame(loop); }
  document.addEventListener('visibilitychange', ensureLoop);

  function cellAt(ev) {
    if (!st) return null;
    const rect = cv.getBoundingClientRect();
    const x = Math.round((ev.clientX - rect.left - PAD) / gap), y = Math.round((ev.clientY - rect.top - PAD) / gap);
    return x < 0 || y < 0 || x >= st.w || y >= st.h ? null : { x, y };
  }
  cv.addEventListener('pointermove', e => { hover = cellAt(e); });
  cv.addEventListener('pointerdown', e => { hover = cellAt(e); });
  cv.addEventListener('pointerleave', () => { hover = null; });
  cv.addEventListener('click', e => {
    const c = cellAt(e);
    if (c && canMove && onMove) onMove(c.x, c.y);
  });
  addEventListener('resize', () => { if (st) layout(); });

  return {
    // Nowy stan z serwera. Układ liczymy ponownie tylko przy zmianie rozmiaru planszy lub okna.
    setState(s) {
      const wasNew = !st || st.w !== s.w || st.h !== s.h;
      st = { w: s.w, h: s.h, board: s.board, terr: s.terr, last: s.last };
      myCh = s.colors[s.you] === 1 ? 'r' : 'b';
      canMove = s.phase === 'playing' && s.turn === s.you;
      cv.style.cursor = canMove ? 'crosshair' : 'default';
      if (wasNew || !laidOut) layout();
      ensureLoop();
    },
    onMove(fn) { onMove = fn; },
    relayout() { if (st) layout(); },
    // Efekt przejęcia kropek (cells = [[x, y], ...]) w kolorze zdobywcy (color = 'r' | 'b').
    capture(cells, color) {
      if (reduced() || !st || !cells || !cells.length) return;
      const now = performance.now(), c = COL[color];
      cells.forEach(([x, y], i) => {
        const cx = px(x), cy = py(y), t0 = now + i * 60;
        fx.push({ type: 'ring', x: cx, y: cy, color: c, t0, life: 0.8, max: gap * 1.8 });
        for (let k = 0; k < 14; k++) {
          const a = Math.random() * 6.283, v = 40 + Math.random() * 110;
          fx.push({ type: 'spark', x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, color: c, size: 1.6 + Math.random() * 2.2, t0, life: 0.6 + Math.random() * 0.5 });
        }
      });
      ensureLoop();
    },
    // Współrzędne ekranu środka przecięcia (x, y) – przydatne w testach.
    pointFor(x, y) { const r = cv.getBoundingClientRect(); return { x: r.left + px(x), y: r.top + py(y) }; },
    get fxCount() { return fx.length; },
    get gap() { return gap; },
  };
})();
