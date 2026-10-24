import { useEffect, useState } from 'react';
import { MicMeter, type MicAudio, type MicEnv, type MicStatus } from '../lib/micMeter.ts';

export { micProblem, type MicStatus } from '../lib/micMeter.ts';

function audioContextCtor(): typeof AudioContext | undefined {
  // Older iOS Safari only has the prefixed constructor.
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

function webAudio(Ctor: typeof AudioContext): MicAudio<MediaStream> {
  const ctx = new Ctor();
  return {
    get state() {
      return ctx.state;
    },
    resume: () => ctx.resume(),
    close: () => ctx.close(),
    analyse(stream) {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      return () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        return Math.sqrt(sum / buf.length);
      };
    },
    onStateChange(listener) {
      ctx.onstatechange = listener;
    },
  };
}

function browserMicEnv(): MicEnv<MediaStream> {
  const Ctor = audioContextCtor();
  const media = navigator.mediaDevices;
  return {
    isSecureContext: window.isSecureContext,
    getUserMedia: media?.getUserMedia
      ? () => media.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      : undefined,
    createAudio: Ctor ? () => webAudio(Ctor) : undefined,
    requestAnimationFrame: (cb) => window.requestAnimationFrame(cb),
    cancelAnimationFrame: (id) => window.cancelAnimationFrame(id),
  };
}

/** React wrapper around MicMeter; the mic is released when the component unmounts. */
export function useMicLevel() {
  const [status, setStatus] = useState<MicStatus>('idle');
  const [meter] = useState(() => new MicMeter(browserMicEnv(), setStatus));
  useEffect(() => meter.stop, [meter]);
  return { status, level: meter.level, start: meter.start, stop: meter.stop };
}
