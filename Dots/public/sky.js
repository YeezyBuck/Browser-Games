'use strict';
// Tło: nocne niebo z migającymi gwiazdami i powoli płynącymi konstelacjami (kropki połączone liniami – jak w grze).
(function () {
  const cv = document.getElementById('sky'), ctx = cv.getContext('2d');
  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W, H, stars, groups, dpr;

  function setup() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(W * H / 7000);
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.3 + 0.3, f: Math.random() * 2 + 0.6, p: Math.random() * 6.28,
    }));
    const g = Math.max(3, Math.round(W * H / 160000));
    groups = Array.from({ length: g }, () => {
      const cx = Math.random() * W, cy = Math.random() * H, k = 5 + Math.floor(Math.random() * 3);
      const a = Math.random() * 6.28, sp = 8 + Math.random() * 10;           // px/s, cała grupa płynie razem
      return {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        pts: Array.from({ length: k }, (_, i) => ({
          x: cx + (i - k / 2) * 38 + (Math.random() - 0.5) * 30,
          y: cy + (Math.random() - 0.5) * 90,
          p: Math.random() * 6.28,
        })),
      };
    });
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    const t = now / 1000;
    ctx.clearRect(0, 0, W, H);

    for (const s of stars) {
      const a = still ? 0.7 : 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * s.f + s.p));
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.28); ctx.fill();
    }

    for (const g of groups) {
      if (!still) {
        for (const q of g.pts) { q.x += g.vx * dt; q.y += g.vy * dt; }
        const xs = g.pts.map(q => q.x), ys = g.pts.map(q => q.y), m = 60;      // zawinięcie całej konstelacji
        if (Math.max(...xs) < -m) g.pts.forEach(q => q.x += W + 2 * m + 200);
        if (Math.min(...xs) > W + m) g.pts.forEach(q => q.x -= W + 2 * m + 200);
        if (Math.max(...ys) < -m) g.pts.forEach(q => q.y += H + 2 * m + 200);
        if (Math.min(...ys) > H + m) g.pts.forEach(q => q.y -= H + 2 * m + 200);
      }
      ctx.strokeStyle = 'rgba(170,190,255,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath();
      g.pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y));
      ctx.stroke();
      for (const q of g.pts) {
        const a = still ? 0.95 : 0.6 + 0.4 * Math.sin(t * 1.5 + q.p);
        ctx.fillStyle = `rgba(220,230,255,${a})`;
        ctx.shadowColor = 'rgba(160,190,255,0.9)'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(q.x, q.y, 2.2, 0, 6.28); ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    if (!still) requestAnimationFrame(frame);
  }

  setup(); requestAnimationFrame(frame);
  addEventListener('resize', () => { setup(); if (still) requestAnimationFrame(frame); });
})();
