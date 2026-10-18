'use strict';
// Wybuchy na planszy: kula ognia, fala uderzeniowa, iskry, odłamki i dym w miejscu trafienia + drżenie planszy.
// Zatopienie to seria eksplozji wzdłuż całego statku zakończona dużym wybuchem. Rysowane na <canvas> nad stroną
// (pointer-events: none). Przy "ogranicz ruch" w systemie animacja jest pomijana.
const Blast = (function () {
  const cv = document.getElementById('blast');
  const ctx = cv.getContext('2d');
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let parts = [], raf = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', () => { if (parts.length) resize(); });

  // Jedna eksplozja w punkcie (x, y); s = rozmiar pola w px, power = siła (1 = trafienie, ok. 2 = wielki wybuch)
  function spawn(x, y, s, power, delay) {
    const t0 = performance.now() + delay * 1000;
    const add = p => parts.push(Object.assign({ x, y, t0, px: x, py: y }, p));
    add({ type: 'flash', max: 0.16, r: s * 2.6 * power });
    add({ type: 'fire', max: 0.55 + 0.25 * power, r: s * 1.35 * power });
    add({ type: 'ring', max: 0.5 + 0.1 * power, r: s * 3.0 * power });
    for (let i = 0; i < Math.round(26 * power); i++) {            // iskry
      const a = rnd(0, 6.283), v = rnd(140, 460) * Math.sqrt(power) * (s / 34);
      add({ type: 'spark', max: rnd(0.45, 1.0), vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, g: 520, w: rnd(1.4, 2.6), hue: rnd(18, 52) });
    }
    for (let i = 0; i < Math.round(9 * power); i++) {             // odłamki kadłuba
      const a = rnd(-3.4, 0.25), v = rnd(120, 380) * (s / 34);
      add({ type: 'debris', max: rnd(0.7, 1.3), vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 700, size: rnd(2, 4.5) * (s / 34), rot: rnd(0, 6), vr: rnd(-12, 12) });
    }
    for (let i = 0; i < Math.round(5 * power); i++) {             // dym unoszący się nad statkiem
      add({ type: 'smoke', max: rnd(1.4, 2.6), x: x + rnd(-s * 0.5, s * 0.5), vx: rnd(-14, 14), vy: rnd(-46, -18), r: rnd(0.45, 0.85) * s * power, delay: rnd(0.05, 0.3) });
    }
  }

  function frame(now) {
    ctx.setTransform(Math.min(window.devicePixelRatio || 1, 2), 0, 0, Math.min(window.devicePixelRatio || 1, 2), 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      const age = (now - p.t0) / 1000 - (p.delay || 0);
      if (age < 0) continue;
      if (age >= p.max) { parts.splice(i, 1); continue; }
      const k = age / p.max, a = 1 - k;
      if (p.type === 'flash') {
        ctx.globalCompositeOperation = 'lighter';
        const r = p.r * (0.5 + k);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, `rgba(255,255,235,${a})`); g.addColorStop(0.4, `rgba(255,210,120,${a * 0.6})`); g.addColorStop(1, 'rgba(255,150,40,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.fill();
      } else if (p.type === 'fire') {
        ctx.globalCompositeOperation = 'lighter';
        const r = p.r * (0.35 + 0.9 * Math.sqrt(k));
        const g = ctx.createRadialGradient(p.x, p.y - r * 0.15 * k, 0, p.x, p.y, r);
        g.addColorStop(0, `rgba(255,240,170,${0.95 * a})`); g.addColorStop(0.35, `rgba(255,150,30,${0.85 * a})`);
        g.addColorStop(0.75, `rgba(200,50,10,${0.5 * a})`); g.addColorStop(1, 'rgba(90,10,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.fill();
      } else if (p.type === 'ring') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,225,170,${0.7 * a})`; ctx.lineWidth = 3 * a + 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * Math.sqrt(k), 0, 6.283); ctx.stroke();
      } else if (p.type === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        const dt = 1 / 60; p.vy += p.g * dt; p.vx *= 0.992; p.px = p.x; p.py = p.y; p.x += p.vx * dt; p.y += p.vy * dt;
        ctx.strokeStyle = `hsla(${p.hue},100%,${55 + 35 * a}%,${a})`; ctx.lineWidth = p.w; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
      } else if (p.type === 'debris') {
        ctx.globalCompositeOperation = 'source-over';
        const dt = 1 / 60; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = `rgba(70,45,28,${a})`;
        ctx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size); ctx.restore();
      } else if (p.type === 'smoke') {
        ctx.globalCompositeOperation = 'source-over';
        const dt = 1 / 60; p.x += p.vx * dt; p.y += p.vy * dt;
        const r = p.r * (0.7 + 1.1 * k);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, `rgba(70,66,64,${0.5 * a})`); g.addColorStop(1, 'rgba(40,38,38,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    if (parts.length) raf = requestAnimationFrame(frame);
    else { raf = 0; cv.hidden = true; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }

  function shake(el, big) {
    el.classList.remove('shake', 'shake-big'); void el.offsetWidth;          // restart animacji
    el.classList.add(big ? 'shake-big' : 'shake');
    setTimeout(() => el.classList.remove('shake', 'shake-big'), big ? 900 : 480);
  }

  // Trafienie w komórki cells ([[x, y], ...]) na planszy boardEl. sunk = zatopienie (seria wybuchów + wielki finał).
  function hit(boardEl, cells, sunk) {
    if (reduced() || !boardEl || !cells || !cells.length) return false;
    const rects = cells.map(([x, y]) => {
      const el = boardEl.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, s: r.width };
    }).filter(Boolean);
    if (!rects.length) return false;
    resize(); cv.hidden = false;
    if (!sunk) {
      spawn(rects[0].x, rects[0].y, rects[0].s, 1.15, 0);
    } else {
      rects.forEach((r, i) => spawn(r.x, r.y, r.s, 1.2, i * 0.1));                              // seria wybuchów wzdłuż statku
      const cx = rects.reduce((a, r) => a + r.x, 0) / rects.length, cy = rects.reduce((a, r) => a + r.y, 0) / rects.length;
      spawn(cx, cy, rects[0].s * 1.4, 2.1, rects.length * 0.1 + 0.15);                          // wielki finał
    }
    shake(boardEl, sunk);
    cells.forEach(([x, y]) => {                                                                  // krótki rozbłysk samego pola
      const el = boardEl.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
      if (el) { el.classList.add('boom'); setTimeout(() => el.classList.remove('boom'), 700); }
    });
    if (!raf) raf = requestAnimationFrame(frame);
    return true;
  }

  return { hit, get active() { return parts.length > 0; }, get particles() { return parts.length; } };
})();
