import { sleep } from '../command-queue';
import type { AgentDoorConfig } from '../types/contracts';
import type { DoorDriver, DriverContext, DriverStatus } from './driver';

/** Logs instead of driving hardware — for demos, tests and doors without a controller yet. */
export class SimulatorDriver implements DoorDriver {
  readonly kind = 'SIMULATOR' as const;

  constructor(
    private readonly door: AgentDoorConfig,
    private readonly ctx: DriverContext,
  ) {}

  async start(): Promise<void> {
    this.ctx.logger.info('simulated door ready');
  }

  async stop(): Promise<void> {}

  async open(seconds: number): Promise<void> {
    await sleep(50);
    this.ctx.logger.info(`(simulation) door "${this.door.name}" unlocked`, { seconds });
  }

  status(): DriverStatus {
    return { status: 'ok' };
  }
}
