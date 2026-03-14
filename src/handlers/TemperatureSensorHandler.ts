import type { MatterbridgeEndpoint } from 'matterbridge';
import type { ValueUpdatedArgs } from '../zwave/types.js';
import { CommandClass } from '../zwave/types.js';
import { zwaveTemperatureToMatter } from '../mapper/ValueConverter.js';
import type { DeviceHandlerContext } from './DeviceHandler.js';
import { BaseHandler } from './BaseHandler.js';

export class TemperatureSensorHandler extends BaseHandler {
  constructor(ctx: DeviceHandlerContext) {
    super(ctx);
  }

  addClusters(endpoint: MatterbridgeEndpoint): void {
    endpoint.createDefaultTemperatureMeasurementClusterServer();
  }

  setup(): void {
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

  async handleValueUpdate(args: ValueUpdatedArgs): Promise<void> {
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
}
