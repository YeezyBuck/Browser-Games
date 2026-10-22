'use strict';
// Fajerwerki na ekranie zwycięzcy: rakiety wzlatują z dołu, wybuchają kolorowymi kulami, pierścieniami i "wierzbami",
// na koniec salwa finałowa. Rysowane na <canvas> nad stroną (pointer-events: none), bez plików graficznych.
const Fireworks = (function () {
  const cv = document.getElementById('fireworks');
  const ctx = cv.getContext('2d');
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, k = 1, rockets = [], sparks = [], raf = 0, active = false;
  let t = 0, last = 0, nextLaunch = 0, duration = 0, finale = false;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    k = Math.max(0.6, Math.min(Math.min(W, H) / 700, 1.4));          // skala wielkości wybuchów do rozmiaru ekranu
  }
  addEventListener('resize', () => { if (active) resize(); });

  const rnd = (a, b) => a + Math.random() * (b - a);
  const hue = () => Math.floor(Math.random() * 360);

  function launch(x, ty) {
    rockets.push({ x0: x, x1: x + rnd(-60, 60), y0: H + 10, y1: ty, t: 0, T: rnd(0.8, 1.25), hue: hue() });
  }

  function burst(x, y, h) {
    const type = ['peony', 'peony', 'ring', 'willow', 'double'][Math.floor(Math.random() * 5)];
    const add = (n, speed, life, gravity, hh, size, ring) => {
      for (let i = 0; i < n; i++) {
        const a = ring ? (i / n) * 6.283 : Math.random() * 6.283;
        const v = ring ? speed : speed * Math.sqrt(Math.random());   // kula wypełniona równomiernie
        sparks.push({ x, y, px: x, py: y, vx: Math.cos(a) * v * k, vy: Math.sin(a) * v * k, life: 0, max: life * rnd(0.8, 1.15), g: gravity, hue: hh + rnd(-12, 12), size: size * k });
      }
    };
    if (type === 'peony') add(90, 230, 1.5, 120, h, 2.2);
    else if (type === 'ring') add(64, 210, 1.4, 90, h, 2.4, true);
    else if (type === 'willow') add(70, 150, 2.6, 160, 42, 2.0);     // złote, długo opadające
    else { add(60, 250, 1.5, 110, h, 2.2); add(45, 120, 1.7, 110, (h + 180) % 360, 2.0); }
    sparks.push({ x, y, px: x, py: y, vx: 0, vy: 0, life: 0, max: 0.18, g: 0, hue: h, size: 26 * k, flash: true });   // błysk
  }

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now; t += dt;
    // spawn rakiet w czasie trwania pokazu
    if (t < duration && t >= nextLaunch) {
      const n = Math.random() < 0.3 ? 2 : 1;
      for (let i = 0; i < n; i++) launch(rnd(0.12, 0.88) * W, rnd(0.12, 0.5) * H);
      nextLaunch = t + rnd(0.28, 0.7);
    }
    if (!finale && t >= duration - 0.6) { finale = true; for (let i = 0; i < 7; i++) setTimeout(() => active && launch(rnd(0.1, 0.9) * W, rnd(0.1, 0.45) * H), i * 90); }

    // zanikanie śladów
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i]; r.t += dt;
      const u = Math.min(r.t / r.T, 1), e = 1 - (1 - u) * (1 - u);   // wzlot z wyhamowaniem
      const x = r.x0 + (r.x1 - r.x0) * e, y = r.y0 + (r.y1 - r.y0) * e;
      ctx.strokeStyle = `hsla(${r.hue},100%,75%,0.9)`; ctx.lineWidth = 2 * k; ctx.beginPath();
      ctx.moveTo(x - (r.x1 - r.x0) * 0.03, y + 18 * k); ctx.lineTo(x, y); ctx.stroke();
      if (u >= 1) { burst(x, y, r.hue); rockets.splice(i, 1); }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.life += dt;
      if (s.life >= s.max) { sparks.splice(i, 1); continue; }
      const a = 1 - s.life / s.max;
      if (s.flash) {
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * (1 + s.life * 6));
        g.addColorStop(0, `hsla(${s.hue},100%,90%,${a})`); g.addColorStop(1, `hsla(${s.hue},100%,60%,0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, s.size * (1 + s.life * 6), 0, 6.283); ctx.fill();
        continue;
      }
      const f = Math.pow(0.985, dt * 60);
      s.vx *= f; s.vy = s.vy * f + s.g * dt;
      s.px = s.x; s.py = s.y; s.x += s.vx * dt; s.y += s.vy * dt;
      ctx.strokeStyle = `hsla(${s.hue},100%,${60 + 25 * a}%,${a})`; ctx.lineWidth = s.size; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s.px, s.py); ctx.lineTo(s.x, s.y); ctx.stroke();
    }
    if (t < duration + 0.5 || rockets.length || sparks.length) raf = requestAnimationFrame(frame);
    else stop();
  }

  function start(ms) {
    if (reduced()) return false;                         // użytkownik prosi o ograniczenie ruchu
    stop();
    resize();
    active = true; finale = false; rockets = []; sparks = [];
    duration = (ms || 9000) / 1000; t = 0; nextLaunch = 0; last = performance.now();
    cv.hidden = false;
    raf = requestAnimationFrame(frame);
    return true;
  }

  function stop() {
    cancelAnimationFrame(raf); raf = 0; active = false; rockets = []; sparks = [];
    ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, cv.width, cv.height);
    cv.hidden = true;
  }

  return { start, stop, get active() { return active; }, get particles() { return sparks.length + rockets.length; } };
})();
