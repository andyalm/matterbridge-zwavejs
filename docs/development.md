# Development Guide

## Prerequisites

- Node.js >= 18
- [Matterbridge](https://github.com/Luligu/matterbridge) installed globally (`npm install -g matterbridge`)

## Setup

```bash
git clone https://github.com/andyalm/matterbridge-zwavejs.git
cd matterbridge-zwavejs
npm install
npm run dev:link   # Creates a symlink so TypeScript can resolve matterbridge types
```

### Why isn't matterbridge in package.json?

Matterbridge's PluginManager rejects any plugin that lists `matterbridge` in `dependencies`, `devDependencies`, or `peerDependencies`. Instead, we use `npm link matterbridge` to create a symlink in `node_modules/` for type resolution during development. The PluginManager only checks `package.json` fields — it does not inspect `node_modules/`.

## Build and Test

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run watch` | Compile in watch mode |
| `npm test` | Run tests (vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Check for lint errors |
| `npm run lint:fix` | Auto-fix lint errors |
| `npm run format` | Auto-format with Prettier |
| `npm run format:check` | Check formatting without modifying |

## Architecture

```
src/
├── index.ts                  # Entry point — exports factory function
├── platform.ts               # ZWaveJSPlatform — manages device lifecycle
├── zwave/
│   ├── ZWaveClient.ts        # WebSocket client for zwave-js-server
│   └── types.ts              # TypeScript type definitions
├── mapper/
│   ├── DeviceMapper.ts       # Maps Z-Wave nodes to Matter device types
│   └── ValueConverter.ts     # Unit/value conversions (temp, brightness, etc.)
├── handlers/
│   ├── DeviceHandler.ts      # Handler interface
│   ├── BaseHandler.ts        # Abstract base with shared utilities
│   ├── BinarySwitchHandler.ts
│   ├── DimmableLightHandler.ts
│   ├── ContactSensorHandler.ts
│   ├── OccupancySensorHandler.ts
│   ├── TemperatureSensorHandler.ts
│   ├── HumiditySensorHandler.ts
│   ├── LightSensorHandler.ts
│   ├── WaterLeakHandler.ts
│   └── handlerRegistry.ts   # Factory registry mapping device types to handlers
└── __tests__/                # Unit tests
```

**Key flow:**

1. `index.ts` exports a factory function that Matterbridge calls to instantiate the plugin
2. `ZWaveJSPlatform` connects to the Z-Wave JS Server via `ZWaveClient`
3. When nodes are received, `DeviceMapper` analyzes their command classes and creates mappings to Matter device types
4. For each mapping, the appropriate handler from `handlers/` creates Matter clusters and manages bidirectional state

## Before Committing

Always run these before committing:

```bash
npm run format
npm run lint:fix
```

## CI/CD

- **CI** runs on every push and PR, testing against Node.js 20 and 22. It checks formatting, lint, build, and tests.
- **Publishing** is automated — creating a GitHub Release triggers `npm publish` with provenance.
