import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('matterbridge', () => import('./helpers/matterbridgeMock.js'));
vi.mock('matterbridge/logger', () => ({}));

// Mock ZWaveClient to avoid WebSocket I/O
class FakeZWaveClient extends EventEmitter {
  nodes = new Map();
  setValue = vi.fn().mockResolvedValue(undefined);
  async connect() {}
  async disconnect() {}
}

let fakeClient: FakeZWaveClient;
vi.mock('../zwave/ZWaveClient.js', () => {
  return {
    ZWaveClient: vi.fn().mockImplementation(() => {
      fakeClient = new FakeZWaveClient();
      return fakeClient;
    }),
  };
});

import { ZWaveJSPlatform } from '../platform.js';
import { CommandClass } from '../zwave/types.js';
import type { ZWaveNode } from '../zwave/types.js';
import { makeLogger, makeNode, makeEndpoint, makeValues } from './helpers/testUtils.js';

function makePlatform(configOverrides: Record<string, unknown> = {}) {
  const log = makeLogger();
  const config = { serverUrl: 'ws://localhost:3000', excludeNodes: [], includeNodes: [], ...configOverrides };
  const matterbridge = {};
  const platform = new ZWaveJSPlatform(matterbridge as never, log as never, config as never);
  return { platform, log, config };
}

/** Access the private devices map for assertions. */
function getDevicesMap(platform: ZWaveJSPlatform): Map<string, unknown> {
  return (platform as unknown as { devices: Map<string, unknown> }).devices;
}

/** Emit allNodesReady and wait for async processing. */
async function discoverNodes(nodes: Map<number, ZWaveNode>) {
  fakeClient.emit('allNodesReady', nodes);
  await new Promise((r) => setTimeout(r, 10));
}

function binarySwitchNode(nodeId: number, overrides: Partial<ZWaveNode> = {}): ZWaveNode {
  return makeNode({
    nodeId,
    endpoints: [makeEndpoint([CommandClass.BinarySwitch])],
    values: makeValues({
      commandClass: CommandClass.BinarySwitch,
      property: 'currentValue',
      value: false,
    }),
    ...overrides,
  });
}

describe('discovering Z-Wave devices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips the Z-Wave controller node', async () => {
    const { platform } = makePlatform();
    await platform.onStart('test');

    const nodes = new Map<number, ZWaveNode>();
    nodes.set(1, binarySwitchNode(1));
    nodes.set(2, binarySwitchNode(2));

    await discoverNodes(nodes);

    const devices = getDevicesMap(platform);
    expect(devices.size).toBe(1);
    expect([...devices.keys()][0]).toMatch(/^2-/);

    await platform.onShutdown('test');
  });

  it('only registers nodes in the include list when configured', async () => {
    const { platform } = makePlatform({ includeNodes: [3] });
    await platform.onStart('test');

    const nodes = new Map<number, ZWaveNode>();
    nodes.set(2, binarySwitchNode(2));

    await discoverNodes(nodes);

    expect(getDevicesMap(platform).size).toBe(0);

    await platform.onShutdown('test');
  });

  it('skips nodes in the exclude list', async () => {
    const { platform } = makePlatform({ excludeNodes: [2] });
    await platform.onStart('test');

    const nodes = new Map<number, ZWaveNode>();
    nodes.set(2, binarySwitchNode(2));

    await discoverNodes(nodes);

    expect(getDevicesMap(platform).size).toBe(0);

    await platform.onShutdown('test');
  });

  it('skips nodes that are not yet ready', async () => {
    const { platform } = makePlatform();
    await platform.onStart('test');

    const nodes = new Map<number, ZWaveNode>();
    nodes.set(2, binarySwitchNode(2, { ready: false, interviewStage: 'ProtocolInfo' }));

    await discoverNodes(nodes);

    expect(getDevicesMap(platform).size).toBe(0);

    await platform.onShutdown('test');
  });

  it('registers a Matter device for each mapped Z-Wave endpoint', async () => {
    const { platform } = makePlatform();
    await platform.onStart('test');

    const nodes = new Map<number, ZWaveNode>();
    nodes.set(2, binarySwitchNode(2));

    await discoverNodes(nodes);

    expect(getDevicesMap(platform).size).toBe(1);

    await platform.onShutdown('test');
  });
});

describe('receiving Z-Wave value updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards the update to the correct device handler without errors', async () => {
    const { platform, log } = makePlatform();
    await platform.onStart('test');

    const nodes = new Map<number, ZWaveNode>();
    nodes.set(2, binarySwitchNode(2));
    await discoverNodes(nodes);

    fakeClient.emit('valueUpdated', 2, {
      commandClass: CommandClass.BinarySwitch,
      commandClassName: 'Binary Switch',
      endpoint: 0,
      property: 'currentValue',
      newValue: true,
      prevValue: false,
    });
    await new Promise((r) => setTimeout(r, 10));

    const errorCalls = (log.error as ReturnType<typeof vi.fn>).mock.calls;
    const handlerErrors = errorCalls.filter((c: unknown[]) => String(c[0]).includes('Error handling value update'));
    expect(handlerErrors).toHaveLength(0);

    await platform.onShutdown('test');
  });
});

describe('removing Z-Wave nodes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('unregisters the device when a node is removed from the network', async () => {
    const { platform } = makePlatform();
    await platform.onStart('test');

    const nodes = new Map<number, ZWaveNode>();
    nodes.set(2, binarySwitchNode(2));
    await discoverNodes(nodes);

    expect(getDevicesMap(platform).size).toBe(1);

    fakeClient.emit('nodeRemoved', 2);
    await new Promise((r) => setTimeout(r, 10));

    expect(getDevicesMap(platform).size).toBe(0);

    await platform.onShutdown('test');
  });
});

describe('shutting down', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disconnects from the Z-Wave server', async () => {
    const { platform } = makePlatform();
    await platform.onStart('test');

    await platform.onShutdown('test');

    // Should not throw on repeated shutdown
    await platform.onShutdown('test');
  });
});
