import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('matterbridge', () => import('../helpers/matterbridgeMock.js'));
vi.mock('matterbridge/logger', () => ({}));

import { CommandClass, NotificationType } from '../../zwave/types.js';
import { mapNode } from '../../mapper/DeviceMapper.js';
import { createHandler } from '../../handlers/handlerRegistry.js';
import {
  makeMockEndpoint,
  makeLogger,
  makeNode,
  makeEndpoint,
  makeValues,
  type MockEndpoint,
} from '../helpers/testUtils.js';
import type { AnsiLogger } from 'matterbridge/logger';

describe('ContactSensorHandler integration', () => {
  let endpoint: MockEndpoint;
  let log: AnsiLogger;

  beforeEach(() => {
    endpoint = makeMockEndpoint();
    log = makeLogger();
  });

  it('maps a binary sensor to contact sensor with inverted logic', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.BinarySensor])],
      values: makeValues({
        commandClass: CommandClass.BinarySensor,
        property: 'Any',
        value: true, // Z-Wave true = open (alarm)
      }),
    });

    const mapped = mapNode(node);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].deviceType.name).toBe('contactSensor');

    const handler = createHandler(mapped[0].deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
    });

    handler.addClusters(endpoint as never);
    expect(endpoint.createDefaultBooleanStateClusterServer).toHaveBeenCalled();

    handler.setup();
    // Z-Wave true (open) → Matter false (no contact)
    expect(endpoint.attributes['booleanState.stateValue']).toBe(false);
  });

  it('inverts value on Z-Wave update: closed→contact, open→no contact', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.BinarySensor])],
      values: makeValues({
        commandClass: CommandClass.BinarySensor,
        property: 'Any',
        value: false,
      }),
    });

    const mapped = mapNode(node);
    const handler = createHandler(mapped[0].deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
    });

    handler.addClusters(endpoint as never);
    handler.setup();
    // Z-Wave false (closed) → Matter true (contact)
    expect(endpoint.attributes['booleanState.stateValue']).toBe(true);

    endpoint.setAttribute.mockClear();

    // Door opens: Z-Wave true → Matter false
    await handler.handleValueUpdate({
      commandClass: CommandClass.BinarySensor,
      commandClassName: 'Binary Sensor',
      endpoint: 0,
      property: 'Any',
      newValue: true,
      prevValue: false,
    });
    expect(endpoint.setAttribute).toHaveBeenCalledWith('booleanState', 'stateValue', false, log);

    endpoint.setAttribute.mockClear();

    // Door closes: Z-Wave false → Matter true
    await handler.handleValueUpdate({
      commandClass: CommandClass.BinarySensor,
      commandClassName: 'Binary Sensor',
      endpoint: 0,
      property: 'Any',
      newValue: false,
      prevValue: true,
    });
    expect(endpoint.setAttribute).toHaveBeenCalledWith('booleanState', 'stateValue', true, log);
  });

  it('handles Notification CC access control events as contact', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.Notification])],
      values: makeValues({
        commandClass: CommandClass.Notification,
        property: 'Access Control',
        value: 0,
        metadata: {
          type: 'number',
          readable: true,
          writeable: false,
          label: 'Access Control',
          ccSpecific: { notificationType: NotificationType.AccessControl },
        },
      }),
    });

    const mapped = mapNode(node);
    expect(mapped[0].deviceType.name).toBe('contactSensor');

    const handler = createHandler(mapped[0].deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
    });

    handler.addClusters(endpoint as never);
    handler.setup();

    endpoint.setAttribute.mockClear();

    // Notification CC value update
    await handler.handleValueUpdate({
      commandClass: CommandClass.Notification,
      commandClassName: 'Notification',
      endpoint: 0,
      property: 'Access Control',
      newValue: 22, // door open
      prevValue: 0,
    });

    // Non-zero notification → contact = !22 = false (open)
    expect(endpoint.setAttribute).toHaveBeenCalledWith('booleanState', 'stateValue', false, log);
  });
});

