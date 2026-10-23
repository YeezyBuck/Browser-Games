'use strict';
// Kółko i krzyżyk przez sieć: klient. Ładuje się tylko wtedy, gdy strona działa przez serwer (index.html doładowuje ten plik
// po sprawdzeniu /api/info), więc samo otwarcie index.html z dysku nadal daje wyłącznie grę z komputerem.
// Infrastruktura (sesja, transport z awaryjnym long-pollingiem, czat, panel adresów z QR, zamykanie) pochodzi z WarShips, Dots,
// CapRace i Magnesów; reguły liczy serwer, tu jest interfejs. Współdzieli z grą z komputerem planszę, status i licznik wyniku
// (zmienne board, over, lastWinLine, mode, netMove, netBlocked oraz funkcje draw, setStatus, newGame, renderScore ze skryptu strony).
const Online = (function () {
  const $ = s => document.querySelector(s);
  const CODE_LEN = 6, SKEY = 'kik-session';
  let info = null, session = loadSession(), state = null, source = null, pollId = 0, ver = -1, sseWatchdog = null;
  let closed = false, unloading = false, lastSeq = null, justEntered = false, shareSig = '';
  let chatOpen = false, chatSeen = null, chatRendered = '';

  // ---------- sesja, komunikaty, API ----------
  function loadSession() { try { return JSON.parse(sessionStorage.getItem(SKEY)); } catch (e) { return null; } }
  function saveSession(s) { session = s; try { s ? sessionStorage.setItem(SKEY, JSON.stringify(s)) : sessionStorage.removeItem(SKEY); } catch (e) {} }
  function toast(msg, cls) {
    const el = document.createElement('div');
    el.className = 'toast' + (cls ? ' ' + cls : ''); el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3800);
  }
  function errorText(e) { const k = 'err.' + (e && e.code); return I18N.pl[k] ? t(k) : (e && e.message) || t('toast.network'); }
  async function api(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, session || {}, body || {})) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const err = new Error(data.error || ''); err.code = data.code; throw err; }
    return data;
  }

  // ---------- dźwięki (syntezowane; wyciszane przyciskiem 🔊 gry) ----------
  let ac = null;
  const muted = () => { try { return localStorage.getItem('kik-muted') === '1'; } catch (e) { return false; } };
  function audio() {
    if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (C) ac = new C(); }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  }
  function blip(f, at, dur, vol, type) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(vol, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(ac.destination); o.start(at); o.stop(at + dur + 0.05);
  }
  function sfx(kind) {
    if (muted() || !audio()) return;
    const at = ac.currentTime;
    if (kind === 'move') { blip(660, at, 0.14, 0.16, 'triangle'); blip(990, at + 0.04, 0.1, 0.05); }
    else if (kind === 'opp') { blip(440, at, 0.16, 0.16, 'triangle'); blip(660, at + 0.04, 0.1, 0.05); }
    else if (kind === 'ping') { blip(880, at, 0.2, 0.14); blip(1320, at + 0.09, 0.2, 0.14); }
    else { const seq = kind === 'win' ? [523, 659, 784, 1047, 1319] : kind === 'lose' ? [440, 349, 294, 220] : [440, 440]; seq.forEach((f, i) => blip(f, at + i * (kind === 'lose' ? 0.26 : 0.12), 0.6, 0.18, kind === 'lose' ? 'sine' : 'triangle')); }
  }

  // ---------- ekrany i tryb ----------
  function showScreen(n) {
    $('#netLobby').hidden = n !== 'lobby'; $('#netWait').hidden = n !== 'wait'; $('#netClosed').hidden = n !== 'closed';
    $('#playArea').hidden = !(n === 'game' || n === 'cpu');
    $('#netControls').hidden = n !== 'game'; $('#cpuControls').hidden = n !== 'cpu';
  }
  function labels(net) {
    $('#lblYou').dataset.i18n = net ? 'score.you.net' : 'score.you'; $('#lblOpp').dataset.i18n = net ? 'score.opp' : 'score.comp';
    if (!net) { $('#boxYou').className = 'x'; $('#boxOpp').className = 'o'; }
    applyStatic();
  }
  function setMode(m) {
    if (m === mode) return;
    for (const b of document.querySelectorAll('#modes button')) { const on = b.dataset.mode === m; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); }
    if (m === 'net') {
      clearTimeout(cpuTimer); mode = 'net'; netMove = onCell;
      labels(true);
      if (session && !closed) connect(); else render();
    } else {
      stopTransport(); mode = 'cpu'; netMove = null; netBlocked = false;
      labels(false);
      $('#roomInfo').hidden = true; $('#chat').hidden = true; setChatOpen(false);
      showScreen('cpu'); renderScore(); newGame();
    }
  }

  // ---------- gra ----------
  function renderGame(s) {
    const me = s.you, opp = 1 - me, mine = s.marks[me], his = s.marks[opp], playing = s.phase === 'playing', isOver = s.phase === 'over';
    $('#boxYou').className = mine.toLowerCase() + (playing && s.turn === me ? ' you-turn' : ''); $('#boxOpp').className = his.toLowerCase();
    $('#games').textContent = s.wins[0] + s.wins[1] + s.draws; $('#winsPlayer').textContent = s.wins[me]; $('#winsComputer').textContent = s.wins[opp]; $('#draws').textContent = s.draws;
    board = s.board.slice(); over = isOver; lastWinLine = s.line; netBlocked = !(playing && s.turn === me);
    draw(s.line);
    if (playing) {
      if (s.opponentJoined && !s.opponentConnected) setStatus('net.oppGone');
      else s.turn === me ? setStatus('net.yourTurn', mine) : setStatus('net.oppTurn', his);
    } else if (s.draw) setStatus('net.draw');
    else if (s.winner === me) setStatus(s.reason === 'resign' ? 'net.winResign' : 'net.win');
    else setStatus(s.reason === 'resign' ? 'net.loseResign' : 'net.lose');
    $('#resignBtn').hidden = !playing;
    const rb = $('#rematchBtn'); rb.hidden = !isOver; rb.disabled = s.youWantRematch;
    rb.textContent = t(s.youWantRematch ? 'net.rematchWait' : (s.opponentWantsRematch ? 'net.rematchJoin' : 'net.rematch'));
  }

  async function onCell(i) {
    const s = state;
    if (!s || s.phase !== 'playing' || s.turn !== s.you || board[i]) return;
    const prev = board.slice();
    board[i] = s.marks[s.you]; netBlocked = true; draw(lastWinLine); sfx('move');                // ruch pokazujemy od razu, serwer go potwierdzi
    try { await api('/api/move', { cell: i }); }
    catch (e) { toast(errorText(e)); board = prev; netBlocked = false; draw(lastWinLine); refreshOnce(); }
  }

  function render() {
    if (mode !== 'net') return;
    if (closed) { showScreen('closed'); return; }
    if (!session || !state) { $('#roomInfo').hidden = true; $('#chat').hidden = true; setChatOpen(false); chatSeen = null; chatRendered = ''; showScreen('lobby'); setStatus(''); return; }
    $('#roomInfo').hidden = false; $('#roomCode').textContent = state.code;
    if (state.phase === 'waiting') { showScreen('wait'); $('#waitCode').textContent = state.code; renderShare(); setStatus('net.waiting'); return; }
    showScreen('game'); renderGame(state); renderChat();
  }

  function onState(s) {
    if (s.closed) return showClosed();
    const prev = state, prevChat = state && state.chat && state.chat.length ? state.chat[state.chat.length - 1].id : (state ? 0 : undefined);
    state = s;
    if (lastSeq === null) lastSeq = s.last ? s.last.seq : 0;                                    // pierwszy stan po wejściu/odświeżeniu: bez dźwięku
    else if (s.last && s.last.seq > lastSeq) { lastSeq = s.last.seq; if (s.last.by !== s.you) sfx('opp'); }
    if (s.phase === 'over' && prev && prev.phase === 'playing') sfx(s.draw ? 'draw' : s.winner === s.you ? 'win' : 'lose');
    const freshGame = s.phase === 'playing' && s.board.every(v => !v) && ((prev && (prev.phase === 'waiting' || prev.phase === 'over')) || (!prev && justEntered));
    if (freshGame) toast(t(s.marks[s.you] === 'X' ? 'net.youX' : 'net.youO'), 'info');             // nowa gra: przypomnienie, jakim znakiem grasz (znaki zamieniają się co grę)
    justEntered = false;
    render();
    renderChat(prevChat);
  }

  // ---------- transport: SSE, a gdy nie dociera (tunel) long-polling ----------
  function gameGone() { stopTransport(); saveSession(null); state = null; lastSeq = null; render(); toast(t('toast.gone')); }
  function stopTransport() { if (source) { source.close(); source = null; } clearTimeout(sseWatchdog); pollId = 0; }
  function connect() {
    stopTransport();
    if (!session) { render(); return; }
    const q = `code=${encodeURIComponent(session.code)}&token=${encodeURIComponent(session.token)}`;
    let got = false;
    source = new EventSource(`/api/events?${q}`);
    source.onmessage = e => { got = true; clearTimeout(sseWatchdog); const s = JSON.parse(e.data); ver = s.v; onState(s); };
    source.onerror = () => { if (!unloading && source && source.readyState === EventSource.CLOSED) verifyGame(q); };
    sseWatchdog = setTimeout(() => { if (!got) { stopTransport(); startPolling(q); } }, 3000);
    refreshOnce();
  }
  async function refreshOnce() {
    if (!session) return;
    try {
      const r = await fetch(`/api/state?code=${encodeURIComponent(session.code)}&token=${encodeURIComponent(session.token)}`, { cache: 'no-store' });
      if (r.status === 404) return gameGone();
      if (r.ok) { const s = await r.json(); if (!state || s.v >= ver) { ver = s.v; onState(s); } }
    } catch (e) {}
  }
  async function verifyGame(q) {                                                                // zerwany strumień to jeszcze nie koniec gry
    try { const r = await fetch(`/api/state?${q}`, { cache: 'no-store' }); if (r.status === 404) return gameGone(); } catch (e) {}
    if (session && !closed && mode === 'net') { stopTransport(); startPolling(q); }
  }
  async function startPolling(q) {
    const mine = ++pollId, sleep = ms => new Promise(r => setTimeout(r, ms));
    while (pollId === mine && session) {
      try {
        const r = await fetch(`/api/poll?${q}&v=${ver}`, { cache: 'no-store' });
        if (pollId !== mine) return;
        if (r.status === 404) return gameGone();
        if (!r.ok) { await sleep(r.status === 429 ? 4000 : 2000); continue; }
        const s = await r.json(); ver = s.v; onState(s);
      } catch (e) { await sleep(2000); }
    }
  }
  addEventListener('pagehide', () => { unloading = true; });
  addEventListener('beforeunload', () => { unloading = true; });

  // ---------- czat ----------
  const chatInput = () => $('#chatInput');
  function setChatOpen(open) {
    chatOpen = open; $('#chatPanel').hidden = !open; $('#chatToggle').setAttribute('aria-expanded', String(open));
    if (open) { markChatRead(); setTimeout(() => chatInput().focus(), 0); scrollChat(true); }
  }
  function scrollChat(force) { const log = $('#chatLog'); if (force || log.scrollHeight - log.scrollTop - log.clientHeight < 80) log.scrollTop = log.scrollHeight; }
  function markChatRead() { const m = (state && state.chat) || []; chatSeen = m.length ? m[m.length - 1].id : 0; updateBadge(); }
  function updateBadge() {
    const m = (state && state.chat) || [], unread = chatOpen || !state ? 0 : m.filter(x => x.by !== state.you && x.id > (chatSeen || 0)).length, b = $('#chatBadge');
    b.hidden = unread === 0; b.textContent = unread > 9 ? '9+' : String(unread);
  }
  function renderChat(prevLastId) {
    const box = $('#chat'), show = !!state && state.opponentJoined;
    box.hidden = !show;
    if (!show) { if (chatOpen) setChatOpen(false); return; }
    const msgs = state.chat || [];
    if (chatSeen === null) chatSeen = msgs.length ? msgs[msgs.length - 1].id : 0;
    const sig = lang + '|' + state.you + '|' + msgs.map(m => m.id).join(',');
    if (sig !== chatRendered) {
      chatRendered = sig;
      const log = $('#chatLog'); log.textContent = '';
      if (!msgs.length) { const e = document.createElement('div'); e.className = 'chat-empty'; e.textContent = t('chat.empty'); log.appendChild(e); }
      msgs.forEach(m => {
        const d = document.createElement('div'); d.className = 'msg ' + (m.by === state.you ? 'mine' : 'theirs');
        const meta = document.createElement('span'); meta.className = 'meta';
        meta.textContent = `${m.by === state.you ? t('chat.you') : t('chat.opp')} · ${new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        const text = document.createElement('span'); text.textContent = m.text;                    // textContent: treść nigdy nie jest HTML-em
        d.append(meta, text); log.appendChild(d);
      });
      scrollChat(chatOpen);
    }
    const lastId = msgs.length ? msgs[msgs.length - 1].id : 0;
    if (chatOpen) markChatRead(); else updateBadge();
    if (prevLastId !== undefined && lastId > prevLastId && msgs[msgs.length - 1].by !== state.you) sfx('ping');
  }

  // ---------- adresy do przekazania przeciwnikowi (z kodem QR) ----------
  async function loadInfo() {
    try { info = await (await fetch('/api/info', { cache: 'no-store' })).json(); } catch (e) {}
    $('#quitBtn').hidden = closed || !(info && info.adminToken);                                 // przycisk tylko dla przeglądarki na komputerze z serwerem
  }
  const roomUrl = base => base.replace(/\/$/, '') + '/?room=' + session.code;
  const roomLink = () => roomUrl(info && info.publicUrl ? info.publicUrl : location.origin);
  function drawQr(canvas, text) {
    const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
    const n = qr.getModuleCount(), quiet = 4, scale = Math.max(3, Math.floor(220 / (n + quiet * 2))), size = (n + quiet * 2) * scale;
    canvas.width = canvas.height = size;
    const c = canvas.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, size, size); c.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) if (qr.isDark(r, q)) c.fillRect((q + quiet) * scale, (r + quiet) * scale, scale, scale);
  }
  function renderShare() {
    const box = $('#shareBox');
    if (!box || !session) return;
    const groups = [];
    if (info && info.publicUrl) groups.push(['share.internet', [roomUrl(info.publicUrl)]]);
    if (info && info.lan && info.lan.length) groups.push(['share.lan', info.lan.map(roomUrl)]);
    if (!groups.length) groups.push(['share.here', [roomUrl(location.origin)]]);
    const sig = lang + '|' + JSON.stringify(groups) + '|' + (info ? info.tunnel + info.local : '');
    if (sig === shareSig) return;                                                                // nic się nie zmieniło: nie ruszamy pól (zaznaczenie, fokus)
    shareSig = sig; box.textContent = '';
    groups.forEach(([labelKey, urls]) => {
      const g = document.createElement('div'); g.className = 'share-group';
      const l = document.createElement('p'); l.className = 'label'; l.textContent = t(labelKey); g.appendChild(l);
      urls.forEach(u => {
        const line = document.createElement('div'); line.className = 'link-line';
        const inp = document.createElement('input'); inp.readOnly = true; inp.value = u; inp.addEventListener('focus', () => inp.select());
        const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = t('share.copy');
        btn.addEventListener('click', async () => { try { await navigator.clipboard.writeText(u); toast(t('toast.copied'), 'info'); } catch (e) { inp.select(); } });
        line.append(inp, btn); g.appendChild(line);
      });
      if (labelKey === 'share.internet' && typeof qrcode === 'function') {                       // QR tylko dla linku przez internet
        try {
          const qb = document.createElement('div'); qb.className = 'qr-box';
          const cv = document.createElement('canvas'); cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', t('share.qrAlt')); cv.title = urls[0]; drawQr(cv, urls[0]);
          const hint = document.createElement('p'); hint.className = 'qr-hint'; hint.textContent = t('share.qr');
          qb.append(cv, hint); g.appendChild(qb);
        } catch (e) { /* zbyt długi adres albo błąd biblioteki: panel działa bez QR */ }
      }
      box.appendChild(g);
    });
    if (info && info.local) {                                                                    // wskazówka o tunelu: tylko dla gospodarza
      const key = { starting: 'share.tunnelStarting', install_prompt: 'share.tunnelPrompt', installing: 'share.tunnelInstalling', not_installed: 'share.tunnelMissing', error: 'share.tunnelError', off: 'share.tunnelOff' }[info.tunnel];
      if (key) { const n = document.createElement('p'); n.className = 'share-note'; n.textContent = t(key); box.appendChild(n); }
    }
  }

  // ---------- zamykanie serwera i tunelu ----------
  function showClosed() {
    closed = true; stopTransport(); saveSession(null); state = null;
    $('#roomInfo').hidden = true; $('#chat').hidden = true; $('#quitBtn').hidden = true;
    showScreen('closed'); setStatus('');
  }
  function closeTabSoon() {
    const note = $('#closedAuto');
    note.hidden = false; note.dataset.i18n = 'closed.auto'; applyStatic();
    setTimeout(() => { window.close(); setTimeout(() => { note.dataset.i18n = 'closed.manual'; applyStatic(); }, 700); }, 1500);
  }

  // ---------- start ----------
  function enter(sess) { shareSig = ''; saveSession(sess); state = null; lastSeq = null; justEntered = true; history.replaceState(null, '', location.pathname); connect(); }
  function bind() {
    for (const b of document.querySelectorAll('#modes button')) b.addEventListener('click', () => setMode(b.dataset.mode));
    $('#createBtn').addEventListener('click', async () => { audio(); try { enter(await api('/api/create', {})); } catch (e) { toast(errorText(e)); } });
    $('#joinForm').addEventListener('submit', async ev => {
      ev.preventDefault(); audio();
      const code = $('#joinCode').value.trim().toUpperCase();
      if (code.length !== CODE_LEN) return toast(t('toast.codeLen', CODE_LEN));
      try { enter(await api('/api/join', { code })); } catch (e) { toast(errorText(e)); }
    });
    $('#copyLink').addEventListener('click', async () => { try { await navigator.clipboard.writeText(roomLink()); toast(t('toast.copied'), 'info'); } catch (e) { toast(roomLink()); } });
    $('#resignBtn').addEventListener('click', async () => { if (!confirm(t('net.resignConfirm'))) return; try { await api('/api/resign'); } catch (e) { toast(errorText(e)); } });
    $('#rematchBtn').addEventListener('click', async () => { try { await api('/api/rematch'); } catch (e) { toast(errorText(e)); } });
    $('#chatToggle').addEventListener('click', () => setChatOpen(!chatOpen));
    $('#chatClose').addEventListener('click', () => setChatOpen(false));
    addEventListener('keydown', e => { if (e.key === 'Escape' && chatOpen) setChatOpen(false); });
    $('#chatForm').addEventListener('submit', async ev => {
      ev.preventDefault();
      const text = chatInput().value.trim(); if (!text) return;
      chatInput().value = '';
      try { await api('/api/chat', { text }); } catch (e) { chatInput().value = text; toast(errorText(e)); }
    });
    $('#quitBtn').addEventListener('click', async () => {
      if (!info || !info.adminToken || !confirm(t('quit.confirm'))) return;
      try {
        const r = await fetch('/api/shutdown', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': info.adminToken }, body: '{}' });
        if (!r.ok) throw Object.assign(new Error(''), { code: 'forbidden' });
        if (mode !== 'net') setMode('net');
        showClosed(); closeTabSoon();
      } catch (e) { toast(errorText(e)); }
    });
    setInterval(async () => { if (mode === 'net' && state && state.phase === 'waiting') { await loadInfo(); renderShare(); } }, 3000);   // tunel potrafi wstać po chwili
  }

  function start(i) {
    info = i; $('#modes').hidden = false; bind(); loadInfo();
    const room = new URLSearchParams(location.search).get('room');
    if (room) $('#joinCode').value = room.toUpperCase().slice(0, CODE_LEN);
    if (room || session) setMode('net');
  }

  return {
    start,
    onLang() { shareSig = ''; chatRendered = ''; if (mode === 'net') render(); },
    get state() { return state; }, get session() { return session; },
  };
})();
