# ✕ ○ Tic-tac-toe / Kółko i krzyżyk

🇬🇧 Play against the computer in a single file: open [`index.html`](index.html) in a browser (no installation, no server). The interface is in Polish.

🇵🇱 Gra przeciwko komputerowi w jednym pliku: otwórz [`index.html`](index.html) w przeglądarce (bez instalacji i serwera).

<p align="center"><img src="../docs/screenshots/tictactoe.jpg" width="60%" alt="Tic-tac-toe"></p>

## Features / Funkcje

- You play X, the computer plays O; who starts alternates every game. / Ty grasz X, komputer O; kto zaczyna, zmienia się co grę.
- **Hard**: the computer uses the minimax algorithm (it cannot be beaten, at best you draw). **Easy**: it often plays a random move. / **Trudny**: minimax (nie da się go pokonać, co najwyżej zremisować). **Łatwy**: często gra losowo.
- Scoreboard at the top: games played, your wins, draws, computer wins, remembered in the browser. / Licznik gier i wynik zapamiętywany w przeglądarce.
- Night sky with twinkling stars and slowly drifting constellations (static with "reduce motion"). / Nocne niebo z gwiazdami i konstelacjami (statyczne przy „ogranicz ruch”).
- Calm background music synthesized in the browser (starts after the first click; the 🔊/🔇 button mutes it and the choice is remembered). / Spokojna muzyka generowana w przeglądarce (startuje po pierwszym kliknięciu; przycisk 🔊/🔇 ją wycisza).
- The board has a fixed size (3 × 100 px). / Plansza ma stałą wielkość.
- **❓ How to play** tutorial with short animations (opens on your first visit). / Samouczek **❓ Jak grać** z krótkimi animacjami (otwiera się przy pierwszej wizycie).
- **Polski / English** switch for the whole interface, remembered in the browser. / Przełącznik **Polski / English** dla całego interfejsu, zapamiętywany w przeglądarce.
- Tests: `node test.js` (translations, tutorial, and a check that the hard level never loses). / Testy: `node test.js`.

## License / Licencja

MIT, see [LICENSE](../LICENSE). / MIT, zobacz [LICENSE](../LICENSE).
