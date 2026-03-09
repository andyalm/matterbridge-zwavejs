/** Z-Wave command class IDs relevant to this plugin. */
export enum CommandClass {
  BinarySwitch = 0x25,
  MultilevelSwitch = 0x26,
  BinarySensor = 0x30,
  MultilevelSensor = 0x31,
  Meter = 0x32,
  ThermostatMode = 0x40,
  ThermostatSetpoint = 0x43,
  DoorLock = 0x62,
  Notification = 0x71,
  Battery = 0x80,
}

/** Identifies a specific value on a Z-Wave node. */
export interface ZWaveValueId {
  commandClass: number;
  endpoint: number;
  property: string | number;
  propertyKey?: string | number;
}

/** A value reported by the Z-Wave JS server, with metadata. */
export interface ZWaveValue extends ZWaveValueId {
  value?: unknown;
  metadata?: ZWaveValueMetadata;
}

export interface ZWaveValueMetadata {
  type: string;
  readable: boolean;
  writeable: boolean;
  label?: string;
  description?: string;
  min?: number;
  max?: number;
  unit?: string;
  states?: Record<number, string>;
  ccSpecific?: Record<string, unknown>;
}

/** A Z-Wave node endpoint (sub-device). */
export interface ZWaveEndpoint {
  nodeId: number;
  index: number;
  installerIcon?: number;
  userIcon?: number;
  commandClasses: ZWaveEndpointCommandClass[];
}

export interface ZWaveEndpointCommandClass {
  id: number;
  name: string;
  version: number;
  isSecure: boolean;
}

/** A Z-Wave node as reported by zwave-js-server. */
export interface ZWaveNode {
  nodeId: number;
  name?: string;
  location?: string;
  status: number;
  ready: boolean;
  interviewStage?: string;
  endpoints: ZWaveEndpoint[];
  values: Record<string, ZWaveValue>;
  deviceClass?: {
    basic: { key: number; label: string };
    generic: { key: number; label: string };
    specific: { key: number; label: string };
  };
  firmwareVersion?: string;
  manufacturerId?: number;
  productId?: number;
  productType?: number;
  deviceConfig?: {
    manufacturer?: string;
    label?: string;
    description?: string;
  };
}

/** Notification types from Z-Wave Notification CC. */
export enum NotificationType {
  Smoke = 0x01,
  CO = 0x02,
  CO2 = 0x03,
  Heat = 0x04,
  Water = 0x05,
  AccessControl = 0x06,
  HomeSecurity = 0x07,
  PowerManagement = 0x08,
  System = 0x09,
  Emergency = 0x0a,
  Clock = 0x0b,
  Appliance = 0x0c,
  HomeHealth = 0x0d,
  Siren = 0x0e,
  WaterValve = 0x0f,
  WeatherAlarm = 0x10,
  Irrigation = 0x11,
  GasAlarm = 0x12,
  PestControl = 0x13,
  LightSensor = 0x14,
  WaterQuality = 0x15,
  HomeMonitoring = 0x16,
}

// -- WebSocket message types --

/** Message sent to zwave-js-server. */
export interface ZWaveServerOutgoingMessage {
  messageId: string;
  command: string;
  [key: string]: unknown;
}

/** Top-level message received from zwave-js-server. */
export interface ZWaveServerIncomingMessage {
  type: 'version' | 'result' | 'event';
  messageId?: string;
  [key: string]: unknown;
}

export interface ZWaveServerVersionMessage extends ZWaveServerIncomingMessage {
  type: 'version';
  driverVersion: string;
  serverVersion: string;
  homeId: number;
}

export interface ZWaveServerResultMessage extends ZWaveServerIncomingMessage {
  type: 'result';
  messageId: string;
  success: boolean;
  result?: Record<string, unknown>;
  errorCode?: string;
}

export interface ZWaveServerEventMessage extends ZWaveServerIncomingMessage {
  type: 'event';
  event: ZWaveServerEvent;
}

export interface ZWaveServerEvent {
  source: 'node' | 'controller' | 'driver';
  event: string;
  nodeId?: number;
  args?: Record<string, unknown>;
}

/** The result of the start_listening command. */
export interface StartListeningResult {
  state: {
    controller: {
      homeId: number;
      ownNodeId: number;
    };
    nodes: ZWaveNode[];
  };
}

/** Value updated event args. */
export interface ValueUpdatedArgs {
  commandClass: number;
  commandClassName: string;
  endpoint: number;
  property: string | number;
  propertyKey?: string | number;
  propertyName?: string;
  newValue: unknown;
  prevValue: unknown;
}
