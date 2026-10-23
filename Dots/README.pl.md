# ● Kropki – gra w kropki dla dwóch osób w przeglądarce

🇬🇧 [English version](README.md)

Klasyczne polskie **kropki** (otaczanie) dla **dwóch graczy**: w sieci domowej albo **przez internet**. Gracze na zmianę stawiają kropki na siatce, a zamknięta pętla własnych kropek wokół kropek przeciwnika je przejmuje. Gra ma wbudowany czat, kod QR do dołączania z telefonu, polski i angielski interfejs, nocne niebo z konstelacjami w tle, spokojną muzykę, dźwięki i fajerwerki dla zwycięzcy.

Można grać **ze znajomym** albo **z komputerem** (poziom łatwy lub trudny). Nie wymaga instalowania żadnych bibliotek: wystarczy **Node.js**. Serwer jest „sędzią” gry i pilnuje wszystkich reguł. Gra powstała na bazie [WarShips](../WarShips/README.pl.md) i ma tę samą infrastrukturę (pokoje, tunel Cloudflare, czat, zabezpieczenia).

<p align="center">
  <img src="../docs/screenshots/dots-capture.jpg" width="48%" alt="Dots: przejęcie kropki przeciwnika">
  <img src="../docs/screenshots/dots-fireworks.jpg" width="48%" alt="Dots: fajerwerki zwycięzcy">
</p>

---

