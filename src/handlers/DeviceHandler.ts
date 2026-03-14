import type { MatterbridgeEndpoint } from 'matterbridge';
import type { AnsiLogger } from 'matterbridge/logger';
import type { ValueUpdatedArgs, ZWaveNode } from '../zwave/types.js';
import type { ZWaveClient } from '../zwave/ZWaveClient.js';

export interface DeviceHandlerContext {
  endpoint: MatterbridgeEndpoint;
  node: ZWaveNode;
  zwaveEndpointIndex: number;
  log: AnsiLogger;
  client?: ZWaveClient;
}

export interface DeviceHandler {
  /** Add Matter clusters to the endpoint (called before endpoint registration). */
  addClusters(endpoint: MatterbridgeEndpoint): void;

  /** Register command handlers and set initial state (called after endpoint registration). */
  setup(): void;

  /** Handle a Z-Wave value update event and push to Matter. */
  handleValueUpdate(args: ValueUpdatedArgs): Promise<void>;
}
