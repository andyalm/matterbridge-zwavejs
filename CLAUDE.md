# Matterbridge Plugin Development Rules

## Matterbridge Dependency — CRITICAL

**NEVER** put `matterbridge` in `dependencies`, `devDependencies`, or `peerDependencies` in package.json. The PluginManager checks all three and will reject the plugin if found in any of them.

For local development, use `npm link matterbridge` (or `npm run dev:link`) to create a symlink so TypeScript can resolve matterbridge types.

**Important:** The PluginManager only checks `package.json` fields — it does NOT inspect `node_modules/`. Having a `matterbridge` symlink in `node_modules/` (from `npm link`) is fine and required for ESM import resolution at runtime.

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

## Before Committing — ALWAYS

Run these commands before every commit to ensure code is formatted and lint-clean:

```bash
npm run format      # Auto-format with Prettier
npm run lint:fix    # Auto-fix ESLint issues
```

## Build & Test (Local Development)

```bash
npm run dev:link   # Link matterbridge for local development (one-time)
npm run build      # TypeScript compilation
npm test           # Run vitest tests
```

## Docker Deployment (Volume Mount)

**Always build on the host machine**, not inside the Docker container. The container's global matterbridge lacks TypeScript declaration files, so `tsc` will fail there.

```bash
# On host machine:
npm run build                    # Compile TypeScript

# Inside Docker container (one-time setup):
npm install --omit=dev           # Install runtime deps (ws)
npm link matterbridge            # Symlink for ESM import resolution at runtime
# Do NOT delete node_modules/matterbridge — the plugin needs it to resolve imports
```

Volume mount the plugin directory. The pre-built `dist/` files, `node_modules/ws`, and `node_modules/matterbridge` (symlink) must all be present.
