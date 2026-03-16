import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock matterbridge before any source imports
vi.mock('matterbridge', () => import('../helpers/matterbridgeMock.js'));
vi.mock('matterbridge/logger', () => ({}));

import { CommandClass } from '../../zwave/types.js';
import { mapNode } from '../../mapper/DeviceMapper.js';
import { createHandler } from '../../handlers/handlerRegistry.js';
import {
  makeMockEndpoint,
  makeMockClient,
  makeLogger,
  makeNode,
  makeEndpoint,
  makeValues,
  type MockEndpoint,
  type MockClient,
} from '../helpers/testUtils.js';
import type { AnsiLogger } from 'matterbridge/logger';

describe('BinarySwitchHandler integration', () => {
  let endpoint: MockEndpoint;
  let client: MockClient;
  let log: AnsiLogger;

  beforeEach(() => {
    endpoint = makeMockEndpoint();
    client = makeMockClient();
    log = makeLogger();
  });

  it('maps a binary switch node and handles on/off commands', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.BinarySwitch])],
      values: makeValues({
        commandClass: CommandClass.BinarySwitch,
        property: 'currentValue',
        value: false,
      }),
    });

    // Map the node to Matter device types
    const mapped = mapNode(node);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].deviceType.name).toBe('onOffSwitch');

    // Create handler through the registry (integration: registry + handler)
    const handler = createHandler(mapped[0].deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
      client: client as never,
    });

    // addClusters should set up OnOff cluster
    handler.addClusters(endpoint as never);
    expect(endpoint.createDefaultOnOffClusterServer).toHaveBeenCalled();

    // setup should read initial state and register commands
    handler.setup();
    expect(endpoint.setAttribute).toHaveBeenCalledWith('onOff', 'onOff', false, log);
    expect(endpoint.addCommandHandler).toHaveBeenCalledWith('on', expect.any(Function));
    expect(endpoint.addCommandHandler).toHaveBeenCalledWith('off', expect.any(Function));
    expect(endpoint.addCommandHandler).toHaveBeenCalledWith('toggle', expect.any(Function));

    // Invoke the "on" command and verify it sends the right Z-Wave value
    await endpoint.getCommandHandler('on')!();
    expect(client.setValue).toHaveBeenCalledWith(
      2,
      { commandClass: CommandClass.BinarySwitch, endpoint: 0, property: 'targetValue' },
      true,
    );

    // Invoke the "off" command
    await endpoint.getCommandHandler('off')!();
    expect(client.setValue).toHaveBeenCalledWith(
      2,
      { commandClass: CommandClass.BinarySwitch, endpoint: 0, property: 'targetValue' },
      false,
    );
  });

  it('handles toggle command based on current attribute state', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.BinarySwitch])],
      values: makeValues({
        commandClass: CommandClass.BinarySwitch,
        property: 'currentValue',
        value: true,
      }),
    });

    const mapped = mapNode(node);
    const handler = createHandler(mapped[0].deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
      client: client as never,
    });

    handler.addClusters(endpoint as never);
    handler.setup();

    // Current state is ON (set during setup)
    expect(endpoint.attributes['onOff.onOff']).toBe(true);

    // Toggle should send false (opposite of current)
    await endpoint.getCommandHandler('toggle')!();
    expect(client.setValue).toHaveBeenCalledWith(
      2,
      { commandClass: CommandClass.BinarySwitch, endpoint: 0, property: 'targetValue' },
      false,
    );
  });

  it('propagates Z-Wave value updates to Matter endpoint', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.BinarySwitch])],
      values: makeValues({
        commandClass: CommandClass.BinarySwitch,
        property: 'currentValue',
        value: false,
      }),
    });

    const mapped = mapNode(node);
    const handler = createHandler(mapped[0].deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
      client: client as never,
    });

    handler.addClusters(endpoint as never);
    handler.setup();

    // Simulate Z-Wave value update: switch turned on
    await handler.handleValueUpdate({
      commandClass: CommandClass.BinarySwitch,
      commandClassName: 'Binary Switch',
      endpoint: 0,
      property: 'currentValue',
      newValue: true,
      prevValue: false,
    });

    expect(endpoint.setAttribute).toHaveBeenCalledWith('onOff', 'onOff', true, log);
  });

  it('ignores value updates for unrelated command classes', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.BinarySwitch])],
      values: makeValues({
        commandClass: CommandClass.BinarySwitch,
        property: 'currentValue',
        value: false,
      }),
    });

    const mapped = mapNode(node);
    const handler = createHandler(mapped[0].deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
      client: client as never,
    });

    handler.addClusters(endpoint as never);
    handler.setup();
    endpoint.setAttribute.mockClear();

    // Value update for a different CC should be ignored
    await handler.handleValueUpdate({
      commandClass: CommandClass.MultilevelSensor,
      commandClassName: 'Multilevel Sensor',
      endpoint: 0,
      property: 'Air temperature',
      newValue: 22,
      prevValue: 21,
    });

    expect(endpoint.setAttribute).not.toHaveBeenCalled();
  });
});

