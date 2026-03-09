import type { PlatformConfig, PlatformMatterbridge } from 'matterbridge';
import type { AnsiLogger } from 'matterbridge/logger';
import { ZWaveJSPlatform } from './platform.js';

export default function initializePlugin(
  matterbridge: PlatformMatterbridge,
  log: AnsiLogger,
  config: PlatformConfig,
): ZWaveJSPlatform {
  return new ZWaveJSPlatform(matterbridge, log, config);
}
