/* Wyścig kapsli – klient. Infrastruktura (sesja, transport z awaryjnym long-pollingiem, czat, panel adresów z QR, zamykanie)
   pochodzi z WarShips i Dots; fizykę i reguły liczy serwer (public/engine.js), tu jest interfejs, odtwarzanie lotu i dźwięki. */
'use strict';

const CODE_LEN = 6;
const $ = s => document.querySelector(s);

let session = loadSession();     // { code, token } – per karta przeglądarki, by dało się grać z dwóch kart
let state = null;
let source = null;
let pollId = 0;                  // numer aktywnej pętli long-poll (0 = brak)
let ver = -1;                    // ostatnia znana wersja stanu z serwera
let sseWatchdog = null;
let lastShotId = null;           // ostatnie obsłużone pstryknięcie (żeby dźwięk i animacja zagrały raz)
let trackKey = '';               // seed i długość bieżącego toru (zmiana = nowa partia)
let animating = false;           // trwa odtwarzanie lotu kapsla
let aimBlocked = false;          // krótka blokada po animacji (serwer jeszcze "domyka" poprzedni ruch)
let sending = false;             // pstryknięcie wysłane, czekamy na odpowiedź serwera
let overHandled = true;          // efekty końca gry (dźwięk, fajerwerki) już zagrane
let notifiedFor = -1;            // numer pstryknięcia, po którym zagraliśmy sygnał "Twoja kolej"
let info = null;                 // { publicUrl, tunnel, lan, local, adminToken } z /api/info

// ---------- sesja ----------
function loadSession() {
  try { return JSON.parse(sessionStorage.getItem('caprace-session')); } catch (e) { return null; }
}
function saveSession(s) {
  session = s;
  try { s ? sessionStorage.setItem('caprace-session', JSON.stringify(s)) : sessionStorage.removeItem('caprace-session'); } catch (e) {}
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
try { muted = localStorage.getItem('caprace-muted') === '1'; } catch (e) {}

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
// Limiter: ogranicza szczyty głośności, żeby mocne wybuchy nie trzeszczały (przesterowanie), a mogły być głośne.
function limiter() {
  const c = ac.createDynamicsCompressor();
  c.threshold.value = -8; c.knee.value = 4; c.ratio.value = 14; c.attack.value = 0.002; c.release.value = 0.18;
  c.connect(ac.destination);
  return c;
}


// ---------- dźwięki gry (syntezowane) ----------
function blip(freq, t0, dur, vol, type, dest) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
}
function noiseHit(t0, dur, freq, q, vol, type, dest) {
  const src = ac.createBufferSource(); src.buffer = noiseBuffer(dur, 2);
  const f = ac.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(dest); src.start(t0);
}
// Pstryknięcie kciukiem w kapsel: suchy "pstryk" i niski stuk; im większa siła, tym mocniej.
function flickSound(power) {
  if (muted || !audio()) return;
  const t = ac.currentTime, lim = limiter(), p = Math.max(0, Math.min(1, power));
  noiseHit(t, 0.05, 2200, 1.4, 0.12 + 0.25 * p, 'bandpass', lim);
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.09);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.14 + 0.22 * p, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
  o.connect(g); g.connect(lim); o.start(t); o.stop(t + 0.14);
}
// Uderzenie kapsla w kredową bandę: głuchy "tok".
function wallSound(strength) {
  if (muted || !audio()) return;
  const t = ac.currentTime, lim = limiter(), s = Math.max(0.1, Math.min(1, strength));
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'triangle'; o.frequency.setValueAtTime(330, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.08);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07 + 0.2 * s, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o.connect(g); g.connect(lim); o.start(t); o.stop(t + 0.15);
  noiseHit(t, 0.06, 900, 0.8, 0.05 + 0.1 * s, 'lowpass', lim);
}
// Zderzenie dwóch kapsli: metaliczny "brzdęk" (kilka nieharmonicznych tonów, szybko zanikających).
function clinkSound(strength) {
  if (muted || !audio()) return;
  const t = ac.currentTime, lim = limiter(), s = Math.max(0.15, Math.min(1, strength));
  [[2093, 1], [3136, 0.7], [4486, 0.5], [5890, 0.3]].forEach(([f, k]) => blip(f, t, 0.12 + 0.3 * k * s, (0.05 + 0.1 * s) * k, 'sine', lim));
  noiseHit(t, 0.04, 5000, 1, 0.08 + 0.1 * s, 'highpass', lim);
}
// Meta: zwycięzca – fanfara, przegrany – opadające tony, remis – dwa spokojne dźwięki.
function endSound(kind) {
  if (muted || !audio()) return;
  const t = ac.currentTime, lim = limiter();
  const seq = kind === 'win' ? [523, 659, 784, 1047, 1319, 1568] : kind === 'lose' ? [440, 349, 294, 220] : [440, 440];
  seq.forEach((f, i) => {
    const at = t + i * (kind === 'lose' ? 0.28 : 0.13);
    blip(f, at, kind === 'win' ? 0.7 : 0.8, 0.2, kind === 'lose' ? 'sine' : 'triangle', lim);
    if (kind === 'win') blip(f * 2, at, 0.5, 0.06, 'sine', lim);
  });
}
// "Twoja kolej": miękki dwudźwięk.
function turnSound() {
  if (muted || !audio()) return;
  const t = ac.currentTime, lim = limiter();
  blip(660, t, 0.18, 0.1, 'sine', lim); blip(880, t + 0.1, 0.22, 0.1, 'sine', lim);
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
  try { localStorage.setItem('caprace-muted', muted ? '1' : '0'); } catch (e) {}
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
function onLangChange() { Tutorial.refresh(); updateMuteBtn(); updateMusicBtn(); shareSig = ''; render(); chatRendered = ''; if (state) renderChat(); }

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
  ['lobby', 'waiting', 'game', 'closedScreen'].forEach(n => { $('#' + n).hidden = n !== id; });
  Board.setActive(id === 'game');
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
  Fireworks.stop();
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
    closeTabSoon();
  } catch (e) { toast(errorText(e)); }
});

