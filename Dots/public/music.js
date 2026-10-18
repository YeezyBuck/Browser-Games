'use strict';
// Muzyka w tle: spokojny, generowany na bieżąco podkład ambient (Web Audio, bez plików): miękkie akordy Am–F–C–G
// i rzadkie, ciche dzwonki z pentatoniki. Wyciszenie przyciskiem 🎵 jest zapamiętywane.
// Muzyka startuje po pierwszym kliknięciu (wymóg przeglądarek).
const Music = (function () {
  const KEY = 'dots-music-muted';
  let muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) {}

  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const CHORDS = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]];   // Am F C G, ok. 8 s każdy
  const BELLS = [69, 72, 74, 76, 79, 81, 84];                                                 // pentatonika a-moll
  const CHORD_LEN = 8;
  let ac, master, bus, started = false, nextChord = 0, idx = 0, timer, onChange = null;

  function build() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.connect(master);
    bus = ac.createGain(); bus.connect(lp);
    const d = ac.createDelay(1); d.delayTime.value = 0.42;                      // prosty pogłos: opóźnienie ze sprzężeniem
    const fb = ac.createGain(); fb.gain.value = 0.38;
    const dl = ac.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 1800;
    bus.connect(d); d.connect(dl); dl.connect(fb); fb.connect(d); dl.connect(lp);
  }

  function tone(freq, t0, dur, vol, type, attack) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    o.detune.value = (Math.random() - 0.5) * 10;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(bus);
    o.start(t0); o.stop(t0 + dur + 0.1);
  }

  function schedule() {                                                         // planujemy z wyprzedzeniem, żeby muzyka nie urywała się
    while (nextChord < ac.currentTime + 6) {
      const ch = CHORDS[idx % CHORDS.length];
      ch.forEach(m => tone(hz(m), nextChord, CHORD_LEN + 2, 0.05, 'triangle', 2.5));
      tone(hz(ch[0] - 12), nextChord, CHORD_LEN + 1, 0.07, 'sine', 2);
      let t = nextChord + 1 + Math.random() * 1.5;
      while (t < nextChord + CHORD_LEN - 1) {
        tone(hz(BELLS[Math.floor(Math.random() * BELLS.length)]), t, 3.5, 0.045, 'sine', 0.02);
        t += 1.8 + Math.random() * 2.6;
      }
      nextChord += CHORD_LEN; idx++;
    }
  }

  function start() {
    if (started) return;
    started = true;
    build();
    nextChord = ac.currentTime + 0.1;
    schedule();
    timer = setInterval(schedule, 1000);
  }

  function apply() {
    if (onChange) onChange(muted);
    if (!ac) return;
    const t = ac.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(muted ? 0 : 0.8, t + (muted ? 0.4 : 1.5));
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
