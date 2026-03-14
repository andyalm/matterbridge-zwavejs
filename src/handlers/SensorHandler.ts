import type { MatterbridgeEndpoint, DeviceTypeDefinition } from 'matterbridge';
import {
  temperatureSensor,
  humiditySensor,
  lightSensor,
  contactSensor,
  occupancySensor,
  waterLeakDetector,
} from 'matterbridge';
import type { AnsiLogger } from 'matterbridge/logger';
import type { ZWaveNode, ValueUpdatedArgs } from '../zwave/types.js';
import { CommandClass, NotificationType } from '../zwave/types.js';
import { zwaveTemperatureToMatter, zwaveHumidityToMatter, zwaveIlluminanceToMatter } from '../mapper/ValueConverter.js';

/**
 * Handles state sync from Z-Wave sensors to Matter sensor devices.
 * Sensors are read-only — no command handlers needed.
 */
export class SensorHandler {
  constructor(
    private readonly endpoint: MatterbridgeEndpoint,
    private readonly deviceType: DeviceTypeDefinition,
    private readonly node: ZWaveNode,
    private readonly zwaveEndpointIndex: number,
    private readonly log: AnsiLogger,
  ) {}

  /** Set initial sensor values from Z-Wave state. */
  setup(): void {
    this.setInitialState();
  }

  /** Handle a value update from Z-Wave and push to Matter. */
  async handleValueUpdate(args: ValueUpdatedArgs): Promise<void> {
    if (this.deviceType === temperatureSensor) {
      await this.handleTemperatureUpdate(args);
    } else if (this.deviceType === humiditySensor) {
      await this.handleHumidityUpdate(args);
    } else if (this.deviceType === lightSensor) {
      await this.handleIlluminanceUpdate(args);
    } else if (this.deviceType === contactSensor) {
      await this.handleContactUpdate(args);
    } else if (this.deviceType === occupancySensor) {
      await this.handleOccupancyUpdate(args);
    } else if (this.deviceType === waterLeakDetector) {
      await this.handleWaterLeakUpdate(args);
    }
  }

  private async handleTemperatureUpdate(args: ValueUpdatedArgs): Promise<void> {
    if (args.commandClass !== CommandClass.MultilevelSensor) return;
    const label = String(args.propertyName ?? args.property).toLowerCase();
    if (!label.includes('temperature') && !label.includes('air')) return;

    const unit = this.findSensorUnit(CommandClass.MultilevelSensor, args.property, args.propertyKey);
    const matterValue = zwaveTemperatureToMatter(Number(args.newValue), unit);
    this.log.debug(
      `Node ${this.node.nodeId}: Temperature → ${Number(args.newValue)}${unit ?? '°C'} (matter: ${matterValue})`,
    );
    await this.endpoint.setAttribute('temperatureMeasurement', 'measuredValue', matterValue, this.log);
  }

  private async handleHumidityUpdate(args: ValueUpdatedArgs): Promise<void> {
    if (args.commandClass !== CommandClass.MultilevelSensor) return;
    const label = String(args.propertyName ?? args.property).toLowerCase();
    if (!label.includes('humidity')) return;

    const matterValue = zwaveHumidityToMatter(Number(args.newValue));
    this.log.debug(`Node ${this.node.nodeId}: Humidity → ${Number(args.newValue)}% (matter: ${matterValue})`);
    await this.endpoint.setAttribute('relativeHumidityMeasurement', 'measuredValue', matterValue, this.log);
  }

  private async handleIlluminanceUpdate(args: ValueUpdatedArgs): Promise<void> {
    if (args.commandClass !== CommandClass.MultilevelSensor) return;
    const label = String(args.propertyName ?? args.property).toLowerCase();
    if (!label.includes('illuminance') && !label.includes('luminance')) return;

    const matterValue = zwaveIlluminanceToMatter(Number(args.newValue));
    this.log.debug(`Node ${this.node.nodeId}: Illuminance → ${Number(args.newValue)} lux (matter: ${matterValue})`);
    await this.endpoint.setAttribute('illuminanceMeasurement', 'measuredValue', matterValue, this.log);
  }

  private async handleContactUpdate(args: ValueUpdatedArgs): Promise<void> {
    if (args.commandClass === CommandClass.BinarySensor || args.commandClass === CommandClass.Notification) {
      // For contact sensors: Z-Wave true = open (alarm), Matter BooleanState true = contact (closed)
      // So we invert: Z-Wave open/true → Matter false (no contact)
      const contact = !args.newValue;
      this.log.debug(`Node ${this.node.nodeId}: Contact → ${contact ? 'closed' : 'open'}`);
      await this.endpoint.setAttribute('booleanState', 'stateValue', contact, this.log);
    }
  }

  private async handleOccupancyUpdate(args: ValueUpdatedArgs): Promise<void> {
    if (args.commandClass === CommandClass.BinarySensor || args.commandClass === CommandClass.Notification) {
      const occupied = Boolean(args.newValue);
      this.log.debug(`Node ${this.node.nodeId}: Occupancy → ${occupied ? 'occupied' : 'clear'}`);
      // Matter OccupancySensing occupancy is a bitmap, bit 0 = occupied
      await this.endpoint.setAttribute('occupancySensing', 'occupancy', { occupied }, this.log);
    }
  }

