import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { createConnection } from 'node:net';
import { SubserviceClient } from '../../../../src/infrastructure/subservice/subserviceClient.js';
import type { Config } from '../../../../src/infrastructure/config/types.js';
import { makeEnv } from '../../../helpers/env.js';
import { SubserviceOp } from '../../../../src/domain/provider/subservice.provider.js';

vi.mock('node:net', () => ({
  createConnection: vi.fn(),
}));

class FakeSocket extends EventEmitter {
  destroyed = false;
  write = vi.fn((_data: Buffer, cb?: (err?: Error) => void) => {
    cb?.();

    return true;
  });
  destroy = vi.fn(() => {
    this.destroyed = true;
    this.emit('close');
  });
}

function encodeFrame(payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf-8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length, 0);

  return Buffer.concat([header, body]);
}

function lastSentEnvelope(socket: FakeSocket): { op: string; config: unknown; inputs: unknown } {
  const [frame] = socket.write.mock.calls[socket.write.mock.calls.length - 1] as [Buffer];
  const body = frame.subarray(4);

  return JSON.parse(body.toString('utf-8')) as { op: string; config: unknown; inputs: unknown };
}

const CONFIG: Config = {
  mime_to_group: { '*': 'binary' },
  algorithms: {},
  extractors: {},
  subservices: {
    'image-hash': { socket_path: '/var/run/image-hash.sock' },
  },
  pipelines: { binary: { sha256: { algorithm: 'sha256' } } },
};

