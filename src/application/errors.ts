/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
export abstract class ApplicationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class CommandGatewayError extends ApplicationError {
  private constructor(message: string) {
    super(message);
  }

  static handlerAlreadyRegistered(commandName: string): CommandGatewayError {
    return new CommandGatewayError(`CommandGateway: handler already registered for ${commandName}`);
  }

  static noHandlerRegistered(commandName: string): CommandGatewayError {
    return new CommandGatewayError(`CommandGateway: no handler registered for ${commandName}`);
  }
}