  private setInitialState(): void {
    if (this.deviceType === temperatureSensor) {
      this.setInitialTemperature();
    } else if (this.deviceType === humiditySensor) {
      this.setInitialHumidity();
    } else if (this.deviceType === lightSensor) {
      this.setInitialIlluminance();
    } else if (this.deviceType === contactSensor) {
      this.setInitialContact();
    } else if (this.deviceType === occupancySensor) {
      this.setInitialOccupancy();
    } else if (this.deviceType === waterLeakDetector) {
      this.setInitialWaterLeak();
    }
  }

  private setInitialTemperature(): void {
    const value = this.findSensorValue(CommandClass.MultilevelSensor, 'temperature');
    if (value !== undefined) {
      const unit = this.findSensorUnit(CommandClass.MultilevelSensor, 'Air temperature');
      this.endpoint.setAttribute(
        'temperatureMeasurement',
        'measuredValue',
        zwaveTemperatureToMatter(Number(value), unit),
        this.log,
      );
    }
  }

  private setInitialHumidity(): void {
    const value = this.findSensorValue(CommandClass.MultilevelSensor, 'humidity');
    if (value !== undefined) {
      this.endpoint.setAttribute(
        'relativeHumidityMeasurement',
        'measuredValue',
        zwaveHumidityToMatter(Number(value)),
        this.log,
      );
    }
  }

  private setInitialIlluminance(): void {
    const value = this.findSensorValue(CommandClass.MultilevelSensor, 'illuminance');
    if (value !== undefined) {
      this.endpoint.setAttribute(
        'illuminanceMeasurement',
        'measuredValue',
        zwaveIlluminanceToMatter(Number(value)),
        this.log,
      );
    }
  }

  private setInitialContact(): void {
    const value = this.findBinarySensorValue();
    if (value !== undefined) {
      this.endpoint.setAttribute('booleanState', 'stateValue', !value, this.log);
    }
  }

  private setInitialOccupancy(): void {
    const value = this.findBinarySensorValue();
    if (value !== undefined) {
      this.endpoint.setAttribute('occupancySensing', 'occupancy', { occupied: Boolean(value) }, this.log);
    }
  }

  private async handleWaterLeakUpdate(args: ValueUpdatedArgs): Promise<void> {
    if (args.commandClass === CommandClass.Notification) {
      // Z-Wave: 0 = idle (dry), non-zero (e.g. 2) = water leak detected
      // Matter BooleanState: true = normal (dry), false = alarm (leak)
      const noLeak = !args.newValue;
      this.log.debug(`Node ${this.node.nodeId}: Water Leak → ${noLeak ? 'dry' : 'leak detected'}`);
      await this.endpoint.setAttribute('booleanState', 'stateValue', noLeak, this.log);
    }
  }

  private setInitialWaterLeak(): void {
    const value = this.findNotificationValue(NotificationType.Water);
    if (value !== undefined) {
      this.endpoint.setAttribute('booleanState', 'stateValue', !value, this.log);
    }
  }

  private findNotificationValue(notificationType: number): unknown {
    for (const [, val] of Object.entries(this.node.values)) {
      if (val.commandClass !== CommandClass.Notification) continue;
      if (val.endpoint !== this.zwaveEndpointIndex) continue;
      if (val.metadata?.ccSpecific?.['notificationType'] !== notificationType) continue;
      return val.value;
    }
    return undefined;
  }

  private findSensorValue(commandClass: number, propertyHint: string): unknown {
    for (const [, val] of Object.entries(this.node.values)) {
      if (val.commandClass !== commandClass || val.endpoint !== this.zwaveEndpointIndex) continue;
      const label = (val.metadata?.label ?? String(val.property)).toLowerCase();
      if (label.includes(propertyHint)) {
        return val.value;
      }
    }
    return undefined;
  }

  private findSensorUnit(
    commandClass: number,
    property: string | number,
    propertyKey?: string | number,
  ): string | undefined {
    for (const [, val] of Object.entries(this.node.values)) {
      if (val.commandClass !== commandClass || val.endpoint !== this.zwaveEndpointIndex) continue;
      if (
        val.property === property ||
        (val.metadata?.label ?? '').toLowerCase().includes(String(property).toLowerCase())
      ) {
        if (propertyKey !== undefined && val.propertyKey !== propertyKey) continue;
        return val.metadata?.unit;
      }
    }
    return undefined;
  }

  private findBinarySensorValue(): unknown {
    // Check Binary Sensor CC first
    for (const [, val] of Object.entries(this.node.values)) {
      if (val.commandClass === CommandClass.BinarySensor && val.endpoint === this.zwaveEndpointIndex) {
        return val.value;
      }
    }
    // Fall back to Notification CC
    for (const [, val] of Object.entries(this.node.values)) {
      if (val.commandClass === CommandClass.Notification && val.endpoint === this.zwaveEndpointIndex) {
        return val.value;
      }
    }
    return undefined;
  }
}
