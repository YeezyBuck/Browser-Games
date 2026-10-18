'use strict';

const SIZE = 10;
const FLEET = [[4, 1], [3, 2], [2, 3], [1, 4]];            // [długość, sztuk]
const TOTAL = FLEET.reduce((a, [, n]) => a + n, 0);
const COLS = 'ABCDEFGHIJ';
const CODE_LEN = 6;
const $ = s => document.querySelector(s);
const key = (x, y) => x + ',' + y;
const inBoard = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;

let session = loadSession();     // { code, token } – per karta przeglądarki, by dało się grać z dwóch kart
let state = null;
let source = null;
let pollId = 0;                 // numer aktywnej pętli long-poll (0 = brak)
let ver = -1;                   // ostatnia znana wersja stanu z serwera
let sseWatchdog = null;
let lastSeq = null;              // ostatnio obsłużony strzał (żeby dźwięk zagrał raz)
let busy = false;
let info = null;                // { publicUrl, tunnel, lan, local } z /api/info
let place = { ships: [], horiz: true, sel: 4, hover: null };

// ---------- sesja ----------
function loadSession() {
  try { return JSON.parse(sessionStorage.getItem('statki-session')); } catch (e) { return null; }
}
function saveSession(s) {
  session = s;
  try { s ? sessionStorage.setItem('statki-session', JSON.stringify(s)) : sessionStorage.removeItem('statki-session'); } catch (e) {}
}

// ---------- komunikaty ----------
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
function banner(text, cls) {
  const b = $('#banner');
  b.textContent = text || '';
  b.className = cls || '';
}

async function api(path, body) {
  const r = await fetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({}, session || {}, body || {})),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const err = new Error(data.error || ''); err.code = data.code; throw err; }
  return data;
}

// ---------- dźwięk (syntezowany, bez plików) ----------
let ac = null;
let muted = false;
try { muted = localStorage.getItem('statki-muted') === '1'; } catch (e) {}

function audio() {
  if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (C) ac = new C(); }
  if (ac && ac.state === 'suspended') ac.resume();
  return ac;
}
function noiseBuffer(sec, power) {
  const n = Math.floor(ac.sampleRate * sec), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, power);
  return buf;
}
function boom() {
  if (muted || !audio()) return;
  const t = ac.currentTime;
  const src = ac.createBufferSource(); src.buffer = noiseBuffer(1.3, 2);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(70, t + 1.1);
  const g = ac.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.25);
  src.connect(lp); lp.connect(g); g.connect(ac.destination); src.start(t);
  const o = ac.createOscillator(), og = ac.createGain(); o.type = 'sine';
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.6);
  og.gain.setValueAtTime(0.9, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  o.connect(og); og.connect(ac.destination); o.start(t); o.stop(t + 0.75);
}
function plusk() {
  if (muted || !audio()) return;
  const t = ac.currentTime;
  const src = ac.createBufferSource(); src.buffer = noiseBuffer(0.45, 3);
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
  bp.frequency.setValueAtTime(2200, t); bp.frequency.exponentialRampToValueAtTime(450, t + 0.4);
  const g = ac.createGain(); g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  src.connect(bp); bp.connect(g); g.connect(ac.destination); src.start(t);
  [0, 0.09].forEach((dt, i) => {                       // bąbelki
    const o = ac.createOscillator(), og = ac.createGain(); o.type = 'sine';
    const f = 380 + i * 140;
    o.frequency.setValueAtTime(f, t + dt); o.frequency.exponentialRampToValueAtTime(f * 2.2, t + dt + 0.12);
    og.gain.setValueAtTime(0.0001, t + dt); og.gain.linearRampToValueAtTime(0.25, t + dt + 0.02);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.16);
    o.connect(og); og.connect(ac.destination); o.start(t + dt); o.stop(t + dt + 0.2);
  });
}
function ping() {
  if (muted || !audio()) return;
  const t = ac.currentTime;
  [[880, 0], [1320, 0.09]].forEach(([f, dt]) => {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + dt); g.gain.linearRampToValueAtTime(0.18, t + dt + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.22);
    o.connect(g); g.connect(ac.destination); o.start(t + dt); o.stop(t + dt + 0.25);
  });
}
function updateMuteBtn() {
  const b = $('#mute');
  b.textContent = muted ? '🔇' : '🔊';
  b.setAttribute('aria-pressed', String(muted));
  b.title = t(muted ? 'sound.off' : 'sound.on');
  b.classList.toggle('off', muted);
}
$('#mute').addEventListener('click', () => {
  muted = !muted;
  try { localStorage.setItem('statki-muted', muted ? '1' : '0'); } catch (e) {}
  updateMuteBtn();
});
addEventListener('pointerdown', () => audio(), { once: true });
updateMuteBtn();

