import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import {
  AddLeadActivityRequest,
  ConvertLeadRequest,
  CreateLeadRequest,
  CreateMemberResult,
  EVENTS,
  EventBus,
  LeadActivityDto,
  LeadActivityType,
  LeadDto,
  LeadSource,
  LeadStats,
  LeadStatus,
  ListLeadsRequest,
  PublicTrialRequest,
  UpdateLeadRequest,
  startOfMonth,
  toDateOnly,
} from '@app/common';
import { Lead, LeadActivity } from './lead.entity';
import { Plan } from '../plans/plan.entity';
import { MembersService } from '../members/members.service';
import { toLeadActivityDto, toLeadDto } from '../mappers';

const CLOSED = [LeadStatus.CONVERTED, LeadStatus.LOST];

@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(LeadActivity) private readonly activities: Repository<LeadActivity>,
    @InjectRepository(Plan) private readonly plans: Repository<Plan>,
    private readonly members: MembersService,
    private readonly events: EventBus,
  ) {}

  async list(req: ListLeadsRequest): Promise<LeadDto[]> {
    const qb = this.leads.createQueryBuilder('l');
    if (req.status) qb.andWhere('l.status = :status', { status: req.status });
    if (req.source) qb.andWhere('l.source = :source', { source: req.source });
    if (req.dueOnly) {
      qb.andWhere('l.followUpAt <= :today', { today: toDateOnly() }).andWhere('l.status NOT IN (:...closed)', {
        closed: CLOSED,
      });
    }
    if (req.search?.trim()) {
      const search = `%${req.search.trim()}%`;
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('l.firstName ILIKE :search', { search })
            .orWhere('l.lastName ILIKE :search', { search })
            .orWhere('l.phone ILIKE :search', { search })
            .orWhere('l.email ILIKE :search', { search }),
        ),
      );
    }
    const rows = await qb.orderBy('l.createdAt', 'DESC').getMany();
    return rows.map((l) => toLeadDto(l));
  }

  async get(id: string): Promise<LeadDto> {
    return toLeadDto(await this.findOrFail(id, true), true);
  }

  async create(req: CreateLeadRequest): Promise<LeadDto> {
    const lead = await this.leads.save(
      this.leads.create({
        firstName: req.firstName.trim(),
        lastName: req.lastName.trim(),
        phone: req.phone ?? null,
        email: req.email?.trim().toLowerCase() || null,
        source: req.source,
        status: req.trialDate ? LeadStatus.TRIAL : LeadStatus.NEW,
        interestPlanId: req.interestPlanId ?? null,
        interestPlanName: await this.planName(req.interestPlanId),
        trialDate: req.trialDate ?? null,
        followUpAt: req.followUpAt ?? toDateOnly(),
        notes: req.notes ?? null,
        assignedToName: req.assignedToName ?? null,
      }),
    );
    this.publishCreated(lead, null);
    return toLeadDto(lead);
  }

  /** Website form "Séance d'essai gratuite". */
  async publicTrial(req: PublicTrialRequest): Promise<{ ok: true }> {
    if (req.trialDate && req.trialDate < toDateOnly()) {
      throw new BadRequestException('Choisissez une date à partir d’aujourd’hui.');
    }
    const lead = await this.leads.save(
      this.leads.create({
        firstName: req.firstName.trim(),
        lastName: req.lastName.trim(),
        phone: req.phone.trim(),
        email: req.email?.trim().toLowerCase() || null,
        source: LeadSource.WEBSITE,
        status: req.trialDate ? LeadStatus.TRIAL : LeadStatus.NEW,
        interestPlanId: req.interestPlanId ?? null,
        interestPlanName: await this.planName(req.interestPlanId),
        trialDate: req.trialDate ?? null,
        followUpAt: toDateOnly(),
        notes: req.message?.trim() || null,
      }),
    );
    this.publishCreated(lead, req.message ?? null);
    return { ok: true };
  }

  async update({ id, data }: UpdateLeadRequest): Promise<LeadDto> {
    const lead = await this.findOrFail(id);
    if (data.interestPlanId !== undefined) lead.interestPlanName = await this.planName(data.interestPlanId);
    if (data.status && CLOSED.includes(data.status) && !CLOSED.includes(lead.status)) lead.closedAt = new Date();
    if (data.status && !CLOSED.includes(data.status)) lead.closedAt = null;
    Object.assign(lead, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)));
    return toLeadDto(await this.leads.save(lead));
  }

  async remove(id: string): Promise<{ ok: true }> {
    await this.leads.delete(id);
    return { ok: true };
  }

  async addActivity(req: AddLeadActivityRequest): Promise<LeadActivityDto> {
    const lead = await this.findOrFail(req.leadId);
    const activity = await this.activities.save(
      this.activities.create({ leadId: lead.id, type: req.type, note: req.note ?? null, byName: req.actor?.name ?? null }),
    );
    if (lead.status === LeadStatus.NEW && req.type !== LeadActivityType.NOTE) {
      lead.status = LeadStatus.CONTACTED;
      await this.leads.save(lead);
    }
    return toLeadActivityDto(activity);
  }

  async convert(req: ConvertLeadRequest): Promise<CreateMemberResult> {
    const lead = await this.findOrFail(req.leadId);
    if (lead.status === LeadStatus.CONVERTED) throw new BadRequestException('Ce prospect est déjà membre.');
    if (!lead.email) throw new BadRequestException('Ajoutez l’e-mail du prospect pour créer son compte.');
    const result = await this.members.create({
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      password: req.password,
      planId: req.planId,
      payment: req.payment,
      notes: lead.notes,
      actor: req.actor,
    });
    Object.assign(lead, { status: LeadStatus.CONVERTED, convertedMemberId: result.member.id, closedAt: new Date() });
    await this.leads.save(lead);
    this.events.publish(EVENTS.leadConverted, { leadId: lead.id, memberId: result.member.id });
    return result;
  }

  async stats(): Promise<LeadStats> {
    const monthStart = startOfMonth();
    const since90 = new Date(Date.now() - 90 * 86_400_000);
    const count = (where: string, params: Record<string, unknown>) =>
      this.leads.createQueryBuilder('l').where(where, params).getCount();
    const [newThisMonth, trialsThisMonth, convertedThisMonth, converted90, lost90, followUpsDue] = await Promise.all([
      count('l.createdAt >= :d', { d: monthStart }),
      count('l.trialDate >= :d', { d: toDateOnly(monthStart) }),
      count('l.status = :s AND l.closedAt >= :d', { s: LeadStatus.CONVERTED, d: monthStart }),
      count('l.status = :s AND l.closedAt >= :d', { s: LeadStatus.CONVERTED, d: since90 }),
      count('l.status = :s AND l.closedAt >= :d', { s: LeadStatus.LOST, d: since90 }),
      count('l.followUpAt <= :today AND l.status NOT IN (:...closed)', { today: toDateOnly(), closed: CLOSED }),
    ]);
    const closed = converted90 + lost90;
    return {
      newThisMonth,
      trialsThisMonth,
      convertedThisMonth,
      conversionRate90d: closed ? Math.round((converted90 / closed) * 1000) / 1000 : 0,
      followUpsDue,
    };
  }

  /** Leads whose follow-up is due (automation feed for n8n). */
  followUpsDue(): Promise<LeadDto[]> {
    return this.list({ dueOnly: true });
  }

  private publishCreated(lead: Lead, message: string | null): void {
    this.events.publish(EVENTS.leadCreated, {
      leadId: lead.id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      phone: lead.phone,
      email: lead.email,
      source: lead.source,
      trialDate: lead.trialDate,
      interestPlanName: lead.interestPlanName,
      message,
    });
  }

  private async planName(planId?: string | null): Promise<string | null> {
    if (!planId) return null;
    return (await this.plans.findOne({ where: { id: planId } }))?.name ?? null;
  }

  private async findOrFail(id: string, withActivities = false): Promise<Lead> {
    const lead = await this.leads.findOne({ where: { id }, relations: withActivities ? { activities: true } : {} });
    if (!lead) throw new NotFoundException('Prospect introuvable.');
    return lead;
  }
}
