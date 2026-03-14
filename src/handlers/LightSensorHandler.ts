import type { MatterbridgeEndpoint } from 'matterbridge';
import type { ValueUpdatedArgs } from '../zwave/types.js';
import { CommandClass } from '../zwave/types.js';
import { zwaveIlluminanceToMatter } from '../mapper/ValueConverter.js';
import type { DeviceHandlerContext } from './DeviceHandler.js';
import { BaseHandler } from './BaseHandler.js';

export class LightSensorHandler extends BaseHandler {
  constructor(ctx: DeviceHandlerContext) {
    super(ctx);
  }

  addClusters(endpoint: MatterbridgeEndpoint): void {
    endpoint.createDefaultIlluminanceMeasurementClusterServer();
  }

  setup(): void {
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

  async handleValueUpdate(args: ValueUpdatedArgs): Promise<void> {
    if (args.commandClass !== CommandClass.MultilevelSensor) return;
    const label = String(args.propertyName ?? args.property).toLowerCase();
    if (!label.includes('illuminance') && !label.includes('luminance')) return;

    const matterValue = zwaveIlluminanceToMatter(Number(args.newValue));
    this.log.debug(`Node ${this.node.nodeId}: Illuminance → ${Number(args.newValue)} lux (matter: ${matterValue})`);
    await this.endpoint.setAttribute('illuminanceMeasurement', 'measuredValue', matterValue, this.log);
  }
}