// ---------- muzyka i język ----------
function updateMusicBtn() {
  const b = $('#musicBtn');
  b.classList.toggle('off', Music.muted);
  b.setAttribute('aria-pressed', String(Music.muted));
  b.title = t(Music.muted ? 'music.off' : 'music.on');
}
Music.onChange(updateMusicBtn);
$('#musicBtn').addEventListener('click', () => Music.toggle());
document.querySelectorAll('.lang button').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
function onLangChange() { updateMuteBtn(); updateMusicBtn(); shareSig = ''; render(); chatRendered = ''; if (state) renderChat(); }

// ---------- plansze ----------
// cellClass(x,y) -> tablica klas; onClick(x,y) opcjonalne
function buildBoard(el, cellClass, handlers) {
  el.innerHTML = '';
  const corner = document.createElement('div'); corner.className = 'lab'; el.appendChild(corner);
  for (let x = 0; x < SIZE; x++) {
    const l = document.createElement('div'); l.className = 'lab top'; l.textContent = COLS[x]; el.appendChild(l);
  }
  for (let y = 0; y < SIZE; y++) {
    const l = document.createElement('div'); l.className = 'lab'; l.textContent = y + 1; el.appendChild(l);
    for (let x = 0; x < SIZE; x++) {
      const c = document.createElement('div');
      c.className = ['cell'].concat(cellClass(x, y)).join(' ');
      if (handlers) {
        if (handlers.click) c.addEventListener('click', () => handlers.click(x, y));
        if (handlers.enter) c.addEventListener('mouseenter', () => handlers.enter(x, y));
        if (handlers.leave) c.addEventListener('mouseleave', () => handlers.leave(x, y));
      }
      el.appendChild(c);
    }
  }
}

function shipCells(s) {
  const out = [];
  for (let k = 0; k < s.len; k++) out.push([s.x + (s.horiz ? k : 0), s.y + (s.horiz ? 0 : k)]);
  return out;
}
function occupancy(ships) {
  const m = new Map();
  ships.forEach((s, i) => shipCells(s).forEach(([x, y]) => m.set(key(x, y), i)));
  return m;
}
// Czy statek `s` można dostawić do `ships` (granice, brak nakładania i stykania, także rogami)?
function canPlace(ships, s) {
  const occ = occupancy(ships);
  for (const [x, y] of shipCells(s)) {
    if (!inBoard(x, y)) return false;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (occ.has(key(x + dx, y + dy))) return false;
  }
  return true;
}
function remaining(ships) {
  return FLEET.map(([len, n]) => ({ len, left: n - ships.filter(s => s.len === len).length, total: n }));
}
function randomFleet() {
  for (let attempt = 0; attempt < 200; attempt++) {
    const ships = [];
    let ok = true;
    for (const [len, n] of FLEET) {
      for (let i = 0; i < n && ok; i++) {
        let placed = false;
        for (let t = 0; t < 300 && !placed; t++) {
          const horiz = Math.random() < 0.5;
          const s = { len, horiz, x: Math.floor(Math.random() * (SIZE - (horiz ? len - 1 : 0))), y: Math.floor(Math.random() * (SIZE - (horiz ? 0 : len - 1))) };
          if (canPlace(ships, s)) { ships.push(s); placed = true; }
        }
        if (!placed) ok = false;
      }
    }
    if (ok) return ships;
  }
  return [];
}

// ---------- ustawianie statków ----------
function nextSel() {
  const r = remaining(place.ships).filter(x => x.left > 0);
  if (!r.length) return null;
  return r.some(x => x.len === place.sel) ? place.sel : r[0].len;
}