// Po zamknięciu serwera próbujemy zamknąć też kartę. Przeglądarki zwykle pozwalają na to tylko dla kart otwartych
// przez skrypt albo bez historii nawigacji (np. otwartych z pliku .bat w Chrome/Edge/Brave); gdy zablokują, zostaje komunikat.
function closeTabSoon() {
  const note = $('#closedAuto');
  note.hidden = false; note.dataset.i18n = 'closed.auto'; applyStatic();
  setTimeout(() => {
    window.close();
    setTimeout(() => { note.dataset.i18n = 'closed.manual'; applyStatic(); }, 700);    // jeśli kod nadal działa, karta się nie zamknęła
  }, 1500);
}
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


// ---------- ekran gry ----------
const SEAT_COLOR = ['red', 'blue'];                // kapsel gracza 0 jest czerwony, gracza 1 niebieski
function renderGame(s) {
  const me = s.you, opp = 1 - s.you, playing = s.phase === 'playing', over = s.phase === 'over';
  $('#cardYou').className = 'pcard ' + SEAT_COLOR[me] + (playing && !animating && s.turn === me ? ' turn' : '');
  $('#cardOpp').className = 'pcard ' + SEAT_COLOR[opp] + (playing && !animating && s.turn === opp ? ' turn' : '');
  $('#colYou').textContent = '(' + t('color.' + SEAT_COLOR[me]) + ')';
  $('#colOpp').textContent = '(' + t('color.' + SEAT_COLOR[opp]) + ')';
  $('#shotsYou').textContent = t('game.shots', s.shots[me], s.maxShots);
  $('#shotsOpp').textContent = t('game.shots', s.shots[opp], s.maxShots);
  const pct = i => Math.round(s.progress[i] * 100);
  $('#barYou').style.width = pct(me) + '%'; $('#barOpp').style.width = pct(opp) + '%';
  $('#barYouWrap').setAttribute('aria-valuenow', pct(me)); $('#barOppWrap').setAttribute('aria-valuenow', pct(opp));
  $('#barYouWrap').title = $('#barOppWrap').title = t('game.progress');
  $('#actions').hidden = !playing;
  const showOver = over && !animating;
  $('#overBox').hidden = !showOver;
  $('#fireworksBtn').hidden = !(showOver && !s.draw && s.winner === me);
  if (showOver) {
    const rb = $('#rematchBtn');
    rb.disabled = s.youWantRematch;
    rb.textContent = t(s.youWantRematch ? 'rematch.wait' : (s.opponentWantsRematch ? 'rematch.join' : 'rematch'));
  }
}

