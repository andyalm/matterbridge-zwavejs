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

describe('temperature sensor devices', () => {
  let endpoint: MockEndpoint;
  let log: AnsiLogger;

  function createTempSensor(value: number, unit = '°C') {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.MultilevelSensor])],
      values: makeValues({
        commandClass: CommandClass.MultilevelSensor,
        property: 'Air temperature',
        value,
        metadata: { type: 'number', readable: true, writeable: false, label: 'Air temperature', unit },
      }),
    });

    const mapped = mapNode(node);
    const tempDevice = mapped.find((d) => d.deviceType.name === 'temperatureSensor')!;
    const handler = createHandler(tempDevice.deviceType, {
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

  it('reports the initial temperature in Matter centi-Celsius format', () => {
    createTempSensor(22.5);
    expect(endpoint.attributes['temperatureMeasurement.measuredValue']).toBe(2250);
  });

  it('converts Fahrenheit readings to centi-Celsius', () => {
    createTempSensor(72, '°F');
    // 72°F ≈ 22.22°C → ~2222
    const value = endpoint.attributes['temperatureMeasurement.measuredValue'] as number;
    expect(value).toBeGreaterThan(2200);
    expect(value).toBeLessThan(2250);
  });

  it('updates the temperature when a new reading arrives', async () => {
    const handler = createTempSensor(20);
    endpoint.setAttribute.mockClear();

    await handler.handleValueUpdate({
      commandClass: CommandClass.MultilevelSensor,
      endpoint: 0,
      property: 'Air temperature',
      propertyName: 'Air temperature',
      newValue: 25.5,
      prevValue: 20,
    });

    expect(endpoint.setAttribute).toHaveBeenCalledWith('temperatureMeasurement', 'measuredValue', 2550, log);
  });

  it('ignores humidity readings', async () => {
    const handler = createTempSensor(20);
    endpoint.setAttribute.mockClear();

    await handler.handleValueUpdate({
      commandClass: CommandClass.MultilevelSensor,
      endpoint: 0,
      property: 'Humidity',
      propertyName: 'Humidity',
      newValue: 55,
      prevValue: 50,
    });

    expect(endpoint.setAttribute).not.toHaveBeenCalled();
  });
});

describe('humidity sensor devices', () => {
  let endpoint: MockEndpoint;
  let log: AnsiLogger;

  function createHumiditySensor(value: number) {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.MultilevelSensor])],
      values: makeValues({
        commandClass: CommandClass.MultilevelSensor,
        property: 'Humidity',
        value,
        metadata: { type: 'number', readable: true, writeable: false, label: 'Humidity', unit: '%' },
      }),
    });

    const mapped = mapNode(node);
    const humDevice = mapped.find((d) => d.deviceType.name === 'humiditySensor')!;
    const handler = createHandler(humDevice.deviceType, {
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

  it('reports the initial humidity in Matter centi-percent format', () => {
    createHumiditySensor(55);
    expect(endpoint.attributes['relativeHumidityMeasurement.measuredValue']).toBe(5500);
  });

  it('updates the humidity when a new reading arrives', async () => {
    const handler = createHumiditySensor(55);
    endpoint.setAttribute.mockClear();

    await handler.handleValueUpdate({
      commandClass: CommandClass.MultilevelSensor,
      endpoint: 0,
      property: 'Humidity',
      propertyName: 'Humidity',
      newValue: 60,
      prevValue: 55,
    });

    expect(endpoint.setAttribute).toHaveBeenCalledWith('relativeHumidityMeasurement', 'measuredValue', 6000, log);
  });
});

describe('light sensor devices', () => {
  let endpoint: MockEndpoint;
  let log: AnsiLogger;

  function createLightSensor(value: number) {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.MultilevelSensor])],
      values: makeValues({
        commandClass: CommandClass.MultilevelSensor,
        property: 'Illuminance',
        value,
        metadata: { type: 'number', readable: true, writeable: false, label: 'Illuminance', unit: 'Lux' },
      }),
    });

    const mapped = mapNode(node);
    const lightDevice = mapped.find((d) => d.deviceType.name === 'lightSensor')!;
    const handler = createHandler(lightDevice.deviceType, {
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

  it('reports the initial illuminance using logarithmic scaling', () => {
    createLightSensor(100);
    // 100 lux → 10000 * log10(100) + 1 = 20001
    expect(endpoint.attributes['illuminanceMeasurement.measuredValue']).toBe(20001);
  });

  it('reports zero for total darkness', async () => {
    const handler = createLightSensor(100);
    endpoint.setAttribute.mockClear();

    await handler.handleValueUpdate({
      commandClass: CommandClass.MultilevelSensor,
      endpoint: 0,
      property: 'Illuminance',
      propertyName: 'Illuminance',
      newValue: 0,
      prevValue: 100,
    });

    expect(endpoint.setAttribute).toHaveBeenCalledWith('illuminanceMeasurement', 'measuredValue', 0, log);
  });

  it('responds to the "luminance" property name variant', async () => {
    const handler = createLightSensor(10);
    endpoint.setAttribute.mockClear();

    await handler.handleValueUpdate({
      commandClass: CommandClass.MultilevelSensor,
      endpoint: 0,
      property: 'Luminance',
      propertyName: 'Luminance',
      newValue: 500,
      prevValue: 10,
    });

    expect(endpoint.setAttribute).toHaveBeenCalled();
  });
});

describe('multi-sensor nodes', () => {
  it('creates separate Matter devices for temperature, humidity, and illuminance', () => {
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
