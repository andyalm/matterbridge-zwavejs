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

describe('contact sensor devices', () => {
  let endpoint: MockEndpoint;
  let log: AnsiLogger;

  function createContactSensor(sensorValue: boolean) {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.BinarySensor])],
      values: makeValues({
        commandClass: CommandClass.BinarySensor,
        property: 'Any',
        value: sensorValue,
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
    return handler;
  }

  beforeEach(() => {
    endpoint = makeMockEndpoint();
    log = makeLogger();
  });

  it('reports contact as closed when Z-Wave reports no alarm', () => {
    createContactSensor(false);
    // Z-Wave false (closed/no alarm) → Matter true (contact)
    expect(endpoint.attributes['booleanState.stateValue']).toBe(true);
  });

  it('reports contact as open when Z-Wave reports an alarm', () => {
    createContactSensor(true);
    // Z-Wave true (open/alarm) → Matter false (no contact)
    expect(endpoint.attributes['booleanState.stateValue']).toBe(false);
  });

  it('updates the contact state when the door opens', async () => {
    const handler = createContactSensor(false);
    endpoint.setAttribute.mockClear();

    await handler.handleValueUpdate({
      commandClass: CommandClass.BinarySensor,
      endpoint: 0,
      property: 'Any',
      newValue: true,
      prevValue: false,
    });

    expect(endpoint.setAttribute).toHaveBeenCalledWith('booleanState', 'stateValue', false, log);
  });

  it('updates the contact state when the door closes', async () => {
    const handler = createContactSensor(true);
    endpoint.setAttribute.mockClear();

    await handler.handleValueUpdate({
      commandClass: CommandClass.BinarySensor,
      endpoint: 0,
      property: 'Any',
      newValue: false,
      prevValue: true,
    });

    expect(endpoint.setAttribute).toHaveBeenCalledWith('booleanState', 'stateValue', true, log);
  });

  it('handles access control notification events as contact state', async () => {
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

    await handler.handleValueUpdate({
      commandClass: CommandClass.Notification,
      endpoint: 0,
      property: 'Access Control',
      newValue: 22, // door open
      prevValue: 0,
    });

    // Non-zero → contact = !22 = false (open)
    expect(endpoint.setAttribute).toHaveBeenCalledWith('booleanState', 'stateValue', false, log);
  });
});

describe('occupancy sensor devices', () => {
  let endpoint: MockEndpoint;
  let log: AnsiLogger;

  beforeEach(() => {
    endpoint = makeMockEndpoint();
    log = makeLogger();
  });

  function createOccupancySensor(motionValue: boolean) {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.BinarySensor])],
      values: makeValues({
        commandClass: CommandClass.BinarySensor,
        property: 'Motion',
        value: motionValue,
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
    return handler;
  }

  it('reports no occupancy when the sensor is idle', () => {
    createOccupancySensor(false);
    expect(endpoint.attributes['occupancySensing.occupancy']).toEqual({ occupied: false });
  });

  it('reports occupied when Z-Wave detects motion', async () => {
    const handler = createOccupancySensor(false);
    endpoint.setAttribute.mockClear();

    await handler.handleValueUpdate({
      commandClass: CommandClass.BinarySensor,
      endpoint: 0,
      property: 'Motion',
      newValue: true,
      prevValue: false,
    });

    expect(endpoint.setAttribute).toHaveBeenCalledWith('occupancySensing', 'occupancy', { occupied: true }, log);
  });

  it('handles home security notification events as occupancy', async () => {
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
      endpoint: 0,
      property: 'Home Security',
      newValue: 8, // motion detected
      prevValue: 0,
    });

    expect(endpoint.setAttribute).toHaveBeenCalledWith('occupancySensing', 'occupancy', { occupied: true }, log);
  });
});

describe('water leak detector devices', () => {
  let endpoint: MockEndpoint;
  let log: AnsiLogger;

  function createWaterLeakDetector(initialValue = 0) {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.Notification])],
      values: makeValues({
        commandClass: CommandClass.Notification,
        property: 'Water Alarm',
        value: initialValue,
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
    const handler = createHandler(mapped[0].deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
    });
    handler.addClusters(endpoint as never);
    handler.setup();
    return handler;
  }

  beforeEach(() => {
    endpoint = makeMockEndpoint();
    log = makeLogger();
  });

  it('reports dry when Z-Wave sends idle (0) notification', () => {
    createWaterLeakDetector(0);
    expect(endpoint.attributes['booleanState.stateValue']).toBe(false);
  });

  it('reports a leak when Z-Wave sends a non-zero water notification', async () => {
    const handler = createWaterLeakDetector(0);
    endpoint.setAttribute.mockClear();

    await handler.handleValueUpdate({
      commandClass: CommandClass.Notification,
      endpoint: 0,
      property: 'Water Alarm',
      newValue: 2,
      prevValue: 0,
    });

    expect(endpoint.setAttribute).toHaveBeenCalledWith('booleanState', 'stateValue', true, log);
  });

  it('reports dry again when the leak clears', async () => {
    const handler = createWaterLeakDetector(0);
    endpoint.setAttribute.mockClear();

    await handler.handleValueUpdate({
      commandClass: CommandClass.Notification,
      endpoint: 0,
      property: 'Water Alarm',
      newValue: 0,
      prevValue: 2,
    });

    expect(endpoint.setAttribute).toHaveBeenCalledWith('booleanState', 'stateValue', false, log);
  });
});