function resultBanner(s) {
  const me = s.you, why = s.reason === 'limit' ? ' ' + t('reason.limit') : '';
  if (s.draw) return [t('banner.draw') + why, ''];
  if (s.winner === me) return [s.reason === 'resign' ? t('banner.winResign') : t('banner.win') + why, 'win'];
  return [s.reason === 'resign' ? t('banner.loseResign') : t('banner.lose') + why, 'lose'];
}

function updateAim() {
  const s = state;
  Board.setCanAim(!!s && s.phase === 'playing' && s.turn === s.you && !animating && !aimBlocked && !sending);
}

function render() {
  if (closed) { show('closedScreen'); return; }
  const roomInfo = $('#roomInfo');
  if (!session || !state) {
    roomInfo.hidden = true;
    show('lobby');
    banner('');
    $('#chat').hidden = true; setChatOpen(false); chatSeen = null; chatRendered = '';
    return;
  }
  roomInfo.hidden = false;
  $('#roomCode').textContent = state.code;
  const s = state;
  if (s.phase === 'waiting') {
    show('waiting');
    $('#waitCode').textContent = s.code;
    renderShare();
    banner(t('banner.waiting'));
    return;
  }
  show('game');
  renderGame(s);
  updateAim();
  if (animating) banner(t('banner.rolling'));
  else if (s.phase === 'playing') banner(t(s.turn === s.you ? 'banner.yourTurn' : 'banner.oppTurn'));
  else { const [text, cls] = resultBanner(s); banner(text, cls); }
  if (s.opponentJoined && !s.opponentConnected && s.phase !== 'over') banner(t('banner.oppGone'), 'warn');
}

// ---------- stan z serwera ----------
// Efekty po zakończeniu animacji: sygnał kolejki, koniec gry (dźwięk, fajerwerki).
function settle() {
  const s = state;
  if (!s || animating) return;
  if (s.phase !== 'over') { overHandled = false; Fireworks.stop(); }
  if (s.phase === 'over' && !overHandled) {
    overHandled = true;
    endSound(s.draw ? 'draw' : s.winner === s.you ? 'win' : 'lose');
    if (!s.draw && s.winner === s.you) Fireworks.start();
  }
  if (s.phase === 'playing' && s.turn === s.you && notifiedFor !== s.shotId) { if (notifiedFor !== -1 && s.shotId > 0) turnSound(); notifiedFor = s.shotId; }
}

function afterShot() {
  animating = false;
  if (state) { Board.setCaps(state.caps); Board.setTurn(state.turn); }
  aimBlocked = true;
  setTimeout(() => { aimBlocked = false; updateAim(); }, 350);
  render(); settle();
}

function startShot(sh) {
  animating = true;
  const f0 = sh.frames[0], f1 = sh.frames[Math.min(1, sh.frames.length - 1)];
  Board.setCaps([{ x: f0[0], y: f0[1] }, { x: f0[2], y: f0[3] }]);
  const pw = Math.hypot(f1[sh.by * 2] - f0[sh.by * 2], f1[sh.by * 2 + 1] - f0[sh.by * 2 + 1]) * 30 / CapEngine.P.vMax;
  if (sh.age < 120) flickSound(pw);
  Board.play(sh, afterShot);
}

