import type { MatterbridgeEndpoint } from 'matterbridge';
import type { ValueUpdatedArgs } from '../zwave/types.js';
import { CommandClass } from '../zwave/types.js';
import type { ZWaveClient } from '../zwave/ZWaveClient.js';
import type { DeviceHandlerContext } from './DeviceHandler.js';
import { BaseHandler } from './BaseHandler.js';

export class BinarySwitchHandler extends BaseHandler {
  private readonly client: ZWaveClient;

  constructor(ctx: DeviceHandlerContext) {
    super(ctx);
    this.client = ctx.client!;
  }

  addClusters(endpoint: MatterbridgeEndpoint): void {
    endpoint.createDefaultOnOffClusterServer();
  }

  setup(): void {
    this.registerCommandHandlers();
    this.setInitialState();
  }

  async handleValueUpdate(args: ValueUpdatedArgs): Promise<void> {
    if (args.commandClass === CommandClass.BinarySwitch && String(args.property) === 'currentValue') {
      const onOff = Boolean(args.newValue);
      this.log.debug(`Node ${this.node.nodeId}: Binary Switch → ${onOff ? 'ON' : 'OFF'}`);
      await this.endpoint.setAttribute('onOff', 'onOff', onOff, this.log);
    }
  }

  private registerCommandHandlers(): void {
    this.endpoint.addCommandHandler('on', async () => {
      this.log.debug(`Node ${this.node.nodeId}: Matter ON command`);
      await this.client.setValue(
        this.node.nodeId,
        {
          commandClass: CommandClass.BinarySwitch,
          endpoint: this.zwaveEndpointIndex,
          property: 'targetValue',
        },
        true,
      );
    });

    this.endpoint.addCommandHandler('off', async () => {
      this.log.debug(`Node ${this.node.nodeId}: Matter OFF command`);
      await this.client.setValue(
        this.node.nodeId,
        {
          commandClass: CommandClass.BinarySwitch,
          endpoint: this.zwaveEndpointIndex,
          property: 'targetValue',
        },
        false,
      );
    });

    this.endpoint.addCommandHandler('toggle', async () => {
      this.log.debug(`Node ${this.node.nodeId}: Matter TOGGLE command`);
      const currentOnOff = this.endpoint.getAttribute('onOff', 'onOff', this.log) as boolean;
      await this.client.setValue(
        this.node.nodeId,
        {
          commandClass: CommandClass.BinarySwitch,
          endpoint: this.zwaveEndpointIndex,
          property: 'targetValue',
        },
        !currentOnOff,
      );
    });
  }

  private setInitialState(): void {
    const value = this.findCurrentValue(CommandClass.BinarySwitch, 'currentValue');
    if (value !== undefined) {
      this.endpoint.setAttribute('onOff', 'onOff', Boolean(value), this.log);
    }
  }
}
