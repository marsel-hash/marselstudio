import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Volume2 } from 'lucide-react';

const CHORD_VOICINGS: number[][] = [
  // Dmaj9: D3, A3, E4, F#4, C#5
  [146.83, 220.0, 329.63, 369.99, 554.37],
  // Bm9: B2, F#3, A3, C#4, D4
  [123.47, 185.0, 220.0, 277.18, 293.66],
  // Gmaj9: G2, D3, F#3, A3, B3
  [98.0, 146.83, 185.0, 220.0, 246.94],
  // A6/9: A2, E3, F#3, B3, C#4
  [110.0, 164.81, 185.0, 246.94, 277.18],
];

interface AudioEngine {
  ctx: AudioContext;
  masterGain: GainNode;
  padFilter: BiquadFilterNode;
  delayNode: DelayNode;
  chordTimer: number | null;
  noteTimer: number | null;
  chordIndex: number;
  isDisposed: boolean;
}

export function AmbientAudioPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.55);
  const [isSupported, setIsSupported] = useState(true);

  const engineRef = useRef<AudioEngine | null>(null);
  const isPlayingRef = useRef(false);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const scheduleChord = (engine: AudioEngine) => {
    if (engine.isDisposed || !isPlayingRef.current) return;
    const { ctx, padFilter } = engine;
    const now = ctx.currentTime;
    const voicing = CHORD_VOICINGS[engine.chordIndex % CHORD_VOICINGS.length];
    engine.chordIndex = (engine.chordIndex + 1) % CHORD_VOICINGS.length;

    // Sustained warm 3-voice analog pad from lower/mid intervals
    const padFreqs = voicing.slice(0, 3);
    padFreqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const voiceGain = ctx.createGain();
      osc.type = idx === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.detune.setValueAtTime((idx - 1) * 4.5, now);

      voiceGain.gain.setValueAtTime(0.0001, now);
      voiceGain.gain.linearRampToValueAtTime(0.042, now + 3.0);
      voiceGain.gain.linearRampToValueAtTime(0.028, now + 7.2);
      voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + 10.6);

      osc.connect(voiceGain);
      voiceGain.connect(padFilter);
      osc.start(now);
      osc.stop(now + 10.8);
    });
  };

  const scheduleFeltNote = (engine: AudioEngine) => {
    if (engine.isDisposed || !isPlayingRef.current) return;
    const { ctx, padFilter, delayNode } = engine;
    const now = ctx.currentTime;
    const currentVoicing =
      CHORD_VOICINGS[(engine.chordIndex - 1 + CHORD_VOICINGS.length) % CHORD_VOICINGS.length];
    const pickIdx = Math.floor(Math.random() * Math.max(2, currentVoicing.length - 1)) + 1;
    const freq = currentVoicing[pickIdx] ?? currentVoicing[1];

    const osc = ctx.createOscillator();
    const noteGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    noteGain.gain.setValueAtTime(0.0001, now);
    noteGain.gain.linearRampToValueAtTime(0.048, now + 0.08);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.8);

    osc.connect(noteGain);
    noteGain.connect(padFilter);
    noteGain.connect(delayNode);
    osc.start(now);
    osc.stop(now + 4.0);
  };

  const ensureEngine = (): AudioEngine | null => {
    if (engineRef.current) return engineRef.current;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) {
      setIsSupported(false);
      return null;
    }

    const ctx = new AudioCtx();
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    masterGain.connect(ctx.destination);

    // Warm low-pass tape tone filter + gentle LFO breathing
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.setValueAtTime(620, ctx.currentTime);
    padFilter.Q.setValueAtTime(0.7, ctx.currentTime);
    padFilter.connect(masterGain);

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.045, ctx.currentTime);
    lfoGain.gain.setValueAtTime(140, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(padFilter.frequency);
    lfo.start();

    // Soft analog tape echo loop
    const delayNode = ctx.createDelay(1.0);
    delayNode.delayTime.setValueAtTime(0.44, ctx.currentTime);
    const delayFilter = ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.setValueAtTime(760, ctx.currentTime);
    const delayFeedback = ctx.createGain();
    delayFeedback.gain.setValueAtTime(0.28, ctx.currentTime);
    const delaySend = ctx.createGain();
    delaySend.gain.setValueAtTime(0.35, ctx.currentTime);

    delayNode.connect(delayFilter);
    delayFilter.connect(delayFeedback);
    delayFeedback.connect(delayNode);
    delayFilter.connect(delaySend);
    delaySend.connect(masterGain);

    // Subtle analog tape room floor
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = output[i];
      output[i] *= 1.6;
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(360, ctx.currentTime);
    noiseFilter.Q.setValueAtTime(0.8, ctx.currentTime);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.012, ctx.currentTime);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSource.start();

    const engine: AudioEngine = {
      ctx,
      masterGain,
      padFilter,
      delayNode,
      chordTimer: null,
      noteTimer: null,
      chordIndex: 0,
      isDisposed: false,
    };

    engineRef.current = engine;
    return engine;
  };

  const startTimers = (engine: AudioEngine) => {
    if (engine.chordTimer !== null) window.clearInterval(engine.chordTimer);
    if (engine.noteTimer !== null) window.clearInterval(engine.noteTimer);

    scheduleChord(engine);
    window.setTimeout(() => {
      if (isPlayingRef.current && !engine.isDisposed) {
        scheduleFeltNote(engine);
      }
    }, 900);

    engine.chordTimer = window.setInterval(() => {
      scheduleChord(engine);
    }, 8800);

    engine.noteTimer = window.setInterval(() => {
      scheduleFeltNote(engine);
    }, 3600);
  };

  const stopTimers = (engine: AudioEngine) => {
    if (engine.chordTimer !== null) {
      window.clearInterval(engine.chordTimer);
      engine.chordTimer = null;
    }
    if (engine.noteTimer !== null) {
      window.clearInterval(engine.noteTimer);
      engine.noteTimer = null;
    }
  };

  const togglePlay = async () => {
    const engine = ensureEngine();
    if (!engine) return;

    if (isPlayingRef.current) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      stopTimers(engine);
      const now = engine.ctx.currentTime;
      engine.masterGain.gain.cancelScheduledValues(now);
      engine.masterGain.gain.setValueAtTime(
        Math.max(engine.masterGain.gain.value, 0.0001),
        now
      );
      engine.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.45);
      window.setTimeout(() => {
        if (!isPlayingRef.current && !engine.isDisposed && engine.ctx.state === 'running') {
          void engine.ctx.suspend();
        }
      }, 480);
    } else {
      isPlayingRef.current = true;
      setIsPlaying(true);
      if (engine.ctx.state === 'suspended') {
        await engine.ctx.resume();
      }
      const now = engine.ctx.currentTime;
      engine.masterGain.gain.cancelScheduledValues(now);
      engine.masterGain.gain.setValueAtTime(0.0001, now);
      engine.masterGain.gain.linearRampToValueAtTime(volumeRef.current, now + 1.1);
      startTimers(engine);
    }
  };

  const handleVolumeChange = (nextVol: number) => {
    setVolume(nextVol);
    const engine = engineRef.current;
    if (engine && isPlayingRef.current && !engine.isDisposed) {
      const now = engine.ctx.currentTime;
      engine.masterGain.gain.cancelScheduledValues(now);
      engine.masterGain.gain.setTargetAtTime(Math.max(nextVol, 0.0001), now, 0.08);
    }
  };

  useEffect(() => {
    return () => {
      const engine = engineRef.current;
      if (!engine) return;
      engine.isDisposed = true;
      isPlayingRef.current = false;
      stopTimers(engine);
      void engine.ctx.close();
      engineRef.current = null;
    };
  }, []);

  if (!isSupported) return null;

  return (
    <div
      role="region"
      aria-label="Background gallery audio player"
      className="inline-flex items-center gap-3 bg-[#F8F3E6] border border-[#221B15]/25 rounded-[2px] px-2.5 py-1.5 shadow-[2px_2px_0px_rgba(34,27,21,0.1)]"
    >
      <button
        type="button"
        onClick={() => void togglePlay()}
        aria-pressed={isPlaying}
        aria-label={isPlaying ? 'Pause ambient audio' : 'Play ambient audio'}
        className={`min-h-[34px] px-3 inline-flex items-center gap-1.5 font-mono-retro text-[10.5px] uppercase tracking-[0.08em] rounded-[2px] transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B84A27] ${
          isPlaying
            ? 'bg-[#B84A27] text-[#F8F3E6] hover:bg-[#221B15]'
            : 'bg-[#221B15] text-[#F8F3E6] hover:bg-[#B84A27]'
        }`}
      >
        {isPlaying ? (
          <Pause className="w-3.5 h-3.5" aria-hidden="true" />
        ) : (
          <Play className="w-3.5 h-3.5" aria-hidden="true" />
        )}
        <span>{isPlaying ? 'Pause' : 'Play'}</span>
      </button>

      <div className="flex flex-col leading-tight pr-1">
        <span className="font-mono-retro text-[10px] uppercase tracking-[0.1em] text-[#221B15] whitespace-nowrap">
          Ambient Tape
        </span>
        <span className="font-mono-retro text-[9.5px] uppercase tracking-[0.08em] text-[#635443] whitespace-nowrap">
          {isPlaying ? 'Playing' : 'Paused'}
        </span>
      </div>

      <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-[#221B15]/15">
        <Volume2 className="w-3.5 h-3.5 text-[#635443]" aria-hidden="true" />
        <input
          type="range"
          min={0.05}
          max={0.95}
          step={0.05}
          value={volume}
          onChange={(e) => handleVolumeChange(Number(e.target.value))}
          aria-label="Ambient audio volume"
          className="w-16 accent-[#B84A27] cursor-pointer"
        />
      </div>
    </div>
  );
}
