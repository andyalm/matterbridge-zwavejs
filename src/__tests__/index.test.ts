import { describe, it, expect, vi } from 'vitest';

vi.mock('matterbridge', () => import('./helpers/matterbridgeMock.js'));
vi.mock('matterbridge/logger', () => ({}));

import initializePlugin from '../index.js';
import { ZWaveJSPlatform } from '../platform.js';

describe('initializePlugin', () => {
  it('is a function (not a class constructor)', () => {
    expect(typeof initializePlugin).toBe('function');
  });

  it('returns a ZWaveJSPlatform instance', () => {
    const matterbridge = {};
    const log = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      notice: vi.fn(),
      fatal: vi.fn(),
      log: vi.fn(),
    };
    const config = {};

    const result = initializePlugin(matterbridge as never, log as never, config as never);
    expect(result).toBeInstanceOf(ZWaveJSPlatform);
  });
});
