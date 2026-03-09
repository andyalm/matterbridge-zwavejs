import {
  MatterbridgeDynamicPlatform,
  MatterbridgeEndpoint,
  type PlatformConfig,
  type PlatformMatterbridge,
  type DeviceTypeDefinition,
  dimmableLight,
  onOffLight,
  onOffOutlet,
  contactSensor,
  occupancySensor,
  temperatureSensor,
  humiditySensor,
  lightSensor,
} from 'matterbridge';
import type { AnsiLogger } from 'matterbridge/logger';
import { ZWaveClient } from './zwave/ZWaveClient.js';
import type { ZWaveNode, ValueUpdatedArgs } from './zwave/types.js';
import { CommandClass } from './zwave/types.js';
import { mapNode, type MappedDevice } from './mapper/DeviceMapper.js';
import { SwitchHandler } from './handlers/SwitchHandler.js';
import { SensorHandler } from './handlers/SensorHandler.js';

interface DeviceRegistration {
  endpoint: MatterbridgeEndpoint;
  mapping: MappedDevice;
  handler: SwitchHandler | SensorHandler;
}

export class ZWaveJSPlatform extends MatterbridgeDynamicPlatform {
  private client: ZWaveClient | null = null;
  /** Map from "nodeId-endpointIndex-deviceTypeLabel" to registration. */
  private devices = new Map<string, DeviceRegistration>();

