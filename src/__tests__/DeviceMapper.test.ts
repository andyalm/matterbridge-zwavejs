import { describe, it, expect } from 'vitest';
import {
  onOffLight,
  onOffOutlet,
  dimmableLight,
  contactSensor,
  occupancySensor,
  temperatureSensor,
  humiditySensor,
  lightSensor,
} from 'matterbridge';
import { mapNode } from '../mapper/DeviceMapper.js';
import { CommandClass, NotificationType } from '../zwave/types.js';
import type { ZWaveNode } from '../zwave/types.js';

function makeNode(overrides: Partial<ZWaveNode> = {}): ZWaveNode {
  return {
    nodeId: 2,
    status: 4,
    ready: true,
    endpoints: [],
    values: {},
    ...overrides,
  };
}

function makeEndpoint(ccIds: number[], index = 0) {
  return {
    nodeId: 2,
    index,
    commandClasses: ccIds.map((id) => ({ id, name: `CC_${id}`, version: 1, isSecure: false })),
  };
}

describe('mapNode', () => {
  it('maps Binary Switch to onOffLight', () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.BinarySwitch])],
    });
    const devices = mapNode(node);
    expect(devices).toHaveLength(1);
    expect(devices[0].deviceType).toBe(onOffLight);
  });

  it('maps Binary Switch to onOffOutlet when device label contains "outlet"', () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.BinarySwitch])],
      deviceConfig: { manufacturer: 'Test', label: 'Smart Outlet', description: '' },
    });
    const devices = mapNode(node);
    expect(devices).toHaveLength(1);
    expect(devices[0].deviceType).toBe(onOffOutlet);
  });

  it('maps Multilevel Switch to dimmableLight', () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.MultilevelSwitch])],
    });
    const devices = mapNode(node);
    expect(devices).toHaveLength(1);
    expect(devices[0].deviceType).toBe(dimmableLight);
  });

  it('prefers Multilevel Switch over Binary Switch', () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.BinarySwitch, CommandClass.MultilevelSwitch])],
    });
    const devices = mapNode(node);
    expect(devices).toHaveLength(1);
    expect(devices[0].deviceType).toBe(dimmableLight);
  });

  it('maps Binary Sensor to contactSensor by default', () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.BinarySensor])],
    });
    const devices = mapNode(node);
    expect(devices).toHaveLength(1);
    expect(devices[0].deviceType).toBe(contactSensor);
  });

  it('maps Binary Sensor to occupancySensor when motion-related metadata exists', () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.BinarySensor])],
      values: {
        '48-0-Motion': {
          commandClass: CommandClass.BinarySensor,
          endpoint: 0,
          property: 'Motion',
          value: false,
          metadata: { type: 'boolean', readable: true, writeable: false, label: 'Motion sensor' },
        },
      },
    });
    const devices = mapNode(node);
    expect(devices).toHaveLength(1);
    expect(devices[0].deviceType).toBe(occupancySensor);
  });

  it('maps Multilevel Sensor with temperature to temperatureSensor', () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.MultilevelSensor])],
      values: {
        '49-0-Air temperature': {
          commandClass: CommandClass.MultilevelSensor,
          endpoint: 0,
          property: 'Air temperature',
          value: 22.5,
          metadata: { type: 'number', readable: true, writeable: false, label: 'Air temperature', unit: '°C' },
        },
      },
    });
    const devices = mapNode(node);
    expect(devices.some((d) => d.deviceType === temperatureSensor)).toBe(true);
  });

  it('maps multi-sensor node to multiple Matter devices', () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.MultilevelSensor])],
      values: {
        '49-0-Air temperature': {
          commandClass: CommandClass.MultilevelSensor,
          endpoint: 0,
          property: 'Air temperature',
          value: 22.5,
          metadata: { type: 'number', readable: true, writeable: false, label: 'Air temperature', unit: '°C' },
        },
        '49-0-Humidity': {
          commandClass: CommandClass.MultilevelSensor,
          endpoint: 0,
          property: 'Humidity',
          value: 55,
          metadata: { type: 'number', readable: true, writeable: false, label: 'Humidity', unit: '%' },
        },
        '49-0-Illuminance': {
          commandClass: CommandClass.MultilevelSensor,
          endpoint: 0,
          property: 'Illuminance',
          value: 300,
          metadata: { type: 'number', readable: true, writeable: false, label: 'Illuminance', unit: 'Lux' },
        },
      },
    });
    const devices = mapNode(node);
    expect(devices).toHaveLength(3);
    expect(devices.some((d) => d.deviceType === temperatureSensor)).toBe(true);
    expect(devices.some((d) => d.deviceType === humiditySensor)).toBe(true);
    expect(devices.some((d) => d.deviceType === lightSensor)).toBe(true);
  });

  it('maps Notification CC access control to contactSensor', () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.Notification])],
      values: {
        '113-0-Access Control': {
          commandClass: CommandClass.Notification,
          endpoint: 0,
          property: 'Access Control',
          value: 0,
          metadata: {
            type: 'number',
            readable: true,
            writeable: false,
            label: 'Access Control',
            ccSpecific: { notificationType: NotificationType.AccessControl },
          },
        },
      },
    });
    const devices = mapNode(node);
    expect(devices).toHaveLength(1);
    expect(devices[0].deviceType).toBe(contactSensor);
  });

  it('maps Notification CC home security to occupancySensor', () => {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.Notification])],
      values: {
        '113-0-Home Security': {
          commandClass: CommandClass.Notification,
          endpoint: 0,
          property: 'Home Security',
          value: 0,
          metadata: {
            type: 'number',
            readable: true,
            writeable: false,
            label: 'Home Security',
            ccSpecific: { notificationType: NotificationType.HomeSecurity },
          },
        },
      },
    });
    const devices = mapNode(node);
    expect(devices).toHaveLength(1);
    expect(devices[0].deviceType).toBe(occupancySensor);
  });

  it('returns empty for node with no supported CCs', () => {
    const node = makeNode({ endpoints: [makeEndpoint([])] });
    const devices = mapNode(node);
    expect(devices).toHaveLength(0);
  });
});
