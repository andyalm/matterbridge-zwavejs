import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('matterbridge', () => import('../helpers/matterbridgeMock.js'));
vi.mock('matterbridge/logger', () => ({}));

import { onOffSwitch, dimmableLight } from 'matterbridge';
import { CommandClass } from '../../zwave/types.js';
import { createHandler } from '../../handlers/handlerRegistry.js';
import {
  makeMockEndpoint,
  makeMockClient,
  makeLogger,
  makeNode,
  makeEndpoint,
  makeValues,
  type MockEndpoint,
  type MockClient,
} from '../helpers/testUtils.js';
import type { AnsiLogger } from 'matterbridge/logger';

describe('binary switch devices', () => {
  let endpoint: MockEndpoint;
  let client: MockClient;
  let log: AnsiLogger;

  function createSwitch(currentValue = true) {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.BinarySwitch])],
      values: makeValues({
        commandClass: CommandClass.BinarySwitch,
        property: 'currentValue',
        value: currentValue,
      }),
    });

    const handler = createHandler(onOffSwitch, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
      client: client as never,
    });
    handler.addClusters(endpoint as never);
    handler.setup();
    return handler;
  }

  beforeEach(() => {
    endpoint = makeMockEndpoint();
    client = makeMockClient();
    log = makeLogger();
  });

  describe('when first discovered', () => {
    it('reports the current on/off state to Matter', () => {
      createSwitch(true);
      expect(endpoint.attributes['onOff.onOff']).toBe(true);
    });

    it('reports off when the switch is currently off', () => {
      createSwitch(false);
      expect(endpoint.attributes['onOff.onOff']).toBe(false);
    });
  });

  describe('when the switch changes at the Z-Wave side', () => {
    it('reports the switch as on to Matter', async () => {
      const handler = createSwitch(false);
      await handler.handleValueUpdate({
        commandClass: CommandClass.BinarySwitch,
        endpoint: 0,
        property: 'currentValue',
        newValue: true,
        prevValue: false,
      });
      expect(endpoint.attributes['onOff.onOff']).toBe(true);
    });

    it('reports the switch as off to Matter', async () => {
      const handler = createSwitch(true);
      await handler.handleValueUpdate({
        commandClass: CommandClass.BinarySwitch,
        endpoint: 0,
        property: 'currentValue',
        newValue: false,
        prevValue: true,
      });
      expect(endpoint.attributes['onOff.onOff']).toBe(false);
    });

    it('ignores updates from unrelated command classes', async () => {
      const handler = createSwitch(true);
      await handler.handleValueUpdate({
        commandClass: CommandClass.MultilevelSensor,
        endpoint: 0,
        property: 'Air temperature',
        newValue: 22,
        prevValue: 21,
      });
      expect(endpoint.attributes['onOff.onOff']).toBe(true);
    });
  });

  describe('when Matter sends a command', () => {
    it('turns the switch on via Z-Wave', async () => {
      createSwitch(false);
      await endpoint.getCommandHandler('on')!();
      expect(client.setValue).toHaveBeenCalledWith(
        2,
        expect.objectContaining({ commandClass: CommandClass.BinarySwitch, property: 'targetValue' }),
        true,
      );
    });

    it('turns the switch off via Z-Wave', async () => {
      createSwitch(true);
      await endpoint.getCommandHandler('off')!();
      expect(client.setValue).toHaveBeenCalledWith(
        2,
        expect.objectContaining({ commandClass: CommandClass.BinarySwitch, property: 'targetValue' }),
        false,
      );
    });

    it('toggles off a switch that is currently on', async () => {
      createSwitch(true);
      await endpoint.getCommandHandler('toggle')!();
      expect(client.setValue).toHaveBeenCalledWith(
        2,
        expect.objectContaining({ commandClass: CommandClass.BinarySwitch, property: 'targetValue' }),
        false,
      );
    });

    it('toggles on a switch that is currently off', async () => {
      createSwitch(false);
      await endpoint.getCommandHandler('toggle')!();
      expect(client.setValue).toHaveBeenCalledWith(
        2,
        expect.objectContaining({ commandClass: CommandClass.BinarySwitch, property: 'targetValue' }),
        true,
      );
    });
  });
});

