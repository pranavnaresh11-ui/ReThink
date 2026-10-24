export type MicStatus =
  | 'idle'
  | 'requesting'
  | 'live'
  /** The user or browser refused permission. */
  | 'denied'
  /** No microphone, or another app is holding it. */
  | 'unavailable'
  /** getUserMedia only exists on https (or localhost). */
  | 'insecure'
  | 'unsupported'
  /** The mic was live but the track ended or audio was interrupted (e.g. a phone call). */
  | 'ended'
  | 'error';

/** Why the mic isn't usable, phrased for the person holding the phone. */
export function micProblem(status: MicStatus): string | null {
  switch (status) {
    case 'denied':
      return 'Microphone access is blocked. You can allow it in your browser’s site settings.';
    case 'unavailable':
      return 'No microphone was found, or another app is using it.';
    case 'insecure':
      return 'The microphone only works over a secure (https) connection.';
    case 'unsupported':
      return 'This browser can’t measure the microphone.';
    case 'ended':
      return 'The microphone stopped, maybe because another app took it.';
    case 'error':
      return 'The microphone couldn’t start.';
    default:
      return null;
  }
}

export function statusForError(err: unknown): MicStatus {
  const name = err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'NotReadableError' || name === 'OverconstrainedError') return 'unavailable';
  return 'error';
}

export interface MicTrack {
  stop(): void;
  addEventListener(type: 'ended', listener: () => void): void;
}

export interface MicStream {
  getTracks(): MicTrack[];
}

export interface MicAudio<S extends MicStream> {
  readonly state: string;
  resume(): Promise<void>;
  close(): Promise<void>;
  /** Starts analysing `stream`; the returned function reads the current RMS level. */
  analyse(stream: S): () => number;
  onStateChange(listener: () => void): void;
}

/** The browser APIs the meter needs, injected so the lifecycle can be tested without a browser. */
export interface MicEnv<S extends MicStream> {
  isSecureContext: boolean;
  /** Undefined when the browser can't capture audio. */
  getUserMedia?: () => Promise<S>;
  /** Undefined when Web Audio is missing. */
  createAudio?: () => MicAudio<S>;
  requestAnimationFrame(cb: () => void): number;
  cancelAnimationFrame(id: number): void;
}

/**
 * Microphone RMS level (0..1), the web equivalent of AVAudioRecorder metering. Blowing
 * across a mic produces broadband noise with a big, steady RMS, which is what the breathing
 * games measure. Audio is analysed in memory and never recorded, stored or sent anywhere.
 */
export class MicMeter<S extends MicStream> {
  readonly level = { current: 0 };
  private stream: S | null = null;
  private audio: MicAudio<S> | null = null;
  private raf = 0;
  private pending: Promise<MicStatus> | null = null;
  /** Bumped by stop(), so a permission grant that arrives afterwards is released, not used. */
  private generation = 0;
  private readonly env: MicEnv<S>;
  private readonly onStatus: (s: MicStatus) => void;

  constructor(env: MicEnv<S>, onStatus: (s: MicStatus) => void) {
    this.env = env;
    this.onStatus = onStatus;
  }

  readonly stop = (): void => {
    this.generation++;
    this.pending = null;
    this.env.cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.audio && this.audio.state !== 'closed') void this.audio.close().catch(() => {});
    this.stream = null;
    this.audio = null;
    this.level.current = 0;
  };

  /**
   * Must be called straight from a tap: iOS Safari only lets audio start running inside a
   * user gesture, so the audio context is created and resumed before awaiting permission.
   */
  readonly start = (): Promise<MicStatus> => {
    if (this.stream) return Promise.resolve<MicStatus>('live');
    if (this.pending) return this.pending;

    const fail = (s: MicStatus) => {
      this.onStatus(s);
      return Promise.resolve(s);
    };
    if (!this.env.isSecureContext) return fail('insecure');
    const { getUserMedia, createAudio } = this.env;
    if (!getUserMedia || !createAudio) return fail('unsupported');

    const audio = createAudio();
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
    this.onStatus('requesting');
    const generation = this.generation;
    const current = () => generation === this.generation;

    const attempt = (async (): Promise<MicStatus> => {
      let stream: S;
      try {
        stream = await getUserMedia();
      } catch (err) {
        void audio.close().catch(() => {});
        if (!current()) return 'idle';
        const s = statusForError(err);
        this.onStatus(s);
        return s;
      } finally {
        if (current()) this.pending = null;
      }
      if (current() && audio.state === 'suspended') await audio.resume().catch(() => {});
      // Checked after the last await: the fight may have closed while the permission prompt
      // was up or while audio was resuming. Either way, don't leave the mic running.
      if (!current()) {
        stream.getTracks().forEach((t) => t.stop());
        void audio.close().catch(() => {});
        return 'idle';
      }

      const read = audio.analyse(stream);
      const loop = () => {
        // Light smoothing so the UI doesn't flicker.
        this.level.current = this.level.current * 0.7 + Math.min(1, read() * 4) * 0.3;
        this.raf = this.env.requestAnimationFrame(loop);
      };
      const lost = () => {
        if (this.stream !== stream) return;
        this.stop();
        this.onStatus('ended');
      };
      stream.getTracks().forEach((t) => t.addEventListener('ended', lost));
      // Phone calls and Siri suspend ("interrupted" on iOS) the context. Try once to resume.
      audio.onStateChange(() => {
        if (audio.state === 'running' || audio.state === 'closed') return;
        audio.resume().catch(lost);
      });

      this.stream = stream;
      this.audio = audio;
      loop();
      this.onStatus('live');
      return 'live';
    })();
    this.pending = attempt;
    return attempt;
  };
}
