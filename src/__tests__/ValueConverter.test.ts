import { describe, it, expect } from 'vitest';
import {
  zwaveLevelToMatter,
  matterLevelToZwave,
  zwaveTemperatureToMatter,
  zwaveHumidityToMatter,
  zwaveIlluminanceToMatter,
} from '../mapper/ValueConverter.js';

describe('zwaveLevelToMatter', () => {
  it('converts 0 to 1 (Matter minLevel)', () => {
    expect(zwaveLevelToMatter(0)).toBe(1);
  });

  it('converts 99 to 254', () => {
    expect(zwaveLevelToMatter(99)).toBe(254);
  });

  it('converts 50 to ~128', () => {
    const result = zwaveLevelToMatter(50);
    expect(result).toBeGreaterThan(125);
    expect(result).toBeLessThan(130);
  });

  it('clamps negative values to 1 (Matter minLevel)', () => {
    expect(zwaveLevelToMatter(-1)).toBe(1);
  });

  it('clamps values above 99 to 254', () => {
    expect(zwaveLevelToMatter(100)).toBe(254);
  });
});

describe('matterLevelToZwave', () => {
  it('converts 0 to 0', () => {
    expect(matterLevelToZwave(0)).toBe(0);
  });

  it('converts 254 to 99', () => {
    expect(matterLevelToZwave(254)).toBe(99);
  });

  it('round-trips mid values approximately', () => {
    const zwave = 50;
    const matter = zwaveLevelToMatter(zwave);
    const back = matterLevelToZwave(matter);
    expect(back).toBeGreaterThanOrEqual(49);
    expect(back).toBeLessThanOrEqual(51);
  });
});

describe('zwaveTemperatureToMatter', () => {
  it('converts 22°C to 2200', () => {
    expect(zwaveTemperatureToMatter(22)).toBe(2200);
  });

  it('converts 0°C to 0', () => {
    expect(zwaveTemperatureToMatter(0)).toBe(0);
  });

  it('converts negative Celsius', () => {
    expect(zwaveTemperatureToMatter(-10)).toBe(-1000);
  });

  it('converts Fahrenheit to Celsius-based matter value', () => {
    // 72°F = 22.22°C → 2222
    const result = zwaveTemperatureToMatter(72, '°F');
    expect(result).toBeGreaterThan(2200);
    expect(result).toBeLessThan(2250);
  });
});

describe('zwaveHumidityToMatter', () => {
  it('converts 50% to 5000', () => {
    expect(zwaveHumidityToMatter(50)).toBe(5000);
  });

  it('converts 0% to 0', () => {
    expect(zwaveHumidityToMatter(0)).toBe(0);
  });

  it('converts 100% to 10000', () => {
    expect(zwaveHumidityToMatter(100)).toBe(10000);
  });
});

describe('zwaveIlluminanceToMatter', () => {
  it('converts 0 lux to 0', () => {
    expect(zwaveIlluminanceToMatter(0)).toBe(0);
  });

  it('converts 1 lux to 1', () => {
    expect(zwaveIlluminanceToMatter(1)).toBe(1);
  });

  it('converts 10 lux to ~10001', () => {
    expect(zwaveIlluminanceToMatter(10)).toBe(10001);
  });

  it('converts 10000 lux to ~40001', () => {
    expect(zwaveIlluminanceToMatter(10000)).toBe(40001);
  });
});