  constructor(matterbridge: PlatformMatterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);
    this.log.info('ZWaveJS Platform created');
  }

  override async onStart(reason?: string): Promise<void> {
    this.log.info(`Starting ZWaveJS Platform (reason: ${reason ?? 'none'})`);

    const serverUrl = (this.config.serverUrl as string) ?? 'ws://localhost:3000';
    const excludeNodes = (this.config.excludeNodes as number[]) ?? [];
    const includeNodes = (this.config.includeNodes as number[]) ?? [];

    this.client = new ZWaveClient(serverUrl, this.log);

    this.client.on('allNodesReady', (nodes) => {
      this.onAllNodesReady(nodes, includeNodes, excludeNodes);
    });

    this.client.on('valueUpdated', (nodeId, args) => {
      this.onValueUpdated(nodeId, args);
    });

    this.client.on('nodeRemoved', (nodeId) => {
      this.onNodeRemoved(nodeId);
    });

    try {
      await this.client.connect();
    } catch (err) {
      this.log.error(`Failed to connect to zwave-js-server: ${(err as Error).message}`);
      this.log.error('The plugin will keep trying to reconnect in the background.');
    }
  }

  override async onShutdown(reason?: string): Promise<void> {
    this.log.info(`Shutting down ZWaveJS Platform (reason: ${reason ?? 'none'})`);
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
    this.devices.clear();
  }

  private async onAllNodesReady(
    nodes: Map<number, ZWaveNode>,
    includeNodes: number[],
    excludeNodes: number[],
  ): Promise<void> {
    this.log.info(`Processing ${nodes.size} Z-Wave node(s)`);

    for (const [nodeId, node] of nodes) {
      const nodeName = node.name ?? node.deviceConfig?.label ?? `Node ${nodeId}`;
      const endpointCount = node.endpoints?.length ?? 0;
      const valueCount = node.values ? Object.keys(node.values).length : 0;
      // Derive CCs from values (endpoint.commandClasses is often empty)
      const ccIdSet = new Set<number>();
      for (const val of Object.values(node.values ?? {})) {
        ccIdSet.add(val.commandClass);
      }
      for (const ep of node.endpoints ?? []) {
        for (const cc of ep.commandClasses ?? []) {
          ccIdSet.add(cc.id);
        }
      }
      const ccList = [...ccIdSet].map((id) => `0x${id.toString(16)}`);
      this.log.info(`Node ${nodeId} (${nodeName}): ready=${node.ready}, endpoints=${endpointCount}, values=${valueCount}, CCs=[${ccList.join(', ')}]`);

      // Skip the controller node (node 1 is typically the controller)
      if (nodeId === 1) {
        this.log.info(`Skipping node ${nodeId}: controller node`);
        continue;
      }

      // Apply include/exclude filters
      if (includeNodes.length > 0 && !includeNodes.includes(nodeId)) continue;
      if (excludeNodes.includes(nodeId)) continue;

      if (!node.ready) {
        this.log.info(`Skipping node ${nodeId}: not ready (interview stage: ${node.interviewStage})`);
        continue;
      }

      await this.registerNode(node);
    }
  }

  private async registerNode(node: ZWaveNode): Promise<void> {
    const mappedDevices = mapNode(node);
    if (mappedDevices.length === 0) {
      this.log.debug(`Node ${node.nodeId}: no supported device types found`);
      return;
    }

    const nodeName = node.name ?? node.deviceConfig?.label ?? `Node ${node.nodeId}`;
    this.log.info(`Node ${node.nodeId} (${nodeName}): mapping to ${mappedDevices.length} Matter device(s)`);

    for (const mapping of mappedDevices) {
      await this.registerMappedDevice(node, mapping, nodeName);
    }
  }

  private async registerMappedDevice(node: ZWaveNode, mapping: MappedDevice, nodeName: string): Promise<void> {
    const key = `${node.nodeId}-${mapping.endpointIndex}-${mapping.label}`;
    const deviceName = mapping.label !== nodeName ? `${nodeName} ${mapping.label}` : nodeName;
    const serialNumber = `zwave-${node.nodeId}-${mapping.endpointIndex}-${mapping.label.toLowerCase().replace(/\s+/g, '-')}`;
    const uniqueId = serialNumber;

    // Check if already registered
    if (this.getDeviceByUniqueId(uniqueId)) {
      this.log.debug(`Device ${uniqueId} already registered, skipping`);
      return;
    }

    const endpoint = new MatterbridgeEndpoint(mapping.deviceType, { id: uniqueId }, this.config.debug as boolean);
    endpoint.createDefaultBridgedDeviceBasicInformationClusterServer(
      deviceName,
      serialNumber,
      node.manufacturerId ?? 0xfff1,
      node.deviceConfig?.manufacturer ?? 'Z-Wave',
      node.deviceConfig?.description ?? mapping.label,
    );

    // Add clusters based on device type
    this.addClusters(endpoint, mapping.deviceType, node, mapping.endpointIndex);

    // Add battery power source if the node has a Battery CC
    if (this.nodeHasCommandClass(node, CommandClass.Battery)) {
      const batteryLevel = this.findNodeValue(node, CommandClass.Battery, 'level', mapping.endpointIndex);
      endpoint.createDefaultPowerSourceBatteryClusterServer(
        batteryLevel !== undefined ? Math.min(Number(batteryLevel) * 2, 200) : undefined,
      );
    }

    // Create the appropriate handler
    const handler = this.createHandler(endpoint, mapping, node);
    handler.setup();

    // Register with matterbridge
    await super.registerDevice(endpoint);

    this.devices.set(key, { endpoint, mapping, handler });
    this.log.info(`Registered: ${deviceName} (${mapping.deviceType.name}) [${uniqueId}]`);
  }

  private addClusters(
    endpoint: MatterbridgeEndpoint,
    deviceType: DeviceTypeDefinition,
    _node: ZWaveNode,
    _endpointIndex: number,
  ): void {
    if (deviceType === onOffLight || deviceType === onOffOutlet) {
      endpoint.createDefaultOnOffClusterServer();
    } else if (deviceType === dimmableLight) {
      endpoint.createDefaultOnOffClusterServer();
      endpoint.createDefaultLevelControlClusterServer();
    } else if (deviceType === temperatureSensor) {
      endpoint.createDefaultTemperatureMeasurementClusterServer();
    } else if (deviceType === humiditySensor) {
      endpoint.createDefaultRelativeHumidityMeasurementClusterServer();
    } else if (deviceType === lightSensor) {
      endpoint.createDefaultIlluminanceMeasurementClusterServer();
    } else if (deviceType === contactSensor) {
      endpoint.createDefaultBooleanStateClusterServer();
    } else if (deviceType === occupancySensor) {
      endpoint.createDefaultOccupancySensingClusterServer();
    }
  }

  private createHandler(
    endpoint: MatterbridgeEndpoint,
    mapping: MappedDevice,
    node: ZWaveNode,
  ): SwitchHandler | SensorHandler {
    const dt = mapping.deviceType;
    if (dt === onOffLight || dt === onOffOutlet || dt === dimmableLight) {
      return new SwitchHandler(endpoint, this.client!, node, mapping.endpointIndex, dt === dimmableLight, this.log);
    }
    return new SensorHandler(endpoint, dt, node, mapping.endpointIndex, this.log);
  }

  private onValueUpdated(nodeId: number, args: ValueUpdatedArgs): void {
    for (const [key, reg] of this.devices) {
      if (!key.startsWith(`${nodeId}-`)) continue;
      if (reg.mapping.endpointIndex !== args.endpoint) continue;

      reg.handler.handleValueUpdate(args).catch((err) => {
        this.log.error(`Error handling value update for ${key}: ${(err as Error).message}`);
      });
    }
  }

  private async onNodeRemoved(nodeId: number): Promise<void> {
    for (const [key, reg] of this.devices) {
      if (!key.startsWith(`${nodeId}-`)) continue;
      this.log.info(`Unregistering device for removed node ${nodeId}: ${key}`);
      await this.unregisterDevice(reg.endpoint);
      this.devices.delete(key);
    }
  }

  private nodeHasCommandClass(node: ZWaveNode, commandClass: number): boolean {
    return node.endpoints.some((ep) => ep.commandClasses.some((cc) => cc.id === commandClass));
  }

  private findNodeValue(node: ZWaveNode, commandClass: number, property: string, endpointIndex: number): unknown {
    for (const [, val] of Object.entries(node.values)) {
      if (val.commandClass === commandClass && String(val.property) === property && val.endpoint === endpointIndex) {
        return val.value;
      }
    }
    // Try endpoint 0 as fallback (some values only exist on the root endpoint)
    if (endpointIndex !== 0) {
      for (const [, val] of Object.entries(node.values)) {
        if (val.commandClass === commandClass && String(val.property) === property && val.endpoint === 0) {
          return val.value;
        }
      }
    }
    return undefined;
  }
}
