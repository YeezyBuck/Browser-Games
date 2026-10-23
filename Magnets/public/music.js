'use strict';
// Muzyka w tle: spokojny, "naukowy" podkład generowany na bieżąco (Web Audio, bez plików): ok. 92 uderzeń na minutę,
// miękki puls basu, powolne akordy syntezatora (d-moll: Dm9, B-dur, F-dur, C-dur), rzadkie dzwonki z echem i cichy szum
// przypominający brzęczenie transformatora. Utwór jest oryginalny. Wyciszenie przyciskiem 🎵 jest zapamiętywane.
// Muzyka startuje po pierwszym kliknięciu (wymóg przeglądarek).
const Music = (function () {
  const KEY = 'magnets-music-muted';
  let muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) {}

  const BPM = 92, BEAT = 60 / BPM, BAR = BEAT * 4;
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const CH = [{ bass: 38, pad: [57, 60, 64, 67] }, { bass: 34, pad: [58, 62, 65, 69] }, { bass: 41, pad: [57, 60, 65, 69] }, { bass: 36, pad: [55, 60, 64, 67] }];
  const BELLS = [74, 77, 79, 81, 84, 86, 89];                                               // pentatonika zbliżona do d-moll
  const PULSE = [1, 0, 0, 1, 0, 1, 0, 0];                                                  // bas na ósemkach

  function createEngine(ctx) {
    const master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.25;
    comp.connect(master); master.connect(ctx.destination);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; lp.connect(comp);
    const bus = ctx.createGain(); bus.connect(lp);
    const fx = ctx.createGain(); fx.gain.value = 0.55;                                      // wysyłka do echa
    const dl = ctx.createDelay(1); dl.delayTime.value = BEAT * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.42;
    const df = ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 2200;
    fx.connect(dl); dl.connect(df); df.connect(fb); fb.connect(dl); df.connect(lp);
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    const env = (g, t0, vol, att, dur) => { g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + att); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); };
    function pad(t0, notes, dur) {
      notes.forEach((m, i) => [-6, 6].forEach(det => {
        const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det + i * 1.5;
        f.type = 'lowpass'; f.Q.value = 0.8; f.frequency.setValueAtTime(500, t0); f.frequency.linearRampToValueAtTime(1500, t0 + dur * 0.55); f.frequency.linearRampToValueAtTime(600, t0 + dur);
        g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.018, t0 + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
        o.connect(f); f.connect(g); g.connect(bus); g.connect(fx); o.start(t0); o.stop(t0 + dur + 0.05);
      }));
    }
    function bass(t0, midi, dur) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = hz(midi);
      f.type = 'lowpass'; f.frequency.value = 520;
      env(g, t0, 0.2, 0.012, dur);
      o.connect(f); f.connect(g); g.connect(bus); o.start(t0); o.stop(t0 + dur + 0.05);
    }
    function bell(t0, midi) {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = hz(midi); o2.type = 'sine'; o2.frequency.value = hz(midi) * 2.76;
      env(g, t0, 0.04, 0.004, 1.6);
      o.connect(g); o2.connect(g); g.connect(bus); g.connect(fx); o.start(t0); o2.start(t0); o.stop(t0 + 1.7); o2.stop(t0 + 1.7);
    }
    function hum(t0, dur) {                                                                   // ciche brzęczenie (szum w wąskim paśmie)
      const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 118; f.Q.value = 14;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.05, t0 + dur * 0.4); g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
      s.connect(f); f.connect(g); g.connect(bus); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
    }

    let nextBar = 0, idx = 0;
    function bar(t0) {
      const ch = CH[idx % 4], ph = idx % 8;
      pad(t0, ch.pad, BAR * 1.15);
      for (let s = 0; s < 8; s++) if (PULSE[s]) bass(t0 + s * BEAT / 2, ch.bass + (s === 5 ? 12 : 0), BEAT * 0.7);
      if (ph >= 2) { let t = t0 + BEAT * (0.5 + Math.random()); while (t < t0 + BAR - 0.5) { bell(t, BELLS[Math.floor(Math.random() * BELLS.length)]); t += BEAT * (1 + Math.random() * 2.2); } }
      if (ph === 0) hum(t0, BAR * 2);
      idx++;
    }
    return {
      master,
      start(t) { nextBar = t; },
      schedule(until) { while (nextBar < until) { bar(nextBar); nextBar += BAR; } },
    };
  }

  let ac, eng, started = false, timer, onChange = null;

  function start() {
    if (started) return;
    started = true;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    eng = createEngine(ac);
    eng.start(ac.currentTime + 0.1);
    eng.schedule(ac.currentTime + 4);
    timer = setInterval(() => eng.schedule(ac.currentTime + 4), 900);                         // planujemy z wyprzedzeniem, żeby muzyka nie urywała się
  }

  function apply() {
    if (onChange) onChange(muted);
    if (!ac) return;
    const t = ac.currentTime, g = eng.master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(muted ? 0 : 0.8, t + (muted ? 0.4 : 1.5));
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
    // Do pomiarów (testy): renderuje `seconds` sekund muzyki offline i zwraca szczyt oraz wartość skuteczną sygnału.
    async measure(seconds) {
      const off = new OfflineAudioContext(2, Math.ceil(44100 * seconds), 44100), e = createEngine(off);
      e.master.gain.value = 0.8; e.start(0); e.schedule(seconds);
      const buf = await off.startRendering(), d = buf.getChannelData(0);
      let peak = 0, sum = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; }
      return { peak, rms: Math.sqrt(sum / d.length), bpm: BPM, bars: Math.round(seconds / BAR) };
    },
  };
})();
