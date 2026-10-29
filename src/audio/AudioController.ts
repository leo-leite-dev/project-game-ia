// Motor de áudio da plataforma: música 8-bit rock gerada com Web Audio e
// efeitos sonoros curtos. Não depende de arquivos de mídia (custo R$ 0).
//
// Ciclo de vida: o AudioContext é criado de forma preguiçosa na primeira
// interação do usuário (política de autoplay dos navegadores). `dispose()` para
// timers, destaca nós e fecha o contexto — obrigatório ao encerrar a sessão de
// áudio.

import type { StorageLike } from '../types/domain.ts';
import { DEFAULT_AUDIO_PREFS, readAudioPrefs, writeAudioPrefs, type AudioPrefs } from './audioPrefs.ts';

const STEPS = 16;
const BPM = 148;
const STEP_DURATION = 60 / BPM / 4;
const LOOKAHEAD_SECONDS = 0.12;
const SCHEDULER_INTERVAL_MS = 25;

// Riff em Mi menor (E–G–A–B–D), estilizado em 16 semicolcheias.
const BASS_PATTERN: (number | null)[] = [
  40, 40, null, 40, 43, null, 40, null,
  38, 38, null, 38, 35, null, 38, null,
];
const LEAD_PATTERN: (number | null)[] = [
  76, null, 74, null, 71, null, 67, null,
  74, null, 71, null, 69, null, 67, null,
];
const KICK_STEPS = new Set([0, 4, 8, 10, 12]);
const SNARE_STEPS = new Set([4, 12]);
const HAT_STEPS = new Set([2, 6, 10, 14]);

function midiToFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.AudioContext === 'function';
}

export interface AudioControllerOptions {
  storage?: StorageLike;
}

export class AudioController {
  private readonly storage: StorageLike | null;
  private prefs: AudioPrefs;
  private context: AudioContext | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private schedulerTimer: number | null = null;
  private nextStepTime = 0;
  private stepIndex = 0;
  private musicPlaying = false;

  constructor(options: AudioControllerOptions = {}) {
    this.storage = options.storage ?? null;
    this.prefs = this.storage ? readAudioPrefs(this.storage) : { ...DEFAULT_AUDIO_PREFS };
  }

  get musicVolume(): number {
    return this.prefs.musicVolume;
  }

  get sfxVolume(): number {
    return this.prefs.sfxVolume;
  }

  get muted(): boolean {
    return this.prefs.muted;
  }

  get isMusicPlaying(): boolean {
    return this.musicPlaying;
  }

