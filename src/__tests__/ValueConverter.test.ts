import { describe, it, expect } from 'vitest';
import {
  zwaveLevelToMatter,
  matterLevelToZwave,
  zwaveTemperatureToMatter,
  zwaveHumidityToMatter,
  zwaveIlluminanceToMatter,
} from '../mapper/ValueConverter.js';

describe('Z-Wave to Matter level conversion', () => {
  it('treats Z-Wave off (0) as Matter minimum brightness', () => {
    expect(zwaveLevelToMatter(0)).toBe(1);
  });

  it('treats Z-Wave full brightness (99) as Matter maximum (254)', () => {
    expect(zwaveLevelToMatter(99)).toBe(254);
  });

  it('scales mid-range values proportionally', () => {
    const result = zwaveLevelToMatter(50);
    expect(result).toBeGreaterThan(125);
    expect(result).toBeLessThan(130);
  });

  it('clamps negative values to Matter minimum brightness', () => {
    expect(zwaveLevelToMatter(-1)).toBe(1);
  });

  it('clamps values above 99 to Matter maximum', () => {
    expect(zwaveLevelToMatter(100)).toBe(254);
  });
});

describe('Matter to Z-Wave level conversion', () => {
  it('treats Matter 0 as Z-Wave off', () => {
    expect(matterLevelToZwave(0)).toBe(0);
  });

  it('treats Matter maximum (254) as Z-Wave full brightness (99)', () => {
    expect(matterLevelToZwave(254)).toBe(99);
  });

  it('round-trips a mid-range value back to approximately the same level', () => {
    const zwave = 50;
    const matter = zwaveLevelToMatter(zwave);
    const back = matterLevelToZwave(matter);
    expect(back).toBeGreaterThanOrEqual(49);
    expect(back).toBeLessThanOrEqual(51);
  });
});

describe('Z-Wave to Matter temperature conversion', () => {
  it('converts Celsius to centi-Celsius (22°C becomes 2200)', () => {
    expect(zwaveTemperatureToMatter(22)).toBe(2200);
  });

  it('represents freezing point as zero', () => {
    expect(zwaveTemperatureToMatter(0)).toBe(0);
  });

  it('handles sub-zero temperatures', () => {
    expect(zwaveTemperatureToMatter(-10)).toBe(-1000);
  });

  it('converts Fahrenheit readings to centi-Celsius', () => {
    // 72°F ≈ 22.22°C → 2222
    const result = zwaveTemperatureToMatter(72, '°F');
    expect(result).toBeGreaterThan(2200);
    expect(result).toBeLessThan(2250);
  });
});

describe('Z-Wave to Matter humidity conversion', () => {
  it('scales percentage to centi-percent (50% becomes 5000)', () => {
    expect(zwaveHumidityToMatter(50)).toBe(5000);
  });

  it('represents 0% as zero', () => {
    expect(zwaveHumidityToMatter(0)).toBe(0);
  });

  it('represents 100% as 10000', () => {
    expect(zwaveHumidityToMatter(100)).toBe(10000);
  });
});

describe('Z-Wave to Matter illuminance conversion', () => {
  it('represents total darkness as zero', () => {
    expect(zwaveIlluminanceToMatter(0)).toBe(0);
  });

  it('represents 1 lux as 1', () => {
    expect(zwaveIlluminanceToMatter(1)).toBe(1);
  });

  it('uses logarithmic scaling (10 lux becomes 10001)', () => {
    expect(zwaveIlluminanceToMatter(10)).toBe(10001);
  });

  it('scales bright daylight correctly (10000 lux becomes 40001)', () => {
    expect(zwaveIlluminanceToMatter(10000)).toBe(40001);
  });
});
