'use strict';
// Muzyka w tle: wesoła, łagodna melodia w stylu szanty (metrum 6/8, D-dorycki), generowana na bieżąco
// przez Web Audio – bez plików dźwiękowych. Do tego cichy szum fal.
// Wygłuszenie przyciskiem 🎵 jest zapamiętywane. Muzyka startuje po pierwszym kliknięciu (wymóg przeglądarek).
const Music = (function () {
  const KEY = 'statki-music-muted';
  let muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) {}

  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const EIGHTH = 0.28;                  // sekundy; takt 6/8 = 1,68 s
  const BAR = EIGHTH * 6;

  // 8-taktowa pętla: Dm Dm C C Gm Dm C Dm
  const CHORDS = [
    { root: 38, notes: [50, 53, 57] },  // Dm
    { root: 38, notes: [50, 53, 57] },  // Dm
    { root: 36, notes: [48, 52, 55] },  // C
    { root: 36, notes: [48, 52, 55] },  // C
    { root: 43, notes: [50, 55, 58] },  // Gm
    { root: 38, notes: [50, 53, 57] },  // Dm
    { root: 36, notes: [48, 52, 55] },  // C
    { root: 38, notes: [50, 53, 57] },  // Dm
  ];
  // melodia: [początek (ósemki), nuta MIDI, długość (ósemki)]
  const MELODY = [
    [[0, 69, 2], [2, 67, 1], [3, 65, 2], [5, 67, 1]],
    [[0, 69, 3], [3, 74, 3]],
    [[0, 72, 2], [2, 69, 1], [3, 67, 2], [5, 69, 1]],
    [[0, 67, 3], [3, 64, 1], [4, 67, 2]],
    [[0, 70, 2], [2, 69, 1], [3, 67, 2], [5, 69, 1]],
    [[0, 65, 2], [2, 67, 1], [3, 69, 2], [5, 65, 1]],
    [[0, 64, 2], [2, 67, 1], [3, 72, 2], [5, 69, 1]],
    [[0, 62, 3], [3, 64, 1], [4, 62, 2]],
  ];

  let ac, master, bus, started = false, nextBar = 0, barIdx = 0, timer, onChange = null;

  function build() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; lp.connect(master);
    bus = ac.createGain(); bus.connect(lp);
    // lekki pogłos
    const d = ac.createDelay(1); d.delayTime.value = 0.23;
    const fb = ac.createGain(); fb.gain.value = 0.28;
    const dl = ac.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2200;
    bus.connect(d); d.connect(dl); dl.connect(fb); fb.connect(d); dl.connect(lp);
    // szum fal: przefiltrowany szum, którego głośność faluje
    const n = ac.sampleRate * 4, buf = ac.createBuffer(1, n, ac.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
    const wg = ac.createGain(); wg.gain.value = 0.03;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.11;
    const lg = ac.createGain(); lg.gain.value = 0.022;
    lfo.connect(lg); lg.connect(wg.gain);
    src.connect(bp); bp.connect(wg); wg.connect(master);
    src.start(); lfo.start();
  }

  function note(freq, t0, dur, vol, type, attack, release, vib) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    if (vib) {
      const l = ac.createOscillator(), lg = ac.createGain();
      l.frequency.value = 5.2; lg.gain.value = freq * 0.006;
      l.connect(lg); lg.connect(o.frequency); l.start(t0 + 0.12); l.stop(t0 + dur + release);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.setValueAtTime(vol, t0 + Math.max(attack, dur - 0.02));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + release);
    o.connect(g); g.connect(bus);
    o.start(t0); o.stop(t0 + dur + release + 0.05);
  }

  function scheduleBar(t0, i) {
    const c = CHORDS[i % 8], m = MELODY[i % 8];
    const at = k => t0 + k * EIGHTH;
    // bas: tonika na 1 i kwinta na 4
    note(hz(c.root), at(0), EIGHTH * 2.4, 0.12, 'triangle', 0.01, 0.12);
    note(hz(c.root + 7), at(3), EIGHTH * 2.4, 0.10, 'triangle', 0.01, 0.12);
    // "pa": akordy na 2 i 5 (jak w żeglarskim walcu)
    [2, 5].forEach(k => c.notes.forEach(n => note(hz(n + 12), at(k), EIGHTH * 0.8, 0.028, 'square', 0.005, 0.1)));
    // harmonijka: długi, cichy podkład
    c.notes.forEach(n => note(hz(n), t0, BAR * 0.98, 0.022, 'sawtooth', 0.15, 0.25));
    // melodia: fujarka (sinus + oktawa) z delikatnym vibrato
    m.forEach(([s, n, len]) => {
      const d = len * EIGHTH * 0.92;
      note(hz(n), at(s), d, 0.09, 'sine', 0.025, 0.12, true);
      note(hz(n + 12), at(s), d, 0.018, 'triangle', 0.025, 0.1, false);
    });
  }

  function schedule() {
    while (nextBar < ac.currentTime + 4) {
      scheduleBar(nextBar, barIdx++);
      nextBar += BAR;
    }
  }

  function start() {
    if (started) return;
    started = true;
    build();
    nextBar = ac.currentTime + 0.15;
    schedule();
    timer = setInterval(schedule, 800);
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
