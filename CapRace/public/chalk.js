'use strict';
// Tło: ciemny asfalt z kredowymi rysunkami z podwórka (klasy, gwiazdki, strzałki, buźki, spirale). Rysowane raz z ustalonego ziarna,
// bez animacji (więc nie męczy i nie zależy od ustawień ograniczenia ruchu). Odświeżane przy zmianie rozmiaru okna.
(function () {
  const cv = document.getElementById('chalk'), ctx = cv.getContext('2d');
  const TAU = Math.PI * 2;
  let timer = 0;

  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let seed = 20261;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const wob = a => (rnd() - 0.5) * a;
    for (let i = 0; i < Math.round(W * H / 900); i++) {                         // ziarno asfaltu
      ctx.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${0.02 + rnd() * 0.04})` : `rgba(0,0,0,${0.08 + rnd() * 0.1})`;
      ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 1.6, 1 + rnd() * 1.6);
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const line = (pts, close) => { ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x + wob(1.6), y + wob(1.6)) : ctx.moveTo(x, y))); if (close) ctx.closePath(); ctx.stroke(); };
    const doodles = {
      hopscotch(x, y, s) { for (let r = 0; r < 4; r++) { const w = r === 2 ? 2 : 1; for (let c = 0; c < w; c++) line([[x + c * s, y - r * s], [x + c * s + s, y - r * s], [x + c * s + s, y - r * s - s], [x + c * s, y - r * s - s]], true); } },
      star(x, y, s) { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * TAU / 10, r = i % 2 ? s * 0.42 : s; p.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); } line(p, true); },
      spiral(x, y, s) { const p = []; for (let i = 0; i < 60; i++) { const a = i * 0.32, r = s * i / 60; p.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); } line(p); },
      arrow(x, y, s) { line([[x - s, y], [x + s, y]]); line([[x + s * 0.4, y - s * 0.45], [x + s, y], [x + s * 0.4, y + s * 0.45]]); },
      smiley(x, y, s) { const p = []; for (let i = 0; i <= 24; i++) p.push([x + Math.cos(i * TAU / 24) * s, y + Math.sin(i * TAU / 24) * s]); line(p, true); line([[x - s * 0.35, y - s * 0.25], [x - s * 0.35, y - s * 0.12]]); line([[x + s * 0.35, y - s * 0.25], [x + s * 0.35, y - s * 0.12]]); const m = []; for (let i = 0; i <= 8; i++) { const a = 0.25 * Math.PI + i * 0.5 * Math.PI / 8; m.push([x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.5]); } line(m); },
      flower(x, y, s) { for (let i = 0; i < 6; i++) { const a = i * TAU / 6; const p = []; for (let k = 0; k <= 10; k++) { const b = k * TAU / 10; p.push([x + Math.cos(a) * s * 0.6 + Math.cos(b) * s * 0.32, y + Math.sin(a) * s * 0.6 + Math.sin(b) * s * 0.32]); } line(p, true); } },
      cross(x, y, s) { line([[x - s, y - s], [x + s, y + s]]); line([[x + s, y - s], [x - s, y + s]]); },
    };
    const names = Object.keys(doodles), count = Math.max(8, Math.round(W * H / 52000));
    for (let i = 0; i < count; i++) {
      ctx.strokeStyle = `rgba(244,241,232,${0.07 + rnd() * 0.07})`; ctx.lineWidth = 2.5 + rnd() * 1.5;
      ctx.save();
      const x = rnd() * W, y = rnd() * H;
      ctx.translate(x, y); ctx.rotate((rnd() - 0.5) * 0.8);
      doodles[names[Math.floor(rnd() * names.length)]](0, 0, 18 + rnd() * 26);
      ctx.restore();
    }
  }
  draw();
  addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(draw, 200); });
})();
