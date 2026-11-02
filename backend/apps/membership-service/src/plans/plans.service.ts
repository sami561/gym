import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePlanRequest, ListPlansRequest, PlanDto, UpdatePlanRequest } from '@app/common';
import { Plan } from './plan.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { toPlanDto } from '../mappers';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan) private readonly plans: Repository<Plan>,
    @InjectRepository(Subscription) private readonly subs: Repository<Subscription>,
  ) {}

  async list(req: ListPlansRequest): Promise<PlanDto[]> {
    const plans = await this.plans.find({
      where: req?.includeInactive ? {} : { isActive: true },
      order: { sortOrder: 'ASC', price: 'ASC' },
    });
    return plans.map(toPlanDto);
  }

  async create(req: CreatePlanRequest): Promise<PlanDto> {
    this.validate(req);
    const plan = await this.plans.save(
      this.plans.create({
        name: req.name.trim(),
        description: req.description ?? null,
        durationDays: req.durationDays,
        price: req.price,
        features: req.features ?? [],
        isFeatured: req.isFeatured ?? false,
        isActive: req.isActive ?? true,
        sortOrder: req.sortOrder ?? 0,
      }),
    );
    return toPlanDto(plan);
  }

  async update({ id, data }: UpdatePlanRequest): Promise<PlanDto> {
    const plan = await this.findOrFail(id);
    this.validate({ ...toPlanDto(plan), ...data });
    Object.assign(plan, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)));
    return toPlanDto(await this.plans.save(plan));
  }

  /** Plans already sold are deactivated instead of deleted, to keep history intact. */
  async remove(id: string): Promise<{ ok: true }> {
    const plan = await this.findOrFail(id);
    if (await this.subs.exists({ where: { planId: id } })) {
      plan.isActive = false;
      await this.plans.save(plan);
    } else {
      await this.plans.delete(id);
    }
    return { ok: true };
  }

  private validate(p: Pick<CreatePlanRequest, 'durationDays' | 'price'>): void {
    if (!Number.isInteger(p.durationDays) || p.durationDays < 1) {
      throw new BadRequestException('La durée doit être un nombre entier de jours (≥ 1).');
    }
    if (!(p.price >= 0)) throw new BadRequestException('Le prix doit être positif.');
  }

  private async findOrFail(id: string): Promise<Plan> {
    const plan = await this.plans.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Offre introuvable.');
    return plan;
  }
}