describe('dimmable light devices', () => {
  let endpoint: MockEndpoint;
  let client: MockClient;
  let log: AnsiLogger;

  function createDimmer(currentLevel = 50) {
    const node = makeNode({
      endpoints: [makeEndpoint([CommandClass.MultilevelSwitch])],
      values: makeValues({
        commandClass: CommandClass.MultilevelSwitch,
        property: 'currentValue',
        value: currentLevel,
      }),
    });

    const handler = createHandler(dimmableLight, {
      endpoint: endpoint as never,
      node,
      zwaveEndpointIndex: 0,
      log,
      client: client as never,
    });
    handler.addClusters(endpoint as never);
    handler.setup();
    return handler;
  }

  beforeEach(() => {
    endpoint = makeMockEndpoint();
    client = makeMockClient();
    log = makeLogger();
  });

  describe('when first discovered', () => {
    it('reports the light as on with the correct brightness level', () => {
      createDimmer(50);
      expect(endpoint.attributes['onOff.onOff']).toBe(true);
      const level = endpoint.attributes['levelControl.currentLevel'] as number;
      expect(level).toBeGreaterThan(100);
      expect(level).toBeLessThan(160);
    });

    it('reports the light as off when brightness is zero', () => {
      createDimmer(0);
      expect(endpoint.attributes['onOff.onOff']).toBe(false);
    });
  });

  describe('when the brightness changes at the Z-Wave side', () => {
    it('reports the converted brightness level to Matter', async () => {
      const handler = createDimmer(0);
      await handler.handleValueUpdate({
        commandClass: CommandClass.MultilevelSwitch,
        endpoint: 0,
        property: 'currentValue',
        newValue: 99,
        prevValue: 0,
      });
      expect(endpoint.attributes['levelControl.currentLevel']).toBe(254);
      expect(endpoint.attributes['onOff.onOff']).toBe(true);
    });

    it('reports the light as off when brightness reaches zero', async () => {
      const handler = createDimmer(50);
      await handler.handleValueUpdate({
        commandClass: CommandClass.MultilevelSwitch,
        endpoint: 0,
        property: 'currentValue',
        newValue: 0,
        prevValue: 50,
      });
      expect(endpoint.attributes['onOff.onOff']).toBe(false);
    });
  });

  describe('when Matter sends a command', () => {
    it('sets Z-Wave to full brightness on an "on" command', async () => {
      createDimmer(0);
      await endpoint.getCommandHandler('on')!();
      expect(client.setValue).toHaveBeenCalledWith(
        2,
        expect.objectContaining({ commandClass: CommandClass.MultilevelSwitch, property: 'targetValue' }),
        99,
      );
    });

    it('sets Z-Wave to zero on an "off" command', async () => {
      createDimmer(50);
      await endpoint.getCommandHandler('off')!();
      expect(client.setValue).toHaveBeenCalledWith(
        2,
        expect.objectContaining({ commandClass: CommandClass.MultilevelSwitch, property: 'targetValue' }),
        0,
      );
    });

    it('sends the converted brightness level for a moveToLevel command', async () => {
      createDimmer(0);
      await endpoint.getCommandHandler('moveToLevel')!({ request: { level: 254 } });
      expect(client.setValue).toHaveBeenCalledWith(
        2,
        expect.objectContaining({ commandClass: CommandClass.MultilevelSwitch, property: 'targetValue' }),
        99,
      );
    });

    it('toggles between off and full brightness', async () => {
      createDimmer(50);
      // Currently on → should turn off
      await endpoint.getCommandHandler('toggle')!();
      expect(client.setValue).toHaveBeenCalledWith(
        2,
        expect.objectContaining({ commandClass: CommandClass.MultilevelSwitch, property: 'targetValue' }),
        0,
      );
    });
  });
});
