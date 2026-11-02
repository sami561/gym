import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CoachPtSummary,
  CoachPtSummaryRequest,
  CreatePtSessionRequest,
  ListPtSessionsRequest,
  PtSessionDto,
  PtSessionStatus,
  UpdatePtSessionRequest,
} from '@app/common';
import { PtSession } from './pt-session.entity';
import { toPtSessionDto } from '../mappers';
import { PeopleService } from '../shared/people.service';
import { optionalText, parseInstant, requireAmount, requireText } from '../shared/validation';

const BLOCKING_STATUSES = [PtSessionStatus.SCHEDULED, PtSessionStatus.DONE];
const MAX_DURATION_MS = 6 * 3_600_000;
const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;

@Injectable()
export class PtSessionsService {
  constructor(
    @InjectRepository(PtSession) private readonly sessions: Repository<PtSession>,
    private readonly people: PeopleService,
  ) {}

  async list(request: ListPtSessionsRequest): Promise<PtSessionDto[]> {
    const query = this.sessions.createQueryBuilder('s');
    if (request.from) query.andWhere('s.startsAt >= :from', { from: parseInstant(request.from, 'Début') });
    if (request.to) query.andWhere('s.startsAt < :to', { to: parseInstant(request.to, 'Fin') });
    if (request.coachId) query.andWhere('s.coachId = :coachId', { coachId: request.coachId });
    if (request.memberId) query.andWhere('s.memberId = :memberId', { memberId: request.memberId });
    const rows = await query.orderBy('s.startsAt', 'ASC').getMany();
    return rows.map(toPtSessionDto);
  }

  async create(request: CreatePtSessionRequest): Promise<PtSessionDto> {
    const coachId = requireText(request.coachId, 'Le coach est obligatoire.');
    const memberId = requireText(request.memberId, 'Le membre est obligatoire.');
    const { startsAt, endsAt } = validateSlot(request.startsAt, request.endsAt);
    await this.assertCoachFree(coachId, startsAt, endsAt);

    const session = this.sessions.create({
      coachId,
      coachName: await this.people.coachName(coachId),
      memberId,
      memberName: await this.people.memberName(memberId),
      startsAt,
      endsAt,
      status: PtSessionStatus.SCHEDULED,
      price: requireAmount(request.price, 'Le prix'),
      notes: optionalText(request.notes),
    });
    return toPtSessionDto(await this.sessions.save(session));
  }

  async update({ id, data }: UpdatePtSessionRequest): Promise<PtSessionDto> {
    const session = await this.sessions.findOne({ where: { id } });
    if (!session) throw new NotFoundException('Séance introuvable.');

    let scheduleChanged = false;
    if (data.coachId !== undefined && data.coachId !== session.coachId) {
      session.coachId = requireText(data.coachId, 'Le coach est obligatoire.');
      session.coachName = await this.people.coachName(session.coachId);
      scheduleChanged = true;
    }
    if (data.startsAt !== undefined || data.endsAt !== undefined) {
      const slot = validateSlot(data.startsAt ?? session.startsAt.toISOString(), data.endsAt ?? session.endsAt.toISOString());
      session.startsAt = slot.startsAt;
      session.endsAt = slot.endsAt;
      scheduleChanged = true;
    }
    if (data.status !== undefined) {
      if (!Object.values(PtSessionStatus).includes(data.status)) throw new BadRequestException('Statut invalide.');
      if (!BLOCKING_STATUSES.includes(session.status) && BLOCKING_STATUSES.includes(data.status)) scheduleChanged = true;
      session.status = data.status;
    }
    if (data.price !== undefined) session.price = requireAmount(data.price, 'Le prix');
    if (data.notes !== undefined) session.notes = optionalText(data.notes);

    if (scheduleChanged && BLOCKING_STATUSES.includes(session.status)) {
      await this.assertCoachFree(session.coachId, session.startsAt, session.endsAt, session.id);
    }
    return toPtSessionDto(await this.sessions.save(session));
  }

  /** DONE sessions of a coach in a month — used by staff-service to compute PT commissions. */
  async coachSummary({ coachId, period }: CoachPtSummaryRequest): Promise<CoachPtSummary> {
    const match = PERIOD.exec(period ?? '');
    if (!match) throw new BadRequestException('La période doit être au format AAAA-MM.');
    const start = new Date(Number(match[1]), Number(match[2]) - 1, 1);
    const end = new Date(Number(match[1]), Number(match[2]), 1);
    const row = await this.sessions
      .createQueryBuilder('s')
      .select('COUNT(*)', 'sessions')
      .addSelect('COALESCE(SUM(s.price), 0)', 'revenue')
      .where('s.coachId = :coachId', { coachId })
      .andWhere('s.status = :status', { status: PtSessionStatus.DONE })
      .andWhere('s.startsAt >= :start AND s.startsAt < :end', { start, end })
      .getRawOne<{ sessions: string; revenue: string }>();
    return { coachId, period, sessions: Number(row?.sessions ?? 0), revenue: Number(row?.revenue ?? 0) };
  }

  private async assertCoachFree(coachId: string, startsAt: Date, endsAt: Date, exceptId?: string): Promise<void> {
    const query = this.sessions
      .createQueryBuilder('s')
      .where('s.coachId = :coachId', { coachId })
      .andWhere('s.status IN (:...statuses)', { statuses: BLOCKING_STATUSES })
      .andWhere('s.startsAt < :endsAt AND s.endsAt > :startsAt', { startsAt, endsAt });
    if (exceptId) query.andWhere('s.id != :exceptId', { exceptId });
    if (await query.getExists()) throw new ConflictException('Le coach a déjà une séance sur ce créneau.');
  }
}

function validateSlot(startsAtRaw: string, endsAtRaw: string): { startsAt: Date; endsAt: Date } {
  const startsAt = parseInstant(startsAtRaw, 'Début de séance');
  const endsAt = parseInstant(endsAtRaw, 'Fin de séance');
  if (endsAt <= startsAt) throw new BadRequestException('La fin de la séance doit être après le début.');
  if (endsAt.getTime() - startsAt.getTime() > MAX_DURATION_MS) {
    throw new BadRequestException('Une séance ne peut pas dépasser 6 heures.');
  }
  return { startsAt, endsAt };
}
