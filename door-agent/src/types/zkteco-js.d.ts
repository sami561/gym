declare module 'zkteco-js' {
  import { Socket } from 'net';

  interface ZkUser {
    uid: number;
    role: number;
    password: string;
    name: string;
    cardno: number;
    userId: string;
  }

  interface ZkRealTimeLog {
    userId: string;
    attTime: Date;
  }

  class Zkteco {
    constructor(ip: string, port: number, timeout: number, inport: number, maxChunk?: number);
    connectionType: 'tcp' | 'udp' | null;
    ztcp: { socket: Socket | null };
    zudp: { socket: { close(): void } | null };
    createSocket(cbErr?: (err: unknown) => void, cbClose?: (type: string) => void): Promise<boolean>;
    executeCmd(command: number, data?: Buffer | string): Promise<Buffer>;
    getUsers(): Promise<{ data: ZkUser[] }>;
    getRealTimeLogs(cb: (log: ZkRealTimeLog) => void): Promise<void>;
    getTime(): Promise<Date>;
    disconnect(): Promise<void>;
  }

  export = Zkteco;
}
