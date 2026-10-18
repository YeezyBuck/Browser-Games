'use strict';
// Samouczek: okno z krokami (tekst + krótka animacja na canvasie), otwierane przyciskiem "Jak grać" oraz automatycznie
// przy pierwszej wizycie. Teksty pochodzą z i18n (klucze tut.<id>.title i tut.<id>.text), więc działa po polsku i angielsku.
// Nawigacja: przyciski, kropki kroków, strzałki lewo/prawo, Esc zamyka.
const Tutorial = (function () {
  const SEEN_KEY = 'dots-tutorial-seen';
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
  let idx = 0, raf = 0, opener = null;

    // ---------- strony i animacje (Kropki) ----------
  const C = { red: '#ff5d73', blue: '#4aa8ff', grid: 'rgba(170,185,255,0.16)', ink: '#eef1ff', soft: 'rgba(169,177,214,0.9)' };
  const col = c => (c === 'r' ? C.red : C.blue);
  function circ(ctx, x, y, r, color, glow) {
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0;
  }
  function rr(ctx, x, y, w, h, r, fill) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); fill ? ctx.fill() : ctx.stroke();
  }

  // Mini-plansza: siatka, kropki pojawiające się w zadanych chwilach (at, ms), linie łączące, ewentualne przejęcie (capture).
  function dotsScene(spec) {
    const n = spec.n, gap = spec.gap;
    return (ctx, t, w, h) => {
      const ox = (w - (n - 1) * gap) / 2, oy = (h - (n - 1) * gap) / 2, px = x => ox + x * gap, py = y => oy + y * gap;
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i < n; i++) { ctx.moveTo(px(i) + 0.5, py(0)); ctx.lineTo(px(i) + 0.5, py(n - 1)); ctx.moveTo(px(0), py(i) + 0.5); ctx.lineTo(px(n - 1), py(i) + 0.5); }
      ctx.stroke();
      const shown = spec.steps.filter(s => t >= s.at);
      const cap = spec.capture && t >= spec.capture.at ? spec.capture : null;
      const age = cap ? (t - cap.at) / 1000 : 0;
      const isVictim = s => cap && s.c !== cap.by && cap.cells.some(([x, y]) => x === s.x && y === s.y);
      if (cap) {                                               // zabarwienie przejętego obszaru
        ctx.fillStyle = cap.by === 'r' ? 'rgba(255,93,115,0.22)' : 'rgba(74,168,255,0.22)';
        ctx.globalAlpha = clamp(age * 2.5, 0, 1);
        cap.cells.forEach(([x, y]) => ctx.fillRect(px(x) - gap / 2, py(y) - gap / 2, gap, gap));
        ctx.globalAlpha = 1;
      }
      const key = (x, y) => x + ',' + y, alive = new Map();
      shown.forEach(s => { if (!isVictim(s)) alive.set(key(s.x, s.y), s); });
      ctx.lineWidth = 3; ctx.lineCap = 'round';
      alive.forEach(s => {                                     // linie między sąsiadami (poziomo, pionowo i po przekątnej)
        ctx.strokeStyle = col(s.c); ctx.beginPath();
        [[1, 0], [0, 1], [1, 1], [-1, 1]].forEach(([dx, dy]) => {
          const o = alive.get(key(s.x + dx, s.y + dy));
          if (o && o.c === s.c) { ctx.moveTo(px(s.x), py(s.y)); ctx.lineTo(px(o.x), py(o.y)); }
        });
        ctx.stroke();
      });
      shown.forEach(s => {
        const k = ease((t - s.at) / 260), r = 7 * (0.3 + 0.7 * k) * (k < 1 ? 1 + 0.35 * (1 - k) : 1);
        if (isVictim(s)) { ctx.globalAlpha = 0.4; circ(ctx, px(s.x), py(s.y), 6, col(s.c)); ctx.globalAlpha = 1; circ(ctx, px(s.x), py(s.y), 2.6, col(cap.by)); }
        else circ(ctx, px(s.x), py(s.y), r, col(s.c), 9);
      });
      if (cap && age < 0.9) {                                  // błysk przejęcia
        const k = age / 0.9;
        cap.cells.forEach(([x, y]) => {
          ctx.strokeStyle = col(cap.by); ctx.globalAlpha = 1 - k; ctx.lineWidth = 3 * (1 - k) + 1;
          ctx.beginPath(); ctx.arc(px(x), py(y), gap * 1.5 * Math.sqrt(k), 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1;
          for (let i = 0; i < 10; i++) { const a = i * 0.628 + 0.3, d = gap * 1.2 * k; circ(ctx, px(x) + Math.cos(a) * d, py(y) + Math.sin(a) * d, 2 * (1 - k) + 0.5, col(cap.by)); }
        });
      }
      if (spec.after) spec.after(ctx, t, px, py, gap);
    };
  }
  const D = (at, c, x, y) => ({ at, c, x, y });

  const SC_GOAL = dotsScene({ n: 6, gap: 38, steps: [D(300, 'r', 1, 1), D(1100, 'b', 4, 1), D(1900, 'r', 2, 3), D(2700, 'b', 3, 4), D(3500, 'r', 4, 3), D(4300, 'b', 1, 4)] });
  const SC_CONNECT = dotsScene({ n: 6, gap: 38, steps: [D(300, 'r', 0, 4), D(650, 'b', 4, 4), D(1000, 'r', 1, 3), D(1700, 'r', 2, 3), D(2050, 'b', 0, 1), D(2400, 'r', 2, 2), D(3100, 'r', 3, 1), D(3800, 'r', 4, 1)] });
  const SC_CAPTURE = dotsScene({
    n: 7, gap: 34,
    steps: [D(300, 'b', 3, 3), D(1100, 'r', 3, 2), D(1900, 'r', 4, 3), D(2700, 'r', 3, 4), D(3500, 'r', 2, 3)],
    capture: { at: 3500, by: 'r', cells: [[3, 3]] },
  });
  const SC_LOCKED = dotsScene({
    n: 7, gap: 34,
    steps: [D(300, 'r', 3, 2), D(800, 'r', 4, 3), D(1300, 'r', 3, 4), D(1800, 'r', 2, 3)],
    after(ctx, t, px, py, gap) {
      if (t >= 1800) { ctx.fillStyle = 'rgba(255,93,115,0.16)'; ctx.fillRect(px(3) - gap / 2, py(3) - gap / 2, gap, gap); }   // pole już otoczone
      if (t >= 2600 && t < 4400) {                                                                                       // próba postawienia kropki i odmowa
        const k = (t - 2600) / 1800, shake = t < 3300 ? 0 : Math.sin((t - 3300) * 0.06) * 3 * (1 - clamp((t - 3300) / 1100, 0, 1));
        const cx = px(3) + shake, cy = py(3);
        ctx.globalAlpha = 0.55 * (k < 0.85 ? 1 : (1 - k) / 0.15); circ(ctx, cx, cy, 7, C.blue); ctx.globalAlpha = 1;
        if (t >= 3100) { ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 12, cy - 12); ctx.lineTo(cx + 12, cy + 12); ctx.moveTo(cx + 12, cy - 12); ctx.lineTo(cx - 12, cy + 12); ctx.stroke(); }
      }
    },
  });
  function sceneEnd(ctx, t, w, h) {                             // licznik przejętych kropek i zwycięzca
    const red = t > 3600 ? 3 : t > 2400 ? 2 : t > 1200 ? 1 : 0, blue = t > 2000 ? 1 : 0, done = t > 4200;
    const card = (x, color, num, win) => {
      ctx.fillStyle = 'rgba(20,26,60,0.9)'; rr(ctx, x, 56, 120, 92, 14, true);
      ctx.strokeStyle = win ? color : 'rgba(160,175,255,0.3)'; ctx.lineWidth = win ? 3 : 1.5; rr(ctx, x, 56, 120, 92, 14, false);
      circ(ctx, x + 22, 78, 8, color, 8);
      ctx.fillStyle = C.ink; ctx.font = 'bold 42px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(num), x + 62, 128);
    };
    card(30, C.red, red, done); card(170, C.blue, blue, false);
    if (done) {
      ctx.font = '34px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🏆', 90, 44);
      for (let i = 0; i < 14; i++) {                            // konfetti nad zwycięzcą
        const a = i * 0.9 + t * 0.002, d = 26 + ((t * 0.03 + i * 11) % 34);
        circ(ctx, 90 + Math.cos(a) * d * 1.6, 50 + Math.sin(a) * d * 0.6 - 10, 2, i % 2 ? C.red : '#ffd66b');
      }
    }
  }
  const SC_TIPS = dotsScene({
    n: 6, gap: 38,
    steps: [D(0, 'r', 1, 2), D(0, 'r', 2, 2), D(0, 'r', 2, 3), D(0, 'b', 3, 2), D(0, 'b', 3, 3), D(0, 'b', 4, 4)],
    after(ctx, t, px, py, gap) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5;                                         // ostatni ruch: pulsujący pierścień
      ctx.beginPath(); ctx.arc(px(2), py(3), 11 + Math.sin(t * 0.006) * 1.5, 0, 6.283); ctx.stroke();
      const spots = [[1, 3], [2, 1], [4, 2]], i = Math.floor(t / 1200) % spots.length, [gx, gy] = spots[i];     // podgląd kropki pod kursorem
      ctx.globalAlpha = 0.5; circ(ctx, px(gx), py(gy), 7, C.red); ctx.globalAlpha = 0.9; ctx.strokeStyle = C.red; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px(gx), py(gy), 11, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(px(gx) + 8, py(gy) + 8); ctx.lineTo(px(gx) + 8, py(gy) + 24); ctx.lineTo(px(gx) + 13, py(gy) + 19); ctx.lineTo(px(gx) + 20, py(gy) + 19); ctx.closePath(); ctx.fill();
    },
  });

  const PAGES = [
    { id: 'goal', scene: SC_GOAL, loop: 5800, still: 5000 },
    { id: 'connect', scene: SC_CONNECT, loop: 5800, still: 4800 },
    { id: 'capture', scene: SC_CAPTURE, loop: 7000, still: 4600 },
    { id: 'locked', scene: SC_LOCKED, loop: 5400, still: 3600 },
    { id: 'end', scene: sceneEnd, loop: 6400, still: 5200 },
    { id: 'tips', scene: SC_TIPS, loop: 3600, still: 100 },
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
      page.scene(ctx, t, W, H);
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
