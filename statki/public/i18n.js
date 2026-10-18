'use strict';
// Tłumaczenia interfejsu (polski / angielski). Wybór języka jest zapamiętywany w przeglądarce.
const I18N = {
  pl: {
    'title': 'Statki',
    'h1': '⚓ Statki',
    'room': 'Pokój:',
    'copyLink': 'Kopiuj link',
    'lang.label': 'Język',
    'lobby.new': 'Nowa gra',
    'lobby.newText': 'Utwórz grę i wyślij znajomemu kod lub link.',
    'lobby.create': 'Utwórz grę',
    'lobby.join': 'Dołącz do gry',
    'lobby.joinText': 'Wpisz kod od znajomego.',
    'lobby.joinBtn': 'Dołącz',
    'lobby.code': 'KOD',
    'lobby.codeAria': 'Kod gry',
    'wait.title': 'Czekam na przeciwnika…',
    'wait.give': 'Kod gry:',
    'share.intro': 'Przekaż przeciwnikowi jeden z adresów – zależy, gdzie jest:',
    'share.internet': '🌐 Przeciwnik w internecie (gdziekolwiek) – wyślij ten adres:',
    'share.lan': '🏠 Przeciwnik w tej samej sieci Wi-Fi/LAN – wyślij ten adres:',
    'share.here': 'Link do gry – wyślij go przeciwnikowi:',
    'share.copy': 'Kopiuj',
    'share.qr': 'Zeskanuj telefonem, aby od razu dołączyć do gry.',
    'share.qrAlt': 'Kod QR z linkiem do gry przez internet',
    'share.tunnelStarting': '⏳ Tunel Cloudflare się uruchamia… adres do gry przez internet pojawi się za chwilę.',
    'share.tunnelPrompt': '⏳ Serwer pyta w oknie konsoli, czy zainstalować cloudflared – odpowiedz tam (Enter = tak).',
    'share.tunnelInstalling': '⏳ Instaluję cloudflared… (Windows może poprosić o zgodę). Adres do gry przez internet pojawi się po instalacji.',
    'share.tunnelMissing': '⚠ Nie znaleziono programu cloudflared. Uruchom ponownie uruchom.bat i zgódź się na instalację (albo zainstaluj ręcznie: winget install Cloudflare.cloudflared).',
    'share.tunnelError': '⚠ Tunel Cloudflare nie działa. Uruchom serwer ponownie plikiem uruchom.bat.',
    'share.tunnelOff': 'ℹ Serwer działa bez tunelu, więc nie ma linku ani kodu QR do gry przez internet. Zamknij grę (⏻ Zamknij grę) i uruchom ją plikiem uruchom.bat (z tunelem Cloudflare).',
    'place.title': 'Ustaw swoje statki',
    'place.fleet': 'Twoja flota',
    'place.rotate': '↻ Obróć (R)',
    'place.random': '🎲 Losowo',
    'place.clear': 'Wyczyść',
    'place.ready': 'Gotowe',
    'place.readyWait': 'Gotowe – czekam…',
    'place.hint': 'Kliknij pole, aby postawić wybrany statek. Kliknij już postawiony statek, aby go zdjąć. Statki nie mogą się stykać, także rogami.',
    'place.ship': (len, left) => `${len}-masztowiec × ${left}`,
    'game.mine': 'Twoje statki:',
    'game.opp': 'Statki przeciwnika:',
    'game.myBoard': 'Twoja plansza',
    'game.targetBoard': 'Plansza przeciwnika',
    'rematch': 'Zagraj ponownie',
    'fireworks.btn': '🎆 Fajerwerki',
    'rematch.wait': 'Czekam na przeciwnika…',
    'rematch.join': 'Przeciwnik chce zagrać ponownie – dołącz',
    'banner.waiting': 'Czekam, aż przeciwnik dołączy…',
    'banner.placing': 'Ustaw swoje statki.',
    'banner.placedWait': 'Gotowe – czekam, aż przeciwnik ustawi statki.',
    'banner.starting': 'Zaczynamy…',
    'banner.yourTurn': 'Twoja kolej – strzelaj!',
    'banner.oppTurn': 'Kolej przeciwnika…',
    'banner.win': 'Wygrałeś! Zatopiłeś wszystkie statki przeciwnika 🎉',
    'banner.lose': 'Przegrałeś – przeciwnik zatopił Twoją flotę.',
    'banner.oppGone': 'Przeciwnik się rozłączył – czekam, aż wróci…',
    'chat.title': 'Czat',
    'chat.close': 'Zamknij czat',
    'chat.placeholder': 'Napisz do przeciwnika…',
    'chat.message': 'Wiadomość',
    'chat.send': 'Wyślij',
    'chat.you': 'Ty',
    'chat.opp': 'Przeciwnik',
    'chat.empty': 'Brak wiadomości. Napisz coś do przeciwnika!',
    'quit.btn': '⏻ Zamknij grę',
    'quit.title': 'Wyłącz serwer i tunel',
    'quit.confirm': 'Zamknąć grę? Serwer i tunel zostaną wyłączone, a wszystkie trwające gry zakończone.',
    'closed.auto': 'Ta karta zamknie się sama za chwilę…',
    'closed.manual': 'Przeglądarka nie pozwala zamknąć tej karty automatycznie – zamknij ją ręcznie.',
    'closed.title': 'Gra została zamknięta',
    'closed.text': 'Serwer i tunel zostały wyłączone. Możesz zamknąć tę kartę przeglądarki. Aby zagrać ponownie, uruchom grę jeszcze raz.',
    'toast.sunk': 'Zatopiony!',
    'toast.copied': 'Skopiowano link.',
    'toast.codeLen': n => `Kod ma ${n} liter.`,
    'toast.gone': 'Ta gra już nie istnieje.',
    'toast.network': 'Błąd połączenia.',
    'sound.on': 'Wycisz dźwięki', 'sound.off': 'Włącz dźwięki',
    'music.on': 'Wycisz muzykę', 'music.off': 'Włącz muzykę',
    'err.fleet_count': 'Nieprawidłowa liczba statków.', 'err.fleet_ship': 'Nieprawidłowy statek.',
    'err.fleet_bounds': 'Statek wychodzi poza planszę.', 'err.fleet_overlap': 'Statki nachodzą na siebie.',
    'err.fleet_mix': 'Zły skład floty.', 'err.fleet_touch': 'Statki nie mogą się stykać.',
    'err.not_placing': 'Teraz nie można ustawiać statków.', 'err.already_ready': 'Statki są już zatwierdzone.',
    'err.not_playing': 'Gra nie trwa.', 'err.not_your_turn': 'To nie Twoja kolej.',
    'err.out_of_board': 'Pole poza planszą.', 'err.already_shot': 'W to pole już strzelałeś.',
    'err.not_over': 'Gra jeszcze trwa.', 'err.room_full': 'W tej grze są już dwie osoby.',
    'err.rate_limited': 'Zbyt wiele żądań – spróbuj za chwilę.', 'err.too_many_rooms': 'Serwer ma za dużo gier – spróbuj później.',
    'err.forbidden': 'Brak uprawnień.', 'err.chat_invalid': 'Nieprawidłowa wiadomość (pusta lub za długa).', 'err.no_opponent': 'Przeciwnik jeszcze nie dołączył.',
    'err.too_many_conns': 'Zbyt wiele połączeń.', 'err.bad_request': 'Błędne żądanie.', 'err.no_room': 'Nie ma gry o takim kodzie.',
    'err.no_game': 'Nie ma takiej gry.', 'err.unknown_cmd': 'Nieznane polecenie.',
  },
  en: {
    'title': 'Battleships',
    'h1': '⚓ Battleships',
    'room': 'Room:',
    'copyLink': 'Copy link',
    'lang.label': 'Language',
    'lobby.new': 'New game',
    'lobby.newText': 'Create a game and send the code or link to a friend.',
    'lobby.create': 'Create game',
    'lobby.join': 'Join a game',
    'lobby.joinText': "Enter your friend's code.",
    'lobby.joinBtn': 'Join',
    'lobby.code': 'CODE',
    'lobby.codeAria': 'Game code',
    'wait.title': 'Waiting for your opponent…',
    'wait.give': 'Game code:',
    'share.intro': 'Send your opponent one of these addresses, depending on where they are:',
    'share.internet': '🌐 Opponent over the internet (anywhere) – send this address:',
    'share.lan': '🏠 Opponent on the same Wi-Fi/LAN – send this address:',
    'share.here': 'Game link – send it to your opponent:',
    'share.copy': 'Copy',
    'share.qr': 'Scan with a phone to join the game right away.',
    'share.qrAlt': 'QR code with the link to the game over the internet',
    'share.tunnelStarting': '⏳ The Cloudflare tunnel is starting… the internet address will appear shortly.',
    'share.tunnelPrompt': '⏳ The server is asking in its console window whether to install cloudflared – answer there (Enter = yes).',
    'share.tunnelInstalling': '⏳ Installing cloudflared… (Windows may ask for permission). The internet address will appear after the installation.',
    'share.tunnelMissing': '⚠ cloudflared was not found. Restart uruchom.bat and agree to the installation (or install it manually: winget install Cloudflare.cloudflared).',
    'share.tunnelError': '⚠ The Cloudflare tunnel is not running. Restart the server with uruchom.bat.',
    'share.tunnelOff': 'ℹ The server is running without a tunnel, so there is no internet link or QR code. Quit the game (⏻ Quit game) and start it with uruchom.bat (with the Cloudflare tunnel).',
    'place.title': 'Place your ships',
    'place.fleet': 'Your fleet',
    'place.rotate': '↻ Rotate (R)',
    'place.random': '🎲 Random',
    'place.clear': 'Clear',
    'place.ready': 'Ready',
    'place.readyWait': 'Ready – waiting…',
    'place.hint': 'Click a cell to place the selected ship. Click a placed ship to pick it up. Ships may not touch, not even diagonally.',
    'place.ship': (len, left) => `Ship of ${len} × ${left}`,
    'game.mine': 'Your ships:',
    'game.opp': "Opponent's ships:",
    'game.myBoard': 'Your board',
    'game.targetBoard': "Opponent's board",
    'rematch': 'Play again',
    'fireworks.btn': '🎆 Fireworks',
    'rematch.wait': 'Waiting for your opponent…',
    'rematch.join': 'Your opponent wants a rematch – join',
    'banner.waiting': 'Waiting for your opponent to join…',
    'banner.placing': 'Place your ships.',
    'banner.placedWait': 'Ready – waiting for your opponent to place their ships.',
    'banner.starting': 'Starting…',
    'banner.yourTurn': 'Your turn – fire!',
    'banner.oppTurn': "Opponent's turn…",
    'banner.win': 'You win! You sank the whole enemy fleet 🎉',
    'banner.lose': 'You lose – your fleet was sunk.',
    'banner.oppGone': 'Your opponent disconnected – waiting for them to return…',
    'chat.title': 'Chat',
    'chat.close': 'Close chat',
    'chat.placeholder': 'Write to your opponent…',
    'chat.message': 'Message',
    'chat.send': 'Send',
    'chat.you': 'You',
    'chat.opp': 'Opponent',
    'chat.empty': 'No messages yet. Say something to your opponent!',
    'quit.btn': '⏻ Quit game',
    'quit.title': 'Shut down the server and tunnel',
    'quit.confirm': 'Quit the game? The server and tunnel will be shut down and all games in progress will end.',
    'closed.auto': 'This tab will close by itself in a moment…',
    'closed.manual': 'Your browser does not allow closing this tab automatically – please close it manually.',
    'closed.title': 'The game has been closed',
    'closed.text': 'The server and tunnel have been shut down. You can close this browser tab. To play again, start the game again.',
    'toast.sunk': 'Sunk!',
    'toast.copied': 'Link copied.',
    'toast.codeLen': n => `The code has ${n} letters.`,
    'toast.gone': 'This game no longer exists.',
    'toast.network': 'Connection error.',
    'sound.on': 'Mute sound effects', 'sound.off': 'Unmute sound effects',
    'music.on': 'Mute music', 'music.off': 'Unmute music',
    'err.fleet_count': 'Wrong number of ships.', 'err.fleet_ship': 'Invalid ship.',
    'err.fleet_bounds': 'A ship goes off the board.', 'err.fleet_overlap': 'Ships overlap.',
    'err.fleet_mix': 'Wrong fleet composition.', 'err.fleet_touch': 'Ships may not touch.',
    'err.not_placing': 'You cannot place ships right now.', 'err.already_ready': 'Your ships are already confirmed.',
    'err.not_playing': 'The game is not in progress.', 'err.not_your_turn': "It's not your turn.",
    'err.out_of_board': 'That cell is off the board.', 'err.already_shot': 'You already fired at that cell.',
    'err.not_over': 'The game is still going.', 'err.room_full': 'This game already has two players.',
    'err.rate_limited': 'Too many requests – try again in a moment.', 'err.too_many_rooms': 'The server has too many games – try again later.',
    'err.forbidden': 'Not allowed.', 'err.chat_invalid': 'Invalid message (empty or too long).', 'err.no_opponent': 'Your opponent has not joined yet.',
    'err.too_many_conns': 'Too many connections.', 'err.bad_request': 'Bad request.', 'err.no_room': 'No game with that code.',
    'err.no_game': 'No such game.', 'err.unknown_cmd': 'Unknown command.',
  },
};

let lang = (() => {
  try { const s = localStorage.getItem('statki-lang'); if (s === 'pl' || s === 'en') return s; } catch (e) {}
  return (navigator.language || 'pl').toLowerCase().startsWith('pl') ? 'pl' : 'en';
})();

function t(key, ...args) {
  const v = (I18N[lang] && I18N[lang][key]) ?? I18N.pl[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}

// Tekst błędu z API: tłumaczymy po kodzie, a jeśli go nie znamy – pokazujemy komunikat serwera.
function errorText(e) {
  const k = 'err.' + (e && e.code);
  return I18N.pl[k] ? t(k) : (e && e.message) || t('toast.network');
}

// Statyczne napisy w HTML: data-i18n (tekst), data-i18n-placeholder, data-i18n-aria
function applyStatic() {
  document.documentElement.lang = lang;
  document.title = t('title');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.querySelectorAll('.lang button').forEach(b => {
    const on = b.dataset.lang === lang;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

function setLang(l) {
  if (l !== 'pl' && l !== 'en') return;
  lang = l;
  try { localStorage.setItem('statki-lang', l); } catch (e) {}
  applyStatic();
  if (typeof onLangChange === 'function') onLangChange();
}