function renderPlacing() {
  place.sel = nextSel();
  const occ = occupancy(place.ships);
  let preview = new Map();
  if (place.hover && place.sel) {
    const s = { len: place.sel, horiz: place.horiz, x: place.hover[0], y: place.hover[1] };
    const ok = canPlace(place.ships, s);
    shipCells(s).forEach(([x, y]) => { if (inBoard(x, y)) preview.set(key(x, y), ok ? 'prev-ok' : 'prev-bad'); });
  }
  buildBoard($('#placeBoard'), (x, y) => {
    const c = [];
    if (occ.has(key(x, y))) c.push('ship');
    if (preview.has(key(x, y))) c.push(preview.get(key(x, y)));
    return c;
  }, {
    click: (x, y) => {
      const i = occ.get(key(x, y));
      if (i !== undefined) {                            // zdjęcie statku
        place.sel = place.ships[i].len; place.ships.splice(i, 1);
      } else if (place.sel) {
        const s = { len: place.sel, horiz: place.horiz, x, y };
        if (canPlace(place.ships, s)) place.ships.push(s);
      }
      renderPlacing();
    },
    enter: (x, y) => { place.hover = [x, y]; refreshPreview(); },
    leave: () => { place.hover = null; refreshPreview(); },
  });

  const list = $('#fleetList'); list.innerHTML = '';
  remaining(place.ships).forEach(r => {
    const item = document.createElement('div');
    item.className = 'fleet-item' + (r.left === 0 ? ' done' : '') + (r.len === place.sel ? ' selected' : '');
    const blocks = document.createElement('div'); blocks.className = 'blocks';
    for (let i = 0; i < r.len; i++) blocks.appendChild(document.createElement('i'));
    const txt = document.createElement('span');
    txt.textContent = t('place.ship', r.len, r.left);
    item.append(blocks, txt);
    if (r.left > 0) item.addEventListener('click', () => { place.sel = r.len; renderPlacing(); });
    list.appendChild(item);
  });
  $('#readyBtn').disabled = place.ships.length !== TOTAL || !!(state && state.youReady);
  $('#readyBtn').textContent = t(state && state.youReady ? 'place.readyWait' : 'place.ready');
}

// podgląd przy najeżdżaniu bez przebudowy całej planszy
function refreshPreview() {
  const cells = $('#placeBoard').querySelectorAll('.cell');
  cells.forEach(c => c.classList.remove('prev-ok', 'prev-bad'));
  if (!place.hover || !place.sel) return;
  const s = { len: place.sel, horiz: place.horiz, x: place.hover[0], y: place.hover[1] };
  const cls = canPlace(place.ships, s) ? 'prev-ok' : 'prev-bad';
  shipCells(s).forEach(([x, y]) => { if (inBoard(x, y)) cells[y * SIZE + x].classList.add(cls); });
}

function rotate() { place.horiz = !place.horiz; if ($('#placing').hidden === false) refreshPreview(); }
$('#rotateBtn').addEventListener('click', rotate);
addEventListener('keydown', e => { if ((e.key === 'r' || e.key === 'R') && !/^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || '') && !$('#placing').hidden && !(state && state.youReady)) rotate(); });
$('#randomBtn').addEventListener('click', () => { place.ships = randomFleet(); renderPlacing(); });
$('#clearBtn').addEventListener('click', () => { place.ships = []; renderPlacing(); });
$('#readyBtn').addEventListener('click', async () => {
  try {
    await api('/api/place', { ships: place.ships.map(s => ({ x: s.x, y: s.y, len: s.len, horiz: s.horiz })) });
  } catch (e) { toast(errorText(e)); }
});

// ---------- gra ----------
function sunkSurround(sunk) {
  const set = new Set();
  sunk.forEach(cells => cells.forEach(([cx, cy]) => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const x = cx + dx, y = cy + dy;
      if (inBoard(x, y)) set.add(key(x, y));
    }
  }));
  return set;
}

