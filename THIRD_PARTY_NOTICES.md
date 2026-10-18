# Third-party notices / Oprogramowanie osób trzecich

## Bundled code / Dołączony kod

### qrcode-generator 2.0.4

Used for the QR codes in the multiplayer games (`WarShips/public/vendor/qrcode.js`, `Dots/public/vendor/qrcode.js`, copied unchanged).

- Project: <https://github.com/kazuhikoarase/qrcode-generator>
- Copyright (c) 2009 Kazuhiko Arase
- License: MIT

```
The MIT License (MIT)

Copyright (c) 2009 Kazuhiko Arase

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

"QR Code" is a registered trademark of DENSO WAVE INCORPORATED.

## Not bundled / Niedołączone (używane przez użytkownika na jego komputerze)

- **Node.js** (MIT) – required to run the servers; installed by the user.
- **cloudflared** (Apache License 2.0, Cloudflare, Inc.) – optional, only for playing over the internet. It is **not** included in this repository; the game offers to install it with the user's package manager (`winget`/`brew`) on the user's request.
  The free "Quick Tunnels" (`trycloudflare.com`) are intended by Cloudflare for testing and development; see Cloudflare's terms of service before relying on them.

Everything else in this repository (game code, graphics drawn in code, music and sound effects synthesized in the browser) was written for this project and is covered by the [MIT license](LICENSE).
