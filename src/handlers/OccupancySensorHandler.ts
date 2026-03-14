import type { MatterbridgeEndpoint } from 'matterbridge';
import type { ValueUpdatedArgs } from '../zwave/types.js';
import { CommandClass } from '../zwave/types.js';
import type { DeviceHandlerContext } from './DeviceHandler.js';
import { BaseHandler } from './BaseHandler.js';

export class OccupancySensorHandler extends BaseHandler {
  constructor(ctx: DeviceHandlerContext) {
    super(ctx);
  }

  addClusters(endpoint: MatterbridgeEndpoint): void {
    endpoint.createDefaultOccupancySensingClusterServer();
  }

  setup(): void {
    const value = this.findBinarySensorValue();
    if (value !== undefined) {
      this.endpoint.setAttribute('occupancySensing', 'occupancy', { occupied: Boolean(value) }, this.log);
    }
  }

  async handleValueUpdate(args: ValueUpdatedArgs): Promise<void> {
    if (args.commandClass === CommandClass.BinarySensor || args.commandClass === CommandClass.Notification) {
      const occupied = Boolean(args.newValue);
      this.log.debug(`Node ${this.node.nodeId}: Occupancy → ${occupied ? 'occupied' : 'clear'}`);
      await this.endpoint.setAttribute('occupancySensing', 'occupancy', { occupied }, this.log);
    }
  }
}