function renderGame() {
  const s = state;
  const myShips = new Set(), mySunk = new Set(), received = new Map();
  s.mine.ships.forEach(c => c.forEach(([x, y]) => myShips.add(key(x, y))));
  s.mine.sunk.forEach(c => c.forEach(([x, y]) => mySunk.add(key(x, y))));
  s.mine.shots.forEach(sh => received.set(key(sh.x, sh.y), sh.hit));
  const lastAt = s.last && s.last.by !== s.you ? key(s.last.x, s.last.y) : null;
  buildBoard($('#myBoard'), (x, y) => {
    const k = key(x, y), c = [];
    if (myShips.has(k)) c.push('ship');
    if (mySunk.has(k)) c.push('sunk');
    if (received.has(k)) c.push(received.get(k) ? 'hit' : 'miss');
    if (k === lastAt) c.push('last');
    return c;
  });

  const fired = new Map(), sunkT = new Set(), reveal = new Set();
  s.target.shots.forEach(sh => fired.set(key(sh.x, sh.y), sh.result));
  s.target.sunk.forEach(c => c.forEach(([x, y]) => sunkT.add(key(x, y))));
  const around = sunkSurround(s.target.sunk);
  if (s.target.reveal) s.target.reveal.forEach(c => c.forEach(([x, y]) => reveal.add(key(x, y))));
  const myTurn = s.phase === 'playing' && s.turn === s.you;
  const lastMine = s.last && s.last.by === s.you ? key(s.last.x, s.last.y) : null;
  const tb = $('#targetBoard');
  tb.classList.toggle('interactive', myTurn);
  buildBoard(tb, (x, y) => {
    const k = key(x, y), c = [];
    const r = fired.get(k);
    if (sunkT.has(k)) c.push('sunk');
    else if (reveal.has(k) && !r) c.push('reveal');
    if (r) c.push('shot', r === 'miss' ? 'miss' : 'hit');
    else if (around.has(k) && !sunkT.has(k)) c.push('shot', 'miss', 'auto');   // woda wokół zatopionego statku
    if (k === lastMine) c.push('last');
    return c;
  }, {
    click: async (x, y) => {
      if (!myTurn || busy || fired.has(key(x, y)) || around.has(key(x, y))) return;
      busy = true;
      try { await api('/api/shoot', { x, y }); } catch (e) { toast(errorText(e)); }
      busy = false;
    },
  });

  $('#leftMine').textContent = s.left.mine ?? TOTAL;
  $('#leftOpp').textContent = s.left.opponent ?? TOTAL;
  const over = s.phase === 'over';
  $('#overBox').hidden = !over;
  if (over) {
    const rb = $('#rematchBtn');
    rb.disabled = s.youWantRematch;
    rb.textContent = t(s.youWantRematch ? 'rematch.wait' : (s.opponentWantsRematch ? 'rematch.join' : 'rematch'));
  }
}

$('#rematchBtn').addEventListener('click', async () => {
  try { await api('/api/rematch'); } catch (e) { toast(errorText(e)); }
});

// ---------- czat ----------
let chatOpen = false;
let chatSeen = null;                // id ostatniej przeczytanej wiadomości (null = jeszcze nie ustalone)
let chatRendered = '';              // sygnatura ostatnio narysowanej listy
const chatInput = $('#chatInput');

