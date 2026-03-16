import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { AnsiLogger } from 'matterbridge/logger';

// Track created WebSocket instances for test access
let lastCreatedWs: MockWebSocket;

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

  removeAllListeners() {
    super.removeAllListeners();
    return this;
  }
}

// The default export must act as a constructor AND have WebSocket.OPEN = 1
const MockWSConstructor = vi.fn().mockImplementation(() => {
  const ws = new MockWebSocket();
  lastCreatedWs = ws;
  // Simulate async open (use queueMicrotask to avoid fake timer issues)
  queueMicrotask(() => ws.emit('open'));
  return ws;
}) as unknown as typeof MockWebSocket;
// Attach the OPEN constant so `WebSocket.OPEN` works in source code
(MockWSConstructor as Record<string, unknown>).OPEN = 1;

vi.mock('ws', () => {
  return {
    default: MockWSConstructor,
    WebSocket: MockWSConstructor,
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

/** Simulate a server sending a message to the WebSocket. */
function serverSend(ws: MockWebSocket, msg: Record<string, unknown>) {
  ws.emit('message', Buffer.from(JSON.stringify(msg)));
}

/** Simulate the full version + start_listening handshake, returning the ws. */
async function connectWithHandshake(
  client: InstanceType<typeof ZWaveClient>,
  nodes: Record<string, unknown>[] = [],
): Promise<MockWebSocket> {
  const connectPromise = client.connect();

  // Let microtask (open event) run
  await new Promise((r) => queueMicrotask(r));
  const ws = lastCreatedWs;

  // Server sends version message (triggers start_listening)
  serverSend(ws, {
    type: 'version',
    driverVersion: '1.0.0',
    serverVersion: '1.0.0',
    homeId: 12345,
  });

  // start_listening is called synchronously in the message handler chain
  // (startListening returns a promise but sendCommand is sync up to the ws.send call)
  expect(ws.sent.length).toBeGreaterThan(0);

  // Parse the start_listening request to get its messageId
  const startListeningMsg = JSON.parse(ws.sent[0]);
  expect(startListeningMsg.command).toBe('start_listening');

  // Server responds with result
  serverSend(ws, {
    type: 'result',
    messageId: startListeningMsg.messageId,
    success: true,
    result: {
      state: {
        controller: { homeId: 12345, ownNodeId: 1 },
        nodes,
      },
    },
  });

  await connectPromise;
  return ws;
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
    expect(client.nodes.size).toBe(0);
  });

  describe('connection flow', () => {
    it('sends start_listening after receiving version message and emits connected', async () => {
      const connectedSpy = vi.fn();
      client.on('connected', connectedSpy);

      const ws = await connectWithHandshake(client);

      expect(connectedSpy).toHaveBeenCalled();
      expect(ws.sent).toHaveLength(1);
      expect(JSON.parse(ws.sent[0]).command).toBe('start_listening');
    });

    it('populates nodes map from start_listening result', async () => {
      await connectWithHandshake(client, [
        { nodeId: 1, status: 4, ready: true, endpoints: [], values: {} },
        { nodeId: 2, status: 4, ready: true, endpoints: [], values: {} },
      ]);

      expect(client.nodes.size).toBe(2);
      expect(client.nodes.has(1)).toBe(true);
      expect(client.nodes.has(2)).toBe(true);
    });

    it('emits allNodesReady with the nodes map', async () => {
      const allNodesReadySpy = vi.fn();
      client.on('allNodesReady', allNodesReadySpy);

      await connectWithHandshake(client, [{ nodeId: 2, status: 4, ready: true, endpoints: [], values: {} }]);

      expect(allNodesReadySpy).toHaveBeenCalledWith(client.nodes);
    });
  });

  describe('setValue', () => {
    it('sends a set_value command and resolves on success', async () => {
      const ws = await connectWithHandshake(client);

      const setValuePromise = client.setValue(2, { commandClass: 0x25, endpoint: 0, property: 'targetValue' }, true);

      // Find the setValue message (second message after start_listening)
      expect(ws.sent.length).toBe(2);
      const setValueMsg = JSON.parse(ws.sent[1]);
      expect(setValueMsg.command).toBe('node.set_value');
      expect(setValueMsg.nodeId).toBe(2);
      expect(setValueMsg.valueId.commandClass).toBe(0x25);
      expect(setValueMsg.value).toBe(true);

      // Server responds with success
      serverSend(ws, {
        type: 'result',
        messageId: setValueMsg.messageId,
        success: true,
        result: {},
      });

      await setValuePromise;
    });

    it('rejects when server responds with failure', async () => {
      const ws = await connectWithHandshake(client);

      const setValuePromise = client.setValue(2, { commandClass: 0x25, endpoint: 0, property: 'targetValue' }, true);

      const setValueMsg = JSON.parse(ws.sent[1]);

      serverSend(ws, {
        type: 'result',
        messageId: setValueMsg.messageId,
        success: false,
        errorCode: 'node_timeout',
      });

      await expect(setValuePromise).rejects.toThrow('Command failed: node_timeout');
    });
  });

  describe('event handling', () => {
    it('emits valueUpdated and updates node cache on value updated event', async () => {
      const ws = await connectWithHandshake(client, [
        {
          nodeId: 2,
          status: 4,
          ready: true,
          endpoints: [],
          values: {
            '37-0-currentValue': {
              commandClass: 0x25,
              endpoint: 0,
              property: 'currentValue',
              value: false,
            },
          },
        },
      ]);

      const valueUpdatedSpy = vi.fn();
      client.on('valueUpdated', valueUpdatedSpy);

      serverSend(ws, {
        type: 'event',
        event: {
          source: 'node',
          event: 'value updated',
          nodeId: 2,
          args: {
            commandClass: 0x25,
            commandClassName: 'Binary Switch',
            endpoint: 0,
            property: 'currentValue',
            newValue: true,
            prevValue: false,
          },
        },
      });

      expect(valueUpdatedSpy).toHaveBeenCalledWith(
        2,
        expect.objectContaining({
          commandClass: 0x25,
          property: 'currentValue',
          newValue: true,
        }),
      );

      // Node cache should be updated
      const node = client.nodes.get(2)!;
      expect(node.values['37-0-currentValue'].value).toBe(true);
    });

    it('emits nodeRemoved and cleans up nodes map', async () => {
      const ws = await connectWithHandshake(client, [{ nodeId: 2, status: 4, ready: true, endpoints: [], values: {} }]);

      const nodeRemovedSpy = vi.fn();
      client.on('nodeRemoved', nodeRemovedSpy);

      serverSend(ws, {
        type: 'event',
        event: { source: 'node', event: 'node removed', nodeId: 2 },
      });

      expect(nodeRemovedSpy).toHaveBeenCalledWith(2);
      expect(client.nodes.has(2)).toBe(false);
    });

    it('emits nodeReady and sets ready flag', async () => {
      const ws = await connectWithHandshake(client, [
        { nodeId: 2, status: 4, ready: false, endpoints: [], values: {} },
      ]);

      const nodeReadySpy = vi.fn();
      client.on('nodeReady', nodeReadySpy);

      serverSend(ws, {
        type: 'event',
        event: { source: 'node', event: 'ready', nodeId: 2 },
      });

      expect(nodeReadySpy).toHaveBeenCalled();
      expect(client.nodes.get(2)!.ready).toBe(true);
    });

    it('creates new value entry when value updated event has unknown key', async () => {
      const ws = await connectWithHandshake(client, [{ nodeId: 2, status: 4, ready: true, endpoints: [], values: {} }]);

      serverSend(ws, {
        type: 'event',
        event: {
          source: 'node',
          event: 'value updated',
          nodeId: 2,
          args: {
            commandClass: 0x31,
            commandClassName: 'Multilevel Sensor',
            endpoint: 0,
            property: 'Air temperature',
            newValue: 22.5,
            prevValue: undefined,
          },
        },
      });

      const node = client.nodes.get(2)!;
      const newValue = node.values['49-0-Air temperature'];
      expect(newValue).toBeDefined();
      expect(newValue.value).toBe(22.5);
      expect(newValue.commandClass).toBe(0x31);
    });
  });

  describe('reconnection', () => {
    it('schedules reconnect on unexpected WebSocket close', async () => {
      const ws = await connectWithHandshake(client);

      // Simulate unexpected close
      ws.emit('close');

      // Should log reconnection info
      expect(
        (log.info as ReturnType<typeof vi.fn>).mock.calls.some((call: unknown[]) =>
          String(call[0]).includes('Reconnecting in'),
        ),
      ).toBe(true);
    });

    it('does not reconnect after explicit disconnect', async () => {
      await connectWithHandshake(client);

      // Clear log calls from connection
      (log.info as ReturnType<typeof vi.fn>).mockClear();

      await client.disconnect();

      // After disconnect, no reconnect should be logged
      expect(
        (log.info as ReturnType<typeof vi.fn>).mock.calls.some((call: unknown[]) =>
          String(call[0]).includes('Reconnecting'),
        ),
      ).toBe(false);
    });
  });

  describe('disconnect cleanup', () => {
    it('rejects pending requests on disconnect', async () => {
      const ws = await connectWithHandshake(client);

      // Start a command that won't get a response
      const pendingPromise = client.setValue(2, { commandClass: 0x25, endpoint: 0, property: 'targetValue' }, true);

      expect(ws.sent.length).toBe(2);

      // Disconnect while command is pending
      await client.disconnect();

      await expect(pendingPromise).rejects.toThrow('Client disconnecting');
    });
  });
});
