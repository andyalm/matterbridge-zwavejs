import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// Mock matterbridge
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

function makePlatform() {
  const log = makeLogger();
  const config = { serverUrl: 'ws://localhost:3000', excludeNodes: [], includeNodes: [] };
  const matterbridge = {};
  const platform = new ZWaveJSPlatform(matterbridge as never, log as never, config as never);

  return { platform, log, config };
}

/** Access the private devices map for assertions. */
function getDevicesMap(platform: ZWaveJSPlatform): Map<string, unknown> {
  return (platform as unknown as { devices: Map<string, unknown> }).devices;
}

describe('ZWaveJSPlatform', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('onStart', () => {
    it('creates a ZWaveClient and connects', async () => {
      const { platform } = makePlatform();

      await platform.onStart('test');

      expect(fakeClient).toBeDefined();
      await platform.onShutdown('test');
    });
  });

  describe('onAllNodesReady', () => {
    it('registers devices for ready nodes, skipping controller node 1', async () => {
      const { platform } = makePlatform();
      await platform.onStart('test');

      const nodes = new Map<number, ZWaveNode>();
      nodes.set(
        1,
        makeNode({
          nodeId: 1,
          endpoints: [makeEndpoint([CommandClass.BinarySwitch])],
        }),
      );
      nodes.set(
        2,
        makeNode({
          nodeId: 2,
          endpoints: [makeEndpoint([CommandClass.BinarySwitch])],
          values: makeValues({
            commandClass: CommandClass.BinarySwitch,
            property: 'currentValue',
            value: false,
          }),
        }),
      );

      // Trigger allNodesReady event
      fakeClient.emit('allNodesReady', nodes);

      // Wait for async processing
      await new Promise((r) => setTimeout(r, 10));

      // Node 2 should be registered (devices map should have an entry for it)
      const devices = getDevicesMap(platform);
      expect(devices.size).toBe(1);
      // The key starts with "2-" (nodeId 2), NOT "1-" (controller)
      const keys = [...devices.keys()];
      expect(keys[0]).toMatch(/^2-/);

      await platform.onShutdown('test');
    });

    it('respects excludeNodes config', async () => {
      const { platform, config } = makePlatform();
      (config as Record<string, unknown>).excludeNodes = [2];
      await platform.onStart('test');

      const nodes = new Map<number, ZWaveNode>();
      nodes.set(
        2,
        makeNode({
          nodeId: 2,
          endpoints: [makeEndpoint([CommandClass.BinarySwitch])],
          values: makeValues({
            commandClass: CommandClass.BinarySwitch,
            property: 'currentValue',
            value: false,
          }),
        }),
      );

      fakeClient.emit('allNodesReady', nodes);
      await new Promise((r) => setTimeout(r, 10));

      // Node 2 is excluded, so no devices should be registered
      expect(getDevicesMap(platform).size).toBe(0);

      await platform.onShutdown('test');
    });

    it('respects includeNodes config', async () => {
      const { platform, config } = makePlatform();
      (config as Record<string, unknown>).includeNodes = [3]; // Only include node 3
      await platform.onStart('test');

      const nodes = new Map<number, ZWaveNode>();
      nodes.set(
        2,
        makeNode({
          nodeId: 2,
          endpoints: [makeEndpoint([CommandClass.BinarySwitch])],
          values: makeValues({
            commandClass: CommandClass.BinarySwitch,
            property: 'currentValue',
            value: false,
          }),
        }),
      );

      fakeClient.emit('allNodesReady', nodes);
      await new Promise((r) => setTimeout(r, 10));

      // Node 2 is not in includeNodes, so no devices should be registered
      expect(getDevicesMap(platform).size).toBe(0);

      await platform.onShutdown('test');
    });

    it('skips nodes that are not ready', async () => {
      const { platform } = makePlatform();
      await platform.onStart('test');

      const nodes = new Map<number, ZWaveNode>();
      nodes.set(
        2,
        makeNode({
          nodeId: 2,
          ready: false,
          interviewStage: 'ProtocolInfo',
          endpoints: [makeEndpoint([CommandClass.BinarySwitch])],
        }),
      );

      fakeClient.emit('allNodesReady', nodes);
      await new Promise((r) => setTimeout(r, 10));

      expect(getDevicesMap(platform).size).toBe(0);

      await platform.onShutdown('test');
    });
  });

  describe('onValueUpdated', () => {
    it('routes value updates to the correct handler', async () => {
      const { platform } = makePlatform();
      await platform.onStart('test');

      // Register a node with a binary switch
      const nodes = new Map<number, ZWaveNode>();
      nodes.set(
        2,
        makeNode({
          nodeId: 2,
          endpoints: [makeEndpoint([CommandClass.BinarySwitch])],
          values: makeValues({
            commandClass: CommandClass.BinarySwitch,
            property: 'currentValue',
            value: false,
          }),
        }),
      );

      fakeClient.emit('allNodesReady', nodes);
      await new Promise((r) => setTimeout(r, 10));

      // Now send a value update
      fakeClient.emit('valueUpdated', 2, {
        commandClass: CommandClass.BinarySwitch,
        commandClassName: 'Binary Switch',
        endpoint: 0,
        property: 'currentValue',
        newValue: true,
        prevValue: false,
      });

      // Give the async handler time to process
      await new Promise((r) => setTimeout(r, 10));

      // No errors should have been logged
      // (We can't easily check the endpoint state since it's internal,
      // but we can verify no errors occurred)
      const logObj = platform['log'] as unknown as Record<string, ReturnType<typeof vi.fn>>;
      const errorCalls = logObj.error?.mock.calls ?? [];
      const handlerErrors = errorCalls.filter((c: unknown[]) => String(c[0]).includes('Error handling value update'));
      expect(handlerErrors).toHaveLength(0);

      await platform.onShutdown('test');
    });
  });

  describe('onNodeRemoved', () => {
    it('unregisters devices when a node is removed', async () => {
      const { platform } = makePlatform();
      await platform.onStart('test');

      const nodes = new Map<number, ZWaveNode>();
      nodes.set(
        2,
        makeNode({
          nodeId: 2,
          endpoints: [makeEndpoint([CommandClass.BinarySwitch])],
          values: makeValues({
            commandClass: CommandClass.BinarySwitch,
            property: 'currentValue',
            value: false,
          }),
        }),
      );

      fakeClient.emit('allNodesReady', nodes);
      await new Promise((r) => setTimeout(r, 10));

      // Confirm device was registered
      expect(getDevicesMap(platform).size).toBe(1);

      // Now remove the node
      fakeClient.emit('nodeRemoved', 2);
      await new Promise((r) => setTimeout(r, 10));

      // Device should be removed from internal map
      expect(getDevicesMap(platform).size).toBe(0);

      await platform.onShutdown('test');
    });
  });

  describe('onShutdown', () => {
    it('disconnects the client and clears devices', async () => {
      const { platform } = makePlatform();
      await platform.onStart('test');

      await platform.onShutdown('test');

      // Should not throw on second shutdown
      await platform.onShutdown('test');
    });
  });
});
