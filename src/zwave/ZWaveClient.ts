import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { AnsiLogger } from 'matterbridge/logger';
import type {
  ZWaveNode,
  ZWaveValueId,
  ZWaveServerIncomingMessage,
  ZWaveServerVersionMessage,
  ZWaveServerResultMessage,
  ZWaveServerEventMessage,
  StartListeningResult,
  ValueUpdatedArgs,
} from './types.js';

export interface ZWaveClientEvents {
  connected: [];
  disconnected: [];
  nodeReady: [node: ZWaveNode];
  nodeRemoved: [nodeId: number];
  valueUpdated: [nodeId: number, args: ValueUpdatedArgs];
  allNodesReady: [nodes: Map<number, ZWaveNode>];
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ZWaveClient {
  on<K extends keyof ZWaveClientEvents>(event: K, listener: (...args: ZWaveClientEvents[K]) => void): this;
  off<K extends keyof ZWaveClientEvents>(event: K, listener: (...args: ZWaveClientEvents[K]) => void): this;
  emit<K extends keyof ZWaveClientEvents>(event: K, ...args: ZWaveClientEvents[K]): boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ZWaveClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pendingRequests = new Map<string, { resolve: (value: unknown) => void; reject: (err: Error) => void }>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectDelay = 60_000;
  private shutdownRequested = false;

  readonly nodes = new Map<number, ZWaveNode>();

  constructor(
    private readonly serverUrl: string,
    private readonly log: AnsiLogger,
  ) {
    super();
  }

  async connect(): Promise<void> {
    this.shutdownRequested = false;
    return new Promise((resolve, reject) => {
      this.log.info(`Connecting to zwave-js-server at ${this.serverUrl}`);
      this.ws = new WebSocket(this.serverUrl);

      let resolved = false;

      this.ws.on('open', () => {
        this.log.info('WebSocket connection established');
        this.reconnectAttempts = 0;
      });

      this.ws.on('message', (data: WebSocket.RawData) => {
        const msg = JSON.parse(data.toString()) as ZWaveServerIncomingMessage;
        this.handleMessage(msg);

        // Resolve after we get the version message (first message from server)
        if (!resolved && msg.type === 'version') {
          resolved = true;
          this.startListening()
            .then(() => {
              this.emit('connected');
              resolve();
            })
            .catch(reject);
        }
      });

      this.ws.on('close', () => {
        this.log.warn('WebSocket connection closed');
        this.emit('disconnected');
        this.scheduleReconnect();
      });

      this.ws.on('error', (err: Error) => {
        this.log.error(`WebSocket error: ${err.message}`);
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    this.shutdownRequested = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error('Client disconnecting'));
    }
    this.pendingRequests.clear();
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  /** Send a set_value command to a Z-Wave node. */
  async setValue(nodeId: number, valueId: ZWaveValueId, value: unknown): Promise<void> {
    await this.sendCommand('node.set_value', {
      nodeId,
      valueId: {
        commandClass: valueId.commandClass,
        endpoint: valueId.endpoint,
        property: valueId.property,
        propertyKey: valueId.propertyKey,
      },
      value,
    });
  }

  private async startListening(): Promise<void> {
    const result = (await this.sendCommand('start_listening')) as StartListeningResult;
    const nodes = result.state.nodes;
    this.log.info(`Received state with ${nodes.length} node(s)`);
    for (const node of nodes) {
      this.nodes.set(node.nodeId, node);
    }
    this.emit('allNodesReady', this.nodes);
  }

  private sendCommand(command: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const id = String(++this.messageId);
      const message = { messageId: id, command, ...params };

      this.pendingRequests.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(message));
    });
  }

  private handleMessage(msg: ZWaveServerIncomingMessage): void {
    switch (msg.type) {
      case 'version':
        this.handleVersion(msg as ZWaveServerVersionMessage);
        break;
      case 'result':
        this.handleResult(msg as ZWaveServerResultMessage);
        break;
      case 'event':
        this.handleEvent(msg as ZWaveServerEventMessage);
        break;
    }
  }

  private handleVersion(msg: ZWaveServerVersionMessage): void {
    this.log.info(`Z-Wave JS Server v${msg.serverVersion}, Driver v${msg.driverVersion}`);
  }

  private handleResult(msg: ZWaveServerResultMessage): void {
    const pending = this.pendingRequests.get(msg.messageId);
    if (!pending) return;
    this.pendingRequests.delete(msg.messageId);

    if (msg.success) {
      pending.resolve(msg.result);
    } else {
      pending.reject(new Error(`Command failed: ${msg.errorCode}`));
    }
  }

  private handleEvent(msg: ZWaveServerEventMessage): void {
    const event = msg.event;

    if (event.source === 'node' && event.event === 'value updated' && event.nodeId !== undefined) {
      const args = event.args as unknown as ValueUpdatedArgs;
      this.updateNodeValue(event.nodeId, args);
      this.emit('valueUpdated', event.nodeId, args);
    } else if (event.source === 'node' && event.event === 'node removed' && event.nodeId !== undefined) {
      this.nodes.delete(event.nodeId);
      this.emit('nodeRemoved', event.nodeId);
    } else if (event.source === 'node' && event.event === 'ready' && event.nodeId !== undefined) {
      const node = this.nodes.get(event.nodeId);
      if (node) {
        node.ready = true;
        this.emit('nodeReady', node);
      }
    }
  }

  private updateNodeValue(nodeId: number, args: ValueUpdatedArgs): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    const key = this.valueIdToKey(args);
    const existing = node.values[key];
    if (existing) {
      existing.value = args.newValue;
    } else {
      node.values[key] = {
        commandClass: args.commandClass,
        endpoint: args.endpoint,
        property: args.property,
        propertyKey: args.propertyKey,
        value: args.newValue,
      };
    }
  }

  private valueIdToKey(valueId: {
    commandClass: number;
    endpoint: number;
    property: string | number;
    propertyKey?: string | number;
  }): string {
    const parts = [valueId.commandClass, valueId.endpoint, valueId.property];
    if (valueId.propertyKey !== undefined) {
      parts.push(valueId.propertyKey);
    }
    return parts.join('-');
  }

  private scheduleReconnect(): void {
    if (this.shutdownRequested) return;
    if (this.reconnectTimer) return;

    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, this.maxReconnectDelay);
    this.reconnectAttempts++;
    this.log.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err) => {
        this.log.error(`Reconnect failed: ${(err as Error).message}`);
      });
    }, delay);
  }
}
