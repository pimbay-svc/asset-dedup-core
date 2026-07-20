import { describe, it, expect } from 'vitest';
import { CommandGateway, type Command, type CommandHandler } from '../../../src/application/command.gateway.js';

class Ping implements Command<string> {
  declare readonly _resultType?: () => string;
}

class Unhandled implements Command<void> {
  declare readonly _resultType?: () => void;
}

describe('CommandGateway', () => {
  it('dispatches a command to its registered handler', async () => {
    const gateway = new CommandGateway();
    const handler: CommandHandler<Ping, string> = {
      commandClass: Ping,
      execute: () => Promise.resolve('pong'),
    };
    gateway.register(handler);

    await expect(gateway.dispatch(new Ping())).resolves.toBe('pong');
  });

  it('registerAll registers every handler in the list', async () => {
    const gateway = new CommandGateway();
    const handler: CommandHandler<Ping, string> = {
      commandClass: Ping,
      execute: () => Promise.resolve('pong'),
    };
    gateway.registerAll([handler]);

    await expect(gateway.dispatch(new Ping())).resolves.toBe('pong');
  });

  it('throws when registering two handlers for the same command class', () => {
    const gateway = new CommandGateway();
    const handler: CommandHandler<Ping, string> = {
      commandClass: Ping,
      execute: () => Promise.resolve('pong'),
    };
    gateway.register(handler);

    expect(() => {
      gateway.register(handler);
    }).toThrow(/already registered/);
  });

  it('throws when dispatching a command with no registered handler', async () => {
    const gateway = new CommandGateway();

    await expect(gateway.dispatch(new Unhandled())).rejects.toThrow(/no handler registered/);
  });
});
