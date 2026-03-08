import type { MatterbridgeEndpoint } from 'matterbridge';
import type { AnsiLogger } from 'matterbridge/logger';
import type { ZWaveClient } from '../zwave/ZWaveClient.js';
import type { ValueUpdatedArgs, ZWaveNode } from '../zwave/types.js';
import { CommandClass } from '../zwave/types.js';
import { zwaveLevelToMatter, matterLevelToZwave } from '../mapper/ValueConverter.js';

/**
 * Handles bidirectional sync between Z-Wave Binary/Multilevel Switch and Matter OnOff/LevelControl.
 */
export class SwitchHandler {
  constructor(
    private readonly endpoint: MatterbridgeEndpoint,
    private readonly client: ZWaveClient,
    private readonly node: ZWaveNode,
    private readonly zwaveEndpointIndex: number,
    private readonly isDimmable: boolean,
    private readonly log: AnsiLogger,
  ) {}

  /** Register Matter command handlers and set initial state. */
  setup(): void {
    this.registerCommandHandlers();
    this.setInitialState();
  }

  /** Handle a value update from Z-Wave and push to Matter. */
  async handleValueUpdate(args: ValueUpdatedArgs): Promise<void> {
    const cc = args.commandClass;
    const property = String(args.property);

    if (cc === CommandClass.BinarySwitch && property === 'currentValue') {
      const onOff = Boolean(args.newValue);
      this.log.debug(`Node ${this.node.nodeId}: Binary Switch → ${onOff ? 'ON' : 'OFF'}`);
      await this.endpoint.setAttribute('onOff', 'onOff', onOff, this.log);
    }

    if (cc === CommandClass.MultilevelSwitch && property === 'currentValue') {
      const zwaveLevel = Number(args.newValue);
      const onOff = zwaveLevel > 0;
      const matterLevel = zwaveLevelToMatter(zwaveLevel);

      this.log.debug(`Node ${this.node.nodeId}: Multilevel Switch → level ${zwaveLevel} (matter: ${matterLevel})`);
      await this.endpoint.setAttribute('onOff', 'onOff', onOff, this.log);
      if (this.isDimmable) {
        await this.endpoint.setAttribute('levelControl', 'currentLevel', matterLevel, this.log);
      }
    }
  }

  private registerCommandHandlers(): void {
    // OnOff commands
    this.endpoint.addCommandHandler('on', async () => {
      this.log.debug(`Node ${this.node.nodeId}: Matter ON command`);
      if (this.isDimmable) {
        await this.client.setValue(
          this.node.nodeId,
          {
            commandClass: CommandClass.MultilevelSwitch,
            endpoint: this.zwaveEndpointIndex,
            property: 'targetValue',
          },
          99,
        );
      } else {
        await this.client.setValue(
          this.node.nodeId,
          {
            commandClass: CommandClass.BinarySwitch,
            endpoint: this.zwaveEndpointIndex,
            property: 'targetValue',
          },
          true,
        );
      }
    });

    this.endpoint.addCommandHandler('off', async () => {
      this.log.debug(`Node ${this.node.nodeId}: Matter OFF command`);
      if (this.isDimmable) {
        await this.client.setValue(
          this.node.nodeId,
          {
            commandClass: CommandClass.MultilevelSwitch,
            endpoint: this.zwaveEndpointIndex,
            property: 'targetValue',
          },
          0,
        );
      } else {
        await this.client.setValue(
          this.node.nodeId,
          {
            commandClass: CommandClass.BinarySwitch,
            endpoint: this.zwaveEndpointIndex,
            property: 'targetValue',
          },
          false,
        );
      }
    });

    this.endpoint.addCommandHandler('toggle', async () => {
      this.log.debug(`Node ${this.node.nodeId}: Matter TOGGLE command`);
      const currentOnOff = this.endpoint.getAttribute('onOff', 'onOff', this.log) as boolean;
      if (this.isDimmable) {
        await this.client.setValue(
          this.node.nodeId,
          {
            commandClass: CommandClass.MultilevelSwitch,
            endpoint: this.zwaveEndpointIndex,
            property: 'targetValue',
          },
          currentOnOff ? 0 : 99,
        );
      } else {
        await this.client.setValue(
          this.node.nodeId,
          {
            commandClass: CommandClass.BinarySwitch,
            endpoint: this.zwaveEndpointIndex,
            property: 'targetValue',
          },
          !currentOnOff,
        );
      }
    });

    // LevelControl commands (dimmable only)
    if (this.isDimmable) {
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
  }

  private setInitialState(): void {
    if (this.isDimmable) {
      const value = this.findCurrentValue(CommandClass.MultilevelSwitch, 'currentValue');
      if (value !== undefined) {
        const level = Number(value);
        this.endpoint.setAttribute('onOff', 'onOff', level > 0, this.log);
        this.endpoint.setAttribute('levelControl', 'currentLevel', zwaveLevelToMatter(level), this.log);
      }
    } else {
      const value = this.findCurrentValue(CommandClass.BinarySwitch, 'currentValue');
      if (value !== undefined) {
        this.endpoint.setAttribute('onOff', 'onOff', Boolean(value), this.log);
      }
    }
  }

  private findCurrentValue(commandClass: number, property: string): unknown {
    for (const [, val] of Object.entries(this.node.values)) {
      if (
        val.commandClass === commandClass &&
        val.endpoint === this.zwaveEndpointIndex &&
        String(val.property) === property
      ) {
        return val.value;
      }
    }
    return undefined;
  }
}
