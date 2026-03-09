import type { DeviceTypeDefinition } from 'matterbridge';
import {
  onOffLight,
  onOffOutlet,
  dimmableLight,
  contactSensor,
  occupancySensor,
  temperatureSensor,
  humiditySensor,
  lightSensor,
} from 'matterbridge';
import type { ZWaveNode, ZWaveEndpointCommandClass } from '../zwave/types.js';
import { CommandClass, NotificationType } from '../zwave/types.js';

/** The result of mapping a Z-Wave node to one or more Matter device types. */
export interface MappedDevice {
  /** The Matter device type definition to use. */
  deviceType: DeviceTypeDefinition;
  /** Human-readable label for this mapping (e.g., "Temperature Sensor"). */
  label: string;
  /** The Z-Wave endpoint index this mapping applies to. */
  endpointIndex: number;
}

/**
 * Analyze a Z-Wave node and determine which Matter device types it should be exposed as.
 * A single Z-Wave node may map to multiple Matter devices (e.g., a multi-sensor
 * with temperature + humidity + motion becomes 3 separate Matter devices).
 */
export function mapNode(node: ZWaveNode): MappedDevice[] {
  const devices: MappedDevice[] = [];

  for (const endpoint of node.endpoints) {
    const commandClasses = endpoint.commandClasses ?? [];
    const ccIds = new Set(commandClasses.map((cc) => cc.id));
    const endpointDevices = mapEndpoint(node, endpoint.index, ccIds, commandClasses);
    devices.push(...endpointDevices);
  }

  return devices;
}

function mapEndpoint(
  node: ZWaveNode,
  endpointIndex: number,
  ccIds: Set<number>,
  _commandClasses: ZWaveEndpointCommandClass[],
): MappedDevice[] {
  const devices: MappedDevice[] = [];

  // Multilevel Switch → Dimmable Light (takes precedence over Binary Switch)
  if (ccIds.has(CommandClass.MultilevelSwitch)) {
    devices.push({
      deviceType: dimmableLight,
      label: 'Dimmable Light',
      endpointIndex,
    });
  } else if (ccIds.has(CommandClass.BinarySwitch)) {
    // Binary Switch → On/Off Light or Outlet
    // Use outlet if the generic device class suggests it, otherwise default to light
    const isOutlet = isLikelyOutlet(node);
    devices.push({
      deviceType: isOutlet ? onOffOutlet : onOffLight,
      label: isOutlet ? 'Outlet' : 'Light',
      endpointIndex,
    });
  }

  // Multilevel Sensor — may produce multiple Matter devices
  if (ccIds.has(CommandClass.MultilevelSensor)) {
    const sensorDevices = mapMultilevelSensors(node, endpointIndex);
    devices.push(...sensorDevices);
  }

  // Binary Sensor → Contact Sensor or Occupancy Sensor
  if (ccIds.has(CommandClass.BinarySensor)) {
    const sensorType = classifyBinarySensor(node, endpointIndex);
    devices.push({
      deviceType: sensorType === 'occupancy' ? occupancySensor : contactSensor,
      label: sensorType === 'occupancy' ? 'Motion Sensor' : 'Contact Sensor',
      endpointIndex,
    });
  }

  // Notification CC — may indicate contact or occupancy
  if (ccIds.has(CommandClass.Notification) && !ccIds.has(CommandClass.BinarySensor)) {
    const notificationDevices = mapNotifications(node, endpointIndex);
    devices.push(...notificationDevices);
  }

  return devices;
}

/** Check multilevel sensor values and create appropriate Matter sensors. */
function mapMultilevelSensors(node: ZWaveNode, endpointIndex: number): MappedDevice[] {
  const devices: MappedDevice[] = [];
  const sensorTypes = new Set<string>();

  for (const [, value] of Object.entries(node.values)) {
    if (value.commandClass !== CommandClass.MultilevelSensor) continue;
    if (value.endpoint !== endpointIndex) continue;

    const label = value.metadata?.label?.toLowerCase() ?? '';
    const property = String(value.property).toLowerCase();

    if ((label.includes('temperature') || property.includes('temperature')) && !sensorTypes.has('temperature')) {
      sensorTypes.add('temperature');
      devices.push({ deviceType: temperatureSensor, label: 'Temperature Sensor', endpointIndex });
    }
    if ((label.includes('humidity') || property.includes('humidity')) && !sensorTypes.has('humidity')) {
      sensorTypes.add('humidity');
      devices.push({ deviceType: humiditySensor, label: 'Humidity Sensor', endpointIndex });
    }
    if (
      (label.includes('illuminance') || label.includes('luminance') || property.includes('illuminance')) &&
      !sensorTypes.has('illuminance')
    ) {
      sensorTypes.add('illuminance');
      devices.push({ deviceType: lightSensor, label: 'Light Sensor', endpointIndex });
    }
  }

  // If we found no specific sensor values but the CC is present, default to temperature
  if (devices.length === 0) {
    devices.push({ deviceType: temperatureSensor, label: 'Sensor', endpointIndex });
  }

  return devices;
}

/** Classify a binary sensor as either contact or occupancy based on available metadata. */
function classifyBinarySensor(node: ZWaveNode, endpointIndex: number): 'contact' | 'occupancy' {
  for (const [, value] of Object.entries(node.values)) {
    if (value.commandClass !== CommandClass.BinarySensor) continue;
    if (value.endpoint !== endpointIndex) continue;

    const label = value.metadata?.label?.toLowerCase() ?? '';
    const property = String(value.property).toLowerCase();

    if (label.includes('motion') || property.includes('motion') || label.includes('occupancy')) {
      return 'occupancy';
    }
  }
  return 'contact';
}

/** Map Notification CC to contact/occupancy sensors. */
function mapNotifications(node: ZWaveNode, endpointIndex: number): MappedDevice[] {
  const devices: MappedDevice[] = [];
  const mapped = new Set<string>();

  for (const [, value] of Object.entries(node.values)) {
    if (value.commandClass !== CommandClass.Notification) continue;
    if (value.endpoint !== endpointIndex) continue;

    const notifType = value.metadata?.ccSpecific?.['notificationType'] as number | undefined;

    if (notifType === NotificationType.AccessControl && !mapped.has('access')) {
      mapped.add('access');
      devices.push({ deviceType: contactSensor, label: 'Door/Window Sensor', endpointIndex });
    }
    if (notifType === NotificationType.HomeSecurity && !mapped.has('security')) {
      mapped.add('security');
      devices.push({ deviceType: occupancySensor, label: 'Motion Sensor', endpointIndex });
    }
  }

  return devices;
}

/** Heuristic: determine if a binary switch node is likely an outlet/plug rather than a light. */
function isLikelyOutlet(node: ZWaveNode): boolean {
  const label = node.deviceConfig?.label?.toLowerCase() ?? '';
  const desc = node.deviceConfig?.description?.toLowerCase() ?? '';
  const combined = `${label} ${desc}`;
  return (
    combined.includes('outlet') ||
    combined.includes('plug') ||
    combined.includes('socket') ||
    combined.includes('power strip')
  );
}
