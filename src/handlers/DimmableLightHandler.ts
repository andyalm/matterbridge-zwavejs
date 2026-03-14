import type { MatterbridgeEndpoint } from 'matterbridge';
import type { ValueUpdatedArgs } from '../zwave/types.js';
import { CommandClass } from '../zwave/types.js';
import type { ZWaveClient } from '../zwave/ZWaveClient.js';
import { zwaveLevelToMatter, matterLevelToZwave } from '../mapper/ValueConverter.js';
import type { DeviceHandlerContext } from './DeviceHandler.js';
import { BaseHandler } from './BaseHandler.js';

export class DimmableLightHandler extends BaseHandler {
  private readonly client: ZWaveClient;

  constructor(ctx: DeviceHandlerContext) {
    super(ctx);
    this.client = ctx.client!;
  }

  addClusters(endpoint: MatterbridgeEndpoint): void {
    endpoint.createDefaultOnOffClusterServer();
    endpoint.createDefaultLevelControlClusterServer();
  }

  setup(): void {
    this.registerCommandHandlers();
    this.setInitialState();
  }

  async handleValueUpdate(args: ValueUpdatedArgs): Promise<void> {
    if (args.commandClass === CommandClass.MultilevelSwitch && String(args.property) === 'currentValue') {
      const zwaveLevel = Number(args.newValue);
      const onOff = zwaveLevel > 0;
      const matterLevel = zwaveLevelToMatter(zwaveLevel);

      this.log.debug(`Node ${this.node.nodeId}: Multilevel Switch → level ${zwaveLevel} (matter: ${matterLevel})`);
      await this.endpoint.setAttribute('onOff', 'onOff', onOff, this.log);
      await this.endpoint.setAttribute('levelControl', 'currentLevel', matterLevel, this.log);
    }
  }

  private registerCommandHandlers(): void {
    this.endpoint.addCommandHandler('on', async () => {
      this.log.debug(`Node ${this.node.nodeId}: Matter ON command`);
      await this.client.setValue(
        this.node.nodeId,
        {
          commandClass: CommandClass.MultilevelSwitch,
          endpoint: this.zwaveEndpointIndex,
          property: 'targetValue',
        },
        99,
      );
    });

    this.endpoint.addCommandHandler('off', async () => {
      this.log.debug(`Node ${this.node.nodeId}: Matter OFF command`);
      await this.client.setValue(
        this.node.nodeId,
        {
          commandClass: CommandClass.MultilevelSwitch,
          endpoint: this.zwaveEndpointIndex,
          property: 'targetValue',
        },
        0,
      );
    });

    this.endpoint.addCommandHandler('toggle', async () => {
      this.log.debug(`Node ${this.node.nodeId}: Matter TOGGLE command`);
      const currentOnOff = this.endpoint.getAttribute('onOff', 'onOff', this.log) as boolean;
      await this.client.setValue(
        this.node.nodeId,
        {
          commandClass: CommandClass.MultilevelSwitch,
          endpoint: this.zwaveEndpointIndex,
          property: 'targetValue',
        },
        currentOnOff ? 0 : 99,
      );
    });

    this.endpoint.addCommandHandler('moveToLevel', async (data) => {
      const matterLevel = data.request.level as number;
      const zwaveLevel = matterLevelToZwave(matterLevel);
      this.log.debug(`Node ${this.node.nodeId}: Matter moveToLevel ${matterLevel} → Z-Wave ${zwaveLevel}`);
      await this.client.setValue(
        this.node.nodeId,
        {
          commandClass: CommandClass.MultilevelSwitch,
          endpoint: this.zwaveEndpointIndex,
          property: 'targetValue',
        },
        zwaveLevel,
      );
    });

    this.endpoint.addCommandHandler('moveToLevelWithOnOff', async (data) => {
      const matterLevel = data.request.level as number;
      const zwaveLevel = matterLevelToZwave(matterLevel);
      this.log.debug(`Node ${this.node.nodeId}: Matter moveToLevelWithOnOff ${matterLevel} → Z-Wave ${zwaveLevel}`);
      await this.client.setValue(
        this.node.nodeId,
        {
          commandClass: CommandClass.MultilevelSwitch,
          endpoint: this.zwaveEndpointIndex,
          property: 'targetValue',
        },
        zwaveLevel,
      );
    });
  }

  private setInitialState(): void {
    const value = this.findCurrentValue(CommandClass.MultilevelSwitch, 'currentValue');
    if (value !== undefined) {
      const level = Number(value);
      this.endpoint.setAttribute('onOff', 'onOff', level > 0, this.log);
      this.endpoint.setAttribute('levelControl', 'currentLevel', zwaveLevelToMatter(level), this.log);
    }
  }
}
