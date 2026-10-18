'use strict';
// Samouczek: okno z krokami (tekst + krótka animacja na canvasie), otwierane przyciskiem "Jak grać" oraz automatycznie
// przy pierwszej wizycie. Teksty pochodzą z i18n (klucze tut.<id>.title i tut.<id>.text), więc działa po polsku i angielsku.
// Nawigacja: przyciski, kropki kroków, strzałki lewo/prawo, Esc zamyka.
const Tutorial = (function () {
  const SEEN_KEY = 'warships-tutorial-seen';
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

    // ---------- strony i animacje (Statki) ----------
  const C = {
    water: 'rgba(60,130,200,0.32)', line: 'rgba(150,190,240,0.38)', ship: '#8fa6bf', shipEdge: '#cfe0f3',
    hit: '#ff5a4f', sunk: '#5b2f35', sunkEdge: '#c26a6a', ink: '#eaf3ff', ok: '#4fd18b', bad: '#ff6b6b', soft: 'rgba(200,215,240,0.85)',
  };
  function rr(ctx, x, y, w, h, r, fill) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); fill ? ctx.fill() : ctx.stroke();
  }
  function board(ctx, ox, oy, nx, ny, c) {
    ctx.lineWidth = 1;
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      ctx.fillStyle = C.water; rr(ctx, ox + x * c + 1, oy + y * c + 1, c - 2, c - 2, 4, true);
      ctx.strokeStyle = C.line; rr(ctx, ox + x * c + 1, oy + y * c + 1, c - 2, c - 2, 4, false);
    }
  }
  function shipCell(ctx, ox, oy, c, x, y, sunk, a) {
    ctx.globalAlpha = a === undefined ? 1 : a;
    ctx.fillStyle = sunk ? C.sunk : C.ship; rr(ctx, ox + x * c + 1, oy + y * c + 1, c - 2, c - 2, 4, true);
    ctx.strokeStyle = sunk ? C.sunkEdge : C.shipEdge; ctx.lineWidth = 1.2; rr(ctx, ox + x * c + 1, oy + y * c + 1, c - 2, c - 2, 4, false);
    ctx.globalAlpha = 1;
  }
  function xMark(ctx, ox, oy, c, x, y, a) {
    const cx = ox + x * c + c / 2, d = c * 0.24, cy = oy + y * c + c / 2;
    ctx.globalAlpha = a === undefined ? 1 : a; ctx.strokeStyle = C.hit; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d); ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d); ctx.stroke(); ctx.globalAlpha = 1;
  }
  function dotMark(ctx, ox, oy, c, x, y, a) {
    ctx.globalAlpha = a === undefined ? 1 : a; ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(ox + x * c + c / 2, oy + y * c + c / 2, c * 0.13, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
  }
  function blast(ctx, cx, cy, r, k) {                           // k: 0..1 – błysk i fala wybuchu
    if (k <= 0 || k >= 1) return;
    const a = 1 - k, rad = r * (0.4 + 0.8 * Math.sqrt(k));
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, `rgba(255,245,190,${0.95 * a})`); g.addColorStop(0.4, `rgba(255,150,30,${0.8 * a})`); g.addColorStop(1, 'rgba(180,40,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 6.283); ctx.fill();
    ctx.strokeStyle = `rgba(255,225,170,${0.7 * a})`; ctx.lineWidth = 2.5 * a + 1; ctx.beginPath(); ctx.arc(cx, cy, r * 1.6 * Math.sqrt(k), 0, 6.283); ctx.stroke();
  }
  const arrow = (ctx, x, y, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.lineTo(x, y + 9); ctx.closePath(); ctx.fill(); };

  // 1) cel: dwie plansze, strzały na zmianę
  function sceneGoal(ctx, t, w, h) {
    const c = 22, n = 6, oy = 56, lx = 14, rx = 174;
    board(ctx, lx, oy, n, n, c); board(ctx, rx, oy, n, n, c);
    [[0, 0], [1, 0], [2, 0], [4, 2], [4, 3], [1, 4]].forEach(([x, y]) => shipCell(ctx, lx, oy, c, x, y, false));      // moje statki
    const ev = [
      { at: 600, side: 'R', x: 2, y: 1, hit: false }, { at: 1500, side: 'L', x: 1, y: 0, hit: true }, { at: 2400, side: 'R', x: 3, y: 3, hit: true },
      { at: 3300, side: 'L', x: 3, y: 3, hit: false }, { at: 4200, side: 'R', x: 3, y: 4, hit: true }, { at: 5100, side: 'L', x: 2, y: 0, hit: true },
    ];
    ev.filter(e => t >= e.at).forEach(e => {
      const ox = e.side === 'R' ? rx : lx, a = clamp((t - e.at) / 250, 0, 1);
      e.hit ? xMark(ctx, ox, oy, c, e.x, e.y, a) : dotMark(ctx, ox, oy, c, e.x, e.y, a);
    });
    const next = ev.find(e => t < e.at) || ev[0];
    arrow(ctx, next.side === 'R' ? rx + 3 * c : lx + 3 * c, 40, next.side === 'R' ? '#7cc4ff' : '#ff9ab5');
    ctx.fillStyle = C.soft; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('◀ ▶', w / 2, oy + 3 * c + 4);
  }

  // 2) flota: komplet statków i przykład poprawnego/błędnego ustawienia
  function sceneFleet(ctx, t, w, h) {
    const c = 15, row = (y, lens) => {
      let x = 18; lens.forEach(n => { for (let i = 0; i < n; i++) shipCell(ctx, x, y, c, i, 0, false); x += n * c + 14; });
    };
    row(14, [4, 3, 3]); row(40, [2, 2, 2, 1, 1, 1, 1]);
    const pulse = 0.65 + 0.35 * Math.sin(t * 0.004);
    ctx.font = 'bold 15px system-ui, sans-serif'; ctx.textAlign = 'center';
    [[30, true], [186, false]].forEach(([ox, good]) => {                                                          // dwa przykłady 5x4
      board(ctx, ox, 86, 5, 4, 20);
      const cells = good ? [[0, 0], [1, 0], [3, 2], [4, 2], [4, 0]] : [[0, 0], [1, 0], [2, 1], [3, 1], [4, 3]];
      cells.forEach(([x, y]) => shipCell(ctx, ox, 86, 20, x, y, false));
      ctx.globalAlpha = good ? 1 : pulse; ctx.fillStyle = good ? C.ok : C.bad; ctx.fillText(good ? '✓' : '✕', ox + 50, 190); ctx.globalAlpha = 1;
    });
    { ctx.strokeStyle = C.bad; ctx.lineWidth = 2; ctx.globalAlpha = pulse; ctx.beginPath(); ctx.arc(186 + 2 * 20, 86 + 20, 14, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1; }
  }

  // 3) ustawianie: podgląd statku, kliknięcie, obrót klawiszem R
  function scenePlace(ctx, t, w, h) {
    const c = 22, n = 8, ox = (w - n * c) / 2, oy = 22;
    board(ctx, ox, oy, n, n, c);
    const draw = (x, y, len, horiz, a, ok) => { for (let i = 0; i < len; i++) {
      const cx = x + (horiz ? i : 0), cy = y + (horiz ? 0 : i);
      shipCell(ctx, ox, oy, c, cx, cy, false, a);
      if (a < 1) { ctx.globalAlpha = 0.35; ctx.fillStyle = ok ? C.ok : C.bad; rr(ctx, ox + cx * c + 1, oy + cy * c + 1, c - 2, c - 2, 4, true); ctx.globalAlpha = 1; }
    } };
    const click = (x, y, at) => { const k = (t - at) / 450; if (k > 0 && k < 1) { ctx.strokeStyle = 'rgba(255,255,255,' + (1 - k) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ox + x * c + c / 2, oy + y * c + c / 2, 8 + 18 * k, 0, 6.283); ctx.stroke(); } };
    if (t >= 900) draw(1, 1, 3, true, 1); else if (t >= 200) draw(1 + Math.floor(clamp((t - 200) / 350, 0, 2)), 1, 3, true, 0.6, true);
    click(2, 1, 900);
    if (t >= 3300) draw(5, 3, 2, false, 1);
    else if (t >= 1500) {
      const horiz = t < 2400;
      draw(horiz ? 4 : 5, 3, 2, horiz, 0.6, true);
      if (t >= 2400) {                                                                                           // plakietka klawisza R
        ctx.fillStyle = 'rgba(20,26,60,0.95)'; rr(ctx, 8, 8, 52, 24, 6, true); ctx.strokeStyle = C.line; rr(ctx, 8, 8, 52, 24, 6, false);
        ctx.fillStyle = C.ink; ctx.font = 'bold 14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('R ↻', 34, 25);
      }
    }
    click(5, 3, 3300);
    if (t >= 4400) draw(1, 6, 1, true, 1); else if (t >= 3700) draw(1 + Math.floor(clamp((t - 3700) / 350, 0, 3)), 6, 1, true, 0.6, true);
    click(4, 6, 4400);
  }

  // 4) strzelanie: celownik na planszy przeciwnika, trafienie i pudło
  function sceneShoot(ctx, t, w, h) {
    const c = 22, n = 8, ox = (w - n * c) / 2, oy = 22;
    board(ctx, ox, oy, n, n, c);
    const shots = [{ at: 1000, x: 2, y: 2, hit: false }, { at: 2300, x: 5, y: 3, hit: true }, { at: 3600, x: 5, y: 4, hit: true }, { at: 4900, x: 1, y: 6, hit: false }];
    let prev = { x: 0, y: 0 };
    shots.forEach(s => { if (t >= s.at) { const a = clamp((t - s.at) / 250, 0, 1); s.hit ? xMark(ctx, ox, oy, c, s.x, s.y, a) : dotMark(ctx, ox, oy, c, s.x, s.y, a);
      const k = (t - s.at) / 700; if (k < 1) { if (s.hit) blast(ctx, ox + s.x * c + c / 2, oy + s.y * c + c / 2, 20, k); else { ctx.strokeStyle = 'rgba(255,255,255,' + 0.7 * (1 - k) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ox + s.x * c + c / 2, oy + s.y * c + c / 2, 4 + 16 * k, 0, 6.283); ctx.stroke(); } } } });
    for (const s of shots) { if (t < s.at) { const pk = shots.indexOf(s); if (pk > 0) prev = shots[pk - 1]; const k = ease((t - (s.at - 800)) / 700);
      const x = prev.x + (s.x - prev.x) * k, y = prev.y + (s.y - prev.y) * k, cx = ox + x * c + c / 2, cy = oy + y * c + c / 2;
      ctx.strokeStyle = '#ffd66b'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(cx, cy, 10, 0, 6.283); ctx.moveTo(cx - 15, cy); ctx.lineTo(cx - 5, cy); ctx.moveTo(cx + 5, cy); ctx.lineTo(cx + 15, cy);
      ctx.moveTo(cx, cy - 15); ctx.lineTo(cx, cy - 5); ctx.moveTo(cx, cy + 5); ctx.lineTo(cx, cy + 15); ctx.stroke(); break; } }
  }

  // 5) zatopienie: kolejne trafienia, wielki wybuch, pola wokół zaznaczają się jako woda
  function sceneSink(ctx, t, w, h) {
    const c = 22, n = 8, ox = (w - n * c) / 2, oy = 22, ship = [[2, 3], [3, 3], [4, 3]];
    const shake = t > 2100 && t < 2800 ? Math.sin(t * 0.07) * 3 * (1 - (t - 2100) / 700) : 0;
    ctx.save(); ctx.translate(shake, 0);
    board(ctx, ox, oy, n, n, c);
    const sunk = t >= 2100;
    ship.forEach(([x, y], i) => {
      const at = 700 + i * 700;
      if (t >= at && !sunk) shipCell(ctx, ox, oy, c, x, y, false);
      if (sunk) shipCell(ctx, ox, oy, c, x, y, true);
      if (t >= at) xMark(ctx, ox, oy, c, x, y, clamp((t - at) / 250, 0, 1));
    });
    if (sunk) {                                                                                                    // woda dookoła
      const around = []; for (let y = 2; y <= 4; y++) for (let x = 1; x <= 5; x++) if (!(y === 3 && x >= 2 && x <= 4)) around.push([x, y]);
      around.forEach(([x, y], i) => { const at = 2900 + i * 70; if (t >= at) dotMark(ctx, ox, oy, c, x, y, clamp((t - at) / 200, 0, 0.7)); });
    }
    ctx.restore();
    ship.forEach(([x, y], i) => { const at = 700 + i * 700, k = (t - at) / 600; if (i < 2) blast(ctx, ox + x * c + c / 2, oy + y * c + c / 2, 18, k); });
    blast(ctx, ox + 3.5 * c, oy + 3.5 * c, 52, (t - 2100) / 900);
  }

  // 6) dodatki: czat, dźwięk, muzyka, zaproszenie, zamknięcie
  function sceneExtras(ctx, t, w, h) {
    const icons = ['💬', '🔊', '🎵', '📱', '🌐', '🏆'];
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '38px system-ui, "Segoe UI Emoji", sans-serif';
    icons.forEach((e, i) => {
      const cx = 56 + (i % 3) * 104, cy = 62 + Math.floor(i / 3) * 84, pulse = 1 + 0.08 * Math.sin(t * 0.004 + i);
      ctx.fillStyle = 'rgba(20,26,60,0.85)'; rr(ctx, cx - 38, cy - 34, 76, 68, 14, true); ctx.strokeStyle = C.line; ctx.lineWidth = 1.2; rr(ctx, cx - 38, cy - 34, 76, 68, 14, false);
      ctx.save(); ctx.translate(cx, cy + 2); ctx.scale(pulse, pulse); ctx.fillStyle = C.ink; ctx.fillText(e, 0, 0); ctx.restore();
    });
    ctx.textBaseline = 'alphabetic';
  }

  const PAGES = [
    { id: 'goal', scene: sceneGoal, loop: 6600, still: 5600 },
    { id: 'fleet', scene: sceneFleet, loop: 4000, still: 0 },
    { id: 'place', scene: scenePlace, loop: 5600, still: 4900 },
    { id: 'shoot', scene: sceneShoot, loop: 6400, still: 5500 },
    { id: 'sink', scene: sceneSink, loop: 5800, still: 5200 },
    { id: 'extras', scene: sceneExtras, loop: 4000, still: 0 },
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
