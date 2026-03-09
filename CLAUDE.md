# Matterbridge Plugin Development Rules

## Matterbridge Dependency — CRITICAL

**NEVER** put `matterbridge` in `dependencies`, `devDependencies`, or `peerDependencies` in package.json. The PluginManager checks all three and will reject the plugin if found in any of them.

For local development, use `npm link matterbridge` (or `npm run dev:link`) to create a symlink so TypeScript can resolve matterbridge types. This symlink is NOT committed or deployed — in production, matterbridge provides itself to the plugin at runtime.

## Plugin Entry Point

The default export must be a **factory function**, not a class. Matterbridge calls it as:

```ts
pluginInstance.default(matterbridge, log, config)
```

It does NOT use `new`. The factory function should return an instance of `MatterbridgeDynamicPlatform` or `MatterbridgeAccessoryPlatform`.

```ts
// src/index.ts
export default function initializePlugin(matterbridge, log, config) {
  return new ZWaveJSPlatform(matterbridge, log, config);
}
```

## Config Schema

The plugin config schema file must be named `matterbridge-zwavejs.schema.json` in the project root. This defines the fields shown in the matterbridge UI plugin settings page.

## Z-Wave JS UI

- WebSocket server (zwave-js-server) runs on port **3000**
- Web UI runs on port 8091 (not used by this plugin)

## Build & Test

```bash
npm run dev:link   # Link matterbridge for local development
npm run build      # TypeScript compilation
npm test           # Run vitest tests
```
