import type { DeviceTypeDefinition } from 'matterbridge';
import {
  onOffLight,
  onOffOutlet,
  onOffSwitch,
  dimmableLight,
  temperatureSensor,
  humiditySensor,
  lightSensor,
  contactSensor,
  occupancySensor,
  waterLeakDetector,
} from 'matterbridge';
import type { DeviceHandler, DeviceHandlerContext } from './DeviceHandler.js';
import { BinarySwitchHandler } from './BinarySwitchHandler.js';
import { DimmableLightHandler } from './DimmableLightHandler.js';
import { TemperatureSensorHandler } from './TemperatureSensorHandler.js';
import { HumiditySensorHandler } from './HumiditySensorHandler.js';
import { LightSensorHandler } from './LightSensorHandler.js';
import { ContactSensorHandler } from './ContactSensorHandler.js';
import { OccupancySensorHandler } from './OccupancySensorHandler.js';
import { WaterLeakHandler } from './WaterLeakHandler.js';

type HandlerFactory = (ctx: DeviceHandlerContext) => DeviceHandler;

const registry = new Map<DeviceTypeDefinition, HandlerFactory>();

registry.set(onOffLight, (ctx) => new BinarySwitchHandler(ctx));
registry.set(onOffOutlet, (ctx) => new BinarySwitchHandler(ctx));
registry.set(onOffSwitch, (ctx) => new BinarySwitchHandler(ctx));
registry.set(dimmableLight, (ctx) => new DimmableLightHandler(ctx));
registry.set(temperatureSensor, (ctx) => new TemperatureSensorHandler(ctx));
registry.set(humiditySensor, (ctx) => new HumiditySensorHandler(ctx));
registry.set(lightSensor, (ctx) => new LightSensorHandler(ctx));
registry.set(contactSensor, (ctx) => new ContactSensorHandler(ctx));
registry.set(occupancySensor, (ctx) => new OccupancySensorHandler(ctx));
registry.set(waterLeakDetector, (ctx) => new WaterLeakHandler(ctx));

export function createHandler(deviceType: DeviceTypeDefinition, ctx: DeviceHandlerContext): DeviceHandler {
  const factory = registry.get(deviceType);
  if (!factory) {
    throw new Error(`No handler registered for device type: ${deviceType.name}`);
  }
  return factory(ctx);
}
