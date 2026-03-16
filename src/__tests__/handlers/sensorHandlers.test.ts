import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('matterbridge', () => import('../helpers/matterbridgeMock.js'));
vi.mock('matterbridge/logger', () => ({}));

import { CommandClass } from '../../zwave/types.js';
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

describe('TemperatureSensorHandler integration', () => {
  let endpoint: MockEndpoint;
  let log: AnsiLogger;

  beforeEach(() => {
    endpoint = makeMockEndpoint();
    log = makeLogger();
  });

  it('maps a temperature sensor node, sets initial state, and handles updates', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.MultilevelSensor])],
      values: makeValues({
        commandClass: CommandClass.MultilevelSensor,
        property: 'Air temperature',
        value: 22.5,
        metadata: { type: 'number', readable: true, writeable: false, label: 'Air temperature', unit: '°C' },
      }),
    });

    const mapped = mapNode(node);
    const tempDevice = mapped.find((d) => d.deviceType.name === 'temperatureSensor');
    expect(tempDevice).toBeDefined();

    const handler = createHandler(tempDevice!.deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
    });

    handler.addClusters(endpoint as never);
    expect(endpoint.createDefaultTemperatureMeasurementClusterServer).toHaveBeenCalled();

    handler.setup();
    // 22.5°C → 2250 (in 0.01°C units)
    expect(endpoint.attributes['temperatureMeasurement.measuredValue']).toBe(2250);
  });

  it('converts Fahrenheit values to Matter format', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.MultilevelSensor])],
      values: makeValues({
        commandClass: CommandClass.MultilevelSensor,
        property: 'Air temperature',
        value: 72,
        metadata: { type: 'number', readable: true, writeable: false, label: 'Air temperature', unit: '°F' },
      }),
    });

    const mapped = mapNode(node);
    const tempDevice = mapped.find((d) => d.deviceType.name === 'temperatureSensor');
    const handler = createHandler(tempDevice!.deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
    });

    handler.addClusters(endpoint as never);
    handler.setup();

    // 72°F ≈ 22.22°C → ~2222 in 0.01°C units
    const value = endpoint.attributes['temperatureMeasurement.measuredValue'] as number;
    expect(value).toBeGreaterThan(2200);
    expect(value).toBeLessThan(2250);
  });

  it('handles temperature value updates', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.MultilevelSensor])],
      values: makeValues({
        commandClass: CommandClass.MultilevelSensor,
        property: 'Air temperature',
        value: 20,
        metadata: { type: 'number', readable: true, writeable: false, label: 'Air temperature', unit: '°C' },
      }),
    });

    const mapped = mapNode(node);
    const tempDevice = mapped.find((d) => d.deviceType.name === 'temperatureSensor');
    const handler = createHandler(tempDevice!.deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
    });

    handler.addClusters(endpoint as never);
    handler.setup();
    endpoint.setAttribute.mockClear();

    await handler.handleValueUpdate({
      commandClass: CommandClass.MultilevelSensor,
      commandClassName: 'Multilevel Sensor',
      endpoint: 0,
      property: 'Air temperature',
      propertyName: 'Air temperature',
      newValue: 25.5,
      prevValue: 20,
    });

    expect(endpoint.setAttribute).toHaveBeenCalledWith('temperatureMeasurement', 'measuredValue', 2550, log);
  });

  it('ignores updates for non-temperature sensor properties', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.MultilevelSensor])],
      values: makeValues({
        commandClass: CommandClass.MultilevelSensor,
        property: 'Air temperature',
        value: 20,
        metadata: { type: 'number', readable: true, writeable: false, label: 'Air temperature', unit: '°C' },
      }),
    });

    const mapped = mapNode(node);
    const tempDevice = mapped.find((d) => d.deviceType.name === 'temperatureSensor');
    const handler = createHandler(tempDevice!.deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
    });

    handler.addClusters(endpoint as never);
    handler.setup();
    endpoint.setAttribute.mockClear();

    await handler.handleValueUpdate({
      commandClass: CommandClass.MultilevelSensor,
      commandClassName: 'Multilevel Sensor',
      endpoint: 0,
      property: 'Humidity',
      propertyName: 'Humidity',
      newValue: 55,
      prevValue: 50,
    });

    expect(endpoint.setAttribute).not.toHaveBeenCalled();
  });
});

