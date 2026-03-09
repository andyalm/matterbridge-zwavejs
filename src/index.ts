import type { PlatformConfig, PlatformMatterbridge } from 'matterbridge';
import type { AnsiLogger } from 'matterbridge/logger';
import { ZWaveJSPlatform } from './platform.js';

export default function initializePlugin(
  matterbridge: PlatformMatterbridge,
  log: AnsiLogger,
  config: PlatformConfig,
): ZWaveJSPlatform {
  try {
    return new ZWaveJSPlatform(matterbridge, log, config);
  } catch (error) {
    console.error('[matterbridge-zwavejs] Failed to initialize plugin:', error);
    throw error;
  }
}
