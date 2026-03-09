import { CommandClass } from '../zwave/types.js';

/**
 * Convert a Z-Wave multilevel switch value (0-99) to a Matter LevelControl currentLevel (0-254).
 * Z-Wave uses 0=off, 1-99=on levels, 99=full.
 * Matter uses 0-254 range.
 */
export function zwaveLevelToMatter(zwaveLevel: number): number {
  if (zwaveLevel <= 0) return 1; // Matter minLevel is 1, not 0
  if (zwaveLevel >= 99) return 254;
  return Math.max(1, Math.round((zwaveLevel / 99) * 254));
}

/**
 * Convert a Matter LevelControl currentLevel (0-254) to a Z-Wave multilevel switch value (0-99).
 */
export function matterLevelToZwave(matterLevel: number): number {
  if (matterLevel <= 0) return 0;
  if (matterLevel >= 254) return 99;
  return Math.round((matterLevel / 254) * 99);
}

/**
 * Convert a Z-Wave temperature value to a Matter temperature value.
 * Matter temperatures are in 0.01°C units (integer).
 * Z-Wave can report in °C or °F.
 */
export function zwaveTemperatureToMatter(value: number, unit?: string): number {
  let celsius = value;
  if (unit === '°F' || unit === 'F') {
    celsius = (value - 32) * (5 / 9);
  }
  return Math.round(celsius * 100);
}

/**
 * Convert a Z-Wave humidity value (0-100%) to a Matter humidity value.
 * Matter humidity is in 0.01% units (integer).
 */
export function zwaveHumidityToMatter(value: number): number {
  return Math.round(value * 100);
}

/**
 * Convert a Z-Wave illuminance value (lux) to a Matter illuminance value.
 * Matter illuminance is 10000 * log10(lux) + 1, or 0 for 0 lux.
 */
export function zwaveIlluminanceToMatter(lux: number): number {
  if (lux <= 0) return 0;
  return Math.round(10000 * Math.log10(lux) + 1);
}

/**
 * Get the Z-Wave value ID property name for a given command class.
 * Returns the property name used to read/write the primary value.
 */
export function getPrimaryProperty(commandClass: number): string {
  switch (commandClass) {
    case CommandClass.BinarySwitch:
      return 'targetValue';
    case CommandClass.MultilevelSwitch:
      return 'targetValue';
    case CommandClass.BinarySensor:
      return 'Any';
    case CommandClass.Battery:
      return 'level';
    case CommandClass.DoorLock:
      return 'targetMode';
    default:
      return 'value';
  }
}

/**
 * Get the Z-Wave value ID property name for reading the current state.
 */
export function getCurrentValueProperty(commandClass: number): string {
  switch (commandClass) {
    case CommandClass.BinarySwitch:
      return 'currentValue';
    case CommandClass.MultilevelSwitch:
      return 'currentValue';
    case CommandClass.BinarySensor:
      return 'Any';
    case CommandClass.Battery:
      return 'level';
    case CommandClass.DoorLock:
      return 'currentMode';
    default:
      return 'value';
  }
}
