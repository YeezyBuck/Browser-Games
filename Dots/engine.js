'use strict';
// Silnik gry "Kropki" (otaczanie) – czyste funkcje bez zależności, używane przez serwer i testy.
//
// Zasady:
// - Gracze (1 = czerwony, 2 = niebieski) na zmianę stawiają kropkę na wolnym przecięciu siatki.
// - Zamknięta pętla żywych kropek jednego koloru (kropki łączą się też po przekątnej) otacza pola. Jeśli w otoczonym obszarze
//   są żywe kropki przeciwnika, zostają przejęte (martwe) i zdobywca dostaje po punkcie za każdą. Wolne pola takiego obszaru
//   zostają zablokowane (nikt już tam nie może postawić kropki).
// - Brzeg planszy nie jest ścianą: pętla musi się w całości mieścić na planszy.
// - Zabronione jest postawienie kropki w polu otoczonym przez przeciwnika ("samobójstwo"), chyba że ten ruch sam coś przejmuje
//   i przez to rozrywa otoczenie.
// - Gra kończy się, gdy gracz, który ma ruch, nie ma legalnego ruchu. Wygrywa większa liczba przejętych kropek.

const EMPTY = 0, RED = 1, BLUE = 2;
const other = c => 3 - c;

function createGame(w, h) {
  const n = w * h;
  return { w, h, owner: new Uint8Array(n), dead: new Uint8Array(n), locked: new Uint8Array(n), score: [0, 0, 0], moves: 0 };
}

function clone(g) {
  return { w: g.w, h: g.h, owner: g.owner.slice(), dead: g.dead.slice(), locked: g.locked.slice(), score: g.score.slice(), moves: g.moves };
}

// Pola otoczone przez żywe kropki koloru `color`: pola, do których nie da się dojść z zewnątrz (ruchem w 4 kierunkach),
// nie przechodząc przez te kropki. Zwraca { comps: [[indeksy]...], comp: Int32Array (numer komponentu albo -1) }.
function enclosed(g, color) {
  const { w, h, owner, dead } = g, n = w * h;
  const wall = new Uint8Array(n);
  for (let i = 0; i < n; i++) wall[i] = owner[i] === color && !dead[i] ? 1 : 0;
  const reach = new Uint8Array(n), stack = [];
  const push = i => { if (!wall[i] && !reach[i]) { reach[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  const comp = new Int32Array(n).fill(-1), comps = [];
  for (let s = 0; s < n; s++) {
    if (wall[s] || reach[s] || comp[s] >= 0) continue;
    const id = comps.length, list = [s], q = [s];
    comp[s] = id;
    while (q.length) {
      const i = q.pop(), x = i % w, y = (i / w) | 0;
      const nb = [];
      if (x > 0) nb.push(i - 1);
      if (x < w - 1) nb.push(i + 1);
      if (y > 0) nb.push(i - w);
      if (y < h - 1) nb.push(i + w);
      for (const j of nb) if (!wall[j] && !reach[j] && comp[j] < 0) { comp[j] = id; list.push(j); q.push(j); }
    }
    comps.push(list);
  }
  return { comps, comp };
}

// Próba ruchu. Zwraca { ok: true, game, captured: [indeksy] } albo { ok: false, error }.
// error: out | occupied | locked | suicide
function tryMove(g, color, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= g.w || y >= g.h) return { ok: false, error: 'out' };
  const i = y * g.w + x;
  if (g.owner[i]) return { ok: false, error: 'occupied' };
  if (g.locked[i]) return { ok: false, error: 'locked' };
  const g2 = clone(g);
  g2.owner[i] = color; g2.dead[i] = 0;
  const enemy = other(color), captured = [];
  for (const comp of enclosed(g2, color).comps) {
    const victims = comp.filter(j => g2.owner[j] === enemy && !g2.dead[j]);
    if (!victims.length) continue;
    for (const v of victims) { g2.dead[v] = 1; captured.push(v); g2.score[color]++; }
    for (const j of comp) if (g2.owner[j] === EMPTY) g2.locked[j] = color;
  }
  // samobójstwo: nowa kropka po ewentualnych przejęciach nadal otoczona przez przeciwnika
  if (enclosed(g2, enemy).comp[i] >= 0) return { ok: false, error: 'suicide' };
  g2.moves++;
  return { ok: true, game: g2, captured };
}

// Czy `color` ma jakikolwiek legalny ruch? Pole poza otoczeniami przeciwnika jest zawsze legalne (nowa kropka nie zmienia
// ścian przeciwnika, a przejęcia mogą je tylko zmniejszyć); pola wewnątrz otoczeń sprawdzamy dokładnie.
function hasMove(g, color) {
  const e = enclosed(g, other(color)), n = g.w * g.h, inside = [];
  for (let i = 0; i < n; i++) {
    if (g.owner[i] || g.locked[i]) continue;
    if (e.comp[i] < 0) return true;
    inside.push(i);
  }
  for (const i of inside) if (tryMove(g, color, i % g.w, (i / g.w) | 0).ok) return true;
  return false;
}

// Wynik wg liczby przejętych kropek: 1, 2 albo 0 (remis).
function leader(g) {
  return g.score[RED] > g.score[BLUE] ? RED : g.score[BLUE] > g.score[RED] ? BLUE : 0;
}

// Plansza jako tekst (do wysłania klientom): '.' puste; r/b żywa kropka czerwona/niebieska; R/B przejęta czerwona/niebieska.
// Terytorium: '.' brak; r/b pola zablokowane przez czerwonego/niebieskiego.
function render(g) {
  const board = [], terr = [];
  for (let y = 0; y < g.h; y++) {
    let b = '', t = '';
    for (let x = 0; x < g.w; x++) {
      const i = y * g.w + x, o = g.owner[i];
      b += !o ? '.' : o === RED ? (g.dead[i] ? 'R' : 'r') : (g.dead[i] ? 'B' : 'b');
      t += g.locked[i] === RED ? 'r' : g.locked[i] === BLUE ? 'b' : '.';
    }
    board.push(b); terr.push(t);
  }
  return { board, terr };
}

module.exports = { EMPTY, RED, BLUE, other, createGame, clone, enclosed, tryMove, hasMove, leader, render };
