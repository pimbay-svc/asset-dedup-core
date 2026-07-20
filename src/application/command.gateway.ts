/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import { CommandGatewayError } from './errors.js';

export interface Command<R = unknown> {
  readonly _resultType?: () => R;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CommandClass<C extends Command = Command<any>> = new (...args: any[]) => C;

export interface CommandHandler<C extends Command<R>, R = unknown> {
  readonly commandClass: CommandClass<C>;
  execute(command: C): Promise<R>;
}

export class CommandGateway {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly handlers = new Map<CommandClass<any>, CommandHandler<any, any>>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerAll(handlers: readonly CommandHandler<any, any>[]): void {
    for (const handler of handlers) {
      this.register(handler);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register(handler: CommandHandler<any, any>): void {
    const commandClass = handler.commandClass;

    if (this.handlers.has(commandClass)) {
      throw CommandGatewayError.handlerAlreadyRegistered(commandClass.name);
    }

    this.handlers.set(commandClass, handler);
  }

  async dispatch<R>(command: Command<R>): Promise<R> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const commandClass = command.constructor as CommandClass<any>;
    const handler = this.handlers.get(commandClass);

    if (handler === undefined) {
      throw CommandGatewayError.noHandlerRegistered(commandClass.name);
    }

    return handler.execute(command) as Promise<R>;
  }
}
