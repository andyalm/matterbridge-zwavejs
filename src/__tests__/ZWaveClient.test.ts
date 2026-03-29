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

describe('Z-Wave server client', () => {
  let client: InstanceType<typeof ZWaveClient>;
  let log: AnsiLogger;

  beforeEach(() => {
    log = makeLogger();
    client = new ZWaveClient('ws://localhost:3000', log);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  it('starts with no known nodes', () => {
    expect(client.nodes.size).toBe(0);
  });

  describe('connecting to the Z-Wave server', () => {
    it('negotiates the start_listening handshake and signals connected', async () => {
      const connectedSpy = vi.fn();
      client.on('connected', connectedSpy);

      const ws = await connectWithHandshake(client);

      expect(connectedSpy).toHaveBeenCalled();
      expect(ws.sent).toHaveLength(1);
      expect(JSON.parse(ws.sent[0]).command).toBe('start_listening');
    });

    it('discovers all nodes on the network after connecting', async () => {
      await connectWithHandshake(client, [
        { nodeId: 1, status: 4, ready: true, endpoints: [], values: {} },
        { nodeId: 2, status: 4, ready: true, endpoints: [], values: {} },
      ]);

      expect(client.nodes.size).toBe(2);
      expect(client.nodes.has(1)).toBe(true);
      expect(client.nodes.has(2)).toBe(true);
    });

    it('notifies when all nodes are ready', async () => {
      const allNodesReadySpy = vi.fn();
      client.on('allNodesReady', allNodesReadySpy);

      await connectWithHandshake(client, [{ nodeId: 2, status: 4, ready: true, endpoints: [], values: {} }]);

      expect(allNodesReadySpy).toHaveBeenCalledWith(client.nodes);
    });
  });

  describe('sending commands to Z-Wave devices', () => {
    it('sends a set_value command and resolves when the server acknowledges', async () => {
      const ws = await connectWithHandshake(client);

      const setValuePromise = client.setValue(2, { commandClass: 0x25, endpoint: 0, property: 'targetValue' }, true);

      expect(ws.sent.length).toBe(2);
      const setValueMsg = JSON.parse(ws.sent[1]);
      expect(setValueMsg.command).toBe('node.set_value');
      expect(setValueMsg.nodeId).toBe(2);
      expect(setValueMsg.valueId.commandClass).toBe(0x25);
      expect(setValueMsg.value).toBe(true);

      serverSend(ws, {
        type: 'result',
        messageId: setValueMsg.messageId,
        success: true,
        result: {},
      });

      await setValuePromise;
    });

    it('rejects when the server reports a failure', async () => {
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

  describe('receiving Z-Wave events', () => {
    it('reports value changes and updates its node cache', async () => {
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

      const node = client.nodes.get(2)!;
      expect(node.values['37-0-currentValue'].value).toBe(true);
    });

    it('tracks newly reported values that were not in the initial discovery', async () => {
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

    it('reports when a node is removed and cleans up its cache', async () => {
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

    it('reports when a node becomes ready', async () => {
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
  });

  describe('reconnection behavior', () => {
    it('schedules a reconnect when the connection drops unexpectedly', async () => {
      const ws = await connectWithHandshake(client);

      ws.emit('close');

      expect(
        (log.info as ReturnType<typeof vi.fn>).mock.calls.some((call: unknown[]) =>
          String(call[0]).includes('Reconnecting in'),
        ),
      ).toBe(true);
    });

    it('does not reconnect after an explicit disconnect', async () => {
      await connectWithHandshake(client);

      (log.info as ReturnType<typeof vi.fn>).mockClear();

      await client.disconnect();

      expect(
        (log.info as ReturnType<typeof vi.fn>).mock.calls.some((call: unknown[]) =>
          String(call[0]).includes('Reconnecting'),
        ),
      ).toBe(false);
    });
  });

  describe('disconnecting', () => {
    it('rejects any pending commands', async () => {
      const ws = await connectWithHandshake(client);

      const pendingPromise = client.setValue(2, { commandClass: 0x25, endpoint: 0, property: 'targetValue' }, true);

      expect(ws.sent.length).toBe(2);

      await client.disconnect();

      await expect(pendingPromise).rejects.toThrow('Client disconnecting');
    });
  });
});
