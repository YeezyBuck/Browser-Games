'use strict';
// Tło: ciemny metal z delikatnymi liniami pola magnetycznego wokół kilku par biegunów (jak opiłki żelaza na kartce).
// Rysowane raz z ustalonego ziarna, bez animacji (więc nie męczy i nie zależy od ustawień ograniczenia ruchu).
// Odświeżane przy zmianie rozmiaru okna.
(function () {
  const cv = document.getElementById('field'), ctx = cv.getContext('2d');
  let timer = 0;

  // Linie sił dla pary ładunków (+q w a, -q w b): całkujemy kierunek pola od ładunku dodatniego do ujemnego.
  function lines(a, b, n) {
    const out = [];
    const field = (x, y) => {
      let fx = 0, fy = 0;
      for (const [c, q] of [[a, 1], [b, -1]]) { const dx = x - c.x, dy = y - c.y, d2 = dx * dx + dy * dy + 4, d = Math.sqrt(d2); fx += q * dx / d2 / d * d; fy += q * dy / d2 / d * d; }
      return [fx, fy];
    };
    for (let i = 0; i < n; i++) {
      const ang = i / n * Math.PI * 2 + 0.2;
      let x = a.x + Math.cos(ang) * 9, y = a.y + Math.sin(ang) * 9;
      const pts = [[x, y]];
      for (let k = 0; k < 360; k++) {
        const [fx, fy] = field(x, y), l = Math.hypot(fx, fy) || 1;
        x += fx / l * 6; y += fy / l * 6; pts.push([x, y]);
        if (Math.hypot(x - b.x, y - b.y) < 9 || x < -80 || y < -80 || x > innerWidth + 80 || y > innerHeight + 80) break;
      }
      out.push(pts);
    }
    return out;
  }

  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let seed = 7919;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < Math.round(W * H / 1100); i++) {                              // ziarno szlifowanego metalu
      ctx.fillStyle = rnd() < 0.5 ? `rgba(200,225,255,${0.015 + rnd() * 0.03})` : `rgba(0,0,0,${0.07 + rnd() * 0.08})`;
      ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 1.4, 1 + rnd() * 1.4);
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const pairs = Math.max(3, Math.round(W * H / 230000));
    for (let p = 0; p < pairs; p++) {
      const cx = rnd() * W, cy = rnd() * H, ang = rnd() * Math.PI * 2, half = 70 + rnd() * 70;
      const a = { x: cx + Math.cos(ang) * half, y: cy + Math.sin(ang) * half }, b = { x: cx - Math.cos(ang) * half, y: cy - Math.sin(ang) * half };
      ctx.strokeStyle = `rgba(120,190,230,${0.07 + rnd() * 0.05})`; ctx.lineWidth = 1.4;
      for (const pts of lines(a, b, 16)) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
      for (const [c, col] of [[a, '255,106,94'], [b, '79,141,255']]) { ctx.fillStyle = `rgba(${col},0.10)`; ctx.beginPath(); ctx.arc(c.x, c.y, 11, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  draw();
  addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(draw, 200); });
})();
