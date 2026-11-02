import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Subscription } from '../subscriptions/subscription.entity';
import { Plan } from './plan.entity';
import { PlansService } from './plans.service';

function setup(sold: boolean) {
  const plan = Object.assign(new Plan(), { id: 'plan-1', name: 'Mensuel', durationDays: 30, price: 90, isActive: true });
  const plans = {
    findOne: jest.fn().mockResolvedValue(plan),
    save: jest.fn(async (row: Plan) => row),
    delete: jest.fn(),
  };
  const subs = { exists: jest.fn().mockResolvedValue(sold) };
  const service = new PlansService(plans as unknown as Repository<Plan>, subs as unknown as Repository<Subscription>);
  return { service, plans, subs };
}

describe('PlansService.remove (DELETE /api/plans/:id)', () => {
  it('deactivates a plan already sold instead of deleting it', async () => {
    const { service, plans, subs } = setup(true);
    expect(await service.remove('plan-1')).toEqual({ ok: true });
    expect(subs.exists).toHaveBeenCalledWith({ where: { planId: 'plan-1' } });
    expect(plans.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'plan-1', isActive: false }));
    expect(plans.delete).not.toHaveBeenCalled();
  });

  it('deletes a plan never sold', async () => {
    const { service, plans } = setup(false);
    expect(await service.remove('plan-1')).toEqual({ ok: true });
    expect(plans.delete).toHaveBeenCalledWith('plan-1');
    expect(plans.save).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown plan', async () => {
    const { service, plans, subs } = setup(false);
    plans.findOne.mockResolvedValue(null);
    await expect(service.remove('plan-x')).rejects.toThrow(new NotFoundException('Offre introuvable.'));
    expect(subs.exists).not.toHaveBeenCalled();
  });
});
