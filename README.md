# matterbridge-zwavejs

[![npm version](https://img.shields.io/npm/v/matterbridge-zwavejs)](https://www.npmjs.com/package/matterbridge-zwavejs)
[![npm downloads](https://img.shields.io/npm/dm/matterbridge-zwavejs)](https://www.npmjs.com/package/matterbridge-zwavejs)
[![CI](https://github.com/andyalm/matterbridge-zwavejs/actions/workflows/ci.yml/badge.svg)](https://github.com/andyalm/matterbridge-zwavejs/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/andyalm/matterbridge-zwavejs)](https://github.com/andyalm/matterbridge-zwavejs/blob/main/LICENSE)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier)

A [Matterbridge](https://github.com/Luligu/matterbridge) plugin that exposes Z-Wave devices as Matter devices via [Z-Wave JS Server](https://github.com/zwave-js/zwave-js-server).

This allows Z-Wave devices to be controlled through Matter-compatible ecosystems (Apple Home, Google Home, Amazon Alexa) without requiring a full home automation platform.

## Features

- Automatically maps Z-Wave devices to Matter device types based on command classes
- Bidirectional state sync between Z-Wave and Matter
- Multi-endpoint device support (e.g., power strips with individually controllable outlets)
- Intelligent binary switch classification (light vs outlet vs switch) using device metadata
- Auto-reconnect with exponential backoff if the Z-Wave JS Server connection drops
- Node include/exclude filtering to control which devices are bridged
- Battery level reporting for battery-powered devices

## Prerequisites

- [Matterbridge](https://github.com/Luligu/matterbridge) installed and running
- A Z-Wave JS Server instance, typically via [Z-Wave JS UI](https://github.com/zwave-js/zwave-js-ui) or the [Home Assistant Z-Wave JS add-on](https://www.home-assistant.io/integrations/zwave_js/)
  - The WebSocket server runs on port 3000 by default

## Installation

### Matterbridge Frontend (recommended)

Open the Matterbridge web UI, go to the Plugins page, search for `matterbridge-zwavejs`, and click Install.

### CLI

```bash
matterbridge -add matterbridge-zwavejs
```

### From Source

See the [Development Guide](docs/development.md).

## Configuration

Configuration is set through the Matterbridge web UI plugin settings page.

| Setting | Default | Description |
|---------|---------|-------------|
| `serverUrl` | `ws://localhost:3000` | Z-Wave JS Server WebSocket URL |
| `includeNodes` | `[]` | Node IDs to include (empty = all) |
| `excludeNodes` | `[]` | Node IDs to exclude |

Example configuration:

```json
{
  "serverUrl": "ws://192.168.1.50:3000",
  "includeNodes": [],
  "excludeNodes": [3, 7]
}
```

## Supported Device Types

| Z-Wave Device | Matter Device Type |
|--------------|-------------------|
| Binary Switch (on/off switches, plugs) | On/Off Light, Outlet, or Switch |
| Multilevel Switch (dimmers) | Dimmable Light |
| Binary Sensor (door/window) | Contact Sensor |
| Binary Sensor (motion) | Occupancy Sensor |
| Multilevel Sensor (temperature) | Temperature Sensor |
| Multilevel Sensor (humidity) | Humidity Sensor |
| Multilevel Sensor (illuminance) | Light Sensor |
| Notification CC (access control) | Contact Sensor |
| Notification CC (home security) | Occupancy Sensor |
| Notification CC (water) | Water Leak Detector |
| Battery CC | PowerSource cluster (added to any battery device) |

Binary switches are automatically classified as a light, outlet, or switch based on the Z-Wave device class and device config metadata. Multi-sensor nodes (e.g., a device reporting temperature, humidity, and illuminance) are mapped to multiple Matter devices.

## How It Works

1. The plugin connects to your Z-Wave JS Server via WebSocket
2. On connection, it receives the full state of all Z-Wave nodes
3. Each node is analyzed and mapped to one or more Matter device types based on its command classes
4. Matter endpoints are created with the appropriate clusters and registered with Matterbridge
5. State changes flow bidirectionally:
   - **Z-Wave to Matter**: Value update events from Z-Wave JS are translated and pushed to Matter attributes
   - **Matter to Z-Wave**: Commands from Matter controllers (on/off, brightness, etc.) are translated and sent to Z-Wave devices

## Inspecting Your Z-Wave Devices

A utility script is included to list Z-Wave devices from your server, which is useful for finding node IDs for include/exclude filtering:

```bash
npx jiti scripts/list-zwave-devices.ts --url ws://192.168.1.50:3000
```

Options:
- `--url <url>` — WebSocket URL (default: `ws://localhost:3000`, or `ZWAVE_SERVER_URL` env var)
- `--name <name>` — Filter by device name (partial, case-insensitive)
- `--node-id <id>` — Filter by node ID

## Development

```bash
npm install
npm run dev:link   # One-time: link matterbridge for local development
npm run build
npm test
```

See the [Development Guide](docs/development.md) for full details on project setup, architecture, and contributing.

## Troubleshooting

See the [Troubleshooting Guide](docs/troubleshooting.md) for help with common issues like connection problems, missing devices, or incorrect device type classification.

## Known Limitations

- The Z-Wave controller node (typically node 1) is always skipped
- Only the command classes listed in [Supported Device Types](#supported-device-types) are mapped; others are silently ignored
- Nodes must have completed their Z-Wave interview (be in "ready" state) to be bridged
- Thermostats, door locks, and color lights are not yet supported

## License

MIT
