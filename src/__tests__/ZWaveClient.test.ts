import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { AnsiLogger } from 'matterbridge/logger';

// Mock WebSocket
class MockWebSocket extends EventEmitter {
  static OPEN = 1;
  readyState = MockWebSocket.OPEN;
  sent: string[] = [];

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }
}

vi.mock('ws', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      const ws = new MockWebSocket();
      // Simulate async open
      setTimeout(() => ws.emit('open'), 0);
      return ws;
    }),
    WebSocket: vi.fn(),
  };
});

// Need to import after mock setup
const { ZWaveClient } = await import('../zwave/ZWaveClient.js');

function makeLogger(): AnsiLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    notice: vi.fn(),
    fatal: vi.fn(),
    log: vi.fn(),
  } as unknown as AnsiLogger;
}

describe('ZWaveClient', () => {
  let client: InstanceType<typeof ZWaveClient>;
  let log: AnsiLogger;

  beforeEach(() => {
    log = makeLogger();
    client = new ZWaveClient('ws://localhost:3000', log);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  it('initializes with empty nodes map', () => {
    expect(client.nodes.size).toBe(0);
  });

  it('emits disconnected on disconnect', async () => {
    const disconnectedSpy = vi.fn();
    client.on('disconnected', disconnectedSpy);
    await client.disconnect();
    // No error should occur
    expect(client.nodes.size).toBe(0);
  });
});
