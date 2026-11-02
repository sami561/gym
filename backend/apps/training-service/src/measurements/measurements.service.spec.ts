import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { PeopleService } from '../shared/people.service';
import { Measurement } from './measurement.entity';
import { MeasurementsService } from './measurements.service';

function row(date: string, weightKg: number | null, heightCm: number | null): Measurement {
  return Object.assign(new Measurement(), {
    id: `ms-${date}`,
    memberId: 'm-1',
    date,
    weightKg,
    heightCm,
    bodyFatPct: null,
    musclePct: null,
    chestCm: null,
    waistCm: null,
    hipsCm: null,
    armCm: null,
    thighCm: null,
    notes: null,
    recordedByName: null,
  });
}

function setup(history: Measurement[] = []) {
  const measurements = {
    find: jest.fn().mockResolvedValue(history),
    create: jest.fn((data: Partial<Measurement>) => Object.assign(new Measurement(), data)),
    save: jest.fn(async (entry: Measurement) => Object.assign(entry, { id: 'ms-new' })),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const people = { memberName: jest.fn().mockResolvedValue('Amira Ben Salah') };
  const service = new MeasurementsService(measurements as unknown as Repository<Measurement>, people as unknown as PeopleService);
  return { service, measurements, people };
}

describe('MeasurementsService (body measurements and BMI)', () => {
  beforeEach(() => jest.useFakeTimers({ now: new Date(2026, 10, 2, 18, 0) })); // 2 Nov 2026 in Tunis
  afterEach(() => jest.useRealTimers());

  it('records today by default and computes the BMI', async () => {
    const dto = await setup().service.create({ memberId: 'm-1', weightKg: 72, heightCm: 170 });
    expect(dto).toMatchObject({ date: '2026-11-02', weightKg: 72, heightCm: 170, bmi: 24.9 });
  });

  it('uses the latest known height when only the weight is measured', async () => {
    const { service } = setup([row('2026-09-01', 75, 168), row('2026-10-01', 74, 170), row('2026-10-15', 73, null)]);
    expect((await service.create({ memberId: 'm-1', weightKg: 72 })).bmi).toBe(24.9);
  });

  it('has no BMI without any known height', async () => {
    expect((await setup().service.create({ memberId: 'm-1', weightKg: 72 })).bmi).toBeNull();
  });

  it('needs at least one measurement within human bounds', async () => {
    const { service } = setup();
    await expect(service.create({ memberId: 'm-1', notes: 'RAS' })).rejects.toThrow(new BadRequestException('Renseignez au moins une mesure.'));
    await expect(service.create({ memberId: 'm-1', weightKg: 7 })).rejects.toThrow('Le poids (kg) doit être compris entre 20 et 400.');
    await expect(service.create({ memberId: 'm-1', heightCm: 300 })).rejects.toThrow('La taille (cm) doit être compris entre 80 et 250.');
  });

  it('accepts a past day but not tomorrow (gym calendar)', async () => {
    const { service } = setup();
    expect((await service.create({ memberId: 'm-1', weightKg: 72, date: '2026-10-30' })).date).toBe('2026-10-30');
    await expect(service.create({ memberId: 'm-1', weightKg: 72, date: '2026-11-03' })).rejects.toThrow(
      'La date de mesure ne peut pas être dans le futur.',
    );
  });

  it('refuses unknown members (people lookup) before saving', async () => {
    const { service, people, measurements } = setup();
    people.memberName.mockRejectedValue(new NotFoundException('Membre introuvable.'));
    await expect(service.create({ memberId: 'm-x', weightKg: 72 })).rejects.toThrow('Membre introuvable.');
    expect(measurements.save).not.toHaveBeenCalled();
  });

  it('lists the history oldest first with a BMI per row', async () => {
    const { service, measurements } = setup([row('2026-09-01', 75, 170), row('2026-10-01', 73.5, null)]);
    expect((await service.list({ memberId: 'm-1' })).map((m) => [m.date, m.bmi])).toEqual([
      ['2026-09-01', 26],
      ['2026-10-01', 25.4],
    ]);
    expect(measurements.find).toHaveBeenCalledWith({ where: { memberId: 'm-1' }, order: { date: 'ASC', createdAt: 'ASC' } });
  });

  it('answers 404 when deleting an unknown measurement', async () => {
    const { service, measurements } = setup();
    measurements.delete.mockResolvedValue({ affected: 0 });
    await expect(service.remove({ id: 'ms-x' })).rejects.toThrow(new NotFoundException('Mesure introuvable.'));
  });
});
