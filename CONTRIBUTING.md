# Contributing / Współtworzenie

Thanks for your interest! / Dziękuję za zainteresowanie!

## English

- **Bug reports and ideas:** open an [issue](https://github.com/YeezyBuck/Browser-Games/issues/new/choose). For **security** problems use the private *Report a vulnerability* button instead (see [SECURITY.md](SECURITY.md)).
- **Code changes:** fork the repository, make a focused change on a branch and open a pull request.
- **Keep it dependency-free.** The games run on plain Node.js (18 or newer) and plain browser JavaScript, with no `npm install`. Please do not add runtime dependencies. The only bundled third-party code is the QR generator described in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- **Run the tests** of the game you changed before opening a pull request:
  - `cd WarShips && npm test`
  - `cd Dots && npm test`
  - `cd TicTacToe && node test.js`
- **Both languages:** every text visible to players exists in Polish and English (`public/i18n.js`, or the `I18N` block in `TicTacToe/index.html`). New texts need both translations; the tests check that the keys match.
- **Security habits:** the server is the referee, so never trust data from the browser: validate every request on the server. Show player-supplied text only as plain text (never as HTML).
- **License:** by contributing you agree that your contribution is released under the [MIT license](LICENSE). Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Po polsku

- **Błędy i pomysły:** otwórz [zgłoszenie](https://github.com/YeezyBuck/Browser-Games/issues/new/choose). Problemy z **bezpieczeństwem** zgłaszaj prywatnie przyciskiem *Report a vulnerability* (zobacz [SECURITY.md](SECURITY.md)).
- **Zmiany w kodzie:** zrób fork, wprowadź jedną konkretną zmianę na osobnej gałęzi i otwórz pull request.
- **Bez zależności.** Gry działają na samym Node.js (18 lub nowszy) i zwykłym JavaScript w przeglądarce, bez `npm install`. Prosimy nie dodawać zależności uruchomieniowych. Jedyny dołączony cudzy kod to generator QR opisany w [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- **Uruchom testy** zmienionej gry przed pull requestem:
  - `cd WarShips && npm test`
  - `cd Dots && npm test`
  - `cd TicTacToe && node test.js`
- **Dwa języki:** każdy tekst widoczny dla graczy istnieje po polsku i angielsku (`public/i18n.js` albo blok `I18N` w `TicTacToe/index.html`). Nowe teksty wymagają obu tłumaczeń, a testy sprawdzają zgodność kluczy.
- **Bezpieczeństwo:** serwer jest sędzią, więc nigdy nie ufaj danym z przeglądarki: sprawdzaj każde żądanie na serwerze. Teksty od graczy wyświetlaj wyłącznie jako zwykły tekst (nigdy jako HTML).
- **Licencja:** wnosząc zmiany zgadzasz się, że będą udostępnione na [licencji MIT](LICENSE). Obowiązuje [Kodeks postępowania](CODE_OF_CONDUCT.md).
