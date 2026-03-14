#!/usr/bin/env npx jiti
/**
 * Lists Z-Wave devices by connecting to the zwave-js-server WebSocket.
 *
 * Usage:
 *   npx jiti scripts/list-zwave-devices.ts [options]
 *
 * Options:
 *   --url <url>       WebSocket URL (default: ws://localhost:3000)
 *   --name <name>     Filter by device name (partial, case-insensitive)
 *   --node-id <id>    Filter by node ID
 */

import { ZWaveClient } from '../src/zwave/ZWaveClient.js';
interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

const silentLogger: Logger = {
  info() {},
  warn() {},
  error() {},
};

function parseArgs(args: string[]): { url: string; name?: string; nodeId?: number } {
  let url = process.env.ZWAVE_SERVER_URL ?? 'ws://localhost:3000';
  let name: string | undefined;
  let nodeId: number | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--url':
        url = args[++i];
        break;
      case '--name':
        name = args[++i];
        break;
      case '--node-id':
        nodeId = Number(args[++i]);
        if (isNaN(nodeId)) {
          console.error(`Invalid --node-id value: ${args[i]}`);
          process.exit(1);
        }
        break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  return { url, name, nodeId };
}

async function main() {
  const { url, name, nodeId } = parseArgs(process.argv.slice(2));

  const client = new ZWaveClient(url, silentLogger as never);

  try {
    await client.connect();
  } catch (err) {
    console.error(`Failed to connect to ${url}: ${(err as Error).message}`);
    process.exit(1);
  }

  let nodes = Array.from(client.nodes.values());

  if (nodeId !== undefined) {
    nodes = nodes.filter((n) => n.nodeId === nodeId);
  }

  if (name !== undefined) {
    const lowerName = name.toLowerCase();
    nodes = nodes.filter((n) => n.name?.toLowerCase().includes(lowerName));
  }

  nodes.sort((a, b) => a.nodeId - b.nodeId);

  console.log(JSON.stringify(nodes, null, 2));

  await client.disconnect();
}

main();