function setChatOpen(open) {
  chatOpen = open;
  $('#chatPanel').hidden = !open;
  $('#chatToggle').setAttribute('aria-expanded', String(open));
  if (open) { markChatRead(); setTimeout(() => chatInput.focus(), 0); scrollChat(true); }
}
function scrollChat(force) {
  const log = $('#chatLog');
  if (force || log.scrollHeight - log.scrollTop - log.clientHeight < 80) log.scrollTop = log.scrollHeight;
}
function markChatRead() {
  const msgs = (state && state.chat) || [];
  chatSeen = msgs.length ? msgs[msgs.length - 1].id : 0;
  updateBadge();
}
function updateBadge() {
  const msgs = (state && state.chat) || [];
  const unread = chatOpen ? 0 : msgs.filter(m => m.by !== state.you && m.id > (chatSeen || 0)).length;
  const b = $('#chatBadge');
  b.hidden = unread === 0; b.textContent = unread > 9 ? '9+' : String(unread);
}
function renderChat(prevLastId) {
  const box = $('#chat');
  const show = !!state && state.opponentJoined;
  box.hidden = !show;
  if (!show) { if (chatOpen) setChatOpen(false); return; }
  const msgs = state.chat || [];
  if (chatSeen === null) chatSeen = msgs.length ? msgs[msgs.length - 1].id : 0;       // po wejściu/odświeżeniu nie liczymy starych jako nieprzeczytanych
  const sig = lang + '|' + state.you + '|' + msgs.map(m => m.id).join(',');
  if (sig !== chatRendered) {
    chatRendered = sig;
    const log = $('#chatLog'); log.innerHTML = '';
    if (!msgs.length) { const e = document.createElement('div'); e.className = 'chat-empty'; e.textContent = t('chat.empty'); log.appendChild(e); }
    msgs.forEach(m => {
      const d = document.createElement('div'); d.className = 'msg ' + (m.by === state.you ? 'mine' : 'theirs');
      const meta = document.createElement('span'); meta.className = 'meta';
      const time = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      meta.textContent = `${m.by === state.you ? t('chat.you') : t('chat.opp')} · ${time}`;
      const text = document.createElement('span'); text.textContent = m.text;          // textContent: treść nigdy nie jest HTML-em
      d.append(meta, text); log.appendChild(d);
    });
    scrollChat(chatOpen);
  }
  const lastId = msgs.length ? msgs[msgs.length - 1].id : 0;
  if (chatOpen) markChatRead(); else updateBadge();
  if (prevLastId !== undefined && lastId > prevLastId && msgs[msgs.length - 1].by !== state.you) ping();
}
$('#chatToggle').addEventListener('click', () => setChatOpen(!chatOpen));
$('#chatClose').addEventListener('click', () => setChatOpen(false));
addEventListener('keydown', e => { if (e.key === 'Escape' && chatOpen) setChatOpen(false); });
$('#chatForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  try { await api('/api/chat', { text }); } catch (e) { chatInput.value = text; toast(errorText(e)); }
});

// ---------- ekrany ----------
function show(id) {
  ['lobby', 'waiting', 'placing', 'game', 'closedScreen'].forEach(n => { $('#' + n).hidden = n !== id; });
}

// ---------- adresy do przekazania przeciwnikowi ----------
async function loadInfo() {
  try { info = await (await fetch('/api/info', { cache: 'no-store' })).json(); } catch (e) {}
  $('#quitBtn').hidden = closed || !(info && info.adminToken);                 // przycisk tylko dla przeglądarki na komputerze z serwerem
}

