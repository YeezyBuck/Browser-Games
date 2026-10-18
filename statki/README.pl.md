# ⚓ Statki – gra w statki dla dwóch osób w przeglądarce

🇬🇧 [English version](README.md)

Klasyczna gra w statki dla **dwóch graczy**: w sieci domowej albo **przez internet**. Gra ma wbudowany czat, polski i angielski interfejs, animowane tło z walczącymi statkami pirackimi, muzykę oraz dźwięki *boom* (trafienie) i *plusk* (pudło).

Nie wymaga instalowania żadnych bibliotek: wystarczy **Node.js**. Serwer jest „sędzią” gry i nigdy nie wysyła przeciwnikowi pozycji Twoich statków.

---

## Spis treści
1. [Co jest potrzebne](#1-co-jest-potrzebne)
2. [Instalacja krok po kroku](#2-instalacja-krok-po-kroku)
3. [Uruchomienie serwera](#3-uruchomienie-serwera)
4. [Jak zagrać – krok po kroku](#4-jak-zagrać--krok-po-kroku)
5. [Gra przez internet (tunel Cloudflare)](#5-gra-przez-internet-tunel-cloudflare)
6. [Zasady gry](#6-zasady-gry)
7. [Sterowanie i funkcje](#7-sterowanie-i-funkcje)
8. [Zatrzymanie serwera](#8-zatrzymanie-serwera)
9. [Rozwiązywanie problemów](#9-rozwiązywanie-problemów)
10. [Ustawienia i zabezpieczenia](#10-ustawienia-i-zabezpieczenia)
11. [Testy](#11-testy)
12. [Budowa projektu (dla programistów)](#12-budowa-projektu-dla-programistów)

---

## 1. Co jest potrzebne

| Element | Do czego | Obowiązkowe? |
|---|---|---|
| **Node.js 18 lub nowszy** | uruchamia serwer gry | tak |
| Nowoczesna przeglądarka (Chrome, Edge, Firefox, Safari) | gra działa w przeglądarce, u obu graczy | tak |
| **cloudflared** (program Cloudflare) | tunel do gry przez internet | tylko do gry przez internet |

Konta (Cloudflare, GitHub itp.) nie są potrzebne. Gra działa na Windows, macOS i Linuksie; dołączone pliki `.bat` są dla Windows.

## 2. Instalacja krok po kroku

1. **Zainstaluj Node.js.** Pobierz wersję LTS ze strony <https://nodejs.org> i zainstaluj z ustawieniami domyślnymi.
2. **Sprawdź instalację.** Otwórz terminal (Windows: PowerShell lub Wiersz polecenia) i wpisz:
   ```
   node --version
   ```
   Powinien pojawić się numer wersji, np. `v22.11.0`. Jeśli jest błąd „nie rozpoznano polecenia”, zamknij terminal, otwórz go ponownie lub uruchom komputer ponownie (zmienił się PATH).
3. **Pobierz grę.**
   - przez git: `git clone https://github.com/YeezyBuck/Development.git`, a gra jest w folderze `Development/statki`,
   - albo pobierz repozytorium jako ZIP z GitHuba i rozpakuj.
4. *(Tylko do gry przez internet)* **zainstaluj cloudflared**, opisane w [rozdziale 5](#5-gra-przez-internet-tunel-cloudflare).

Samej gry nie trzeba „instalować” ani budować: nie ma `npm install`.

## 3. Uruchomienie serwera

Wybierz jedną z dróg. Po starcie w konsoli pojawi się adres gry.

### Windows – dwuklik (najłatwiej)
- **`uruchom.bat`**: gra tylko w sieci domowej.
- **`uruchom-tunel.bat`**: gra w sieci domowej **i przez internet** (wymaga cloudflared).

Otworzy się okno konsoli: **nie zamykaj go podczas gry**. Jeśli Node.js nie jest w PATH, pliki `.bat` próbują użyć `C:\Program Files\nodejs\node.exe`.

### Terminal (Windows, macOS, Linux)
```
cd statki
node server.js            # tylko sieć domowa
node server.js --tunnel   # z tunelem Cloudflare (gra przez internet)
```
Skróty `npm`: `npm start` (bez tunelu) i `npm run tunnel` (z tunelem).

### Co zobaczysz w konsoli
```
Statki działają: http://localhost:3000
  w sieci lokalnej: http://192.168.1.50:3000
```
- `http://localhost:3000`: adres dla osoby, która uruchomiła serwer (ten sam komputer),
- adres „w sieci lokalnej”: dla innych urządzeń w tej samej sieci Wi-Fi/LAN.

Inny port: `PORT=8080 node server.js` (Windows PowerShell: `$env:PORT=8080; node server.js`).

## 4. Jak zagrać – krok po kroku

Potrzebujesz dwóch osób (albo dwóch kart przeglądarki do wypróbowania w pojedynkę).

### Gracz 1 – zakłada grę
1. Otwórz w przeglądarce adres z konsoli (`http://localhost:3000`).
2. *(Opcjonalnie)* wybierz język przyciskami **Polski / English** u góry.
3. Kliknij **Utwórz grę**. Pojawi się **6-literowy kod gry** i gotowe linki do przekazania przeciwnikowi:
   - 🌐 **Przeciwnik w internecie**, widoczny, gdy działa tunel,
   - 🏠 **Przeciwnik w tej samej sieci Wi-Fi/LAN**.
4. Wyślij znajomemu odpowiedni link (przycisk **Kopiuj**) i poczekaj, aż dołączy.

### Gracz 2 – dołącza
- otwórz link od gracza 1 (kod wpisze się sam), **albo**
- otwórz adres gry, wpisz 6-literowy kod w polu **Dołącz do gry** i kliknij **Dołącz**.

### Ustawianie statków (obaj gracze)
1. Z listy „Twoja flota” wybierz statek (domyślnie najdłuższy).
2. Kliknij pole na planszy, aby go postawić. **Obróć (R)** zmienia poziomo/pionowo.
3. Kliknij już postawiony statek, aby go zdjąć. **Losowo** ustawia całą flotę za Ciebie, **Wyczyść** usuwa wszystko.
4. Gdy stoi 10 statków, kliknij **Gotowe**. Gra zaczyna się, gdy obaj gracze są gotowi; zaczyna losowo wybrany gracz.

Flota: **1 × czteromasztowiec, 2 × trójmasztowce, 3 × dwumasztowce, 4 × jednomasztowce.** Statki nie mogą się stykać, także rogami.

### Rozgrywka
- Masz **dwie plansze**: *Twoja plansza* (Twoje statki i strzały przeciwnika) oraz *Plansza przeciwnika* (tu strzelasz).
- Gdy jest **Twoja kolej**, kliknij pole na planszy przeciwnika. Słychać **boom** przy trafieniu lub **plusk** przy pudle.
- **Każdy gracz oddaje jeden strzał, potem kolej przeciwnika** (także po trafieniu).
- Znaczniki: ✕ trafienie, kropka pudło. Wokół zatopionego statku pola zaznaczają się same jako woda.
- Licznik „Statki przeciwnika: X/10” pokazuje, ile mu zostało.
- **Wygrywa ten, kto pierwszy zatopi wszystkie statki przeciwnika.**
- Po końcu pokazuje się plansza przeciwnika. **Zagraj ponownie**: oboje klikają przycisk, a plansze się zerują.

## 5. Gra przez internet (tunel Cloudflare)

Gdy przeciwnik jest poza Twoją siecią domową, użyj tunelu. Nie trzeba konta ani ustawiania routera.

### Jednorazowa instalacja cloudflared
- **Windows:** w PowerShellu `winget install Cloudflare.cloudflared`
- **macOS:** `brew install cloudflared`
- **Linux:** instrukcja pod <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>

Po instalacji otwórz nowe okno terminala. (Serwer sam sprawdza też typowe foldery instalacji Windows.)

### Uruchomienie
1. Uruchom **`uruchom-tunel.bat`** (Windows) albo `npm run tunnel`.
2. Poczekaj kilka sekund. W konsoli pojawi się ramka:
   ```
   ==================================================================
     GRA PRZEZ INTERNET – przekaż przeciwnikowi ten adres:

         https://cos-losowego.trycloudflare.com
   ==================================================================
   ```
3. Otwórz grę u siebie, kliknij **Utwórz grę**. W panelu zobaczysz **🌐 Przeciwnik w internecie – wyślij ten adres**, czyli link z kodem pokoju.
4. Skopiuj go (**Kopiuj**) i wyślij znajomemu. Gdy go otworzy, od razu jest w Twojej grze.

### Dobrze wiedzieć
- **Który adres komu?** 🌐 adres tunelu dla osób spoza Twojej sieci, 🏠 adres sieci lokalnej dla domowników.
- Adres tunelu jest **tymczasowy**, zmienia się przy każdym uruchomieniu tunelu. Komputer z serwerem musi być **włączony** przez cały czas gry.
- Darmowy tunel nie przepuszcza strumienia na żywo (SSE). Gra po ok. 3 s **sama przełącza się na zapasowy transport** (long-polling). Dla graczy jest to niewidoczne.
- Każdy, kto zna link **i** kod, może dołączyć jako drugi gracz, więc nie publikuj go w sieci.
- Tunel „quick” jest przeznaczony do wypróbowania i nie ma gwarancji dostępności.

## 6. Zasady gry

- Plansza 10 × 10, kolumny A–J, wiersze 1–10.
- Statki nie mogą się stykać (także po przekątnej). Ustawienie w kodzie: `ALLOW_TOUCHING`.
- Jeden strzał na kolejkę. Ustawienie w kodzie: `KEEP_TURN_ON_HIT` (`true` = po trafieniu strzelasz dalej).
- Kto zaczyna, jest losowane. Kolejne gry po „Zagraj ponownie” też losują zaczynającego.
- Nie można strzelać dwa razy w to samo pole.

## 7. Sterowanie i funkcje

| Funkcja | Jak |
|---|---|
| Zmiana języka | przyciski **Polski / English** u góry; wybór jest zapamiętywany (domyślnie wg języka przeglądarki) |
| Czat | przycisk 💬 w lewym dolnym rogu (po dołączeniu przeciwnika); Enter wysyła, Esc zamyka; czerwona odznaka = nieprzeczytane; do 200 znaków |
| Muzyka | przycisk 🎵 wycisza/włącza; startuje po pierwszym kliknięciu na stronie (wymóg przeglądarek) |
| Efekty dźwiękowe (boom, plusk, sygnał czatu) | przycisk 🔊 |
| Obrót statku | przycisk **Obróć** albo klawisz **R** |
| Kopiowanie linku | przycisk **Kopiuj** w panelu oczekiwania albo **Kopiuj link** u góry |
| Odświeżenie strony | nie wyrzuca z gry: sesja jest zapamiętana w karcie przeglądarki |

Gra pamięta wybór języka i wyciszenia w przeglądarce. Tło ma wyłączone animacje, jeśli system ma włączone „ogranicz ruch”.

## 8. Zatrzymanie serwera

- Uruchomiony przez `.bat` lub w terminalu: w oknie konsoli naciśnij **Ctrl+C** (albo zamknij okno).
- Zatrzymanie serwera **kończy wszystkie trwające gry** (pokoje są tylko w pamięci), a tunel zamyka się razem z nim.

## 9. Rozwiązywanie problemów

| Problem | Rozwiązanie |
|---|---|
| `node` nie jest rozpoznawany | Zainstaluj Node.js ([rozdz. 2](#2-instalacja-krok-po-kroku)), otwórz **nowy** terminal lub uruchom komputer ponownie. |
| `EADDRINUSE` (port zajęty) | Inny program (albo druga kopia gry) używa portu 3000. Zamknij ją albo uruchom na innym porcie: `PORT=3001 node server.js`. |
| Przeciwnik w domu nie może otworzyć adresu | Użyj adresu „w sieci lokalnej”, nie `localhost`. Oba urządzenia muszą być w tej samej sieci. Przy pytaniu zapory Windows zezwól Node.js w sieci prywatnej. |
| Brak adresu „w internecie” w panelu | Serwer nie ma tunelu: uruchom **`uruchom-tunel.bat`** / `npm run tunnel`. Panel podpowiada, co zrobić (np. „tunel się uruchamia”, „zainstaluj cloudflared”). |
| „Nie znaleziono programu cloudflared” | Zainstaluj go ([rozdz. 5](#5-gra-przez-internet-tunel-cloudflare)) i uruchom serwer ponownie. |
| Adres tunelu przestał działać | Tunel albo serwer został zatrzymany. Uruchom ponownie: dostaniesz **nowy** adres. Utwórz nową grę. |
| „Ta gra już nie istnieje” | Serwer był restartowany (pokoje są w pamięci) albo pokój wygasł po 3 h bezczynności. Utwórz nową grę. |
| Brak dźwięku/muzyki | Kliknij cokolwiek na stronie (przeglądarki blokują dźwięk do pierwszej interakcji) i sprawdź przyciski 🎵 i 🔊. |
| Ruchy przeciwnika pojawiają się z opóźnieniem ok. 3 s po wejściu przez tunel | To normalne: przełączenie na zapasowy transport. Dalsze aktualizacje są od razu. |
| „Zbyt wiele żądań” | Zadziałał limit zabezpieczeń (np. dużo prób dołączenia). Odczekaj minutę. |
| Strona wygląda po staremu po aktualizacji | Odśwież bez pamięci podręcznej: **Ctrl+F5**. |

## 10. Ustawienia i zabezpieczenia

### Zmienne środowiskowe i flagi
| Ustawienie | Działanie |
|---|---|
| `PORT` | port serwera (domyślnie 3000) |
| `--tunnel` lub `TUNNEL=1` | uruchom tunel Cloudflare |
| `CLOUDFLARED` | pełna ścieżka do programu `cloudflared`, jeśli nie ma go w PATH |

Stałe w `server.js`: `KEEP_TURN_ON_HIT`, `ALLOW_TOUCHING`, `CODE_LEN` (długość kodu, domyślnie 6) oraz obiekt `LIMITS`.

### Zabezpieczenia
- **Kod pokoju: 6 liter** (ok. 190 mln kombinacji) i limit prób dołączenia (12/min na adres IP).
- **Limity na adres IP:** 600 żądań/min, 10 nowych pokoi na 10 min, 8 połączeń na żywo; maks. 300 pokoi na serwerze; pokoje wygasają po 3 h bezczynności.
- **Czat:** do 200 znaków, 6 wiadomości na 10 s, treść jako zwykły tekst (bez HTML), usuwane znaki sterujące i niewidoczne.
- **Serwer rozstrzyga o wszystkim:** pozycje statków poznasz dopiero po końcu gry; wszystkie ruchy są walidowane po stronie serwera.
- **Nagłówki bezpieczeństwa:** Content-Security-Policy (tylko własne skrypty), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`.
- **Za tunelem** prawdziwy adres klienta jest brany z nagłówka Cloudflare tylko dla połączeń z tego komputera. Adresy sieci domowej widzi tylko gospodarz.
- Tokeny graczy są porównywane w stałym czasie; żądania mają limit rozmiaru i czasu.
- **Brak kont i haseł:** kto zna kod pokoju, może dołączyć jako drugi gracz. Nie wystawiaj gry do internetu inaczej niż przez tunel (HTTPS).

## 11. Testy

```
cd statki
node test.js        # albo: npm test
```
Test uruchamia serwer na wolnym porcie i rozgrywa pełną partię dwoma „graczami” przez HTTP. Sprawdza m.in.: walidację floty, kolejkę, ukrywanie statków, rewanż, czat, limity, long-polling i tunel (z atrapą programu). Na końcu: `Wszystkie testy przeszły (N)`.

## 12. Budowa projektu (dla programistów)

```
statki/
├── server.js            serwer HTTP: reguły gry, pokoje, limity, tunel (bez zależności)
├── test.js              test integracyjny (node test.js)
├── package.json         skrypty: start, tunnel, test
├── uruchom.bat          start serwera (Windows)
├── uruchom-tunel.bat    start serwera z tunelem Cloudflare (Windows)
└── public/              pliki przeglądarkowe
    ├── index.html       szkielet strony
    ├── style.css        wygląd
    ├── app.js           logika klienta: ekrany, plansze, czat, transport
    ├── i18n.js          tłumaczenia PL/EN
    ├── music.js         muzyka generowana w Web Audio
    └── sea.js           animowane tło (morze, statki piratów)
```

**Jak to działa.** Serwer trzyma stan pokoi w pamięci i jest jedynym źródłem prawdy. Klient wysyła polecenia zwykłymi żądaniami POST, a zmiany stanu odbiera strumieniem **SSE**. Jeśli strumień nie dociera w 3 s (np. tunel), przełącza się na **long-polling** (`/api/poll`). Każdy gracz dostaje tylko swój widok stanu.

**Interfejs HTTP:**

| Metoda i adres | Opis |
|---|---|
| `POST /api/create`, `/api/join` | założenie pokoju i dołączenie (kod → token gracza) |
| `POST /api/place`, `/api/shoot`, `/api/rematch` | ustawienie floty, strzał, rewanż |
| `POST /api/chat` | wiadomość czatu |
| `GET /api/events` | strumień stanu na żywo (SSE) |
| `GET /api/poll` | zapasowy transport: long-polling |
| `GET /api/state` | jednorazowy odczyt stanu |
| `GET /api/info` | adres tunelu, adresy sieci lokalnej (tylko dla gospodarza), długość kodu |

Błędy mają postać `{ "code": "…", "error": "…" }`; klient tłumaczy kod na wybrany język.
