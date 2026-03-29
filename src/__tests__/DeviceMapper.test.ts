import { describe, it, expect, vi } from 'vitest';

vi.mock('matterbridge', () => import('./helpers/matterbridgeMock.js'));
vi.mock('matterbridge/logger', () => ({}));

import {
  onOffLight,
  onOffOutlet,
  onOffSwitch,
  dimmableLight,
  contactSensor,
  occupancySensor,
  temperatureSensor,
  humiditySensor,
  lightSensor,
  waterLeakDetector,
} from 'matterbridge';
import { mapNode } from '../mapper/DeviceMapper.js';
import { CommandClass, NotificationType } from '../zwave/types.js';
import { makeNode, makeEndpoint } from './helpers/testUtils.js';

describe('device type classification', () => {
  describe('binary switches', () => {
    it('defaults to a generic switch when no device metadata is available', () => {
      const node = makeNode({
        endpoints: [makeEndpoint([CommandClass.BinarySwitch])],
      });
      const devices = mapNode(node);
      expect(devices).toHaveLength(1);
      expect(devices[0].deviceType).toBe(onOffSwitch);
    });

    it('identifies a light based on the device label', () => {
      const node = makeNode({
        endpoints: [makeEndpoint([CommandClass.BinarySwitch])],
        deviceConfig: { manufacturer: 'Test', label: 'Smart Light Switch', description: '' },
      });
      const devices = mapNode(node);
      expect(devices).toHaveLength(1);
      expect(devices[0].deviceType).toBe(onOffLight);
    });

    it('identifies a switch when the label says "switch"', () => {
      const node = makeNode({
        endpoints: [makeEndpoint([CommandClass.BinarySwitch])],
        deviceConfig: { manufacturer: 'Test', label: 'In-Wall Switch', description: '' },
      });
      const devices = mapNode(node);
      expect(devices).toHaveLength(1);
      expect(devices[0].deviceType).toBe(onOffSwitch);
    });

    it('identifies a smart plug as an outlet', () => {
      const node = makeNode({
        endpoints: [makeEndpoint([CommandClass.BinarySwitch])],
        deviceConfig: { manufacturer: 'Test', label: 'Smart Plug', description: '' },
      });
      const devices = mapNode(node);
      expect(devices).toHaveLength(1);
      expect(devices[0].deviceType).toBe(onOffOutlet);
    });

    it('identifies a color light from the Z-Wave device class', () => {
      const node = makeNode({
        endpoints: [makeEndpoint([CommandClass.BinarySwitch])],
        deviceClass: {
          basic: { key: 0x04, label: 'Routing End Node' },
          generic: { key: 0x10, label: 'Binary Switch' },
          specific: { key: 0x02, label: 'Color Tunable Binary' },
        },
      });
      const devices = mapNode(node);
      expect(devices).toHaveLength(1);
      expect(devices[0].deviceType).toBe(onOffLight);
    });

    it('identifies a power strip as an outlet from the Z-Wave device class', () => {
      const node = makeNode({
        endpoints: [makeEndpoint([CommandClass.BinarySwitch])],
        deviceClass: {
          basic: { key: 0x04, label: 'Routing End Node' },
          generic: { key: 0x10, label: 'Binary Switch' },
          specific: { key: 0x04, label: 'Power Strip' },
        },
      });
      const devices = mapNode(node);
      expect(devices).toHaveLength(1);
      expect(devices[0].deviceType).toBe(onOffOutlet);
    });
  });

  describe('dimmable lights', () => {
    it('maps a multilevel switch as a dimmable light', () => {
      const node = makeNode({
        endpoints: [makeEndpoint([CommandClass.MultilevelSwitch])],
      });
      const devices = mapNode(node);
      expect(devices).toHaveLength(1);
      expect(devices[0].deviceType).toBe(dimmableLight);
    });

    it('prefers dimming capability over simple on/off', () => {
      const node = makeNode({
        endpoints: [makeEndpoint([CommandClass.BinarySwitch, CommandClass.MultilevelSwitch])],
      });
      const devices = mapNode(node);
      expect(devices).toHaveLength(1);
      expect(devices[0].deviceType).toBe(dimmableLight);
    });
  });

  describe('binary sensors', () => {
    it('defaults to a contact sensor when no motion metadata exists', () => {
      const node = makeNode({
        endpoints: [makeEndpoint([CommandClass.BinarySensor])],
      });
      const devices = mapNode(node);
      expect(devices).toHaveLength(1);
      expect(devices[0].deviceType).toBe(contactSensor);
    });

    it('identifies a motion sensor when motion-related metadata exists', () => {
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
  });

  describe('multilevel sensors', () => {
    it('identifies a temperature sensor from the property label', () => {
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

    it('creates separate Matter devices for a multi-sensor node', () => {
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
  });

  describe('notification-based sensors', () => {
    it('maps an access control notification to a contact sensor', () => {
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

    it('maps a home security notification to an occupancy sensor', () => {
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

    it('maps a water alarm notification to a water leak detector', () => {
      const node = makeNode({
        endpoints: [makeEndpoint([CommandClass.Notification])],
        values: {
          '113-0-Water Alarm': {
            commandClass: CommandClass.Notification,
            endpoint: 0,
            property: 'Water Alarm',
            propertyKey: 'Sensor status',
            value: 0,
            metadata: {
              type: 'number',
              readable: true,
              writeable: false,
              label: 'Sensor status',
              ccSpecific: { notificationType: NotificationType.Water },
              states: { '0': 'idle', '2': 'Water leak detected' },
            },
          },
        },
      });
      const devices = mapNode(node);
      expect(devices).toHaveLength(1);
      expect(devices[0].deviceType).toBe(waterLeakDetector);
      expect(devices[0].label).toBe('Water Leak Sensor');
    });
  });

  describe('edge cases', () => {
    it('returns no devices for a node with no supported command classes', () => {
      const node = makeNode({ endpoints: [makeEndpoint([])] });
      const devices = mapNode(node);
      expect(devices).toHaveLength(0);
    });
  });
});