function onState(s) {
  if (s.closed) return showClosed();
  const prev = state;
  const prevChat = state && state.chat && state.chat.length ? state.chat[state.chat.length - 1].id : (state ? 0 : undefined);
  state = s;
  Board.setMe(s.you);
  const key = s.track ? s.track.seed + ':' + s.track.lenKey : '';
  if (key !== trackKey) {                                           // nowa partia (albo pierwszy stan): nowy tor, kapsle na starcie
    trackKey = key; Board.stopAnim(); animating = false;
    Board.setTrack(s.track); Board.setCaps(s.caps); Board.snap();
    lastShotId = null;
    overHandled = s.phase === 'over';                               // wejście do zakończonej gry nie odpala fajerwerków
    notifiedFor = -1;
  }
  Board.setTurn(s.turn);
  if (s.phase !== 'waiting') {
    if (lastShotId === null) {                                      // pierwszy stan po wejściu/odświeżeniu
      lastShotId = s.shotId;
      if (s.shot && s.shot.id === s.shotId && s.shot.age < s.shot.seconds * 1000) startShot(s.shot);   // lot jeszcze trwa: dołączamy w połowie
      else Board.setCaps(s.caps);
    } else if (s.shotId > lastShotId) {
      lastShotId = s.shotId;
      if (s.shot && s.shot.id === s.shotId) { Board.stopAnim(); startShot(s.shot); }
      else { Board.stopAnim(); animating = false; Board.setCaps(s.caps); }
    } else if (!animating) Board.setCaps(s.caps);
  }
  render();
  renderChat(prevChat);
  settle();
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
  source.onerror = () => { if (!unloading && source && source.readyState === EventSource.CLOSED) verifyGame(q); };
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

// Zerwany strumień nie oznacza, że gry nie ma (przeglądarka zrywa go też przy odświeżeniu i zamknięciu karty, a sieć bywa zawodna).
// Pytamy serwer: tylko odpowiedź "nie ma takiej gry" kończy sesję, w pozostałych przypadkach przechodzimy na zapasowy transport.
let unloading = false;
addEventListener('pagehide', () => { unloading = true; });
addEventListener('beforeunload', () => { unloading = true; });
async function verifyGame(q) {
  try {
    const r = await fetch(`/api/state?${q}`, { cache: 'no-store' });
    if (r.status === 404) return gameGone();
  } catch (e) { /* brak sieci: spróbujemy zapasowego transportu */ }
  if (session && !closed) { stopTransport(); startPolling(q); }
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
  state = null; lastShotId = null; trackKey = ''; animating = false; sending = false;
  history.replaceState(null, '', location.pathname);
  connect();
}

Board.onShoot(async params => {
  if (sending) return;
  sending = true; updateAim();
  let accepted = false;
  try { await api('/api/shoot', params); accepted = true; } catch (e) { toast(errorText(e)); }
  sending = false;
  if (accepted) { aimBlocked = true; setTimeout(() => { aimBlocked = false; updateAim(); }, 2500); }   // do czasu, aż nowy stan z lotem dotrze (wolne łącze, tunel)
  updateAim();
});
Board.onWeak(() => toast(t('toast.weak')));
Board.onEvent((type, strength) => (type === 'cap' ? clinkSound(strength) : wallSound(strength)));
const act = (path, body) => async () => { try { await api(path, body); } catch (e) { toast(errorText(e)); } };
$('#resignBtn').addEventListener('click', () => { if (confirm(t('resign.confirm'))) act('/api/resign')(); });
$('#rematchBtn').addEventListener('click', act('/api/rematch'));
$('#fireworksBtn').addEventListener('click', () => Fireworks.start());

$('#createBtn').addEventListener('click', async () => {
  audio();
  try { enter(await api('/api/create', { len: $('#lenSelect').value, rule: $('#ruleSelect').value })); } catch (e) { toast(errorText(e)); }
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
Tutorial.autoOpen();