describe('SubserviceClient', () => {
  let fakeSocket: FakeSocket;

  beforeEach(() => {
    fakeSocket = new FakeSocket();
    vi.mocked(createConnection).mockImplementation(() => {
      queueMicrotask(() => fakeSocket.emit('connect'));

      return fakeSocket as never;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('verifyReachable resolves true once the socket connects', async () => {
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));

    await expect(client.verifyReachable('image-hash')).resolves.toBe(true);
    expect(createConnection).toHaveBeenCalledWith('/var/run/image-hash.sock');
  });

  it('verifyReachable resolves false when no socket_path is configured for the name', async () => {
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));

    await expect(client.verifyReachable('unknown-subservice')).resolves.toBe(false);
  });

  it('batch rejects with a SubserviceUnavailableError naming the subservice when no socket_path is configured', async () => {
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));

    await expect(
      client.batch({ subservice: 'unknown-subservice', op: SubserviceOp.HASH, config: {}, inputs: {} }),
    ).rejects.toThrow('no socket_path configured for subservice "unknown-subservice"');
  });

  it('verifyReachable resolves false when the socket errors before connecting', async () => {
    vi.mocked(createConnection).mockImplementation(() => {
      queueMicrotask(() => fakeSocket.emit('error', new Error('ENOENT')));

      return fakeSocket as never;
    });
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));

    await expect(client.verifyReachable('image-hash')).resolves.toBe(false);
  });

  it('reuses the same connection across multiple calls once connected', async () => {
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));

    await client.verifyReachable('image-hash');
    await client.verifyReachable('image-hash');

    expect(createConnection).toHaveBeenCalledTimes(1);
  });

  it('sends a batch request with its op and resolves outputs from the response frame', async () => {
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));

    const callPromise = client.batch({
      subservice: 'image-hash',
      op: SubserviceOp.HASH,
      config: { algorithm: 'phash' },
      inputs: { '0': { path: '/tmp/asset' } },
    });

    await vi.waitFor(() => {
      expect(fakeSocket.write).toHaveBeenCalled();
    });
    const sent = lastSentEnvelope(fakeSocket);
    expect(sent.op).toBe(SubserviceOp.HASH);
    expect(sent.config).toEqual({ algorithm: 'phash' });
    expect(sent.inputs).toEqual({ '0': { path: '/tmp/asset' } });

    fakeSocket.emit('data', encodeFrame({ outputs: { '0': { hash: 'abc123' } } }));

    await expect(callPromise).resolves.toEqual({ '0': { hash: 'abc123' } });
  });

  it("clears the call's timeout once a response frame is handled — it never fires afterward", async () => {
    vi.useFakeTimers();
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));

    const callPromise = client.batch({
      subservice: 'image-hash',
      op: SubserviceOp.HASH,
      config: {},
      inputs: { '0': { path: '/a' } },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);

    fakeSocket.emit('data', encodeFrame({ outputs: { '0': { hash: 'abc123' } } }));
    await expect(callPromise).resolves.toEqual({ '0': { hash: 'abc123' } });

    expect(vi.getTimerCount()).toBe(0);
  });

  it('encodes each frame with a 4-byte big-endian length prefix matching the JSON body length', async () => {
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));

    void client.batch({ subservice: 'image-hash', op: SubserviceOp.HASH, config: {}, inputs: { '0': { path: '/a' } } });
    await vi.waitFor(() => {
      expect(fakeSocket.write).toHaveBeenCalled();
    });

    const [frame] = fakeSocket.write.mock.calls[0] as [Buffer];
    const declaredLength = frame.readUInt32BE(0);
    const body = frame.subarray(4);

    // Zero-filled header (Buffer.alloc default) would give declaredLength=0 regardless of body.
    expect(declaredLength).toBe(body.length);
    expect(JSON.parse(body.toString('utf-8'))).toEqual({
      op: SubserviceOp.HASH,
      config: {},
      inputs: { '0': { path: '/a' } },
    });
  });

  it('sends an extractor call with op: extract', async () => {
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));

    const callPromise = client.batch({
      subservice: 'image-hash',
      op: SubserviceOp.EXTRACT,
      config: {},
      inputs: { '0': { path: '/tmp/asset' } },
    });

    await vi.waitFor(() => {
      expect(fakeSocket.write).toHaveBeenCalled();
    });
    expect(lastSentEnvelope(fakeSocket).op).toBe(SubserviceOp.EXTRACT);

    fakeSocket.emit('data', encodeFrame({ outputs: { '0': { paths: ['/tmp/a.png'] } } }));

    await expect(callPromise).resolves.toEqual({ '0': { paths: ['/tmp/a.png'] } });
  });

  it('reassembles a frame split across multiple data chunks', async () => {
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));

    const callPromise = client.batch({
      subservice: 'image-hash',
      op: SubserviceOp.HASH,
      config: {},
      inputs: { '0': { path: '/tmp/a' } },
    });
    await vi.waitFor(() => {
      expect(fakeSocket.write).toHaveBeenCalled();
    });
    const frame = encodeFrame({ outputs: { '0': { hash: 'xyz' } } });

    fakeSocket.emit('data', frame.subarray(0, 3));
    fakeSocket.emit('data', frame.subarray(3));

    await expect(callPromise).resolves.toEqual({ '0': { hash: 'xyz' } });
  });

  it('reassembles a frame split so the header arrives before the full body', async () => {
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));

    const callPromise = client.batch({
      subservice: 'image-hash',
      op: SubserviceOp.HASH,
      config: {},
      inputs: { '0': { path: '/tmp/a' } },
    });
    await vi.waitFor(() => {
      expect(fakeSocket.write).toHaveBeenCalled();
    });
    const frame = encodeFrame({ outputs: { '0': { hash: 'partial-body' } } });

    fakeSocket.emit('data', frame.subarray(0, 6));
    fakeSocket.emit('data', frame.subarray(6));

    await expect(callPromise).resolves.toEqual({ '0': { hash: 'partial-body' } });
  });

  it('processes two calls strictly sequentially — the second is not sent until the first resolves', async () => {
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));

    const first = client.batch({
      subservice: 'image-hash',
      op: SubserviceOp.HASH,
      config: {},
      inputs: { '0': { path: '/a' } },
    });
    await vi.waitFor(() => {
      expect(fakeSocket.write).toHaveBeenCalledTimes(1);
    });

    const second = client.batch({
      subservice: 'image-hash',
      op: SubserviceOp.HASH,
      config: {},
      inputs: { '0': { path: '/b' } },
    });
    // Give any (incorrect) immediate send a chance to happen before asserting it didn't.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fakeSocket.write).toHaveBeenCalledTimes(1);

    fakeSocket.emit('data', encodeFrame({ outputs: { '0': { hash: 'first' } } }));
    await expect(first).resolves.toEqual({ '0': { hash: 'first' } });

    await vi.waitFor(() => {
      expect(fakeSocket.write).toHaveBeenCalledTimes(2);
    });
    expect(lastSentEnvelope(fakeSocket).inputs).toEqual({ '0': { path: '/b' } });

    fakeSocket.emit('data', encodeFrame({ outputs: { '0': { hash: 'second' } } }));
    await expect(second).resolves.toEqual({ '0': { hash: 'second' } });
  });

  it('resolves to an empty object when a response omits "outputs"', async () => {
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));

    const callPromise = client.batch({
      subservice: 'image-hash',
      op: SubserviceOp.HASH,
      config: {},
      inputs: { '0': { path: '/a' } },
    });
    await vi.waitFor(() => {
      expect(fakeSocket.write).toHaveBeenCalled();
    });

    fakeSocket.emit('data', encodeFrame({}));

    await expect(callPromise).resolves.toEqual({});
  });

  it('drops a frame received with nothing in flight, without crashing', async () => {
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));
    await client.verifyReachable('image-hash');

    expect(() => fakeSocket.emit('data', encodeFrame({ outputs: { '0': { hash: 'unsolicited' } } }))).not.toThrow();
  });

  it('drops an unparsable frame without crashing, leaving the call pending until it eventually gets a valid one', async () => {
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));

    const callPromise = client.batch({
      subservice: 'image-hash',
      op: SubserviceOp.HASH,
      config: {},
      inputs: { '0': { path: '/a' } },
    });
    await vi.waitFor(() => {
      expect(fakeSocket.write).toHaveBeenCalled();
    });

    const garbage = Buffer.from('not json');
    const header = Buffer.alloc(4);
    header.writeUInt32BE(garbage.length, 0);
    fakeSocket.emit('data', Buffer.concat([header, garbage]));

    fakeSocket.emit('data', encodeFrame({ outputs: { '0': { hash: 'recovered' } } }));

    await expect(callPromise).resolves.toEqual({ '0': { hash: 'recovered' } });
  });

  it('rejects a pending call once the connection drops', async () => {
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));

    const callPromise = client.batch({
      subservice: 'image-hash',
      op: SubserviceOp.HASH,
      config: {},
      inputs: { '0': { path: '/a' } },
    });
    await vi.waitFor(() => {
      expect(fakeSocket.write).toHaveBeenCalled();
    });

    fakeSocket.emit('close');

    await expect(callPromise).rejects.toThrow(/connection dropped/);
  });

  it("clears the in-flight call's timeout when the connection drops so it never fires afterward", async () => {
    vi.useFakeTimers();
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));

    const callPromise = client.batch({
      subservice: 'image-hash',
      op: SubserviceOp.HASH,
      config: {},
      inputs: { '0': { path: '/a' } },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);

    fakeSocket.emit('close');
    await expect(callPromise).rejects.toThrow(/connection dropped/);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects every still-queued call when the connection drops mid in-flight call', async () => {
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));

    const first = client.batch({
      subservice: 'image-hash',
      op: SubserviceOp.HASH,
      config: {},
      inputs: { '0': { path: '/a' } },
    });
    await vi.waitFor(() => {
      expect(fakeSocket.write).toHaveBeenCalledTimes(1);
    });
    const second = client.batch({
      subservice: 'image-hash',
      op: SubserviceOp.HASH,
      config: {},
      inputs: { '0': { path: '/b' } },
    });

    fakeSocket.emit('close');

    await expect(first).rejects.toThrow(/connection dropped/);
    await expect(second).rejects.toThrow(/connection dropped/);
  });

  it('reconnects after a drop on the next call', async () => {
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));
    await client.verifyReachable('image-hash');

    fakeSocket.destroyed = true;
    fakeSocket.emit('close');

    const secondSocket = new FakeSocket();
    vi.mocked(createConnection).mockImplementation(() => {
      queueMicrotask(() => secondSocket.emit('connect'));

      return secondSocket as never;
    });

    await client.verifyReachable('image-hash');

    expect(createConnection).toHaveBeenCalledTimes(2);
  });

  it('rejects when the socket write callback reports an error', async () => {
    vi.useFakeTimers();
    const writeError = new Error('EPIPE');
    fakeSocket.write = vi.fn((_data: Buffer, cb?: (err?: Error) => void) => {
      cb?.(writeError);

      return true;
    });
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));

    const callPromise = client.batch({
      subservice: 'image-hash',
      op: SubserviceOp.HASH,
      config: {},
      inputs: { '0': { path: '/a' } },
    });

    await expect(callPromise).rejects.toThrow(/write failed: EPIPE/);
    await expect(callPromise).rejects.toMatchObject({ cause: writeError });
    // Timer must be cleared, not just left to expire — a second reject() on an
    // already-settled promise is a silent no-op, so check the timer queue directly.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('sends the next queued call after a write failure on the previous one', async () => {
    // Fake-timer delay (not queueMicrotask) so there's a real window to queue 'second'
    // while 'first' is still genuinely in flight.
    vi.useFakeTimers();
    let failNext = true;
    fakeSocket.write = vi.fn((_data: Buffer, cb?: (err?: Error) => void) => {
      setTimeout(() => {
        if (failNext) {
          failNext = false;
          cb?.(new Error('EPIPE'));
        } else {
          cb?.();
        }
      }, 10);

      return true;
    });
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));

    const first = client.batch({
      subservice: 'image-hash',
      op: SubserviceOp.HASH,
      config: {},
      inputs: { '0': { path: '/a' } },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fakeSocket.write).toHaveBeenCalledTimes(1);

    // Queued while 'first' is still in flight — its own pump() call correctly no-ops.
    const second = client.batch({
      subservice: 'image-hash',
      op: SubserviceOp.HASH,
      config: {},
      inputs: { '0': { path: '/b' } },
    });

    // Attach the rejection handler before advancing time, so 'first' never rejects unhandled.
    const firstRejection = expect(first).rejects.toThrow(/write failed: EPIPE/);
    await vi.advanceTimersByTimeAsync(10);
    await firstRejection;

    // Only true if the write-fail handler's own this.pump() call ran.
    expect(fakeSocket.write).toHaveBeenCalledTimes(2);
    fakeSocket.emit('data', encodeFrame({ outputs: { '0': { hash: 'ok' } } }));

    await expect(second).resolves.toEqual({ '0': { hash: 'ok' } });
  });

  it('times out a call that never receives a response, then sends the next queued call', async () => {
    vi.useFakeTimers();
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '50' }));

    const first = client.batch({
      subservice: 'image-hash',
      op: SubserviceOp.HASH,
      config: {},
      inputs: { '0': { path: '/a' } },
    });
    const second = client.batch({
      subservice: 'image-hash',
      op: SubserviceOp.HASH,
      config: {},
      inputs: { '0': { path: '/b' } },
    });

    const firstAssertion = expect(first).rejects.toThrow(/timed out after 50ms/);
    await vi.advanceTimersByTimeAsync(50);
    await firstAssertion;

    expect(fakeSocket.write).toHaveBeenCalledTimes(2);

    fakeSocket.emit('data', encodeFrame({ outputs: { '0': { hash: 'second' } } }));
    await expect(second).resolves.toEqual({ '0': { hash: 'second' } });
  });

  it('close() destroys every open connection and clears pending calls without throwing', async () => {
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));
    await client.verifyReachable('image-hash');

    await expect(client.close()).resolves.toBeUndefined();
    expect(fakeSocket.destroy).toHaveBeenCalled();
  });

  it('close() resolves even when no connection was ever opened', async () => {
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));

    await expect(client.close()).resolves.toBeUndefined();
  });

  it('close() rejects an in-flight call and every still-queued call', async () => {
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));

    const first = client.batch({
      subservice: 'image-hash',
      op: SubserviceOp.HASH,
      config: {},
      inputs: { '0': { path: '/a' } },
    });
    await vi.waitFor(() => {
      expect(fakeSocket.write).toHaveBeenCalledTimes(1);
    });
    const second = client.batch({
      subservice: 'image-hash',
      op: SubserviceOp.HASH,
      config: {},
      inputs: { '0': { path: '/b' } },
    });

    await client.close();

    await expect(first).rejects.toThrow(/client closed/);
    await expect(second).rejects.toThrow(/client closed/);
  });

  it("close() clears the in-flight call's timeout so it never fires after the client is closed", async () => {
    // Check the timer queue directly — vi.waitFor polls via real timers, incompatible with
    // fake timers; advanceTimersByTimeAsync(0) flushes the queueMicrotask-based connect() instead.
    vi.useFakeTimers();
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));

    const callPromise = client.batch({
      subservice: 'image-hash',
      op: SubserviceOp.HASH,
      config: {},
      inputs: { '0': { path: '/a' } },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fakeSocket.write).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);

    await client.close();
    await expect(callPromise).rejects.toThrow(/client closed/);

    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects a call immediately if the connection was already closed', async () => {
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));
    await client.verifyReachable('image-hash');
    await client.close();

    await expect(
      client.batch({ subservice: 'image-hash', op: SubserviceOp.HASH, config: {}, inputs: { '0': { path: '/a' } } }),
    ).rejects.toThrow(/client closed/);
    expect(createConnection).toHaveBeenCalledTimes(1);
  });

  it('rejects every queued call, not just the first, when the underlying connection attempt fails', async () => {
    const socketError = new Error('ECONNREFUSED');
    vi.mocked(createConnection).mockImplementation(() => {
      queueMicrotask(() => fakeSocket.emit('error', socketError));

      return fakeSocket as never;
    });
    const client = new SubserviceClient(CONFIG, makeEnv({ SUBSERVICE_CALL_TIMEOUT_MS: '1000' }));

    const first = client.batch({
      subservice: 'image-hash',
      op: SubserviceOp.HASH,
      config: {},
      inputs: { '0': { path: '/a' } },
    });
    const second = client.batch({
      subservice: 'image-hash',
      op: SubserviceOp.HASH,
      config: {},
      inputs: { '0': { path: '/b' } },
    });

    await expect(first).rejects.toThrow(/socket error: ECONNREFUSED/);
    await expect(second).rejects.toThrow(/socket error: ECONNREFUSED/);
    await expect(first).rejects.toMatchObject({ cause: socketError });
  });
});
