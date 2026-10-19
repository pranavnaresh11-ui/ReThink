import { useCallback, useEffect, useRef, useState } from 'react';

export type MicStatus = 'idle' | 'requesting' | 'live' | 'denied' | 'unsupported';

/**
 * Microphone RMS level (0..1), the web equivalent of AVAudioRecorder metering.
 * Blowing across a mic produces broadband noise with a big, steady RMS, which is
 * what the breathing games measure.
 */
export function useMicLevel() {
  const [status, setStatus] = useState<MicStatus>('idle');
  const level = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const raf = useRef(0);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    void ctx.current?.close();
    stream.current = null;
    ctx.current = null;
    level.current = 0;
  }, []);

  /** Resolves true once the mic is live, false if it's unavailable or denied. */
  const start = useCallback(async (): Promise<boolean> => {
    if (stream.current) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      return false;
    }
    setStatus('requesting');
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const audio = new AudioContext();
      const analyser = audio.createAnalyser();
      analyser.fftSize = 1024;
      audio.createMediaStreamSource(s).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const loop = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        // Light smoothing so the UI doesn't flicker.
        level.current = level.current * 0.7 + Math.min(1, rms * 4) * 0.3;
        raf.current = requestAnimationFrame(loop);
      };
      stream.current = s;
      ctx.current = audio;
      loop();
      setStatus('live');
      return true;
    } catch {
      setStatus('denied');
      return false;
    }
  }, []);

  useEffect(() => stop, [stop]);

  return { status, level, start, stop };
}
