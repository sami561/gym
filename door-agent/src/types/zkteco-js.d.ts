declare module 'zkteco-js' {
  import { Socket } from 'net';

  // getUsers() and getRealTimeLogs() are not declared on purpose: the first reads 24-character
  // names into the card number, the second decodes one punch per socket read (src/doors/zk-protocol.ts).
  class Zkteco {
    constructor(ip: string, port: number, timeout: number, inport: number, maxChunk?: number);
    connectionType: 'tcp' | 'udp' | null;
    /** TCP transport (zkteco-js internals, used to read the raw user table). */
    ztcp: {
      socket: Socket | null;
      freeData(): Promise<Buffer>;
      /** Data of a CMD_DATA_WRRQ request; `err` is set when a chunked download stopped early. */
      readWithBuffer(request: Buffer): Promise<{ data: Buffer; err?: unknown }>;
    };
    zudp: { socket: { close(): void } | null };
    createSocket(cbErr?: (err: unknown) => void, cbClose?: (type: string) => void): Promise<boolean>;
    /** Resolves with the first bytes received after the command, whatever they are (no reply check). */
    executeCmd(command: number, data?: Buffer | string): Promise<Buffer>;
    getTime(): Promise<Date>;
    disconnect(): Promise<void>;
  }

  export = Zkteco;
}
