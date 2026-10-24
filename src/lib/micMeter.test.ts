import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MicMeter, statusForError, type MicAudio, type MicEnv, type MicStatus, type MicStream, type MicTrack } from './micMeter.ts';

class FakeTrack implements MicTrack {
  stopped = false;
  private ended: (() => void)[] = [];
  stop() {
    this.stopped = true;
  }
  addEventListener(_type: 'ended', listener: () => void) {
    this.ended.push(listener);
  }
  end() {
    this.ended.forEach((fn) => fn());
  }
}

class FakeStream implements MicStream {
  readonly track = new FakeTrack();
  getTracks() {
    return [this.track];
  }
}

class FakeAudio implements MicAudio<FakeStream> {
  state = 'suspended';
  closed = false;
  analysing = false;
  async resume() {
    this.state = 'running';
  }
  async close() {
    this.closed = true;
    this.state = 'closed';
  }
  analyse() {
    this.analysing = true;
    return () => 0.1;
  }
  onStateChange() {}
}

/** A permission prompt we can answer whenever the test wants. */
function setup(overrides: Partial<MicEnv<FakeStream>> = {}) {
  let grant!: (s: FakeStream) => void;
  let deny!: (e: Error) => void;
  const audios: FakeAudio[] = [];
  const statuses: MicStatus[] = [];
  let frames = 0;
  const env: MicEnv<FakeStream> = {
    isSecureContext: true,
    getUserMedia: () =>
      new Promise<FakeStream>((resolve, reject) => {
        grant = resolve;
        deny = reject;
      }),
    createAudio: () => {
      const a = new FakeAudio();
      audios.push(a);
      return a;
    },
    requestAnimationFrame: () => ++frames,
    cancelAnimationFrame: () => {},
    ...overrides,
  };
  const meter = new MicMeter(env, (s) => statuses.push(s));
  return { meter, audios, statuses, grant: (s: FakeStream) => grant(s), deny: (e: Error) => deny(e), frames: () => frames };
}

const named = (name: string) => Object.assign(new Error(name), { name });

test('a granted mic goes live and is fully released by stop()', async () => {
  const { meter, audios, statuses, grant } = setup();
  const started = meter.start();
  const stream = new FakeStream();
  grant(stream);
  assert.equal(await started, 'live');
  assert.deepEqual(statuses, ['requesting', 'live']);
  assert.ok(audios[0].analysing);

  meter.stop();
  assert.equal(stream.track.stopped, true);
  assert.equal(audios[0].closed, true);
  assert.equal(meter.level.current, 0);
});

test('permission granted after stop() is released instead of left running', async () => {
  const { meter, audios, statuses, grant, frames } = setup();
  const started = meter.start();
  meter.stop(); // e.g. the fight was closed while the prompt was still up
  const stream = new FakeStream();
  grant(stream);

  assert.equal(await started, 'idle');
  assert.equal(stream.track.stopped, true, 'the mic track must be stopped');
  assert.equal(audios[0].closed, true);
  assert.equal(audios[0].analysing, false);
  assert.equal(frames(), 0, 'no metering loop should start');
  assert.deepEqual(statuses, ['requesting']);
});

test('stop() while the audio context is still resuming releases the mic', async () => {
  let finishResume!: () => void;
  const audio = new FakeAudio();
  audio.resume = () =>
    new Promise<void>((resolve) => {
      finishResume = () => {
        audio.state = 'running';
        resolve();
      };
    });
  const { meter, statuses, grant } = setup({ createAudio: () => audio });
  const started = meter.start();
  const stream = new FakeStream();
  grant(stream);
  await new Promise((r) => setImmediate(r)); // let start() reach its await on resume()
  meter.stop();
  finishResume();

  assert.equal(await started, 'idle');
  assert.equal(stream.track.stopped, true, 'the mic track must be stopped');
  assert.equal(audio.closed, true);
  assert.equal(audio.analysing, false);
  assert.ok(!statuses.includes('live'), 'no status update after disposal');
});

test('a fresh start after a cancelled one asks again rather than reusing the stale request', async () => {
  const { meter, grant } = setup();
  const first = meter.start();
  meter.stop();
  const second = meter.start();
  assert.notEqual(first, second);
  grant(new FakeStream());
  assert.equal(await second, 'live');
});

test('concurrent starts share one permission request', () => {
  const { meter } = setup();
  assert.equal(meter.start(), meter.start());
});

test('denial and missing APIs map to a status without throwing', async () => {
  const denied = setup();
  const started = denied.meter.start();
  denied.deny(named('NotAllowedError'));
  assert.equal(await started, 'denied');
  assert.equal(denied.audios[0].closed, true);

  assert.equal(await setup({ isSecureContext: false }).meter.start(), 'insecure');
  assert.equal(await setup({ getUserMedia: undefined }).meter.start(), 'unsupported');
});

test('a track ending while live reports the mic as ended', async () => {
  const { meter, statuses, grant } = setup();
  const started = meter.start();
  const stream = new FakeStream();
  grant(stream);
  await started;
  stream.track.end();
  assert.equal(statuses.at(-1), 'ended');
  assert.equal(stream.track.stopped, true);
});

test('getUserMedia errors map to user-facing statuses', () => {
  assert.equal(statusForError(named('SecurityError')), 'denied');
  assert.equal(statusForError(named('NotReadableError')), 'unavailable');
  assert.equal(statusForError(named('AbortError')), 'error');
  assert.equal(statusForError('weird'), 'error');
});
