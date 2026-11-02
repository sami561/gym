import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CheckPromoRequest,
  CreatePromoRequest,
  PromoCodeDto,
  PromoQuote,
  PromoType,
  UpdatePromoRequest,
  toDateOnly,
} from '@app/common';
import { PromoCode } from './promo.entity';
import { Plan } from '../plans/plan.entity';
import { toPromoDto } from '../mappers';

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function promoDiscount(promo: Pick<PromoCode, 'type' | 'value'>, price: number): number {
  const raw = promo.type === PromoType.PERCENT ? (price * promo.value) / 100 : promo.value;
  return round3(Math.min(price, Math.max(0, raw)));
}

@Injectable()
export class PromosService {
  constructor(
    @InjectRepository(PromoCode) private readonly promos: Repository<PromoCode>,
    @InjectRepository(Plan) private readonly plans: Repository<Plan>,
  ) {}

  async list(): Promise<PromoCodeDto[]> {
    return (await this.promos.find({ order: { createdAt: 'DESC' } })).map(toPromoDto);
  }

  async create(req: CreatePromoRequest): Promise<PromoCodeDto> {
    this.validate(req);
    const code = req.code.trim().toUpperCase();
    if (await this.promos.exist({ where: { code } })) throw new ConflictException('Ce code promo existe déjà.');
    const promo = await this.promos.save(
      this.promos.create({
        code,
        type: req.type,
        value: req.value,
        validFrom: req.validFrom ?? null,
        validUntil: req.validUntil ?? null,
        maxUses: req.maxUses ?? null,
        isActive: req.isActive ?? true,
        description: req.description ?? null,
      }),
    );
    return toPromoDto(promo);
  }

  async update({ id, data }: UpdatePromoRequest): Promise<PromoCodeDto> {
    const promo = await this.promos.findOne({ where: { id } });
    if (!promo) throw new NotFoundException('Code promo introuvable.');
    this.validate({ ...promo, ...data });
    if (data.code) data.code = data.code.trim().toUpperCase();
    Object.assign(promo, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)));
    return toPromoDto(await this.promos.save(promo));
  }

  async remove(id: string): Promise<{ ok: true }> {
    await this.promos.delete(id);
    return { ok: true };
  }

  async check({ code, planId }: CheckPromoRequest): Promise<PromoQuote> {
    const plan = await this.plans.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Offre introuvable.');
    const promo = await this.findUsable(code);
    return this.quote(promo, plan);
  }

  /** Validates the code and consumes one use atomically (respecting maxUses). */
  async redeem(code: string, plan: Plan): Promise<PromoQuote> {
    const promo = await this.findUsable(code);
    const result = await this.promos
      .createQueryBuilder()
      .update(PromoCode)
      .set({ uses: () => 'uses + 1' })
      .where('id = :id', { id: promo.id })
      .andWhere('("maxUses" IS NULL OR uses < "maxUses")')
      .execute();
    if (!result.affected) throw new BadRequestException('Ce code promo a atteint son nombre maximal d’utilisations.');
    return this.quote(promo, plan);
  }

  private quote(promo: PromoCode, plan: Plan): PromoQuote {
    const discount = promoDiscount(promo, plan.price);
    return { code: promo.code, planPrice: plan.price, discount, price: round3(plan.price - discount) };
  }

  private async findUsable(code: string): Promise<PromoCode> {
    const promo = await this.promos.findOne({ where: { code: (code ?? '').trim().toUpperCase() } });
    const today = toDateOnly();
    if (!promo || !promo.isActive) throw new BadRequestException('Code promo invalide.');
    if (promo.validFrom && today < promo.validFrom) throw new BadRequestException('Ce code promo n’est pas encore valable.');
    if (promo.validUntil && today > promo.validUntil) throw new BadRequestException('Ce code promo a expiré.');
    if (promo.maxUses !== null && promo.uses >= promo.maxUses) {
      throw new BadRequestException('Ce code promo a atteint son nombre maximal d’utilisations.');
    }
    return promo;
  }

  private validate(p: Partial<CreatePromoRequest>): void {
    if (p.code !== undefined && !/^[A-Za-z0-9_-]{3,30}$/.test(p.code.trim())) {
      throw new BadRequestException('Code invalide (3 à 30 lettres, chiffres, - ou _).');
    }
    if (p.value !== undefined && !(p.value > 0)) throw new BadRequestException('La valeur doit être positive.');
    if (p.type === PromoType.PERCENT && p.value !== undefined && p.value > 100) {
      throw new BadRequestException('Une remise en pourcentage ne peut pas dépasser 100 %.');
    }
  }
}
