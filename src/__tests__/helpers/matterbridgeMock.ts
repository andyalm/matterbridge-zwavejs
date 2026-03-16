/**
 * Mock for the 'matterbridge' module.
 *
 * Provides fake device type definitions and a stub MatterbridgeDynamicPlatform
 * so handler/platform tests can run without the real matterbridge installed.
 */
import { vi } from 'vitest';

// Device type definitions — simple objects with a name property
export const onOffLight = { name: 'onOffLight', code: 0x0100 };
export const onOffOutlet = { name: 'onOffOutlet', code: 0x010a };
export const onOffSwitch = { name: 'onOffSwitch', code: 0x010b };
export const dimmableLight = { name: 'dimmableLight', code: 0x0101 };
export const temperatureSensor = { name: 'temperatureSensor', code: 0x0302 };
export const humiditySensor = { name: 'humiditySensor', code: 0x0307 };
export const lightSensor = { name: 'lightSensor', code: 0x0106 };
export const contactSensor = { name: 'contactSensor', code: 0x0015 };
export const occupancySensor = { name: 'occupancySensor', code: 0x0107 };
export const waterLeakDetector = { name: 'waterLeakDetector', code: 0x0043 };

// Stub MatterbridgeEndpoint constructor — returns a mock endpoint with all needed methods
export const MatterbridgeEndpoint = vi.fn().mockImplementation(() => {
  const attributes: Record<string, unknown> = {};
  const commandHandlers: Record<string, (...args: unknown[]) => Promise<void>> = {};
  return {
    createDefaultOnOffClusterServer: vi.fn(),
    createDefaultLevelControlClusterServer: vi.fn(),
    createDefaultTemperatureMeasurementClusterServer: vi.fn(),
    createDefaultRelativeHumidityMeasurementClusterServer: vi.fn(),
    createDefaultIlluminanceMeasurementClusterServer: vi.fn(),
    createDefaultBooleanStateClusterServer: vi.fn(),
    createDefaultOccupancySensingClusterServer: vi.fn(),
    createDefaultBridgedDeviceBasicInformationClusterServer: vi.fn(),
    createDefaultPowerSourceBatteryClusterServer: vi.fn(),
    addCommandHandler: vi.fn((name: string, handler: (...args: unknown[]) => Promise<void>) => {
      commandHandlers[name] = handler;
    }),
    setAttribute: vi.fn((cluster: string, attribute: string, value: unknown) => {
      attributes[`${cluster}.${attribute}`] = value;
    }),
    getAttribute: vi.fn((cluster: string, attribute: string) => {
      return attributes[`${cluster}.${attribute}`];
    }),
    attributes,
    commandHandlers,
  };
});

// Stub MatterbridgeDynamicPlatform base class
export class MatterbridgeDynamicPlatform {
  log: unknown;
  config: unknown;

  constructor(matterbridge: unknown, log: unknown, config: unknown) {
    this.log = log;
    this.config = config;
  }

  async registerDevice(_endpoint: unknown): Promise<void> {}
  async unregisterDevice(_endpoint: unknown): Promise<void> {}
  getDeviceByUniqueId(_id: string): unknown {
    return undefined;
  }
}
