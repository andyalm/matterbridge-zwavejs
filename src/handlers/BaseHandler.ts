import type { MatterbridgeEndpoint } from 'matterbridge';
import type { AnsiLogger } from 'matterbridge/logger';
import type { ValueUpdatedArgs, ZWaveNode } from '../zwave/types.js';
import { CommandClass } from '../zwave/types.js';
import type { DeviceHandler, DeviceHandlerContext } from './DeviceHandler.js';

export abstract class BaseHandler implements DeviceHandler {
  protected readonly endpoint: MatterbridgeEndpoint;
  protected readonly node: ZWaveNode;
  protected readonly zwaveEndpointIndex: number;
  protected readonly log: AnsiLogger;

  constructor(ctx: DeviceHandlerContext) {
    this.endpoint = ctx.endpoint;
    this.node = ctx.node;
    this.zwaveEndpointIndex = ctx.zwaveEndpointIndex;
    this.log = ctx.log;
  }

  abstract addClusters(endpoint: MatterbridgeEndpoint): void;
  abstract setup(): void;
  abstract handleValueUpdate(args: ValueUpdatedArgs): Promise<void>;

  protected findCurrentValue(commandClass: number, property: string): unknown {
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

  protected findSensorValue(commandClass: number, propertyHint: string): unknown {
    for (const [, val] of Object.entries(this.node.values)) {
      if (val.commandClass !== commandClass || val.endpoint !== this.zwaveEndpointIndex) continue;
      const label = (val.metadata?.label ?? String(val.property)).toLowerCase();
      if (label.includes(propertyHint)) {
        return val.value;
      }
    }
    return undefined;
  }

  protected findSensorUnit(
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

  protected findBinarySensorValue(): unknown {
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

  protected findNotificationValue(notificationType: number): unknown {
    for (const [, val] of Object.entries(this.node.values)) {
      if (val.commandClass !== CommandClass.Notification) continue;
      if (val.endpoint !== this.zwaveEndpointIndex) continue;
      if (val.metadata?.ccSpecific?.['notificationType'] !== notificationType) continue;
      return val.value;
    }
    return undefined;
  }
}
