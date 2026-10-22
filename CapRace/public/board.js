'use strict';
// Plansza wyścigu: tor narysowany kredą na asfalcie, kapsle, kamera podążająca za akcją, minimapa, odtwarzanie lotu
// (serwer przysyła gotową trajektorię) oraz sterowanie: naciśnij swój kapsel i odciągnij mysz (albo palec) jak procę.
// Reguły i fizykę liczy serwer; tu tylko rysujemy i zbieramy parametry pstryknięcia.
const Board = (function () {
  const cv = document.getElementById('board'), ctx = cv.getContext('2d');
  const P = CapEngine.P, TAU = Math.PI * 2;
  const COLORS = ['#e8433a', '#3b8ff0'];                 // kapsel 0 (czerwony) i 1 (niebieski)
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let W = 300, H = 300, dpr = 1, scale = 1;
  let track = null, trackKey = '', trackPath = null, decor = [];
  const caps = [{ x: 0, y: 0, rot: 0 }, { x: 0, y: 0, rot: 0 }];
  let me = 0, turn = null, canAim = false, active = false;
  const cam = { x: 0, y: 0 };
  let anim = null, drag = null, particles = [], raf = 0, last = 0, pattern = null;
  let onShoot = null, onEvent = null, onWeak = null;
  let focusSeat = 0, snapCam = true;

  // ---------- pomocnicze ----------
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16), f = c => clamp(Math.round(c + amt), 0, 255);
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
  function makePattern() {                                // ziarno asfaltu: kilka tysięcy ciemnych i jasnych kropek
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#2a2c32'; g.fillRect(0, 0, 256, 256);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 2600; i++) {
      const light = rnd() < 0.5;
      g.fillStyle = light ? `rgba(255,255,255,${0.025 + rnd() * 0.05})` : `rgba(0,0,0,${0.08 + rnd() * 0.12})`;
      const s = 0.8 + rnd() * 1.8; g.fillRect(rnd() * 256, rnd() * 256, s, s);
    }
    return ctx.createPattern(c, 'repeat');
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(200, cv.clientWidth); H = Math.max(200, cv.clientHeight);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    scale = clamp(W / 900, 0.85, 1.35);
    pattern = makePattern();
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (cv.clientWidth) resize(); }).observe(cv);
  addEventListener('resize', () => { if (cv.clientWidth) resize(); });

  // ---------- tor ----------
  function setTrack(info) {
    if (!info) { track = null; trackKey = ''; trackPath = null; decor = []; return; }
    const key = info.seed + ':' + info.lenKey;
    if (key === trackKey) return;
    trackKey = key; track = CapEngine.buildTrack(info.seed, info.lenKey); decor = CapEngine.decor(track);
    trackPath = new Path2D();
    for (let i = 0; i < track.n; i++) i ? trackPath.lineTo(track.xs[i], track.ys[i]) : trackPath.moveTo(track.xs[i], track.ys[i]);
    snapCam = true;
  }

  // Rysuje coś w układzie toru: w punkcie o długości łuku s, obrócone zgodnie z kierunkiem jazdy.
  function atTrack(s, fn) {
    const p = CapEngine.pointAt(track, s, 0);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang); fn(); ctx.restore();
  }

  function drawTrack() {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(244,241,232,0.92)'; ctx.lineWidth = 2 * P.halfW + 6; ctx.stroke(trackPath);          // kreda: brzegi toru
    ctx.strokeStyle = '#3a3d45'; ctx.lineWidth = 2 * P.halfW - 2; ctx.stroke(trackPath);                           // nawierzchnia
    ctx.strokeStyle = '#41444d'; ctx.lineWidth = 2 * P.halfW - 22; ctx.stroke(trackPath);
    ctx.save(); ctx.setLineDash([16, 24]); ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(244,241,232,0.3)'; ctx.lineWidth = 2.5; ctx.stroke(trackPath); ctx.restore();
    // linia startu
    atTrack(track.sStart - 34, () => {
      ctx.strokeStyle = 'rgba(244,241,232,0.9)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -P.halfW + 2); ctx.lineTo(0, P.halfW - 2); ctx.stroke();
    });
    atTrack(-6, () => { ctx.fillStyle = 'rgba(244,241,232,0.5)'; ctx.font = 'bold 20px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t('track.start'), 0, 0); });
    // meta: szachownica
    atTrack(track.sFinish, () => {
      const cell = 16, rows = Math.ceil(2 * P.halfW / cell);
      for (let r = 0; r < rows; r++) for (let c = 0; c < 2; c++) {
        ctx.fillStyle = (r + c) % 2 ? '#15161a' : '#f4f1e8';
        ctx.fillRect(c * cell - cell, -P.halfW + r * cell, cell, Math.min(cell, P.halfW - (-P.halfW + r * cell)));
      }
    });
    atTrack(track.sFinish + 62, () => { ctx.fillStyle = 'rgba(244,241,232,0.55)'; ctx.font = 'bold 22px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t('track.finish'), 0, 0); });
  }

  // ---------- kredowe malunki (ozdoba, bez wpływu na grę; rozmieszcza je CapEngine.decor z seeda toru) ----------
  function wobble(seed) { const r = CapEngine.mulberry32(seed); return a => (r() - 0.5) * a; }
  function line(pts, J, close) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + J(2.4), y + J(2.4)) : ctx.moveTo(x + J(2.4), y + J(2.4))));
    if (close) ctx.closePath();
    ctx.stroke();
  }
  const circle = (cx, cy, r, n) => Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos(i / n * TAU) * r, cy + Math.sin(i / n * TAU) * r]);
  const CHALK = {
    arrow(r, J) { line([[-r * 1.3, 0], [r * 0.9, 0]], J); for (const k of [0, -0.6]) line([[r * (0.2 + k), -r * 0.7], [r * (0.95 + k), 0], [r * (0.2 + k), r * 0.7]], J); },
    star(r, J) { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * TAU / 10, q = i % 2 ? r * 0.42 : r; p.push([Math.cos(a) * q, Math.sin(a) * q]); } line(p, J, true); },
    smiley(r, J) { line(circle(0, 0, r, 22), J); line([[-r * 0.38, -r * 0.3], [-r * 0.38, -r * 0.12]], J); line([[r * 0.38, -r * 0.3], [r * 0.38, -r * 0.12]], J);
      const m = []; for (let i = 0; i <= 9; i++) { const a = 0.2 * Math.PI + i * 0.6 * Math.PI / 9; m.push([Math.cos(a) * r * 0.58, Math.sin(a) * r * 0.5]); } line(m, J); },
    hop(r, J) { const q = r * 0.95; for (let i = 0; i < 4; i++) { const x = (i - 1.5) * q; line([[x - q / 2, -q / 2], [x + q / 2, -q / 2], [x + q / 2, q / 2], [x - q / 2, q / 2]], J, true);
        ctx.fillStyle = ctx.strokeStyle; ctx.font = `bold ${Math.round(q * 0.7)}px "Segoe Print","Bradley Hand","Comic Sans MS",cursive`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), x, 1); } },
    skid(r, J) { for (const side of [-1, 1]) { const p = []; for (let i = 0; i <= 12; i++) { const x = (i / 12 * 2 - 1) * r * 1.9; p.push([x, side * r * 0.4 + Math.sin(x / r * 1.6) * r * 0.3]); } line(p, J); } },
    flower(r, J) { for (let i = 0; i < 6; i++) { const a = i * TAU / 6; line(circle(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, r * 0.36, 10), J); } line(circle(0, 0, r * 0.22, 8), J); },
    spiral(r, J) { const p = []; for (let i = 0; i <= 64; i++) { const a = i * 0.34, q = r * i / 64; p.push([Math.cos(a) * q, Math.sin(a) * q]); } line(p, J); },
    sun(r, J) { line(circle(0, 0, r * 0.5, 16), J); for (let i = 0; i < 10; i++) { const a = i * TAU / 10; line([[Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72], [Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05]], J); } },
    heart(r, J) { const p = []; for (let i = 0; i <= 28; i++) { const a = i / 28 * TAU; p.push([r / 16 * 16 * Math.pow(Math.sin(a), 3), -r / 16 * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a))]); } line(p, J, true); },
    cross(r, J) { line([[-r * 0.8, -r * 0.8], [r * 0.8, r * 0.8]], J); line([[r * 0.8, -r * 0.8], [-r * 0.8, r * 0.8]], J); },
    go(r, J) { ctx.fillStyle = ctx.strokeStyle; ctx.font = `700 ${Math.round(r * 1.7)}px "Segoe Print","Bradley Hand","Comic Sans MS",cursive`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('GO!', 0, 0); },
  };
  function drawDecor(onTrack) {
    const mx = W / 2 / scale + 140, my = H / 2 / scale + 140;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 3;
    for (const d of decor) {
      if (d.on !== onTrack || Math.abs(d.x - cam.x) > mx || Math.abs(d.y - cam.y) > my) continue;       // tylko to, co widać
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.ang);
      ctx.globalAlpha = d.alpha; ctx.strokeStyle = '#f4f1e8';
      if (CHALK[d.type]) CHALK[d.type](d.r, wobble(d.seed));
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- kapsle ----------
  function drawCap(c, seat) {
    const r = P.capR, base = COLORS[seat], x = c.x, y = c.y;
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(x + 4, y + 5, r * 1.02, r * 0.95, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = shade(base, -60); ctx.beginPath();                                      // karbowany brzeg kapsla
    const teeth = 21, N = teeth * 6;
    for (let i = 0; i <= N; i++) { const a = i / N * TAU, rr = r * (1 + 0.045 * Math.cos(teeth * (a - c.rot))); i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 1, x, y, r * 0.95);
    g.addColorStop(0, shade(base, 70)); g.addColorStop(0.6, base); g.addColorStop(1, shade(base, -35));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 0.84, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';                                                 // znak na kapslu obraca się razem z nim
    for (let i = 0; i < 3; i++) { const a = c.rot + i * TAU / 3; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.36, y + Math.sin(a) * r * 0.36, r * 0.1, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r * 0.74, Math.PI * 1.1, Math.PI * 1.55); ctx.stroke();
  }

  function drawLabel(c, text, seat, above) {                                              // etykieta nad wyższym kapslem i pod niższym, żeby nie zasłaniały się nawzajem
    ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 10, y = above ? c.y - P.capR - 14 : c.y + P.capR + 14;
    ctx.fillStyle = 'rgba(15,16,20,0.62)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(c.x - w / 2, y - 8, w, 16, 8) : ctx.rect(c.x - w / 2, y - 8, w, 16); ctx.fill();
    ctx.fillStyle = shade(COLORS[seat], 60); ctx.fillText(text, c.x, y + 0.5);
  }

  // ---------- cząstki ----------
  function burst(x, y, kind, strength) {
    if (reduced()) return;
    const n = kind === 'cap' ? 10 : 7;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = (kind === 'cap' ? 90 : 60) * (0.4 + Math.random()) * (0.5 + strength);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.35 + Math.random() * 0.35, size: kind === 'cap' ? 2 : 3.2, color: kind === 'cap' ? '255,214,107' : '244,241,232' });
    }
    if (kind === 'cap') particles.push({ x, y, vx: 0, vy: 0, life: 0, max: 0.3, size: 0, ring: true, color: '255,214,107' });
  }
  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life += dt;
      if (p.life >= p.max) { particles.splice(i, 1); continue; }
      const a = 1 - p.life / p.max;
      if (p.ring) { ctx.strokeStyle = `rgba(${p.color},${a * 0.8})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, P.capR * (1 + 1.4 * p.life / p.max), 0, TAU); ctx.stroke(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94;
      ctx.fillStyle = `rgba(${p.color},${a * 0.9})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.6 + a * 0.6), 0, TAU); ctx.fill();
    }
  }

  // ---------- odtwarzanie lotu ----------
  // shot: { frames, events, seconds, by, spin0, age } z serwera. startOffset: ile ms lotu już minęło (po odświeżeniu strony).
  function play(shot, onEnd) {
    const startMs = Math.min(shot.age || 0, shot.seconds * 1000);
    anim = { shot, t: startMs / 1000, ev: 0, onEnd, rotT: 0 };
    while (anim.ev < shot.events.length && shot.events[anim.ev][0] / 30 < anim.t) anim.ev++;          // pomijamy dźwięki z przeszłości
    if (reduced()) anim.t = shot.seconds;                                                           // bez ruchu: od razu pozycja końcowa
  }
  function stopAnim() { anim = null; }                    // przerwanie bez wywoływania onEnd (nowa partia, nowe pstryknięcie)
  function stepAnim(dt) {
    const a = anim, sh = a.shot, fr = sh.frames;
    a.t += dt;
    const f = Math.min(a.t * 30, fr.length - 1), i = Math.floor(f), u = f - i, A = fr[i], B = fr[Math.min(i + 1, fr.length - 1)];
    for (let c = 0; c < 2; c++) {
      const nx = A[c * 2] + (B[c * 2] - A[c * 2]) * u, ny = A[c * 2 + 1] + (B[c * 2 + 1] - A[c * 2 + 1]) * u;
      const moved = Math.hypot(nx - caps[c].x, ny - caps[c].y);
      caps[c].spd = moved / Math.max(dt, 1e-3);
      caps[c].rot += moved / P.capR * 0.6;
      if (c === sh.by) caps[c].rot -= (sh.spin0 || 0) * 7 * Math.exp(-1.1 * a.t) * dt;
      caps[c].x = nx; caps[c].y = ny;
    }
    while (a.ev < sh.events.length && sh.events[a.ev][0] / 30 <= a.t) {
      const [, type, strength] = sh.events[a.ev++];
      const p0 = caps[0], p1 = caps[1];
      let x, y;
      if (type === 2) { x = (p0.x + p1.x) / 2; y = (p0.y + p1.y) / 2; }
      else { const k = (p1.spd || 0) > (p0.spd || 0) ? 1 : 0; x = caps[k].x; y = caps[k].y; }      // banda: kapsel, który się szybciej porusza
      burst(x, y, type === 2 ? 'cap' : 'wall', strength);
      if (onEvent) onEvent(type === 2 ? 'cap' : 'wall', strength);
    }
    if (a.t >= sh.seconds) { anim = null; if (a.onEnd) a.onEnd(); }
  }

  // ---------- kamera i minimapa ----------
  function focusPoint() {
    if (anim) return caps[anim.shot.by];
    return caps[clamp(focusSeat, 0, 1)];
  }
  function drawMinimap() {
    if (!track) return;
    const bw = Math.min(170, W * 0.32), bh = Math.min(110, H * 0.3), bb = track.bbox, tw = bb[2] - bb[0], th = bb[3] - bb[1];
    const k = Math.min((bw - 14) / tw, (bh - 14) / th), ox = W - bw - 10 + (bw - tw * k) / 2 - bb[0] * k, oy = H - bh - 10 + (bh - th * k) / 2 - bb[1] * k;
    ctx.save();
    ctx.fillStyle = 'rgba(15,16,20,0.62)'; ctx.strokeStyle = 'rgba(244,241,232,0.3)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.rect(W - bw - 10, H - bh - 10, bw, bh); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.rect(W - bw - 10, H - bh - 10, bw, bh); ctx.clip();
    ctx.beginPath();
    for (let i = 0; i < track.n; i += 3) { const x = ox + track.xs[i] * k, y = oy + track.ys[i] * k; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.strokeStyle = 'rgba(244,241,232,0.8)'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.stroke();
    const fin = CapEngine.pointAt(track, track.sFinish, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(ox + fin.x * k - 3, oy + fin.y * k - 3, 6, 6);
    ctx.fillStyle = '#111'; ctx.fillRect(ox + fin.x * k - 3, oy + fin.y * k - 3, 3, 3); ctx.fillRect(ox + fin.x * k, oy + fin.y * k, 3, 3);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;                                 // okno kamery
    ctx.strokeRect(ox + (cam.x - W / 2 / scale) * k, oy + (cam.y - H / 2 / scale) * k, W / scale * k, H / scale * k);
    caps.forEach((c, i) => {
      ctx.fillStyle = COLORS[i]; ctx.beginPath(); ctx.arc(ox + c.x * k, oy + c.y * k, i === me ? 4.5 : 3.5, 0, TAU); ctx.fill();
      if (i === me) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
    });
    ctx.restore();
  }

  // ---------- celowanie ----------
  function world(e) {
    const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
    return { sx, sy, x: cam.x + (sx - W / 2) / scale, y: cam.y + (sy - H / 2) / scale };
  }
  function currentShot() {
    if (!drag) return null;
    return CapEngine.shotFromInput(drag.hx, drag.hy, drag.px, drag.py);
  }
  function updatePreview() {
    const s = currentShot();
    drag.shot = s;
    drag.preview = s ? CapEngine.simulate(null, [{ x: caps[me].x, y: caps[me].y }], 0, s, { maxT: 2.2 }).frames : null;
  }
  cv.addEventListener('pointerdown', e => {
    if (!canAim || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const w = world(e), c = caps[me];
    if (Math.hypot(w.x - c.x, w.y - c.y) * scale > Math.max(P.capR * scale * 1.9, 30)) return;
    let hx = (w.x - c.x) / P.capR, hy = (w.y - c.y) / P.capR; const hl = Math.hypot(hx, hy); if (hl > 1) { hx /= hl; hy /= hl; }
    drag = { sx: w.x, sy: w.y, hx, hy, px: 0, py: 0, shot: null, preview: null, id: e.pointerId };
    try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    cv.classList.add('aiming'); e.preventDefault();
  });
  cv.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const w = world(e); let px = w.x - drag.sx, py = w.y - drag.sy;
    const l = Math.hypot(px, py); if (l > P.maxPull) { px *= P.maxPull / l; py *= P.maxPull / l; }
    drag.px = px; drag.py = py; updatePreview();
  });
  function endDrag(fire) {
    if (!drag) return;
    const d = drag; drag = null; cv.classList.remove('aiming');
    if (!fire) return;
    if (d.shot) { if (onShoot) onShoot({ hx: d.hx, hy: d.hy, px: d.px, py: d.py }); }
    else if (Math.hypot(d.px, d.py) > 2 && onWeak) onWeak();
  }
  cv.addEventListener('pointerup', e => { if (drag && e.pointerId === drag.id) endDrag(true); });
  cv.addEventListener('pointercancel', () => endDrag(false));
  cv.addEventListener('contextmenu', e => { if (drag) { e.preventDefault(); endDrag(false); } });
  addEventListener('keydown', e => { if (e.key === 'Escape' && drag) endDrag(false); });

  function drawAim() {
    const c = caps[me], d = drag, pl = Math.hypot(d.px, d.py), power = clamp(pl / P.maxPull, 0, 1), col = `hsl(${Math.round(120 - 120 * power)},90%,58%)`;
    if (d.preview && d.shot) {                                              // przerywany podgląd początku toru lotu
      const pts = d.preview, shown = Math.floor(pts.length * 0.75);
      for (let i = 2; i < shown; i += 2) {
        const a = 0.85 * (1 - i / shown);
        ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], 2.6, 0, TAU); ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(244,241,232,0.7)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);               // gumka procy: od punktu uderzenia do kursora
    ctx.beginPath(); ctx.moveTo(d.sx, d.sy); ctx.lineTo(d.sx + d.px, d.sy + d.py); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(244,241,232,0.9)'; ctx.beginPath(); ctx.arc(d.sx + d.px, d.sy + d.py, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe14d'; ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(c.x + d.hx * P.capR, c.y + d.hy * P.capR, 3.6, 0, TAU); ctx.fill(); ctx.stroke();   // punkt uderzenia
    if (d.shot) {                                                           // strzałka kierunku, długość i kolor = siła
      const len = 36 + 120 * power, ex = c.x + d.shot.dx * len, ey = c.y + d.shot.dy * len, ang = Math.atan2(d.shot.dy, d.shot.dx);
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(c.x + d.shot.dx * (P.capR + 4), c.y + d.shot.dy * (P.capR + 4)); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex + Math.cos(ang) * 12, ey + Math.sin(ang) * 12); ctx.lineTo(ex + Math.cos(ang + 2.5) * 11, ey + Math.sin(ang + 2.5) * 11); ctx.lineTo(ex + Math.cos(ang - 2.5) * 11, ey + Math.sin(ang - 2.5) * 11); ctx.closePath(); ctx.fill();
    }
  }
  function drawHud() {
    ctx.font = 'bold 14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let text = null, color = '#f4f1e8';
    if (drag && drag.shot) {
      const pw = Math.round(drag.shot.power * 100), sp = Math.round(Math.abs(drag.shot.spin) * 100);
      text = t('hud.power', pw) + '  ·  ' + (sp < 4 ? t('hud.spinNone') : t(drag.shot.spin > 0 ? 'hud.spinLeft' : 'hud.spinRight', sp));
      color = `hsl(${Math.round(120 - 120 * drag.shot.power)},90%,70%)`;
    }
    if (!text) return;
    const w = ctx.measureText(text).width + 22;
    ctx.fillStyle = 'rgba(15,16,20,0.7)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(W / 2 - w / 2, 10, w, 28, 14) : ctx.rect(W / 2 - w / 2, 10, w, 28); ctx.fill();
    ctx.fillStyle = color; ctx.fillText(text, W / 2, 24.5);
  }

  // ---------- pętla rysowania ----------
  function frame(now) {
    raf = active ? requestAnimationFrame(frame) : 0;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    if (!cv.clientWidth) return;
    if (cv.width !== Math.round(cv.clientWidth * dpr)) resize();
    if (anim) stepAnim(dt);
    if (track) {
      const f = focusPoint();
      if (snapCam) { cam.x = f.x; cam.y = f.y; snapCam = false; }
      else { const k = 1 - Math.exp(-6 * dt); cam.x += (f.x - cam.x) * k; cam.y += (f.y - cam.y) * k; }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#2a2c32'; ctx.fillRect(0, 0, W, H);
    if (!track) return;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (W / 2 - cam.x * scale), dpr * (H / 2 - cam.y * scale));
    ctx.fillStyle = pattern || '#2a2c32'; ctx.fillRect(cam.x - W / 2 / scale, cam.y - H / 2 / scale, W / scale, H / scale);
    drawDecor(false);
    drawTrack();
    drawDecor(true);
    const pulse = 0.5 + 0.5 * Math.sin(now / 260);
    const order = [0, 1].sort((a, b) => (a === me) - (b === me));         // własny kapsel na wierzchu
    for (const i of order) {
      const c = caps[i];
      if (turn === i && !anim) {                                              // pulsujący pierścień przy kapslu, który ma teraz pstryknąć
        ctx.strokeStyle = i === me ? `rgba(255,255,255,${0.5 + 0.4 * pulse})` : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(c.x, c.y, P.capR + 7 + pulse * 3, 0, TAU); ctx.stroke();
      }
      drawCap(c, i);
    }
    if (!drag) for (const i of [0, 1]) drawLabel(caps[i], t(i === me ? 'game.you' : 'game.opp'), i, caps[i].y <= caps[1 - i].y);
    if (drag) drawAim();
    drawParticles(dt);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMinimap();
    drawHud();
  }

  function setCaps(list) {
    if (!list) return;
    for (let i = 0; i < 2; i++) if (list[i]) { caps[i].x = list[i].x; caps[i].y = list[i].y; }
  }

  return {
    setTrack, setCaps, play, stopAnim,
    setMe(i) { me = i; },
    setTurn(i) { turn = i; if (i !== null && i !== undefined) focusSeat = i; },
    setFocus(i) { focusSeat = i; },
    setCanAim(b) { canAim = b; cv.classList.toggle('can-aim', !!b && !drag); if (!b && drag) endDrag(false); },
    setActive(b) { active = b; if (b && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } },
    snap() { snapCam = true; },
    onShoot(fn) { onShoot = fn; }, onEvent(fn) { onEvent = fn; }, onWeak(fn) { onWeak = fn; },
    get animating() { return !!anim; },
    get aiming() { return !!drag; },
    info() { return { cam: { x: cam.x, y: cam.y }, scale, W, H, caps: caps.map(c => ({ x: c.x, y: c.y })), me, canAim, animating: !!anim, aiming: !!drag, track: !!track }; },
    // do testów: współrzędne ekranowe (względem strony) punktu świata
    toScreen(x, y) { const r = cv.getBoundingClientRect(); return { x: r.left + W / 2 + (x - cam.x) * scale, y: r.top + H / 2 + (y - cam.y) * scale }; },
  };
})();