describe('OccupancySensorHandler integration', () => {
  let endpoint: MockEndpoint;
  let log: AnsiLogger;

  beforeEach(() => {
    endpoint = makeMockEndpoint();
    log = makeLogger();
  });

  it('maps a motion binary sensor to occupancy sensor', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.BinarySensor])],
      values: makeValues({
        commandClass: CommandClass.BinarySensor,
        property: 'Motion',
        value: false,
        metadata: { type: 'boolean', readable: true, writeable: false, label: 'Motion sensor' },
      }),
    });

    const mapped = mapNode(node);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].deviceType.name).toBe('occupancySensor');

    const handler = createHandler(mapped[0].deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
    });

    handler.addClusters(endpoint as never);
    expect(endpoint.createDefaultOccupancySensingClusterServer).toHaveBeenCalled();

    handler.setup();
    // Z-Wave false → not occupied
    expect(endpoint.attributes['occupancySensing.occupancy']).toEqual({ occupied: false });
  });

  it('emits occupancy struct on value update', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.BinarySensor])],
      values: makeValues({
        commandClass: CommandClass.BinarySensor,
        property: 'Motion',
        value: false,
        metadata: { type: 'boolean', readable: true, writeable: false, label: 'Motion sensor' },
      }),
    });

    const mapped = mapNode(node);
    const handler = createHandler(mapped[0].deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
    });

    handler.addClusters(endpoint as never);
    handler.setup();
    endpoint.setAttribute.mockClear();

    await handler.handleValueUpdate({
      commandClass: CommandClass.BinarySensor,
      commandClassName: 'Binary Sensor',
      endpoint: 0,
      property: 'Motion',
      newValue: true,
      prevValue: false,
    });

    expect(endpoint.setAttribute).toHaveBeenCalledWith('occupancySensing', 'occupancy', { occupied: true }, log);
  });

  it('handles Notification CC home security events', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.Notification])],
      values: makeValues({
        commandClass: CommandClass.Notification,
        property: 'Home Security',
        value: 0,
        metadata: {
          type: 'number',
          readable: true,
          writeable: false,
          label: 'Home Security',
          ccSpecific: { notificationType: NotificationType.HomeSecurity },
        },
      }),
    });

    const mapped = mapNode(node);
    expect(mapped[0].deviceType.name).toBe('occupancySensor');

    const handler = createHandler(mapped[0].deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
    });

    handler.addClusters(endpoint as never);
    handler.setup();
    endpoint.setAttribute.mockClear();

    await handler.handleValueUpdate({
      commandClass: CommandClass.Notification,
      commandClassName: 'Notification',
      endpoint: 0,
      property: 'Home Security',
      newValue: 8, // motion detected
      prevValue: 0,
    });

    expect(endpoint.setAttribute).toHaveBeenCalledWith('occupancySensing', 'occupancy', { occupied: true }, log);
  });
});

describe('WaterLeakHandler integration', () => {
  let endpoint: MockEndpoint;
  let log: AnsiLogger;

  beforeEach(() => {
    endpoint = makeMockEndpoint();
    log = makeLogger();
  });

  it('maps water notification to water leak detector with correct state logic', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.Notification])],
      values: makeValues({
        commandClass: CommandClass.Notification,
        property: 'Water Alarm',
        value: 0,
        metadata: {
          type: 'number',
          readable: true,
          writeable: false,
          label: 'Sensor status',
          ccSpecific: { notificationType: NotificationType.Water },
          states: { 0: 'idle', 2: 'Water leak detected' },
        },
      }),
    });

    const mapped = mapNode(node);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].deviceType.name).toBe('waterLeakDetector');

    const handler = createHandler(mapped[0].deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
    });

    handler.addClusters(endpoint as never);
    expect(endpoint.createDefaultBooleanStateClusterServer).toHaveBeenCalled();

    handler.setup();
    // Z-Wave 0 (idle) → Matter false (no leak)
    expect(endpoint.attributes['booleanState.stateValue']).toBe(false);
  });

  it('detects water leak when notification value is non-zero', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.Notification])],
      values: makeValues({
        commandClass: CommandClass.Notification,
        property: 'Water Alarm',
        value: 0,
        metadata: {
          type: 'number',
          readable: true,
          writeable: false,
          label: 'Sensor status',
          ccSpecific: { notificationType: NotificationType.Water },
        },
      }),
    });

    const mapped = mapNode(node);
    const handler = createHandler(mapped[0].deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
    });

    handler.addClusters(endpoint as never);
    handler.setup();
    endpoint.setAttribute.mockClear();

    // Water leak detected (value 2)
    await handler.handleValueUpdate({
      commandClass: CommandClass.Notification,
      commandClassName: 'Notification',
      endpoint: 0,
      property: 'Water Alarm',
      newValue: 2,
      prevValue: 0,
    });

    expect(endpoint.setAttribute).toHaveBeenCalledWith('booleanState', 'stateValue', true, log);

    endpoint.setAttribute.mockClear();

    // Leak cleared (value 0)
    await handler.handleValueUpdate({
      commandClass: CommandClass.Notification,
      commandClassName: 'Notification',
      endpoint: 0,
      property: 'Water Alarm',
      newValue: 0,
      prevValue: 2,
    });

    expect(endpoint.setAttribute).toHaveBeenCalledWith('booleanState', 'stateValue', false, log);
  });
});
