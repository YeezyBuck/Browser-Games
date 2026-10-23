# 🧲 Magnesy – gra dla dwóch osób w przeglądarce

🇬🇧 [English version](README.md)

Gra na nerwy i magnetyzm dla **dwóch osób**: w sieci domowej albo **przez internet**. Każdy ma **10 nieregularnych magnesów**, a pole jest niewielkie. Na zmianę stawiacie **po jednym magnesie**, ale magnesy się przyciągają i odpychają. Gdy po uspokojeniu magnesy się **połączą**, cała grupa **wraca do ręki gracza, który to wywołał**, także magnesy przeciwnika. **Wygrywa ten, kto pierwszy pozbędzie się wszystkich swoich magnesów.** W grze są: czat, kod QR do dołączania z telefonu, interfejs po polsku i angielsku, stalowa płyta z delikatnym tłem z linii pola magnetycznego, spokojna „laboratoryjna” muzyka, efekty dźwiękowe i fajerwerki dla zwycięzcy.

Nie trzeba instalować żadnych bibliotek: wystarczy **Node.js**. Serwer jest sędzią: liczy fizykę każdego postawionego magnesu, wykrywa połączone grupy i przekazuje wynik obu graczom. Gra powstała na bazie [WarShips](../WarShips/README.pl.md), [Dots](../Dots/README.pl.md) i [CapRace](../CapRace/README.pl.md) i korzysta z ich infrastruktury (pokoje, tunel Cloudflare, czat, zabezpieczenia).

<p align="center">
  <img src="../docs/screenshots/magnets-aim.jpg" width="48%" alt="Magnesy: stawianie magnesu przy magnesie przeciwnika, z liniami sił i ostrzeżeniem">
  <img src="../docs/screenshots/magnets-win.jpg" width="48%" alt="Magnesy: zwycięzca z pustą ręką i fajerwerki">
</p>
<p align="center">
  <img src="../docs/screenshots/magnets-tutorial.jpg" width="48%" alt="Magnesy: samouczek w grze z mapą bezpiecznych miejsc">
  <img src="../docs/screenshots/magnets-mobile.jpg" width="22%" alt="Magnesy na telefonie">
</p>

---

