# Security policy / Polityka bezpieczeństwa

## Scope / Zakres

These are small hobby games. The multiplayer games (`WarShips`, `Dots`, `CapRace`, `Magnets`, and `TicTacToe` in its network mode) are meant to be played with friends: the server runs on your own computer and, if you choose, is reachable through a temporary Cloudflare tunnel. They are **not** hardened for permanent public hosting (there are no accounts; anyone who knows a room code can join as the second player).

To jednocześnie małe gry hobbystyczne. Gry sieciowe (`WarShips`, `Dots`, `CapRace`, `Magnets` oraz `TicTacToe` w trybie sieciowym) są przeznaczone do grania ze znajomymi: serwer działa na Twoim komputerze, a opcjonalnie jest dostępny przez tymczasowy tunel Cloudflare. **Nie** są przygotowane do stałego hostowania publicznego (nie ma kont; każdy, kto zna kod pokoju, może dołączyć jako drugi gracz).

Built-in protections include: 6-letter room codes with rate limits, server-side validation of every move, per-IP limits, a strict Content-Security-Policy, text-only chat, and a shutdown endpoint reachable only from the local machine with a secret token.

## Reporting a vulnerability / Zgłaszanie błędów

Please report security problems **privately** using GitHub's *Report a vulnerability* button (Security tab of https://github.com/YeezyBuck/Browser-Games), not in a public issue. Include steps to reproduce. You can expect a reply within about two weeks.

Błędy bezpieczeństwa zgłaszaj **prywatnie** przyciskiem *Report a vulnerability* (zakładka Security repozytorium https://github.com/YeezyBuck/Browser-Games), a nie w publicznym zgłoszeniu. Dołącz kroki do odtworzenia.
