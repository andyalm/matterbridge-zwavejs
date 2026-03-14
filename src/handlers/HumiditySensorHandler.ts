import type { MatterbridgeEndpoint } from 'matterbridge';
import type { ValueUpdatedArgs } from '../zwave/types.js';
import { CommandClass } from '../zwave/types.js';
import { zwaveHumidityToMatter } from '../mapper/ValueConverter.js';
import type { DeviceHandlerContext } from './DeviceHandler.js';
import { BaseHandler } from './BaseHandler.js';

export class HumiditySensorHandler extends BaseHandler {
  constructor(ctx: DeviceHandlerContext) {
    super(ctx);
  }

  addClusters(endpoint: MatterbridgeEndpoint): void {
    endpoint.createDefaultRelativeHumidityMeasurementClusterServer();
  }

  setup(): void {
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

  async handleValueUpdate(args: ValueUpdatedArgs): Promise<void> {
    if (args.commandClass !== CommandClass.MultilevelSensor) return;
    const label = String(args.propertyName ?? args.property).toLowerCase();
    if (!label.includes('humidity')) return;

    const matterValue = zwaveHumidityToMatter(Number(args.newValue));
    this.log.debug(`Node ${this.node.nodeId}: Humidity → ${Number(args.newValue)}% (matter: ${matterValue})`);
    await this.endpoint.setAttribute('relativeHumidityMeasurement', 'measuredValue', matterValue, this.log);
  }
}
