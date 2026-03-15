import type { MatterbridgeEndpoint } from 'matterbridge';
import type { ValueUpdatedArgs } from '../zwave/types.js';
import { CommandClass, NotificationType } from '../zwave/types.js';
import type { DeviceHandlerContext } from './DeviceHandler.js';
import { BaseHandler } from './BaseHandler.js';

export class WaterLeakHandler extends BaseHandler {
  constructor(ctx: DeviceHandlerContext) {
    super(ctx);
  }

  addClusters(endpoint: MatterbridgeEndpoint): void {
    endpoint.createDefaultBooleanStateClusterServer();
  }

  setup(): void {
    const value = this.findNotificationValue(NotificationType.Water);
    if (value !== undefined) {
      // Z-Wave: 0 = idle (dry), non-zero = leak. Matter: true = leak detected, false = no leak
      this.endpoint.setAttribute('booleanState', 'stateValue', Boolean(value), this.log);
    }
  }

  async handleValueUpdate(args: ValueUpdatedArgs): Promise<void> {
    if (args.commandClass === CommandClass.Notification) {
      // Z-Wave: 0 = idle (dry), non-zero (e.g. 2) = water leak detected
      // Matter BooleanState: true = leak detected, false = no leak
      const leak = Boolean(args.newValue);
      this.log.debug(`Node ${this.node.nodeId}: Water Leak → ${leak ? 'leak detected' : 'dry'}`);
      await this.endpoint.setAttribute('booleanState', 'stateValue', leak, this.log);
    }
  }
}
