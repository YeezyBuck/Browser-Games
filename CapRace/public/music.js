'use strict';
// Muzyka w tle: wesoła, lekka melodyjka generowana na bieżąco (Web Audio, bez plików): podwórkowy rytm "bas–akord",
// pogodne akordy C–G–Am–F i losowe, ciche przygrywki z pentatoniki C-dur. Wyciszenie przyciskiem 🎵 jest zapamiętywane.
// Muzyka startuje po pierwszym kliknięciu (wymóg przeglądarek).
const Music = (function () {
  const KEY = 'caprace-music-muted';
  let muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) {}

  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const BEAT = 0.55, STEP = BEAT / 2, BAR = BEAT * 4;                                       // ok. 109 uderzeń na minutę, ósemki
  const PROG = [{ root: 48, triad: [60, 64, 67] }, { root: 43, triad: [59, 62, 67] }, { root: 45, triad: [57, 60, 64] }, { root: 41, triad: [57, 60, 65] }];
  const PENTA = [72, 74, 76, 79, 81, 84];                                                    // C D E G A C
  let ac, master, bus, started = false, nextBar = 0, idx = 0, timer, onChange = null;

  function build() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.connect(master);
    bus = ac.createGain(); bus.connect(lp);
    const d = ac.createDelay(1); d.delayTime.value = BEAT * 0.75;                           // delikatne echo
    const fb = ac.createGain(); fb.gain.value = 0.28;
    const dl = ac.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2200;
    bus.connect(d); d.connect(dl); dl.connect(fb); fb.connect(d); dl.connect(lp);
  }

  function pluck(freq, t0, dur, vol, type) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(bus);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function schedule() {                                                                     // planujemy z wyprzedzeniem, żeby muzyka nie urywała się
    while (nextBar < ac.currentTime + 3) {
      const ch = PROG[idx % PROG.length], t0 = nextBar;
      pluck(hz(ch.root - 12), t0, BEAT * 0.9, 0.11, 'triangle');                              // bas na 1 i 3
      pluck(hz(ch.root - 12), t0 + BEAT * 2, BEAT * 0.9, 0.1, 'triangle');
      pluck(hz(ch.root - 5), t0 + BEAT * 3, BEAT * 0.5, 0.05, 'triangle');
      for (const off of [1, 3]) ch.triad.forEach(m => pluck(hz(m), t0 + BEAT * off, BEAT * 0.32, 0.03, 'square'));   // "pa" na 2 i 4
      let prev = -1;
      for (let s = 0; s < 8; s++) {                                                          // melodia: ósemki z pewnym prawdopodobieństwem
        if (Math.random() > (s % 2 ? 0.45 : 0.7)) continue;
        let k = Math.floor(Math.random() * PENTA.length);
        if (k === prev) k = (k + 2) % PENTA.length;
        prev = k;
        pluck(hz(PENTA[k]), t0 + s * STEP, STEP * 1.6, 0.04, 'sine');
      }
      nextBar += BAR; idx++;
    }
  }

  function start() {
    if (started) return;
    started = true;
    build();
    nextBar = ac.currentTime + 0.1;
    schedule();
    timer = setInterval(schedule, 800);
  }

  function apply() {
    if (onChange) onChange(muted);
    if (!ac) return;
    const t = ac.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(muted ? 0 : 0.75, t + (muted ? 0.4 : 1.2));
    if (!muted && ac.state === 'suspended') ac.resume();
  }

  function firstGesture() {
    removeEventListener('pointerdown', firstGesture);
    removeEventListener('keydown', firstGesture);
    if (!muted) { start(); apply(); }
  }
  addEventListener('pointerdown', firstGesture);
  addEventListener('keydown', firstGesture);
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) ac.suspend(); else if (!muted) ac.resume();
  });

  return {
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) {}
      if (!muted) start();
      apply();
    },
    onChange(fn) { onChange = fn; fn(muted); },
  };
})();