describe('DimmableLightHandler integration', () => {
  let endpoint: MockEndpoint;
  let client: MockClient;
  let log: AnsiLogger;

  beforeEach(() => {
    endpoint = makeMockEndpoint();
    client = makeMockClient();
    log = makeLogger();
  });

  it('maps a multilevel switch node and handles level commands', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.MultilevelSwitch])],
      values: makeValues({
        commandClass: CommandClass.MultilevelSwitch,
        property: 'currentValue',
        value: 50,
      }),
    });

    const mapped = mapNode(node);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].deviceType.name).toBe('dimmableLight');

    const handler = createHandler(mapped[0].deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
      client: client as never,
    });

    handler.addClusters(endpoint as never);
    expect(endpoint.createDefaultOnOffClusterServer).toHaveBeenCalled();
    expect(endpoint.createDefaultLevelControlClusterServer).toHaveBeenCalled();

    handler.setup();

    // Initial state: level 50 → onOff true, currentLevel converted from Z-Wave 50
    expect(endpoint.attributes['onOff.onOff']).toBe(true);
    // Z-Wave 50 → Matter ~128 (50/99 * 254 ≈ 128)
    const initialLevel = endpoint.attributes['levelControl.currentLevel'] as number;
    expect(initialLevel).toBeGreaterThan(100);
    expect(initialLevel).toBeLessThan(160);
  });

  it('sends Z-Wave level 99 for on command and 0 for off command', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.MultilevelSwitch])],
      values: makeValues({
        commandClass: CommandClass.MultilevelSwitch,
        property: 'currentValue',
        value: 50,
      }),
    });

    const mapped = mapNode(node);
    const handler = createHandler(mapped[0].deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
      client: client as never,
    });

    handler.addClusters(endpoint as never);
    handler.setup();

    await endpoint.getCommandHandler('on')!();
    expect(client.setValue).toHaveBeenCalledWith(
      2,
      { commandClass: CommandClass.MultilevelSwitch, endpoint: 0, property: 'targetValue' },
      99,
    );

    await endpoint.getCommandHandler('off')!();
    expect(client.setValue).toHaveBeenCalledWith(
      2,
      { commandClass: CommandClass.MultilevelSwitch, endpoint: 0, property: 'targetValue' },
      0,
    );
  });

  it('converts Matter level to Z-Wave level for moveToLevel command', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.MultilevelSwitch])],
      values: makeValues({
        commandClass: CommandClass.MultilevelSwitch,
        property: 'currentValue',
        value: 0,
      }),
    });

    const mapped = mapNode(node);
    const handler = createHandler(mapped[0].deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
      client: client as never,
    });

    handler.addClusters(endpoint as never);
    handler.setup();

    // Matter level 254 should map to Z-Wave 99
    await endpoint.getCommandHandler('moveToLevel')!({ request: { level: 254 } });
    expect(client.setValue).toHaveBeenCalledWith(
      2,
      { commandClass: CommandClass.MultilevelSwitch, endpoint: 0, property: 'targetValue' },
      99,
    );

    client.setValue.mockClear();

    // Matter level ~128 should map to Z-Wave ~50
    await endpoint.getCommandHandler('moveToLevel')!({ request: { level: 128 } });
    const zwaveLevel = client.setValue.mock.calls[0][2] as number;
    expect(zwaveLevel).toBeGreaterThanOrEqual(49);
    expect(zwaveLevel).toBeLessThanOrEqual(51);
  });

  it('propagates Z-Wave level updates to Matter endpoint with conversion', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.MultilevelSwitch])],
      values: makeValues({
        commandClass: CommandClass.MultilevelSwitch,
        property: 'currentValue',
        value: 0,
      }),
    });

    const mapped = mapNode(node);
    const handler = createHandler(mapped[0].deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
      client: client as never,
    });

    handler.addClusters(endpoint as never);
    handler.setup();
    endpoint.setAttribute.mockClear();

    // Z-Wave level changes from 0 to 99 (full brightness)
    await handler.handleValueUpdate({
      commandClass: CommandClass.MultilevelSwitch,
      commandClassName: 'Multilevel Switch',
      endpoint: 0,
      property: 'currentValue',
      newValue: 99,
      prevValue: 0,
    });

    expect(endpoint.setAttribute).toHaveBeenCalledWith('onOff', 'onOff', true, log);
    expect(endpoint.setAttribute).toHaveBeenCalledWith('levelControl', 'currentLevel', 254, log);
  });

  it('sets onOff to false when Z-Wave level is 0', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.MultilevelSwitch])],
      values: makeValues({
        commandClass: CommandClass.MultilevelSwitch,
        property: 'currentValue',
        value: 50,
      }),
    });

    const mapped = mapNode(node);
    const handler = createHandler(mapped[0].deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
      client: client as never,
    });

    handler.addClusters(endpoint as never);
    handler.setup();
    endpoint.setAttribute.mockClear();

    await handler.handleValueUpdate({
      commandClass: CommandClass.MultilevelSwitch,
      commandClassName: 'Multilevel Switch',
      endpoint: 0,
      property: 'currentValue',
      newValue: 0,
      prevValue: 50,
    });

    expect(endpoint.setAttribute).toHaveBeenCalledWith('onOff', 'onOff', false, log);
  });

  it('prefers MultilevelSwitch over BinarySwitch when both present', () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.BinarySwitch, CommandClass.MultilevelSwitch])],
    });

    const mapped = mapNode(node);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].deviceType.name).toBe('dimmableLight');
  });
});