describe('HumiditySensorHandler integration', () => {
  let endpoint: MockEndpoint;
  let log: AnsiLogger;

  beforeEach(() => {
    endpoint = makeMockEndpoint();
    log = makeLogger();
  });

  it('maps a humidity sensor, sets initial state, and handles updates', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.MultilevelSensor])],
      values: makeValues({
        commandClass: CommandClass.MultilevelSensor,
        property: 'Humidity',
        value: 55,
        metadata: { type: 'number', readable: true, writeable: false, label: 'Humidity', unit: '%' },
      }),
    });

    const mapped = mapNode(node);
    const humDevice = mapped.find((d) => d.deviceType.name === 'humiditySensor');
    expect(humDevice).toBeDefined();

    const handler = createHandler(humDevice!.deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
    });

    handler.addClusters(endpoint as never);
    expect(endpoint.createDefaultRelativeHumidityMeasurementClusterServer).toHaveBeenCalled();

    handler.setup();
    // 55% → 5500 (in 0.01% units)
    expect(endpoint.attributes['relativeHumidityMeasurement.measuredValue']).toBe(5500);

    endpoint.setAttribute.mockClear();

    await handler.handleValueUpdate({
      commandClass: CommandClass.MultilevelSensor,
      commandClassName: 'Multilevel Sensor',
      endpoint: 0,
      property: 'Humidity',
      propertyName: 'Humidity',
      newValue: 60,
      prevValue: 55,
    });

    expect(endpoint.setAttribute).toHaveBeenCalledWith('relativeHumidityMeasurement', 'measuredValue', 6000, log);
  });
});

describe('LightSensorHandler integration', () => {
  let endpoint: MockEndpoint;
  let log: AnsiLogger;

  beforeEach(() => {
    endpoint = makeMockEndpoint();
    log = makeLogger();
  });

  it('maps an illuminance sensor, sets initial state, and handles updates', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.MultilevelSensor])],
      values: makeValues({
        commandClass: CommandClass.MultilevelSensor,
        property: 'Illuminance',
        value: 100,
        metadata: { type: 'number', readable: true, writeable: false, label: 'Illuminance', unit: 'Lux' },
      }),
    });

    const mapped = mapNode(node);
    const lightDevice = mapped.find((d) => d.deviceType.name === 'lightSensor');
    expect(lightDevice).toBeDefined();

    const handler = createHandler(lightDevice!.deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
    });

    handler.addClusters(endpoint as never);
    expect(endpoint.createDefaultIlluminanceMeasurementClusterServer).toHaveBeenCalled();

    handler.setup();
    // 100 lux → 10000 * log10(100) + 1 = 10000 * 2 + 1 = 20001
    expect(endpoint.attributes['illuminanceMeasurement.measuredValue']).toBe(20001);

    endpoint.setAttribute.mockClear();

    await handler.handleValueUpdate({
      commandClass: CommandClass.MultilevelSensor,
      commandClassName: 'Multilevel Sensor',
      endpoint: 0,
      property: 'Illuminance',
      propertyName: 'Illuminance',
      newValue: 0,
      prevValue: 100,
    });

    // 0 lux → 0
    expect(endpoint.setAttribute).toHaveBeenCalledWith('illuminanceMeasurement', 'measuredValue', 0, log);
  });

  it('handles luminance property name variant', async () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.MultilevelSensor])],
      values: makeValues({
        commandClass: CommandClass.MultilevelSensor,
        property: 'Illuminance',
        value: 10,
        metadata: { type: 'number', readable: true, writeable: false, label: 'Illuminance', unit: 'Lux' },
      }),
    });

    const mapped = mapNode(node);
    const lightDevice = mapped.find((d) => d.deviceType.name === 'lightSensor');
    const handler = createHandler(lightDevice!.deviceType, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
    });

    handler.addClusters(endpoint as never);
    handler.setup();
    endpoint.setAttribute.mockClear();

    // "luminance" property variant should also be handled
    await handler.handleValueUpdate({
      commandClass: CommandClass.MultilevelSensor,
      commandClassName: 'Multilevel Sensor',
      endpoint: 0,
      property: 'Luminance',
      propertyName: 'Luminance',
      newValue: 500,
      prevValue: 10,
    });

    expect(endpoint.setAttribute).toHaveBeenCalled();
  });
});

describe('Multi-sensor node integration', () => {
  it('maps a node with temperature, humidity, and illuminance to three devices', () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.MultilevelSensor])],
      values: {
        ...makeValues(
          {
            commandClass: CommandClass.MultilevelSensor,
            property: 'Air temperature',
            value: 22.5,
            metadata: { type: 'number', readable: true, writeable: false, label: 'Air temperature', unit: '°C' },
          },
          {
            commandClass: CommandClass.MultilevelSensor,
            property: 'Humidity',
            value: 55,
            metadata: { type: 'number', readable: true, writeable: false, label: 'Humidity', unit: '%' },
          },
          {
            commandClass: CommandClass.MultilevelSensor,
            property: 'Illuminance',
            value: 300,
            metadata: { type: 'number', readable: true, writeable: false, label: 'Illuminance', unit: 'Lux' },
          },
        ),
      },
    });

    const mapped = mapNode(node);
    expect(mapped).toHaveLength(3);
    expect(mapped.some((d) => d.deviceType.name === 'temperatureSensor')).toBe(true);
    expect(mapped.some((d) => d.deviceType.name === 'humiditySensor')).toBe(true);
    expect(mapped.some((d) => d.deviceType.name === 'lightSensor')).toBe(true);
  });
});
