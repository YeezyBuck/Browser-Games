'use strict';
// Komputer jako przeciwnik w Kropkach. Działa po stronie serwera i zwraca to samo, co wysyła człowiek (współrzędne kropki), więc serwer
// sprawdza jego ruch tak samo jak każdy inny: bot nie może oszukiwać. Bot widzi tylko planszę, czyli to samo, co człowiek.
//
// Pomysł. Silnik pozwala tanio sprawdzić każdy ruch (tryMove daje nową planszę i listę przejętych kropek), więc bot ocenia kandydatów
// (puste pola blisko kropek):
//   zysk:      ile kropek przeciwnika przejmie ten ruch,
//   obrona:    ile kropek przejąłby tam przeciwnik (zajmując to pole zagradzamy mu pętlę),
//   kształt:   sąsiedzi własnych kropek (łatwiej domknąć pętlę), lekki nacisk na kropki przeciwnika.
//   trudny:    dla kilku najlepszych kandydatów sprawdza jeszcze odpowiedź przeciwnika (czy mu nie dajemy przejęcia) i liczy własne groźby
//              na następny ruch (dwie różne groźby naraz to prawie pewne przejęcie, bo rywal zagrodzi tylko jedną);
//   łatwy:     bierze przejęcie, gdy je widzi (w 80% ruchów), w przeciwnym razie stawia kropkę przy innych kropkach, bez obrony i bez liczenia.
const E = require('./engine');

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

// Puste, niezablokowane pola w odległości <= dist od jakiejkolwiek kropki (na pustej planszy: środek).
function candidates(g, dist) {
  const out = [], w = g.w, h = g.h;
  const near = new Uint8Array(w * h); let any = false;
  for (let i = 0; i < w * h; i++) if (g.owner[i]) {
    any = true; const x = i % w, y = (i / w) | 0;
    for (let dx = -dist; dx <= dist; dx++) for (let dy = -dist; dy <= dist; dy++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h) near[ny * w + nx] = 1; }
  }
  if (!any) { for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) out.push([((w / 2) | 0) + dx, ((h / 2) | 0) + dy]); return out; }
  for (let i = 0; i < w * h; i++) if (near[i] && !g.owner[i] && !g.locked[i]) out.push([i % w, (i / w) | 0]);
  return out;
}

function neighbours(g, x, y, color) {
  let own = 0, foe = 0;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
    const o = g.owner[ny * g.w + nx]; if (!o || g.dead[ny * g.w + nx]) continue;
    if (o === color) own++; else foe++;
  }
  return { own, foe };
}

// Największa liczba kropek, które `color` mógłby przejąć jednym ruchem na planszy g (i liczba różnych pól, które to dają).
function bestCapture(g, color, cands) {
  let best = 0, spots = 0;
  for (const [x, y] of cands) { const r = E.tryMove(g, color, x, y); if (r.ok && r.captured.length) { spots++; if (r.captured.length > best) best = r.captured.length; } }
  return { best, spots };
}

// Zwraca { x, y } albo null (brak ruchu). g to bieżąca plansza, color to kolor bota.
function chooseMove(g, color, level, rnd) {
  rnd = rnd || Math.random;
  const foe = E.other(color), cands = candidates(g, 2);
  if (!cands.length) return null;
  const hard = level === 'hard';
  const moves = [];
  for (const [x, y] of cands) {
    const r = E.tryMove(g, color, x, y);
    if (!r.ok) continue;
    const gain = r.captured.length;
    let danger = 0;
    if (hard || rnd() < 0.0) { const d = E.tryMove(g, foe, x, y); if (d.ok) danger = d.captured.length; }
    const nb = neighbours(g, x, y, color), center = 1 - (Math.abs(x - g.w / 2) + Math.abs(y - g.h / 2)) / (g.w + g.h);
    moves.push({ x, y, game: r.game, gain, danger, score: 100 * gain + 90 * danger + 2.2 * nb.own + 0.8 * nb.foe + 0.5 * center + rnd() * 0.6 });
  }
  if (!moves.length) {                                                                          // nic w pobliżu: dowolne legalne pole
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (E.tryMove(g, color, x, y).ok) return { x, y };
    return null;
  }

  if (!hard) {                                                                                  // łatwy
    const caps = moves.filter(m => m.gain > 0).sort((a, b) => b.gain - a.gain);
    if (caps.length && rnd() < 0.8) return { x: caps[0].x, y: caps[0].y };
    const close = moves.filter(m => cands.length && neighboursAny(g, m.x, m.y));
    const m = pick(close.length && rnd() < 0.85 ? close : moves, rnd);
    return { x: m.x, y: m.y };
  }

  // trudny: najlepsze kilka kandydatów sprawdzamy dokładniej (odpowiedź przeciwnika i własne groźby)
  moves.sort((a, b) => b.score - a.score);
  const top = moves.slice(0, 10);
  for (const m of top) {
    const oc = candidates(m.game, 2), reply = bestCapture(m.game, foe, oc);                      // co przeciwnik może mi zabrać po tym ruchu
    const mine = bestCapture(m.game, color, oc);                                                  // czym ja grożę na następny ruch
    const threat = mine.best * (mine.spots >= 2 ? 1 : 0.35);                                      // dwie różne groźby naraz: rywal zagrodzi tylko jedną
    m.final = m.score - 100 * reply.best + 55 * threat;
  }
  top.sort((a, b) => b.final - a.final);
  return { x: top[0].x, y: top[0].y };
}

function neighboursAny(g, x, y) { const n = neighbours(g, x, y, 1), m = neighbours(g, x, y, 2); return n.own + n.foe + m.own + m.foe > 0; }

// Odpowiedź na propozycję zakończenia gry i policzenia punktów: zgoda, gdy bot nie przegrywa.
function answerOffer(g, color) { return g.score[color] >= g.score[E.other(color)]; }

module.exports = { chooseMove, answerOffer, candidates };