  /** Cria o contexto e os buses de ganho. Idempotente. Deve vir de gesto do usuário. */
  ensureReady(): boolean {
    if (!isBrowser()) return false;
    if (!this.context) {
      try {
        const Ctor = window.AudioContext;
        const context = new Ctor();
        const musicBus = context.createGain();
        const sfxBus = context.createGain();
        musicBus.connect(context.destination);
        sfxBus.connect(context.destination);
        this.context = context;
        this.musicBus = musicBus;
        this.sfxBus = sfxBus;
        this.applyGains();
        if (this.prefs.musicVolume > 0 && !this.prefs.muted && this.musicPlaying) {
          this.startScheduler();
        }
      } catch {
        // Ambiente sem áudio disponível: controlador permanece inerte.
        return false;
      }
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
    return true;
  }

  setMuted(muted: boolean): void {
    this.prefs = { ...this.prefs, muted };
    this.persist();
    this.applyGains();
    if (muted) this.stopScheduler();
    else if (this.musicPlaying && this.context) this.startScheduler();
  }

  setMusicVolume(volume: number): void {
    this.prefs = { ...this.prefs, musicVolume: Math.min(1, Math.max(0, volume)) };
    this.persist();
    this.applyGains();
  }

  setSfxVolume(volume: number): void {
    this.prefs = { ...this.prefs, sfxVolume: Math.min(1, Math.max(0, volume)) };
    this.persist();
    this.applyGains();
  }

  /** Liga/desliga a música. Retorna o novo estado de reprodução. */
  toggleMusic(): boolean {
    if (this.musicPlaying) {
      this.stopMusic();
      return false;
    }
    this.startMusic();
    return true;
  }

  startMusic(): void {
    this.musicPlaying = true;
    if (!this.ensureReady() || this.prefs.muted) return;
    this.startScheduler();
  }

  stopMusic(): void {
    this.musicPlaying = false;
    this.stopScheduler();
  }

  /** Efeito sonoro curto (click/success/error). Sem contexto, vira no-op. */
  playSfx(kind: 'click' | 'success' | 'error'): void {
    if (this.prefs.muted || !this.ensureReady() || !this.context || !this.sfxBus) return;
    const now = this.context.currentTime;
    const freq = kind === 'click' ? 660 : kind === 'success' ? 880 : 220;
    const duration = kind === 'click' ? 0.05 : 0.12;
    this.playTone(freq, now, duration, 'square', kind === 'error' ? 0.35 : 0.2, this.sfxBus);
    if (kind === 'success') {
      this.playTone(freq * 1.5, now + 0.06, 0.12, 'square', 0.18, this.sfxBus);
    }
  }

  dispose(): void {
    this.stopScheduler();
    this.musicPlaying = false;
    this.musicBus?.disconnect();
    this.sfxBus?.disconnect();
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.noiseBuffer = null;
  }

  private persist(): void {
    if (this.storage) writeAudioPrefs(this.storage, this.prefs);
  }

  private applyGains(): void {
    if (!this.context || !this.musicBus || !this.sfxBus) return;
    const mutedFactor = this.prefs.muted ? 0 : 1;
    this.musicBus.gain.value = this.prefs.musicVolume * mutedFactor;
    this.sfxBus.gain.value = this.prefs.sfxVolume * mutedFactor;
  }

  private startScheduler(): void {
    if (this.schedulerTimer !== null || !this.context) return;
    this.nextStepTime = this.context.currentTime + 0.05;
    this.stepIndex = 0;
    this.schedulerTimer = window.setInterval(() => this.schedulerTick(), SCHEDULER_INTERVAL_MS);
  }

  private stopScheduler(): void {
    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  private schedulerTick(): void {
    if (!this.context || this.prefs.muted) {
      this.stopScheduler();
      return;
    }
    while (this.nextStepTime < this.context.currentTime + LOOKAHEAD_SECONDS) {
      this.scheduleStep(this.stepIndex, this.nextStepTime);
      this.nextStepTime += STEP_DURATION;
      this.stepIndex = (this.stepIndex + 1) % STEPS;
    }
  }

  private scheduleStep(step: number, time: number): void {
    if (!this.context || !this.musicBus) return;
    const bassNote = BASS_PATTERN[step];
    if (bassNote !== null) {
      this.playTone(midiToFrequency(bassNote), time, STEP_DURATION * 0.9, 'square', 0.22, this.musicBus);
    }
    const leadNote = LEAD_PATTERN[step];
    if (leadNote !== null) {
      this.playTone(midiToFrequency(leadNote), time, STEP_DURATION * 0.8, 'square', 0.1, this.musicBus);
    }
    if (KICK_STEPS.has(step)) this.playKick(time);
    if (SNARE_STEPS.has(step)) this.playSnare(time);
    if (HAT_STEPS.has(step)) this.playHat(time);
  }

  private playTone(
    frequency: number,
    time: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    destination: AudioNode,
  ): void {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  private playKick(time: number): void {
    if (!this.context || !this.musicBus) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(160, time);
    oscillator.frequency.exponentialRampToValueAtTime(42, time + 0.09);
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    oscillator.connect(gain);
    gain.connect(this.musicBus);
    oscillator.start(time);
    oscillator.stop(time + 0.14);
  }

  private playSnare(time: number): void {
    this.playNoise(time, 0.11, 1800, 'highpass', 0.28);
  }

  private playHat(time: number): void {
    this.playNoise(time, 0.03, 7000, 'highpass', 0.14);
  }

  private playNoise(
    time: number,
    duration: number,
    frequency: number,
    type: BiquadFilterType,
    volume: number,
  ): void {
    if (!this.context || !this.musicBus) return;
    const source = this.context.createBufferSource();
    source.buffer = this.getNoiseBuffer();
    const filter = this.context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBus);
    source.start(time);
    source.stop(time + duration + 0.02);
  }

  private getNoiseBuffer(): AudioBuffer | null {
    if (!this.context) return null;
    if (!this.noiseBuffer) {
      const buffer = this.context.createBuffer(1, this.context.sampleRate * 0.2, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }
    return this.noiseBuffer;
  }
}