// Ekran końcowy po zamknięciu gry (przez gospodarza): zatrzymuje wszystko, czyści sesję.
let closed = false;
function showClosed() {
  closed = true;
  stopTransport();
  saveSession(null); state = null;
  $('#roomInfo').hidden = true; $('#chat').hidden = true; $('#quitBtn').hidden = true;
  banner('');
  show('closedScreen');
}
$('#quitBtn').addEventListener('click', async () => {
  if (!info || !info.adminToken || !confirm(t('quit.confirm'))) return;
  try {
    const r = await fetch('/api/shutdown', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': info.adminToken }, body: '{}' });
    if (!r.ok) throw Object.assign(new Error(''), { code: 'forbidden' });
    showClosed();
  } catch (e) { toast(errorText(e)); }
});
function roomUrl(base) { return base.replace(/\/$/, '') + '/?room=' + session.code; }
// Najlepszy link do skopiowania: internet (tunel) jeśli jest, w przeciwnym razie adres, pod którym działa strona.
function roomLink() { return roomUrl(info && info.publicUrl ? info.publicUrl : location.origin); }

// Rysuje kod QR (ciemny na białym, z ciszą dookoła – tak skanuje się najpewniej).
function drawQr(canvas, text) {
  const qr = qrcode(0, 'M');
  qr.addData(text); qr.make();
  const n = qr.getModuleCount(), quiet = 4;
  const scale = Math.max(3, Math.floor(220 / (n + quiet * 2)));
  const size = (n + quiet * 2) * scale;
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
    if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
}

let shareSig = '';
function renderShare() {
  const box = $('#shareBox');
  if (!box || !session) return;
  const groups = [];
  if (info && info.publicUrl) groups.push(['share.internet', [roomUrl(info.publicUrl)]]);
  if (info && info.lan && info.lan.length) groups.push(['share.lan', info.lan.map(roomUrl)]);
  if (!groups.length) groups.push(['share.here', [roomUrl(location.origin)]]);
  const sig = lang + '|' + JSON.stringify(groups) + '|' + (info ? info.tunnel + info.local : '');
  if (sig === shareSig) return;                                    // nic się nie zmieniło – nie ruszamy pól (zaznaczenie, fokus)
  shareSig = sig;
  box.innerHTML = '';
  groups.forEach(([labelKey, urls]) => {
    const g = document.createElement('div'); g.className = 'share-group';
    const l = document.createElement('p'); l.className = 'label'; l.textContent = t(labelKey); g.appendChild(l);
    urls.forEach(u => {
      const line = document.createElement('div'); line.className = 'link-line';
      const inp = document.createElement('input'); inp.readOnly = true; inp.value = u;
      inp.addEventListener('focus', () => inp.select());
      const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = t('share.copy');
      btn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(u); toast(t('toast.copied')); } catch (e) { inp.select(); }
      });
      line.append(inp, btn); g.appendChild(line);
    });
    if (labelKey === 'share.internet' && typeof qrcode === 'function') {        // QR tylko dla linku przez internet
      try {
        const qb = document.createElement('div'); qb.className = 'qr-box';
        const cv = document.createElement('canvas'); cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', t('share.qrAlt')); cv.title = urls[0];
        drawQr(cv, urls[0]);
        const hint = document.createElement('p'); hint.className = 'qr-hint'; hint.textContent = t('share.qr');
        qb.append(cv, hint); g.appendChild(qb);
      } catch (e) { /* zbyt długi adres albo błąd biblioteki – panel działa bez QR */ }
    }
    box.appendChild(g);
  });
  // wskazówka o tunelu – tylko dla gospodarza (z komputera/sieci domowej)
  if (info && info.local) {
    const noteKey = { starting: 'share.tunnelStarting', install_prompt: 'share.tunnelPrompt', installing: 'share.tunnelInstalling', not_installed: 'share.tunnelMissing', error: 'share.tunnelError', off: 'share.tunnelOff' }[info.tunnel];
    if (noteKey) { const n = document.createElement('p'); n.className = 'share-note'; n.textContent = t(noteKey); box.appendChild(n); }
  }
}
setInterval(async () => {                  // tunel potrafi wstać dopiero po chwili – odświeżamy, dopóki czekamy na przeciwnika
  if (state && state.phase === 'waiting') { await loadInfo(); renderShare(); }
}, 3000);

function render() {
  if (closed) { show('closedScreen'); return; }
  const info = $('#roomInfo');
  if (!session || !state) {
    info.hidden = true;
    show('lobby');
    banner('');
    $('#chat').hidden = true; setChatOpen(false); chatSeen = null; chatRendered = '';
    return;
  }
  info.hidden = false;
  $('#roomCode').textContent = state.code;
  const s = state;
  const warn = s.opponentJoined && !s.opponentConnected;
  if (s.phase === 'waiting') {
    show('waiting');
    $('#waitCode').textContent = s.code;
    renderShare();
    banner(t('banner.waiting'));
  } else if (s.phase === 'placing') {
    show('placing');
    renderPlacing();
    banner(t(s.youReady ? (s.opponentReady ? 'banner.starting' : 'banner.placedWait') : 'banner.placing'));
  } else {
    show('game');
    renderGame();
    if (s.phase === 'playing') banner(t(s.turn === s.you ? 'banner.yourTurn' : 'banner.oppTurn'));
    else if (s.winner === s.you) banner(t('banner.win'), 'win');
    else banner(t('banner.lose'), 'lose');
  }
  if (warn && s.phase !== 'over') banner(t('banner.oppGone'), 'warn');
}

