# Statki

Gra w statki dla dwóch osób przez przeglądarkę. Serwer w Node.js bez zewnętrznych zależności.

## Uruchomienie

```
node server.js
```

(albo `npm start`). Serwer wypisze adres `http://localhost:3000` oraz adresy w sieci lokalnej.
Inny port: zmienna `PORT`, np. `PORT=8080 node server.js`.

Pierwsza osoba klika **Utwórz grę** i przekazuje drugiej adres (z kodem pokoju); druga otwiera go albo wpisuje kod w polu **Dołącz do gry**.
W oczekiwaniu na przeciwnika gra pokazuje, **który adres komu przekazać** (internet / ta sama sieć Wi-Fi) z przyciskami „Kopiuj”.

## Gra przez internet (tunel Cloudflare)

1. Jednorazowo zainstaluj program: `winget install Cloudflare.cloudflared` (potem otwórz nowe okno terminala).
2. Uruchom serwer z tunelem: dwuklik na `uruchom-tunel.bat` albo `npm run tunnel` (`node server.js --tunnel`).
3. W konsoli pojawi się ramka z adresem `https://....trycloudflare.com`. Po kliknięciu **Utwórz grę** ten sam adres
   (już z kodem pokoju) zobaczysz w grze jako „Przeciwnik w internecie” – skopiuj go i wyślij znajomemu.
4. Adres jest tymczasowy: zmienia się przy każdym uruchomieniu, a komputer z serwerem musi pozostać włączony.
5. Darmowe tunele „quick tunnel” nie przepuszczają strumienia na żywo (SSE), dlatego gra po ok. 3 s sama przełącza się
   na zapasowy transport (long-polling: zwykłe żądania, które serwer wstrzymuje do zmiany stanu). Dla gracza nie ma to znaczenia;
   w sieci domowej nadal działa szybszy strumień.

Bez tunelu (`uruchom.bat` / `npm start`) gra działa tylko w sieci domowej. Gra nie wymaga konta Cloudflare.

## Zabezpieczenia

- Kod pokoju ma 6 liter (ok. 190 mln kombinacji), a próby dołączenia są ograniczone (12/min na adres IP).
- Limity na adres IP: żądania (600/min), zakładanie pokoi (10 na 10 min), połączenia na żywo (8); łącznie max 300 pokoi.
- Serwer rozpoznaje prawdziwy adres klienta za tunelem (nagłówek `CF-Connecting-IP`), ale tylko dla połączeń z tego komputera, więc nikt z sieci domowej się nim nie podszyje.
- Adresy sieci domowej (prywatne IP) widzi tylko gospodarz, nie osoby łączące się przez internet.
- Nagłówki: Content-Security-Policy (tylko własne skrypty), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`.
- Tokeny graczy porównywane w stałym czasie, limit rozmiaru żądań, limity czasu żądań, pokoje wygasają po 3 h bezczynności.
- Serwer przekazuje przeciwnikowi tylko to, co wolno widzieć (pozycje statków ujawnia dopiero po końcu gry).
- Nie ma haseł ani kont: kto zna kod pokoju, może do niego dołączyć jako drugi gracz. Nie wystawiaj gry do internetu bez tunelu ani HTTPS.

## Zasady

- Plansza 10×10, flota: 1 × czteromasztowiec, 2 × trójmasztowiec, 3 × dwumasztowiec, 4 × jednomasztowiec.
- Statki nie mogą się stykać (także rogami). Do zmiany w `server.js`: `ALLOW_TOUCHING`.
- Każdy gracz ma dwie plansze: **Twoja plansza** (Twoje statki i strzały przeciwnika) oraz **Plansza przeciwnika** (tu strzelasz).
- Każdy gracz oddaje jeden strzał, potem kolej przeciwnika (także po trafieniu). Trafienie: *boom*, pudło: *plusk*. Do zmiany w `server.js`: `KEEP_TURN_ON_HIT` (true = po trafieniu strzelasz dalej).
- Wygrywa ten, kto pierwszy zatopi wszystkie statki przeciwnika. Potem można zagrać ponownie.
- Serwer pilnuje reguł i nie wysyła przeciwnikowi pozycji Twoich statków (ujawnia je dopiero po zakończeniu gry).
- Czat między graczami: przycisk 💬 w lewym dolnym rogu (po dołączeniu przeciwnika), odznaka z liczbą nieprzeczytanych, krótki sygnał przy nowej wiadomości (wycisza go 🔊). Do 200 znaków na wiadomość, limit 6 wiadomości na 10 s, treść wyświetlana wyłącznie jako tekst (bez HTML). Wiadomości żyją tylko w pamięci serwera i znikają razem z pokojem.
- Język (polski / angielski) wybierasz przyciskami u góry strony; wybór jest zapamiętywany (domyślnie według języka przeglądarki).
- Muzyka w tle (wesoła szanta w stylu żeglarskiego walca, generowana w przeglądarce, z cichym szumem fal) startuje po pierwszym kliknięciu; przycisk 🎵 ją wycisza, a 🔊 wycisza efekty (boom/plusk).
- Odświeżenie strony nie wyrzuca z gry (sesja jest zapamiętana w karcie przeglądarki).

## Testy

```
node test.js
```

Uruchamia serwer i rozgrywa pełną partię dwoma graczami przez HTTP, sprawdzając walidację floty, kolejkę, ukrywanie statków i rewanż.
