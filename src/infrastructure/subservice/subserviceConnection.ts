/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import { createConnection, type Socket } from 'node:net';
import { SubserviceUnavailableError } from '../../domain/errors.js';
import type { SubserviceOp, SubserviceOutputItem } from '../../domain/provider/subservice.provider.js';

// Wire framing: 4-byte BE length prefix + JSON body. Envelope: {op,config,inputs} -> {outputs}.
const LENGTH_PREFIX_BYTES = 4;

interface QueuedCall {
  op: SubserviceOp;
  config: Record<string, unknown>;
  inputs: Record<string, { path: string }>;
  resolve: (outputs: Record<string, SubserviceOutputItem>) => void;
  reject: (err: Error) => void;
}

interface InFlightCall extends QueuedCall {
  timer: NodeJS.Timeout;
}

interface ResponseEnvelope {
  outputs?: Record<string, SubserviceOutputItem>;
}

/** One persistent, strictly-sequential unix-socket connection to a single named subservice. */
export class SubserviceConnection {
  private socket: Socket | undefined;
  private connecting: Promise<Socket> | undefined;
  private buffer = Buffer.alloc(0);
  private readonly queue: QueuedCall[] = [];
  private inFlight: InFlightCall | undefined;
  private closed = false;

  constructor(
    private readonly name: string,
    private readonly socketPath: string,
    private readonly callTimeoutMs: number,
  ) {}

  async connect(): Promise<Socket> {
    if (this.socket !== undefined && !this.socket.destroyed) {
      return this.socket;
    }
    if (this.connecting !== undefined) {
      return this.connecting;
    }

    this.connecting = new Promise<Socket>((resolve, reject) => {
      const socket = createConnection(this.socketPath);

      socket.once('connect', () => {
        this.socket = socket;
        this.connecting = undefined;
        resolve(socket);
      });
      socket.once('error', (err) => {
        this.connecting = undefined;
        reject(SubserviceUnavailableError.socketError(this.name, err));
      });
      socket.on('data', (chunk: Buffer) => {
        this.onData(chunk);
      });
      socket.on('close', () => {
        this.onDisconnect();
      });
    });

    return this.connecting;
  }

  async call(
    op: SubserviceOp,
    config: Record<string, unknown>,
    inputs: Record<string, { path: string }>,
  ): Promise<Record<string, SubserviceOutputItem>> {
    return new Promise<Record<string, SubserviceOutputItem>>((resolve, reject) => {
      if (this.closed) {
        reject(SubserviceUnavailableError.clientClosed(this.name));

        return;
      }

      this.queue.push({ op, config, inputs, resolve, reject });
      this.pump();
    });
  }

  close(): Promise<void> {
    this.closed = true;

    if (this.inFlight) {
      clearTimeout(this.inFlight.timer);
      this.inFlight.reject(SubserviceUnavailableError.clientClosed(this.name));
      this.inFlight = undefined;
    }
    for (const call of this.queue.splice(0)) {
      call.reject(SubserviceUnavailableError.clientClosed(this.name));
    }
    this.socket?.destroy();

    return Promise.resolve();
  }

  /** Connects on demand and sends the next queued call — never more than one in flight. */
  private pump(): void {
    // Stryker disable all
    if (this.inFlight || this.closed || this.queue.length === 0) {
      return;
    }
    // Stryker restore all

    this.connect()
      .then((socket) => {
        this.sendNext(socket);
      })
      .catch((err: unknown) => {
        for (const call of this.queue.splice(0)) {
          // connect() only ever rejects with a real Error (SubserviceUnavailableError).
          /* v8 ignore next */
          call.reject(err instanceof Error ? err : SubserviceUnavailableError.unknownConnectFailure(err));
        }
      });
  }

  private sendNext(socket: Socket): void {
    // The queue may have been drained (by close()) while connect() above was still pending.
    /* v8 ignore next 3 */
    if (this.inFlight || this.closed) {
      return;
    }

    const next = this.queue.shift();

    // Unreachable — pump() already checked queue.length > 0, and nothing else drains it
    // between that check and here (this function runs synchronously off one connect() resolution).
    /* v8 ignore next 3 */
    if (!next) {
      return;
    }

    const timer = setTimeout(() => {
      this.inFlight = undefined;
      next.reject(SubserviceUnavailableError.callTimedOut(this.name, this.callTimeoutMs));
      this.pump();
    }, this.callTimeoutMs);

    this.inFlight = { ...next, timer };

    const frame = this.encode({ op: next.op, config: next.config, inputs: next.inputs });

    socket.write(frame, (err) => {
      if (err && this.inFlight) {
        clearTimeout(this.inFlight.timer);
        this.inFlight = undefined;
        next.reject(SubserviceUnavailableError.writeFailed(this.name, err));
        this.pump();
      }
    });
  }

  private encode(envelope: {
    op: SubserviceOp;
    config: Record<string, unknown>;
    inputs: Record<string, { path: string }>;
  }): Buffer {
    const body = Buffer.from(JSON.stringify(envelope), 'utf-8');
    const header = Buffer.alloc(LENGTH_PREFIX_BYTES);
    header.writeUInt32BE(body.length, 0);

    return Buffer.concat([header, body]);
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    for (;;) {
      // Stryker disable all
      if (this.buffer.length < LENGTH_PREFIX_BYTES) {
        return;
      }

      const bodyLength = this.buffer.readUInt32BE(0);

      if (this.buffer.length < LENGTH_PREFIX_BYTES + bodyLength) {
        return;
      }

      const body = this.buffer.subarray(LENGTH_PREFIX_BYTES, LENGTH_PREFIX_BYTES + bodyLength);
      this.buffer = this.buffer.subarray(LENGTH_PREFIX_BYTES + bodyLength);

      this.handleFrame(body);
    }
  }

  private handleFrame(body: Buffer): void {
    const call = this.inFlight;

    if (!call) {
      // A frame with nothing in flight can't be matched to anything — drop it.
      return;
    }

    let envelope: ResponseEnvelope;

    try {
      envelope = JSON.parse(body.toString('utf-8')) as ResponseEnvelope;
    } catch {
      // Malformed frame can't be trusted as this call's answer — drop it; the call times out.
      return;
    }

    clearTimeout(call.timer);
    this.inFlight = undefined;
    call.resolve(envelope.outputs ?? {});
    this.pump();
  }

  private onDisconnect(): void {
    this.socket = undefined;

    if (this.inFlight) {
      clearTimeout(this.inFlight.timer);
      this.inFlight.reject(SubserviceUnavailableError.connectionDropped(this.name));
      this.inFlight = undefined;
    }
    for (const call of this.queue.splice(0)) {
      call.reject(SubserviceUnavailableError.connectionDropped(this.name));
    }
  }
}
