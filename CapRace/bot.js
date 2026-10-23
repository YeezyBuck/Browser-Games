'use strict';
// Komputer jako przeciwnik w wyścigu kapsli. Działa po stronie serwera i zwraca to samo wejście, które wysyła człowiek
// (punkt uderzenia na kapslu i odciągnięcie), więc serwer sprawdza jego ruch tak samo jak każdy inny: bot nie może oszukiwać.
// Pomysł: silnik fizyki jest deterministyczny i szybki (ok. 1 ms na lot), więc bot "wyobraża sobie" wiele pstryknięć
// (kierunki w stronę kolejnych punktów toru x siły x rotacje), symuluje je tą samą fizyką i wybiera najlepsze.
//   trudny: ~200 prób, wybiera najlepszą (z maleńkim rozrzutem),
//   łatwy: ~12 losowych prób, a do wybranego pstryknięcia dokłada błąd celowania i siły (jak niedoświadczony gracz).
const E = require('./public/engine');
const { P } = E;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// Zamiana "kierunek lotu + siła 0..1 + rotacja -1..1" na wejście z myszy (punkt uderzenia + odciągnięcie).
function toInput(ang, power, spin) {
  const dx = Math.cos(ang), dy = Math.sin(ang), lat = clamp(spin / (0.5 + 0.5 * power), -1, 1), pull = power * P.maxPull;
  return { hx: -dy * lat, hy: dx * lat, px: -dx * pull, py: -dy * pull };
}

// Ocena stanu po pstryknięciu (z punktu widzenia bota): wynik pstryknięcia -> liczba, większa = lepiej.
function evalShot(track, caps, seat, shot, s0, o0) {
  const sim = E.simulate(track, caps, seat, shot);
  if (sim.finishedBy === seat) return { sim, score: 1e6 - sim.seconds, done: true };               // meta: najlepsze możliwe
  if (sim.finishedBy !== null) return { sim, score: -1e6, done: true };                            // popchnąłem rywala na metę: najgorsze
  const m1 = E.progress(track, sim.final[seat]), o1 = E.progress(track, sim.final[1 - seat]), off = E.nearest(track, sim.final[seat].x, sim.final[seat].y).d;
  return { sim, m1, o1, score: (m1 - s0) - 0.7 * (o1 - o0) - 0.08 * off };                        // do przodu, rywala do tyłu, daleko od band
}

// Najlepsza odpowiedź przeciwnika (zachłannie, kilkadziesiąt prób): do oceny, co zrobi po moim ruchu.
function bestReply(track, caps, opp) {
  const o = caps[opp], s0 = E.progress(track, o), m0 = E.progress(track, caps[1 - opp]), best = { score: -Infinity };
  for (const L of [90, 220]) {
    const t = E.pointAt(track, Math.min(s0 + L, track.sFinish + 60), 0), base = Math.atan2(t.y - o.y, t.x - o.x);
    for (const off of [-0.25, 0, 0.25]) for (const pw of [0.45, 0.7, 0.9, 1]) {
      const inp = toInput(base + off, pw, 0), shot = E.shotFromInput(inp.hx, inp.hy, inp.px, inp.py);
      if (!shot) continue;
      const r = evalShot(track, caps, opp, shot, s0, m0);
      if (r.score > best.score) { best.score = r.score; best.sim = r.sim; best.done = r.done; }
    }
  }
  return best;
}

// ctx: { track, caps, seat, rule, shots, lastShooter }. Zwraca { hx, hy, px, py }.
function chooseShot(ctx, level, rnd) {
  rnd = rnd || Math.random;
  const { track, caps, seat } = ctx, me = caps[seat], s0 = E.progress(track, me), o0 = E.progress(track, caps[1 - seat]);
  const hard = level === 'hard';
  const looks = [60, 130, 220, 340].map(L => E.pointAt(track, Math.min(s0 + L, track.sFinish + 60), 0));     // punkty toru przed kapslem
  const bases = looks.map(p => Math.atan2(p.y - me.y, p.x - me.x));
  const offsets = hard ? [-0.36, -0.18, 0, 0.18, 0.36] : [-0.4, -0.2, 0, 0.2, 0.4];
  const powers = hard ? [0.35, 0.6, 0.8, 1] : [0.3, 0.5, 0.7, 0.9, 1];
  const spins = hard ? [-0.6, 0, 0.6] : [-0.5, 0, 0.5];
  const cands = [];
  for (const b of bases) for (const o of offsets) for (const pw of powers) for (const sp of spins) cands.push([b + o, pw, sp]);
  if (!hard) for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
  const list = hard ? cands : cands.slice(0, 12);
  const scored = [];
  for (const [ang, pw, sp] of list) {
    const inp = toInput(ang, pw, sp), shot = E.shotFromInput(inp.hx, inp.hy, inp.px, inp.py);
    if (!shot) continue;
    const r = evalShot(track, caps, seat, shot, s0, o0);
    scored.push({ score: r.score, ang, pw, sp, sim: r.sim, done: r.done, m1: r.m1, o1: r.o1 });
  }
  scored.sort((x, y) => y.score - x.score);
  // Trudny, zasada "kto z tyłu": pstryka ten, kto jest dalej od mety, więc wyprzedzenie rywala oddaje mu kolejkę (i serię strzałów).
  // Dobra taktyka: podjeżdżać do rywala od tyłu, nie wyprzedzać bez potrzeby, a gdy trzeba, wyprzedzić o niewielki margines tak, żeby rywal
  // nie mógł z miejsca skończyć wyścigu. Mając metę w zasięgu, kończymy.
  if (hard && ctx.rule === 'last' && scored.length) {
    const margin = 8, rest = scored.filter(c => !c.done);
    for (const c of rest) { c.stay = c.m1 < c.o1 - margin; c.gain = c.m1 - s0; }
    const stays = rest.filter(c => c.stay && c.gain >= 60).sort((x, y) => y.gain - x.gain);
    const finishing = scored.filter(c => c.done && c.score > 0);
    if (finishing.length) scored.sort((x, y) => y.score - x.score);                                  // meta w zasięgu: najlepszy kończący strzał
    else if (stays.length) { scored.splice(scored.indexOf(stays[0]), 1); scored.unshift(stays[0]); }  // podjazd bez wyprzedzania
    else {                                                                                            // trzeba wyprzedzić: najmniejszy margines, rywal nie może skończyć
      const passes = rest.filter(c => !c.stay).sort((x, y) => (x.m1 - x.o1) - (y.m1 - y.o1)).slice(0, 8);
      let pick = null;
      for (const c of passes) {
        const rep = bestReply(track, c.sim.final, 1 - seat);
        if (!(rep.done && rep.score > 0)) { pick = c; break; }
      }
      pick = pick || passes[0] || rest[0];
      if (pick) { scored.splice(scored.indexOf(pick), 1); scored.unshift(pick); }
    }
  }
  let best = scored[0];
  if (!best) return toInput(bases[0], 0.6, 0);
  let { ang, pw, sp } = best;
  const noise = hard ? 0.012 : 0.1, pnoise = hard ? 0.02 : 0.18;                                  // błąd celowania i siły
  ang += (rnd() + rnd() + rnd() - 1.5) * 2 * noise; pw = clamp(pw * (1 + (rnd() * 2 - 1) * pnoise), 0.12, 1);
  return toInput(ang, pw, sp);
}

module.exports = { chooseShot, toInput };
