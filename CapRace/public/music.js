'use strict';
// Muzyka w tle: własny, generowany na bieżąco podkład w klimacie elektronicznego "wyścigu" (Web Audio, bez plików):
// ok. 126 uderzeń na minutę, kick na każdą ćwiartkę, pulsujący bas, krótkie "uderzenia" dęciaków, hi-haty i arpeggio.
// Utwór jest oryginalny (nie cytuje żadnej istniejącej melodii). Struktura 8-taktowa: bas i perkusja, potem dochodzą
// dęciaki i werbel, potem arpeggio i narastający szum przed powrotem na początek.
// Wyciszenie przyciskiem 🎵 jest zapamiętywane. Muzyka startuje po pierwszym kliknięciu (wymóg przeglądarek).
const Music = (function () {
  const KEY = 'caprace-music-muted';
  let muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) {}

  const BPM = 126, BEAT = 60 / BPM, S16 = BEAT / 4, BAR = BEAT * 4;
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  // a-moll: Am Am F G (co takt), bas gra w szesnastkach, dęciaki akord na synkopach
  const CH = [{ bass: 33, triad: [57, 60, 64] }, { bass: 33, triad: [57, 60, 64] }, { bass: 29, triad: [53, 57, 60] }, { bass: 31, triad: [55, 59, 62] }];
  const BASS_PAT = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0];
  const STAB_STEPS = [3, 6, 10, 14];
  const ARP = [69, 72, 74, 76, 79, 81, 84, 88];                                            // pentatonika a-moll

  // Silnik muzyki na dowolnym kontekście audio (prawdziwym albo offline do pomiarów).
  function createEngine(ctx) {
    const master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.15;
    comp.connect(master); master.connect(ctx.destination);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000; lp.connect(comp);
    const bus = ctx.createGain(); bus.connect(lp);
    const fx = ctx.createGain(); fx.gain.value = 0.5;                                      // wysyłka do echa (dęciaki i arpeggio)
    const dl = ctx.createDelay(1); dl.delayTime.value = BEAT * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const df = ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 2600;
    fx.connect(dl); dl.connect(df); df.connect(fb); fb.connect(dl); df.connect(lp);
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    const env = (g, t0, vol, att, dur) => { g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + att); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); };
    function noise(t0, dur, type, freq, q, vol, toFx) {
      const s = ctx.createBufferSource(); s.buffer = nb;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); env(g, t0, vol, 0.002, dur);
      s.connect(f); f.connect(g); g.connect(bus); if (toFx) g.connect(fx);
      s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05);
    }
    function kick(t0, vol) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(165, t0); o.frequency.exponentialRampToValueAtTime(46, t0 + 0.13);
      env(g, t0, vol, 0.003, 0.32);
      o.connect(g); g.connect(bus); o.start(t0); o.stop(t0 + 0.36);
    }
    function snare(t0, vol) {
      noise(t0, 0.16, 'bandpass', 1900, 0.9, vol, false);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(220, t0); o.frequency.exponentialRampToValueAtTime(140, t0 + 0.08);
      env(g, t0, vol * 0.7, 0.002, 0.12); o.connect(g); g.connect(bus); o.start(t0); o.stop(t0 + 0.15);
    }
    function bass(t0, midi, dur, vol) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = hz(midi);
      f.type = 'lowpass'; f.Q.value = 5; f.frequency.setValueAtTime(1100, t0); f.frequency.exponentialRampToValueAtTime(220, t0 + dur);
      env(g, t0, vol, 0.004, dur);
      o.connect(f); f.connect(g); g.connect(bus); o.start(t0); o.stop(t0 + dur + 0.05);
    }
    function stab(t0, notes, vol) {
      notes.forEach(m => [-7, 7].forEach(det => {
        const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det;
        f.type = 'lowpass'; f.frequency.setValueAtTime(3600, t0); f.frequency.exponentialRampToValueAtTime(900, t0 + 0.16);
        env(g, t0, vol, 0.006, 0.2);
        o.connect(f); f.connect(g); g.connect(bus); g.connect(fx); o.start(t0); o.stop(t0 + 0.25);
      }));
    }
    function pluck(t0, midi, vol) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = hz(midi);
      env(g, t0, vol, 0.004, 0.22);
      o.connect(g); g.connect(bus); g.connect(fx); o.start(t0); o.stop(t0 + 0.26);
    }
    function sweep(t0, dur) {
      const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
      f.frequency.setValueAtTime(300, t0); f.frequency.exponentialRampToValueAtTime(7000, t0 + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.06, t0 + dur); g.gain.linearRampToValueAtTime(0.0001, t0 + dur + 0.05);
      s.connect(f); f.connect(g); g.connect(bus); s.start(t0); s.stop(t0 + dur + 0.1);
    }

    let nextBar = 0, idx = 0;
    function bar(t0) {
      const ph = idx % 8, ch = CH[idx % 4];
      for (let b = 0; b < 4; b++) kick(t0 + b * BEAT, 0.5);                                   // kick na każdą ćwiartkę
      for (let s = 2; s < 16; s += 4) noise(t0 + s * S16, 0.04, 'highpass', 7500, 0.7, 0.07, false);                 // hi-hat na "i"
      if (idx % 4 === 3) noise(t0 + 14 * S16, 0.16, 'highpass', 6500, 0.7, 0.07, false);                             // otwarty hat w końcu frazy
      for (let s = 0; s < 16; s++) if (BASS_PAT[s]) bass(t0 + s * S16, ch.bass + (s === 11 || (s === 5 && ph % 2) ? 12 : 0), S16 * 1.6, 0.17);
      if (ph >= 2) { snare(t0 + BEAT, 0.22); snare(t0 + 3 * BEAT, 0.22); }                      // werbel na 2 i 4
      if (ph >= 2) STAB_STEPS.forEach((s, i) => { if ((i + ph) % 4 !== 3) stab(t0 + s * S16, ch.triad, 0.032); });
      if (ph >= 4) {
        let k = Math.floor(Math.random() * ARP.length);
        for (let s = 0; s < 16; s++) {
          k = Math.max(0, Math.min(ARP.length - 1, k + Math.floor(Math.random() * 3) - 1));
          if (Math.random() < 0.72) pluck(t0 + s * S16, ARP[k], 0.03);
        }
      }
      if (ph === 6) sweep(t0, 2 * BAR);                                                         // narastanie przed powrotem na początek
      if (ph === 7) for (let s = 12; s < 16; s++) snare(t0 + s * S16, 0.09 + 0.03 * (s - 12));       // krótki werblowy rozbieg
      idx++;
    }
    return {
      master,
      start(t) { nextBar = t; },
      schedule(until) { while (nextBar < until) { bar(nextBar); nextBar += BAR; } },
      get nextBar() { return nextBar; },
    };
  }

  let ac, eng, started = false, timer, onChange = null;

  function start() {
    if (started) return;
    started = true;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    eng = createEngine(ac);
    eng.start(ac.currentTime + 0.1);
    eng.schedule(ac.currentTime + 3);
    timer = setInterval(() => eng.schedule(ac.currentTime + 3), 700);                         // planujemy z wyprzedzeniem, żeby muzyka nie urywała się
  }

  function apply() {
    if (onChange) onChange(muted);
    if (!ac) return;
    const t = ac.currentTime, g = eng.master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(muted ? 0 : 0.55, t + (muted ? 0.4 : 1.2));
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
      e.master.gain.value = 0.55; e.start(0); e.schedule(seconds);
      const buf = await off.startRendering(), d = buf.getChannelData(0);
      let peak = 0, sum = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; }
      const half = Math.floor(d.length / 2); let s2 = 0; for (let i = half; i < d.length; i++) s2 += d[i] * d[i];
      return { peak, rms: Math.sqrt(sum / d.length), rmsLate: Math.sqrt(s2 / (d.length - half)), bpm: BPM, bars: Math.round(seconds / BAR) };
    },
  };
})();
