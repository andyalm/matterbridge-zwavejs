# matterbridge-zwavejs

A [Matterbridge](https://github.com/Luligu/matterbridge) plugin that exposes Z-Wave devices as Matter devices via [Z-Wave JS Server](https://github.com/zwave-js/zwave-js-server).

This allows Z-Wave devices to be controlled through Matter-compatible ecosystems (Apple Home, Google Home, Amazon Alexa) without requiring a full home automation platform.

## Prerequisites

- [Matterbridge](https://github.com/Luligu/matterbridge) installed and running
- A Z-Wave JS Server instance (typically via [Z-Wave JS UI](https://github.com/zwave-js/zwave-js-ui) or [Home Assistant Z-Wave JS add-on](https://www.home-assistant.io/integrations/zwave_js/))

## Installation

```bash
matterbridge -add matterbridge-zwavejs
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `serverUrl` | `ws://localhost:3000` | Z-Wave JS Server WebSocket URL |
| `includeNodes` | `[]` | Node IDs to include (empty = all) |
| `excludeNodes` | `[]` | Node IDs to exclude |
| `debug` | `false` | Enable verbose logging |

## Supported Device Types

| Z-Wave Device | Matter Device Type |
|--------------|-------------------|
| Binary Switch (on/off switches, plugs) | On/Off Light or Outlet |
| Multilevel Switch (dimmers) | Dimmable Light |
| Binary Sensor (door/window) | Contact Sensor |
| Binary Sensor (motion) | Occupancy Sensor |
| Multilevel Sensor (temperature) | Temperature Sensor |
| Multilevel Sensor (humidity) | Humidity Sensor |
| Multilevel Sensor (illuminance) | Light Sensor |
| Notification CC (access control) | Contact Sensor |
| Notification CC (home security) | Occupancy Sensor |
| Battery CC | PowerSource cluster (added to any battery device) |

## How It Works

1. The plugin connects to your Z-Wave JS Server via WebSocket
2. On connection, it receives the full state of all Z-Wave nodes
3. Each node is analyzed and mapped to one or more Matter device types based on its command classes
4. Matter endpoints are created with the appropriate clusters and registered with Matterbridge
5. State changes flow bidirectionally:
   - **Z-Wave to Matter**: Value update events from Z-Wave JS are translated and pushed to Matter attributes
   - **Matter to Z-Wave**: Commands from Matter controllers (on/off, brightness, etc.) are translated and sent to Z-Wave devices

## Development

```bash
npm install
npm run build
npm run test
npm run lint
npm run format
```

## License

MIT
