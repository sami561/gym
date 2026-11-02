import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { PromoType } from '@app/common';
import { Plan } from '../plans/plan.entity';
import { PromoCode } from './promo.entity';
import { PromosService, promoDiscount } from './promos.service';

const TODAY = new Date(2026, 10, 2, 10, 0); // 2 Nov 2026 in Tunis

function promo(overrides: Partial<PromoCode> = {}): PromoCode {
  return Object.assign(new PromoCode(), {
    id: 'promo-1',
    code: 'ETE26',
    type: PromoType.PERCENT,
    value: 15,
    validFrom: null,
    validUntil: null,
    maxUses: null,
    uses: 0,
    isActive: true,
    description: null,
    createdAt: TODAY,
    ...overrides,
  });
}

const monthly = Object.assign(new Plan(), { id: 'plan-1', name: 'Mensuel', durationDays: 30, price: 90, isActive: true });

function setup(stored: PromoCode | null, affected = 1) {
  const update = { set: jest.fn(), where: jest.fn(), andWhere: jest.fn(), execute: jest.fn() };
  const qb = { update: jest.fn(() => update) };
  update.set.mockReturnValue(update);
  update.where.mockReturnValue(update);
  update.andWhere.mockReturnValue(update);
  update.execute.mockResolvedValue({ affected });
  const promos = {
    findOne: jest.fn().mockResolvedValue(stored),
    exist: jest.fn().mockResolvedValue(false),
    create: jest.fn((data: Partial<PromoCode>) => Object.assign(new PromoCode(), data)),
    save: jest.fn(async (row: PromoCode) => Object.assign(row, { id: row.id ?? 'promo-new' })),
    createQueryBuilder: jest.fn(() => qb),
  };
  const plans = { findOne: jest.fn().mockResolvedValue(monthly) };
  const service = new PromosService(promos as unknown as Repository<PromoCode>, plans as unknown as Repository<Plan>);
  return { service, promos, plans, update };
}

