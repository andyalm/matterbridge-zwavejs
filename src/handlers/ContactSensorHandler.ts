import type { MatterbridgeEndpoint } from 'matterbridge';
import type { ValueUpdatedArgs } from '../zwave/types.js';
import { CommandClass } from '../zwave/types.js';
import type { DeviceHandlerContext } from './DeviceHandler.js';
import { BaseHandler } from './BaseHandler.js';

export class ContactSensorHandler extends BaseHandler {
  constructor(ctx: DeviceHandlerContext) {
    super(ctx);
  }

  addClusters(endpoint: MatterbridgeEndpoint): void {
    endpoint.createDefaultBooleanStateClusterServer();
  }

  setup(): void {
    const value = this.findBinarySensorValue();
    if (value !== undefined) {
      // Z-Wave true = open (alarm), Matter BooleanState true = contact (closed)
      this.endpoint.setAttribute('booleanState', 'stateValue', !value, this.log);
    }
  }

  async handleValueUpdate(args: ValueUpdatedArgs): Promise<void> {
    if (args.commandClass === CommandClass.BinarySensor || args.commandClass === CommandClass.Notification) {
      // For contact sensors: Z-Wave true = open (alarm), Matter BooleanState true = contact (closed)
      const contact = !args.newValue;
      this.log.debug(`Node ${this.node.nodeId}: Contact → ${contact ? 'closed' : 'open'}`);
      await this.endpoint.setAttribute('booleanState', 'stateValue', contact, this.log);
    }
  }
}
