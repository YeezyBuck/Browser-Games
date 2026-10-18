# Gry w przeglądarce / Browser games

🇵🇱 **Po polsku** · 🇬🇧 [English below](#english)

## Po polsku

Zbiór małych gier, w które grasz w przeglądarce. Gry dla dwóch osób działają w sieci domowej **albo przez internet** (tunel Cloudflare), mają czat, kod QR do dołączania z telefonu, polski i angielski interfejs oraz nie wymagają instalowania bibliotek: wystarczy **Node.js**.

| Gra | Folder | Opis | Port | Instrukcja |
|---|---|---|---|---|
| ⚓ **WarShips** (statki) | [`WarShips/`](WarShips/) | klasyczna gra w statki dla dwóch osób, wybuchy, fajerwerki, piracka scena w tle | 3000 | [PL](WarShips/README.pl.md) · [EN](WarShips/README.md) |
| ● **Dots** (kropki) | [`Dots/`](Dots/) | polskie „kropki” (otaczanie): pętla z własnych kropek przejmuje kropki przeciwnika | 3100 | [PL](Dots/README.pl.md) · [EN](Dots/README.md) |
| ✕ ○ Kółko i krzyżyk | [`KolkoiKrzyzyk/`](KolkoiKrzyzyk/) | gra z komputerem (jeden plik `index.html`, wystarczy go otworzyć) | – | [README](KolkoiKrzyzyk/README.md) |

### Szybki start (Windows)
1. Zainstaluj **Node.js** (LTS) z <https://nodejs.org>.
2. Wejdź do folderu wybranej gry i kliknij dwukrotnie **`uruchom.bat`**. Sprawdzi on program `cloudflared` (w razie potrzeby zaproponuje instalację), uruchomi tunel, a potem grę i przeglądarkę. Wariant bez internetu: `uruchom-bez-tunelu.bat`.
3. Utwórz grę, a przeciwnikowi wyślij link (albo pokaż kod QR). Na koniec kliknij **⏻ Zamknij grę**.

Na innych systemach: `cd WarShips` (albo `cd Dots`), potem `node server.js --tunnel --open`. Szczegóły i rozwiązywanie problemów są w instrukcjach poszczególnych gier. Obie gry mogą działać jednocześnie (różne porty).

## English

A small collection of games you play in the browser. The two-player games work on your home network **or over the internet** (Cloudflare tunnel), have a chat, a QR code for joining from a phone, a Polish and English interface, and need no libraries: all you need is **Node.js**.

| Game | Folder | Description | Port | Instructions |
|---|---|---|---|---|
| ⚓ **WarShips** (Battleships) | [`WarShips/`](WarShips/) | the classic two-player Battleships, explosions, fireworks, a pirate scene in the background | 3000 | [PL](WarShips/README.pl.md) · [EN](WarShips/README.md) |
| ● **Dots** | [`Dots/`](Dots/) | the Polish "Dots" game (surround and capture): a loop of your own dots captures your opponent's dots | 3100 | [PL](Dots/README.pl.md) · [EN](Dots/README.md) |
| ✕ ○ Tic-tac-toe | [`KolkoiKrzyzyk/`](KolkoiKrzyzyk/) | play against the computer (a single `index.html`, just open it) | – | [README](KolkoiKrzyzyk/README.md) |

### Quick start (Windows)
1. Install **Node.js** (LTS) from <https://nodejs.org>.
2. Open the folder of the game you want and double-click **`uruchom.bat`**. It checks for `cloudflared` (offering to install it if needed), starts the tunnel, then the game and the browser. Without the internet: `uruchom-bez-tunelu.bat`.
3. Create a game and send your opponent the link (or show the QR code). When you are done, click **⏻ Quit game**.

On other systems: `cd WarShips` (or `cd Dots`), then `node server.js --tunnel --open`. Details and troubleshooting are in each game's instructions. Both games can run at the same time (different ports).
