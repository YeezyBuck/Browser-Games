'use strict';
// Tło: wieczorne niebo, falujące morze i dwa pirackie statki ostrzeliwujące się armatami.
// Wszystko rysowane na <canvas>, bez żadnych plików graficznych.
(function () {
  const cv = document.getElementById('sea');
  const ctx = cv.getContext('2d');
  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W, H, dpr, sc, stars, moon;

  // warstwy fal: base = ułamek wysokości ekranu, wl = długość fali (px), speed = prędkość (rad/s)
  const LAYERS = [
    { base: 0.52, amp: 5,  wl: 220, speed: 0.6,  color: '#0e4e78', foam: 0 },
    { base: 0.56, amp: 7,  wl: 300, speed: -0.8, color: '#0b4468', foam: 0 },
    { base: 0.635, amp: 9, wl: 360, speed: 0.9,  color: 'rgba(8,52,86,0.96)', foam: 0.22 },   // przód 1 – zakrywa dolną część kadłubów
    { base: 0.72, amp: 12, wl: 440, speed: -0.7, color: 'rgba(5,38,68,0.97)', foam: 0.18 },
    { base: 0.84, amp: 16, wl: 520, speed: 0.6,  color: '#031a32', foam: 0.14 },
  ];
  const waveY = (L, x, t) =>
    L.base * H + L.amp * sc * (Math.sin(x * 6.283 / (L.wl * sc) + t * L.speed) + 0.45 * Math.sin(x * 6.283 / (L.wl * sc * 0.43) - t * L.speed * 1.4));

  const ships = [
    { dir: 1,  fx: 0.22, phase: 0,   kick: 0 },    // dir 1 = płynie w prawo (dziób po prawej)
    { dir: -1, fx: 0.78, phase: 2.1, kick: 0 },
  ];
  let particles = [], balls = [], nextShot = 1.2, shooter = 0;

  function setup() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sc = Math.max(0.55, Math.min(W / 1100, 1.15));
    // księżyc jako sierp: koło z wyciętym kołem (przezroczysta dziura, nie kolorowa)
    const R = 20 * sc + 6;
    moon = document.createElement('canvas'); moon.width = moon.height = Math.ceil(R * 2 + 4);
    const m = moon.getContext('2d'), c = moon.width / 2;
    m.fillStyle = 'rgba(255,248,225,0.92)'; m.beginPath(); m.arc(c, c, R, 0, 6.28); m.fill();
    m.globalCompositeOperation = 'destination-out';
    m.beginPath(); m.arc(c + R * 0.45, c - R * 0.15, R * 0.9, 0, 6.28); m.fill();
    stars = Array.from({ length: Math.round(W / 14) }, () => ({
      x: Math.random() * W, y: Math.random() * H * 0.45, r: Math.random() * 1.1 + 0.3, f: Math.random() * 2 + 0.5, p: Math.random() * 6.28,
    }));
  }

  const shipBaseY = (x, t) => LAYERS[2].base * H - 10 * sc + 0.6 * (waveY(LAYERS[1], x, t) - LAYERS[1].base * H);
  function shipPose(s, t) {
    const x = s.fx * W + 28 * sc * Math.sin(t * 0.15 + s.phase) * s.dir * -1;
    const y = shipBaseY(x, t);
    const slope = (shipBaseY(x + 20, t) - shipBaseY(x - 20, t)) / 40;
    const rot = Math.atan(slope) * 0.8 + s.kick * 0.07 * Math.sin(t * 22) + 0.02 * Math.sin(t * 1.3 + s.phase);
    return { x, y, rot };
  }

  function drawShip(s, t) {
    const p = shipPose(s, t);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot * s.dir);
    ctx.scale(s.dir * sc, sc);

    const b = 5 * Math.sin(t * 1.7 + s.phase);                      // wydęcie żagli
    // maszty
    ctx.strokeStyle = '#2a190d'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-10, -30); ctx.lineTo(-10, -152); ctx.moveTo(52, -30); ctx.lineTo(52, -122); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-44, -134); ctx.lineTo(22, -134); ctx.moveTo(24, -112); ctx.lineTo(80, -112); ctx.moveTo(100, -34); ctx.lineTo(140, -56); ctx.stroke();
    // żagle
    ctx.fillStyle = '#e6dab9'; ctx.strokeStyle = 'rgba(60,40,20,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-42, -132); ctx.lineTo(20, -132); ctx.quadraticCurveTo(28 + b, -98, 20, -64);
    ctx.lineTo(-42, -64); ctx.quadraticCurveTo(-34 + b * 0.5, -98, -42, -132); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(26, -110); ctx.lineTo(78, -110); ctx.quadraticCurveTo(85 + b, -84, 78, -58);
    ctx.lineTo(26, -58); ctx.quadraticCurveTo(33 + b * 0.5, -84, 26, -110); ctx.fill(); ctx.stroke();
    // flaga z czaszką
    const fw = 3 * Math.sin(t * 5 + s.phase);
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.moveTo(-10, -152); ctx.lineTo(-36, -158 + fw); ctx.lineTo(-34, -142 + fw); ctx.lineTo(-10, -140); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.arc(-23, -150 + fw * 0.6, 3, 0, 6.28); ctx.fill();
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-28, -145 + fw * 0.6); ctx.lineTo(-18, -142 + fw * 0.6); ctx.moveTo(-28, -142 + fw * 0.6); ctx.lineTo(-18, -145 + fw * 0.6); ctx.stroke();
    // kadłub
    ctx.fillStyle = '#3a2213';
    ctx.beginPath(); ctx.moveTo(-92, -36); ctx.lineTo(-80, 8); ctx.quadraticCurveTo(0, 26, 84, 6); ctx.lineTo(106, -38);
    ctx.quadraticCurveTo(0, -30, -92, -36); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#8a5a30'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-92, -36); ctx.quadraticCurveTo(0, -30, 106, -38); ctx.stroke();
    ctx.fillStyle = '#120a05';
    for (let i = 0; i < 4; i++) ctx.fillRect(-56 + i * 30, -20, 9, 8);                 // furty armatnie
    ctx.fillStyle = '#6b4a2b'; ctx.fillRect(-98, -52, 14, 18);                         // rufa
    ctx.restore();
  }

  // pozycja lufy w układzie ekranu
  function muzzle(s, t) {
    const p = shipPose(s, t);
    return { x: p.x + s.dir * 112 * sc, y: p.y - 38 * sc };
  }

  function addParticles(kind, x, y, n, extra) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, v = Math.random();
      particles.push(Object.assign({ kind, x, y, vx: 0, vy: 0, life: 0, max: 1, size: 3 }, ({
        smoke: { vx: (Math.random() - 0.3) * 18, vy: -10 - Math.random() * 14, max: 1.6 + Math.random(), size: 6 + Math.random() * 6 },
        spark: { vx: Math.cos(a) * (60 + v * 160), vy: Math.sin(a) * (60 + v * 160) - 40, max: 0.5 + Math.random() * 0.5, size: 2 + Math.random() * 2.5 },
        splash: { vx: (Math.random() - 0.5) * 90, vy: -90 - Math.random() * 120, max: 0.8 + Math.random() * 0.4, size: 2 + Math.random() * 2 },
        ring: { max: 1.0, size: 4 },
        flash: { max: 0.18, size: 26 + Math.random() * 10 },
      })[kind], extra || {}));
    }
  }

  function fire(from, to, t) {
    const a = ships[from], b = ships[to];
    const m = muzzle(a, t), tp = shipPose(b, t);
    const hit = Math.random() < 0.6;
    const tx = hit ? tp.x + (Math.random() - 0.5) * 60 * sc : tp.x + b.dir * -1 * (0 + (Math.random() < 0.5 ? -1 : 1) * (80 + Math.random() * 60) * sc);
    const ty = hit ? tp.y - (20 + Math.random() * 25) * sc : shipBaseY(tx, t) + 4 * sc;
    balls.push({ x0: m.x, y0: m.y, x1: tx, y1: ty, t0: t, dur: 1.0 + Math.random() * 0.3, hit, target: to, arc: (60 + Math.random() * 40) * sc });
    addParticles('flash', m.x, m.y, 1);
    addParticles('smoke', m.x, m.y, 7);
    addParticles('spark', m.x, m.y, 6, { size: 1.5 });
  }

  function step(t, dt) {
    if (t > nextShot) {
      fire(shooter, 1 - shooter, t);
      if (Math.random() > 0.2) shooter = 1 - shooter;
      nextShot = t + 1.5 + Math.random() * 1.8;
    }
    for (const s of ships) s.kick = Math.max(0, s.kick - dt * 1.4);
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i], u = (t - b.t0) / b.dur;
      if (u >= 1) {
        if (b.hit) {
          addParticles('flash', b.x1, b.y1, 1, { size: 44 });
          addParticles('spark', b.x1, b.y1, 18);
          addParticles('smoke', b.x1, b.y1, 8);
          ships[b.target].kick = 1;
        } else {
          addParticles('splash', b.x1, b.y1, 14);
          addParticles('ring', b.x1, b.y1, 1);
        }
        balls.splice(i, 1);
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.max) { particles.splice(i, 1); continue; }
      if (p.kind === 'spark' || p.kind === 'splash') p.vy += 330 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const k = p.life / p.max, a = 1 - k;
      if (p.kind === 'smoke') {
        ctx.fillStyle = `rgba(200,200,205,${0.35 * a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, (p.size + k * 14) * sc, 0, 6.28); ctx.fill();
      } else if (p.kind === 'spark') {
        ctx.fillStyle = `rgba(255,${Math.round(190 - 120 * k)},60,${a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * sc, 0, 6.28); ctx.fill();
      } else if (p.kind === 'splash') {
        ctx.fillStyle = `rgba(235,245,255,${0.9 * a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * sc, 0, 6.28); ctx.fill();
      } else if (p.kind === 'ring') {
        ctx.strokeStyle = `rgba(235,245,255,${0.7 * a})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, (8 + k * 40) * sc, (3 + k * 10) * sc, 0, 0, 6.28); ctx.stroke();
      } else if (p.kind === 'flash') {
        const r = p.size * sc * (0.6 + k);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, `rgba(255,245,200,${a})`); g.addColorStop(0.5, `rgba(255,150,40,${0.7 * a})`); g.addColorStop(1, 'rgba(255,100,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.28); ctx.fill();
      }
    }
  }

  function drawBalls(t) {
    for (const b of balls) {
      const u = (t - b.t0) / b.dur;
      const x = b.x0 + (b.x1 - b.x0) * u;
      const y = b.y0 + (b.y1 - b.y0) * u - b.arc * 4 * u * (1 - u);
      ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(x, y, 4 * sc, 0, 6.28); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(x - sc, y - sc, 1.4 * sc, 0, 6.28); ctx.fill();
    }
  }

  function drawLayer(L, t) {
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 8; x += 8) ctx.lineTo(x, waveY(L, x, t));
    ctx.lineTo(W, H); ctx.closePath();
    ctx.fillStyle = L.color; ctx.fill();
    if (L.foam) {
      ctx.beginPath();
      for (let x = 0; x <= W + 8; x += 8) { const y = waveY(L, x, t); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.strokeStyle = `rgba(255,255,255,${L.foam})`; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  function drawSky(t) {
    const hz = LAYERS[0].base * H;
    const g = ctx.createLinearGradient(0, 0, 0, hz + 20);
    g.addColorStop(0, '#07122b'); g.addColorStop(0.55, '#2b2563'); g.addColorStop(0.85, '#a8515f'); g.addColorStop(1, '#f09a5a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, hz + 40);
    for (const s of stars) {
      const a = still ? 0.6 : 0.25 + 0.6 * (0.5 + 0.5 * Math.sin(t * s.f + s.p));
      ctx.fillStyle = `rgba(255,255,255,${a * (1 - s.y / (hz + 1) * 0.6)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.28); ctx.fill();
    }
    const glow = ctx.createRadialGradient(W * 0.5, hz, 0, W * 0.5, hz, W * 0.45);
    glow.addColorStop(0, 'rgba(255,190,110,0.5)'); glow.addColorStop(1, 'rgba(255,190,110,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, hz + 40);
    // księżyc
    ctx.drawImage(moon, W * 0.86 - moon.width / 2, H * 0.12 - moon.height / 2);
  }

  let last = performance.now(), clock = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    clock += still ? 0 : dt;
    const t = clock;
    ctx.clearRect(0, 0, W, H);
    drawSky(t);
    drawLayer(LAYERS[0], t); drawLayer(LAYERS[1], t);
    ships.forEach(s => drawShip(s, t));
    drawLayer(LAYERS[2], t);
    drawBalls(t); drawParticles();
    drawLayer(LAYERS[3], t); drawLayer(LAYERS[4], t);
    if (!still) { step(t, dt); requestAnimationFrame(frame); }
  }

  setup();
  // ?seafwd=N przewija symulację o N sekund (przydatne do testów/zrzutów ekranu)
  const fwd = parseFloat(new URLSearchParams(location.search).get('seafwd')) || 0;
  for (let i = 0; i < fwd * 60 && !still; i++) { clock += 1 / 60; step(clock, 1 / 60); }
  requestAnimationFrame(frame);
  addEventListener('resize', () => { setup(); if (still) requestAnimationFrame(frame); });
  document.addEventListener('visibilitychange', () => { last = performance.now(); });
})();