describe('promo codes', () => {
  beforeEach(() => jest.useFakeTimers({ now: TODAY }));
  afterEach(() => jest.useRealTimers());

  describe('promoDiscount', () => {
    it('caps the discount to the price and never goes negative', () => {
      expect(promoDiscount({ type: PromoType.PERCENT, value: 100 }, 90)).toBe(90);
      expect(promoDiscount({ type: PromoType.FIXED, value: 20 }, 90)).toBe(20);
      expect(promoDiscount({ type: PromoType.FIXED, value: -5 }, 90)).toBe(0);
      expect(promoDiscount({ type: PromoType.PERCENT, value: 15 }, 0)).toBe(0);
    });

    it('rounds percentages to the millime', () => {
      expect(promoDiscount({ type: PromoType.PERCENT, value: 33 }, 89.9)).toBe(29.667);
    });
  });

  describe('check (quote before paying)', () => {
    it('normalises the typed code and quotes the plan price', async () => {
      const { service, promos } = setup(promo());
      expect(await service.check({ code: ' ete26 ', planId: 'plan-1' })).toEqual({
        code: 'ETE26',
        planPrice: 90,
        discount: 13.5,
        price: 76.5,
      });
      expect(promos.findOne).toHaveBeenCalledWith({ where: { code: 'ETE26' } });
    });

    it('needs an existing plan', async () => {
      const { service, plans } = setup(promo());
      plans.findOne.mockResolvedValue(null);
      await expect(service.check({ code: 'ETE26', planId: 'plan-x' })).rejects.toThrow(new NotFoundException('Offre introuvable.'));
    });

    it.each([
      ['an unknown code', null, 'Code promo invalide.'],
      ['a deactivated code', promo({ isActive: false }), 'Code promo invalide.'],
      ['a code valid from tomorrow', promo({ validFrom: '2026-11-03' }), 'Ce code promo n’est pas encore valable.'],
      ['a code that ended yesterday', promo({ validUntil: '2026-11-01' }), 'Ce code promo a expiré.'],
      ['a code used up', promo({ maxUses: 50, uses: 50 }), 'Ce code promo a atteint son nombre maximal d’utilisations.'],
    ])('refuses %s', async (_label, stored, message) => {
      await expect(setup(stored).service.check({ code: 'ETE26', planId: 'plan-1' })).rejects.toThrow(new BadRequestException(message));
    });

    it('accepts a code on its first and last valid day', async () => {
      const { service } = setup(promo({ validFrom: '2026-11-02', validUntil: '2026-11-02', maxUses: 50, uses: 49 }));
      await expect(service.check({ code: 'ETE26', planId: 'plan-1' })).resolves.toMatchObject({ price: 76.5 });
    });
  });

  describe('redeem (at subscription time)', () => {
    it('consumes one use atomically, within maxUses', async () => {
      const { service, update } = setup(promo({ type: PromoType.FIXED, value: 20, maxUses: 10, uses: 3 }));
      expect(await service.redeem('ETE26', monthly)).toEqual({ code: 'ETE26', planPrice: 90, discount: 20, price: 70 });
      expect(update.andWhere).toHaveBeenCalledWith('("maxUses" IS NULL OR uses < "maxUses")');
    });

    it('refuses when a concurrent redemption took the last use', async () => {
      const { service } = setup(promo({ maxUses: 10, uses: 9 }), 0);
      await expect(service.redeem('ETE26', monthly)).rejects.toThrow(
        'Ce code promo a atteint son nombre maximal d’utilisations.',
      );
    });
  });

  describe('create / update', () => {
    it('stores the code upper-cased with defaults', async () => {
      const { service, promos } = setup(null);
      const dto = await service.create({ code: ' rentree-26 ', type: PromoType.FIXED, value: 10 });
      expect(promos.exist).toHaveBeenCalledWith({ where: { code: 'RENTREE-26' } });
      expect(dto).toMatchObject({
        id: 'promo-new',
        code: 'RENTREE-26',
        type: PromoType.FIXED,
        value: 10,
        validFrom: null,
        validUntil: null,
        maxUses: null,
        isActive: true,
        description: null,
      });
    });

    it('refuses invalid codes and values', async () => {
      const { service } = setup(null);
      await expect(service.create({ code: 'AB', type: PromoType.FIXED, value: 10 })).rejects.toThrow(
        'Code invalide (3 à 30 lettres, chiffres, - ou _).',
      );
      await expect(service.create({ code: 'ÉTÉ26', type: PromoType.FIXED, value: 10 })).rejects.toThrow('Code invalide');
      await expect(service.create({ code: 'ETE26', type: PromoType.FIXED, value: 0 })).rejects.toThrow('La valeur doit être positive.');
      await expect(service.create({ code: 'ETE26', type: PromoType.PERCENT, value: 120 })).rejects.toThrow(
        'Une remise en pourcentage ne peut pas dépasser 100 %.',
      );
    });

    it('refuses a code that already exists', async () => {
      const { service, promos } = setup(null);
      promos.exist.mockResolvedValue(true);
      await expect(service.create({ code: 'ETE26', type: PromoType.PERCENT, value: 15 })).rejects.toThrow(
        new ConflictException('Ce code promo existe déjà.'),
      );
    });

    it('validates an update against the stored values', async () => {
      const { service } = setup(promo({ type: PromoType.FIXED, value: 150 }));
      await expect(service.update({ id: 'promo-1', data: { type: PromoType.PERCENT } })).rejects.toThrow(
        'Une remise en pourcentage ne peut pas dépasser 100 %.',
      );
    });

    it('updates only the fields sent', async () => {
      const { service } = setup(promo({ maxUses: 50 }));
      const dto = await service.update({ id: 'promo-1', data: { code: 'hiver26', maxUses: undefined, isActive: false } });
      expect(dto).toMatchObject({ code: 'HIVER26', maxUses: 50, isActive: false, value: 15 });
    });

    it('answers 404 for an unknown promo', async () => {
      await expect(setup(null).service.update({ id: 'promo-x', data: {} })).rejects.toThrow(
        new NotFoundException('Code promo introuvable.'),
      );
    });
  });
});
