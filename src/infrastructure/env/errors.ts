/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
export class EnvError extends Error {
  private constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }

  static invalidConfiguration(zodErrorDetails: string): EnvError {
    return new EnvError(`invalid environment configuration:\n${zodErrorDetails}`);
  }
}
