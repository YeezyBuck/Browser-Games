'use strict';
// Komputer jako przeciwnik w statkach. Działa po stronie serwera i zwraca to samo, co wysyła człowiek (flotę i współrzędne strzału),
// więc serwer sprawdza jego ruchy tak samo jak każde inne: bot nie może oszukiwać. Co ważne, do strzelania bot dostaje WYŁĄCZNIE
// to, co widzi człowiek: wyniki swoich strzałów i okręty, które już zatopił. Nie zna ustawienia floty przeciwnika.
//   trudny: dla każdego pola liczy, ile jeszcze nieznanych okrętów mogłoby się przez nie rozciągać (z zasadą "okręty się nie stykają"),
//           trafione, a niezatopione pola mocno podbijają wagę sąsiednich ustawień, więc bot sprawnie dobija okręt;
//   łatwy:  strzela losowo, a po trafieniu próbuje sąsiednich pól (czasem je zapomni).
const SIZE = 10;
const FLEET = { 4: 1, 3: 2, 2: 3, 1: 4 };
const key = (x, y) => x + ',' + y;
const inBoard = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

// Losowa flota zgodna z regułami (bez stykania się, także rogami). Zwraca [{ x, y, len, horiz }] jak w /api/place.
function makeFleet(rnd) {
  rnd = rnd || Math.random;
  const lens = []; for (const len of Object.keys(FLEET).map(Number).sort((a, b) => b - a)) for (let i = 0; i < FLEET[len]; i++) lens.push(len);
  for (let attempt = 0; attempt < 200; attempt++) {
    const taken = new Set(), ships = [];
    let ok = true;
    for (const len of lens) {
      let placed = false;
      for (let tries = 0; tries < 300 && !placed; tries++) {
        const horiz = rnd() < 0.5, x = Math.floor(rnd() * (horiz ? SIZE - len + 1 : SIZE)), y = Math.floor(rnd() * (horiz ? SIZE : SIZE - len + 1));
        const cells = []; for (let k = 0; k < len; k++) cells.push([x + (horiz ? k : 0), y + (horiz ? 0 : k)]);
        const free = cells.every(([cx, cy]) => { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (taken.has(key(cx + dx, cy + dy))) return false; return true; });
        if (!free) continue;
        cells.forEach(([cx, cy]) => taken.add(key(cx, cy))); ships.push({ x, y, len, horiz }); placed = true;
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
  throw new Error('nie udało się ustawić floty');
}

// Co bot wie o planszy przeciwnika: 0 nieznane, 1 pudło, 2 trafione (jeszcze nie zatopiony okręt), 3 zatopione.
function knowledge(ctx) {
  const g = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  for (const s of ctx.shots || []) g[s.y][s.x] = s.result === 'miss' ? 1 : (s.result === 'sunk' ? 3 : 2);
  const sunkLens = [];
  for (const cells of ctx.sunk || []) { sunkLens.push(cells.length); for (const [x, y] of cells) g[y][x] = 3; }
  return { g, sunkLens };
}

function chooseShot(ctx, level, rnd) {
  rnd = rnd || Math.random;
  const { g, sunkLens } = knowledge(ctx);
  const unknown = []; for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (g[y][x] === 0) unknown.push([x, y]);
  if (!unknown.length) return null;
  const hits = []; for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (g[y][x] === 2) hits.push([x, y]);

  if (level !== 'hard') {                                                                       // łatwy: poluje losowo, po trafieniu dobija, ale bez rachunku prawdopodobieństwa
    const nearSunk = (x, y) => { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (inBoard(x + dx, y + dy) && g[y + dy][x + dx] === 3) return true; return false; };
    if (hits.length && rnd() < 0.72) {
      const around = [];
      for (const [x, y] of hits) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (inBoard(nx, ny) && g[ny][nx] === 0) around.push([nx, ny, hits.some(([hx, hy]) => hx === x + 2 * dx && hy === y + 2 * dy || hx === x - dx && hy === y - dy) ? 3 : 1]); }
      if (around.length) { const weighted = []; for (const c of around) for (let i = 0; i < c[2]; i++) weighted.push(c); const [x, y] = pick(weighted, rnd); return { x, y }; }   // chętniej przedłuża linię trafień
    }
    const pool = unknown.filter(([x, y]) => !nearSunk(x, y));
    const [x, y] = pick(pool.length && rnd() < 0.6 ? pool : unknown, rnd); return { x, y };
  }

  // trudny: pola przylegające do zatopionego okrętu są puste (okręty się nie stykają)
  const empty = Array.from({ length: SIZE }, (_, y) => Array.from({ length: SIZE }, (_, x) => g[y][x] === 1 || g[y][x] === 3));
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (g[y][x] === 3) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (inBoard(x + dx, y + dy) && g[y + dy][x + dx] === 0) empty[y + dy][x + dx] = true;
  const left = []; const cnt = Object.assign({}, FLEET);
  for (const l of sunkLens) cnt[l] = Math.max(0, (cnt[l] || 0) - 1);
  for (const l of Object.keys(cnt)) for (let i = 0; i < cnt[l]; i++) left.push(Number(l));
  const w = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  for (const len of left) for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) for (const horiz of [true, false]) {
    if (horiz ? x + len > SIZE : y + len > SIZE) continue;
    let ok = true, covered = 0; const cells = [];
    for (let k = 0; k < len && ok; k++) { const cx = x + (horiz ? k : 0), cy = y + (horiz ? 0 : k); if (empty[cy][cx]) ok = false; else { if (g[cy][cx] === 2) covered++; else cells.push([cx, cy]); } }
    if (!ok) continue;
    const weight = covered ? 40 * covered * covered : 1;                                          // zgodne z trafionymi polami ustawienia są dużo bardziej prawdopodobne
    for (const [cx, cy] of cells) w[cy][cx] += weight;
  }
  let best = -1, bests = [];
  for (const [x, y] of unknown) { if (empty[y][x]) continue; if (w[y][x] > best) { best = w[y][x]; bests = [[x, y]]; } else if (w[y][x] === best) bests.push([x, y]); }
  if (!bests.length || best <= 0) { const [x, y] = pick(unknown, rnd); return { x, y }; }
  const [x, y] = pick(bests, rnd);
  return { x, y };
}

module.exports = { makeFleet, chooseShot, SIZE, FLEET };