## Spis treści
1. [Zasady gry](#1-zasady-gry)
2. [Co jest potrzebne i instalacja](#2-co-jest-potrzebne-i-instalacja)
3. [Uruchomienie serwera](#3-uruchomienie-serwera)
4. [Jak zagrać – krok po kroku](#4-jak-zagrać--krok-po-kroku)
5. [Gra przez internet (tunel Cloudflare i kod QR)](#5-gra-przez-internet-tunel-cloudflare-i-kod-qr)
6. [Sterowanie i funkcje](#6-sterowanie-i-funkcje)
7. [Zatrzymanie serwera](#7-zatrzymanie-serwera)
8. [Rozwiązywanie problemów](#8-rozwiązywanie-problemów)
9. [Ustawienia i zabezpieczenia](#9-ustawienia-i-zabezpieczenia)
10. [Testy](#10-testy)
11. [Budowa projektu (dla programistów)](#11-budowa-projektu-dla-programistów)

---

## 1. Zasady gry

- Plansza to siatka **przecięć linii**. Dostępne rozmiary (wybierasz przy tworzeniu gry): **mała 15×15**, **średnia 20×20**, **duża 30×20**.
- Dwóch graczy: **czerwony** i **niebieski**. Na zmianę stawiają **jedną kropkę** w swoim kolorze na wolnym przecięciu. Zaczyna czerwony; kto nim jest, losuje serwer.
- **Przejmowanie.** Kropki tego samego koloru łączą się, gdy sąsiadują w poziomie, w pionie **albo po przekątnej**. Zamknięta pętla takich kropek otacza fragment planszy. Wszystkie **żywe kropki przeciwnika wewnątrz** zostają przejęte i dają zdobywcy po jednym punkcie. Najmniejsza pętla to romb z 4 kropek wokół jednej kropki przeciwnika.
- **Brzeg planszy nie jest ścianą**: pętla musi w całości mieścić się na planszy.
- **Zablokowany obszar.** Wolne pola wewnątrz pętli, która coś przejęła, zostają zablokowane: nikt nie może tam postawić kropki.
- **Zakaz „samobójstwa”.** Nie wolno postawić kropki w polu, które jest już otoczone przez przeciwnika. Wyjątek: ruch, który sam coś przejmuje i przez to rozrywa otoczenie, jest dozwolony.
- **Koniec gry:** gdy gracz, który ma ruch, nie ma legalnego ruchu (np. plansza jest pełna); gdy **obaj gracze zgodzą się zakończyć** (przycisk „Zakończ i policz punkty”); albo gdy ktoś się **podda**.
- **Wygrywa** ten, kto przejął **więcej kropek** przeciwnika. Równy wynik to remis.
- Po grze można zagrać **rewanż**: plansza się czyści, a zaczyna drugi gracz.

## 2. Co jest potrzebne i instalacja

| Element | Do czego | Obowiązkowe? |
|---|---|---|
| **Node.js 18 lub nowszy** | uruchamia serwer gry | tak |
| Nowoczesna przeglądarka (Chrome, Edge, Firefox, Safari, Brave) | gra działa w przeglądarce, u obu graczy | tak |
| **cloudflared** (program Cloudflare) | tunel do gry przez internet | tylko do gry przez internet; **instalacja jest automatyczna** (zobacz rozdział 5) |

Konta (Cloudflare, GitHub itp.) nie są potrzebne. Gra działa na Windows, macOS i Linuksie; dołączone pliki `.bat` są dla Windows.

**Instalacja krok po kroku:**
1. Zainstaluj Node.js: pobierz wersję LTS z <https://nodejs.org> i zainstaluj z ustawieniami domyślnymi.
2. Sprawdź w terminalu: `node --version` (powinien pojawić się np. `v22.11.0`). Jeśli jest błąd „nie rozpoznano polecenia”, zamknij i otwórz terminal ponownie albo uruchom komputer ponownie.
3. Pobierz repozytorium: `git clone https://github.com/YeezyBuck/Browser-Games.git` (gra jest w folderze `Dots`: `Browser-Games/Dots`) albo pobierz ZIP z GitHuba i rozpakuj.

Samej gry nie trzeba instalować ani budować: nie ma `npm install`.

## 3. Uruchomienie serwera

Wybierz jedną z dróg. Po starcie w konsoli pojawi się adres gry. Domyślny port to **3100** (WarShips używa 3000, więc obie gry mogą działać jednocześnie).

### Windows – dwuklik (najłatwiej)
- **`uruchom.bat`** (główny): sprawdza cloudflared (w razie potrzeby proponuje instalację), uruchamia tunel, potem grę i przeglądarkę. Gra działa w sieci domowej **i przez internet**.
- **`uruchom-bez-tunelu.bat`**: tylko sieć domowa (bez cloudflared, bez linku i kodu QR do gry przez internet).

Otworzy się okno konsoli: **nie zamykaj go podczas gry**. Strona gry otworzy się sama w przeglądarce (`http://localhost:3100`). Na koniec użyj przycisku **⏻ Zamknij grę** (zobacz [rozdział 7](#7-zatrzymanie-serwera)).

### Terminal (Windows, macOS, Linux)
```
cd Dots
node server.js            # tylko sieć domowa
node server.js --tunnel   # z tunelem Cloudflare (gra przez internet)
node server.js --open     # dodatkowo otwórz grę w przeglądarce
```
Skróty `npm`: `npm start` (z tunelem i przeglądarką, jak `uruchom.bat`) i `npm run local` (bez tunelu). Inny port: `PORT=3200 node server.js` (PowerShell: `$env:PORT=3200; node server.js`).

## 4. Jak zagrać – krok po kroku

Potrzebujesz dwóch osób (albo dwóch kart przeglądarki, żeby spróbować samemu).

### Gracz 1 – zakłada grę
1. Otwórz stronę gry (`http://localhost:3100`) i, jeśli chcesz, wybierz język przyciskami **Polski / English**.
2. Wybierz **rozmiar planszy** i kliknij **Utwórz grę**. Pojawi się **6-literowy kod gry** i gotowe linki do przekazania przeciwnikowi (🌐 przez internet razem z kodem QR, 🏠 w sieci domowej).
3. Wyślij znajomemu odpowiedni link (**Kopiuj**) i poczekaj, aż dołączy.

**Gra z komputerem:** w tym samym panelu ustaw **Przeciwnik: Komputer** i wybierz **poziom** (łatwy albo trudny). Gra startuje od razu: nie ma kodu, linku, kodu QR ani czatu, a komputer zawsze zgadza się na rewanż. Gdy zaproponujesz zakończenie gry i policzenie punktów, komputer zgodzi się, jeśli nie przegrywa, a w przeciwnym razie odmówi.

### Gracz 2 – dołącza
Otwórz link od gracza 1 (kod wpisze się sam) albo otwórz stronę gry, wpisz kod w polu **Dołącz do gry** i kliknij **Dołącz**. Telefonem możesz zeskanować kod QR.

### Rozgrywka
1. Gra startuje od razu po dołączeniu. U góry widzisz dwie karty z wynikiem (kolor każdego gracza, liczba przejętych kropek); świecąca karta pokazuje, **czyja jest kolej**.
2. W swojej kolejce **kliknij przecięcie linii** na planszy. Pod kursorem widać półprzezroczystą kropkę w Twoim kolorze, a ostatni ruch jest zaznaczony pulsującym pierścieniem.
3. Gdy zamkniesz pętlę wokół kropek przeciwnika, zobaczysz efekt przejęcia, usłyszysz sygnał, a przejęte pole zabarwi się na Twój kolor. Przejęte kropki są przygaszone z kropką w kolorze zdobywcy.
4. Gdy chcesz skończyć, kliknij **Zakończ i policz punkty**. Przeciwnik dostaje propozycję i może się **zgodzić** albo **odrzucić**; ruch przeciwnika też ją anuluje. Możesz też się **poddać**.
5. Na koniec zobaczysz wynik. Zwycięzca dostaje **fajerwerki** (przycisk 🎆 powtarza pokaz). Kliknij **Zagraj ponownie**, żeby zagrać rewanż (oboje klikają).

## 5. Gra przez internet (tunel Cloudflare i kod QR)

Gdy przeciwnik jest poza Twoją siecią domową, użyj tunelu. Nie trzeba konta ani ustawiania routera.

**Automatyczna instalacja cloudflared.** Przy starcie z tunelem (`uruchom.bat`, `npm start`) serwer sprawdza, czy cloudflared jest zainstalowany. Jeśli go nie ma, proponuje instalację (Windows: `winget`, macOS: `brew`) i pyta w konsoli (Enter = tak). Przy fladze `--yes` (albo `CLOUDFLARED_AUTO_INSTALL=1`) instaluje bez pytania. Bez interaktywnej konsoli (serwer w tle) sam niczego nie instaluje. Ręcznie: `winget install Cloudflare.cloudflared`, `brew install cloudflared` albo instrukcja pod <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>.

**Kolejność startu:** `[1/3]` sprawdzenie cloudflared, `[2/3]` tunel i jego adres, `[3/3]` gra i przeglądarka. Jeśli tunel nie wystartuje, gra uruchomi się w sieci domowej, a konsola pokaże powód.

W oczekiwaniu na przeciwnika gra pokazuje, **który adres komu przekazać**: 🌐 adres tunelu (`https://….trycloudflare.com/?room=KOD`) razem z **kodem QR**, który przeciwnik może zeskanować telefonem, oraz 🏠 adres sieci domowej.

Dobrze wiedzieć: adres tunelu jest **tymczasowy** (zmienia się przy każdym uruchomieniu), a komputer z serwerem musi być **włączony**. Darmowy tunel nie przepuszcza strumienia na żywo (SSE), więc po ok. 3 s gra **sama przełącza się na zapasowy transport** (long-polling), co jest niewidoczne dla graczy. Każdy, kto zna link **i** kod, może dołączyć jako drugi gracz.

## 6. Sterowanie i funkcje

| Funkcja | Jak |
|---|---|
| Postawienie kropki | kliknięcie (albo dotknięcie) najbliższego przecięcia w swojej kolejce |
| Zakończenie gry za zgodą | **Zakończ i policz punkty**; przeciwnik: **Zgoda** / **Odrzuć**; proponujący może **Wycofać** |
| Poddanie się | **Poddaj się** (z potwierdzeniem) |
| Rewanż | **Zagraj ponownie** po końcu gry |
| Zmiana języka | przyciski **Polski / English** u góry (zapamiętywane) |
| Samouczek | przycisk **❓ Jak grać** u góry; otwiera się też sam przy pierwszej wizycie. Sześć krótkich kroków z animacjami (cel, łączenie, przejmowanie, pola zablokowane, koniec gry, wskazówki), po polsku i angielsku; działają strzałki i Esc |
| Przeciwnik komputerowy | **Przeciwnik: Komputer** przy tworzeniu gry, poziom **Łatwy** albo **Trudny**; komputer chwilę „myśli” przed każdym ruchem |
| Czat | przycisk 💬 w lewym dolnym rogu; Enter wysyła, Esc zamyka; do 200 znaków |
| Muzyka / efekty | przyciski 🎵 / 🔊 (zapamiętywane); dźwięki: postawienie kropki, przejęcie, koniec gry |
| Kopiowanie linku | **Kopiuj** w panelu oczekiwania albo **Kopiuj link** u góry |
| Zamknięcie gry | **⏻ Zamknij grę** (tylko w przeglądarce na komputerze z serwerem) |
| Odświeżenie strony | nie wyrzuca z gry: sesja jest zapamiętana w karcie |

Animacje (tło, efekty przejęć, fajerwerki) są wyłączone, jeśli system ma włączone „ogranicz ruch”. Na wąskich ekranach plansza dopasowuje się do szerokości okna (minimum ok. 16 px między przecięciami).

## 7. Zatrzymanie serwera

- **Najłatwiej:** kliknij **⏻ Zamknij grę** u góry strony (na komputerze, na którym działa serwer) i potwierdź. Serwer i tunel się wyłączą, okno konsoli zamknie się samo, karta przeglądarki też spróbuje się zamknąć (Chrome/Edge/Brave zwykle to robią dla kart otwartych przez `.bat`, Firefox i Safari zwykle nie), a przeciwnik zobaczy komunikat „Gra została zamknięta”.
- Alternatywnie w oknie konsoli naciśnij **Ctrl+C**.
- Zatrzymanie serwera **kończy wszystkie trwające gry** (pokoje są tylko w pamięci).

## 8. Rozwiązywanie problemów

| Problem | Rozwiązanie |
|---|---|
| `node` nie jest rozpoznawany | Zainstaluj Node.js, otwórz **nowy** terminal lub uruchom komputer ponownie. |
| `Port 3100 jest zajęty` (`EADDRINUSE`) | Gra już działa albo inny program zajmuje port. Zamknij ją (**⏻ Zamknij grę**) albo użyj innego portu: `PORT=3200 node server.js`. |
| Przeciwnik w domu nie może otworzyć adresu | Użyj adresu „w sieci lokalnej”, nie `localhost`; oba urządzenia w tej samej sieci; przy pytaniu zapory Windows zezwól Node.js w sieci prywatnej. |
| Brak adresu „w internecie” i kodu QR | Serwer działa bez tunelu: zamknij grę i uruchom **`uruchom.bat`** / `npm start`. Panel podpowiada, co zrobić. |
| „Nie znaleziono programu cloudflared” | Zgódź się na instalację przy starcie albo zainstaluj ręcznie (rozdz. 5). |
| „Nie możesz postawić kropki w polu otoczonym przez przeciwnika” / „zablokowane” | To pole jest już otoczone albo zablokowane po przejęciu (rozdz. 1). Wybierz inne. |
| „Ta gra już nie istnieje” | Serwer był restartowany (pokoje są w pamięci) albo pokój wygasł po 3 h bezczynności. Utwórz nową grę. |
| Brak dźwięku/muzyki | Kliknij cokolwiek na stronie (przeglądarki blokują dźwięk do pierwszej interakcji) i sprawdź 🎵 i 🔊. |
| Plansza nie mieści się na małym ekranie | Plansza zmniejsza odstępy do minimum; dla większej wygody wybierz mniejszy rozmiar. Można też przewijać planszę w poziomie. |
| Strona wygląda po staremu po aktualizacji | Odśwież bez pamięci podręcznej: **Ctrl+F5**. |
| „Zbyt wiele żądań” | Zadziałał limit zabezpieczeń. Odczekaj chwilę. |

## 9. Ustawienia i zabezpieczenia

| Ustawienie | Działanie |
|---|---|
| `PORT` | port serwera (domyślnie 3100) |
| `--tunnel` / `TUNNEL=1` | uruchom tunel Cloudflare |
| `--open` / `OPEN_BROWSER=1` | po starcie otwórz grę w przeglądarce |
| `--yes` / `CLOUDFLARED_AUTO_INSTALL=1` | zainstaluj cloudflared bez pytania |
| `CLOUDFLARED` | pełna ścieżka do programu `cloudflared` |

Rozmiary plansz zmienisz w `server.js` (stała `SIZES`), a limity w obiekcie `LIMITS`.

- **Komputer gra według tych samych zasad:** działa na serwerze i stawia kropki tą samą, sprawdzaną drogą co ruch człowieka, a widzi tylko planszę, jak człowiek. Jego token nigdy nie trafia do przeglądarki.
- **Serwer rozstrzyga o wszystkim:** każdy ruch jest sprawdzany na serwerze przez silnik gry; klient niczego nie może oszukać. Silnik (`engine.js`) nie jest udostępniany przeglądarkom.
- **Kod pokoju 6-literowy**, limit prób dołączenia (12/min na IP), limit zakładania pokoi (10/10 min na IP), max 300 pokoi, limit żądań (600/min na IP), limit ruchów (8/s na gracza), limit połączeń na żywo; pokoje wygasają po 3 h bezczynności.
- **Czat:** do 200 znaków, 6 wiadomości na 10 s, tylko zwykły tekst (bez HTML), usuwane znaki sterujące i niewidoczne.
- **Nagłówki bezpieczeństwa:** Content-Security-Policy (tylko własne skrypty), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`.
- **Za tunelem** prawdziwy adres klienta jest brany z nagłówka Cloudflare tylko dla połączeń z tego komputera; adresy sieci domowej widzi tylko gospodarz.
- **Przycisk zamykania:** żądanie wyłączenia przyjmowane tylko z komputera z serwerem, z tajnym tokenem widocznym wyłącznie dla lokalnej przeglądarki i tylko ze strony samej gry.
- **Brak kont i haseł:** kto zna kod pokoju, może dołączyć jako drugi gracz. Nie wystawiaj gry do internetu inaczej niż przez tunel (HTTPS).

## 10. Testy

```
cd Dots
npm test                 # = node engine.test.js && node bot.test.js && node test.js
```
- `bot.test.js` (10 testów): przeciwnik komputerowy: każda decyzja to legalny ruch, szybkość (najwyżej ok. 0,1 s), trudny zamyka pętlę i przejmuje, gdy może, oraz zagradza pole, w którym rywal by przejął, łatwy zwykle przejmuje, ale rzadko się broni, trudny wygrywa z łatwym w 12 z 12 partii (ustalone ziarna), determinizm i odpowiedź na propozycję zakończenia gry.
- `engine.test.js` (11 testów): reguły gry: przejęcie rombem, luka w pętli, blokowanie obszaru, brzeg planszy, zakaz samobójstwa i jego wyjątek, koniec gry oraz 12 losowych partii ze sprawdzaniem niezmienników.
- `test.js` (64 testy): serwer przez HTTP: pokoje i rozmiary, pokój z komputerem (natychmiastowy start, brak czatu, komputer rusza sam, odpowiada na propozycje zakończenia, rewanż), ruchy i walidacja, przejęcie, propozycje zakończenia, poddanie, remis, rewanż, koniec przez brak ruchów, long-polling, czat, limity, zabezpieczenia, zamykanie oraz tłumaczenia i samouczek.

## 11. Budowa projektu (dla programistów)

```
Dots/
├── engine.js              silnik gry (czyste funkcje): przejęcia, blokady, samobójstwo, koniec gry
├── bot.js                 przeciwnik komputerowy (po stronie serwera): ocenia każdy ruch silnikiem, na poziomie trudnym patrzy dwa ruchy w przód
├── bot.test.js            testy przeciwnika komputerowego
├── engine.test.js         testy silnika
├── server.js              serwer HTTP: pokoje, kolejka, limity, tunel, zamykanie (bez zależności)
├── test.js                test integracyjny serwera
├── package.json           skrypty: start, local, test
├── uruchom.bat            główny start (Windows): cloudflared → tunel → gra → przeglądarka
├── uruchom-bez-tunelu.bat start bez tunelu, tylko sieć domowa (Windows)
└── public/                pliki przeglądarkowe
    ├── index.html, style.css
    ├── app.js             logika klienta: ekrany, transport, czat, oferty, dźwięki gry
    ├── board.js           plansza na canvasie: rysowanie, kliknięcia, efekty przejęć
    ├── i18n.js            tłumaczenia PL/EN
    ├── tutorial.js        samouczek w grze: kroki i animacje
    ├── music.js, sky.js   muzyka ambient i animowane niebo z konstelacjami
    ├── fireworks.js       fajerwerki zwycięzcy
    └── vendor/qrcode.js   generator kodów QR (qrcode-generator, MIT, bez zmian)
```

**Przeciwnik komputerowy (`bot.js`).** Silnik potrafi tanio sprawdzić każdy ruch (`tryMove` zwraca nową planszę i przejęte kropki), więc komputer ocenia każde puste pole przy kropkach: ile kropek ten ruch przejmie, ile kropek przejąłby tam przeciwnik (zajęcie pola zagradza mu pętlę) i trochę za kształt (sąsiedzi własnych kropek). Poziom **trudny** patrzy dla najlepszych kandydatów jeszcze jeden ruch dalej: odejmuje to, co przeciwnik mógłby przejąć w odpowiedzi, i nagradza stworzenie dwóch różnych gróźb przejęcia naraz (przeciwnik zagrodzi tylko jedną). Poziom **łatwy** przejmuje, gdy widzi przejęcie (w ok. 80% ruchów), a w przeciwnym razie stawia kropkę przy innych kropkach i się nie broni.

**Jak to działa.** Serwer trzyma stan pokoi w pamięci. Klient wysyła ruchy zwykłymi żądaniami POST i odbiera zmiany strumieniem **SSE** (a gdy strumień nie dociera, np. przez tunel, przełącza się na **long-polling**). Wynik pętli (otoczenie) liczony jest przez wypełnianie z zewnątrz planszy w 4 kierunkach z omijaniem żywych kropek danego koloru: pola, do których nie da się dojść, są otoczone.

**Interfejs HTTP:**

| Metoda i adres | Opis |
|---|---|
| `POST /api/create` (`{size: s/m/l, vs: friend/bot, level: easy/hard}`), `/api/join` | założenie pokoju i dołączenie (kod → token gracza) |
| `POST /api/move` (`{x, y}`) | postawienie kropki |
| `POST /api/offer` (`{action: offer/accept/reject/cancel}`), `/api/resign`, `/api/rematch` | zakończenie za zgodą, poddanie, rewanż |
| `POST /api/chat` | wiadomość czatu |
| `POST /api/shutdown` | wyłączenie serwera i tunelu (tylko z lokalnego komputera, z tajnym tokenem) |
| `GET /api/events` / `/api/poll` / `/api/state` | stan na żywo (SSE) / zapasowy long-polling / jednorazowy odczyt |
| `GET /api/info` | adres tunelu, adresy sieci lokalnej, rozmiary, token zamykania (tylko dla lokalnej przeglądarki) |

Błędy mają postać `{ "code": "…", "error": "…" }`; klient tłumaczy kod na wybrany język.

## Licencja

Projekt jest udostępniony na licencji **MIT** (zobacz [LICENSE](../LICENSE)). Dołączona biblioteka kodów QR ma własną licencję MIT: zobacz [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
