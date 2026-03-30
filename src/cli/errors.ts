export class CliError extends Error {
  readonly exitCode: number;
  readonly handled: boolean;

  constructor(
    message = "",
    options: {
      exitCode?: number;
      handled?: boolean;
    } = {}
  ) {
    super(message);
    this.name = "CliError";
    this.exitCode = options.exitCode ?? 1;
    this.handled = options.handled ?? false;
  }
}

export function isCliError(error: unknown): error is CliError {
  return error instanceof CliError;
}