## Spis treści
1. [Zasady gry](#1-zasady-gry)
2. [Czego potrzebujesz i instalacja](#2-czego-potrzebujesz-i-instalacja)
3. [Uruchomienie serwera](#3-uruchomienie-serwera)
4. [Jak grać, krok po kroku](#4-jak-grać-krok-po-kroku)
5. [Gra przez internet (tunel Cloudflare i kod QR)](#5-gra-przez-internet-tunel-cloudflare-i-kod-qr)
6. [Sterowanie i funkcje](#6-sterowanie-i-funkcje)
7. [Zatrzymanie serwera](#7-zatrzymanie-serwera)
8. [Rozwiązywanie problemów](#8-rozwiązywanie-problemów)
9. [Ustawienia i bezpieczeństwo](#9-ustawienia-i-bezpieczeństwo)
10. [Testy](#10-testy)
11. [Struktura projektu (dla programistów)](#11-struktura-projektu-dla-programistów)

---

## 1. Zasady gry

- Dwóch graczy, po **10 magnesów**. Kształty są nieregularne (2-3 złączone krążki), **obaj gracze dostają te same dziesięć kształtów**, a w każdej grze są losowane od nowa. Każdy magnes ma **czerwony biegun N** i **niebieski biegun S**. **Bieguny różne się przyciągają, jednakowe odpychają**, a im bliżej, tym mocniej.
- **Pole** to stalowa płyta (wybierana przy tworzeniu gry): **małe** 460×290 (trudniejsze), **średnie** 540×340 albo **duże** 640×400 (łatwiejsze). Stół ma **tarcie**: magnes, który leży dość daleko od innych, stoi spokojnie. Gdy postawisz go bliżej, zaczyna się przesuwać, obracać i przyciągać do sąsiadów.
- **Ruch.** W swojej kolejce wybierasz magnes z ręki, ustawiasz jego miejsce i obrót i go stawiasz. Nie można stawiać na innych magnesach ani tuż przy bandzie. Potem wszystkie magnesy poruszają się, aż się uspokoją (najwyżej kilka sekund).
- **Połączenia.** Po uspokojeniu magnesy, które się **dotykają**, są połączone. **Każda** połączona grupa (także magnesy przeciwnika w niej) schodzi z pola i **trafia do ręki gracza, który to wywołał**. Jeśli po zdjęciu grupy inne magnesy mogą się ruszyć, ruszają i ewentualne nowe połączenia wracają w ten sam sposób.
- **Wygrywa** ten, kto **pierwszy pozbędzie się wszystkich magnesów** (pusta ręka po jego ruchu). Jeśli Twój ostatni magnes się połączy, wraca do ręki i gra toczy się dalej.
- Po **40 ruchach każdego gracza** albo gdy następny gracz nie ma już gdzie postawić magnesu, wygrywa ten, kto ma **mniej magnesów w ręku** (przy równej liczbie remis). Można się też **poddać**.
- Po grze możecie zagrać **rewanż**: nowe kształty, puste pole, a zaczyna drugi gracz.

## 2. Czego potrzebujesz i instalacja

| Element | Do czego | Wymagany? |
|---|---|---|
| **Node.js 18 lub nowszy** | uruchamia serwer gry | tak |
| Nowoczesna przeglądarka (Chrome, Edge, Firefox, Safari, Brave) | gra działa w przeglądarce, u obu graczy; mysz albo ekran dotykowy | tak |
| **cloudflared** (program Cloudflare) | tunel do gry przez internet | tylko do gry przez internet; **instalacja jest automatyczna** (punkt 5) |

Nie są potrzebne żadne konta (Cloudflare, GitHub itp.). Gra działa na Windows, macOS i Linuksie; dołączone pliki `.bat` są dla Windows.

**Instalacja, krok po kroku:**
1. Zainstaluj Node.js: pobierz wersję LTS ze strony <https://nodejs.org> i zainstaluj z domyślnymi ustawieniami.
2. Sprawdź w terminalu: `node --version` (powinno wyświetlić np. `v22.11.0`). Jeśli system zgłasza, że polecenie nie jest rozpoznawane, zamknij i otwórz terminal ponownie albo uruchom komputer od nowa.
3. Pobierz repozytorium: `git clone https://github.com/YeezyBuck/Browser-Games.git` (gra jest w folderze `Magnets`) albo ściągnij ZIP z GitHuba i rozpakuj.

Gra nie wymaga instalacji ani budowania: nie ma `npm install`.

## 3. Uruchomienie serwera

Wybierz jedną z opcji. Po starcie w konsoli pojawia się adres gry. Domyślny port to **3300** (WarShips używa 3000, Dots 3100, a CapRace 3200, więc wszystkie gry mogą działać jednocześnie).

### Windows – dwuklik (najprościej)
- **`uruchom.bat`** (główny): sprawdza cloudflared (w razie potrzeby proponuje instalację), uruchamia tunel, a potem grę i przeglądarkę. Gra działa w sieci domowej **i przez internet**.
- **`uruchom-bez-tunelu.bat`**: tylko sieć domowa (bez cloudflared, bez linku i kodu QR do gry przez internet).

Otworzy się okno konsoli: **nie zamykaj go w trakcie gry**. Strona gry otworzy się sama w przeglądarce (`http://localhost:3300`). Na koniec użyj przycisku **⏻ Zamknij grę** (zobacz [punkt 7](#7-zatrzymanie-serwera)).

### Terminal (Windows, macOS, Linux)
```
cd Magnets
node server.js            # tylko sieć domowa
node server.js --tunnel   # z tunelem Cloudflare (gra przez internet)
node server.js --open     # dodatkowo otwiera grę w przeglądarce
```
Skróty `npm`: `npm start` (z tunelem i przeglądarką, jak `uruchom.bat`) i `npm run local` (bez tunelu). Inny port: `PORT=3400 node server.js` (PowerShell: `$env:PORT=3400; node server.js`).

## 4. Jak grać, krok po kroku

Potrzebne są dwie osoby (albo dwie karty przeglądarki, żeby spróbować samemu).

### Gracz 1 – tworzy grę
1. Otwórz stronę gry (`http://localhost:3300`) i, jeśli chcesz, wybierz język przyciskami **Polski / English**.
2. Wybierz **wielkość pola** i kliknij **Utwórz grę**. Pojawi się **6-literowy kod gry** oraz gotowe linki do przekazania przeciwnikowi (🌐 przez internet razem z kodem QR, 🏠 w sieci domowej).
3. Wyślij znajomemu odpowiedni link (**Kopiuj**) i poczekaj, aż dołączy.

### Gracz 2 – dołącza
Otwórz link od gracza 1 (kod wpisze się sam) albo otwórz stronę gry, wpisz kod w polu **Dołącz do gry** i kliknij **Dołącz**. Na telefonie możesz zeskanować kod QR.

### Rozgrywka
1. Gra zaczyna się zaraz po dołączeniu przeciwnika. U góry dwie karty pokazują, **ile magnesów każdy ma w ręku** i ile wykonał ruchów; świecąca karta pokazuje, **czyja jest kolej**. Pod polem jest Twoja **ręka**: małe obrazki Twoich magnesów.
2. W swojej kolejce **kliknij magnes w ręku**, potem **najedź myszą na pole**. Półprzezroczysty magnes idzie za kursorem. **Obracaj** go kółkiem myszy, klawiszami ← → (albo Q i E), prawym przyciskiem lub przyciskami ⟲ ⟳. Kliknij, żeby postawić.
3. Zanim postawisz, gra Ci pomaga: **zielone i czerwone linie** pokazują, jak bieguny Twojego magnesu działają na sąsiadów (przyciąganie i odpychanie), żółta strzałka pokazuje siłę działającą na Twój magnes, a napis nad polem mówi: **„Nic się nie ruszy”** (bezpieczne miejsce), **„Coś się poruszy”** (ryzykowne) albo **„Tu nie można postawić”**.
4. Po postawieniu wszyscy oglądają ruch magnesów (policzył go serwer), słyszą stuknięcia i „ding” sklejenia. Jeśli magnesy się połączyły, świecą, schodzą z pola i wracają do ręki gracza, który to wywołał.
5. Pozbądź się wszystkich magnesów jako pierwszy. Zwycięzca dostaje **fajerwerki** (przycisk 🎆 puszcza je ponownie). Kliknij **Zagraj ponownie** na rewanż (klikają obaj gracze).

Na ekranie dotykowym: dotknij pola i przeciągnij, magnes idzie za palcem (jest pokazywany tuż nad nim); puść palec, żeby go postawić. Jeśli miejsce jest niedozwolone, nic się nie dzieje i możesz spróbować jeszcze raz.

## 5. Gra przez internet (tunel Cloudflare i kod QR)

Jeśli przeciwnik jest poza Twoją siecią domową, użyj tunelu. Nie trzeba konta ani ustawień routera.

**Automatyczna instalacja cloudflared.** Przy starcie z tunelem (`uruchom.bat`, `npm start`) serwer sprawdza, czy cloudflared jest zainstalowany. Jeśli nie, proponuje instalację (Windows: `winget`, macOS: `brew`) i pyta w konsoli (Enter = tak). Z flagą `--yes` (albo `CLOUDFLARED_AUTO_INSTALL=1`) instaluje bez pytania. Bez interaktywnej konsoli (serwer w tle) niczego nie instaluje sam. Ręcznie: `winget install Cloudflare.cloudflared`, `brew install cloudflared` albo instrukcja na <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>.

**Kolejność startu:** `[1/3]` sprawdzenie cloudflared, `[2/3]` tunel i jego adres, `[3/3]` gra i przeglądarka. Jeśli tunel nie wystartuje, gra i tak uruchomi się w sieci domowej, a konsola pokaże powód.

Podczas czekania na przeciwnika gra pokazuje, **jaki adres komu przekazać**: 🌐 adres tunelu (`https://….trycloudflare.com/?room=KOD`) razem z **kodem QR**, który przeciwnik zeskanuje telefonem, oraz 🏠 adres w sieci domowej.

Warto wiedzieć: adres tunelu jest **tymczasowy** (za każdym razem inny), a komputer z serwerem musi pozostać **włączony**. Darmowy tunel nie przepuszcza strumieni na żywo (SSE), więc po ok. 3 s gra **sama przełącza się na transport zapasowy** (long-polling); gracze tego nie zauważą. Gra jest turowa, więc opóźnienia tunelu nie przeszkadzają: ruch liczy serwer i odtwarzają go oba ekrany. Dołączyć jako drugi gracz może każdy, kto zna link **i** kod.

## 6. Sterowanie i funkcje

| Funkcja | Jak |
|---|---|
| Wybór magnesu | kliknij go w ręku pod polem |
| Stawianie | najedź myszą na pole i kliknij (ekran dotykowy: przeciągnij i puść palec) |
| Obracanie | kółko myszy, ← → albo Q / E, prawy przycisk lub przyciski ⟲ ⟳ (kroki co 15°) |
| Podpowiedzi przed postawieniem | zielone/czerwone linie biegunów, żółta strzałka siły i napis „Nic się nie ruszy / Coś się poruszy / Tu nie można postawić” |
| Poddanie się | **Poddaj się** (z potwierdzeniem) |
| Rewanż | **Zagraj ponownie** po zakończeniu gry |
| Zmiana języka | przyciski **Polski / English** u góry (zapamiętywane) |
| Samouczek | przycisk **❓ Jak grać** u góry; otwiera się też sam przy pierwszej wizycie. Sześć krótkich kroków z animacjami (cel, bieguny, stawianie, połączenia, tury i koniec, wskazówki), po polsku i angielsku; cztery animacje liczy prawdziwy silnik gry (także mapę bezpiecznych miejsc); działają strzałki i Esc |
| Czat | przycisk 💬 w lewym dolnym rogu; Enter wysyła, Esc zamyka; do 200 znaków |
| Muzyka / efekty | przyciski 🎵 / 🔊 (zapamiętywane); muzyka: oryginalny, spokojny „laboratoryjny” kawałek generowany w przeglądarce (92 uderzenia na minutę); dźwięki: postawienie, stuknięcie magnesów, uderzenie w bandę, „ding” sklejenia, powrót magnesów, koniec gry |
| Kopiowanie linku | **Kopiuj** w panelu oczekiwania albo **Kopiuj link** u góry |
| Zamknięcie gry | **⏻ Zamknij grę** (tylko w przeglądarce na komputerze z serwerem) |
| Odświeżenie strony | nie wyrzuca z gry: sesja jest pamiętana w karcie |

Tło (delikatne linie pola magnetycznego) jest rysowane raz, bez animacji. Iskry są wyłączone, a ruch pokazywany od razu, gdy system ma włączone „ograniczenie ruchu”.

## 7. Zatrzymanie serwera

- **Najprościej:** kliknij **⏻ Zamknij grę** u góry strony (na komputerze, na którym działa serwer) i potwierdź. Serwer i tunel się wyłączą, okno konsoli się zamknie, karta przeglądarki też spróbuje się zamknąć (Chrome/Edge/Brave zwykle to potrafią dla kart otwartych przez plik `.bat`; Firefox i Safari zwykle nie), a przeciwnik zobaczy „Gra została zamknięta”.
- Ewentualnie naciśnij **Ctrl+C** w oknie konsoli.
- Zatrzymanie serwera **kończy wszystkie trwające gry** (pokoje są tylko w pamięci).

## 8. Rozwiązywanie problemów

| Problem | Rozwiązanie |
|---|---|
| `node` nie jest rozpoznawany | Zainstaluj Node.js, otwórz **nowy** terminal albo uruchom komputer ponownie. |
| `Port 3300 jest zajęty` (`EADDRINUSE`) | Gra już działa albo port zajmuje inny program. Zamknij ją (**⏻ Zamknij grę**) lub użyj innego portu: `PORT=3400 node server.js`. |
| Przeciwnik w domu nie może otworzyć adresu | Użyj adresu „w sieci lokalnej”, nie `localhost`; oba urządzenia w tej samej sieci; jeśli zapora Windows zapyta, zezwól Node.js w sieciach prywatnych. |
| Brak adresu „przez internet” i kodu QR | Serwer działa bez tunelu: zamknij grę i uruchom **`uruchom.bat`** / `npm start`. Panel podpowiada, co zrobić. |
| „Nie znaleziono cloudflared” | Zgódź się na instalację przy starcie albo zainstaluj ręcznie (punkt 5). |
| Nie mogę postawić magnesu | Musi być Twoja kolej (karta świeci, baner to mówi); wybierz magnes w ręku; poczekaj, aż poprzedni ruch się skończy; miejsce nie może być na innym magnesie ani tuż przy bandzie (napis mówi „Tu nie można postawić”). |
| Magnesy robią coś, czego się nie spodziewałem | Tak działa gra: po postawieniu magnesu pobliskie magnesy się przesuwają i obracają. Korzystaj z podpowiedzi (linie i napis) oraz z bezpiecznych miejsc. |
| „Ta gra już nie istnieje” | Serwer został zrestartowany (pokoje są w pamięci) albo pokój wygasł po 3 godzinach bezczynności. Utwórz nową grę. |
| Brak dźwięku lub muzyki | Kliknij cokolwiek na stronie (przeglądarki blokują dźwięk do pierwszej interakcji) i sprawdź 🎵 i 🔊. |
| Strona wygląda po staremu po aktualizacji | Odśwież bez pamięci podręcznej: **Ctrl+F5**. |
| „Zbyt wiele żądań” | Zadziałał limit bezpieczeństwa. Poczekaj chwilę. |

## 9. Ustawienia i bezpieczeństwo

| Ustawienie | Działanie |
|---|---|
| `PORT` | port serwera (domyślnie 3300) |
| `--tunnel` / `TUNNEL=1` | uruchom tunel Cloudflare |
| `--open` / `OPEN_BROWSER=1` | po starcie otwórz grę w domyślnej przeglądarce |
| `--yes` / `CLOUDFLARED_AUTO_INSTALL=1` | zainstaluj cloudflared bez pytania |
| `CLOUDFLARED` | pełna ścieżka do programu `cloudflared` |

Stałe fizyki (siła magnesów, tarcie, wielkości pól, liczba magnesów, limit ruchów) są w obiekcie `P` w `public/engine.js`, a limity serwera w obiekcie `LIMITS` w `server.js`.

- **Serwer decyduje o wszystkim:** liczy cały ruch po każdym postawionym magnesie i wykrywa połączone grupy; klient wysyła tylko numer magnesu, położenie i kąt, a wynik odtwarza, więc nie może oszukiwać. Każda liczba od klienta jest sprawdzana (tylko skończone liczby, magnes musi być w Twojej ręce, miejsce musi być wolne), a ruch przyjmowany jest tylko w Twojej kolejce i dopiero po zakończeniu poprzedniego ruchu magnesów.
- **6-literowy kod pokoju**, limit prób dołączenia (12/min na IP), limit zakładania pokoi (10 na 10 min na IP), maks. 300 pokoi, limit żądań (600/min na IP), limit ruchów (3/s na gracza), limit połączeń na żywo; pokoje wygasają po 3 godzinach bezczynności.
- **Czat:** do 200 znaków, 6 wiadomości na 10 s, tylko zwykły tekst (bez HTML), znaki sterujące i niewidoczne usuwane.
- **Nagłówki bezpieczeństwa:** Content-Security-Policy (tylko własne skrypty), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`.
- **Za tunelem** prawdziwy adres klienta bierzemy z nagłówka Cloudflare tylko dla połączeń z tego komputera; adresy sieci domowej widzi tylko gospodarz.
- **Przycisk zamknięcia:** żądanie wyłączenia serwera przyjmujemy tylko z komputera z serwerem, z tajnym tokenem widocznym wyłącznie dla lokalnej przeglądarki i tylko z własnej strony gry.
- **Brak kont i haseł:** każdy, kto zna kod pokoju, może dołączyć jako drugi gracz. Nie wystawiaj gry do internetu inaczej niż przez tunel (HTTPS).
- **Uwaga:** `public/engine.js` jest serwowany przeglądarkom celowo (klient rysuje magnesy z seeda i pokazuje podpowiedzi tą samą fizyką). Nie zawiera żadnych sekretów: serwer nigdy nie ufa obliczeniom klienta. Ręce obu graczy są jawne z założenia (kształty są te same u obu).

## 10. Testy

```
cd Magnets
npm test                 # = node engine.test.js && node test.js
```
- `engine.test.js` (29 testów): silnik: kształty (2000 losowych kształtów jest poprawnych, zwartych, wyważonych, z biegunami N/S wewnątrz bryły), stawianie (pole, banda, odstęp, błędne liczby), siły (trzecia zasada dynamiki, niezmienniczość przy przesunięciu), zasięg przyciągania, tarcie trzymające odległe magnesy, odpychanie, wykrywanie połączonych grup, zwroty wraz z magnesami przeciwnika, determinizm oraz 14 losowych pełnych partii (brak NaN, magnesy zostają w polu i nie wchodzą głęboko w siebie, żaden nie ginie ani się nie dubluje, czas i rozmiar danych).
- `test.js` (62 testy): serwer przez HTTP: pokoje i wielkości pola, walidacja ruchów, stawianie, połączenia i zwroty do ręki, wygrana z pustą ręką, limit ruchów, zablokowane pole, poddanie się, rewanż, long-polling, czat, limity, zabezpieczenia, zamykanie oraz tłumaczenia i samouczek.

## 11. Struktura projektu (dla programistów)

```
Magnets/
├── engine.test.js         testy silnika
├── server.js              serwer HTTP: pokoje, kolejka, ręce, limity, tunel, zamykanie (bez zależności)
├── test.js                test integracyjny serwera
├── package.json           skrypty: start, local, test
├── uruchom.bat            główny start (Windows): cloudflared → tunel → gra → przeglądarka
├── uruchom-bez-tunelu.bat start bez tunelu, tylko sieć domowa (Windows)
└── public/                pliki dla przeglądarki (i wspólny silnik)
    ├── engine.js          silnik używany PRZEZ SERWER I PRZEGLĄDARKĘ: kształty, siły, zderzenia, połączenia, cały ruch
    ├── index.html, style.css
    ├── app.js             logika klienta: ekrany, transport, czat, ręka, odtwarzanie ruchu, dźwięki gry
    ├── board.js           pole na canvasie: stalowa płyta, magnesy, duch z podpowiedziami, odtwarzanie, mysz/dotyk
    ├── i18n.js            tłumaczenia PL/EN
    ├── tutorial.js        samouczek w grze: kroki i animacje (cztery korzystają z prawdziwego silnika)
    ├── music.js, field.js spokojna generowana muzyka i tło z linii pola magnetycznego
    ├── fireworks.js       fajerwerki zwycięzcy
    └── vendor/qrcode.js   generator kodów QR (qrcode-generator, MIT, dołączony bez zmian)
```

**Jak to działa.** Magnes to bryła sztywna z 2-3 krążków (masa proporcjonalna do pola) z dwoma punktowymi biegunami o przeciwnych ładunkach. Między biegunami każdej pary magnesów działa siła `K·q₁·q₂ / (d² + ε²)` (przyciąganie dla przeciwnych znaków), która daje też moment obrotowy. Stół ma tarcie suche: magnes w spoczynku rusza dopiero wtedy, gdy jego przyspieszenie przekroczy próg, więc odległe magnesy leżą spokojnie. Symulacja działa w 240 krokach na sekundę, ze zderzeniami impulsowymi (sprężystość, tarcie styczne) i bandami. Faza kończy się, gdy wszystko ucichnie (drobne drgania już połączonych magnesów się nie liczą). Wtedy serwer znajduje grupy **dotykających się** magnesów, odsyła je wszystkie do ręki gracza, który je wywołał, i liczy ruch pozostałych od nowa (do pięciu rund). Serwer wysyła stan pokoju z **seedem** (klient odtwarza te same kształty), a po ruchu **fazy** z klatkami (30 na sekundę, tylko dla magnesów, które się ruszyły) i zdarzeniami dźwiękowymi; klienci je interpolują. Serwer trzyma stan pokoi w pamięci; klienci dostają zmiany strumieniem **SSE** (albo **long-pollingiem**, gdy strumień nie dochodzi, np. przez tunel).

**Interfejs HTTP:**

| Metoda i adres | Opis |
|---|---|
| `POST /api/create` (`{field: s/m/l}`), `/api/join` | utworzenie pokoju i dołączenie (kod → token gracza) |
| `POST /api/place` (`{id, x, y, a}`: numer magnesu z ręki, środek ciężkości, kąt w radianach) | postawienie magnesu |
| `POST /api/resign`, `/api/rematch` | poddanie się, rewanż (nowe kształty) |
| `POST /api/chat` | wiadomość czatu |
| `POST /api/shutdown` | wyłączenie serwera i tunelu (tylko z lokalnego komputera, tajny token) |
| `GET /api/events` / `/api/poll` / `/api/state` | stan na żywo (SSE) / zapasowy long-polling / jednorazowy odczyt |
| `GET /api/info` | adres tunelu, adresy sieci lokalnej, wielkości pól, token zamykania (tylko lokalna przeglądarka) |

Błędy mają postać `{ "code": "…", "error": "…" }`; klient tłumaczy kod na wybrany język.

## Licencja

Udostępniane na licencji **MIT** (zobacz [LICENSE](../LICENSE)). Dołączona biblioteka kodów QR ma własną licencję MIT: zobacz [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
