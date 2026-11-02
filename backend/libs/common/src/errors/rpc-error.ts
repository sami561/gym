/** Error shape carried across the bus: { statusCode, message }. */
export interface RpcErrorPayload {
  statusCode: number;
  message: string | string[];
}

export class RpcError extends Error {
  readonly details: string | string[];

  constructor(
    public readonly statusCode: number,
    message: string | string[],
    public readonly pattern?: string,
  ) {
    super(Array.isArray(message) ? message.join(', ') : message);
    this.name = 'RpcError';
    this.details = message;
  }

  toPayload(): RpcErrorPayload {
    return { statusCode: this.statusCode, message: this.details };
  }

  /** Normalises whatever came back from ClientProxy into an RpcError. */
  static from(err: unknown, pattern?: string): RpcError {
    if (err instanceof RpcError) return err;
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      if (e.name === 'TimeoutError') {
        return new RpcError(503, `Service indisponible (${pattern ?? 'rpc'})`, pattern);
      }
      const status = Number(e.statusCode ?? e.status);
      const message = (e.message as string | string[]) ?? 'Erreur interne';
      if (Number.isInteger(status) && status >= 400 && status < 600) {
        return new RpcError(status, message, pattern);
      }
      if (typeof e.message === 'string') return new RpcError(500, e.message, pattern);
    }
    return new RpcError(500, 'Erreur interne', pattern);
  }
}
