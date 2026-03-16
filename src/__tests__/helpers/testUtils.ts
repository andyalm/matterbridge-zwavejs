import { vi } from 'vitest';
import type { AnsiLogger } from 'matterbridge/logger';
import type { ZWaveNode, ZWaveEndpoint, ZWaveValue } from '../../zwave/types.js';

// ── Mock Matterbridge endpoint ──────────────────────────────────────────────

export interface MockEndpoint {
  createDefaultOnOffClusterServer: ReturnType<typeof vi.fn>;
  createDefaultLevelControlClusterServer: ReturnType<typeof vi.fn>;
  createDefaultTemperatureMeasurementClusterServer: ReturnType<typeof vi.fn>;
  createDefaultRelativeHumidityMeasurementClusterServer: ReturnType<typeof vi.fn>;
  createDefaultIlluminanceMeasurementClusterServer: ReturnType<typeof vi.fn>;
  createDefaultBooleanStateClusterServer: ReturnType<typeof vi.fn>;
  createDefaultOccupancySensingClusterServer: ReturnType<typeof vi.fn>;
  createDefaultBridgedDeviceBasicInformationClusterServer: ReturnType<typeof vi.fn>;
  createDefaultPowerSourceBatteryClusterServer: ReturnType<typeof vi.fn>;
  addCommandHandler: ReturnType<typeof vi.fn>;
  setAttribute: ReturnType<typeof vi.fn>;
  getAttribute: ReturnType<typeof vi.fn>;
  /** Retrieve a registered command handler by name. */
  getCommandHandler(name: string): ((...args: unknown[]) => Promise<void>) | undefined;
  /** All attributes set via setAttribute, keyed by "cluster.attribute". */
  attributes: Record<string, unknown>;
  /** All command handlers registered via addCommandHandler, keyed by command name. */
  commandHandlers: Record<string, (...args: unknown[]) => Promise<void>>;
}

export function makeMockEndpoint(): MockEndpoint {
  const attributes: Record<string, unknown> = {};
  const commandHandlers: Record<string, (...args: unknown[]) => Promise<void>> = {};

  const endpoint: MockEndpoint = {
    createDefaultOnOffClusterServer: vi.fn(),
    createDefaultLevelControlClusterServer: vi.fn(),
    createDefaultTemperatureMeasurementClusterServer: vi.fn(),
    createDefaultRelativeHumidityMeasurementClusterServer: vi.fn(),
    createDefaultIlluminanceMeasurementClusterServer: vi.fn(),
    createDefaultBooleanStateClusterServer: vi.fn(),
    createDefaultOccupancySensingClusterServer: vi.fn(),
    createDefaultBridgedDeviceBasicInformationClusterServer: vi.fn(),
    createDefaultPowerSourceBatteryClusterServer: vi.fn(),
    addCommandHandler: vi.fn((name: string, handler: (...args: unknown[]) => Promise<void>) => {
      commandHandlers[name] = handler;
    }),
    setAttribute: vi.fn((cluster: string, attribute: string, value: unknown) => {
      attributes[`${cluster}.${attribute}`] = value;
    }),
    getAttribute: vi.fn((cluster: string, attribute: string) => {
      return attributes[`${cluster}.${attribute}`];
    }),
    getCommandHandler(name: string) {
      return commandHandlers[name];
    },
    attributes,
    commandHandlers,
  };

  return endpoint;
}

// ── Mock ZWaveClient ────────────────────────────────────────────────────────

export interface MockClient {
  setValue: ReturnType<typeof vi.fn>;
}

export function makeMockClient(): MockClient {
  return {
    setValue: vi.fn().mockResolvedValue(undefined),
  };
}

// ── Mock Logger ─────────────────────────────────────────────────────────────

export function makeLogger(): AnsiLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    notice: vi.fn(),
    fatal: vi.fn(),
    log: vi.fn(),
  } as unknown as AnsiLogger;
}

// ── Z-Wave node/endpoint builders ───────────────────────────────────────────

export function makeNode(overrides: Partial<ZWaveNode> = {}): ZWaveNode {
  return {
    nodeId: 2,
    status: 4,
    ready: true,
    endpoints: [],
    values: {},
    ...overrides,
  };
}

export function makeEndpoint(ccIds: number[], index = 0): ZWaveEndpoint {
  return {
    nodeId: 2,
    index,
    commandClasses: ccIds.map((id) => ({ id, name: `CC_${id}`, version: 1, isSecure: false })),
  };
}

/**
 * Build a Z-Wave values record from an array of partial value objects.
 * Generates sensible keys automatically.
 */
export function makeValues(...values: Partial<ZWaveValue>[]): Record<string, ZWaveValue> {
  const result: Record<string, ZWaveValue> = {};
  for (const v of values) {
    const val: ZWaveValue = {
      commandClass: v.commandClass ?? 0,
      endpoint: v.endpoint ?? 0,
      property: v.property ?? 'value',
      propertyKey: v.propertyKey,
      value: v.value,
      metadata: v.metadata,
    };
    const key = `${val.commandClass}-${val.endpoint}-${val.property}`;
    result[key] = val;
  }
  return result;
}
