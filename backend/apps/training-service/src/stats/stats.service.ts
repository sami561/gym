import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PtSessionStatus, TrainingStats, addMonths, startOfMonth } from '@app/common';
import { WorkoutProgram } from '../programs/workout-program.entity';
import { PtSession } from '../pt-sessions/pt-session.entity';

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(WorkoutProgram) private readonly programs: Repository<WorkoutProgram>,
    @InjectRepository(PtSession) private readonly sessions: Repository<PtSession>,
  ) {}

  async summary(): Promise<TrainingStats> {
    const start = startOfMonth();
    const end = addMonths(start, 1);
    const [activePrograms, month] = await Promise.all([
      this.programs.count({ where: { isActive: true } }),
      this.sessions
        .createQueryBuilder('s')
        .select('COUNT(*) FILTER (WHERE s.status <> :cancelled)', 'sessions')
        .addSelect('COALESCE(SUM(s.price) FILTER (WHERE s.status = :done), 0)', 'revenue')
        .where('s.startsAt >= :start AND s.startsAt < :end', { start, end })
        .setParameters({ cancelled: PtSessionStatus.CANCELLED, done: PtSessionStatus.DONE })
        .getRawOne<{ sessions: string; revenue: string }>(),
    ]);
    return {
      activePrograms,
      ptSessionsThisMonth: Number(month?.sessions ?? 0),
      ptRevenueThisMonth: Number(month?.revenue ?? 0),
    };
  }
}