// ---------- połączenie ----------
function onState(s) {
  if (s.closed) return showClosed();
  const prevPhase = state && state.phase;
  const prevChat = state && state.chat && state.chat.length ? state.chat[state.chat.length - 1].id : (state ? 0 : undefined);
  state = s;
  if (s.phase === 'placing' && prevPhase && prevPhase !== 'placing' && prevPhase !== 'waiting') {
    place = { ships: [], horiz: true, sel: 4, hover: null };     // rewanż: zaczynamy od nowa
    lastSeq = null;
  }
  const seq = s.last ? s.last.seq : 0;
  if (lastSeq === null) lastSeq = seq;                              // pierwszy stan po wejściu – bez dźwięku
  else if (seq > lastSeq) {
    lastSeq = seq;
    if (s.last.result === 'miss') plusk(); else boom();
    if (s.last.by === s.you && s.last.result === 'sunk') toast(t('toast.sunk'));
  }
  render();
  renderChat(prevChat);
}

function gameGone() {                                               // serwer nie zna tej gry (np. restart)
  stopTransport();
  saveSession(null); state = null;
  render(); toast(t('toast.gone'));
}
function stopTransport() {
  if (source) { source.close(); source = null; }
  clearTimeout(sseWatchdog); pollId = 0;
}

// Transport: najpierw strumień na żywo (SSE). Jeśli nic nie dociera w 4 s (np. tunel Cloudflare go nie przepuszcza),
// przechodzimy na long-poll – zwykłe żądania, które serwer wstrzymuje do zmiany stanu.
function connect() {
  stopTransport();
  if (!session) return;
  const q = `code=${encodeURIComponent(session.code)}&token=${encodeURIComponent(session.token)}`;
  let got = false;
  source = new EventSource(`/api/events?${q}`);
  source.onmessage = e => { got = true; clearTimeout(sseWatchdog); const s = JSON.parse(e.data); ver = s.v; onState(s); };
  source.onerror = () => { if (source && source.readyState === EventSource.CLOSED) gameGone(); };
  sseWatchdog = setTimeout(() => { if (!got) { stopTransport(); startPolling(q); } }, 3000);
  refreshOnce(q);                                                      // pokaż ekran od razu, nie czekając na strumień
}

async function refreshOnce(q) {
  try {
    const r = await fetch(`/api/state?${q}`, { cache: 'no-store' });
    if (r.status === 404) return gameGone();
    if (r.ok) { const s = await r.json(); if (!state || s.v >= ver) { ver = s.v; onState(s); } }
  } catch (e) {}
}

async function startPolling(q) {
  const mine = ++pollId;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  while (pollId === mine && session) {
    try {
      const r = await fetch(`/api/poll?${q}&v=${ver}`, { cache: 'no-store' });
      if (pollId !== mine) return;
      if (r.status === 404) return gameGone();
      if (!r.ok) { await sleep(r.status === 429 ? 4000 : 2000); continue; }
      const s = await r.json();
      ver = s.v; onState(s);
    } catch (e) { await sleep(2000); }
  }
}

function enter(sess) {
  shareSig = '';
  saveSession(sess);
  state = null; lastSeq = null;
  place = { ships: [], horiz: true, sel: 4, hover: null };
  history.replaceState(null, '', location.pathname);
  connect();
}

$('#createBtn').addEventListener('click', async () => {
  audio();
  try { enter(await api('/api/create')); } catch (e) { toast(errorText(e)); }
});
$('#joinForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  audio();
  const code = $('#joinCode').value.trim().toUpperCase();
  if (code.length !== CODE_LEN) return toast(t('toast.codeLen', CODE_LEN));
  try { enter(await api('/api/join', { code })); } catch (e) { toast(errorText(e)); }
});
$('#copyLink').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(roomLink()); toast(t('toast.copied')); } catch (e) { toast(roomLink()); }
});

// start
applyStatic();
updateMuteBtn();
updateMusicBtn();
const params = new URLSearchParams(location.search);
if (params.get('room')) $('#joinCode').value = params.get('room').toUpperCase().slice(0, CODE_LEN);
loadInfo().then(() => { if (state && state.phase === 'waiting') renderShare(); });
render();
if (session) connect();
